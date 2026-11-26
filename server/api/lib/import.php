<?php
// نقل البيانات من النسخة الكاملة (JSON) اللي نزلت من البرنامج القديم (Supabase) أو من نسخة الاستضافة نفسها
declare(strict_types=1);

const IMPORT_ORDER = [
  'crate_types', 'items', 'suppliers', 'customers', 'users', 'settlements', 'shipments', 'shipment_items',
  'sales', 'sale_lines', 'customer_payments', 'crate_returns', 'cash_shifts', 'cash_movements', 'supplier_advances', 'change_requests',
];

function table_columns(string $t): array {
  $cols = [];
  foreach (db()->query("SHOW COLUMNS FROM `$t`")->fetchAll(PDO::FETCH_ASSOC) as $c) $cols[$c['Field']] = strtolower($c['Type']);
  return $cols;
}

function import_value($v, string $type) {
  if ($v === null) return null;
  if (str_starts_with($type, 'datetime')) {
    if ($v === '') return null;
    $d = new DateTime((string)$v);
    $d->setTimezone(new DateTimeZone('Africa/Cairo'));
    return $d->format('Y-m-d H:i:s');
  }
  if (str_starts_with($type, 'date')) return substr((string)$v, 0, 10);
  if (str_starts_with($type, 'tinyint')) return $v ? 1 : 0;
  if (is_array($v) || is_object($v)) return json_encode($v, JSON_UNESCAPED_UNICODE);
  if (is_bool($v)) return $v ? 1 : 0;
  return $v;
}

/** بيرجع عدد الصفوف اللي اتنقلت من كل جدول */
function import_backup(array $data): array {
  foreach (IMPORT_ORDER as $t) {
    $dst = $t === 'users' ? 'profiles' : $t;
    if ($t !== 'crate_types' && (int)db()->query("SELECT COUNT(*) FROM `$dst`")->fetchColumn() > 0) {
      throw new AppError('قاعدة البيانات فيها بيانات بالفعل — النقل بيشتغل على قاعدة بيانات فاضية بس');
    }
  }
  $counts = [];
  db()->exec('SET FOREIGN_KEY_CHECKS = 0');
  try {
    if (!empty($data['crate_types'])) db()->exec('DELETE FROM crate_types');
    foreach (IMPORT_ORDER as $t) {
      $rows = $data[$t] ?? [];
      if (!is_array($rows) || !$rows) { $counts[$t] = 0; continue; }
      $dst = $t === 'users' ? 'profiles' : $t;
      $cols = table_columns($dst);
      $n = 0;
      foreach ($rows as $r) {
        if (!is_array($r)) continue;
        if ($t === 'users') {
          $r['password_hash'] = '';          // كلمات السر القديمة مش بتتنقل — المدير بيعمل لكل واحد كلمة سر جديدة
          if (!isset($r['perms'])) $r['perms'] = new stdClass();
        }
        if ($t === 'settlements' && !isset($r['details'])) $r['details'] = ['lines' => [], 'items' => []];
        if ($t === 'change_requests' && !isset($r['payload'])) $r['payload'] = new stdClass();
        $keys = array_values(array_filter(array_keys($r), fn($k) => isset($cols[$k])));
        if (!$keys) continue;
        $vals = array_map(fn($k) => import_value($r[$k], $cols[$k]), $keys);
        $sql = "INSERT INTO `$dst` (`" . implode('`,`', $keys) . '`) VALUES (' . implode(',', array_fill(0, count($keys), '?')) . ')';
        db()->prepare($sql)->execute($vals);
        $n++;
      }
      $counts[$t] = $n;
    }
    if (!empty($data['shop_settings'][0]) && is_array($data['shop_settings'][0])) {
      $s = $data['shop_settings'][0];
      $cols = table_columns('shop_settings');
      foreach ($s as $k => $v) {
        if ($k === 'id' || !isset($cols[$k])) continue;
        db()->prepare("UPDATE shop_settings SET `$k` = ? WHERE id = 1")->execute([import_value($v, $cols[$k])]);
      }
    }
  } finally {
    db()->exec('SET FOREIGN_KEY_CHECKS = 1');
  }
  return $counts;
}
