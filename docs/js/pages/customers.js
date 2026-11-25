import { api } from '../api.js';
import {
  esc, money, moneyT, qty, n, icon, ok, err, busy, modal, formData, tag, date, todayISO, monthRange,
  emptyState, debounce, statusTag,
} from '../ui.js';
import { statementDoc, paymentDoc, crateDoc } from '../print.js';

// نافذة إضافة / تعديل زبون — بترجع الزبون بعد الحفظ أو null
export function customerForm(app, c = {}) {
  return new Promise((resolve) => {
    let saved = null;
    const canApprove = app.can('approve');
    const m = modal({
      title: c.id ? 'تعديل بيانات الزبون' : 'زبون جديد',
      body: `<form class="grid" id="cf">
        <label class="f">الاسم<input class="in" name="name" required value="${esc(c.name || '')}"></label>
        <div class="grid g2"><label class="f">التليفون<input class="in" name="phone" dir="ltr" value="${esc(c.phone || '')}"></label>
        <label class="f">العنوان<input class="in" name="address" value="${esc(c.address || '')}"></label></div>
        ${canApprove ? `<div class="grid g2" style="align-items:end">
            <label class="check"><input type="checkbox" name="credit_approved" ${c.credit_approved ? 'checked' : ''}> مسموح له بالآجل</label>
            <label class="f">حد الآجل (0 = من غير حد)<input class="in" name="credit_limit" type="number" min="0" value="${n(c.credit_limit) || ''}"></label></div>`
          : (c.credit_approved ? '<div class="alert info">الزبون ده مسموح له بالآجل</div>'
            : `<label class="check"><input type="checkbox" name="credit_requested" ${c.credit_requested ? 'checked' : ''}> اطلب من المدير يسمح له بالآجل</label>`)}
        <label class="f">الضامن (تبع مين)<input class="in" name="guarantor" value="${esc(c.guarantor || '')}" placeholder="مثلاً: الحاج سيد"></label>
        <label class="f">ملاحظات<input class="in" name="notes" value="${esc(c.notes || '')}"></label>
        ${c.id ? `<label class="check"><input type="checkbox" name="active" ${c.active !== false ? 'checked' : ''}> الحساب شغال</label>` : ''}
      </form>`,
      actions: '<button class="btn primary" data-ok>حفظ</button><button class="btn" data-close>رجوع</button>',
      onClose: () => resolve(saved),
    });
    const save = () => busy(m.$('[data-ok]'), async () => {
      const v = formData(m.$('#cf'));
      saved = await api.rpc('save_customer', { ...v, id: c.id || null });
      ok('اتحفظ ' + saved.name);
      m.close();
    });
    m.$('[data-ok]').onclick = save;
    m.$('#cf').onsubmit = (e) => { e.preventDefault(); save(); };
  });
}

// ======================= قايمة الزباين =======================
export async function renderList({ app, el }) {
  el.innerHTML = `
  <div class="page-head"><h1>الزباين والحسابات</h1>
    ${app.can('customers') || app.can('sales') ? `<button class="btn primary" id="add">${icon('plus')} زبون جديد</button>` : ''}</div>
  <div class="panel"><div class="pb row">
    <input class="in" id="q" placeholder="دوّر بالاسم أو التليفون" style="flex:1;min-width:200px">
    <label class="check"><input type="checkbox" id="debt"> اللي عليهم فلوس بس</label>
  </div></div>
  <div class="panel" id="res"></div>`;
  const res = el.querySelector('#res');
  const load = async () => {
    const rows = await api.rpc('list_customers', { search: el.querySelector('#q').value.trim(), only_debt: el.querySelector('#debt').checked });
    const total = rows.reduce((a, r) => a + Math.max(0, n(r.balance)), 0);
    res.innerHTML = rows.length ? `<div class="tbl-wrap"><table class="t"><thead><tr><th>الزبون</th><th>التليفون</th><th>الآجل</th><th>الصناديق</th><th class="n">الرصيد</th></tr></thead>
      <tbody>${rows.map((c) => `<tr class="click" data-id="${c.id}"><td><b>${esc(c.name)}</b></td><td class="num muted">${esc(c.phone)}</td>
        <td>${c.credit_approved ? tag('ok', 'مسموح' + (n(c.credit_limit) ? ' لحد ' + moneyT(c.credit_limit) : '')) : c.credit_requested ? tag('pending', 'مستني موافقة') : ''}</td>
        <td>${c.crates.map((x) => tag('crate', `${x.count} ${x.name}`)).join(' ')}</td>
        <td class="n ${n(c.balance) > 0 ? 't-out' : n(c.balance) < 0 ? 't-in' : ''}"><b>${money(c.balance)}</b></td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="4">${rows.length} زبون</td><td class="n">${money(total)}</td></tr></tfoot></table></div>`
      : emptyState('مفيش زباين بالاسم ده', 'اعمل زبون جديد من الزرار اللي فوق');
    res.querySelectorAll('[data-id]').forEach((r) => r.onclick = () => app.go('#/customers/' + r.dataset.id));
  };
  el.querySelector('#q').addEventListener('input', debounce(() => load().catch(err)));
  el.querySelector('#debt').addEventListener('change', () => load().catch(err));
  const add = el.querySelector('#add');
  if (add) add.onclick = async () => { const c = await customerForm(app); if (c) app.go('#/customers/' + c.id); };
  await load();
}

// ======================= تحصيل دفعة =======================
export function paymentModal(app, c, after) {
  const m = modal({
    title: 'تحصيل من ' + c.name,
    body: `<div class="alert info" style="margin-bottom:12px">الرصيد الحالي: <b>${money(c.balance)}</b></div>
      <form class="grid" id="pf">
        <label class="f">المبلغ المدفوع<input class="in big" name="amount" type="number" min="0" step="0.01" value="${n(c.balance) > 0 ? n(c.balance) : ''}" required></label>
        <label class="f">ملاحظة<input class="in" name="notes" placeholder="مثلاً: دفعة من حساب الأسبوع"></label>
        <label class="check"><input type="checkbox" name="print" checked> اطبع إيصال للزبون</label>
      </form>`,
    actions: `<button class="btn primary" data-ok>${icon('money')} استلام المبلغ</button><button class="btn" data-close>رجوع</button>`,
  });
  const go = () => busy(m.$('[data-ok]'), async () => {
    const v = formData(m.$('#pf'));
    const r = await api.rpc('add_payment', { customer_id: c.id, amount: v.amount, notes: v.notes });
    ok(`اتسجل استلام ${moneyT(r.amount)} واتضاف للعهدة`);
    if (v.print) paymentDoc({ ...r, notes: v.notes }, app.settings);
    m.close(); after && after();
  });
  m.$('[data-ok]').onclick = go;
  m.$('#pf').onsubmit = (e) => { e.preventDefault(); go(); };
}

// ======================= مرتجع صناديق =======================
export function crateModal(app, c, after) {
  if (!c.crates?.length) { err(new Error('الزبون ده مش عليه صناديق برهن')); return; }
  const m = modal({
    title: 'مرتجع صناديق — ' + c.name,
    body: `<form class="grid" id="rf">
      <label class="f">نوع الصندوق<select class="in" name="crate_type_id">${c.crates.map((x) =>
        `<option value="${x.crate_type_id}" data-dep="${x.deposit}" data-max="${x.count}">${esc(x.name)} — عليه ${x.count} (رهن ${moneyT(x.deposit)})</option>`).join('')}</select></label>
      <label class="f">عدد الصناديق اللي رجعت<input class="in big" name="count" type="number" min="1" step="1" required></label>
      <div class="grid">
        <label class="check"><input type="radio" name="method" value="account" ${n(c.balance) > 0 ? 'checked' : ''}> اخصم قيمة الرهن من حسابه</label>
        <label class="check"><input type="radio" name="method" value="cash" ${n(c.balance) > 0 ? '' : 'checked'}> رجّع له الرهن نقدي من العهدة</label>
      </div>
      <div class="alert info" id="rv">قيمة الرهن: 0</div>
      <label class="f">ملاحظة<input class="in" name="notes"></label>
      <label class="check"><input type="checkbox" name="print" checked> اطبع إيصال</label>
    </form>`,
    actions: `<button class="btn primary" data-ok>${icon('crate')} تسجيل المرتجع</button><button class="btn" data-close>رجوع</button>`,
  });
  const sel = m.$('[name=crate_type_id]'); const cnt = m.$('[name=count]');
  const upd = () => {
    const o = sel.selectedOptions[0]; const max = +o.dataset.max;
    cnt.max = max;
    if (!cnt.value) cnt.value = max;
    m.$('#rv').innerHTML = `قيمة الرهن: <b>${moneyT(n(cnt.value) * n(o.dataset.dep))}</b>` + (n(cnt.value) > max ? ` <span class="t-out">— عليه ${max} بس</span>` : '');
  };
  sel.onchange = () => { cnt.value = ''; upd(); }; cnt.oninput = upd; upd();
  const go = () => busy(m.$('[data-ok]'), async () => {
    const v = formData(m.$('#rf'));
    const r = await api.rpc('return_crates', { customer_id: c.id, crate_type_id: v.crate_type_id, count: v.count, method: v.method, notes: v.notes });
    ok(r.method === 'cash' ? `اتسجل المرتجع واتصرف ${moneyT(r.amount)} من العهدة` : `اتسجل المرتجع واتخصم ${moneyT(r.amount)} من الحساب`);
    if (v.print) crateDoc(r, app.settings);
    m.close(); after && after();
  });
  m.$('[data-ok]').onclick = go;
  m.$('#rf').onsubmit = (e) => { e.preventDefault(); go(); };
}

// ======================= كشف حساب زبون =======================
export async function renderView({ app, el, params, query }) {
  const id = +params[0];
  const [mf] = monthRange(todayISO());
  const F = { from: query.from || mf, to: query.to || todayISO() };
  const draw = async () => {
    const st = await api.rpc('customer_statement', { id, ...F });
    const c = { ...st.customer, balance: st.balance, crates: st.crates };
    const owes = n(st.balance) > 0;
    el.innerHTML = `
    <div class="page-head" style="margin-bottom:12px"><a class="btn ghost sm" href="#/customers">${icon('back')} الزباين</a></div>
    <div class="account ${owes ? 'owes' : ''}">
      <div class="stamp"><div>حساب<b class="num">${c.id}</b></div></div>
      <div><h1>${esc(c.name)}</h1>
        <div class="meta">${c.guarantor ? `الضامن: <b>${esc(c.guarantor)}</b> — ` : ''}${c.phone ? `<span class="num">${esc(c.phone)}</span> — ` : ''}${c.credit_approved ? 'مسموح له بالآجل' + (n(c.credit_limit) ? ' لحد ' + moneyT(c.credit_limit) : '') : c.credit_requested ? 'طلب الآجل مستني موافقة المدير' : 'نقدي بس'}</div>
        <div class="crates-row">${st.crates.map((x) => tag('crate', `${x.count} ${x.name}`)).join('') || '<span class="muted small">مش عليه صناديق</span>'}</div>
      </div>
      <div class="bal"><div class="k">${owes ? 'عليه' : n(st.balance) < 0 ? 'ليه عندنا' : 'الحساب'}</div>
        <div class="v ${owes ? 't-out' : 't-in'}">${money(Math.abs(n(st.balance)))} <small>ج</small></div></div>
    </div>
    <div class="row" style="margin:14px 0">
      ${app.can('collections') ? `<button class="btn primary" data-a="pay">${icon('money')} تحصيل دفعة</button>` : ''}
      ${app.can('collections') && st.crates.length ? `<button class="btn" data-a="crates">${icon('crate')} مرتجع صناديق</button>` : ''}
      ${app.can('sales') ? `<a class="btn" href="#/sale?customer=${c.id}">${icon('cart')} بيع جديد</a>` : ''}
      <button class="btn" data-a="print">${icon('print')} طباعة كشف الحساب</button>
      ${app.can('customers') || app.can('approve') ? `<button class="btn ghost" data-a="edit">${icon('edit')} تعديل</button>` : ''}
    </div>
    <div class="panel"><div class="ph"><h2>كشف الحساب</h2>
      <label class="f" style="flex-direction:row;align-items:center">من<input class="in" type="date" id="f1" value="${F.from}" style="width:auto"></label>
      <label class="f" style="flex-direction:row;align-items:center">إلى<input class="in" type="date" id="f2" value="${F.to}" style="width:auto"></label></div>
      <div class="tbl-wrap"><table class="t"><thead><tr><th>التاريخ</th><th>البيان</th><th class="n">عليه</th><th class="n">له</th><th class="n">الرصيد</th></tr></thead>
      <tbody><tr><td></td><td class="muted">رصيد قبل ${date(F.from)}</td><td></td><td></td><td class="n"><b>${money(st.opening)}</b></td></tr>
      ${st.entries.map((e) => `<tr ${e.kind === 'sale' ? `class="click" data-sale="${e.ref_id}"` : ''}><td>${date(e.date)}</td>
        <td>${esc(e.description)}${e.kind === 'sale' ? ` <span class="num muted">#${e.ref_no}</span> ${statusTag(e.status)}` : ''}
          ${e.lines ? `<div class="small muted">${e.lines.map((l) => `${esc(l.item)} ${l.unit === 'kg' ? moneyT(l.weight) + ' ك' : moneyT(l.qty) + ' عدد'} × ${moneyT(l.price)}${l.crates ? ` + ${l.crates} صندوق` : ''}`).join(' — ')}</div>` : ''}
          ${n(e.info) ? `<div class="small muted">اترد ${moneyT(e.info)} نقدي من العهدة</div>` : ''}</td>
        <td class="n t-out">${n(e.debit) ? money(e.debit) : ''}</td><td class="n t-in">${n(e.credit) ? money(e.credit) : ''}</td>
        <td class="n"><b>${money(e.balance)}</b></td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="2">إجمالي الفترة</td><td class="n">${money(st.totals.debit)}</td><td class="n">${money(st.totals.credit)}</td><td class="n">${money(st.balance)}</td></tr></tfoot></table></div>
      ${st.entries.length ? '' : emptyState('مفيش حركة في الفترة دي', 'غيّر التاريخ من فوق')}
    </div>`;
    const a = (k) => el.querySelector(`[data-a=${k}]`);
    a('pay') && (a('pay').onclick = () => paymentModal(app, c, draw));
    a('crates') && (a('crates').onclick = () => crateModal(app, c, draw));
    a('print').onclick = () => statementDoc(st, app.settings);
    a('edit') && (a('edit').onclick = async () => { if (await customerForm(app, c)) draw(); });
    el.querySelector('#f1').onchange = (e) => { F.from = e.target.value; draw().catch(err); };
    el.querySelector('#f2').onchange = (e) => { F.to = e.target.value; draw().catch(err); };
    el.querySelectorAll('[data-sale]').forEach((r) => r.onclick = () => app.go('#/sales/' + r.dataset.sale));
  };
  await draw();
}

// ======================= الصناديق اللي برة =======================
export async function renderCrates({ app, el }) {
  el.innerHTML = `
  <div class="page-head"><h1>الصناديق اللي برة</h1><div class="sub">كل زبون عليه صناديق برهن. دوّر عليه وسجّل المرتجع.</div></div>
  <div class="panel"><div class="pb"><input class="in" id="q" placeholder="دوّر باسم الزبون أو التليفون"></div></div>
  <div class="panel" id="res"></div>`;
  const res = el.querySelector('#res');
  const load = async () => {
    const rows = (await api.rpc('list_customers', { search: el.querySelector('#q').value.trim() })).filter((c) => c.crates.length);
    const totals = {};
    rows.forEach((c) => c.crates.forEach((x) => { totals[x.name] = (totals[x.name] || 0) + x.count; }));
    res.innerHTML = rows.length ? `<div class="pb row">${Object.entries(totals).map(([k, v]) => tag('crate', `${v} ${k}`)).join(' ')}</div>
      <div class="tbl-wrap"><table class="t"><thead><tr><th>الزبون</th><th>الصناديق</th><th class="n">قيمة الرهن</th><th class="n">رصيده</th><th></th></tr></thead>
      <tbody>${rows.map((c) => `<tr><td><a href="#/customers/${c.id}"><b>${esc(c.name)}</b></a> <span class="num muted small">${esc(c.phone)}</span></td>
        <td>${c.crates.map((x) => tag('crate', `${x.count} ${x.name}`)).join(' ')}</td>
        <td class="n">${money(c.crates.reduce((a, x) => a + x.count * n(x.deposit), 0))}</td>
        <td class="n ${n(c.balance) > 0 ? 't-out' : ''}">${money(c.balance)}</td>
        <td>${app.can('collections') ? `<button class="btn sm" data-ret="${c.id}">${icon('crate')} مرتجع</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`
      : emptyState('مفيش صناديق برة', 'كل الصناديق اللي عليها رهن رجعت');
    res.querySelectorAll('[data-ret]').forEach((b) => b.onclick = () => crateModal(app, rows.find((c) => c.id === +b.dataset.ret), () => load().catch(err)));
  };
  el.querySelector('#q').addEventListener('input', debounce(() => load().catch(err)));
  await load();
}
