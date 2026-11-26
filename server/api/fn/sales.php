<?php
// البيع والفواتير وتعديلها
declare(strict_types=1);

/** رقم للعرض في الرسائل: 45 بدل 45.00 */
function fmtn($x): string { $s = number_format((float)$x, 3, '.', ''); return rtrim(rtrim($s, '0'), '.'); }

function _get_sale(array $p): array {
  $id = _i($p, 'id');
  $s = $id !== null ? q1('SELECT * FROM sales WHERE id = ?', [$id]) : q1('SELECT * FROM sales WHERE sale_no = ?', [_i($p, 'sale_no')]);
  if (!$s) fail('الفاتورة غير موجودة');
  $c = $s['customer_id'] ? q1('SELECT * FROM customers WHERE id = ?', [$s['customer_id']]) : null;
  return [
    'sale' => $s,
    'customer' => $c,
    'customer_display' => $c['name'] ?? ($s['customer_name'] !== '' ? $s['customer_name'] : 'زبون نقدي'),
    'created_by_name' => _uname($s['created_by']),
    'balance' => $s['customer_id'] ? _customer_balance((int)$s['customer_id']) : null,
    'lines' => q('SELECT l.id, i.name AS item, l.unit, l.qty, l.weight, l.price, l.amount, ct.name AS crate, l.crates,
        l.deposit_unit, l.deposit_amount, su.name AS supplier
      FROM sale_lines l JOIN items i ON i.id = l.item_id
      LEFT JOIN crate_types ct ON ct.id = l.crate_type_id
      LEFT JOIN shipment_items si ON si.id = l.shipment_item_id
      LEFT JOIN shipments sh ON sh.id = si.shipment_id
      LEFT JOIN suppliers su ON su.id = sh.supplier_id
      WHERE l.sale_id = ? ORDER BY l.id', [$s['id']]),
    'settings' => q1('SELECT * FROM shop_settings WHERE id = 1'),
  ];
}
$FN['get_sale'] = function (array $p) { _need(null); return _get_sale($p); };

$FN['create_sale'] = function (array $p) {
  _need('sales');
  lock_all();
  $cid = _i($p, 'customer_id');
  $ptype = _t($p, 'payment_type') !== '' ? _t($p, 'payment_type') : 'cash';
  if (!in_array($ptype, ['cash', 'credit'], true)) fail('طريقة الدفع غير صحيحة');
  $lines = is_array($p['lines'] ?? null) ? $p['lines'] : [];
  if (!$lines) fail('ضيف صنف واحد على الأقل');
  $c = null;
  if ($cid !== null) { $c = q1('SELECT * FROM customers WHERE id = ?', [$cid]); if (!$c) fail('الزبون غير موجود'); }
  if ($ptype === 'credit' && $cid === null) fail('البيع الآجل لازم يكون لزبون مسجل');
  $disc = r2(_n($p, 'discount'));

  $sid = ins('INSERT INTO sales(sale_date, customer_id, customer_name, payment_type, notes, created_by) VALUES (?,?,?,?,?,?)',
    [today(), $cid, $cid === null ? _t($p, 'customer_name') : '', $ptype, _t($p, 'notes'), uid()]);
  $goods = 0.0; $deps = 0.0;
  foreach ($lines as $ln) {
    if (!is_array($ln)) fail('اختار الصنف في كل سطر');
    $siid = _i($ln, 'shipment_item_id');
    $iid = _i($ln, 'item_id');
    if ($siid !== null) {
      $x = q1('SELECT si.item_id, sh.settlement_id FROM shipment_items si JOIN shipments sh ON sh.id = si.shipment_id WHERE si.id = ?', [$siid]);
      if (!$x) fail('الصنف غير موجود في النقلة');
      $iid = (int)$x['item_id'];
      if ($x['settlement_id'] !== null) fail('النقلة دي اتقفلت (اتعملها تصفية)');
    }
    if ($iid === null) fail('اختار الصنف في كل سطر');
    if (!qv('SELECT 1 FROM items WHERE id = ?', [$iid])) fail('الصنف غير موجود');
    $unit = _t($ln, 'unit') !== '' ? _t($ln, 'unit') : 'kg';
    if (!in_array($unit, ['kg', 'count'], true)) fail('وحدة البيع غير صحيحة');
    $qty = _n($ln, 'qty'); $wt = _n($ln, 'weight'); $price = _n($ln, 'price');
    if ($qty < 0 || $wt < 0 || $price < 0) fail('مينفعش أرقام بالسالب');
    if ($unit === 'kg' && $wt <= 0) fail('اكتب الوزن للصنف اللي بيتباع بالكيلو');
    if ($unit === 'count' && $qty <= 0) fail('اكتب العدد للصنف اللي بيتباع بالعدد');
    if ($price <= 0) fail('اكتب سعر كل صنف');
    if ($siid !== null) {
      $remaining = (float)qv('SELECT qty FROM shipment_items WHERE id = ?', [$siid]) - _shipitem_sold($siid);
      if ($qty > $remaining + 1e-9) fail('الكمية أكبر من الباقي في النقلة (الباقي ' . fmtn($remaining) . ')');
    }
    $amt = r2($unit === 'kg' ? $wt * $price : $qty * $price);
    $ctid = _i($ln, 'crate_type_id'); $crates = _i($ln, 'crates') ?? 0; $dep = 0.0;
    if ($crates < 0) fail('عدد الصناديق غير صحيح');
    if ($ctid !== null && $crates > 0) {
      $dep = (float)(qv('SELECT deposit FROM crate_types WHERE id = ?', [$ctid]) ?? 0);
      if ($dep > 0 && $cid === null) fail('رهن الصناديق لازم يكون لزبون مسجل علشان نتابع المرتجع');
    } else { $crates = 0; $ctid = null; }
    $depAmt = r2($crates * $dep);
    ins('INSERT INTO sale_lines(sale_id, shipment_item_id, item_id, unit, qty, weight, price, amount, crate_type_id, crates, deposit_unit, deposit_amount)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', [$sid, $siid, $iid, $unit, $qty, $wt, $price, $amt, $ctid, $crates, $dep, $depAmt]);
    $goods += $amt; $deps += $depAmt;
  }
  $grand = r2($goods + $deps - $disc);
  if ($grand < 0) fail('الخصم أكبر من الفاتورة');
  $approval = 'not_required';
  if ($ptype === 'cash') {
    $paid = $grand;
  } else {
    $paid = min(max(r2(_n($p, 'paid_amount')), 0), $grand);
    $bal = _customer_balance($cid);
    if (_has('approve')) $approval = 'not_required';
    elseif (!$c['credit_approved']) $approval = 'pending';
    elseif ($c['credit_limit'] > 0 && $bal + ($grand - $paid) > $c['credit_limit'] + 1e-9) $approval = 'pending';
  }
  // رقم الفاتورة بيتحدد في الآخر بعد ما كل حاجة تتراجع، علشان الأرقام تمشي ورا بعض من غير فراغات
  $no = (int)qv('SELECT COALESCE(MAX(sale_no), 0) + 1 FROM sales');
  ex('UPDATE sales SET goods_total = ?, deposit_total = ?, discount = ?, grand_total = ?, paid_amount = ?, approval_status = ?, sale_no = ? WHERE id = ?',
    [r2($goods), r2($deps), $disc, $grand, $paid, $approval, $no, $sid]);
  _cash('in', $paid, 'sale', 'فاتورة بيع رقم ' . $no . ($ptype === 'credit' ? ' (دفعة من آجل)' : ''),
    $c['name'] ?? (_t($p, 'customer_name') !== '' ? _t($p, 'customer_name') : 'زبون نقدي'), 'sale', $sid);
  return _get_sale(['id' => $sid]);
};

$FN['list_sales'] = function (array $p) {
  _need(null);
  $q = _t($p, 'search');
  $pt = _t($p, 'payment_type') !== '' ? _t($p, 'payment_type') : 'all';
  $cid = _i($p, 'customer_id');
  $rows = q("SELECT s.id, s.sale_no, s.sale_date AS date, DATE_FORMAT(s.created_at, '%H:%i') AS time, s.customer_id,
      COALESCE(c.name, NULLIF(s.customer_name, ''), 'زبون نقدي') AS customer, s.payment_type, s.goods_total, s.deposit_total,
      s.grand_total, s.paid_amount, s.approval_status, s.voided, s.created_by
    FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
    WHERE s.sale_date BETWEEN ? AND ? AND (? IS NULL OR s.customer_id = ?) AND (? = 'all' OR s.payment_type = ?)
      AND (? OR NOT s.voided)
      AND (? = '' OR CAST(s.sale_no AS CHAR) = ? OR c.name LIKE ? OR s.customer_name LIKE ?)
    ORDER BY s.id DESC",
    [_d($p, 'from'), _d($p, 'to'), $cid, $cid, $pt, $pt, (int)(_b($p, 'include_voided') ?? false), $q, $q, like($q), like($q)]);
  $items = [];
  if ($rows) {
    $ids = array_column($rows, 'id');
    foreach (q('SELECT l.sale_id, i.name FROM sale_lines l JOIN items i ON i.id = l.item_id WHERE l.sale_id IN (' . in_list($ids) . ') ORDER BY l.id', $ids) as $r) {
      $items[$r['sale_id']][] = $r['name'];
    }
  }
  foreach ($rows as &$r) {
    $r['by'] = _uname($r['created_by']); unset($r['created_by']);
    $r['items'] = isset($items[$r['id']]) ? implode('، ', $items[$r['id']]) : null;
  }
  return $rows;
};

function _sale_in_settled(int $sid): bool {
  return (bool)qv('SELECT 1 FROM sale_lines l JOIN shipment_items si ON si.id = l.shipment_item_id
    JOIN shipments sh ON sh.id = si.shipment_id WHERE l.sale_id = ? AND sh.settlement_id IS NOT NULL LIMIT 1', [$sid]);
}

$FN['void_sale'] = function (array $p) {
  _need('approve');
  lock_all();
  $s = q1('SELECT * FROM sales WHERE id = ?', [_i($p, 'id')]);
  if (!$s) fail('الفاتورة غير موجودة');
  if ($s['voided']) fail('الفاتورة ملغية بالفعل');
  if (_sale_in_settled((int)$s['id'])) fail('مينفعش تلغي الفاتورة دي لأن النقلة بتاعتها اتعملها تصفية');
  ex('UPDATE sales SET voided = 1, voided_by = ?, voided_at = NOW(6), void_reason = ? WHERE id = ?', [uid(), _t($p, 'reason'), $s['id']]);
  _cash('out', $s['paid_amount'], 'sale_void', 'إلغاء فاتورة رقم ' . $s['sale_no'], '', 'sale', (int)$s['id']);
  return ['ok' => true];
};

$FN['edit_sale'] = function (array $p) {
  _need('approve');
  lock_all();
  $s = q1('SELECT * FROM sales WHERE id = ?', [_i($p, 'id')]);
  if (!$s) fail('الفاتورة غير موجودة');
  if ($s['voided']) fail('الفاتورة دي ملغية');
  if (_sale_in_settled((int)$s['id'])) fail('مينفعش تتعدل لأن النقلة بتاعتها اتعملها فاتورة مورد');
  foreach ((is_array($p['lines'] ?? null) ? $p['lines'] : []) as $ln) {
    $l = q1('SELECT * FROM sale_lines WHERE id = ? AND sale_id = ?', [_i($ln, 'id'), $s['id']]);
    if (!$l) fail('سطر غير موجود في الفاتورة');
    $vq = _n($ln, 'qty', $l['qty']); $vw = _n($ln, 'weight', $l['weight']); $vp = _n($ln, 'price', $l['price']);
    if ($vq < 0 || $vw < 0 || $vp <= 0) fail('الأرقام غير صحيحة');
    if ($l['unit'] === 'kg' && $vw <= 0) fail('اكتب الوزن');
    if ($l['shipment_item_id'] !== null) {
      $room = (float)qv('SELECT qty FROM shipment_items WHERE id = ?', [$l['shipment_item_id']]) - _shipitem_sold((int)$l['shipment_item_id']) + $l['qty'];
      if ($vq > $room + 1e-9) fail('العدد أكبر من الموجود في النقلة (المتاح ' . fmtn($room) . ')');
    }
    $amt = r2($l['unit'] === 'kg' ? $vw * $vp : $vq * $vp);
    ex('UPDATE sale_lines SET qty = ?, weight = ?, price = ?, amount = ? WHERE id = ?', [$vq, $vw, $vp, $amt, $l['id']]);
  }
  $goods = (float)qv('SELECT COALESCE(SUM(amount), 0) FROM sale_lines WHERE sale_id = ?', [$s['id']]);
  $grand = r2($goods + $s['deposit_total'] - $s['discount']);
  if ($grand < 0) fail('الخصم أكبر من الفاتورة');
  $newpaid = $s['payment_type'] === 'cash' ? $grand : min($s['paid_amount'], $grand);
  $delta = r2($newpaid - $s['paid_amount']);
  $note = trim($s['notes'] . (_t($p, 'reason') !== '' ? ' | تعديل: ' . _t($p, 'reason') : ' | اتعدلت'));
  ex('UPDATE sales SET goods_total = ?, grand_total = ?, paid_amount = ?, notes = ? WHERE id = ?', [r2($goods), $grand, $newpaid, mb_substr($note, 0, 1000), $s['id']]);
  if ($delta > 0) _cash('in', $delta, 'sale_edit', 'فرق تعديل فاتورة رقم ' . $s['sale_no'], '', 'sale', (int)$s['id']);
  elseif ($delta < 0) _cash('out', -$delta, 'sale_edit', 'فرق تعديل فاتورة رقم ' . $s['sale_no'], '', 'sale', (int)$s['id']);
  return _get_sale(['id' => $s['id']]);
};

$FN['decide_sale'] = function (array $p) {
  _need('approve');
  lock_all();
  $ok = _b($p, 'approve') ?? false;
  $s = q1('SELECT * FROM sales WHERE id = ?', [_i($p, 'id')]);
  if (!$s) fail('الفاتورة غير موجودة');
  if ($s['approval_status'] !== 'pending' || $s['voided']) fail('الفاتورة دي اتراجعت قبل كده');
  if ($ok) {
    ex("UPDATE sales SET approval_status = 'approved', decided_by = ?, decided_at = NOW(6) WHERE id = ?", [uid(), $s['id']]);
  } else {
    $r = _t($p, 'reason');
    ex("UPDATE sales SET approval_status = 'rejected', decided_by = ?, decided_at = NOW(6), reject_reason = ?, voided = 1, voided_by = ?,
          voided_at = NOW(6), void_reason = ? WHERE id = ?", [uid(), $r, uid(), 'رفض الآجل' . ($r !== '' ? ' — ' . $r : ''), $s['id']]);
    _cash('out', $s['paid_amount'], 'sale_void', 'رفض آجل فاتورة رقم ' . $s['sale_no'], '', 'sale', (int)$s['id']);
  }
  return ['ok' => true];
};

$FN['decide_customer_credit'] = function (array $p) {
  _need('approve');
  $ok = _b($p, 'approve') ?? false;
  $id = _i($p, 'id');
  if (!$id || !qv('SELECT 1 FROM customers WHERE id = ?', [$id])) fail('الزبون غير موجود');
  ex('UPDATE customers SET credit_requested = 0, credit_approved = ?, credit_limit = ? WHERE id = ?', [(int)$ok, $ok ? _n($p, 'credit_limit') : 0, $id]);
  return q1('SELECT * FROM customers WHERE id = ?', [$id]);
};

// ---------------------------------------------------------------- البضاعة
$FN['list_stock'] = function (array $p) {
  _need(null);
  $q = like(_t($p, 'search'));
  $rows = q('SELECT si.id AS shipment_item_id, i.id AS item_id, i.name AS item, i.default_unit, sh.id AS shipment_id, sh.ship_date, sh.truck,
      su.id AS supplier_id, su.name AS supplier, si.qty, COALESCE(a.sold, 0) AS sold, si.qty - COALESCE(a.sold, 0) AS remaining
    FROM shipment_items si JOIN shipments sh ON sh.id = si.shipment_id
    JOIN items i ON i.id = si.item_id JOIN suppliers su ON su.id = sh.supplier_id
    LEFT JOIN (SELECT l.shipment_item_id, SUM(l.qty) sold FROM sale_lines l JOIN sales s ON s.id = l.sale_id WHERE NOT s.voided GROUP BY l.shipment_item_id) a
      ON a.shipment_item_id = si.id
    WHERE sh.settlement_id IS NULL AND (i.name LIKE ? OR su.name LIKE ?) ORDER BY i.name, sh.ship_date', [$q, $q]);
  foreach ($rows as &$r) { $r['sold'] = (float)$r['sold']; $r['remaining'] = (float)$r['remaining']; }
  if (_b($p, 'include_empty') ?? false) return $rows;
  return array_values(array_filter($rows, fn($x) => $x['remaining'] > 0));
};

$FN['stock_adjust'] = function (array $p) {
  _need('approve');
  lock_all();
  $si = q1('SELECT * FROM shipment_items WHERE id = ?', [_i($p, 'shipment_item_id')]);
  if (!$si) fail('الصنف غير موجود');
  if (qv('SELECT settlement_id FROM shipments WHERE id = ?', [$si['shipment_id']]) !== null) fail('النقلة دي اتعملها فاتورة مورد');
  $newq = _n($p, 'qty', -1);
  $sold = _shipitem_sold((int)$si['id']);
  if ($newq < $sold) fail('العدد مينفعش يقل عن اللي اتباع (' . fmtn($sold) . ')');
  if (abs($newq) < 1e-9) {
    ex('DELETE FROM shipment_items WHERE id = ?', [$si['id']]);
    if (!qv('SELECT 1 FROM shipment_items WHERE shipment_id = ?', [$si['shipment_id']])) ex('DELETE FROM shipments WHERE id = ?', [$si['shipment_id']]);
  } else {
    ex('UPDATE shipment_items SET qty = ? WHERE id = ?', [$newq, $si['id']]);
  }
  return ['ok' => true, 'qty' => $newq, 'sold' => $sold];
};
