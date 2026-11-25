import { api } from './api.js';
import { esc, icon, err, toast } from './ui.js';
import * as dash from './pages/dashboard.js';
import * as sale from './pages/sale.js';
import * as cust from './pages/customers.js';
import * as sup from './pages/suppliers.js';
import * as cash from './pages/cash.js';
import * as appr from './pages/approvals.js';
import * as rep from './pages/reports.js';
import * as set from './pages/settings.js';
import * as login from './pages/login.js';

export const app = {
  me: null, settings: null, crate_types: [], items: [], pending: 0,
  can(p) { return !!this.me && this.me.active && (this.me.role === 'admin' || !!this.me.perms?.[p]); },
  go(hash) { if (location.hash === hash) route(); else location.hash = hash; },
  async reload() {
    const b = await api.rpc('app_bootstrap');
    Object.assign(app, { me: b.me, settings: b.settings, crate_types: b.crate_types || [], items: b.items || [] });
    return b;
  },
  setPending(nr) { app.pending = nr; const el = document.querySelector('[data-pending]'); if (el) { el.textContent = nr; el.classList.toggle('hidden', !nr); } },
};

// [المسار، الصفحة، الصلاحية المطلوبة]
const ROUTES = [
  [/^\/?$/, dash.render],
  [/^\/sale$/, sale.renderNew, 'sales'],
  [/^\/sales$/, sale.renderList],
  [/^\/sales\/(\d+)$/, sale.renderView],
  [/^\/customers$/, cust.renderList],
  [/^\/customers\/(\d+)$/, cust.renderView],
  [/^\/crates$/, cust.renderCrates],
  [/^\/suppliers$/, sup.renderSuppliers],
  [/^\/suppliers\/(\d+)$/, sup.renderSupplier],
  [/^\/shipments$/, sup.renderShipments],
  [/^\/shipments\/new$/, sup.renderShipmentForm, 'suppliers'],
  [/^\/shipments\/(\d+)\/edit$/, sup.renderShipmentForm, 'suppliers'],
  [/^\/shipments\/(\d+)$/, sup.renderShipment],
  [/^\/settlements$/, sup.renderSettlements],
  [/^\/stock$/, sup.renderStock],
  [/^\/settlements\/new$/, sup.renderSettlementNew, 'settlements'],
  [/^\/settlements\/(\d+)$/, sup.renderSettlement],
  [/^\/cash$/, cash.render, ['cash', 'reports', 'sales', 'collections', 'payouts']],
  [/^\/approvals$/, appr.render, 'approve'],
  [/^\/reports$/, rep.render, 'reports'],
  [/^\/debts$/, rep.renderDebts, ['reports', 'collections', 'customers']],
  [/^\/settings$/, set.render, ['settings', 'users', 'backup']],
  [/^\/account$/, set.renderAccount],
];

const NAV = [
  ['', 'الرئيسية', 'home'],
  ['sale', 'بيع جديد', 'cart', 'sales'],
  ['sales', 'فواتير البيع', 'receipt'],
  ['customers', 'الزباين والحسابات', 'users'],
  ['crates', 'الصناديق', 'crate'],
  { grp: 'الموردين' },
  ['shipments', 'النقلات الواردة', 'truck'],
  ['stock', 'الأصناف', 'box'],
  ['suppliers', 'الموردين', 'users'],
  ['settlements', 'فواتير الموردين', 'scale'],
  { grp: 'الفلوس والإدارة' },
  ['cash', 'العهدة', 'wallet', ['cash', 'reports', 'sales', 'collections', 'payouts']],
  ['approvals', 'الموافقات', 'approve', 'approve'],
  ['reports', 'التقارير', 'chart', 'reports'],
  ['settings', 'الإعدادات', 'gear', ['settings', 'users', 'backup']],
];

const allowed = (perm) => !perm || (Array.isArray(perm) ? perm.some((p) => app.can(p)) : app.can(perm));

function shell() {
  const logo = 'img/logo.png';
  document.body.innerHTML = `
  <div class="shell">
    <aside class="side" id="side">
      <div class="brand"><img src="${logo}" alt=""><div><b>${esc(app.settings?.shop_name || 'العجمي')}</b><span>حسابات المحل</span></div></div>
      <nav class="nav">${NAV.map((x) => {
        if (x.grp) return `<div class="grp">${esc(x.grp)}</div>`;
        const [path, label, ic, perm] = x;
        if (!allowed(perm)) return '';
        const pill = path === 'approvals' ? `<span class="pill hidden" data-pending>0</span>` : '';
        return `<a href="#/${path}" data-nav="${path}">${icon(ic)}<span>${esc(label)}</span>${pill}</a>`;
      }).join('')}</nav>
      <div class="me">
        <div class="avatar">${esc((app.me.full_name || app.me.username).trim().charAt(0))}</div>
        <div class="who"><b>${esc(app.me.full_name || app.me.username)}</b><span>${app.me.role === 'admin' ? 'مدير' : 'محاسب'}</span></div>
        <button data-acc title="حسابي" aria-label="حسابي">${icon('user')}</button><button data-logout title="خروج" aria-label="خروج">${icon('logout')}</button>
      </div>
    </aside>
    <div class="main">
      <div class="topbar"><button data-menu aria-label="القائمة">${icon('menu')}</button><b>${esc(app.settings?.shop_name || '')}</b><img src="${logo}" alt=""></div>
      <main class="page" id="page"></main>
    </div>
    <nav class="bottom-nav">${[['', 'الرئيسية', 'home'], ['sale', 'بيع', 'cart', 'sales'], ['customers', 'الزباين', 'users'],
      ['cash', 'العهدة', 'wallet', ['cash', 'reports', 'sales', 'collections', 'payouts']]]
      .filter((x) => allowed(x[3])).map(([path, label, ic]) => `<a href="#/${path}" data-nav="${path}">${icon(ic)}<span>${label}</span></a>`).join('')}
      <button data-more>${icon('more')}<span>المزيد</span></button></nav>
  </div>`;
  document.querySelector('[data-logout]').onclick = async () => { await api.logout(); location.hash = ''; start(); };
  document.querySelector('[data-acc]').onclick = () => app.go('#/account');
  document.querySelector('[data-menu]').onclick = () => document.getElementById('side').classList.toggle('open');
  document.querySelector('[data-more]').onclick = () => document.getElementById('side').classList.toggle('open');
  document.getElementById('side').addEventListener('click', (e) => { if (e.target.closest('a')) e.currentTarget.classList.remove('open'); });
  app.setPending(app.pending);
}

let routeToken = 0;
async function route() {
  const page = document.getElementById('page');
  if (!page) return;
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs || ''));
  document.querySelectorAll('[data-nav]').forEach((a) => {
    const p = a.dataset.nav;
    a.classList.toggle('on', p === '' ? path === '/' : path === '/' + p || path.startsWith('/' + p + '/'));
  });
  for (const [re, fn, perm] of ROUTES) {
    const mt = path.match(re);
    if (!mt) continue;
    if (!allowed(perm)) { page.innerHTML = `<div class="empty"><b>مش عندك صلاحية للصفحة دي</b>اطلبها من المدير</div>`; return; }
    const token = ++routeToken;
    page.innerHTML = '<div class="empty">جاري التحميل…</div>';
    window.scrollTo(0, 0);
    try {
      await fn({ app, el: page, params: mt.slice(1), query, alive: () => token === routeToken });
    } catch (e) {
      if (token === routeToken) page.innerHTML = `<div class="empty"><b>حصلت مشكلة</b>${esc(e.message)}</div>`;
    }
    return;
  }
  page.innerHTML = `<div class="empty"><b>الصفحة دي مش موجودة</b><a href="#/">ارجع للرئيسية</a></div>`;
}

function pendingScreen() {
  document.body.innerHTML = `<div class="login"><div class="art"><img src="img/logo.png" alt=""><div><h1>حسابك اتعمل</h1>
    <p>المدير لازم يفعّل حسابك ويديلك الصلاحيات الأول. بعد ما يفعّله دوس "حاول تاني".</p></div><span></span></div>
    <div class="form"><div><h2>مستني تفعيل المدير</h2><p class="muted">اسم المستخدم: <b>${esc(app.me.username)}</b></p>
    <div class="row"><button class="btn primary" data-retry>حاول تاني</button><button class="btn" data-out>خروج</button></div></div></div></div>`;
  document.querySelector('[data-retry]').onclick = start;
  document.querySelector('[data-out]').onclick = async () => { await api.logout(); start(); };
}

export async function start() {
  try {
    const s = await api.session();
    if (!s) return login.render(start);
    await app.reload();
    if (!app.me.active) return pendingScreen();
    shell();
    route();
    if (app.can('approve')) {
      api.rpc('dashboard').then((d) => app.setPending(d.pending)).catch(() => {});
    }
  } catch (e) {
    if (/تسجل دخول|الجلسة|غير موجود/.test(e.message)) { await api.logout(); return login.render(start); }
    document.body.innerHTML = `<div class="empty" style="padding-top:20vh"><b>مش قادر أوصل للسيرفر</b>${esc(e.message)}<br><br><button class="btn primary" onclick="location.reload()">حاول تاني</button></div>`;
  }
}

window.addEventListener('hashchange', route);
window.addEventListener('unhandledrejection', (e) => { err(e.reason); });
if (api.dev) toast('وضع التجربة المحلية');
start();

if ('serviceWorker' in navigator && !api.dev) navigator.serviceWorker.register('sw.js').catch(() => {});
