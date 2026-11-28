<?php
// برنامج تسطيب العجمي على الاستضافة — بيشتغل مرة واحدة وبعدها بيقفل نفسه
declare(strict_types=1);
ini_set('display_errors', '0');
require __DIR__ . '/lib/core.php';
require __DIR__ . '/lib/import.php';
$FN = [];
require __DIR__ . '/fn/users.php';

$lock = __DIR__ . '/lib/installed.lock';
$cfgFile = __DIR__ . '/config.php';
$msg = ''; $ok = false; $done = [];

function h($s): string { return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); }

$realHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
// على نفس الجهاز (localhost) كلمة السر مش بتخرج برا الجهاز، فمسموح من غير https
$isLocal = in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true)
  && in_array(strtolower(preg_replace('/:\d+$/', '', $_SERVER['HTTP_HOST'] ?? '')), ['localhost', '127.0.0.1', '[::1]'], true);
$https = $realHttps || $isLocal || getenv('ALAGAMY_ALLOW_HTTP');
$phpOk = version_compare(PHP_VERSION, '8.0.0', '>=');
$extOk = extension_loaded('pdo_mysql');

if (file_exists($lock)) {
  $msg = 'البرنامج متسطب بالفعل. علشان الأمان امسح ملف install.php من الاستضافة.';
} elseif ($_SERVER['REQUEST_METHOD'] === 'POST' && $phpOk && $extOk && $https) {
  try {
    $cfg = [
      'db_host' => trim($_POST['db_host'] ?? 'localhost') ?: 'localhost',
      'db_port' => (int)($_POST['db_port'] ?? 3306) ?: 3306,
      'db_name' => trim($_POST['db_name'] ?? ''),
      'db_user' => trim($_POST['db_user'] ?? ''),
      'db_pass' => (string)($_POST['db_pass'] ?? ''),
    ];
    if ($cfg['db_name'] === '' || $cfg['db_user'] === '') throw new AppError('اكتب اسم قاعدة البيانات واسم المستخدم بتاعها');
    // قاعدة البيانات لازم تكون على نفس الاستضافة (أمان: محدش يقدر يوصّل الموقع بقاعدة بيانات بره)
    if (!in_array(strtolower($cfg['db_host']), ['localhost', '127.0.0.1', '::1'], true) && !getenv('ALAGAMY_ALLOW_REMOTE_DB')) {
      throw new AppError('السيرفر لازم يكون localhost (قاعدة البيانات على نفس الاستضافة)');
    }
    $adminU = _check_username((string)($_POST['admin_user'] ?? ''));
    $adminP = (string)($_POST['admin_pass'] ?? '');
    _check_password($adminP);
    if ($adminP !== (string)($_POST['admin_pass2'] ?? '')) throw new AppError('كلمتين السر مش زي بعض');

    // نجرب الاتصال
    try {
      $pdo = new PDO("mysql:host={$cfg['db_host']};port={$cfg['db_port']};dbname={$cfg['db_name']};charset=utf8mb4", $cfg['db_user'], $cfg['db_pass'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    } catch (PDOException $e) {
      throw new AppError('مش قادر أوصل لقاعدة البيانات — راجع الاسم واسم المستخدم وكلمة السر. (' . $e->getMessage() . ')');
    }
    $ver = (string)$pdo->query('SELECT VERSION()')->fetchColumn();
    $done[] = 'اتوصلت بقاعدة البيانات (' . h($ver) . ')';

    // نكتب الإعدادات
    $php = "<?php\n// إعدادات الاتصال بقاعدة البيانات — اتعملت من install.php\nreturn " . var_export($cfg, true) . ";\n";
    if (file_put_contents($cfgFile, $php) === false) throw new AppError('مش قادر أكتب ملف الإعدادات — اتأكد إن فولدر api عليه صلاحية الكتابة');
    @chmod($cfgFile, 0640);

    // الجداول
    $sql = file_get_contents(__DIR__ . '/lib/schema.sql');
    $sql = preg_replace('/^\s*--.*$/m', '', $sql);
    foreach (preg_split('/;\s*\n/', $sql) as $stmt) { if (trim($stmt) !== '') db()->exec($stmt); }
    $done[] = 'اتعملت الجداول';

    db()->beginTransaction();
    // نقل البيانات من النسخة الكاملة لو اترفعت
    if (!empty($_FILES['backup']['tmp_name']) && is_uploaded_file($_FILES['backup']['tmp_name'])) {
      $data = json_decode((string)file_get_contents($_FILES['backup']['tmp_name']), true);
      if (!is_array($data) || !isset($data['sales'])) throw new AppError('ملف النسخة الكاملة مش سليم — لازم يكون الملف اللي نزل من "نزّل النسخة الكاملة"');
      $counts = import_backup($data);
      $done[] = 'اتنقلت البيانات: ' . (int)($counts['customers'] ?? 0) . ' زبون، ' . (int)($counts['sales'] ?? 0) . ' فاتورة بيع، '
        . (int)($counts['shipments'] ?? 0) . ' نقلة، ' . (int)($counts['settlements'] ?? 0) . ' فاتورة عميل، ' . (int)($counts['users'] ?? 0) . ' مستخدم';
    }
    if (!qv('SELECT 1 FROM crate_types LIMIT 1')) {
      foreach ([['صندوق بلاستيك كبير', 50], ['صندوق بلاستيك صغير', 30], ['صندوق خشب (بدون رهن)', 0]] as $c) ex('INSERT INTO crate_types(name, deposit) VALUES (?,?)', $c);
    }
    // حساب المدير: لو موجود في البيانات اللي اتنقلت بناخده هو (علشان الفواتير القديمة تفضل باسمه)
    $hash = password_hash($adminP, PASSWORD_BCRYPT);
    $existing = qv('SELECT id FROM profiles WHERE username = ?', [$adminU]);
    if ($existing) {
      ex("UPDATE profiles SET password_hash = ?, role = 'admin', active = 1, deleted_at = NULL, purged_at = NULL WHERE id = ?", [$hash, $existing]);
      $done[] = 'حساب المدير "' . h($adminU) . '" اتربط بحسابك القديم';
    } else {
      ex("INSERT INTO profiles(id, username, password_hash, full_name, role, active, perms) VALUES (?,?,?,?, 'admin', 1, '{}')",
        [uuid4(), $adminU, $hash, trim((string)($_POST['admin_name'] ?? ''))]);
      $done[] = 'اتعمل حساب المدير "' . h($adminU) . '"';
    }
    ex('UPDATE profiles SET is_owner = (username = ?)', [$adminU]); // اللي سطّب البرنامج هو صاحبه
    db()->commit();
    file_put_contents($lock, date('c'));
    // SSL شغال (التسطيب نفسه جاي على https) — نخلي الموقع كله يتحول لـ https
    $ht = dirname(__DIR__) . '/.htaccess';
    if ($realHttps && !getenv('ALAGAMY_ALLOW_HTTP') && is_file($ht) && is_writable($ht)) {
      $t = (string)file_get_contents($ht);
      $t = preg_replace_callback('/# HTTPS-START\n(.*?)# HTTPS-END/s', fn($m) => "# HTTPS-START\n" . preg_replace('/^(\s*)# /m', '$1', $m[1]) . '# HTTPS-END', $t);
      file_put_contents($ht, $t);
      $done[] = 'الموقع بقى يفتح على https بس (آمن)';
    }
    $ok = true;
  } catch (Throwable $e) {
    try { if (db()->inTransaction()) db()->rollBack(); } catch (Throwable $x) {}
    if (!$ok && file_exists($cfgFile) && !file_exists($lock) && empty($done[1])) @unlink($cfgFile);
    $msg = $e instanceof AppError ? $e->getMessage() : 'حصلت مشكلة: ' . $e->getMessage();
  }
}
?><!DOCTYPE html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>تسطيب برنامج العجمي</title>
<style>
  body { font-family: "Segoe UI", Tahoma, sans-serif; background: #f2f5ef; color: #1d2a24; margin: 0; padding: 24px; }
  .card { max-width: 620px; margin: 0 auto; background: #fff; border-radius: 14px; padding: 26px 28px; box-shadow: 0 6px 24px rgba(20, 60, 40, .1); }
  h1 { margin: 0 0 4px; color: #17553a; font-size: 24px; } .sub { color: #5b6b62; margin: 0 0 18px; }
  h2 { font-size: 16px; margin: 22px 0 8px; color: #17553a; border-top: 1px solid #e3e9e1; padding-top: 16px; }
  label { display: block; margin: 10px 0 4px; font-weight: 600; font-size: 14px; } small { color: #6b7a71; font-weight: 400; }
  input { width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1px solid #cfd9d2; border-radius: 8px; font-size: 15px; }
  input[dir=ltr] { text-align: left; } .row { display: flex; gap: 12px; } .row > div { flex: 1; }
  button { margin-top: 22px; width: 100%; padding: 13px; background: #17553a; color: #fff; border: 0; border-radius: 10px; font-size: 17px; font-weight: 700; cursor: pointer; }
  .err { background: #fdecea; color: #8a1f17; padding: 12px 14px; border-radius: 8px; margin-bottom: 14px; }
  .ok { background: #e6f4ea; color: #155c33; padding: 14px; border-radius: 8px; } .ok li { margin: 4px 0; }
  .warn { background: #fff4dc; color: #6d4700; padding: 12px 14px; border-radius: 8px; margin-top: 14px; }
</style></head><body><div class="card">
<h1>مرحبا بك في محلات عبده العجمي</h1>
<p class="sub">تسطيب البرنامج على الاستضافة — خطوة واحدة وكل حاجة تبقى جاهزة.</p>
<?php if (!$https && !$ok): ?>
  <div class="err"><b>شهادة الأمان (SSL) لسه مش شغالة.</b><br>افتح الصفحة دي بـ <b>https://</b> في الأول. لو مش بتفتح:
    cPanel ← <b>SSL/TLS Status</b> ← Run AutoSSL، واستنى شوية (ممكن ساعات لو الدومين لسه جديد) وجرب تاني.
    التسطيب مش بيكمل من غير https علشان كلمات السر متتبعتش مكشوفة.</div>
<?php elseif (!$phpOk || !$extOk): ?>
  <div class="err">الاستضافة محتاجة PHP 8.0 أو أحدث وفيها pdo_mysql. النسخة الحالية <?= h(PHP_VERSION) ?>. غيّرها من cPanel ← Select PHP Version.</div>
<?php elseif ($ok): ?>
  <div class="ok"><b>التسطيب خلص بنجاح ✔</b><ul><?php foreach ($done as $d) echo '<li>' . $d . '</li>'; ?></ul></div>
  <div class="warn"><b>مهم:</b> امسح ملف <b>api/install.php</b> من الاستضافة دلوقتي (من File Manager في cPanel).<br>
    بعد كده افتح البرنامج وادخل بحساب المدير. لو نقلت بيانات قديمة: كل المحاسبين لازم تعملهم كلمة سر جديدة من الإعدادات ← المستخدمين.</div>
  <p><a href="../">افتح البرنامج ←</a></p>
<?php elseif ($msg && file_exists($lock)): ?>
  <div class="warn"><?= h($msg) ?></div>
<?php else: ?>
  <?php if ($msg): ?><div class="err"><?= h($msg) ?></div><?php endif; ?>
  <form method="post" enctype="multipart/form-data">
    <h2>1) قاعدة البيانات <small>(من cPanel ← MySQL Databases)</small></h2>
    <div class="row"><div><label>السيرفر</label><input name="db_host" dir="ltr" value="<?= h($_POST['db_host'] ?? 'localhost') ?>"></div>
      <div style="flex:.4"><label>المنفذ</label><input name="db_port" dir="ltr" value="<?= h($_POST['db_port'] ?? '3306') ?>"></div></div>
    <label>اسم قاعدة البيانات</label><input name="db_name" dir="ltr" required value="<?= h($_POST['db_name'] ?? '') ?>" placeholder="cpaneluser_alagamy">
    <label>اسم مستخدم قاعدة البيانات</label><input name="db_user" dir="ltr" required value="<?= h($_POST['db_user'] ?? '') ?>">
    <label>كلمة سر قاعدة البيانات</label><input name="db_pass" type="password" dir="ltr">
    <h2>2) حساب المدير</h2>
    <label>اسم الدخول <small>(بالإنجليزي — لو هتنقل بيانات قديمة اكتب نفس اسم دخولك القديم)</small></label>
    <input name="admin_user" dir="ltr" required value="<?= h($_POST['admin_user'] ?? '') ?>">
    <label>الاسم</label><input name="admin_name" value="<?= h($_POST['admin_name'] ?? '') ?>">
    <div class="row"><div><label>كلمة السر <small>(8 على الأقل)</small></label><input name="admin_pass" type="password" dir="ltr" required></div>
      <div><label>اكتبها تاني</label><input name="admin_pass2" type="password" dir="ltr" required></div></div>
    <h2>3) نقل بياناتك <small>(اختياري)</small></h2>
    <label>ملف النسخة الكاملة (JSON) <small>— من البرنامج القديم: الإعدادات ← النسخة الاحتياطية ← نزّل النسخة الكاملة</small></label>
    <input type="file" name="backup" accept=".json,application/json">
    <button type="submit">سطّب البرنامج</button>
  </form>
<?php endif; ?>
</div></body></html>
