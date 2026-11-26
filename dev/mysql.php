<?php
// أداة اختبار: بتنفذ استعلام على MySQL بنفس طريقة البرنامج (PDO + utf8mb4) وتطبع النتيجة
$e = fn($k, $d) => getenv($k) !== false ? getenv($k) : $d;
$pdo = new PDO('mysql:host=' . $e('MYSQL_HOST', '127.0.0.1') . ';dbname=' . $e('MYSQL_DB', 'app') . ';charset=utf8mb4',
  $e('MYSQL_USER', 'root'), $e('MYSQL_PASS', 'root'), [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$off = (new DateTime('now', new DateTimeZone('Africa/Cairo')))->format('P');
$pdo->exec("SET time_zone = '$off'");
$sql = $argv[1] ?? '';
if (is_file($sql)) { foreach (preg_split('/;\s*\n/', preg_replace('/^\s*--.*$/m', '', file_get_contents($sql))) as $s) if (trim($s) !== '') $pdo->exec($s); exit; }
$st = $pdo->query($sql);
if ($st->columnCount() === 0) exit;
foreach ($st->fetchAll(PDO::FETCH_NUM) as $r) echo implode("\t", array_map(fn($v) => $v === null ? 'NULL' : $v, $r)), "\n";
