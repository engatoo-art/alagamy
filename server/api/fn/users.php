<?php
// المستخدمين، الإعدادات، الأصناف، الصناديق
declare(strict_types=1);

$FN['setup_needed'] = function (array $p) {
  return !qv('SELECT 1 FROM profiles LIMIT 1');
};

$FN['app_bootstrap'] = function (array $p) {
  if (!uid()) fail('لازم تسجل دخول الأول');
  $me = profile_out(me());
  if (!me()['active']) return ['me' => $me];
  _purge_deleted();
  return [
    'me' => $me,
    'settings' => q1('SELECT * FROM shop_settings WHERE id = 1'),
    'crate_types' => q('SELECT * FROM crate_types ORDER BY deposit DESC, name'),
    'items' => q('SELECT * FROM items ORDER BY name'),
  ];
};

function _purge_deleted(): void {
  $rows = q("SELECT * FROM profiles WHERE deleted_at IS NOT NULL AND purged_at IS NULL AND deleted_at < NOW(6) - INTERVAL 7 DAY");
  foreach ($rows as $r) {
    ex('DELETE FROM sessions WHERE user_id = ?', [$r['id']]);
    // اسم الدخول بيتحرر علشان ينفع يتعمل بيه حساب جديد، والاسم الحقيقي بيفضل في الفواتير القديمة
    ex("UPDATE profiles SET purged_at = NOW(6), active = 0, perms = '{}', password_hash = '',
          full_name = IF(full_name = '', username, full_name), username = ? WHERE id = ?",
      ['deleted-' . substr(str_replace('-', '', $r['id']), 0, 10), $r['id']]);
  }
}

$FN['list_users'] = function (array $p) {
  _need('users');
  _purge_deleted();
  $rows = q('SELECT * FROM profiles WHERE purged_at IS NULL ORDER BY created_at');
  $now = time();
  return array_map(function ($u) use ($now) {
    $o = profile_out($u);
    $o['deleted_by_name'] = _uname($u['deleted_by']);
    $o['days_left'] = $u['deleted_at'] ? max(0, (int)ceil((strtotime($u['deleted_at']) + 7 * 86400 - $now) / 86400)) : null;
    return $o;
  }, $rows);
};

function _check_username(string $u): string {
  $u = strtolower(trim($u));
  if (!preg_match('/^[a-z0-9_.]{3,30}$/', $u)) fail('اسم المستخدم لازم يكون بالإنجليزي (حروف وأرقام) ومن 3 حروف على الأقل');
  return $u;
}
function _check_password(string $pw): void {
  if (mb_strlen($pw) < 8) fail('كلمة المرور لازم تكون 8 حروف أو أرقام على الأقل');
}

// المدير بيعمل حساب جديد (الحساب بيبدأ موقوف لحد ما المدير يحدد صلاحياته ويفعّله)
$FN['create_user'] = function (array $p) {
  _need_admin();
  $u = _check_username(_t($p, 'username'));
  _check_password((string)($p['password'] ?? ''));
  if (qv('SELECT 1 FROM profiles WHERE username = ?', [$u])) fail('اسم المستخدم ده موجود قبل كده، اختار اسم تاني');
  $id = uuid4();
  ex('INSERT INTO profiles(id, username, password_hash, full_name, role, active, perms) VALUES (?,?,?,?,?,0,?)',
    [$id, $u, password_hash((string)$p['password'], PASSWORD_BCRYPT), _t($p, 'full_name'), 'accountant', '{}']);
  return ['id' => $id];
};

$FN['admin_set_password'] = function (array $p) {
  _need_admin();
  $id = _t($p, 'id');
  $r = q1('SELECT * FROM profiles WHERE id = ? AND purged_at IS NULL', [$id]);
  if (!$r) fail('الحساب غير موجود');
  if ($id === uid()) fail('كلمة السر بتاعتك غيّرها من "حسابي"');
  _check_password((string)($p['password'] ?? ''));
  ex('UPDATE profiles SET password_hash = ? WHERE id = ?', [password_hash((string)$p['password'], PASSWORD_BCRYPT), $id]);
  ex('DELETE FROM sessions WHERE user_id = ?', [$id]);
  return ['ok' => true, 'username' => $r['username']];
};

$FN['change_my_password'] = function (array $p) {
  _need(null);
  _check_password((string)($p['password'] ?? ''));
  ex('UPDATE profiles SET password_hash = ? WHERE id = ?', [password_hash((string)$p['password'], PASSWORD_BCRYPT), uid()]);
  // بيخرج من كل الأجهزة التانية ويفضل داخل على الجهاز ده
  ex('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?', [uid(), $GLOBALS['TOKEN_HASH'] ?? '']);
  return ['ok' => true];
};

$FN['delete_user'] = function (array $p) {
  _need_admin();
  $id = _t($p, 'id');
  $r = q1('SELECT * FROM profiles WHERE id = ? AND purged_at IS NULL', [$id]);
  if (!$r) fail('الحساب غير موجود');
  if ($id === uid()) fail('مينفعش تحذف حسابك انت');
  if ($r['role'] === 'admin') fail('ده حساب مدير — غيّره لمحاسب الأول لو عاوز تحذفه');
  if ($r['deleted_at']) fail('الحساب ده محذوف بالفعل');
  if (qv("SELECT 1 FROM cash_shifts WHERE user_id = ? AND status = 'open'", [$id])) {
    fail('المحاسب ده عهدته مفتوحة — اقفلها الأول من صفحة العهدة وبعدين احذفه');
  }
  ex('UPDATE profiles SET was_active = active, active = 0, deleted_at = NOW(6), deleted_by = ? WHERE id = ?', [uid(), $id]);
  ex('DELETE FROM sessions WHERE user_id = ?', [$id]);
  return ['ok' => true, 'restore_until' => iso_ts(date('Y-m-d H:i:s', time() + 7 * 86400))];
};

$FN['restore_user'] = function (array $p) {
  _need_admin();
  _purge_deleted();
  $id = _t($p, 'id');
  $r = q1('SELECT * FROM profiles WHERE id = ?', [$id]);
  if (!$r || !$r['deleted_at']) fail('الحساب ده مش محذوف');
  if ($r['purged_at']) fail('عدّى أكتر من 7 أيام والحساب اتمسح نهائي — اعمله حساب جديد');
  ex('UPDATE profiles SET active = COALESCE(was_active, 1), deleted_at = NULL, deleted_by = NULL, was_active = NULL WHERE id = ?', [$id]);
  return ['ok' => true];
};

$FN['save_user'] = function (array $p) {
  _need_admin();
  $id = _t($p, 'id');
  $role = has_key($p, 'role') ? (string)$p['role'] : null;
  if ($role !== null && !in_array($role, ['admin', 'accountant'], true)) fail('نوع الحساب غلط');
  if (qv('SELECT 1 FROM profiles WHERE id = ? AND deleted_at IS NOT NULL', [$id])) fail('الحساب ده محذوف — استرجعه الأول');
  $r = q1('SELECT * FROM profiles WHERE id = ?', [$id]);
  if (!$r) fail('المستخدم غير موجود');
  $active = _b($p, 'active');
  if ($id === uid() && (($role ?? $r['role']) !== 'admin' || $active === false)) fail('مينفعش تشيل صلاحية المدير أو توقف حسابك انت');
  $email = has_key($p, 'email') ? strtolower(trim((string)$p['email'])) : null;
  if ($email !== null && $email !== '' && !preg_match('/^[^@\s]+@[^@\s]+\.[^@\s]+$/u', $email)) fail('الإيميل مكتوب غلط');
  foreach (['phone', 'whatsapp'] as $k) {
    if (has_key($p, $k) && !preg_match('/^([0-9]{8,15})?$/', preg_replace('/[^0-9]/', '', (string)$p[$k]))) fail('رقم الموبايل أو الواتساب مكتوب غلط');
  }
  $clean = fn($k) => has_key($p, $k) ? preg_replace('/[^0-9+]/', '', (string)$p[$k]) : null;
  ex('UPDATE profiles SET full_name = COALESCE(?, full_name), email = COALESCE(?, email), phone = COALESCE(?, phone),
        whatsapp = COALESCE(?, whatsapp), role = COALESCE(?, role), active = COALESCE(?, active), perms = COALESCE(?, perms) WHERE id = ?',
    [has_key($p, 'full_name') ? (string)$p['full_name'] : null, $email, $clean('phone'), $clean('whatsapp'), $role,
     $active === null ? null : (int)$active, has_key($p, 'perms') ? jenc((object)$p['perms']) : null, $id]);
  if ($active === false) ex('DELETE FROM sessions WHERE user_id = ?', [$id]);
  return profile_out(q1('SELECT * FROM profiles WHERE id = ?', [$id]));
};

// ---------------------------------------------------------------- الإعدادات
$FN['save_settings'] = function (array $p) {
  _need('settings');
  $s = q1('SELECT * FROM shop_settings WHERE id = 1');
  ex('UPDATE shop_settings SET shop_name = ?, phone = ?, address = ?, default_commission = ?, receipt_footer = ?, invoice_title = ?, updated_at = NOW(6) WHERE id = 1', [
    _t($p, 'shop_name') !== '' ? _t($p, 'shop_name') : $s['shop_name'],
    has_key($p, 'phone') ? (string)$p['phone'] : $s['phone'],
    has_key($p, 'address') ? (string)$p['address'] : $s['address'],
    _n($p, 'default_commission', $s['default_commission']),
    has_key($p, 'receipt_footer') ? (string)$p['receipt_footer'] : $s['receipt_footer'],
    _t($p, 'invoice_title') !== '' ? _t($p, 'invoice_title') : $s['invoice_title'],
  ]);
  return q1('SELECT * FROM shop_settings WHERE id = 1');
};

$FN['save_crate_type'] = function (array $p) {
  _need('settings');
  if (_t($p, 'name') === '') fail('اكتب اسم الصندوق');
  $id = _i($p, 'id');
  if ($id === null) {
    if (qv('SELECT 1 FROM crate_types WHERE name = ?', [_t($p, 'name')])) fail('فيه صندوق بنفس الاسم');
    $id = ins('INSERT INTO crate_types(name, deposit, active) VALUES (?,?,?)', [_t($p, 'name'), _n($p, 'deposit'), (int)(_b($p, 'active') ?? true)]);
  } else {
    $a = _b($p, 'active');
    ex('UPDATE crate_types SET name = ?, deposit = ?, active = COALESCE(?, active) WHERE id = ?', [_t($p, 'name'), _n($p, 'deposit'), $a === null ? null : (int)$a, $id]);
  }
  return q1('SELECT * FROM crate_types WHERE id = ?', [$id]);
};

$FN['save_item'] = function (array $p) {
  _need_any(['settings', 'suppliers', 'sales']);
  if (_t($p, 'name') === '') fail('اكتب اسم الصنف');
  $unit = _t($p, 'default_unit') !== '' ? _t($p, 'default_unit') : 'kg';
  if (!in_array($unit, ['kg', 'count'], true)) fail('الوحدة غلط');
  $id = _i($p, 'id');
  if ($id === null) {
    $old = qv('SELECT id FROM items WHERE name = ?', [_t($p, 'name')]);
    if ($old) { ex('UPDATE items SET active = 1 WHERE id = ?', [$old]); $id = (int)$old; }
    else $id = ins('INSERT INTO items(name, default_unit) VALUES (?,?)', [_t($p, 'name'), $unit]);
  } else {
    $a = _b($p, 'active');
    ex('UPDATE items SET name = ?, default_unit = ?, active = COALESCE(?, active) WHERE id = ?', [_t($p, 'name'), $unit, $a === null ? null : (int)$a, $id]);
  }
  return q1('SELECT * FROM items WHERE id = ?', [$id]);
};
