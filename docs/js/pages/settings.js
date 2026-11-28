import { api } from '../api.js';
import { desktop, hostCall, saveToFolder, downloadBackup } from '../backup.js';
import { esc, money, moneyT, n, icon, ok, err, busy, modal, formData, tag, PERMS, emptyState, todayISO, dateT, confirmBox, waLink } from '../ui.js';

// لينك البرنامج اللي بيتبعت للمحاسب
const SITE = 'https://engatoo-art.github.io/alagamy/';
const welcomeText = (u, pw) => `أهلاً ${u.full_name || u.username}\nده لينك برنامج محل العجمي:\n${SITE}\nاسم الدخول: ${u.username}${pw ? '\nكلمة المرور: ' + pw + '\n(غيّرها من "حسابي" أول ما تدخل)' : ''}`;
const contactLinks = (u, text) => [
  u.whatsapp || u.phone ? `<a class="btn sm ghost" style="color:#128c4a" target="_blank" rel="noopener" href="${waLink(u.whatsapp || u.phone, text)}" title="واتساب">${icon('chat')} واتساب</a>` : '',
  u.phone ? `<a class="btn sm ghost" href="tel:${esc(u.phone)}" title="اتصال">${icon('phone')}</a>` : '',
  u.email ? `<a class="btn sm ghost" href="mailto:${esc(u.email)}" title="${esc(u.email)}">${icon('mail')}</a>` : '',
].join('');

export async function render({ app, el, query }) {
  const tabs = [
    ['shop', 'بيانات المحل', 'settings'], ['crates', 'الصناديق والرهن', 'settings'], ['items', 'الأصناف', 'settings'],
    ['users', 'المستخدمين والصلاحيات', 'users'], ['backup', 'النسخة الاحتياطية', 'backup'],
    ...(api.php ? [['update', 'تحديث البرنامج', 'admin']] : []),
  ].filter((t) => (t[2] === 'users' || t[2] === 'admin' ? app.me.role === 'admin' : app.can(t[2])));
  let tab = tabs.find((t) => t[0] === query.tab)?.[0] || tabs[0][0];
  el.innerHTML = `<div class="page-head"><h1>الإعدادات</h1></div>
    <div class="tabs" id="tabs">${tabs.map((t) => `<button data-t="${t[0]}">${t[1]}</button>`).join('')}</div><div id="body"></div>`;
  const body = el.querySelector('#body');
  const show = async () => {
    el.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
    body.innerHTML = '<div class="empty">جاري التحميل…</div>';
    await ({ shop, crates, items, users, backup, update })[tab](app, body, query);
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
    <label class="f">العنوان اللي فوق فاتورة المورد<input class="in" name="invoice_title" value="${esc(s.invoice_title || 'محلات عبده العجمي وأولاده (محمد وعبدالرحمن)')}"></label>
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
    const all = await api.rpc('list_users');
    const list = all.filter((u) => !u.deleted_at), gone = all.filter((u) => u.deleted_at);
    body.innerHTML = `<div class="row" style="margin-bottom:14px"><button class="btn primary" id="addUser">${icon('userPlus')} إضافة محاسب أو مدير</button>
        <span class="muted small">محدش يقدر يعمل حساب غير المدير من هنا.</span></div>
      <div class="panel"><div class="tbl-wrap"><table class="t"><thead><tr><th>الاسم</th><th>اسم الدخول</th><th>التواصل</th><th>النوع</th><th>الحالة</th><th>الصلاحيات</th><th></th></tr></thead>
      <tbody>${list.map((u) => `<tr><td><b>${esc(u.full_name || '—')}</b>${u.id === app.me.id ? ' <span class="muted small">(انت)</span>' : ''}
          ${u.phone ? `<div class="small muted num" dir="ltr" style="text-align:right">${esc(u.phone)}</div>` : ''}</td><td class="num">${esc(u.username)}</td>
        <td style="white-space:nowrap">${contactLinks(u, welcomeText(u)) || '<span class="muted small">—</span>'}</td>
        <td>${u.role === 'admin' ? tag('approved', 'مدير') : 'محاسب'}</td><td>${u.active ? tag('ok', 'شغال') : tag('pending', 'موقوف')}</td>
        <td class="small muted">${u.role === 'admin' ? 'كل الصلاحيات' : PERMS.filter(([k]) => u.perms?.[k]).map(([, l]) => l).join('، ') || 'ولا حاجة'}</td>
        <td style="white-space:nowrap"><button class="btn sm ${u.active ? 'ghost' : 'primary'}" data-u="${u.id}">${u.active ? 'تعديل' : 'تفعيل'}</button>
          ${u.id !== app.me.id && u.role !== 'admin' ? `<button class="btn sm ghost danger" data-del="${u.id}">${icon('trash')} حذف</button>` : ''}</td></tr>`).join('')}</tbody></table></div></div>
      ${gone.length ? `<div class="panel"><div class="ph"><h2>${icon('trash')} حسابات محذوفة</h2><span class="muted small">تقدر تسترجع أي حساب خلال 7 أيام من حذفه، وبعدها بيتمسح نهائي.</span></div>
        <div class="tbl-wrap"><table class="t"><thead><tr><th>الاسم</th><th>اسم الدخول</th><th>اتحذف</th><th>حذفه</th><th>فاضل للمسح النهائي</th><th></th></tr></thead>
        <tbody>${gone.map((u) => `<tr class="void"><td><b>${esc(u.full_name || '—')}</b></td><td class="num">${esc(u.username)}</td>
          <td>${dateT(String(u.deleted_at).slice(0, 10))}</td><td class="small muted">${esc(u.deleted_by_name || '')}</td>
          <td>${tag(u.days_left <= 1 ? 'rejected' : 'pending', u.days_left <= 0 ? 'النهارده' : u.days_left === 1 ? 'يوم واحد' : u.days_left + ' أيام')}</td>
          <td><button class="btn sm primary" data-res="${u.id}">${icon('back')} استرجاع</button></td></tr>`).join('')}</tbody></table></div></div>` : ''}`;
    body.querySelectorAll('[data-u]').forEach((b) => b.onclick = () => form(list.find((u) => u.id === b.dataset.u)));
    body.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
      const u = list.find((x) => x.id === b.dataset.del);
      if (!await confirmBox(`هتحذف حساب <b>${esc(u.full_name || u.username)}</b>.<br><br>
          • مش هيقدر يدخل البرنامج من دلوقتي.<br>
          • الفواتير والعهد اللي عملها هتفضل زي ما هي وباسمه.<br>
          • تقدر تسترجعه خلال <b>7 أيام</b> من "حسابات محذوفة" تحت، وبعدها بيتمسح نهائي.`, { title: 'حذف حساب', yes: 'احذف الحساب', danger: true })) return;
      await busy(b, async () => { await api.rpc('delete_user', { id: u.id }); ok(`اتحذف حساب ${u.full_name || u.username} — تقدر تسترجعه خلال 7 أيام`); await draw(); });
    });
    body.querySelectorAll('[data-res]').forEach((b) => b.onclick = () => busy(b, async () => {
      const u = gone.find((x) => x.id === b.dataset.res);
      await api.rpc('restore_user', { id: u.id });
      ok(`رجع حساب ${u.full_name || u.username} زي ما كان`); await draw();
    }));
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
          <label class="f">كلمة المرور (8 على الأقل)<input class="in" name="password" dir="ltr" placeholder="ابعتها للمحاسب"></label></div>` : ''}
        <div class="grid g3"><label class="f">الاسم<input class="in" name="full_name" value="${esc(u.full_name)}"></label>
        <label class="f">النوع<select class="in" name="role" ${self ? 'disabled' : ''}><option value="accountant" ${u.role !== 'admin' ? 'selected' : ''}>محاسب</option>
          <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>مدير (كل الصلاحيات)</option></select></label>
        <label class="check" style="align-self:end"><input type="checkbox" name="active" checked ${self ? 'disabled' : ''}> الحساب شغال</label></div>
        <div><b>بيانات التواصل</b> <span class="muted small">(اختياري)</span></div>
        <div class="grid g3"><label class="f">رقم الموبايل<input class="in" name="phone" type="tel" dir="ltr" value="${esc(u.phone || '')}" placeholder="01xxxxxxxxx"></label>
          <label class="f">رقم الواتساب<input class="in" name="whatsapp" type="tel" dir="ltr" value="${esc(u.whatsapp || '')}" placeholder="لو فاضي هيستخدم رقم الموبايل"></label>
          <label class="f">الإيميل<input class="in" name="email" type="email" dir="ltr" value="${esc(u.email || '')}" placeholder="name@gmail.com"></label></div>
        ${!isNew && !self ? `<div class="panel" style="margin:0;background:var(--paper-2, #f7f8f4)"><div class="pb grid" style="gap:10px">
          <div><b>${icon('key')} نسي كلمة السر؟</b> <span class="muted small">اكتبله كلمة سر جديدة وابعتهاله. هيخرج من كل الأجهزة اللي فاتح عليها.</span></div>
          <div class="row"><input class="in" id="npw" dir="ltr" autocomplete="new-password" placeholder="كلمة السر الجديدة (8 على الأقل)" style="flex:1;min-width:200px">
            <button type="button" class="btn sm" id="gen">اعمل كلمة سر</button><button type="button" class="btn sm warn" id="setpw">${icon('key')} غيّر كلمة السر</button></div>
        </div></div>` : ''}
        <div id="pp"><div class="row" style="margin:4px 0 10px"><b>الصلاحيات</b><button type="button" class="btn sm ghost" data-all>اختار الكل</button><button type="button" class="btn sm ghost" data-none>شيل الكل</button></div>
        <div class="perm-grid">${PERMS.map(([k, l]) => `<label class="check"><input type="checkbox" data-p="${k}" ${u.perms?.[k] ? 'checked' : ''}> ${l}</label>`).join('')}</div></div>
      </form>`,
      actions: '<button class="btn primary" data-ok>حفظ</button><button class="btn" data-close>رجوع</button>',
    });
    const gen = m.$('#gen');
    if (gen) {
      gen.onclick = () => {
        const a = 'abcdefghjkmnpqrstuvwxyz23456789';
        const r = crypto.getRandomValues(new Uint32Array(8));
        m.$('#npw').value = Array.from(r, (x) => a[x % a.length]).join('').replace(/^(.{4})/, '$1-');
      };
      m.$('#setpw').onclick = () => busy(m.$('#setpw'), async () => {
        const pw = m.$('#npw').value.trim();
        if (pw.length < 8) throw new Error('كلمة المرور لازم تكون 8 حروف أو أرقام على الأقل');
        await api.rpc('save_user', { id: u.id, phone: m.$('[name=phone]').value.trim(), whatsapp: m.$('[name=whatsapp]').value.trim(), email: m.$('[name=email]').value.trim() });
        await api.rpc('admin_set_password', { id: u.id, password: pw });
        const cur = { ...u, phone: m.$('[name=phone]').value.trim() || u.phone, whatsapp: m.$('[name=whatsapp]').value.trim() || u.whatsapp, email: m.$('[name=email]').value.trim() || u.email };
        m.close();
        const d = modal({
          title: 'كلمة السر اتغيرت',
          body: `<div class="grid"><div>كلمة السر الجديدة لـ <b>${esc(u.full_name || u.username)}</b>:</div>
            <div class="num" dir="ltr" style="font-size:24px;font-weight:700;text-align:center;padding:12px;border:2px dashed var(--line);border-radius:10px;user-select:all">${esc(pw)}</div>
            <div class="muted small">اسم الدخول: <b class="num">${esc(u.username)}</b>. ابعتهاله دلوقتي — مش هتظهر تاني.</div>
            <div class="row">${contactLinks(cur, welcomeText(cur, pw))}<button class="btn sm" id="cp">${icon('copy')} انسخ</button></div></div>`,
          actions: '<button class="btn primary" data-close>تمام</button>',
        });
        d.$('#cp').onclick = async () => { try { await navigator.clipboard.writeText(welcomeText(cur, pw)); ok('اتنسخت الرسالة'); } catch { err(new Error('مش قادر أنسخ — انسخها بإيدك')); } };
        draw().catch(err);
      });
    }
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
      const p = { id: u.id, full_name: m.$('[name=full_name]').value.trim(), perms,
        phone: m.$('[name=phone]').value.trim(), whatsapp: m.$('[name=whatsapp]').value.trim(), email: m.$('[name=email]').value.trim() };
      if (!self) { p.role = role.value; p.active = m.$('[name=active]').checked; }
      await api.rpc('save_user', p);
      ok(isNew ? `اتعمل حساب ${p.full_name} — اسم الدخول ${m.$('[name=username]').value.trim().toLowerCase()}` : 'اتحفظت الصلاحيات');
      m.close(); draw().catch(err);
    });
  };
  await draw();
}

// ---------- النسخة الاحتياطية ----------
// نسخة الاستضافة: تحديث البرنامج لآخر نسخة بضغطة واحدة
async function update(app, body) {
  const v = await api.rpc('app_version');
  const dl = v.downloads || {};
  const dlPage = new URL('download/', location.href.split('#')[0]).href;
  body.innerHTML = `<div class="panel"><div class="pb grid" style="max-width:640px">
    <div>النسخة الحالية: <b class="num">${esc(v.version || 'غير معروفة')}</b> <span class="muted small">— PHP ${esc(v.php)}</span></div>
    <p class="muted" style="margin:0">لما أبعتلك إن فيه تعديل جديد، دوس الزرار ده والبرنامج هيتحدث لوحده من غير ما بياناتك تتأثر.
      بعد التحديث كل الأجهزة هتاخد النسخة الجديدة أول ما تتفتح.</p>
    <div><button class="btn primary lg" id="upd">${icon('download')} حدّث البرنامج لآخر نسخة</button></div>
  </div></div>
  <div class="panel" style="margin-top:14px"><div class="pb grid" style="max-width:640px">
    <h2>تحميل برنامج الكمبيوتر والموبايل</h2>
    <p class="muted" style="margin:0">ابعت اللينك ده لأي حد عايز يسطّب البرنامج — كل الملفات على موقعك:</p>
    <div dir="ltr" style="text-align:left;font-weight:600"><a href="${esc(dlPage)}" target="_blank" rel="noopener">${esc(dlPage)}</a></div>
    <div class="small">برنامج الكمبيوتر: <b>${dl['AlagamySetup.exe'] ? 'موجود — ' + esc(dl['AlagamySetup.exe']) : 'لسه مش متنزّل'}</b><br>
      تطبيق الموبايل: <b>${dl['Alagamy.apk'] ? 'موجود — ' + esc(dl['Alagamy.apk']) : 'لسه مش متنزّل'}</b></div>
    <div><button class="btn lg" id="dlu">${icon('download')} حدّث ملفات التحميل</button></div>
  </div></div>`;
  body.querySelector('#upd').onclick = (e) => busy(e.currentTarget, async () => {
    const r = await api.rpc('self_update');
    ok(`اتحدث البرنامج (${r.files} ملف) — النسخة ${r.version}`);
    setTimeout(() => location.reload(), 1200);
  });
  body.querySelector('#dlu').onclick = (e) => busy(e.currentTarget, async () => {
    await api.rpc('update_downloads');
    ok('ملفات التحميل اتحدثت');
    setTimeout(() => location.reload(), 1200);
  });
}

async function backup(app, body) {
  const desk = desktop ? await hostCall('backup-config').catch(() => null) : null;
  body.innerHTML = `<div class="panel"><div class="pb grid" style="max-width:720px">
    <p style="margin:0">كل بياناتك محفوظة أونلاين في قاعدة البيانات. النسخة دي زيادة أمان: 3 ملفات Excel بالأسماء مش بالأرقام، تتفتح على أي جهاز من غير البرنامج:</p>
    <ul style="margin:0;padding-inline-start:20px;line-height:1.9">
      <li><b>كل البيانات</b>: الزباين، فواتير البيع وتفاصيلها، التحصيلات، الصناديق، النقلات، فواتير العملاء، العهدة لدى العملاء، حركة الفلوس، عهد المحاسبين.</li>
      <li><b>الزمامات</b>: كل زبون عليه فلوس، متأخر كام يوم، الضامن والتقييم.</li>
      <li><b>العملاء</b>: ملخص كل عميل، كل فواتيره ونقلاته ومقدماته، وصفحة لكل عميل لوحده.</li>
    </ul>
    ${desk ? `<div class="alert info">
        <b>الحفظ التلقائي شغال</b> — البرنامج بيحفظ الملفات التلاتة لوحده كل 24 ساعة في:<br>
        <div dir="ltr" style="text-align:left;word-break:break-all;font-weight:600">${esc(desk.dir || "لسه مفيش فولدر")}</div>
        آخر حفظ: <b>${desk.last ? new Date(desk.last).toLocaleString('ar-EG') : 'لسه مفيش'}</b> — وبيحتفظ بنسخة كل يوم في فولدر "نسخ قديمة" لمدة 60 يوم.
      </div>
      <div class="row"><button class="btn primary lg" id="now">${icon('download')} احفظ دلوقتي</button>
        <button class="btn lg" id="dir">غيّر مكان الحفظ</button><button class="btn lg" id="open">افتح الفولدر</button></div>`
    : `<div class="row"><button class="btn primary lg" data-k="">${icon('download')} نزّل الـ 3 ملفات</button>
        <button class="btn lg" data-k="all">كل البيانات بس</button><button class="btn lg" data-k="zimam">الزمامات بس</button><button class="btn lg" data-k="suppliers">العملاء بس</button></div>
      <p class="muted small" style="margin:0">في برنامج الويندوز الملفات بتتحفظ لوحدها كل 24 ساعة في الفولدر اللي تختاره.</p>`}
    <hr style="border:0;border-top:1px solid var(--line-2);margin:4px 0">
    <div><b>نسخة كاملة (JSON)</b><p class="muted small" style="margin:4px 0 8px">ملف واحد فيه كل البيانات بالظبط زي ما هي في قاعدة البيانات. ده اللي هيتنقل بيه البرنامج لسيرفر محلي على الكمبيوتر بعدين — احتفظ بيه.</p>
      <button class="btn lg" id="json">${icon('download')} نزّل النسخة الكاملة</button></div>
  </div></div>`;
  body.querySelector('#json').onclick = (e) => busy(e.currentTarget, async () => {
    const data = await api.rpc('export_all');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
    a.download = `العجمي - نسخة كاملة ${todayISO()}.json`;
    document.body.append(a); a.click(); a.remove();
    ok('نزلت النسخة الكاملة');
  });
  body.querySelectorAll('[data-k]').forEach((b) => b.onclick = () => busy(b, async () => { await downloadBackup(b.dataset.k || null); ok('نزلت النسخة الاحتياطية'); }));
  const now = body.querySelector('#now'), dir = body.querySelector('#dir'), open = body.querySelector('#open');
  if (now) now.onclick = () => busy(now, async () => { const r = await saveToFolder(); ok('اتحفظت في ' + r.dir); backup(app, body); });
  if (dir) dir.onclick = () => busy(dir, async () => { const r = await hostCall('pick-folder'); if (r.dir) { ok('المكان الجديد: ' + r.dir); backup(app, body); } });
  if (open) open.onclick = () => hostCall('open-folder').catch(err);
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
    if (a.length < 8) throw new Error('كلمة المرور لازم تكون 8 حروف أو أرقام على الأقل');
    if (a !== b) throw new Error('الكلمتين مش زي بعض');
    await api.changePassword(a);
    ok('اتغيرت كلمة المرور');
    el.querySelector('#p1').value = el.querySelector('#p2').value = '';
  });
}
