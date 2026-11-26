<?php
// فواتير العملاء (تصفية الموردين) والعهدة لدى العميل والموافقات
declare(strict_types=1);

function _ids(array $p, string $k): array {
  $v = $p[$k] ?? [];
  if (!is_array($v)) return [];
  return array_values(array_unique(array_map('intval', array_filter($v, fn($x) => is_numeric($x)))));
}

function _preview_settlement(array $p): array {
  _need_any(['settlements', 'approve']);
  $sup = q1('SELECT * FROM suppliers WHERE id = ?', [_i($p, 'supplier_id')]);
  if (!$sup) fail('اختار المورد');
  $ids = _ids($p, 'shipment_ids');
  if (!$ids) fail('اختار نقلة واحدة على الأقل');
  $in = in_list($ids);
  $bad = (int)qv("SELECT COUNT(*) FROM shipments WHERE id IN ($in) AND (supplier_id <> ? OR settlement_id IS NOT NULL)", [...$ids, $sup['id']]);
  if ($bad > 0 || (int)qv("SELECT COUNT(*) FROM shipments WHERE id IN ($in)", $ids) !== count($ids)) fail('فيه نقلة مش تبع المورد ده أو اتعملها تصفية قبل كده');
  $sold = "FROM sale_lines l JOIN sales s ON s.id = l.sale_id JOIN shipment_items si ON si.id = l.shipment_item_id WHERE si.shipment_id IN ($in) AND NOT s.voided";
  $lines = q("SELECT i.name item, l.unit, l.price, SUM(l.qty) qty, SUM(l.weight) weight, SUM(l.amount) amount
      FROM sale_lines l JOIN sales s ON s.id = l.sale_id JOIN items i ON i.id = l.item_id JOIN shipment_items si ON si.id = l.shipment_item_id
      WHERE si.shipment_id IN ($in) AND NOT s.voided GROUP BY i.name, l.unit, l.price ORDER BY item, l.unit, l.price DESC", $ids);
  $items = q("SELECT i.name item, t.qty_in, COALESCE(sd.qty, 0) qty_sold, COALESCE(sd.weight, 0) weight, COALESCE(sd.amount, 0) amount,
        t.qty_in - COALESCE(sd.qty, 0) remaining
      FROM (SELECT item_id, SUM(qty) qty_in FROM shipment_items WHERE shipment_id IN ($in) GROUP BY item_id) t
      JOIN items i ON i.id = t.item_id
      LEFT JOIN (SELECT si.item_id, SUM(l.qty) qty, SUM(l.weight) weight, SUM(l.amount) amount $sold GROUP BY si.item_id) sd ON sd.item_id = t.item_id
      ORDER BY i.name", [...$ids, ...$ids]);
  $tot = q1("SELECT COALESCE(SUM(l.qty), 0) qty, COALESCE(SUM(l.weight), 0) weight, COALESCE(SUM(l.amount), 0) gross $sold", $ids);
  $sh = q1("SELECT COALESCE(SUM(freight), 0) fr, COALESCE(SUM(unloading), 0) un, COALESCE(SUM(other_expenses), 0) oth FROM shipments WHERE id IN ($in)", $ids);
  return [
    'supplier' => $sup, 'shipment_ids' => $ids,
    'shipments' => q("SELECT id, ship_date, truck FROM shipments WHERE id IN ($in) ORDER BY ship_date", $ids),
    'lines' => $lines, 'items' => $items,
    'totals' => ['qty_in' => (float)qv("SELECT COALESCE(SUM(qty), 0) FROM shipment_items WHERE shipment_id IN ($in)", $ids),
                 'qty' => (float)$tot['qty'], 'weight' => (float)$tot['weight'], 'gross' => (float)$tot['gross']],
    'commission_pct' => $sup['commission_pct'],
    'freight' => (float)$sh['fr'], 'unloading' => (float)$sh['un'], 'other_expenses' => (float)$sh['oth'],
  ];
}
$FN['preview_settlement'] = fn(array $p) => _preview_settlement($p);

function _get_settlement(?int $id): array {
  $st = $id ? q1('SELECT * FROM settlements WHERE id = ?', [$id]) : null;
  if (!$st) fail('التصفية غير موجودة');
  $st['details'] = (object)jdec($st['details'], []);
  return $st + [
    'supplier' => q1('SELECT * FROM suppliers WHERE id = ?', [$st['supplier_id']]),
    'created_by_name' => _uname($st['created_by']), 'decided_by_name' => _uname($st['decided_by']), 'paid_by_name' => _uname($st['paid_by']),
    'advance_balance' => _advance_balance((int)$st['supplier_id']),
    'shipments' => q('SELECT id, ship_date, truck FROM shipments WHERE settlement_id = ? ORDER BY ship_date', [$id]),
    'settings' => q1('SELECT * FROM shop_settings WHERE id = 1'),
  ];
}
$FN['get_settlement'] = function (array $p) { _need(null); return _get_settlement(_i($p, 'id')); };

$FN['create_settlement'] = function (array $p) {
  _need('settlements');
  lock_all();
  $pv = _preview_settlement($p);
  $pct = _n($p, 'commission_pct', $pv['commission_pct']);
  if ($pct < 0 || $pct > 100) fail('نسبة العمولة غير صحيحة');
  $gross = $pv['totals']['gross'];
  $comm = r2($gross * $pct / 100);
  $fr = _n($p, 'freight', $pv['freight']); $un = _n($p, 'unloading', $pv['unloading']); $oth = _n($p, 'other_expenses', $pv['other_expenses']);
  $net = r2($gross - $comm - $fr - $un - $oth);
  $no = (int)qv('SELECT COALESCE(MAX(settle_no), 0) + 1 FROM settlements');
  $stid = ins('INSERT INTO settlements(settle_no, supplier_id, created_by, total_qty_in, total_qty, total_weight, gross_sales, commission_pct,
      commission_amount, freight, unloading, other_expenses, other_label, net_amount, details, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    [$no, _i($p, 'supplier_id'), uid(), $pv['totals']['qty_in'], $pv['totals']['qty'], $pv['totals']['weight'], $gross, $pct, $comm,
     $fr, $un, $oth, _t($p, 'other_label'), $net, jenc(['lines' => $pv['lines'], 'items' => $pv['items']]), _t($p, 'notes')]);
  ex('UPDATE shipments SET settlement_id = ? WHERE id IN (' . in_list($pv['shipment_ids']) . ')', [$stid, ...$pv['shipment_ids']]);
  return _get_settlement($stid);
};

$FN['list_settlements'] = function (array $p) {
  _need(null);
  $st = _t($p, 'status') !== '' ? _t($p, 'status') : 'all';
  $sup = _i($p, 'supplier_id');
  $rows = q("SELECT s.id, s.settle_no, DATE(s.created_at) AS date, s.supplier_id, su.name AS supplier, s.gross_sales, s.commission_amount,
      s.freight + s.unloading + s.other_expenses AS expenses, s.net_amount, s.status, s.total_weight, s.total_qty, s.created_by
    FROM settlements s JOIN suppliers su ON su.id = s.supplier_id
    WHERE (? = 'all' OR s.status = ?) AND (? IS NULL OR s.supplier_id = ?) ORDER BY s.id DESC", [$st, $st, $sup, $sup]);
  foreach ($rows as &$r) { $r['by'] = _uname($r['created_by']); unset($r['created_by']); }
  return $rows;
};

$FN['decide_settlement'] = function (array $p) {
  _need('approve');
  lock_all();
  $s = q1('SELECT * FROM settlements WHERE id = ?', [_i($p, 'id')]);
  if (!$s) fail('التصفية غير موجودة');
  if ($s['status'] !== 'pending') fail('التصفية دي اتراجعت قبل كده');
  if (_b($p, 'approve') ?? false) {
    ex("UPDATE settlements SET status = 'approved', decided_by = ?, decided_at = NOW(6) WHERE id = ?", [uid(), $s['id']]);
  } else {
    ex("UPDATE settlements SET status = 'rejected', decided_by = ?, decided_at = NOW(6), reject_reason = ? WHERE id = ?", [uid(), _t($p, 'reason'), $s['id']]);
    ex('UPDATE shipments SET settlement_id = NULL WHERE settlement_id = ?', [$s['id']]);
  }
  return _get_settlement((int)$s['id']);
};

$FN['pay_settlement'] = function (array $p) {
  _need('payouts');
  lock_all();
  $s = q1('SELECT * FROM settlements WHERE id = ?', [_i($p, 'id')]);
  if (!$s) fail('التصفية غير موجودة');
  if ($s['status'] === 'pending') fail('التصفية لسه مستنية موافقة المدير');
  if ($s['status'] !== 'approved') fail('التصفية دي مش جاهزة للصرف');
  $sup = qv('SELECT name FROM suppliers WHERE id = ?', [$s['supplier_id']]);
  ex("UPDATE settlements SET status = 'paid', paid_by = ?, paid_at = NOW(6) WHERE id = ?", [uid(), $s['id']]);
  $pay = r2($s['net_amount'] - $s['advance_deducted']);
  if ($pay > 0) {
    _cash('out', $pay, 'supplier_payment', 'صرف فاتورة رقم ' . $s['settle_no'] . ' — ' . $sup .
      ($s['advance_deducted'] > 0 ? ' (بعد خصم ' . fmtn($s['advance_deducted']) . ' من العهدة لدى العميل)' : ''), $sup, 'settlement', (int)$s['id']);
  }
  return _get_settlement((int)$s['id']);
};

$FN['pending_approvals'] = function (array $p) {
  _need('approve');
  $sales = q("SELECT s.id, s.sale_no, s.sale_date AS date, c.name AS customer, c.id AS customer_id, s.grand_total, s.paid_amount,
      s.grand_total - s.paid_amount AS remaining, c.credit_limit, c.credit_approved, s.created_by
    FROM sales s JOIN customers c ON c.id = s.customer_id WHERE s.approval_status = 'pending' AND NOT s.voided ORDER BY s.id");
  foreach ($sales as &$s) { $s['balance'] = _customer_balance((int)$s['customer_id']); $s['by'] = _uname($s['created_by']); unset($s['created_by']); }
  $setts = q("SELECT s.id, s.settle_no, su.name AS supplier, s.gross_sales, s.commission_amount, s.freight + s.unloading + s.other_expenses AS expenses,
      s.net_amount, s.total_weight, s.created_by, DATE(s.created_at) AS date
    FROM settlements s JOIN suppliers su ON su.id = s.supplier_id WHERE s.status = 'pending' ORDER BY s.id");
  foreach ($setts as &$s) { $s['by'] = _uname($s['created_by']); unset($s['created_by']); }
  $custs = q('SELECT id, name, phone FROM customers WHERE credit_requested AND NOT credit_approved ORDER BY id');
  foreach ($custs as &$c) $c['balance'] = _customer_balance((int)$c['id']);
  $users = _has('users') ? q('SELECT id, username, full_name FROM profiles WHERE NOT active AND deleted_at IS NULL AND purged_at IS NULL ORDER BY created_at') : [];
  $reqs = q("SELECT * FROM change_requests WHERE status = 'pending' ORDER BY id");
  foreach ($reqs as &$r) { $r['payload'] = (object)jdec($r['payload']); $r['details'] = $r['details'] ?? ''; $r['by'] = _uname($r['requested_by']); }
  return ['sales' => $sales, 'settlements' => $setts, 'customers' => $custs, 'users' => $users, 'requests' => $reqs];
};
