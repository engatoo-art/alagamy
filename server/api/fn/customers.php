<?php
// الزباين: الحسابات، الكشف، التحصيل، مرتجع الصناديق
declare(strict_types=1);

function like(string $s): string { return '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $s) . '%'; }

$FN['list_customers'] = function (array $p) {
  _need(null);
  $q = like(_t($p, 'search'));
  $rows = q('SELECT * FROM customers c WHERE (c.name LIKE ? OR c.phone LIKE ?) AND (? OR c.active) ORDER BY c.name',
    [$q, $q, (int)(_b($p, 'include_inactive') ?? false)]);
  $out = [];
  foreach ($rows as $c) {
    $bal = _customer_balance((int)$c['id']);
    if ((_b($p, 'only_debt') ?? false) && abs($bal) < 0.005) continue;
    $out[] = [
      'id' => $c['id'], 'name' => $c['name'], 'phone' => $c['phone'], 'address' => $c['address'], 'notes' => $c['notes'],
      'credit_approved' => $c['credit_approved'], 'credit_requested' => $c['credit_requested'],
      'credit_limit' => $c['credit_limit'], 'active' => $c['active'],
      'balance' => $bal, 'crates' => _customer_crates((int)$c['id']),
    ];
  }
  usort($out, fn($a, $b) => strcmp($a['name'], $b['name']));
  return $out;
};

$FN['save_customer'] = function (array $p) {
  $can = _has('approve');
  _need_any(['customers', 'sales']);
  if (_t($p, 'name') === '') fail('اكتب اسم الزبون');
  $id = _i($p, 'id');
  if ($id === null) {
    $id = ins('INSERT INTO customers(name, phone, address, notes, guarantor, credit_approved, credit_limit, credit_requested) VALUES (?,?,?,?,?,?,?,?)', [
      _t($p, 'name'), _t($p, 'phone'), _t($p, 'address'), _t($p, 'notes'), _t($p, 'guarantor'),
      $can ? (int)(_b($p, 'credit_approved') ?? false) : 0,
      $can ? _n($p, 'credit_limit') : 0,
      $can ? 0 : (int)(_b($p, 'credit_requested') ?? false),
    ]);
  } else {
    $c = q1('SELECT * FROM customers WHERE id = ?', [$id]);
    if (!$c) return null;
    ex('UPDATE customers SET name = ?, phone = ?, address = ?, notes = ?, guarantor = ?, active = ?,
          credit_approved = ?, credit_limit = ?, credit_requested = ? WHERE id = ?', [
      _t($p, 'name'), _t($p, 'phone'), _t($p, 'address'), _t($p, 'notes'),
      has_key($p, 'guarantor') ? (string)$p['guarantor'] : $c['guarantor'],
      (int)(_b($p, 'active') ?? $c['active']),
      $can ? (int)(_b($p, 'credit_approved') ?? $c['credit_approved']) : (int)$c['credit_approved'],
      $can ? _n($p, 'credit_limit', $c['credit_limit']) : $c['credit_limit'],
      $can ? 0 : (int)(_b($p, 'credit_requested') ?? $c['credit_requested']),
      $id,
    ]);
  }
  return q1('SELECT * FROM customers WHERE id = ?', [$id]);
};

function _sale_lines_json(int $saleId): array {
  return q('SELECT i.name AS item, l.unit, l.qty, l.weight, l.price, l.amount, l.crates, ct.name AS crate, l.deposit_amount AS deposit
    FROM sale_lines l JOIN items i ON i.id = l.item_id LEFT JOIN crate_types ct ON ct.id = l.crate_type_id
    WHERE l.sale_id = ? ORDER BY l.id', [$saleId]);
}

$FN['customer_statement'] = function (array $p) {
  _need(null);
  $cid = _i($p, 'id');
  $c = $cid ? q1('SELECT * FROM customers WHERE id = ?', [$cid]) : null;
  if (!$c) fail('الزبون غير موجود');
  $d1 = _d($p, 'from', '2000-01-01');
  $d2 = _d($p, 'to');
  $rows = q("SELECT * FROM (
      SELECT s.sale_date AS dt, s.created_at AS ts, 'sale' AS kind, s.id AS ref_id, s.sale_no AS ref_no,
             CASE WHEN s.payment_type = 'cash' THEN 'فاتورة بيع نقدي' ELSE 'فاتورة بيع آجل' END AS descr,
             s.grand_total AS debit, s.paid_amount AS credit, CAST(0 AS DECIMAL(14,2)) AS info, s.approval_status AS status
        FROM sales s WHERE s.customer_id = ? AND NOT s.voided
      UNION ALL
      SELECT pay_date, created_at, 'payment', id, id, CONCAT('دفعة نقدية', IF(notes <> '', CONCAT(' — ', notes), '')),
             0, amount, 0, '' FROM customer_payments WHERE customer_id = ? AND NOT voided
      UNION ALL
      SELECT r.return_date, r.created_at, 'crates', r.id, r.id,
             CONCAT('مرتجع ', r.count, ' ', ct.name, IF(r.method = 'cash', ' (رد رهن نقدي)', ' (خصم من الحساب)')),
             0, IF(r.method = 'account', r.amount, 0), IF(r.method = 'cash', r.amount, 0), ''
        FROM crate_returns r JOIN crate_types ct ON ct.id = r.crate_type_id WHERE r.customer_id = ?
    ) u ORDER BY dt, ts, kind, ref_id", [$cid, $cid, $cid]);
  $opening = 0.0; $run = 0.0; $ents = []; $td = 0.0; $tc = 0.0;
  foreach ($rows as $r) if ($r['dt'] < $d1) $opening += (float)$r['debit'] - (float)$r['credit'];
  $run = $opening;
  foreach ($rows as $r) {
    if ($r['dt'] < $d1 || $r['dt'] > $d2) continue;
    $run += (float)$r['debit'] - (float)$r['credit'];
    $td += (float)$r['debit']; $tc += (float)$r['credit'];
    $ents[] = [
      'date' => $r['dt'], 'kind' => $r['kind'], 'ref_id' => (int)$r['ref_id'], 'ref_no' => $r['ref_no'] === null ? null : (int)$r['ref_no'],
      'description' => $r['descr'], 'debit' => (float)$r['debit'], 'credit' => (float)$r['credit'], 'info' => (float)$r['info'],
      'status' => $r['status'], 'balance' => r2($run),
      'lines' => $r['kind'] === 'sale' ? _sale_lines_json((int)$r['ref_id']) : null,
    ];
  }
  return [
    'customer' => $c, 'balance' => _customer_balance($cid), 'crates' => _customer_crates($cid),
    'from' => $d1, 'to' => $d2, 'opening' => r2($opening), 'entries' => $ents,
    'totals' => ['debit' => r2($td), 'credit' => r2($tc)],
  ];
};

$FN['add_payment'] = function (array $p) {
  _need('collections');
  lock_all();
  $cid = _i($p, 'customer_id');
  $amt = r2(_n($p, 'amount'));
  $c = $cid ? q1('SELECT * FROM customers WHERE id = ?', [$cid]) : null;
  if (!$c) fail('اختار الزبون');
  if ($amt <= 0) fail('اكتب المبلغ');
  $pid = ins('INSERT INTO customer_payments(pay_date, customer_id, amount, notes, created_by) VALUES (?,?,?,?,?)', [today(), $cid, $amt, _t($p, 'notes'), uid()]);
  _cash('in', $amt, 'collection', 'تحصيل من ' . $c['name'] . (_t($p, 'notes') !== '' ? ' — ' . _t($p, 'notes') : ''), $c['name'], 'payment', $pid);
  return ['id' => $pid, 'amount' => $amt, 'customer' => $c['name'], 'balance' => _customer_balance($cid), 'date' => today(), 'by' => _uname(uid())];
};

function _void_payment(array $r, string $reason, string $why = 'حذف'): void {
  ex('UPDATE customer_payments SET voided = 1 WHERE id = ?', [$r['id']]);
  _reverse_movements(q("SELECT * FROM cash_movements WHERE ref_type = 'payment' AND ref_id = ?", [$r['id']]),
    'payment_void', $why . ' تحصيل رقم ' . $r['id'], $reason);
}

// حذف تحصيل: الفلوس مش بتتجمع، والمبلغ بيرجع على حساب الزبون — بس بيفضل ظاهر إنه اتحذف
$FN['void_payment'] = function (array $p) {
  _need_any(['approve', 'collections']);
  lock_all();
  $r = q1('SELECT * FROM customer_payments WHERE id = ?', [_i($p, 'id')]);
  if (!$r || $r['voided']) fail('التحصيل غير موجود أو اتحذف قبل كده');
  _need_change($r['created_by'], $r['created_at']);
  if (_t($p, 'reason') === '' && empty($GLOBALS['APPROVED_RUN'])) fail('اكتب سبب الحذف');
  _void_payment($r, _t($p, 'reason'));
  $c = qv('SELECT name FROM customers WHERE id = ?', [$r['customer_id']]);
  _log('void', 'payment', (int)$r['id'], 'حذف تحصيل من ' . $c . ' — ' . fmtn($r['amount']), $r['amount'], _t($p, 'reason'));
  return ['ok' => true, 'balance' => _customer_balance((int)$r['customer_id'])];
};

// تعديل مبلغ تحصيل: القديم بيتعلم إنه اتعدل ويتسجل الجديد مكانه
$FN['edit_payment'] = function (array $p) {
  _need_any(['approve', 'collections']);
  lock_all();
  $r = q1('SELECT * FROM customer_payments WHERE id = ?', [_i($p, 'id')]);
  if (!$r || $r['voided']) fail('التحصيل غير موجود أو اتحذف قبل كده');
  _need_change($r['created_by'], $r['created_at']);
  $amt = r2(_n($p, 'amount'));
  if ($amt <= 0) fail('اكتب المبلغ');
  if (_t($p, 'reason') === '') fail('اكتب سبب التعديل');
  $c = q1('SELECT * FROM customers WHERE id = ?', [$r['customer_id']]);
  _void_payment($r, 'اتعدل: ' . _t($p, 'reason'), 'تعديل');
  $notes = has_key($p, 'notes') ? _t($p, 'notes') : $r['notes'];
  $pid = ins('INSERT INTO customer_payments(pay_date, customer_id, amount, notes, created_by) VALUES (?,?,?,?,?)', [today(), $c['id'], $amt, $notes, uid()]);
  _cash('in', $amt, 'collection', 'تحصيل من ' . $c['name'] . ($notes !== '' ? ' — ' . $notes : '') . ' (بعد التعديل)', $c['name'], 'payment', $pid);
  _log('edit', 'payment', $pid, 'تعديل تحصيل من ' . $c['name'] . ' — ' . fmtn($r['amount']) . ' ← ' . fmtn($amt), $amt - $r['amount'], _t($p, 'reason'));
  return ['ok' => true, 'id' => $pid, 'balance' => _customer_balance((int)$c['id'])];
};

$FN['return_crates'] = function (array $p) {
  _need('collections');
  lock_all();
  $cid = _i($p, 'customer_id'); $ctid = _i($p, 'crate_type_id'); $cnt = _i($p, 'count') ?? 0;
  $meth = _t($p, 'method') !== '' ? _t($p, 'method') : 'account';
  $c = $cid ? q1('SELECT * FROM customers WHERE id = ?', [$cid]) : null;
  if (!$c) fail('اختار الزبون');
  $ct = $ctid ? q1('SELECT * FROM crate_types WHERE id = ?', [$ctid]) : null;
  if (!$ct) fail('اختار نوع الصندوق');
  if ($cnt <= 0) fail('اكتب عدد الصناديق');
  if (!in_array($meth, ['cash', 'account'], true)) fail('طريقة رد الرهن غير صحيحة');
  $outstanding = 0;
  foreach (_customer_crates($cid) as $x) if ((int)$x['crate_type_id'] === $ctid) $outstanding = (int)$x['count'];
  if ($outstanding < $cnt) fail("الزبون عليه $outstanding صندوق بس من النوع ده");
  $amt = r2($cnt * (float)$ct['deposit']);
  $rid = ins('INSERT INTO crate_returns(return_date, customer_id, crate_type_id, count, unit_deposit, amount, method, notes, created_by) VALUES (?,?,?,?,?,?,?,?,?)',
    [today(), $cid, $ctid, $cnt, $ct['deposit'], $amt, $meth, _t($p, 'notes'), uid()]);
  if ($meth === 'cash') _cash('out', $amt, 'crate_refund', "رد رهن $cnt {$ct['name']} — {$c['name']}", $c['name'], 'crate_return', $rid);
  return ['id' => $rid, 'amount' => $amt, 'count' => $cnt, 'crate' => $ct['name'], 'method' => $meth,
          'customer' => $c['name'], 'balance' => _customer_balance($cid), 'crates' => _customer_crates($cid),
          'date' => today(), 'by' => _uname(uid())];
};
