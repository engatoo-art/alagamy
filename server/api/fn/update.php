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
  ensure_column('profiles', 'is_owner', 'is_owner TINYINT(1) NOT NULL DEFAULT 0');
  ensure_column('cash_movements', 'voided', 'voided TINYINT NOT NULL DEFAULT 0');
  ensure_column('cash_movements', 'voided_by', 'voided_by CHAR(36) NULL');
  ensure_column('cash_movements', 'voided_at', 'voided_at DATETIME(6) NULL');
  ensure_column('cash_movements', 'void_reason', "void_reason VARCHAR(1000) NOT NULL DEFAULT ''");
  _ensure_owner();
}

$FN['app_version'] = function (array $p) {
  _need_admin();
  $dl = [];
  foreach (['AlagamySetup.exe', 'Alagamy.apk'] as $f) {
    $path = _site_root() . '/download/' . $f;
    $dl[$f] = is_file($path) ? date('Y-m-d H:i', (int)filemtime($path)) : null;
  }
  return ['version' => _version(), 'php' => PHP_VERSION, 'downloads' => $dl];
};

// ملفات برنامج الكمبيوتر والموبايل بتتحفظ على الموقع نفسه في فولدر download/
const DOWNLOADS = [
  'AlagamySetup.exe' => 5000000,
  'Alagamy.apk' => 1000000,
];
const RELEASE_BASE = 'https://github.com/engatoo-art/alagamy/releases/download/latest/';

/** بينزّل ملف كبير على الديسك مباشرة (من غير ما يتحمل كله في الذاكرة)، ويستبدل القديم بس لو الجديد سليم */
function _fetch_to_file(string $url, string $dest, int $minSize): int {
  $tmp = $dest . '.part';
  $ok = false;
  if (function_exists('curl_init')) {
    $fh = fopen($tmp, 'wb');
    if (!$fh) fail('مش قادر أكتب في فولدر التحميل');
    $c = curl_init($url);
    curl_setopt_array($c, [CURLOPT_FOLLOWLOCATION => 1, CURLOPT_FILE => $fh, CURLOPT_TIMEOUT => 600,
      CURLOPT_CONNECTTIMEOUT => 30, CURLOPT_USERAGENT => 'alagamy-update', CURLOPT_FAILONERROR => 1]);
    $ok = curl_exec($c) !== false;
    fclose($fh);
  } elseif (ini_get('allow_url_fopen')) {
    $in = @fopen($url, 'rb', false, stream_context_create(['http' => ['follow_location' => 1, 'timeout' => 600]]));
    if ($in) { $ok = @file_put_contents($tmp, $in) !== false; fclose($in); }
  }
  clearstatcache(true, $tmp);
  $size = is_file($tmp) ? (int)filesize($tmp) : 0;
  if (!$ok || $size < $minSize) { @unlink($tmp); fail('مش قادر أنزّل ' . basename($dest) . ' من GitHub — حاول تاني بعد شوية'); }
  rename($tmp, $dest);
  return $size;
}

$FN['update_downloads'] = function (array $p) {
  _need_admin();
  @set_time_limit(900);
  @ignore_user_abort(true);
  $dir = _site_root() . '/download';
  if (!is_dir($dir)) @mkdir($dir, 0755, true);
  $out = [];
  foreach (DOWNLOADS as $name => $min) {
    $out[$name] = round(_fetch_to_file(RELEASE_BASE . $name, "$dir/$name", $min) / 1048576, 1);
  }
  return ['ok' => true, 'files' => $out];
};

// بيتنادى بعد التحديث في طلب جديد، علشان يشغّل تعديلات قاعدة البيانات من الكود الجديد نفسه
$FN['migrate'] = function (array $p) {
  _need_admin();
  run_migrations();
  return ['ok' => true, 'version' => _version()];
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
