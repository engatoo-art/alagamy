import { api } from '../api.js';
import { esc, money, moneyT, n, icon, ok, err, busy, modal, formData, tag, PERMS, emptyState, todayISO, dateT } from '../ui.js';

export async function render({ app, el, query }) {
  const tabs = [
    ['shop', 'بيانات المحل', 'settings'], ['crates', 'الصناديق والرهن', 'settings'], ['items', 'الأصناف', 'settings'],
    ['users', 'المستخدمين والصلاحيات', 'users'], ['backup', 'النسخة الاحتياطية', 'backup'],
  ].filter((t) => app.can(t[2]));
  let tab = tabs.find((t) => t[0] === query.tab)?.[0] || tabs[0][0];
  el.innerHTML = `<div class="page-head"><h1>الإعدادات</h1></div>
    <div class="tabs" id="tabs">${tabs.map((t) => `<button data-t="${t[0]}">${t[1]}</button>`).join('')}</div><div id="body"></div>`;
  const body = el.querySelector('#body');
  const show = async () => {
    el.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
    body.innerHTML = '<div class="empty">جاري التحميل…</div>';
    await ({ shop, crates, items, users, backup })[tab](app, body, query);
  };
  el.querySelector('#tabs').onclick = (e) => { const b = e.target.closest('button'); if (b) { tab = b.dataset.t; query.user = null; show().catch(err); } };
  await show();
}

// ---------- بيانات المحل ----------
async function shop(app, body) {
  const s = app.settings;
  body.innerHTML = `<div class="panel"><div class="pb grid" id="sf" style="max-width:640px">
    <label class="f">اسم المحل (بيظهر على الفواتير)<input class="in" name="shop_name" value="${esc(s.shop_name)}"></label>
    <div class="grid g2"><label class="f">التليفون<input class="in" name="phone" dir="ltr" value="${esc(s.phone)}"></label>
    <label class="f">العمولة الافتراضية للموردين الجداد %<input class="in" name="default_commission" type="number" step="0.01" value="${n(s.default_commission)}"></label></div>
    <label class="f">العنوان<input class="in" name="address" value="${esc(s.address)}"></label>
    <label class="f">جملة آخر الإيصال<input class="in" name="receipt_footer" value="${esc(s.receipt_footer)}"></label>
    <div><button class="btn primary" id="save">حفظ</button></div></div></div>`;
  body.querySelector('#save').onclick = (e) => busy(e.currentTarget, async () => {
    app.settings = await api.rpc('save_settings', formData(body.querySelector('#sf')));
    ok('اتحفظت بيانات المحل');
  });
}

// ---------- الصناديق ----------
async function crates(app, body) {
  const draw = () => {
    body.innerHTML = `<div class="panel"><div class="ph"><h2>أنواع الصناديق</h2><button class="btn sm primary" data-add>${icon('plus')} نوع جديد</button></div>
      <div class="tbl-wrap"><table class="t"><thead><tr><th>النوع</th><th class="n">قيمة الرهن</th><th>الحالة</th><th></th></tr></thead>
      <tbody>${app.crate_types.map((c) => `<tr><td><b>${esc(c.name)}</b></td><td class="n">${n(c.deposit) ? money(c.deposit) : '<span class="muted">بدون رهن</span>'}</td>
        <td>${c.active ? tag('ok', 'شغال') : tag('void', 'موقوف')}</td><td><button class="btn sm ghost" data-ed="${c.id}">${icon('edit')} تعديل</button></td></tr>`).join('')}</tbody></table></div>
      <div class="pb muted small">الصندوق اللي رهنه 0 (زي الخشب) بيتسجل في الفاتورة بس من غير ما يتحسب على الزبون.</div></div>`;
    body.querySelector('[data-add]').onclick = () => form({});
    body.querySelectorAll('[data-ed]').forEach((b) => b.onclick = () => form(app.crate_types.find((c) => c.id === +b.dataset.ed)));
  };
  const form = (c) => {
    const m = modal({
      title: c.id ? 'تعديل الصندوق' : 'نوع صندوق جديد',
      body: `<form class="grid" id="f"><label class="f">الاسم<input class="in" name="name" value="${esc(c.name || '')}" required></label>
        <label class="f">قيمة الرهن (0 = بدون رهن)<input class="in" name="deposit" type="number" min="0" value="${n(c.deposit)}"></label>
        ${c.id ? `<label class="check"><input type="checkbox" name="active" ${c.active ? 'checked' : ''}> شغال</label>` : ''}</form>`,
      actions: '<button class="btn primary" data-ok>حفظ</button><button class="btn" data-close>رجوع</button>',
    });
    m.$('[data-ok]').onclick = () => busy(m.$('[data-ok]'), async () => {
      await api.rpc('save_crate_type', { ...formData(m.$('#f')), id: c.id || null });
      await app.reload(); ok('اتحفظ'); m.close(); draw();
    });
  };
  draw();
}

// ---------- الأصناف ----------
async function items(app, body) {
  const draw = () => {
    body.innerHTML = `<div class="panel"><div class="ph"><h2>الأصناف</h2><button class="btn sm primary" data-add>${icon('plus')} صنف جديد</button></div>
      ${app.items.length ? `<div class="tbl-wrap"><table class="t"><thead><tr><th>الصنف</th><th>بيتباع غالبًا</th><th>الحالة</th><th></th></tr></thead>
      <tbody>${app.items.map((i) => `<tr><td><b>${esc(i.name)}</b></td><td>${i.default_unit === 'kg' ? 'بالكيلو' : 'بالعدد'}</td>
        <td>${i.active ? tag('ok', 'شغال') : tag('void', 'موقوف')}</td><td><button class="btn sm ghost" data-ed="${i.id}">${icon('edit')} تعديل</button></td></tr>`).join('')}</tbody></table></div>`
      : emptyState('لسه مفيش أصناف', 'الأصناف بتتضاف لوحدها لما تسجل نقلة، أو ضيفها من هنا')}</div>`;
    body.querySelector('[data-add]').onclick = () => form({ default_unit: 'kg', active: true });
    body.querySelectorAll('[data-ed]').forEach((b) => b.onclick = () => form(app.items.find((c) => c.id === +b.dataset.ed)));
  };
  const form = (it) => {
    const m = modal({
      title: it.id ? 'تعديل الصنف' : 'صنف جديد',
      body: `<form class="grid" id="f"><label class="f">الاسم<input class="in" name="name" value="${esc(it.name || '')}" required></label>
        <label class="f">بيتباع غالبًا<select class="in" name="default_unit"><option value="kg" ${it.default_unit === 'kg' ? 'selected' : ''}>بالكيلو</option>
        <option value="count" ${it.default_unit === 'count' ? 'selected' : ''}>بالعدد</option></select></label>
        ${it.id ? `<label class="check"><input type="checkbox" name="active" ${it.active ? 'checked' : ''}> شغال</label>` : ''}</form>`,
      actions: '<button class="btn primary" data-ok>حفظ</button><button class="btn" data-close>رجوع</button>',
    });
    m.$('[data-ok]').onclick = () => busy(m.$('[data-ok]'), async () => {
      await api.rpc('save_item', { ...formData(m.$('#f')), id: it.id || null });
      await app.reload(); ok('اتحفظ'); m.close(); draw();
    });
  };
  draw();
}

// ---------- المستخدمين ----------
async function users(app, body, query) {
  const draw = async () => {
    const list = await api.rpc('list_users');
    body.innerHTML = `<div class="row" style="margin-bottom:14px"><button class="btn primary" id="addUser">${icon('userPlus')} إضافة محاسب أو مدير</button>
        <span class="muted small">أو المحاسب يعمل حساب بنفسه من صفحة الدخول، وانت تفعّله من هنا.</span></div>
      <div class="panel"><div class="tbl-wrap"><table class="t"><thead><tr><th>الاسم</th><th>اسم الدخول</th><th>النوع</th><th>الحالة</th><th>الصلاحيات</th><th></th></tr></thead>
      <tbody>${list.map((u) => `<tr><td><b>${esc(u.full_name || '—')}</b></td><td class="num">${esc(u.username)}</td>
        <td>${u.role === 'admin' ? tag('approved', 'مدير') : 'محاسب'}</td><td>${u.active ? tag('ok', 'شغال') : tag('pending', 'مستني تفعيل')}</td>
        <td class="small muted">${u.role === 'admin' ? 'كل الصلاحيات' : PERMS.filter(([k]) => u.perms?.[k]).map(([, l]) => l).join('، ') || 'ولا حاجة'}</td>
        <td><button class="btn sm ${u.active ? 'ghost' : 'primary'}" data-u="${u.id}">${u.active ? 'تعديل' : 'تفعيل'}</button></td></tr>`).join('')}</tbody></table></div></div>`;
    body.querySelectorAll('[data-u]').forEach((b) => b.onclick = () => form(list.find((u) => u.id === b.dataset.u)));
    body.querySelector('#addUser').onclick = () => form(null);
    if (query.user) { const u = list.find((x) => x.id === query.user); query.user = null; if (u) form(u); }
  };
  const form = (u) => {
    const isNew = !u;
    u = u || { full_name: '', username: '', role: 'accountant', active: true, perms: { sales: true, collections: true, customers: true } };
    const self = u.id === app.me.id;
    const m = modal({
      title: isNew ? 'إضافة مستخدم جديد' : 'صلاحيات ' + (u.full_name || u.username), wide: true,
      body: `<form class="grid" id="f">
        ${isNew ? `<div class="grid g2"><label class="f">اسم الدخول (بالإنجليزي)<input class="in" name="username" dir="ltr" autocapitalize="none" placeholder="مثلاً: mona"></label>
          <label class="f">كلمة المرور (6 على الأقل)<input class="in" name="password" dir="ltr" placeholder="ابعتها للمحاسب"></label></div>` : ''}
        <div class="grid g3"><label class="f">الاسم<input class="in" name="full_name" value="${esc(u.full_name)}"></label>
        <label class="f">النوع<select class="in" name="role" ${self ? 'disabled' : ''}><option value="accountant" ${u.role !== 'admin' ? 'selected' : ''}>محاسب</option>
          <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>مدير (كل الصلاحيات)</option></select></label>
        <label class="check" style="align-self:end"><input type="checkbox" name="active" checked ${self ? 'disabled' : ''}> الحساب شغال</label></div>
        <div id="pp"><div class="row" style="margin:4px 0 10px"><b>الصلاحيات</b><button type="button" class="btn sm ghost" data-all>اختار الكل</button><button type="button" class="btn sm ghost" data-none>شيل الكل</button></div>
        <div class="perm-grid">${PERMS.map(([k, l]) => `<label class="check"><input type="checkbox" data-p="${k}" ${u.perms?.[k] ? 'checked' : ''}> ${l}</label>`).join('')}</div></div>
      </form>`,
      actions: '<button class="btn primary" data-ok>حفظ</button><button class="btn" data-close>رجوع</button>',
    });
    const role = m.$('[name=role]');
    const syncRole = () => m.$('#pp').classList.toggle('hidden', role.value === 'admin');
    role.onchange = syncRole; syncRole();
    m.$('[data-all]').onclick = () => m.$$('[data-p]').forEach((c) => c.checked = true);
    m.$('[data-none]').onclick = () => m.$$('[data-p]').forEach((c) => c.checked = false);
    m.$('[data-ok]').onclick = () => busy(m.$('[data-ok]'), async () => {
      const perms = Object.fromEntries(m.$$('[data-p]').map((c) => [c.dataset.p, c.checked]));
      if (isNew) {
        if (!m.$('[name=full_name]').value.trim()) throw new Error('اكتب اسم المحاسب');
        u.id = await api.createUser(m.$('[name=username]').value, m.$('[name=password]').value, m.$('[name=full_name]').value.trim());
      }
      const p = { id: u.id, full_name: m.$('[name=full_name]').value.trim(), perms };
      if (!self) { p.role = role.value; p.active = m.$('[name=active]').checked; }
      await api.rpc('save_user', p);
      ok(isNew ? `اتعمل حساب ${p.full_name} — اسم الدخول ${m.$('[name=username]').value.trim().toLowerCase()}` : 'اتحفظت الصلاحيات');
      m.close(); draw().catch(err);
    });
  };
  await draw();
}

// ---------- النسخة الاحتياطية ----------
const SHEETS = {
  customers: ['الزباين', { id: 'رقم', name: 'الاسم', phone: 'التليفون', address: 'العنوان', balance: 'الرصيد', credit_approved: 'مسموح آجل', credit_limit: 'حد الآجل', notes: 'ملاحظات', active: 'شغال', created_at: 'تاريخ الإضافة' }],
  sales: ['الفواتير', { id: 'id', sale_no: 'رقم الفاتورة', sale_date: 'التاريخ', customer_id: 'رقم الزبون', customer_name: 'اسم زبون نقدي', payment_type: 'الدفع', goods_total: 'البضاعة', deposit_total: 'الرهن', discount: 'خصم', grand_total: 'الإجمالي', paid_amount: 'المدفوع', approval_status: 'الموافقة', voided: 'ملغية', notes: 'ملاحظات' }],
  sale_lines: ['سطور الفواتير', { id: 'id', sale_id: 'id الفاتورة', item_id: 'رقم الصنف', shipment_item_id: 'سطر النقلة', unit: 'الوحدة', qty: 'العدد', weight: 'الوزن', price: 'السعر', amount: 'القيمة', crate_type_id: 'نوع الصندوق', crates: 'الصناديق', deposit_amount: 'الرهن' }],
  customer_payments: ['التحصيلات', { id: 'رقم', pay_date: 'التاريخ', customer_id: 'رقم الزبون', amount: 'المبلغ', notes: 'ملاحظات', voided: 'ملغية' }],
  crate_returns: ['مرتجع الصناديق', { id: 'رقم', return_date: 'التاريخ', customer_id: 'رقم الزبون', crate_type_id: 'نوع الصندوق', count: 'العدد', amount: 'القيمة', method: 'الطريقة', notes: 'ملاحظات' }],
  suppliers: ['الموردين', { id: 'رقم', name: 'الاسم', phone: 'التليفون', commission_pct: 'العمولة %', notes: 'ملاحظات', active: 'شغال' }],
  shipments: ['النقلات', { id: 'رقم', supplier_id: 'رقم المورد', ship_date: 'التاريخ', truck: 'العربية', driver: 'السواق', freight: 'النولون', unloading: 'العتالة', other_expenses: 'مصاريف أخرى', settlement_id: 'رقم التصفية', notes: 'ملاحظات' }],
  shipment_items: ['أصناف النقلات', { id: 'id', shipment_id: 'رقم النقلة', item_id: 'رقم الصنف', qty: 'العدد' }],
  settlements: ['التصفيات', { id: 'id', settle_no: 'رقم التصفية', supplier_id: 'رقم المورد', created_at: 'التاريخ', gross_sales: 'المبيعات', commission_pct: 'العمولة %', commission_amount: 'العمولة', freight: 'النولون', unloading: 'العتالة', other_expenses: 'مصاريف', net_amount: 'الصافي', status: 'الحالة', total_weight: 'الوزن', total_qty: 'العدد' }],
  cash_movements: ['العهدة', { id: 'رقم', mv_date: 'التاريخ', created_at: 'الوقت', direction: 'وارد/منصرف', amount: 'المبلغ', category: 'النوع', description: 'البيان', party: 'الجهة' }],
  items: ['الأصناف', { id: 'رقم', name: 'الاسم', default_unit: 'الوحدة', active: 'شغال' }],
  crate_types: ['الصناديق', { id: 'رقم', name: 'الاسم', deposit: 'الرهن', active: 'شغال' }],
  users: ['المستخدمين', { username: 'اسم الدخول', full_name: 'الاسم', role: 'النوع', active: 'شغال', created_at: 'تاريخ الإنشاء' }],
};

function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = rej;
    document.head.append(s);
  });
}
// أداة Excel: من نسخة جوه البرنامج لو موجودة، وإلا من النت
async function loadXLSX() {
  if (window.XLSX) return window.XLSX;
  try { await loadScript('js/vendor/xlsx.full.min.js'); }
  catch {
    try { await loadScript('https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js'); }
    catch { throw new Error('مش قادر أحمّل أداة Excel — اتأكد من النت'); }
  }
  return window.XLSX;
}

async function backup(app, body) {
  const last = localStorage.getItem('last_backup');
  body.innerHTML = `<div class="panel"><div class="pb grid" style="max-width:640px">
    <p style="margin:0">كل بياناتك محفوظة أونلاين، ومش بتضيع لو الكمبيوتر باظ. النسخة دي زيادة أمان: ملف Excel فيه كل حاجة (الزباين والفواتير والتحصيلات والنقلات والتصفيات والعهدة)، وتقدر تفتحه وتقراه على أي جهاز.</p>
    <p class="muted small" style="margin:0">آخر نسخة نزلت من الجهاز ده: ${last ? new Date(+last).toLocaleString('ar-EG') : 'لسه مفيش'}</p>
    <div class="row"><button class="btn primary lg" id="x">${icon('download')} تنزيل نسخة Excel</button><button class="btn lg" id="j">نسخة JSON كاملة</button></div>
    <p class="muted small" style="margin:0">احفظ الملف على فلاشة أو Google Drive أو ابعته لنفسك على الواتساب.</p>
  </div></div>`;
  const name = `العجمي-نسخة-احتياطية-${todayISO()}`;
  body.querySelector('#x').onclick = (e) => busy(e.currentTarget, async () => {
    const [X, data] = await Promise.all([loadXLSX(), api.rpc('export_all')]);
    const wb = X.utils.book_new();
    wb.Workbook = { Views: [{ RTL: true }] };
    for (const [key, [sheet, cols]] of Object.entries(SHEETS)) {
      const rows = (data[key] || []).map((r) => Object.fromEntries(Object.entries(cols).map(([k, label]) => {
        let v = r[k];
        if (typeof v === 'boolean') v = v ? 'نعم' : 'لا';
        else if (v !== null && v !== '' && !isNaN(v) && typeof v !== 'object' && !/date|_at|phone|name|notes/.test(k)) v = Number(v);
        return [label, v ?? ''];
      })));
      const ws = X.utils.json_to_sheet(rows.length ? rows : [Object.fromEntries(Object.values(cols).map((l) => [l, '']))]);
      ws['!cols'] = Object.values(cols).map((l) => ({ wch: Math.max(10, l.length + 4) }));
      X.utils.book_append_sheet(wb, ws, sheet);
    }
    X.writeFile(wb, name + '.xlsx');
    localStorage.setItem('last_backup', Date.now());
    ok('نزلت النسخة الاحتياطية');
  });
  body.querySelector('#j').onclick = (e) => busy(e.currentTarget, async () => {
    const data = await api.rpc('export_all');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
    a.download = name + '.json'; a.click();
    localStorage.setItem('last_backup', Date.now());
  });
}

// ---------- حسابي ----------
export async function renderAccount({ app, el }) {
  el.innerHTML = `<div class="page-head"><h1>حسابي</h1></div>
    <div class="panel"><div class="pb grid" style="max-width:420px">
      <div>الاسم: <b>${esc(app.me.full_name)}</b><br>اسم الدخول: <b class="num">${esc(app.me.username)}</b><br>النوع: ${app.me.role === 'admin' ? 'مدير' : 'محاسب'}</div>
      <label class="f">كلمة مرور جديدة<input class="in" type="password" id="p1" dir="ltr" autocomplete="new-password"></label>
      <label class="f">اكتبها تاني<input class="in" type="password" id="p2" dir="ltr" autocomplete="new-password"></label>
      <div><button class="btn primary" id="save">تغيير كلمة المرور</button></div></div></div>`;
  el.querySelector('#save').onclick = (e) => busy(e.currentTarget, async () => {
    const a = el.querySelector('#p1').value, b = el.querySelector('#p2').value;
    if (a.length < 6) throw new Error('كلمة المرور لازم تكون 6 حروف أو أرقام على الأقل');
    if (a !== b) throw new Error('الكلمتين مش زي بعض');
    await api.changePassword(a);
    ok('اتغيرت كلمة المرور');
    el.querySelector('#p1').value = el.querySelector('#p2').value = '';
  });
}
