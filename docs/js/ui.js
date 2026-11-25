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
  shift_short: 'عجز في العهدة', shift_over: 'زيادة في العهدة', sale_edit: 'تعديل فاتورة', supplier_advance: 'مقدم لعميل (عهدة)', advance_return: 'رجوع مقدم من عميل', drawer_reset: 'تصفير الدرج (المدير)',
};
export const PERMS = [
  ['sales', 'البيع وعمل الفواتير'],
  ['customers', 'إضافة وتعديل الزباين'],
  ['collections', 'تحصيل الفلوس ومرتجع الصناديق'],
  ['suppliers', 'الموردين والنقلات'],
  ['settlements', 'عمل فواتير الموردين'],
  ['payouts', 'صرف فواتير الموردين بعد الموافقة'],
  ['cash', 'العهدة (وارد ومنصرف)'],
  ['reports', 'التقارير'],
  ['approve', 'الموافقات (الآجل، فواتير الموردين، الحذف والتعديل)'],
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
export function combo(input, { items, label, sub = () => '', onPick, max = 50, empty = null }) {
  const wrap = input.parentElement;
  wrap.classList.add('combo');
  let list = null; let hl = 0; let shown = []; let closeT = 0;
  // القايمة بتطلع فوق الصفحة كلها (مش جوه الجدول) علشان محدش يقصّها لو الجدول بيتحرك يمين وشمال
  const place = () => {
    if (!list) return;
    const r = input.getBoundingClientRect();
    const w = Math.min(Math.max(r.width, 380), window.innerWidth - 16);
    const below = window.innerHeight - r.bottom;
    list.style.width = w + 'px';
    list.style.left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)) + 'px';
    if (below < 220 && r.top > below) { list.style.top = ''; list.style.bottom = (window.innerHeight - r.top + 4) + 'px'; list.style.maxHeight = Math.min(320, r.top - 12) + 'px'; }
    else { list.style.bottom = ''; list.style.top = (r.bottom + 4) + 'px'; list.style.maxHeight = Math.min(320, below - 12) + 'px'; }
  };
  const close = () => {
    list?.remove(); list = null;
    window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place);
  };
  const render = () => {
    const q = input.value.trim().toLowerCase();
    shown = items().filter((it) => !q || label(it).toLowerCase().includes(q) || String(sub(it)).toLowerCase().includes(q)).slice(0, max);
    if (!list) {
      list = document.createElement('div'); list.className = 'combo-list';
      list.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const o = e.target.closest('.opt[data-i]');
        if (o) pick(+o.dataset.i);
      });
      document.body.append(list);
      window.addEventListener('scroll', place, true); window.addEventListener('resize', place);
    }
    hl = Math.min(hl, Math.max(shown.length - 1, 0));
    list.innerHTML = shown.length
      ? shown.map((it, i) => `<div class="opt ${i === hl ? 'hl' : ''}" data-i="${i}"><span>${esc(label(it))}</span><small>${sub(it)}</small></div>`).join('')
      : `<div class="opt muted" style="display:block;white-space:normal;line-height:1.8;cursor:default">${empty ? empty(q) : 'مفيش نتايج'}</div>`;
    place();
    list.querySelector('.opt.hl')?.scrollIntoView({ block: 'nearest' });
  };
  const pick = (i) => { const it = shown[i]; if (!it) return; input.value = label(it); close(); onPick(it); };
  input.addEventListener('focus', () => { clearTimeout(closeT); hl = 0; render(); });
  input.addEventListener('click', () => { if (!list) { hl = 0; render(); } });
  input.addEventListener('input', () => { clearTimeout(closeT); hl = 0; render(); });
  input.addEventListener('keydown', (e) => {
    if (!list) { if (e.key === 'Enter' && input.value.trim()) { render(); if (shown.length) { pick(0); e.preventDefault(); } } else if (e.key === 'ArrowDown') { render(); e.preventDefault(); } return; }
    if (e.key === 'ArrowDown') { hl = Math.min(hl + 1, shown.length - 1); render(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { hl = Math.max(hl - 1, 0); render(); e.preventDefault(); }
    else if (e.key === 'Enter') { if (shown.length) { pick(hl); e.preventDefault(); } }
    else if (e.key === 'Escape' || e.key === 'Tab') close();
  });
  input.addEventListener('blur', () => { closeT = setTimeout(close, 180); });
  // لو الخانة اتشالت من الصفحة (سطر اتمسح) نقفل القايمة
  const mo = new MutationObserver(() => { if (!input.isConnected) { close(); mo.disconnect(); } });
  mo.observe(document.body, { childList: true, subtree: true });
}

// أيقونات (بأسلوب Lucide)
const P = {
  home: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  cart: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
  receipt: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  userPlus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6"/><path d="M22 11h-6"/>',
  truck: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  box: '<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><path d="m3.3 7 7.703 4.734a2 2 0 0 0 1.994 0L20.7 7"/><path d="m7.5 4.27 9 5.15"/>',
  scale: '<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>',
  wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  approve: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  chart: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
  gear: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  print: '<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  menu: '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  back: '<path d="m9 18 6-6-6-6"/>',
  money: '<rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>',
  crate: '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
  edit: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  user: '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
  more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  ledger: '<path d="M2 6h4"/><path d="M2 10h4"/><path d="M2 14h4"/><path d="M2 18h4"/><rect width="16" height="20" x="4" y="2" rx="2"/><path d="M9.5 8h5"/><path d="M9.5 12H16"/><path d="M9.5 16H14"/>',
  star: '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>',
};
// نجوم التقييم
export const stars = (v, max = 5) => `<span class="stars" title="${v || 0} من ${max}">${Array.from({ length: max }, (_, i) =>
  `<svg viewBox="0 0 24 24" class="${i < v ? 'on' : ''}">${P.star}</svg>`).join('')}</span>`;
export const icon = (k) => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[k] || ''}</svg>`;
