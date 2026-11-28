<?php
// طلبات تعديل وحذف المحاسبين، والمدير بيوافق أو يرفض — وتعديل فاتورة المورد
declare(strict_types=1);

/** وصف الطلب بيتكتب من قاعدة البيانات نفسها (مش من اللي بعته المحاسب) علشان المدير يشوف اللي هيتنفذ فعلاً */
function _change_details(string $k, ?int $tid, array $pl): string {
  if ($k === 'void_sale' || $k === 'edit_sale') {
    $s = $tid ? q1('SELECT * FROM sales WHERE id = ?', [$tid]) : null;
    if (!$s) fail('الفاتورة غير موجودة');
    $cust = $s['customer_id'] ? qv('SELECT name FROM customers WHERE id = ?', [$s['customer_id']]) : null;
    $t = 'فاتورة بيع رقم ' . $s['sale_no'] . ' — ' . ($cust ?? ($s['customer_name'] !== '' ? $s['customer_name'] : 'نقدي')) . ' — إجمالي ' . fmtn($s['grand_total']);
    if ($k === 'void_sale') return 'إلغاء ' . $t;
    $t = 'تعديل ' . $t . ':';
    foreach ((is_array($pl['lines'] ?? null) ? $pl['lines'] : []) as $ln) {
      $l = q1('SELECT * FROM sale_lines WHERE id = ? AND sale_id = ?', [_i($ln, 'id'), $tid]);
      if (!$l) fail('سطر غير موجود في الفاتورة');
      $t .= "\n" . qv('SELECT name FROM items WHERE id = ?', [$l['item_id']])
        . ' | العدد ' . fmtn($l['qty']) . ' ← ' . fmtn(_n($ln, 'qty', $l['qty']))
        . ' | الوزن ' . fmtn($l['weight']) . ' ← ' . fmtn(_n($ln, 'weight', $l['weight']))
        . ' | السعر ' . fmtn($l['price']) . ' ← ' . fmtn(_n($ln, 'price', $l['price']));
    }
    return $t;
  }
  if ($k === 'stock_adjust') {
    $r = q1('SELECT i.name, sp.name sup, sh.ship_date, si.qty FROM shipment_items si JOIN shipments sh ON sh.id = si.shipment_id
      JOIN suppliers sp ON sp.id = sh.supplier_id JOIN items i ON i.id = si.item_id WHERE si.id = ?', [$tid]);
    return $r ? "تعديل عدد {$r['name']} ({$r['sup']} — نقلة {$r['ship_date']}) من " . fmtn($r['qty']) . ' إلى ' . fmtn(_n($pl, 'qty', -1)) : '';
  }
  if ($k === 'delete_shipment') {
    $r = q1('SELECT sp.name, sh.ship_date, sh.truck FROM shipments sh JOIN suppliers sp ON sp.id = sh.supplier_id WHERE sh.id = ?', [$tid]);
    return $r ? "حذف نقلة {$r['name']} بتاريخ {$r['ship_date']}" . ($r['truck'] !== '' ? " ({$r['truck']})" : '') : '';
  }
  if ($k === 'void_payment') {
    $r = q1('SELECT cp.amount, c.name, cp.pay_date FROM customer_payments cp JOIN customers c ON c.id = cp.customer_id WHERE cp.id = ?', [$tid]);
    return $r ? 'إلغاء تحصيل ' . fmtn($r['amount']) . " من {$r['name']} بتاريخ {$r['pay_date']}" : '';
  }
  return '';
}

$FN['request_change'] = function (array $p) {
  _need(null);
  lock_all();
  $k = _t($p, 'kind');
  if (!in_array($k, ['void_sale', 'edit_sale', 'stock_adjust', 'delete_shipment', 'void_payment'], true)) fail('نوع الطلب غير صحيح');
  $tid = _i($p, 'target_id');
  if (qv("SELECT 1 FROM change_requests WHERE kind = ? AND target_id <=> ? AND status = 'pending'", [$k, $tid])) fail('فيه طلب على نفس الحاجة لسه مستني موافقة المدير');
  $pl = is_array($p['payload'] ?? null) ? $p['payload'] : [];
  $rid = ins('INSERT INTO change_requests(kind, target_id, payload, summary, details, reason, requested_by) VALUES (?,?,?,?,?,?,?)',
    [$k, $tid, jenc((object)$pl), _t($p, 'summary'), _change_details($k, $tid, $pl), _t($p, 'reason'), uid()]);
  return ['id' => $rid];
};

$FN['decide_change'] = function (array $p) {
  global $FN;
  _need('approve');
  lock_all();
  $r = q1('SELECT * FROM change_requests WHERE id = ?', [_i($p, 'id')]);
  if (!$r) fail('الطلب غير موجود');
  if ($r['status'] !== 'pending') fail('الطلب ده اتراجع قبل كده');
  $ok = _b($p, 'approve') ?? false;
  if ($ok) {
    $pl = jdec($r['payload']);
    $GLOBALS['APPROVED_RUN'] = true;
    $GLOBALS['REQ_BY'] = $r['requested_by'];
    try {
      switch ($r['kind']) {
        case 'void_sale': $FN['void_sale'](array_merge($pl, ['id' => $r['target_id'], 'reason' => $r['reason']])); break;
        case 'edit_sale': $FN['edit_sale'](array_merge($pl, ['id' => $r['target_id'], 'reason' => $r['reason']])); break;
        case 'stock_adjust': $FN['stock_adjust'](array_merge($pl, ['shipment_item_id' => $r['target_id']])); break;
        case 'delete_shipment': $FN['delete_shipment'](['id' => $r['target_id']]); break;
        case 'void_payment': $FN['void_payment'](['id' => $r['target_id']]); break;
      }
    } finally { $GLOBALS['APPROVED_RUN'] = false; $GLOBALS['REQ_BY'] = null; }
  }
  ex('UPDATE change_requests SET status = ?, decided_by = ?, decided_at = NOW(6), decide_note = ? WHERE id = ?',
    [$ok ? 'approved' : 'rejected', uid(), _t($p, 'note'), $r['id']]);
  return ['ok' => true];
};

$FN['list_requests'] = function (array $p) {
  _need(null);
  $st = _t($p, 'status') !== '' ? _t($p, 'status') : 'pending';
  $rows = q("SELECT * FROM change_requests WHERE (? = 'all' OR status = ?) AND (? OR requested_by = ?) ORDER BY id DESC LIMIT 200",
    [$st, $st, (int)_has('approve'), uid()]);
  foreach ($rows as &$r) {
    $r['payload'] = (object)jdec($r['payload']); $r['details'] = $r['details'] ?? '';
    $r['by'] = _uname($r['requested_by']); $r['decided_by_name'] = _uname($r['decided_by']);
  }
  return $rows;
};

$FN['edit_settlement'] = function (array $p) {
  _need_any(['settlements', 'approve']);
  lock_all();
  $s = q1('SELECT * FROM settlements WHERE id = ?', [_i($p, 'id')]);
  if (!$s) fail('الفاتورة غير موجودة');
  if (!in_array($s['status'], ['pending', 'approved'], true)) fail('الفاتورة دي اتصرفت أو اترفضت ومينفعش تتعدل');
  $pct = _n($p, 'commission_pct', $s['commission_pct']);
  if ($pct < 0 || $pct > 100) fail('نسبة العمولة غير صحيحة');
  $comm = r2($s['gross_sales'] * $pct / 100);
  $fr = _n($p, 'freight', $s['freight']); $un = _n($p, 'unloading', $s['unloading']); $oth = _n($p, 'other_expenses', $s['other_expenses']);
  $net = r2($s['gross_sales'] - $comm - $fr - $un - $oth);
  $adv = $s['advance_deducted'];
  if (array_key_exists('advance_deducted', $p)) {
    if (!_has('approve')) fail('الخصم من العهدة لدى العميل للمدير بس');
    $want = _n($p, 'advance_deducted');
    if ($want < 0) fail('المبلغ غير صحيح');
    $avail = _advance_balance((int)$s['supplier_id']) + $s['advance_deducted'];
    if ($want > $avail + 1e-9) fail('العهدة لدى العميل فيها ' . fmtn($avail) . ' بس');
    if ($want > $net + 1e-9) fail('الخصم أكبر من صافي الفاتورة');
    $adv = r2($want);
  }
  $boss = _has('approve');
  ex('UPDATE settlements SET commission_pct = ?, commission_amount = ?, freight = ?, unloading = ?, other_expenses = ?, other_label = ?, notes = ?,
        net_amount = ?, advance_deducted = ?, status = ?, decided_by = IF(?, decided_by, NULL), decided_at = IF(?, decided_at, NULL) WHERE id = ?', [
    $pct, $comm, $fr, $un, $oth,
    has_key($p, 'other_label') ? (string)$p['other_label'] : $s['other_label'],
    has_key($p, 'notes') ? (string)$p['notes'] : $s['notes'],
    $net, $adv,
    // لو المحاسب عدّل بعد موافقة المدير، ترجع تستنى موافقة تاني
    $boss ? $s['status'] : 'pending', (int)$boss, (int)$boss,
    $s['id'],
  ]);
  return _get_settlement((int)$s['id']);
};

// ---------------------------------------------------------------- سجل التعديلات والحذف (ظاهر للكل)
$FN['list_changes'] = function (array $p) {
  _need(null);
  $d1 = _d($p, 'from', date('Y-m-d', strtotime('-6 day'))); $d2 = _d($p, 'to');
  $rows = q("SELECT * FROM activity_log WHERE at >= ? AND at < ? + INTERVAL 1 DAY ORDER BY id DESC LIMIT 500", [$d1, $d2]);
  foreach ($rows as &$r) {
    $r['by'] = _uname($r['user_id']); $r['requested_by_name'] = _uname($r['requested_by']); $r['seen_by_name'] = _uname($r['seen_by']);
    $r['by_admin'] = (bool)qv("SELECT role = 'admin' FROM profiles WHERE id = ?", [$r['user_id']]);
    unset($r['user_id'], $r['requested_by'], $r['seen_by']);
  }
  return ['from' => $d1, 'to' => $d2, 'rows' => $rows];
};
// المدير بيعلّم إنه شاف اللي المحاسبين عدلوه أو حذفوه
$FN['mark_changes_seen'] = function (array $p) {
  _need('approve');
  ex('UPDATE activity_log SET seen_by = ?, seen_at = NOW(6) WHERE seen_at IS NULL', [uid()]);
  return ['ok' => true];
};
