// النسخ الاحتياطية في ملفات Excel: ملف لكل البيانات، وملف للزمامات، وملف للعملاء (الموردين)
// الأسماء بتتكتب بدل الأرقام علشان الملف يتقري على طول من غير البرنامج
import { api } from './api.js';
import { todayISO, CASH_CAT } from './ui.js';

function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = rej;
    document.head.append(s);
  });
}
export async function loadXLSX() {
  if (window.XLSX) return window.XLSX;
  try { await loadScript('js/vendor/xlsx.full.min.js'); }
  catch {
    try { await loadScript('https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js'); }
    catch { throw new Error('مش قادر أحمّل أداة Excel — اتأكد من النت'); }
  }
  return window.XLSX;
}

const yes = (b) => (b ? 'نعم' : 'لا');
const num = (v) => (v === null || v === undefined || v === '' ? '' : Number(v));
const day = (v) => (v ? String(v).slice(0, 10) : '');
const time = (v) => (v ? new Date(v).toLocaleString('en-GB', { timeZone: 'Africa/Cairo', hour12: false }) : '');
const PAYT = { cash: 'نقدي', credit: 'آجل' };
const ST = { not_required: '', pending: 'مستنية موافقة', approved: 'متوافق عليها', rejected: 'مرفوضة', paid: 'اتصرفت', none: '', open: 'مفتوحة', closed: 'مقفولة' };

const idx = (rows, f = (r) => r.name) => Object.fromEntries((rows || []).map((r) => [r.id, f(r)]));

function sheet(X, wb, name, rows) {
  const safe = name.replace(/[\[\]:*?/\\]/g, ' ').slice(0, 31);
  let n = safe, i = 2;
  while (wb.SheetNames.includes(n)) n = safe.slice(0, 28) + ' ' + i++;
  const ws = X.utils.json_to_sheet(rows.length ? rows : [{ 'لا يوجد بيانات': '' }]);
  const keys = Object.keys(rows[0] || { x: '' });
  ws['!cols'] = keys.map((k) => ({ wch: Math.min(45, Math.max(10, k.length + 3, ...rows.slice(0, 200).map((r) => String(r[k] ?? '').length + 1))) }));
  X.utils.book_append_sheet(wb, ws, n);
}
const book = (X) => { const wb = X.utils.book_new(); wb.Workbook = { Views: [{ RTL: true }] }; return wb; };

// ---------------- كل البيانات ----------------
function allBook(X, d) {
  const wb = book(X);
  const cust = idx(d.customers), sup = idx(d.suppliers), item = idx(d.items), crate = idx(d.crate_types);
  const user = idx(d.users, (u) => u.full_name || u.username);
  const sale = Object.fromEntries(d.sales.map((s) => [s.id, s]));
  const ship = Object.fromEntries(d.shipments.map((s) => [s.id, s]));
  const shipItem = Object.fromEntries(d.shipment_items.map((s) => [s.id, s]));

  sheet(X, wb, 'الزباين', d.customers.map((c) => ({
    'رقم': c.id, 'الاسم': c.name, 'التليفون': c.phone, 'العنوان': c.address, 'الضامن': c.guarantor,
    'الرصيد عليه': num(c.balance), 'مسموح آجل': yes(c.credit_approved), 'حد الآجل': num(c.credit_limit),
    'تقييم السداد': num(c.rating_pay), 'التقييم العام': num(c.rating_general), 'ملاحظة التقييم': c.rating_note,
    'ملاحظات': c.notes, 'شغال': yes(c.active), 'تاريخ الإضافة': day(c.created_at),
  })));
  sheet(X, wb, 'فواتير البيع', d.sales.map((s) => ({
    'رقم الفاتورة': s.sale_no, 'التاريخ': day(s.sale_date), 'الوقت': time(s.created_at),
    'الزبون': cust[s.customer_id] || s.customer_name || 'نقدي', 'الدفع': PAYT[s.payment_type] || s.payment_type,
    'البضاعة': num(s.goods_total), 'الرهن': num(s.deposit_total), 'خصم': num(s.discount), 'الإجمالي': num(s.grand_total),
    'المدفوع': num(s.paid_amount), 'الباقي': num(s.grand_total - s.paid_amount), 'الموافقة': ST[s.approval_status] ?? s.approval_status,
    'ملغية': yes(s.voided), 'سبب الإلغاء': s.void_reason, 'المحاسب': user[s.created_by], 'ملاحظات': s.notes,
  })));
  sheet(X, wb, 'تفاصيل الفواتير', d.sale_lines.map((l) => {
    const s = sale[l.sale_id] || {}; const si = shipItem[l.shipment_item_id]; const sh = si && ship[si.shipment_id];
    return {
      'رقم الفاتورة': s.sale_no, 'التاريخ': day(s.sale_date), 'الزبون': cust[s.customer_id] || s.customer_name || '',
      'الصنف': item[l.item_id], 'صاحب البضاعة': sh ? sup[sh.supplier_id] : '', 'الوحدة': l.unit === 'kg' ? 'كيلو' : 'عدد',
      'العدد': num(l.qty), 'الوزن': num(l.weight), 'السعر': num(l.price), 'القيمة': num(l.amount),
      'نوع الصندوق': crate[l.crate_type_id] || '', 'الصناديق': num(l.crates), 'الرهن': num(l.deposit_amount), 'ملغية': yes(s.voided),
    };
  }));
  sheet(X, wb, 'التحصيلات', d.customer_payments.map((p) => ({
    'رقم': p.id, 'التاريخ': day(p.pay_date), 'الزبون': cust[p.customer_id], 'المبلغ': num(p.amount),
    'ملاحظات': p.notes, 'ملغية': yes(p.voided), 'المحاسب': user[p.created_by],
  })));
  sheet(X, wb, 'مرتجع الصناديق', d.crate_returns.map((r) => ({
    'رقم': r.id, 'التاريخ': day(r.return_date), 'الزبون': cust[r.customer_id], 'نوع الصندوق': crate[r.crate_type_id],
    'العدد': num(r.count), 'القيمة': num(r.amount), 'الطريقة': r.method === 'account' ? 'اتخصم من حسابه' : 'نقدي', 'ملاحظات': r.notes,
  })));
  sheet(X, wb, 'العملاء (الموردين)', d.suppliers.map((s) => ({
    'رقم': s.id, 'الاسم': s.name, 'التليفون': s.phone, 'العمولة %': num(s.commission_pct), 'ملاحظات': s.notes, 'شغال': yes(s.active),
  })));
  sheet(X, wb, 'النقلات', d.shipments.map((s) => ({
    'رقم': s.id, 'التاريخ': day(s.ship_date), 'العميل': sup[s.supplier_id], 'العربية': s.truck, 'السواق': s.driver,
    'الأصناف': d.shipment_items.filter((i) => i.shipment_id === s.id).map((i) => `${item[i.item_id]} ${Number(i.qty)}`).join('، '),
    'النولون': num(s.freight), 'الدخان': num(s.unloading), 'مصاريف أخرى': num(s.other_expenses),
    'رقم الفاتورة': d.settlements.find((x) => x.id === s.settlement_id)?.settle_no ?? '', 'ملاحظات': s.notes,
  })));
  sheet(X, wb, 'فواتير العملاء', settlementRows(d, sup, user));
  sheet(X, wb, 'العهدة لدى العملاء', advanceRows(d, sup, user));
  sheet(X, wb, 'حركة الفلوس', d.cash_movements.map((m) => ({
    'رقم': m.id, 'التاريخ': day(m.mv_date), 'الوقت': time(m.created_at), 'دخل': m.direction === 'in' ? num(m.amount) : '',
    'خرج': m.direction === 'out' ? num(m.amount) : '', 'النوع': CASH_CAT[m.category] || m.category, 'البيان': m.description, 'الجهة': m.party,
    'رقم العهدة': m.shift_id ?? '', 'المحاسب': user[m.created_by],
  })));
  sheet(X, wb, 'عهد المحاسبين', d.cash_shifts.map((s) => ({
    'رقم': s.id, 'المحاسب': s.user_name, 'فتحها': time(s.opened_at), 'قفلها': time(s.closed_at), 'الحالة': ST[s.status] ?? s.status,
    'أول العهدة': num(s.opening_amount), 'دخل': num(s.total_in), 'خرج': num(s.total_out), 'المفروض': num(s.expected_amount),
    'الفعلي': num(s.counted_amount), 'عجز/زيادة': num(s.difference), 'اتراجعت': yes(s.reviewed_at), 'ملاحظات': s.notes,
  })));
  sheet(X, wb, 'الأصناف', d.items.map((i) => ({ 'رقم': i.id, 'الاسم': i.name, 'الوحدة': i.default_unit === 'kg' ? 'كيلو' : 'عدد', 'شغال': yes(i.active) })));
  sheet(X, wb, 'الصناديق', d.crate_types.map((c) => ({ 'رقم': c.id, 'الاسم': c.name, 'الرهن': num(c.deposit), 'شغال': yes(c.active) })));
  sheet(X, wb, 'المستخدمين', d.users.map((u) => ({ 'اسم الدخول': u.username, 'الاسم': u.full_name, 'النوع': u.role === 'admin' ? 'مدير' : 'محاسب', 'شغال': yes(u.active) })));
  return wb;
}

function settlementRows(d, sup, user, only) {
  return d.settlements.filter((s) => !only || s.supplier_id === only).map((s) => ({
    'رقم الفاتورة': s.settle_no, 'التاريخ': day(s.created_at), 'العميل': sup[s.supplier_id], 'العدد': num(s.total_qty), 'الوزن': num(s.total_weight),
    'إجمالي البيع': num(s.gross_sales), 'العمولة %': num(s.commission_pct), 'العمولة': num(s.commission_amount), 'النولون': num(s.freight),
    'الدخان': num(s.unloading), 'مصاريف أخرى': num(s.other_expenses), 'الصافي': num(s.net_amount),
    'خصم من العهدة': num(s.advance_deducted), 'المطلوب صرفه': num(s.net_amount - (s.advance_deducted || 0)),
    'الحالة': ST[s.status] ?? s.status, 'تاريخ الصرف': day(s.paid_at), 'عملها': user[s.created_by], 'ملاحظات': s.notes,
  }));
}
function advanceRows(d, sup, user, only) {
  return (d.supplier_advances || []).filter((a) => !only || a.supplier_id === only).map((a) => ({
    'رقم': a.id, 'التاريخ': day(a.adv_date), 'العميل': sup[a.supplier_id], 'المبلغ': num(a.amount), 'ملاحظات': a.notes,
    'ملغي': yes(a.voided), 'بواسطة': user[a.created_by],
  }));
}

// ---------------- العملاء (الموردين) ----------------
function suppliersBook(X, d, list) {
  const wb = book(X);
  const sup = idx(d.suppliers), item = idx(d.items), user = idx(d.users, (u) => u.full_name || u.username);
  sheet(X, wb, 'ملخص العملاء', list.map((s) => {
    const st = d.settlements.filter((x) => x.supplier_id === s.id && x.status !== 'rejected');
    return {
      'العميل': s.name, 'التليفون': s.phone, 'العمولة %': num(s.commission_pct), 'عدد الفواتير': st.length,
      'إجمالي البيع': st.reduce((a, x) => a + Number(x.gross_sales), 0), 'إجمالي الصافي': st.reduce((a, x) => a + Number(x.net_amount), 0),
      'نقلات بتتباع': num(s.open_shipments), 'مستني موافقة': num(s.pending_amount), 'مستحق له': num(s.due_amount),
      'اتصرف له': num(s.paid_amount), 'العهدة لدى العميل': num(s.advance_balance),
    };
  }));
  sheet(X, wb, 'كل الفواتير', settlementRows(d, sup, user));
  sheet(X, wb, 'كل النقلات', d.shipment_items.map((i) => {
    const s = d.shipments.find((x) => x.id === i.shipment_id) || {};
    return { 'التاريخ': day(s.ship_date), 'العميل': sup[s.supplier_id], 'العربية': s.truck, 'الصنف': item[i.item_id], 'العدد': num(i.qty),
      'رقم الفاتورة': d.settlements.find((x) => x.id === s.settlement_id)?.settle_no ?? 'لسه بتتباع' };
  }));
  sheet(X, wb, 'العهدة لدى العملاء', advanceRows(d, sup, user));
  // صفحة لكل عميل فيها فواتيره ومقدماته
  for (const s of d.suppliers) {
    const rows = settlementRows(d, sup, user, s.id).map((r) => { const { 'العميل': _, ...rest } = r; return rest; });
    const adv = advanceRows(d, sup, user, s.id);
    if (!rows.length && !adv.length) continue;
    sheet(X, wb, s.name, [...rows, ...(adv.length ? [{}, { 'رقم الفاتورة': 'المقدمات (العهدة لدى العميل)' },
      ...adv.map((a) => ({ 'رقم الفاتورة': 'مقدم', 'التاريخ': a['التاريخ'], 'الصافي': a['المبلغ'], 'الحالة': a['ملغي'] === 'نعم' ? 'ملغي' : '', 'ملاحظات': a['ملاحظات'] }))] : [])]);
  }
  return wb;
}

// ---------------- الزمامات ----------------
function zimamBook(X, rows) {
  const wb = book(X);
  sheet(X, wb, 'الزمامات', rows.filter((r) => Number(r.balance) > 0).map((r) => ({
    'الزبون': r.name, 'التليفون': r.phone, 'الضامن': r.guarantor, 'عليه': num(r.balance), 'أقدم فاتورة مش مدفوعة': day(r.oldest_unpaid),
    'متأخر (يوم)': num(r.days_late), 'آخر دفعة': day(r.last_payment), 'من آخر دفعة (يوم)': num(r.days_since_payment),
    'عدد مرات الشراء': num(r.purchases), 'مرات الآجل': num(r.credit_purchases), 'إجمالي مشترياته': num(r.total_purchases),
    'آخر شراء': day(r.last_sale), 'حد الآجل': num(r.credit_limit), 'تقييم السداد': num(r.rating_pay), 'التقييم العام': num(r.rating_general),
    'ملاحظة': r.rating_note, 'صناديق عنده': Array.isArray(r.crates) ? r.crates.map((c) => `${c.count} ${c.name}`).join('، ') : '',
  })));
  sheet(X, wb, 'كل الزباين', rows.map((r) => ({
    'الزبون': r.name, 'التليفون': r.phone, 'الضامن': r.guarantor, 'عليه': num(r.balance), 'عدد مرات الشراء': num(r.purchases),
    'إجمالي مشترياته': num(r.total_purchases), 'آخر شراء': day(r.last_sale), 'آخر دفعة': day(r.last_payment),
  })));
  return wb;
}

export const FILES = { all: 'العجمي - كل البيانات', zimam: 'العجمي - الزمامات', suppliers: 'العجمي - العملاء' };

// بيرجّع الملفات التلاتة جاهزة: [{ key, name, wb }]
export async function buildBackup() {
  const [X, d, zimam, list] = await Promise.all([
    loadXLSX(), api.rpc('export_all'), api.rpc('report_zimam', { min_days: 0 }), api.rpc('list_suppliers', { include_inactive: true }),
  ]);
  return { X, files: [
    { key: 'all', name: FILES.all, wb: allBook(X, d) },
    { key: 'zimam', name: FILES.zimam, wb: zimamBook(X, zimam) },
    { key: 'suppliers', name: FILES.suppliers, wb: suppliersBook(X, d, list) },
  ] };
}

export async function downloadBackup(key) {
  const { X, files } = await buildBackup();
  for (const f of files.filter((x) => !key || x.key === key)) X.writeFile(f.wb, `${f.name} ${todayISO()}.xlsx`);
}

// ---------------- برنامج الويندوز: حفظ تلقائي في الفولدر اللي اتختار وقت التسطيب ----------------
const host = window.chrome?.webview;
export const desktop = !!host;
let waiters = {};
let seq = 0;
if (host) {
  host.addEventListener('message', (e) => {
    const m = e.data || {};
    const w = waiters[m.id];
    if (w) { delete waiters[m.id]; m.error ? w.rej(new Error(m.error)) : w.res(m); }
  });
}
export function hostCall(type, data = {}) {
  if (!host) return Promise.reject(new Error('الميزة دي في برنامج الويندوز بس'));
  const id = ++seq;
  return new Promise((res, rej) => {
    waiters[id] = { res, rej };
    host.postMessage({ ...data, type, id });
    setTimeout(() => { if (waiters[id]) { delete waiters[id]; rej(new Error('البرنامج مردش')); } }, 120000);
  });
}

export async function saveToFolder() {
  const { X, files } = await buildBackup();
  const out = files.map((f) => ({ name: f.name + '.xlsx', data: X.write(f.wb, { type: 'base64', bookType: 'xlsx' }) }));
  return hostCall('save-backup', { files: out });
}

let running = false;
// بيتنده بعد الدخول وكل ساعة: لو عدّى 24 ساعة من آخر نسخة يعمل نسخة جديدة
export async function autoBackup(app) {
  if (!host || running || !app?.can?.('backup')) return;
  running = true;
  try {
    const cfg = await hostCall('backup-config');
    if (!cfg.dir || !cfg.due) return;
    const r = await saveToFolder();
    console.info('نسخة احتياطية اتحفظت في', r.dir);
  } catch (e) {
    console.warn('النسخة الاحتياطية التلقائية فشلت:', e.message);
  } finally { running = false; }
}
