-- =====================================================================
--  محل عبده العجمي وأولاده — قاعدة البيانات (نسخة الاستضافة: MySQL / MariaDB)
--  برنامج التسطيب (install.php) بيشغّل الملف ده لوحده. آمن تشغيله أكتر من مرة.
-- =====================================================================

-- قفل واحد للمحل كله: أي عملية بتغيّر بيانات بتستنى اللي قبلها تخلص
CREATE TABLE IF NOT EXISTS app_lock (
  id INT PRIMARY KEY
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO app_lock(id) VALUES (1);

CREATE TABLE IF NOT EXISTS profiles (
  id CHAR(36) PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL DEFAULT '',
  full_name VARCHAR(200) NOT NULL DEFAULT '',
  role VARCHAR(20) NOT NULL DEFAULT 'accountant',
  active TINYINT(1) NOT NULL DEFAULT 0,
  perms TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  deleted_by CHAR(36) NULL,
  was_active TINYINT(1) NULL,
  purged_at DATETIME NULL,
  email VARCHAR(200) NOT NULL DEFAULT '',
  phone VARCHAR(40) NOT NULL DEFAULT '',
  whatsapp VARCHAR(40) NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- جلسات الدخول: بنخزن بصمة التوكن بس، مش التوكن نفسه
CREATE TABLE IF NOT EXISTS sessions (
  token_hash CHAR(64) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  ip VARCHAR(64) NOT NULL DEFAULT '',
  INDEX ix_sess_user (user_id),
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- محاولات الدخول الغلط (حماية من التخمين)
CREATE TABLE IF NOT EXISTS login_attempts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ip VARCHAR(64) NOT NULL,
  username VARCHAR(100) NOT NULL DEFAULT '',
  at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX ix_att_ip (ip, at),
  INDEX ix_att_user (username, at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shop_settings (
  id INT PRIMARY KEY,
  shop_name VARCHAR(300) NOT NULL DEFAULT 'محل عبده العجمي وأولاده محمد وعبدالرحمن',
  phone VARCHAR(100) NOT NULL DEFAULT '',
  address VARCHAR(300) NOT NULL DEFAULT '',
  default_commission DECIMAL(5,2) NOT NULL DEFAULT 10,
  receipt_footer VARCHAR(500) NOT NULL DEFAULT 'شكرًا لتعاملكم معنا',
  invoice_title VARCHAR(300) NOT NULL DEFAULT 'محلات عبده العجمي وأولاده (محمد وعبدالرحمن)',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO shop_settings(id) VALUES (1);

CREATE TABLE IF NOT EXISTS crate_types (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(190) NOT NULL UNIQUE,
  deposit DECIMAL(12,2) NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(190) NOT NULL UNIQUE,
  default_unit VARCHAR(10) NOT NULL DEFAULT 'kg',
  active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS suppliers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  phone VARCHAR(100) NOT NULL DEFAULT '',
  commission_pct DECIMAL(5,2) NOT NULL DEFAULT 10,
  notes VARCHAR(1000) NOT NULL DEFAULT '',
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS customers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  phone VARCHAR(100) NOT NULL DEFAULT '',
  address VARCHAR(300) NOT NULL DEFAULT '',
  credit_approved TINYINT(1) NOT NULL DEFAULT 0,
  credit_requested TINYINT(1) NOT NULL DEFAULT 0,
  credit_limit DECIMAL(14,2) NOT NULL DEFAULT 0,
  notes VARCHAR(1000) NOT NULL DEFAULT '',
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  guarantor VARCHAR(200) NOT NULL DEFAULT '',
  rating_pay INT NOT NULL DEFAULT 0,
  rating_general INT NOT NULL DEFAULT 0,
  rating_note VARCHAR(1000) NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS settlements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  settle_no INT NOT NULL UNIQUE,
  supplier_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by CHAR(36) NULL,
  total_qty_in DECIMAL(14,2) NOT NULL DEFAULT 0,
  total_qty DECIMAL(14,2) NOT NULL DEFAULT 0,
  total_weight DECIMAL(14,3) NOT NULL DEFAULT 0,
  gross_sales DECIMAL(14,2) NOT NULL DEFAULT 0,
  commission_pct DECIMAL(5,2) NOT NULL DEFAULT 0,
  commission_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  freight DECIMAL(14,2) NOT NULL DEFAULT 0,
  unloading DECIMAL(14,2) NOT NULL DEFAULT 0,
  other_expenses DECIMAL(14,2) NOT NULL DEFAULT 0,
  other_label VARCHAR(200) NOT NULL DEFAULT '',
  net_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  details LONGTEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  decided_by CHAR(36) NULL,
  decided_at DATETIME NULL,
  reject_reason VARCHAR(1000) NOT NULL DEFAULT '',
  paid_by CHAR(36) NULL,
  paid_at DATETIME NULL,
  notes VARCHAR(1000) NOT NULL DEFAULT '',
  advance_deducted DECIMAL(14,2) NOT NULL DEFAULT 0,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shipments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  supplier_id INT NOT NULL,
  ship_date DATE NOT NULL,
  truck VARCHAR(100) NOT NULL DEFAULT '',
  driver VARCHAR(100) NOT NULL DEFAULT '',
  freight DECIMAL(14,2) NOT NULL DEFAULT 0,
  unloading DECIMAL(14,2) NOT NULL DEFAULT 0,
  other_expenses DECIMAL(14,2) NOT NULL DEFAULT 0,
  notes VARCHAR(1000) NOT NULL DEFAULT '',
  settlement_id INT NULL,
  created_by CHAR(36) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX ix_ship_supplier (supplier_id),
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  FOREIGN KEY (settlement_id) REFERENCES settlements(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shipment_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  shipment_id INT NOT NULL,
  item_id INT NOT NULL,
  qty DECIMAL(12,2) NOT NULL,
  notes VARCHAR(500) NOT NULL DEFAULT '',
  INDEX ix_shipitems_ship (shipment_id),
  FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sales (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sale_no INT NULL UNIQUE,
  sale_date DATE NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  customer_id INT NULL,
  customer_name VARCHAR(200) NOT NULL DEFAULT '',
  payment_type VARCHAR(10) NOT NULL,
  goods_total DECIMAL(14,2) NOT NULL DEFAULT 0,
  deposit_total DECIMAL(14,2) NOT NULL DEFAULT 0,
  discount DECIMAL(14,2) NOT NULL DEFAULT 0,
  grand_total DECIMAL(14,2) NOT NULL DEFAULT 0,
  paid_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  approval_status VARCHAR(20) NOT NULL DEFAULT 'not_required',
  decided_by CHAR(36) NULL,
  decided_at DATETIME NULL,
  reject_reason VARCHAR(1000) NOT NULL DEFAULT '',
  voided TINYINT(1) NOT NULL DEFAULT 0,
  voided_by CHAR(36) NULL,
  voided_at DATETIME NULL,
  void_reason VARCHAR(1000) NOT NULL DEFAULT '',
  notes VARCHAR(1000) NOT NULL DEFAULT '',
  created_by CHAR(36) NULL,
  INDEX ix_sales_date (sale_date),
  INDEX ix_sales_customer (customer_id),
  FOREIGN KEY (customer_id) REFERENCES customers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sale_lines (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sale_id INT NOT NULL,
  shipment_item_id INT NULL,
  item_id INT NOT NULL,
  unit VARCHAR(10) NOT NULL,
  qty DECIMAL(12,2) NOT NULL DEFAULT 0,
  weight DECIMAL(12,3) NOT NULL DEFAULT 0,
  price DECIMAL(12,2) NOT NULL DEFAULT 0,
  amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  crate_type_id INT NULL,
  crates INT NOT NULL DEFAULT 0,
  deposit_unit DECIMAL(12,2) NOT NULL DEFAULT 0,
  deposit_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  INDEX ix_lines_sale (sale_id),
  INDEX ix_lines_shipitem (shipment_item_id),
  FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
  FOREIGN KEY (shipment_item_id) REFERENCES shipment_items(id),
  FOREIGN KEY (item_id) REFERENCES items(id),
  FOREIGN KEY (crate_type_id) REFERENCES crate_types(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS customer_payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pay_date DATE NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  customer_id INT NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  notes VARCHAR(1000) NOT NULL DEFAULT '',
  voided TINYINT(1) NOT NULL DEFAULT 0,
  created_by CHAR(36) NULL,
  INDEX ix_pay_customer (customer_id),
  FOREIGN KEY (customer_id) REFERENCES customers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crate_returns (
  id INT AUTO_INCREMENT PRIMARY KEY,
  return_date DATE NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  customer_id INT NOT NULL,
  crate_type_id INT NOT NULL,
  count INT NOT NULL,
  unit_deposit DECIMAL(12,2) NOT NULL DEFAULT 0,
  amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  method VARCHAR(10) NOT NULL,
  notes VARCHAR(1000) NOT NULL DEFAULT '',
  created_by CHAR(36) NULL,
  INDEX ix_ret_customer (customer_id),
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (crate_type_id) REFERENCES crate_types(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cash_shifts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  opened_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  opening_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  status VARCHAR(10) NOT NULL DEFAULT 'open',
  closed_at DATETIME NULL,
  closed_by CHAR(36) NULL,
  total_in DECIMAL(14,2) NOT NULL DEFAULT 0,
  total_out DECIMAL(14,2) NOT NULL DEFAULT 0,
  expected_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  counted_amount DECIMAL(14,2) NULL,
  difference DECIMAL(14,2) NOT NULL DEFAULT 0,
  notes VARCHAR(1000) NOT NULL DEFAULT '',
  reviewed_by CHAR(36) NULL,
  reviewed_at DATETIME NULL,
  review_note VARCHAR(1000) NOT NULL DEFAULT '',
  prev_shift_id INT NULL,
  prev_user_id CHAR(36) NULL,
  prev_difference DECIMAL(14,2) NOT NULL DEFAULT 0,
  reset_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  reset_by CHAR(36) NULL,
  INDEX ix_shift_user (user_id),
  INDEX ix_shift_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cash_movements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  mv_date DATE NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  direction VARCHAR(5) NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  category VARCHAR(40) NOT NULL,
  description VARCHAR(1000) NOT NULL DEFAULT '',
  party VARCHAR(200) NOT NULL DEFAULT '',
  ref_type VARCHAR(40) NOT NULL DEFAULT '',
  ref_id INT NULL,
  created_by CHAR(36) NULL,
  shift_id INT NULL,
  INDEX ix_cash_date (mv_date),
  INDEX ix_cash_shift (shift_id),
  INDEX ix_cash_ref (ref_type, ref_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS supplier_advances (
  id INT AUTO_INCREMENT PRIMARY KEY,
  supplier_id INT NOT NULL,
  adv_date DATE NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  notes VARCHAR(1000) NOT NULL DEFAULT '',
  voided TINYINT(1) NOT NULL DEFAULT 0,
  created_by CHAR(36) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS change_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  kind VARCHAR(30) NOT NULL,
  target_id INT NULL,
  payload LONGTEXT,
  summary VARCHAR(1000) NOT NULL DEFAULT '',
  details TEXT,
  reason VARCHAR(1000) NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  requested_by CHAR(36) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_by CHAR(36) NULL,
  decided_at DATETIME NULL,
  decide_note VARCHAR(1000) NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
