<?php
// الموردين (العملاء) والنقلات والبضاعة الموجودة
declare(strict_types=1);

function _advance_balance(int $sid): float {
  return r2((float)qv('SELECT COALESCE(SUM(amount), 0) FROM supplier_advances WHERE supplier_id = ? AND NOT voided', [$sid])
          - (float)qv("SELECT COALESCE(SUM(advance_deducted), 0) FROM settlements WHERE supplier_id = ? AND status <> 'rejected'", [$sid]));
}

$FN['list_suppliers'] = function (array $p) {
  _need(null);
  $q = like(_t($p, 'search'));
  $rows = q('SELECT * FROM suppliers s WHERE (s.name LIKE ? OR s.phone LIKE ?) AND (? OR s.active) ORDER BY s.name',
    [$q, $q, (int)(_b($p, 'include_inactive') ?? false)]);
  return array_map(function ($s) {
    $id = (int)$s['id'];
    $sum = fn($expr, $st) => (float)qv("SELECT COALESCE(SUM($expr), 0) FROM settlements WHERE supplier_id = ? AND status = ?", [$id, $st]);
    return [
      'id' => $id, 'name' => $s['name'], 'phone' => $s['phone'], 'commission_pct' => $s['commission_pct'], 'notes' => $s['notes'], 'active' => $s['active'],
      'open_shipments' => (int)qv('SELECT COUNT(*) FROM shipments WHERE supplier_id = ? AND settlement_id IS NULL', [$id]),
      'pending_amount' => $sum('net_amount', 'pending'),
      'due_amount' => $sum('net_amount - advance_deducted', 'approved'),
      'advance_balance' => _advance_balance($id),
      'paid_amount' => $sum('net_amount', 'paid'),
    ];
  }, $rows);
};

$FN['save_supplier'] = function (array $p) {
  _need('suppliers');
  if (_t($p, 'name') === '') fail('اكتب اسم المورد');
  $id = _i($p, 'id');
  if ($id === null) {
    $def = qv('SELECT default_commission FROM shop_settings WHERE id = 1');
    $id = ins('INSERT INTO suppliers(name, phone, commission_pct, notes) VALUES (?,?,?,?)',
      [_t($p, 'name'), _t($p, 'phone'), _n($p, 'commission_pct', $def), _t($p, 'notes')]);
  } else {
    $s = q1('SELECT * FROM suppliers WHERE id = ?', [$id]);
    if (!$s) return null;
    ex('UPDATE suppliers SET name = ?, phone = ?, commission_pct = ?, notes = ?, active = ? WHERE id = ?',
      [_t($p, 'name'), _t($p, 'phone'), _n($p, 'commission_pct', $s['commission_pct']), _t($p, 'notes'), (int)(_b($p, 'active') ?? $s['active']), $id]);
  }
  $pct = (float)qv('SELECT commission_pct FROM suppliers WHERE id = ?', [$id]);
  if ($pct < 0 || $pct > 100) fail('العمولة لازم تكون بين 0 و 100');
  return q1('SELECT * FROM suppliers WHERE id = ?', [$id]);
};

function _shipment_json(?int $sid): ?array {
  if (!$sid) return null;
  $sh = q1('SELECT sh.*, su.name AS supplier FROM shipments sh JOIN suppliers su ON su.id = sh.supplier_id WHERE sh.id = ?', [$sid]);
  if (!$sh) return null;
  $st = $sh['settlement_id'] ? q1('SELECT settle_no, status FROM settlements WHERE id = ?', [$sh['settlement_id']]) : null;
  $items = q('SELECT si.id, si.item_id, i.name AS item, i.default_unit, si.qty, si.notes,
      COALESCE(a.qty, 0) AS sold_qty, COALESCE(a.weight, 0) AS sold_weight, COALESCE(a.amount, 0) AS sold_amount
    FROM shipment_items si JOIN items i ON i.id = si.item_id
    LEFT JOIN (SELECT l.shipment_item_id, SUM(l.qty) qty, SUM(l.weight) weight, SUM(l.amount) amount
               FROM sale_lines l JOIN sales s ON s.id = l.sale_id WHERE NOT s.voided GROUP BY l.shipment_item_id) a ON a.shipment_item_id = si.id
    WHERE si.shipment_id = ? ORDER BY si.id', [$sid]);
  foreach ($items as &$it) {
    $it['sold_qty'] = (float)$it['sold_qty']; $it['sold_weight'] = (float)$it['sold_weight']; $it['sold_amount'] = (float)$it['sold_amount'];
    $it['remaining'] = r2($it['qty'] - $it['sold_qty']);
    $it['avg_price'] = $it['sold_weight'] > 0 ? r2($it['sold_amount'] / $it['sold_weight']) : ($it['sold_qty'] > 0 ? r2($it['sold_amount'] / $it['sold_qty']) : 0);
  }
  return [
    'id' => $sh['id'], 'supplier_id' => $sh['supplier_id'], 'supplier' => $sh['supplier'], 'ship_date' => $sh['ship_date'],
    'truck' => $sh['truck'], 'driver' => $sh['driver'], 'freight' => $sh['freight'], 'unloading' => $sh['unloading'],
    'other_expenses' => $sh['other_expenses'], 'notes' => $sh['notes'], 'settlement_id' => $sh['settlement_id'],
    'settle_no' => $st['settle_no'] ?? null, 'settle_status' => $st['status'] ?? null,
    'created_by' => _uname($sh['created_by']), 'items' => $items,
  ];
}

$FN['save_shipment'] = function (array $p) {
  _need('suppliers');
  lock_all();
  if (_i($p, 'supplier_id') === null) fail('اختار المورد');
  $items = is_array($p['items'] ?? null) ? $p['items'] : [];
  if (!$items) fail('ضيف صنف واحد على الأقل');
  if (!qv('SELECT 1 FROM suppliers WHERE id = ?', [_i($p, 'supplier_id')])) fail('المورد غير موجود');
  $sid = _i($p, 'id');
  $vals = [_i($p, 'supplier_id'), _d($p, 'ship_date'), _t($p, 'truck'), _t($p, 'driver'), _n($p, 'freight'), _n($p, 'unloading'), _n($p, 'other_expenses'), _t($p, 'notes')];
  if ($sid === null) {
    $sid = ins('INSERT INTO shipments(supplier_id, ship_date, truck, driver, freight, unloading, other_expenses, notes, created_by) VALUES (?,?,?,?,?,?,?,?,?)', [...$vals, uid()]);
  } else {
    $sh = q1('SELECT * FROM shipments WHERE id = ?', [$sid]);
    if (!$sh) fail('النقلة غير موجودة');
    if ($sh['settlement_id']) fail('النقلة دي اتعملها تصفية ومينفعش تتعدل');
    ex('UPDATE shipments SET supplier_id = ?, ship_date = ?, truck = ?, driver = ?, freight = ?, unloading = ?, other_expenses = ?, notes = ? WHERE id = ?', [...$vals, $sid]);
  }
  $keep = [];
  foreach ($items as $it) {
    if (!is_array($it)) fail('اختار الصنف');
    $iid = _i($it, 'item_id');
    if ($iid === null) {
      if (_t($it, 'item_name') === '') fail('اختار الصنف');
      $iid = qv('SELECT id FROM items WHERE name = ?', [_t($it, 'item_name')]);
      if ($iid) ex('UPDATE items SET active = 1 WHERE id = ?', [$iid]);
      else $iid = ins('INSERT INTO items(name, default_unit) VALUES (?,?)', [_t($it, 'item_name'), _t($it, 'default_unit') !== '' ? _t($it, 'default_unit') : 'kg']);
    } elseif (!qv('SELECT 1 FROM items WHERE id = ?', [$iid])) fail('الصنف غير موجود');
    if (_n($it, 'qty') <= 0) fail('اكتب عدد الطرود لكل صنف');
    $siid = _i($it, 'id');
    if ($siid === null) {
      $siid = ins('INSERT INTO shipment_items(shipment_id, item_id, qty, notes) VALUES (?,?,?,?)', [$sid, $iid, _n($it, 'qty'), _t($it, 'notes')]);
    } else {
      $sold = _shipitem_sold($siid);
      if (_n($it, 'qty') < $sold) fail('مينفعش العدد يقل عن اللي اتباع (' . (0 + $sold) . ')');
      ex('UPDATE shipment_items SET item_id = IF(? > 0, item_id, ?), qty = ?, notes = ? WHERE id = ? AND shipment_id = ?', [$sold, $iid, _n($it, 'qty'), _t($it, 'notes'), $siid, $sid]);
    }
    $keep[] = $siid;
  }
  $others = q('SELECT id FROM shipment_items WHERE shipment_id = ? AND id NOT IN (' . in_list($keep) . ')', [$sid, ...$keep]);
  foreach ($others as $o) if (_shipitem_sold((int)$o['id']) > 0) fail('فيه صنف اتباع منه ومينفعش يتشال من النقلة');
  ex('DELETE FROM shipment_items WHERE shipment_id = ? AND id NOT IN (' . in_list($keep) . ')', [$sid, ...$keep]);
  return _shipment_json($sid);
};

$FN['delete_shipment'] = function (array $p) {
  _need('approve');
  lock_all();
  $sh = q1('SELECT * FROM shipments WHERE id = ?', [_i($p, 'id')]);
  if (!$sh) fail('النقلة غير موجودة');
  if ($sh['settlement_id']) fail('النقلة دي اتعملها تصفية');
  foreach (q('SELECT id FROM shipment_items WHERE shipment_id = ?', [$sh['id']]) as $si) {
    if (_shipitem_sold((int)$si['id']) > 0) fail('النقلة دي اتباع منها ومينفعش تتمسح');
  }
  ex('DELETE FROM shipments WHERE id = ?', [$sh['id']]);
  _log('void', 'shipment', (int)$sh['id'], 'حذف نقلة رقم ' . $sh['id'] . ' — ' . (qv('SELECT name FROM suppliers WHERE id = ?', [$sh['supplier_id']]) ?? ''), 0, _t($p, 'reason'));
  return ['ok' => true];
};

$FN['list_shipments'] = function (array $p) {
  _need(null);
  $st = _t($p, 'status') !== '' ? _t($p, 'status') : 'open';
  $sup = _i($p, 'supplier_id');
  $rows = q("SELECT id FROM shipments sh WHERE (? IS NULL OR sh.supplier_id = ?)
      AND (? = 'all' OR (? = 'open' AND sh.settlement_id IS NULL) OR (? = 'settled' AND sh.settlement_id IS NOT NULL))
      AND sh.ship_date BETWEEN ? AND ? ORDER BY sh.ship_date DESC, sh.id DESC",
    [$sup, $sup, $st, $st, $st, _d($p, 'from', '2000-01-01'), _d($p, 'to', '2999-12-31')]);
  return array_map(fn($r) => _shipment_json((int)$r['id']), $rows);
};

$FN['shipment_detail'] = function (array $p) {
  _need(null);
  $r = _shipment_json(_i($p, 'id'));
  if (!$r) fail('النقلة غير موجودة');
  $r['sales'] = q("SELECT s.id AS sale_id, s.sale_no, s.sale_date AS date,
      COALESCE(c.name, NULLIF(s.customer_name, ''), 'نقدي') AS customer,
      i.name AS item, l.unit, l.qty, l.weight, l.price, l.amount
    FROM sale_lines l JOIN sales s ON s.id = l.sale_id JOIN items i ON i.id = l.item_id
    JOIN shipment_items si ON si.id = l.shipment_item_id LEFT JOIN customers c ON c.id = s.customer_id
    WHERE si.shipment_id = ? AND NOT s.voided ORDER BY s.sale_date, s.id", [_i($p, 'id')]);
  return $r;
};

$FN['available_stock'] = function (array $p) {
  _need(null);
  $rows = q('SELECT si.id AS shipment_item_id, i.id AS item_id, i.name AS item, i.default_unit, sh.id AS shipment_id, sh.ship_date,
      su.name AS supplier, si.qty, si.qty - COALESCE(a.sold, 0) AS remaining
    FROM shipment_items si JOIN shipments sh ON sh.id = si.shipment_id
    JOIN items i ON i.id = si.item_id JOIN suppliers su ON su.id = sh.supplier_id
    LEFT JOIN (SELECT l.shipment_item_id, SUM(l.qty) sold FROM sale_lines l JOIN sales s ON s.id = l.sale_id WHERE NOT s.voided GROUP BY l.shipment_item_id) a
      ON a.shipment_item_id = si.id
    WHERE sh.settlement_id IS NULL ORDER BY i.name, sh.ship_date');
  return array_values(array_filter($rows, fn($x) => $x['remaining'] > 0));
};
