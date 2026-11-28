<?php
// تحديث البرنامج على الاستضافة بضغطة واحدة من الإعدادات (للمدير بس)
declare(strict_types=1);

const UPDATE_URL = 'https://github.com/engatoo-art/alagamy/releases/download/latest/Alagamy-hosting.zip';

function _site_root(): string { return dirname(__DIR__, 2); }

function _version(): string {
  $f = _site_root() . '/version.txt';
  return is_file($f) ? trim((string)file_get_contents($f)) : '';
}

/** بيضيف عمود لو مش موجود (علشان التحديثات الجاية تقدر تزود أعمدة من غير ما تبوظ البيانات) */
function ensure_column(string $table, string $col, string $ddl): void {
  if (!qv('SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?', [$table, $col])) {
    db()->exec("ALTER TABLE `$table` ADD COLUMN $ddl");
  }
}

function run_migrations(): void {
  $sql = (string)file_get_contents(__DIR__ . '/../lib/schema.sql');
  $sql = preg_replace('/^\s*--.*$/m', '', $sql);
  foreach (preg_split('/;\s*\n/', $sql) as $stmt) { if (trim($stmt) !== '') db()->exec($stmt); }
  // أعمدة اتضافت بعد أول نسخة بتتحط هنا: ensure_column('table', 'col', 'col TYPE ...');
}

$FN['app_version'] = function (array $p) {
  _need_admin();
  return ['version' => _version(), 'php' => PHP_VERSION];
};

$FN['self_update'] = function (array $p) {
  _need_admin();
  if (!class_exists('ZipArchive')) fail('الاستضافة مفيهاش ZipArchive — التحديث لازم يترفع بإيدك');
  $d = false;
  if (function_exists('curl_init')) {
    $c = curl_init(UPDATE_URL);
    curl_setopt_array($c, [CURLOPT_FOLLOWLOCATION => 1, CURLOPT_RETURNTRANSFER => 1, CURLOPT_TIMEOUT => 180, CURLOPT_USERAGENT => 'alagamy-update']);
    $d = curl_exec($c);
  }
  if (!$d && ini_get('allow_url_fopen')) $d = @file_get_contents(UPDATE_URL, false, stream_context_create(['http' => ['follow_location' => 1, 'timeout' => 180]]));
  if (!$d || strlen($d) < 100000) fail('مش قادر أنزّل التحديث من GitHub — حاول تاني بعد شوية');
  $tmp = tempnam(sys_get_temp_dir(), 'alg');
  file_put_contents($tmp, $d);
  $z = new ZipArchive();
  if ($z->open($tmp) !== true) { @unlink($tmp); fail('ملف التحديث مش سليم'); }
  // لازم يكون فيه ملفات البرنامج الأساسية، وإلا مش هنكمل
  foreach (['index.html', 'api/index.php', 'api/lib/core.php', 'js/app.js'] as $must) {
    if ($z->locateName($must) === false) { $z->close(); @unlink($tmp); fail('ملف التحديث ناقص'); }
  }
  $root = _site_root();
  $n = 0;
  for ($i = 0; $i < $z->numFiles; $i++) {
    $name = $z->getNameIndex($i);
    if ($name === false || str_contains($name, '..') || str_starts_with($name, '/')) continue;
    // ملفات خاصة بالموقع ده مابتتغيرش: إعدادات قاعدة البيانات، وملف .htaccess (فيه تحويل https)، وبرنامج التسطيب
    if (in_array($name, ['.htaccess', 'api/config.php', 'api/install.php'], true) || str_starts_with($name, 'api/lib/installed')) continue;
    $dest = $root . '/' . $name;
    if (str_ends_with($name, '/')) { if (!is_dir($dest)) @mkdir($dest, 0755, true); continue; }
    if (!is_dir(dirname($dest))) @mkdir(dirname($dest), 0755, true);
    $data = $z->getFromIndex($i);
    if ($data === false) continue;
    file_put_contents($dest . '.new', $data);
    rename($dest . '.new', $dest);
    $n++;
  }
  $z->close();
  @unlink($tmp);
  if (function_exists('opcache_reset')) @opcache_reset();
  run_migrations();
  return ['ok' => true, 'files' => $n, 'version' => _version()];
};
