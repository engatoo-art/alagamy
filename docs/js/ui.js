// أدوات الواجهة المشتركة

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const nf2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const nf3 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
export const n = (v) => Number(v || 0);
export const money = (v) => `<span class="num">${nf2.format(n(v))}</span>`;
export const moneyT = (v) => nf2.format(n(v));
export const qtyT = (v) => nf3.format(n(v));
export const qty = (v) => `<span class="num">${nf3.format(n(v))}</span>`;
export const round2 = (v) => Math.round(n(v) * 100) / 100;

export function todayISO() {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return p; // YYYY-MM-DD
}
export function addDays(iso, d) {
  const t = new Date(iso + 'T12:00:00Z');
  t.setUTCDate(t.getUTCDate() + d);
  return t.toISOString().slice(0, 10);
}
export function monthRange(iso, offset = 0) {
  const t = new Date(iso + 'T12:00:00Z');
  const first = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + offset, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + offset + 1, 0));
  return [first.toISOString().slice(0, 10), last.toISOString().slice(0, 10)];
}
const days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
export function dateT(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
export const date = (iso) => `<span class="num">${dateT(iso)}</span>`;
export function dateLong(iso) {
  const t = new Date(String(iso).slice(0, 10) + 'T12:00:00Z');
  return `${days[t.getUTCDay()]} ${t.getUTCDate()} ${months[t.getUTCMonth()]} ${t.getUTCFullYear()}`;
}
export const monthName = (m) => months[m];

export const UNIT = { kg: 'كيلو', count: 'عدد' };
export const PAY = { cash: 'نقدي', credit: 'آجل' };
export const STATUS = {
  pending: 'مستني موافقة', approved: 'متوافق عليها', rejected: 'مرفوضة', paid: 'اتصرفت', not_required: '',
};
export const CASH_CAT = {
  sale: 'بيع نقدي', collection: 'تحصيل من زبون', funding: 'تمويل الدرج', other_in: 'وارد آخر',
  crate_refund: 'رد رهن صناديق', supplier_payment: 'صرف لمورد', transport: 'أجرة نقل', bill: 'فاتورة / مصروفات',
  salary: 'يوميات وأجور', withdrawal: 'سحب من الدرج', other_out: 'مصروف آخر', sale_void: 'إلغاء فاتورة', payment_void: 'إلغاء دفعة',
};
export const PERMS = [
  ['sales', 'البيع وعمل الفواتير'],
  ['sales_void', 'إلغاء الفواتير'],
  ['customers', 'إضافة وتعديل الزباين'],
  ['collections', 'تحصيل الفلوس ومرتجع الصناديق'],
  ['suppliers', 'الموردين والنقلات'],
  ['settlements', 'عمل تصفيات الموردين'],
  ['payouts', 'صرف التصفيات بعد الموافقة'],
  ['cash', 'العهدة (وارد ومنصرف)'],
  ['reports', 'التقارير'],
  ['approve', 'الموافقات (فواتير الآجل والتصفيات)'],
  ['backup', 'النسخة الاحتياطية Excel'],
  ['settings', 'الإعدادات والصناديق والأصناف'],
  ['users', 'المستخدمين والصلاحيات'],
];

export function tag(cls, text) { return text ? `<span class="tag ${cls}">${esc(text)}</span>` : ''; }
export function statusTag(s) { return tag(s, STATUS[s] || ''); }

// ---------- رسائل ----------
let toastBox;
export function toast(msg, type = '') {
  if (!toastBox) { toastBox = document.createElement('div'); toastBox.className = 'toasts'; }
  if (!toastBox.isConnected) document.body.append(toastBox);
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  toastBox.append(t);
  setTimeout(() => t.remove(), type === 'err' ? 6000 : 3500);
}
export const ok = (m) => toast(m, 'ok');
export const err = (e) => toast(e?.message || String(e), 'err');

// ---------- النوافذ ----------
export function modal({ title, body = '', actions = '', wide = false, onClose } = {}) {
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
      <div class="mh"><h2>${esc(title)}</h2><button class="btn ghost sm" data-close aria-label="إغلاق">✕</button></div>
      <div class="mb">${body}</div>
      ${actions ? `<div class="mf">${actions}</div>` : ''}
    </div>`;
  const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); onClose && onClose(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(); });
  ov.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  document.addEventListener('keydown', onKey);
  document.body.append(ov);
  const first = ov.querySelector('input:not([type=hidden]), select, textarea');
  if (first) setTimeout(() => first.focus(), 30);
  return { el: ov, close, $: (s) => ov.querySelector(s), $$: (s) => [...ov.querySelectorAll(s)] };
}

export function confirmBox(message, { title = 'تأكيد', yes = 'تأكيد', danger = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const m = modal({
      title, body: `<p style="margin:0">${message}</p>`,
      actions: `<button class="btn ${danger ? 'solid-danger' : 'primary'}" data-yes>${esc(yes)}</button><button class="btn" data-close>رجوع</button>`,
      onClose: () => { if (!done) resolve(false); },
    });
    m.$('[data-yes]').addEventListener('click', () => { done = true; m.close(); resolve(true); });
    m.$('[data-yes]').focus();
  });
}

export function promptBox(message, { title = 'ملاحظة', placeholder = '', yes = 'تمام', danger = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const m = modal({
      title, body: `<label class="f">${message}<input class="in" data-v placeholder="${esc(placeholder)}"></label>`,
      actions: `<button class="btn ${danger ? 'solid-danger' : 'primary'}" data-yes>${esc(yes)}</button><button class="btn" data-close>رجوع</button>`,
      onClose: () => { if (!done) resolve(null); },
    });
    const go = () => { done = true; const v = m.$('[data-v]').value.trim(); m.close(); resolve(v); };
    m.$('[data-yes]').addEventListener('click', go);
    m.$('[data-v]').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  });
}

// زرار بيستنى عملية: يقفل نفسه لحد ما تخلص
export async function busy(btn, fn) {
  if (!btn || btn.classList.contains('busy')) return;
  btn.classList.add('busy'); btn.disabled = true;
  try { return await fn(); }
  catch (e) { err(e); }
  finally { btn.classList.remove('busy'); btn.disabled = false; }
}

export function formData(root) {
  const o = {};
  root.querySelectorAll('[name]').forEach((el) => {
    if (el.type === 'checkbox') o[el.name] = el.checked;
    else if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; }
    else o[el.name] = el.value.trim();
  });
  return o;
}

export function debounce(fn, ms = 250) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function emptyState(title, hint = '') {
  return `<div class="empty"><b>${esc(title)}</b>${esc(hint)}</div>`;
}

// قائمة اختيار بالبحث
export function combo(input, { items, label, sub = () => '', onPick, max = 50 }) {
  const wrap = input.parentElement;
  wrap.classList.add('combo');
  let list = null; let hl = 0; let shown = []; let closeT = 0;
  const close = () => { list?.remove(); list = null; };
  const render = () => {
    const q = input.value.trim().toLowerCase();
    shown = items().filter((it) => !q || label(it).toLowerCase().includes(q) || String(sub(it)).toLowerCase().includes(q)).slice(0, max);
    if (!list) { list = document.createElement('div'); list.className = 'list'; wrap.append(list); }
    hl = Math.min(hl, Math.max(shown.length - 1, 0));
    list.innerHTML = shown.length
      ? shown.map((it, i) => `<div class="opt ${i === hl ? 'hl' : ''}" data-i="${i}"><span>${esc(label(it))}</span><small>${sub(it)}</small></div>`).join('')
      : '<div class="opt muted">مفيش نتايج</div>';
  };
  const pick = (i) => { const it = shown[i]; if (!it) return; input.value = label(it); close(); onPick(it); };
  input.addEventListener('focus', () => { clearTimeout(closeT); hl = 0; render(); });
  input.addEventListener('input', () => { clearTimeout(closeT); hl = 0; render(); });
  input.addEventListener('keydown', (e) => {
    if (!list) { if (e.key === 'Enter' && input.value.trim()) { render(); if (shown.length) { pick(0); e.preventDefault(); } } return; }
    if (e.key === 'ArrowDown') { hl = Math.min(hl + 1, shown.length - 1); render(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { hl = Math.max(hl - 1, 0); render(); e.preventDefault(); }
    else if (e.key === 'Enter') { if (shown.length) { pick(hl); e.preventDefault(); } }
    else if (e.key === 'Escape') close();
  });
  input.addEventListener('blur', () => { closeT = setTimeout(close, 180); });
  wrap.addEventListener('mousedown', (e) => {
    const o = e.target.closest('.opt[data-i]');
    if (o) { e.preventDefault(); pick(+o.dataset.i); }
  });
}

// أيقونات بسيطة
const P = {
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.5 12h12l2-8H6.5"/>',
  receipt: '<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c2 .7 3.2 2.5 3.6 5.2"/>',
  truck: '<path d="M2 6h11v10H2zM13 9h4l4 4v3h-8z"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
  scale: '<path d="M12 3v18M5 21h14M5 7h14M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z"/>',
  wallet: '<path d="M3 7a2 2 0 0 1 2-2h13v4"/><path d="M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2z"/><circle cx="16" cy="14.5" r="1.2"/>',
  check: '<path d="M4 12l5 5L20 6"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  print: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="1"/><path d="M6 14h12v7H6z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  back: '<path d="M9 6l6 6-6 6"/>',
  money: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>',
  crate: '<rect x="3" y="6" width="18" height="13" rx="1"/><path d="M3 11h18M8 6v13M16 6v13"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
};
export const icon = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[k] || ''}</svg>`;
