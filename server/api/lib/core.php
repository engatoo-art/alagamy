<?php
// الأساسيات: الاتصال بقاعدة البيانات، تحويل الأرقام والتواريخ، الصلاحيات، والدخول
declare(strict_types=1);

date_default_timezone_set('Africa/Cairo');

class AppError extends Exception {}

/** رسالة خطأ للمستخدم (زي raise exception في النسخة القديمة) */
function fail(string $msg): void { throw new AppError($msg); }

// ------------------------------------------------------------------ قاعدة البيانات
function db(): PDO {
  static $pdo = null;
  if ($pdo) return $pdo;
  $c = app_config();
  $dsn = "mysql:host={$c['db_host']};port=" . ($c['db_port'] ?? 3306) . ";dbname={$c['db_name']};charset=utf8mb4";
  $pdo = new PDO($dsn, $c['db_user'], $c['db_pass'], [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES => false,
    PDO::ATTR_STRINGIFY_FETCHES => false,
  ]);
  // كل التواريخ والأوقات بتوقيت القاهرة (بالتوقيت الصيفي)
  $off = (new DateTime('now', new DateTimeZone('Africa/Cairo')))->format('P');
  $pdo->exec("SET time_zone = '$off'");
  $pdo->exec("SET SESSION sql_mode = 'STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'");
  return $pdo;
}

function app_config(): array {
  static $c = null;
  if ($c) return $c;
  $f = __DIR__ . '/../config.php';
  if (!file_exists($f)) fail('البرنامج لسه متسطبش — افتح install.php');
  $c = require $f;
  return $c;
}

/** بيحوّل القيم حسب نوع العمود: الفلوس أرقام، النعم/لا true/false، والأوقات ISO بتوقيت القاهرة */
function cast_rows(PDOStatement $st, array $rows): array {
  if (!$rows) return $rows;
  $types = [];
  for ($i = 0; $i < $st->columnCount(); $i++) {
    $m = $st->getColumnMeta($i);
    $types[$m['name']] = strtoupper($m['native_type'] ?? '');
  }
  foreach ($rows as &$r) {
    foreach ($r as $k => &$v) {
      if ($v === null) continue;
      switch ($types[$k] ?? '') {
        case 'NEWDECIMAL': case 'DECIMAL': case 'DOUBLE': case 'FLOAT': $v = (float)$v; break;
        case 'TINY': $v = (bool)$v; break;
        case 'LONG': case 'LONGLONG': case 'SHORT': case 'INT24': $v = (int)$v; break;
        case 'DATETIME': case 'TIMESTAMP': $v = iso_ts((string)$v); break;
      }
    }
  }
  return $rows;
}

function iso_ts(?string $v): ?string {
  if ($v === null || $v === '') return null;
  return (new DateTime($v, new DateTimeZone('Africa/Cairo')))->format('Y-m-d\TH:i:sP');
}

function q(string $sql, array $args = []): array {
  $st = db()->prepare($sql);
  $st->execute($args);
  return cast_rows($st, $st->fetchAll());
}
function q1(string $sql, array $args = []): ?array { $r = q($sql, $args); return $r[0] ?? null; }
function qv(string $sql, array $args = []) { $r = q1($sql, $args); return $r ? reset($r) : null; }
function ex(string $sql, array $args = []): int { $st = db()->prepare($sql); $st->execute($args); return $st->rowCount(); }
function ins(string $sql, array $args = []): int { ex($sql, $args); return (int)db()->lastInsertId(); }

/** قفل المحل: أي عملية بتغيّر بيانات بتستنى اللي قبلها */
function lock_all(): void { db()->query('SELECT id FROM app_lock WHERE id = 1 FOR UPDATE')->fetchAll(); }

function today(): string { return (new DateTime('now', new DateTimeZone('Africa/Cairo')))->format('Y-m-d'); }
function now_sql(): string { return (new DateTime('now', new DateTimeZone('Africa/Cairo')))->format('Y-m-d H:i:s'); }
function uuid4(): string {
  $b = random_bytes(16);
  $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
  $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
  return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
}
function r2($x): float { return round((float)$x, 2); }
function jenc($v): string { return json_encode($v, JSON_UNESCAPED_UNICODE); }
function jdec(?string $s, $default = []) { if ($s === null || $s === '') return $default; $v = json_decode($s, true); return $v ?? $default; }

// ------------------------------------------------------------------ قراءة المدخلات
function _t(array $p, string $k): string { $v = $p[$k] ?? ''; return is_scalar($v) ? trim((string)$v) : ''; }
function _n(array $p, string $k, $d = 0): float {
  $v = $p[$k] ?? null;
  if ($v === null || (is_string($v) && trim($v) === '')) return (float)$d;
  if (!is_numeric(is_string($v) ? trim($v) : $v)) fail("القيمة \"$k\" لازم تكون رقم");
  return (float)$v;
}
function _i(array $p, string $k): ?int {
  $v = $p[$k] ?? null;
  if ($v === null || (is_string($v) && trim($v) === '')) return null;
  if (!is_numeric($v)) fail("القيمة \"$k\" لازم تكون رقم");
  return (int)$v;
}
function _d(array $p, string $k, ?string $d = null): string {
  $v = _t($p, $k);
  if ($v === '') return $d ?? today();
  $dt = DateTime::createFromFormat('Y-m-d', substr($v, 0, 10));
  if (!$dt) fail('التاريخ مكتوب غلط');
  return $dt->format('Y-m-d');
}
function _b(array $p, string $k, ?bool $d = null): ?bool {
  if (!array_key_exists($k, $p) || $p[$k] === null || $p[$k] === '') return $d;
  $v = $p[$k];
  if (is_bool($v)) return $v;
  return in_array(strtolower((string)$v), ['1', 'true', 'yes', 'on', 't'], true);
}
function has_key(array $p, string $k): bool { return array_key_exists($k, $p) && $p[$k] !== null; }

// ------------------------------------------------------------------ الصلاحيات
$GLOBALS['ME'] = null;            // الحساب اللي داخل
$GLOBALS['APPROVED_RUN'] = false; // بتبقى true بس وإحنا بننفذ طلب وافق عليه المدير

function uid(): ?string { return $GLOBALS['ME']['id'] ?? null; }
function me(): array { return $GLOBALS['ME'] ?? []; }

function reload_me(): void {
  if (!uid()) return;
  $GLOBALS['ME'] = q1('SELECT * FROM profiles WHERE id = ?', [uid()]);
}

function _has(string $perm): bool {
  $m = me();
  if (!$m || !$m['active']) return false;
  if ($m['role'] === 'admin') return true;
  $perms = jdec($m['perms'] ?? '{}');
  return !empty($perms[$perm]);
}

function _need(?string $perm = null): void {
  if (!uid()) fail('لازم تسجل دخول الأول');
  if (!me()['active']) fail('حسابك لسه مش متفعل — كلم المدير');
  if ($perm !== null && !_has($perm) && !$GLOBALS['APPROVED_RUN']) fail('مش عندك صلاحية للعملية دي');
}

function _need_any(array $perms): void {
  _need(null);
  if ($GLOBALS['APPROVED_RUN']) return;
  foreach ($perms as $x) if (_has($x)) return;
  fail('مش عندك صلاحية للعملية دي');
}

function _need_admin(): void {
  _need(null);
  if (me()['role'] !== 'admin') fail('العملية دي للمدير بس');
}

function _uname(?string $id): ?string {
  if (!$id) return null;
  static $cache = [];
  if (!array_key_exists($id, $cache)) {
    $r = q1('SELECT full_name, username FROM profiles WHERE id = ?', [$id]);
    $cache[$id] = $r ? ($r['full_name'] !== '' ? $r['full_name'] : $r['username']) : null;
  }
  return $cache[$id];
}

/** الحساب للعرض: من غير كلمة السر */
function profile_out(array $r): array {
  unset($r['password_hash'], $r['was_active']);
  $r['perms'] = (object)jdec($r['perms'] ?? '{}');
  return $r;
}

// ------------------------------------------------------------------ حسابات مشتركة
function _customer_balance(int $cid): float {
  return r2(
    (float)qv('SELECT COALESCE(SUM(grand_total - paid_amount), 0) FROM sales WHERE customer_id = ? AND NOT voided', [$cid])
    - (float)qv('SELECT COALESCE(SUM(amount), 0) FROM customer_payments WHERE customer_id = ? AND NOT voided', [$cid])
    - (float)qv("SELECT COALESCE(SUM(amount), 0) FROM crate_returns WHERE customer_id = ? AND method = 'account'", [$cid])
  );
}

function _customer_crates(int $cid): array {
  return q("SELECT ct.id AS crate_type_id, ct.name, ct.deposit, CAST(g.cnt AS SIGNED) AS count
    FROM (
      SELECT crate_type_id, SUM(given) - SUM(ret) AS cnt FROM (
        SELECT l.crate_type_id, l.crates AS given, 0 AS ret
          FROM sale_lines l JOIN sales s ON s.id = l.sale_id
         WHERE s.customer_id = ? AND NOT s.voided AND l.crates > 0 AND l.deposit_unit > 0
        UNION ALL
        SELECT crate_type_id, 0, count FROM crate_returns WHERE customer_id = ?
      ) x GROUP BY crate_type_id HAVING SUM(given) - SUM(ret) <> 0
    ) g JOIN crate_types ct ON ct.id = g.crate_type_id ORDER BY ct.name", [$cid, $cid]);
}

function _cash_balance(string $upto = '2999-12-31'): float {
  return r2(qv("SELECT COALESCE(SUM(CASE WHEN direction = 'in' THEN amount ELSE -amount END), 0) FROM cash_movements WHERE mv_date <= ?", [$upto]));
}

function _open_shift_for_me(): ?int {
  $sh = q1("SELECT * FROM cash_shifts WHERE status = 'open' LIMIT 1");
  if (!$sh) {
    if (_has('approve')) return null;
    fail('مفيش عهدة مفتوحة — افتح عهدتك الأول من صفحة العهدة');
  }
  if ($sh['user_id'] !== uid() && !_has('approve')) {
    fail('العهدة مفتوحة دلوقتي باسم ' . _uname($sh['user_id']) . ' — لازم تتقفل الأول وبعدين تفتح عهدتك');
  }
  return (int)$sh['id'];
}

/** حركة فلوس في الدرج — بتتسجل على العهدة المفتوحة */
function _cash(string $dir, $amt, string $cat, ?string $descr, ?string $party, ?string $rtype, ?int $rid, ?string $d = null): void {
  $amt = (float)$amt;
  if ($amt <= 0) return;
  $sid = _open_shift_for_me();
  ins('INSERT INTO cash_movements(mv_date, direction, amount, category, description, party, ref_type, ref_id, created_by, shift_id)
       VALUES (?,?,?,?,?,?,?,?,?,?)',
    [$d ?? today(), $dir, r2($amt), $cat, $descr ?? '', $party ?? '', $rtype ?? '', $rid, uid(), $sid]);
}

function _shipitem_sold(int $siid): float {
  return (float)qv('SELECT COALESCE(SUM(l.qty), 0) FROM sale_lines l JOIN sales s ON s.id = l.sale_id WHERE l.shipment_item_id = ? AND NOT s.voided', [$siid]);
}

/** بيبني IN (?,?,?) */
function in_list(array $vals): string { return $vals ? implode(',', array_fill(0, count($vals), '?')) : 'NULL'; }
