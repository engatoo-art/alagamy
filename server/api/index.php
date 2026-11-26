<?php
// نقطة الدخول الوحيدة للبرنامج: api/?fn=اسم_العملية
declare(strict_types=1);
ini_set('display_errors', '0');

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header('Cache-Control: no-store');

require __DIR__ . '/lib/core.php';
$FN = [];
foreach (glob(__DIR__ . '/fn/*.php') as $f) require $f;

const SESSION_DAYS = 30;

function out(int $code, array $body): void {
  http_response_code($code);
  echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION | JSON_INVALID_UTF8_SUBSTITUTE);
  exit;
}

function client_ip(): string { return substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 64); }

function bearer(): string {
  $h = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
  if (!$h && function_exists('apache_request_headers')) { $hs = array_change_key_case(apache_request_headers()); $h = $hs['authorization'] ?? ''; }
  if (!$h) $h = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? '';
  return preg_match('/^(?:Bearer\s+)?([a-f0-9]{64})$/i', trim($h), $m) ? strtolower($m[1]) : '';
}

function new_session(string $uid): string {
  $tok = bin2hex(random_bytes(32));
  ex('INSERT INTO sessions(token_hash, user_id, expires_at, ip) VALUES (?,?, NOW() + INTERVAL ' . SESSION_DAYS . ' DAY, ?)', [hash('sha256', $tok), $uid, client_ip()]);
  return $tok;
}

try {
  if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') out(405, ['error' => 'POST بس']);
  $fn = preg_replace('/[^a-z_]/', '', (string)($_GET['fn'] ?? ''));
  $raw = file_get_contents('php://input') ?: '{}';
  if (strlen($raw) > 8 * 1024 * 1024) out(413, ['error' => 'البيانات كبيرة قوي']);
  $body = json_decode($raw, true);
  if (!is_array($body)) $body = [];
  $p = is_array($body['p'] ?? null) ? $body['p'] : [];

  // ------------------------------------------------ عمليات من غير دخول
  if ($fn === 'setup_needed') out(200, ['data' => $FN['setup_needed']([])]);

  if ($fn === 'login') {
    $u = strtolower(trim((string)($body['username'] ?? '')));
    $pw = (string)($body['password'] ?? '');
    if ($u === '' || $pw === '') out(400, ['error' => 'اكتب اسم المستخدم وكلمة المرور']);
    // حماية من التخمين: 10 محاولات غلط من نفس الجهاز أو 8 على نفس الاسم في ربع ساعة
    ex('DELETE FROM login_attempts WHERE at < NOW() - INTERVAL 1 DAY');
    $byIp = (int)qv('SELECT COUNT(*) FROM login_attempts WHERE ip = ? AND at > NOW() - INTERVAL 15 MINUTE', [client_ip()]);
    $byUser = (int)qv('SELECT COUNT(*) FROM login_attempts WHERE username = ? AND at > NOW() - INTERVAL 15 MINUTE', [$u]);
    if ($byIp >= 10 || $byUser >= 8) out(429, ['error' => 'محاولات كتير غلط — استنى ربع ساعة وحاول تاني']);
    $r = q1('SELECT * FROM profiles WHERE username = ? AND purged_at IS NULL', [$u]);
    if (!$r || $r['password_hash'] === '' || !password_verify($pw, $r['password_hash'])) {
      ex('INSERT INTO login_attempts(ip, username) VALUES (?,?)', [client_ip(), $u]);
      out(401, ['error' => $r && $r['password_hash'] === '' && !$r['deleted_at'] ? 'لازم المدير يعملك كلمة سر جديدة الأول' : 'اسم المستخدم أو كلمة المرور غلط']);
    }
    if ($r['deleted_at']) out(403, ['error' => 'الحساب ده محذوف — كلم المدير']);
    if (password_needs_rehash($r['password_hash'], PASSWORD_BCRYPT)) ex('UPDATE profiles SET password_hash = ? WHERE id = ?', [password_hash($pw, PASSWORD_BCRYPT), $r['id']]);
    ex('DELETE FROM login_attempts WHERE username = ?', [$u]);
    ex('DELETE FROM sessions WHERE expires_at < NOW()');
    out(200, ['data' => ['token' => new_session($r['id']), 'user' => ['id' => $r['id']]]]);
  }

  // أول حساب في البرنامج (المدير) — بيشتغل مرة واحدة بس
  if ($fn === 'setup') {
    db()->beginTransaction();
    lock_all();
    if (qv('SELECT 1 FROM profiles LIMIT 1')) { db()->rollBack(); out(403, ['error' => 'إنشاء الحسابات مقفول — المدير بس اللي يعمل حسابات من الإعدادات']); }
    $u = _check_username((string)($body['username'] ?? ''));
    _check_password((string)($body['password'] ?? ''));
    $id = uuid4();
    ex("INSERT INTO profiles(id, username, password_hash, full_name, role, active, perms) VALUES (?,?,?,?, 'admin', 1, '{}')",
      [$id, $u, password_hash((string)$body['password'], PASSWORD_BCRYPT), trim((string)($body['full_name'] ?? ''))]);
    $tok = new_session($id);
    db()->commit();
    out(200, ['data' => ['token' => $tok, 'user' => ['id' => $id]]]);
  }

  // ------------------------------------------------ لازم دخول
  $tok = bearer();
  $sess = $tok ? q1('SELECT * FROM sessions WHERE token_hash = ? AND expires_at > NOW()', [hash('sha256', $tok)]) : null;
  if (!$sess) out(401, ['error' => 'انتهت الجلسة، سجّل دخول تاني', 'code' => 'auth']);
  $GLOBALS['TOKEN_HASH'] = $sess['token_hash'];
  $GLOBALS['ME'] = q1('SELECT * FROM profiles WHERE id = ?', [$sess['user_id']]);
  if (!$GLOBALS['ME'] || $GLOBALS['ME']['purged_at']) out(401, ['error' => 'انتهت الجلسة، سجّل دخول تاني', 'code' => 'auth']);

  if ($fn === 'logout') { ex('DELETE FROM sessions WHERE token_hash = ?', [$sess['token_hash']]); out(200, ['data' => ['ok' => true]]); }

  // الجلسة بتتجدد طول ما البرنامج بيستخدم
  if (strtotime($sess['expires_at']) - time() < (SESSION_DAYS - 1) * 86400) {
    ex('UPDATE sessions SET expires_at = NOW() + INTERVAL ' . SESSION_DAYS . ' DAY WHERE token_hash = ?', [$sess['token_hash']]);
  }

  if (!isset($FN[$fn])) out(404, ['error' => 'العملية دي مش موجودة']);
  db()->beginTransaction();
  $res = $FN[$fn]($p);
  db()->commit();
  out(200, ['data' => $res]);
} catch (AppError $e) {
  if (db_started()) db()->rollBack();
  out(400, ['error' => $e->getMessage()]);
} catch (Throwable $e) {
  if (db_started()) db()->rollBack();
  error_log('[alagamy] ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
  $msg = $e instanceof PDOException ? 'حصلت مشكلة في قاعدة البيانات — حاول تاني' : 'حصلت مشكلة في السيرفر — حاول تاني';
  if (getenv('ALAGAMY_DEBUG')) $msg .= ' (' . $e->getMessage() . ')';
  out(500, ['error' => $msg]);
}

function db_started(): bool {
  try { return db()->inTransaction(); } catch (Throwable $e) { return false; }
}
