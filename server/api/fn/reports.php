<?php
// التقارير والرئيسية والنسخة الاحتياطية
declare(strict_types=1);

function _sum_by(array $rows, string $key, array $fields, ?callable $extra = null): array {
  $g = [];
  foreach ($rows as $r) {
    $k = (string)$r[$key];
    if (!isset($g[$k])) { $g[$k] = [$key => $r[$key]]; foreach ($fields as $f) $g[$k][$f] = 0.0; $g[$k]['_set'] = []; $g[$k]['_inv'] = []; }
    foreach ($fields as $f) $g[$k][$f] += (float)$r[$f];
    if ($extra) $extra($g[$k], $r);
  }
  return $g;
}

$FN['report_sales_detail'] = function (array $p) {
  _need('reports');
  $d1 = _d($p, 'from'); $d2 = _d($p, 'to'); $q = like(_t($p, 'search'));
  $lines = q("SELECT s.id sale_id, s.sale_no, s.sale_date, DATE_FORMAT(s.created_at, '%H:%i') tm,
      COALESCE(c.name, NULLIF(s.customer_name, ''), 'زبون نقدي') customer, s.payment_type,
      i.name item, su.name supplier, l.unit, l.qty, l.weight, l.price, l.amount, l.crates
    FROM sale_lines l JOIN sales s ON s.id = l.sale_id JOIN items i ON i.id = l.item_id
    LEFT JOIN customers c ON c.id = s.customer_id
    LEFT JOIN shipment_items si ON si.id = l.shipment_item_id LEFT JOIN shipments sh ON sh.id = si.shipment_id
    LEFT JOIN suppliers su ON su.id = sh.supplier_id
    WHERE NOT s.voided AND s.sale_date BETWEEN ? AND ?
      AND (i.name LIKE ? OR COALESCE(c.name, s.customer_name, '') LIKE ? OR COALESCE(su.name, '') LIKE ?)
    ORDER BY i.name, s.sale_date, s.sale_no", [$d1, $d2, $q, $q, $q]);
  $byItem = _sum_by($lines, 'item', ['qty', 'weight', 'amount'], function (&$g, $r) { $g['_set'][$r['customer']] = 1; });
  $byItem = array_map(fn($g) => ['item' => $g['item'], 'qty' => $g['qty'], 'weight' => $g['weight'], 'amount' => r2($g['amount']), 'customers' => count($g['_set']),
    'avg' => $g['weight'] > 0 ? r2($g['amount'] / $g['weight']) : ($g['qty'] > 0 ? r2($g['amount'] / $g['qty']) : 0)], array_values($byItem));
  usort($byItem, fn($a, $b) => $b['amount'] <=> $a['amount']);
  $byCust = _sum_by($lines, 'customer', ['qty', 'weight', 'amount'], function (&$g, $r) { $g['_inv'][$r['sale_id']] = 1; });
  $byCust = array_map(fn($g) => ['customer' => $g['customer'], 'qty' => $g['qty'], 'weight' => $g['weight'], 'amount' => r2($g['amount']), 'invoices' => count($g['_inv'])], array_values($byCust));
  usort($byCust, fn($a, $b) => $b['amount'] <=> $a['amount']);
  return ['from' => $d1, 'to' => $d2, 'lines' => $lines, 'by_item' => $byItem, 'by_customer' => $byCust, 'totals' => [
    'qty' => array_sum(array_column($lines, 'qty')), 'weight' => array_sum(array_column($lines, 'weight')), 'amount' => r2(array_sum(array_column($lines, 'amount'))),
    'invoices' => count(array_unique(array_column($lines, 'sale_id'))), 'customers' => count(array_unique(array_column($lines, 'customer'))),
  ]];
};

$FN['report_money'] = function (array $p) {
  _need_any(['reports', 'cash', 'collections']);
  $d1 = _d($p, 'from'); $d2 = _d($p, 'to'); $dir = _t($p, 'direction') !== '' ? _t($p, 'direction') : 'in';
  $w = 'direction = ? AND mv_date BETWEEN ? AND ?'; $a = [$dir, $d1, $d2];
  $mv = q("SELECT m.mv_date AS date, DATE_FORMAT(m.created_at, '%H:%i') AS time, m.amount, m.category, m.description, m.party, m.ref_type, m.ref_id, m.created_by
    FROM cash_movements m WHERE m.$w ORDER BY m.mv_date, m.created_at", $a);
  foreach ($mv as &$m) { $m['by'] = _uname($m['created_by']); unset($m['created_by']); }
  return ['from' => $d1, 'to' => $d2, 'direction' => $dir, 'movements' => $mv,
    'by_party' => q("SELECT COALESCE(NULLIF(party, ''), 'بدون اسم') party, COUNT(*) count, SUM(amount) total FROM cash_movements WHERE $w GROUP BY 1 ORDER BY total DESC", $a),
    'by_category' => q("SELECT category, COUNT(*) count, SUM(amount) total FROM cash_movements WHERE $w GROUP BY category ORDER BY total DESC", $a),
    'by_day' => q("SELECT mv_date AS date, COUNT(*) count, SUM(amount) total FROM cash_movements WHERE $w GROUP BY mv_date ORDER BY mv_date", $a),
    'total' => (float)qv("SELECT COALESCE(SUM(amount), 0) FROM cash_movements WHERE $w", $a),
    'count' => (int)qv("SELECT COUNT(*) FROM cash_movements WHERE $w", $a)];
};

function _all_balances(): array {
  $b = [];
  foreach (q('SELECT customer_id id, SUM(grand_total - paid_amount) v FROM sales WHERE NOT voided AND customer_id IS NOT NULL GROUP BY customer_id') as $r) $b[$r['id']] = ($b[$r['id']] ?? 0) + $r['v'];
  foreach (q('SELECT customer_id id, SUM(amount) v FROM customer_payments WHERE NOT voided GROUP BY customer_id') as $r) $b[$r['id']] = ($b[$r['id']] ?? 0) - $r['v'];
  foreach (q("SELECT customer_id id, SUM(amount) v FROM crate_returns WHERE method = 'account' GROUP BY customer_id") as $r) $b[$r['id']] = ($b[$r['id']] ?? 0) - $r['v'];
  return array_map(fn($v) => r2($v), $b);
}

$FN['dashboard'] = function (array $p) {
  _need(null);
  $d = today();
  $s = q1("SELECT COUNT(*) n, COALESCE(SUM(grand_total), 0) t, COALESCE(SUM(CASE WHEN payment_type = 'cash' THEN grand_total END), 0) cash,
                  COALESCE(SUM(CASE WHEN payment_type = 'credit' THEN grand_total - paid_amount END), 0) credit FROM sales WHERE sale_date = ? AND NOT voided", [$d]);
  $pos = array_filter(_all_balances(), fn($v) => $v > 0);
  $pending = 0;
  if (_has('approve')) {
    $pending = (int)qv("SELECT COUNT(*) FROM sales WHERE approval_status = 'pending' AND NOT voided")
      + (int)qv("SELECT COUNT(*) FROM settlements WHERE status = 'pending'")
      + (int)qv('SELECT COUNT(*) FROM customers WHERE credit_requested AND NOT credit_approved')
      + (_has('users') ? (int)qv('SELECT COUNT(*) FROM profiles WHERE NOT active AND deleted_at IS NULL AND purged_at IS NULL') : 0)
      + (int)qv("SELECT COUNT(*) FROM change_requests WHERE status = 'pending'");
  }
  $week = [];
  $wk = [];
  foreach (q('SELECT sale_date, SUM(grand_total) t FROM sales WHERE sale_date BETWEEN ? AND ? AND NOT voided GROUP BY sale_date', [date('Y-m-d', strtotime("$d -6 day")), $d]) as $r) $wk[$r['sale_date']] = $r['t'];
  for ($i = 6; $i >= 0; $i--) { $x = date('Y-m-d', strtotime("$d -$i day")); $week[] = ['date' => $x, 'total' => (float)($wk[$x] ?? 0)]; }
  return [
    'today' => $d, 'sales_count' => (int)$s['n'], 'sales_total' => (float)$s['t'], 'cash_sales' => (float)$s['cash'], 'credit_sales' => (float)$s['credit'],
    'collections' => (float)qv('SELECT COALESCE(SUM(amount), 0) FROM customer_payments WHERE pay_date = ? AND NOT voided', [$d]),
    'cash_in' => (float)qv("SELECT COALESCE(SUM(amount), 0) FROM cash_movements WHERE mv_date = ? AND direction = 'in'", [$d]),
    'cash_out' => (float)qv("SELECT COALESCE(SUM(amount), 0) FROM cash_movements WHERE mv_date = ? AND direction = 'out'", [$d]),
    'cash_balance' => (_has('cash') || _has('reports')) ? _cash_balance($d) : null,
    'total_debts' => r2(array_sum($pos)), 'debtors' => count($pos),
    'open_shipments' => (int)qv('SELECT COUNT(*) FROM shipments WHERE settlement_id IS NULL'),
    'crates_out' => (int)qv('SELECT COALESCE(SUM(l.crates), 0) FROM sale_lines l JOIN sales s ON s.id = l.sale_id WHERE NOT s.voided AND l.deposit_unit > 0 AND s.customer_id IS NOT NULL')
                  - (int)qv('SELECT COALESCE(SUM(count), 0) FROM crate_returns'),
    'pending' => $pending,
    'to_pay' => (float)qv("SELECT COALESCE(SUM(net_amount), 0) FROM settlements WHERE status = 'approved'"),
    'week' => $week,
    'recent' => q("SELECT s.id, s.sale_no, COALESCE(c.name, NULLIF(s.customer_name, ''), 'زبون نقدي') customer, s.grand_total, s.payment_type, s.approval_status,
        DATE_FORMAT(s.created_at, '%H:%i') time FROM sales s LEFT JOIN customers c ON c.id = s.customer_id WHERE NOT s.voided ORDER BY s.id DESC LIMIT 8"),
  ];
};

$FN['report_period'] = function (array $p) {
  global $FN;
  _need('reports');
  $d1 = _d($p, 'from'); $d2 = _d($p, 'to');
  $cash = $FN['cash_day'](['from' => $d1, 'to' => $d2]); unset($cash['movements']);
  $days = [];
  $span = (strtotime($d2) - strtotime($d1)) / 86400;
  if ($span >= 0 && $span <= 62) {
    $sd = []; foreach (q('SELECT sale_date d, SUM(grand_total) t FROM sales WHERE sale_date BETWEEN ? AND ? AND NOT voided GROUP BY sale_date', [$d1, $d2]) as $r) $sd[$r['d']] = $r['t'];
    $ci = []; $co = [];
    foreach (q('SELECT mv_date d, direction, SUM(amount) t FROM cash_movements WHERE mv_date BETWEEN ? AND ? GROUP BY mv_date, direction', [$d1, $d2]) as $r) {
      if ($r['direction'] === 'in') $ci[$r['d']] = $r['t']; else $co[$r['d']] = $r['t'];
    }
    $closing = _cash_balance(date('Y-m-d', strtotime("$d1 -1 day")));
    for ($t = strtotime($d1); $t <= strtotime($d2); $t += 86400) {
      $x = date('Y-m-d', $t);
      $closing = r2($closing + ($ci[$x] ?? 0) - ($co[$x] ?? 0));
      $days[] = ['date' => $x, 'sales' => (float)($sd[$x] ?? 0), 'cash_in' => (float)($ci[$x] ?? 0), 'cash_out' => (float)($co[$x] ?? 0), 'closing' => $closing];
    }
  }
  return [
    'from' => $d1, 'to' => $d2,
    'sales' => q1("SELECT COUNT(*) count, COALESCE(SUM(goods_total), 0) goods, COALESCE(SUM(deposit_total), 0) deposits, COALESCE(SUM(discount), 0) discount,
        COALESCE(SUM(grand_total), 0) total, COALESCE(SUM(CASE WHEN payment_type = 'cash' THEN grand_total END), 0) cash,
        COALESCE(SUM(CASE WHEN payment_type = 'credit' THEN grand_total - paid_amount END), 0) credit,
        COALESCE(SUM(CASE WHEN payment_type = 'credit' THEN paid_amount END), 0) credit_paid
      FROM sales WHERE sale_date BETWEEN ? AND ? AND NOT voided", [$d1, $d2]),
    'voided' => (int)qv('SELECT COUNT(*) FROM sales WHERE sale_date BETWEEN ? AND ? AND voided', [$d1, $d2]),
    'collections' => (float)qv('SELECT COALESCE(SUM(amount), 0) FROM customer_payments WHERE pay_date BETWEEN ? AND ? AND NOT voided', [$d1, $d2]),
    'crate_returns' => q1("SELECT CAST(COALESCE(SUM(count), 0) AS SIGNED) count, COALESCE(SUM(CASE WHEN method = 'cash' THEN amount END), 0) cash,
        COALESCE(SUM(CASE WHEN method = 'account' THEN amount END), 0) account FROM crate_returns WHERE return_date BETWEEN ? AND ?", [$d1, $d2]),
    'commission' => q1("SELECT COUNT(*) count, COALESCE(SUM(gross_sales), 0) gross, COALESCE(SUM(commission_amount), 0) commission, COALESCE(SUM(net_amount), 0) net
        FROM settlements WHERE status IN ('approved', 'paid') AND DATE(COALESCE(decided_at, created_at)) BETWEEN ? AND ?", [$d1, $d2]),
    'supplier_paid' => (float)qv("SELECT COALESCE(SUM(amount), 0) FROM cash_movements WHERE category = 'supplier_payment' AND mv_date BETWEEN ? AND ?", [$d1, $d2]),
    'cash' => $cash,
    'expenses' => q("SELECT category, SUM(amount) total FROM cash_movements WHERE direction = 'out' AND category IN ('transport', 'bill', 'salary', 'other_out', 'withdrawal')
        AND mv_date BETWEEN ? AND ? GROUP BY category ORDER BY total DESC", [$d1, $d2]),
    'items' => q('SELECT i.name item, SUM(l.qty) qty, SUM(l.weight) weight, SUM(l.amount) amount FROM sale_lines l JOIN sales s ON s.id = l.sale_id
        JOIN items i ON i.id = l.item_id WHERE s.sale_date BETWEEN ? AND ? AND NOT s.voided GROUP BY i.name ORDER BY amount DESC', [$d1, $d2]),
    'customers' => q("SELECT COALESCE(c.name, 'زبون نقدي') customer, COUNT(*) count, SUM(s.grand_total) total FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
        WHERE s.sale_date BETWEEN ? AND ? AND NOT s.voided GROUP BY COALESCE(c.name, 'زبون نقدي') ORDER BY total DESC LIMIT 15", [$d1, $d2]),
    'days' => $days,
  ];
};

$FN['report_debts'] = function (array $p) {
  _need_any(['reports', 'collections', 'customers']);
  $bals = _all_balances();
  $out = [];
  foreach (q('SELECT id, name, phone, credit_limit FROM customers') as $c) {
    $bal = $bals[$c['id']] ?? 0.0;
    $crates = _customer_crates((int)$c['id']);
    if (abs($bal) < 0.005 && !$crates) continue;
    $out[] = $c + ['balance' => $bal, 'crates' => $crates,
      'last_payment' => qv('SELECT MAX(pay_date) FROM customer_payments WHERE customer_id = ? AND NOT voided', [$c['id']]),
      'last_sale' => qv('SELECT MAX(sale_date) FROM sales WHERE customer_id = ? AND NOT voided', [$c['id']])];
  }
  usort($out, fn($a, $b) => $b['balance'] <=> $a['balance']);
  return $out;
};

$FN['export_all'] = function (array $p) {
  _need('backup');
  $all = fn($t) => q("SELECT * FROM $t ORDER BY id");
  $bals = _all_balances();
  $users = array_map(function ($u) { unset($u['password_hash'], $u['was_active']); $u['perms'] = (object)jdec($u['perms']); return $u; }, q('SELECT * FROM profiles ORDER BY created_at'));
  $setts = array_map(function ($s) { unset($s['details']); return $s; }, $all('settlements'));
  $reqs = array_map(function ($r) { $r['payload'] = (object)jdec($r['payload']); return $r; }, $all('change_requests'));
  $shifts = array_map(fn($s) => $s + ['user_name' => _uname($s['user_id'])], $all('cash_shifts'));
  return [
    'exported_at' => iso_ts(now_sql()), 'source' => 'mysql',
    'shop_settings' => q('SELECT * FROM shop_settings'), 'users' => $users,
    'crate_types' => $all('crate_types'), 'items' => $all('items'),
    'customers' => array_map(fn($c) => $c + ['balance' => $bals[$c['id']] ?? 0.0], $all('customers')),
    'suppliers' => $all('suppliers'), 'shipments' => $all('shipments'), 'shipment_items' => $all('shipment_items'),
    'sales' => $all('sales'), 'sale_lines' => $all('sale_lines'), 'customer_payments' => $all('customer_payments'),
    'crate_returns' => $all('crate_returns'), 'settlements' => $setts, 'cash_movements' => $all('cash_movements'),
    'supplier_advances' => $all('supplier_advances'), 'change_requests' => $reqs, 'cash_shifts' => $shifts,
  ];
};
