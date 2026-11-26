<?php
// الدرج والعهد
declare(strict_types=1);

$FN['add_cash'] = function (array $p) {
  _need('cash');
  lock_all();
  $dir = _t($p, 'direction'); $cat = _t($p, 'category'); $amt = r2(_n($p, 'amount'));
  if (!in_array($dir, ['in', 'out'], true)) fail('اختار وارد أو منصرف');
  if ($dir === 'in' && !in_array($cat, ['funding', 'other_in'], true)) fail('نوع الوارد غير صحيح');
  if ($dir === 'out' && !in_array($cat, ['transport', 'bill', 'withdrawal', 'salary', 'other_out'], true)) fail('نوع المصروف غير صحيح');
  if ($amt <= 0) fail('اكتب المبلغ');
  if (_t($p, 'description') === '') fail('اكتب البيان');
  $mid = ins("INSERT INTO cash_movements(mv_date, direction, amount, category, description, party, ref_type, created_by, shift_id) VALUES (?,?,?,?,?,?,'manual',?,?)",
    [today(), $dir, $amt, $cat, _t($p, 'description'), _t($p, 'party'), uid(), _open_shift_for_me()]);
  $m = q1('SELECT * FROM cash_movements WHERE id = ?', [$mid]);
  $m['by'] = _uname($m['created_by']);
  return ['id' => $mid, 'balance' => _cash_balance(today()), 'movement' => $m];
};

function _by_category(string $where, array $args): array {
  return q("SELECT direction, category, SUM(amount) total, COUNT(*) count FROM cash_movements WHERE $where GROUP BY direction, category ORDER BY direction, total DESC", $args);
}
function _movements(string $where, array $args, bool $party = true): array {
  $rows = q("SELECT m.id, m.mv_date AS date, DATE_FORMAT(m.created_at, '%H:%i') AS time, m.direction, m.amount, m.category, m.description,
      m.party, m.ref_type, m.ref_id, m.created_by FROM cash_movements m WHERE $where ORDER BY m.created_at, m.id", $args);
  foreach ($rows as &$r) { $r['by'] = _uname($r['created_by']); unset($r['created_by']); if (!$party) unset($r['party']); }
  return $rows;
}

$FN['cash_day'] = function (array $p) {
  _need_any(['cash', 'reports']);
  $d1 = _d($p, 'from', _d($p, 'date')); $d2 = _d($p, 'to', _d($p, 'date'));
  return [
    'from' => $d1, 'to' => $d2,
    'opening' => _cash_balance(date('Y-m-d', strtotime($d1 . ' -1 day'))),
    'closing' => _cash_balance($d2),
    'total_in' => (float)qv("SELECT COALESCE(SUM(amount), 0) FROM cash_movements WHERE direction = 'in' AND mv_date BETWEEN ? AND ?", [$d1, $d2]),
    'total_out' => (float)qv("SELECT COALESCE(SUM(amount), 0) FROM cash_movements WHERE direction = 'out' AND mv_date BETWEEN ? AND ?", [$d1, $d2]),
    'by_category' => _by_category('mv_date BETWEEN ? AND ?', [$d1, $d2]),
    'movements' => _movements('m.mv_date BETWEEN ? AND ?', [$d1, $d2]),
  ];
};

function _shift_json(?int $sid): ?array {
  if (!$sid) return null;
  $sh = q1('SELECT * FROM cash_shifts WHERE id = ?', [$sid]);
  if (!$sh) return null;
  $agg = q1("SELECT COALESCE(SUM(CASE WHEN direction = 'in' AND category <> 'shift_over' THEN amount END), 0) li,
                    COALESCE(SUM(CASE WHEN direction = 'out' AND category <> 'shift_short' THEN amount END), 0) lo, COUNT(*) c
             FROM cash_movements WHERE shift_id = ?", [$sid]);
  return $sh + [
    'user_name' => _uname($sh['user_id']), 'closed_by_name' => _uname($sh['closed_by']),
    'prev_user_name' => _uname($sh['prev_user_id']), 'reset_by_name' => _uname($sh['reset_by']),
    'live_in' => (float)$agg['li'], 'live_out' => (float)$agg['lo'], 'count' => (int)$agg['c'],
  ];
}

$FN['current_shift'] = function (array $p) {
  _need(null);
  $sid = qv("SELECT id FROM cash_shifts WHERE status = 'open' LIMIT 1");
  $last = qv("SELECT id FROM cash_shifts WHERE status = 'closed' ORDER BY closed_at DESC, id DESC LIMIT 1");
  $sh = $sid ? _shift_json((int)$sid) : null;
  return ['shift' => $sh, 'last' => $last ? _shift_json((int)$last) : null, 'cash_balance' => _cash_balance(), 'mine' => $sh !== null && $sh['user_id'] === uid()];
};

function _reset_drawer(string $note): float {
  $bal = _cash_balance();
  if (abs($bal) < 0.005) return 0.0;
  $last = q1("SELECT * FROM cash_shifts WHERE status = 'closed' ORDER BY closed_at DESC, id DESC LIMIT 1");
  ins("INSERT INTO cash_movements(mv_date, direction, amount, category, description, ref_type, ref_id, created_by, shift_id) VALUES (?,?,?,'drawer_reset',?,'shift',?,?,NULL)", [
    today(), $bal > 0 ? 'out' : 'in', abs($bal),
    'تصفير الدرج بواسطة ' . _uname(uid()) . ($last ? ' بعد عهدة ' . _uname($last['user_id']) : '') . ' — كان المفروض فيه ' . fmtn($bal) . ($note !== '' ? ' — ' . $note : ''),
    $last['id'] ?? null, uid(),
  ]);
  return $bal;
}

$FN['reset_drawer'] = function (array $p) {
  _need_admin();
  lock_all();
  if (qv("SELECT 1 FROM cash_shifts WHERE status = 'open'")) fail('فيه عهدة مفتوحة — اقفلها الأول وبعدين صفّر الدرج');
  $bal = _reset_drawer(_t($p, 'notes'));
  return ['reset' => $bal, 'cash_balance' => _cash_balance()];
};

$FN['open_shift'] = function (array $p) {
  _need_any(['sales', 'cash', 'collections', 'payouts']);
  lock_all();
  $open = q1("SELECT user_id FROM cash_shifts WHERE status = 'open' LIMIT 1");
  if ($open) fail('فيه عهدة مفتوحة باسم ' . _uname($open['user_id']) . ' — لازم تتقفل الأول');
  // المحاسب مايقدرش يصفّر: لازم يستلم نفس الفلوس اللي اتقفلت بيها العهدة اللي قبله
  $zero = _b($p, 'zero') ?? false;
  $reset = 0.0;
  if ($zero) { _need_admin(); $reset = _reset_drawer(_t($p, 'notes')); }
  $last = q1("SELECT * FROM cash_shifts WHERE status = 'closed' ORDER BY closed_at DESC, id DESC LIMIT 1");
  $sid = ins('INSERT INTO cash_shifts(user_id, opening_amount, notes, prev_shift_id, prev_user_id, prev_difference, reset_amount, reset_by) VALUES (?,?,?,?,?,?,?,?)',
    [uid(), _cash_balance(), _t($p, 'notes'), $last['id'] ?? null, $last['user_id'] ?? null, $last['difference'] ?? 0, $reset, ($reset != 0 || $zero) ? uid() : null]);
  return _shift_json($sid);
};

function _shift_report(?int $sid): array {
  $r = _shift_json($sid);
  if (!$r) fail('العهدة غير موجودة');
  if ($r['user_id'] !== uid() && !_has('cash') && !_has('reports')) fail('مش عندك صلاحية تشوف عهدة محاسب تاني');
  return $r + [
    'by_category' => _by_category('shift_id = ?', [$sid]),
    'movements' => _movements('m.shift_id = ?', [$sid], false),
    'settings' => q1('SELECT * FROM shop_settings WHERE id = 1'),
  ];
}
$FN['shift_report'] = function (array $p) { _need(null); return _shift_report(_i($p, 'id')); };

$FN['close_shift'] = function (array $p) {
  _need(null);
  lock_all();
  $sh = q1("SELECT * FROM cash_shifts WHERE status = 'open' LIMIT 1");
  if (!$sh) fail('مفيش عهدة مفتوحة');
  if ($sh['user_id'] !== uid() && !_has('approve')) fail('العهدة دي باسم ' . _uname($sh['user_id']) . ' — هو أو المدير بس اللي يقفلها');
  $t = q1("SELECT COALESCE(SUM(CASE WHEN direction = 'in' THEN amount END), 0) tin, COALESCE(SUM(CASE WHEN direction = 'out' THEN amount END), 0) tout
           FROM cash_movements WHERE shift_id = ?", [$sh['id']]);
  $expected = r2($sh['opening_amount'] + $t['tin'] - $t['tout']);
  $counted = _t($p, 'counted') === '' ? $expected : r2(_n($p, 'counted'));
  if ($counted < 0) fail('المبلغ الفعلي مينفعش يبقى بالسالب');
  $diff = r2($counted - $expected);
  // العجز أو الزيادة بيتسجلوا علشان رصيد العهدة الجديدة يبقى نفس الفلوس اللي اتسلّمت فعلًا
  if ($diff < 0) {
    ins("INSERT INTO cash_movements(mv_date, direction, amount, category, description, ref_type, ref_id, created_by, shift_id) VALUES (?,'out',?,'shift_short',?,'shift',?,?,?)",
      [today(), -$diff, 'عجز في عهدة ' . _uname($sh['user_id']), $sh['id'], uid(), $sh['id']]);
  } elseif ($diff > 0) {
    ins("INSERT INTO cash_movements(mv_date, direction, amount, category, description, ref_type, ref_id, created_by, shift_id) VALUES (?,'in',?,'shift_over',?,'shift',?,?,?)",
      [today(), $diff, 'زيادة في عهدة ' . _uname($sh['user_id']), $sh['id'], uid(), $sh['id']]);
  }
  ex("UPDATE cash_shifts SET status = 'closed', closed_at = NOW(6), closed_by = ?, total_in = ?, total_out = ?, expected_amount = ?,
        counted_amount = ?, difference = ?, notes = IF(? <> '', ?, notes) WHERE id = ?",
    [uid(), $t['tin'], $t['tout'], $expected, $counted, $diff, _t($p, 'notes'), _t($p, 'notes'), $sh['id']]);
  return _shift_report((int)$sh['id']);
};

$FN['list_shifts'] = function (array $p) {
  _need(null);
  $all = _has('cash') || _has('reports');
  $rows = q('SELECT id FROM cash_shifts WHERE DATE(opened_at) BETWEEN ? AND ? AND (user_id = ? OR ?) ORDER BY opened_at DESC, id DESC',
    [_d($p, 'from', date('Y-m-d', strtotime(today() . ' -30 day'))), _d($p, 'to'), uid(), (int)$all]);
  return array_map(fn($r) => _shift_json((int)$r['id']), $rows);
};
