<?php
// العهدة لدى العميل، كشف العميل، المحاسبين وعهدهم، الزمامات
declare(strict_types=1);

$FN['save_advance'] = function (array $p) {
  _need('approve');
  lock_all();
  $amt = r2(_n($p, 'amount'));
  if ($amt <= 0) fail('اكتب المبلغ');
  $aid = _i($p, 'id');
  if ($aid === null) {
    $sup = qv('SELECT name FROM suppliers WHERE id = ?', [_i($p, 'supplier_id')]);
    if ($sup === null) fail('اختار العميل');
    $aid = ins('INSERT INTO supplier_advances(supplier_id, adv_date, amount, notes, created_by) VALUES (?,?,?,?,?)', [_i($p, 'supplier_id'), today(), $amt, _t($p, 'notes'), uid()]);
    _cash('out', $amt, 'supplier_advance', 'مقدم (عهدة) لـ ' . $sup . (_t($p, 'notes') !== '' ? ' — ' . _t($p, 'notes') : ''), $sup, 'advance', $aid);
    $supId = _i($p, 'supplier_id');
  } else {
    $a = q1('SELECT * FROM supplier_advances WHERE id = ?', [$aid]);
    if (!$a || $a['voided']) fail('المقدم غير موجود');
    $supId = (int)$a['supplier_id'];
    $sup = qv('SELECT name FROM suppliers WHERE id = ?', [$supId]);
    $delta = r2($amt - $a['amount']);
    if (_advance_balance($supId) + $delta < -0.005) fail('اتخصم من المقدم ده في فواتير، مينفعش يقل عن كده');
    ex('UPDATE supplier_advances SET amount = ?, notes = ? WHERE id = ?', [$amt, _t($p, 'notes'), $aid]);
    if ($delta > 0) _cash('out', $delta, 'supplier_advance', 'زيادة مقدم لـ ' . $sup, $sup, 'advance', $aid);
    elseif ($delta < 0) _cash('in', -$delta, 'advance_return', 'تعديل مقدم لـ ' . $sup, $sup, 'advance', $aid);
  }
  return ['id' => $aid, 'balance' => _advance_balance($supId)];
};

$FN['void_advance'] = function (array $p) {
  _need('approve');
  lock_all();
  $a = q1('SELECT * FROM supplier_advances WHERE id = ?', [_i($p, 'id')]);
  if (!$a || $a['voided']) fail('المقدم غير موجود');
  if (_advance_balance((int)$a['supplier_id']) - $a['amount'] < -0.005) fail('اتخصم من المقدم ده في فواتير، مينفعش يتلغي');
  $sup = qv('SELECT name FROM suppliers WHERE id = ?', [$a['supplier_id']]);
  ex('UPDATE supplier_advances SET voided = 1 WHERE id = ?', [$a['id']]);
  _cash('in', $a['amount'], 'advance_return', 'إلغاء مقدم لـ ' . $sup . ' (رجع الدرج)', $sup, 'advance', (int)$a['id']);
  return ['ok' => true, 'balance' => _advance_balance((int)$a['supplier_id'])];
};

$FN['supplier_statement'] = function (array $p) {
  _need(null);
  $sid = _i($p, 'supplier_id');
  $d1 = _d($p, 'from', substr(today(), 0, 4) . '-01-01'); $d2 = _d($p, 'to');
  $inv = q("SELECT id, settle_no, DATE(created_at) AS date, gross_sales AS gross, total_weight AS weight, total_qty AS qty,
      commission_amount AS commission, freight, unloading AS smoke, other_expenses AS other, net_amount AS net, advance_deducted AS advance, status, paid_at
    FROM settlements WHERE supplier_id = ? AND status <> 'rejected' AND DATE(created_at) BETWEEN ? AND ? ORDER BY created_at", [$sid, $d1, $d2]);
  $t = ['count' => count($inv), 'gross' => 0.0, 'weight' => 0.0, 'commission' => 0.0, 'freight' => 0.0, 'smoke' => 0.0, 'other' => 0.0, 'net' => 0.0, 'advance' => 0.0, 'paid' => 0.0, 'due' => 0.0];
  foreach ($inv as $x) {
    foreach (['gross', 'weight', 'commission', 'freight', 'smoke', 'other', 'net', 'advance'] as $k) $t[$k] += (float)$x[$k];
    if ($x['status'] === 'paid') $t['paid'] += $x['net'] - $x['advance'];
    if (in_array($x['status'], ['pending', 'approved'], true)) $t['due'] += $x['net'] - $x['advance'];
  }
  foreach ($t as $k => $v) if ($k !== 'count') $t[$k] = round($v, 3);
  $adv = q('SELECT id, adv_date AS date, amount, notes, voided, created_by FROM supplier_advances WHERE supplier_id = ? ORDER BY adv_date DESC, id DESC', [$sid]);
  foreach ($adv as &$a) { $a['by'] = _uname($a['created_by']); unset($a['created_by']); }
  return ['from' => $d1, 'to' => $d2, 'supplier' => $sid ? q1('SELECT * FROM suppliers WHERE id = ?', [$sid]) : null,
          'advance_balance' => $sid ? _advance_balance($sid) : 0, 'invoices' => $inv, 'totals' => $t, 'advances' => $adv];
};

// ---------------------------------------------------------------- المحاسبين
$FN['list_accountants'] = function (array $p) {
  _need_any(['approve', 'reports', 'cash']);
  $rows = q('SELECT u.* FROM profiles u WHERE u.active OR EXISTS (SELECT 1 FROM cash_shifts WHERE user_id = u.id) ORDER BY u.created_at');
  return array_map(function ($u) {
    $s = q1("SELECT COUNT(*) n, COALESCE(SUM(status = 'open'), 0) o, COALESCE(-SUM(CASE WHEN difference < 0 THEN difference END), 0) sh,
                    COALESCE(SUM(CASE WHEN difference > 0 THEN difference END), 0) ov,
                    COALESCE(SUM(status = 'closed' AND reviewed_at IS NULL), 0) un, MAX(opened_at) last
             FROM cash_shifts WHERE user_id = ?", [$u['id']]);
    $sa = q1('SELECT COUNT(*) n, COALESCE(SUM(grand_total), 0) t FROM sales WHERE created_by = ? AND NOT voided', [$u['id']]);
    return ['id' => $u['id'], 'name' => $u['full_name'] !== '' ? $u['full_name'] : $u['username'], 'username' => $u['username'], 'role' => $u['role'],
            'active' => $u['active'], 'deleted' => $u['deleted_at'] !== null, 'shifts' => (int)$s['n'], 'open' => (int)$s['o'] > 0,
            'short' => (float)$s['sh'], 'over' => (float)$s['ov'], 'unreviewed' => (int)$s['un'], 'last_shift' => $s['last'],
            'sales_count' => (int)$sa['n'], 'sales_total' => (float)$sa['t']];
  }, $rows);
};

function _shift_detail(?int $id): array {
  $sh = $id ? q1('SELECT * FROM cash_shifts WHERE id = ?', [$id]) : null;
  if (!$sh) fail('العهدة غير موجودة');
  if ($sh['user_id'] !== uid() && !_has('approve') && !_has('reports') && !_has('cash')) fail('مش عندك صلاحية تشوف عهدة محاسب تاني');
  // الأوقات في قاعدة البيانات بتوقيت القاهرة؛ بنقارن بالقيم الخام
  $raw = q1("SELECT DATE_FORMAT(opened_at, '%Y-%m-%d %H:%i:%s') o, DATE_FORMAT(COALESCE(closed_at, NOW()), '%Y-%m-%d %H:%i:%s') c FROM cash_shifts WHERE id = ?", [$id]);
  $w = 'created_by = ? AND created_at BETWEEN ? AND ?';
  $args = [$sh['user_id'], $raw['o'], $raw['c']];
  $sales = q("SELECT s.id, s.sale_no, DATE_FORMAT(s.created_at, '%H:%i') AS time, COALESCE(c.name, NULLIF(s.customer_name, ''), 'زبون نقدي') AS customer,
      s.payment_type, s.goods_total AS goods, s.deposit_total AS deposit, s.discount, s.grand_total AS total, s.paid_amount AS paid,
      s.voided, s.approval_status AS approval
    FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
    WHERE s.created_by = ? AND s.created_at BETWEEN ? AND ? ORDER BY s.created_at, s.id", $args);
  foreach ($sales as &$s) $s['lines'] = _sale_lines_json((int)$s['id']);
  $tot = q1("SELECT COUNT(*) count, COALESCE(SUM(goods_total), 0) goods, COALESCE(SUM(deposit_total), 0) deposit, COALESCE(SUM(grand_total), 0) total,
      COALESCE(SUM(paid_amount), 0) cash, COALESCE(SUM(grand_total - paid_amount), 0) credit FROM sales WHERE $w AND NOT voided", $args);
  $tot['crates'] = (int)qv("SELECT COALESCE(SUM(l.crates), 0) FROM sale_lines l JOIN sales x ON x.id = l.sale_id
      WHERE x.created_by = ? AND x.created_at BETWEEN ? AND ? AND NOT x.voided AND l.deposit_unit > 0", $args);
  $items = q("SELECT i.name item, SUM(l.qty) qty, SUM(l.weight) weight, SUM(l.amount) amount FROM sale_lines l JOIN sales x ON x.id = l.sale_id
      JOIN items i ON i.id = l.item_id WHERE x.created_by = ? AND x.created_at BETWEEN ? AND ? AND NOT x.voided GROUP BY i.name ORDER BY amount DESC", $args);
  return _shift_report($id) + ['reviewed_by_name' => _uname($sh['reviewed_by']), 'sales' => $sales, 'sales_totals' => $tot, 'items' => $items];
}
$FN['shift_detail'] = function (array $p) { _need(null); return _shift_detail(_i($p, 'id')); };

$FN['review_shift'] = function (array $p) {
  _need('approve');
  $n = ex("UPDATE cash_shifts SET reviewed_by = ?, reviewed_at = NOW(), review_note = ? WHERE id = ? AND status = 'closed'", [uid(), _t($p, 'note'), _i($p, 'id')]);
  if ($n === 0 && !qv("SELECT 1 FROM cash_shifts WHERE id = ? AND status = 'closed'", [_i($p, 'id')])) fail('العهدة لازم تكون مقفولة الأول');
  return _shift_detail(_i($p, 'id'));
};

// ---------------------------------------------------------------- الزمامات
/** تاريخ أقدم فاتورة آجل لسه ما اتسددتش (الدفعات بتتخصم من الأقدم للأحدث) */
function _oldest_unpaid(int $cid): ?string {
  $paid = (float)qv('SELECT COALESCE(SUM(amount), 0) FROM customer_payments WHERE customer_id = ? AND NOT voided', [$cid])
        + (float)qv("SELECT COALESCE(SUM(amount), 0) FROM crate_returns WHERE customer_id = ? AND method = 'account'", [$cid]);
  $cum = 0.0;
  foreach (q('SELECT sale_date, grand_total - paid_amount AS d FROM sales WHERE customer_id = ? AND NOT voided AND grand_total - paid_amount > 0 ORDER BY sale_date, id', [$cid]) as $r) {
    $cum += (float)$r['d'];
    if ($cum > $paid + 0.005) return $r['sale_date'];
  }
  return null;
}

function days_between(?string $a, string $b): ?int {
  if (!$a) return null;
  return (int)round((strtotime($b) - strtotime($a)) / 86400);
}

$FN['report_zimam'] = function (array $p) {
  _need_any(['reports', 'collections', 'customers']);
  $q = like(_t($p, 'search')); $mind = _i($p, 'min_days') ?? 0; $today = today();
  $out = [];
  foreach (q('SELECT * FROM customers c WHERE c.name LIKE ? OR c.phone LIKE ? OR c.guarantor LIKE ?', [$q, $q, $q]) as $c) {
    $cid = (int)$c['id'];
    $bal = _customer_balance($cid);
    if ($bal <= 0) continue;
    $oldest = _oldest_unpaid($cid);
    $late = $oldest ? days_between($oldest, $today) : 0;
    if ($late < $mind) continue;
    $lp = qv('SELECT MAX(pay_date) FROM customer_payments WHERE customer_id = ? AND NOT voided', [$cid]);
    $s = q1("SELECT COUNT(*) n, COALESCE(SUM(payment_type = 'credit'), 0) cr, COALESCE(SUM(grand_total), 0) t, MAX(sale_date) last FROM sales WHERE customer_id = ? AND NOT voided", [$cid]);
    $out[] = [
      'id' => $cid, 'name' => $c['name'], 'phone' => $c['phone'], 'guarantor' => $c['guarantor'],
      'rating_pay' => $c['rating_pay'], 'rating_general' => $c['rating_general'], 'rating_note' => $c['rating_note'],
      'credit_limit' => $c['credit_limit'], 'balance' => $bal, 'oldest_unpaid' => $oldest, 'days_late' => $late,
      'last_payment' => $lp, 'days_since_payment' => days_between($lp, $today),
      'purchases' => (int)$s['n'], 'credit_purchases' => (int)$s['cr'], 'total_purchases' => (float)$s['t'], 'last_sale' => $s['last'],
      'payments_count' => (int)qv('SELECT COUNT(*) FROM customer_payments WHERE customer_id = ? AND NOT voided', [$cid]),
      'crates' => _customer_crates($cid),
    ];
  }
  $byBal = _t($p, 'sort') === 'balance';
  usort($out, fn($a, $b) => $byBal ? ($b['balance'] <=> $a['balance']) : ($b['days_late'] <=> $a['days_late']));
  return $out;
};

$FN['rate_customer'] = function (array $p) {
  _need_any(['customers', 'collections', 'approve']);
  $c = q1('SELECT * FROM customers WHERE id = ?', [_i($p, 'id')]);
  if (!$c) fail('الزبون غير موجود');
  $clamp = fn($v, $d) => min(max($v ?? $d, 0), 5);
  ex('UPDATE customers SET rating_pay = ?, rating_general = ?, rating_note = ?, guarantor = ? WHERE id = ?', [
    $clamp(_i($p, 'rating_pay'), $c['rating_pay']), $clamp(_i($p, 'rating_general'), $c['rating_general']),
    has_key($p, 'rating_note') ? (string)$p['rating_note'] : $c['rating_note'],
    has_key($p, 'guarantor') ? (string)$p['guarantor'] : $c['guarantor'], $c['id']]);
  return q1('SELECT * FROM customers WHERE id = ?', [$c['id']]);
};
