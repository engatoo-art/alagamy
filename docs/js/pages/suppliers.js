import { api } from '../api.js';
import {
  esc, money, moneyT, qty, qtyT, n, round2, icon, ok, err, busy, modal, formData, tag, statusTag, date, dateT, todayISO,
  emptyState, debounce, confirmBox, promptBox, UNIT, STATUS,
} from '../ui.js';
import { settlementDoc, supplierStatementDoc } from '../print.js';
import { doOrRequest } from '../requests.js';

// ======================= الموردين =======================
function supplierForm(app, s = {}) {
  return new Promise((resolve) => {
    let saved = null;
    const m = modal({
      title: s.id ? 'تعديل المورد' : 'مورد جديد',
      body: `<form class="grid" id="sf">
        <label class="f">اسم المورد<input class="in" name="name" required value="${esc(s.name || '')}"></label>
        <div class="grid g2"><label class="f">التليفون<input class="in" name="phone" dir="ltr" value="${esc(s.phone || '')}"></label>
        <label class="f">نسبة العمولة %<input class="in" name="commission_pct" type="number" min="0" max="100" step="0.01" value="${s.id ? n(s.commission_pct) : n(app.settings.default_commission)}"></label></div>
        <label class="f">ملاحظات<input class="in" name="notes" value="${esc(s.notes || '')}"></label>
        ${s.id ? `<label class="check"><input type="checkbox" name="active" ${s.active !== false ? 'checked' : ''}> المورد شغال</label>` : ''}
      </form>`,
      actions: '<button class="btn primary" data-ok>حفظ</button><button class="btn" data-close>رجوع</button>',
      onClose: () => resolve(saved),
    });
    const go = () => busy(m.$('[data-ok]'), async () => {
      saved = await api.rpc('save_supplier', { ...formData(m.$('#sf')), id: s.id || null });
      ok('اتحفظ ' + saved.name); m.close();
    });
    m.$('[data-ok]').onclick = go;
    m.$('#sf').onsubmit = (e) => { e.preventDefault(); go(); };
  });
}

export async function renderSuppliers({ app, el }) {
  el.innerHTML = `<div class="page-head"><h1>الموردين</h1>
    ${app.can('suppliers') ? `<button class="btn primary" id="add">${icon('plus')} مورد جديد</button>` : ''}</div>
    <div class="panel"><div class="pb"><input class="in" id="q" placeholder="دوّر باسم المورد"></div></div>
    <div class="panel" id="res"></div>`;
  const res = el.querySelector('#res');
  const load = async () => {
    const rows = await api.rpc('list_suppliers', { search: el.querySelector('#q').value.trim() });
    res.innerHTML = rows.length ? `<div class="tbl-wrap"><table class="t"><thead><tr><th>المورد</th><th>التليفون</th><th class="n">العمولة</th>
      <th class="n">نقلات بتتباع</th><th class="n">مستني موافقة</th><th class="n">مستحق له</th><th class="n">اتصرف له</th></tr></thead>
      <tbody>${rows.map((s) => `<tr class="click" data-id="${s.id}"><td><b>${esc(s.name)}</b></td><td class="num muted">${esc(s.phone)}</td>
        <td class="n">${qty(s.commission_pct)}%</td><td class="n">${s.open_shipments}</td><td class="n">${money(s.pending_amount)}</td>
        <td class="n t-out"><b>${money(s.due_amount)}</b></td><td class="n">${money(s.paid_amount)}</td></tr>`).join('')}</tbody></table></div>`
      : emptyState('مفيش موردين لسه', 'ضيف أول مورد من الزرار اللي فوق');
    res.querySelectorAll('[data-id]').forEach((r) => r.onclick = () => app.go('#/suppliers/' + r.dataset.id));
  };
  el.querySelector('#q').addEventListener('input', debounce(() => load().catch(err)));
  const add = el.querySelector('#add');
  if (add) add.onclick = async () => { const s = await supplierForm(app); if (s) app.go('#/suppliers/' + s.id); };
  await load();
}

export async function renderSupplier({ app, el, params }) {
  const id = +params[0];
  const [list, ships, setts] = await Promise.all([
    api.rpc('list_suppliers', { include_inactive: true }),
    api.rpc('list_shipments', { supplier_id: id, status: 'all' }),
    api.rpc('list_settlements', { supplier_id: id }),
  ]);
  const s = list.find((x) => x.id === id);
  if (!s) throw new Error('المورد غير موجود');
  el.innerHTML = `
  <div class="page-head" style="margin-bottom:12px"><a class="btn ghost sm" href="#/suppliers">${icon('back')} الموردين</a></div>
  <div class="page-head"><h1>${esc(s.name)}</h1>
    ${app.can('suppliers') ? `<a class="btn primary" href="#/shipments/new?supplier=${id}">${icon('truck')} نقلة جديدة</a>` : ''}
    ${app.can('settlements') && s.open_shipments ? `<a class="btn" href="#/settlements/new?supplier=${id}">${icon('scale')} طلّع الفاتورة</a>` : ''}
    ${app.can('suppliers') ? `<button class="btn ghost" id="edit">${icon('edit')} تعديل</button>` : ''}
    <div class="sub"><span class="num">${esc(s.phone)}</span> — العمولة ${qtyT(s.commission_pct)}%${s.notes ? ' — ' + esc(s.notes) : ''}</div></div>
  <div class="ledger-strip s5">
    <div><div class="k">نقلات لسه بتتباع</div><div class="v">${s.open_shipments}</div></div>
    <div><div class="k">فواتير مستنية موافقة</div><div class="v wait">${money(s.pending_amount)}</div></div>
    <div><div class="k">مستحق له (متوافق عليه)</div><div class="v neg">${money(s.due_amount)}</div></div>
    <div><div class="k">اتصرف له</div><div class="v pos">${money(s.paid_amount)}</div></div>
    <div><div class="k">العهدة لدى العميل</div><div class="v wait">${money(s.advance_balance)}</div><div class="h">فلوس اتدفعتله مقدم</div></div>
  </div>
  <div class="panel" style="margin-top:18px" id="stmt"></div>
  ${app.can('approve') ? '<div class="panel" id="advs"></div>' : ''}
  <div class="panel"><div class="ph"><h2>النقلات</h2></div>${shipmentsTable(ships)}</div>
  <div class="panel"><div class="ph"><h2>فواتير الموردين</h2></div>${settlementsTable(setts)}</div>`;
  bindRows(app, el);
  await statementPanel(app, el.querySelector('#stmt'), id);
  if (app.can('approve')) await advancesPanel(app, el.querySelector('#advs'), id, () => app.go('#/suppliers/' + id + '?r=' + Date.now()));
  const e = el.querySelector('#edit');
  if (e) e.onclick = async () => { if (await supplierForm(app, s)) app.go('#/suppliers/' + id + '?r=' + Date.now()); };
}

// ---------- تجميع فواتير عميل من تاريخ لتاريخ ----------
async function statementPanel(app, box, id) {
  const y = todayISO().slice(0, 4);
  box.innerHTML = `<div class="ph"><h2>تجميع الفواتير</h2>
    <label class="f inl">من <input class="in" type="date" id="f" value="${y}-01-01"></label>
    <label class="f inl">إلى <input class="in" type="date" id="t" value="${todayISO()}"></label>
    <button class="btn sm" id="yr">من أول السنة</button><button class="btn sm" id="pr">${icon('print')} طباعة الكشف</button></div><div id="sb"></div>`;
  let data = null;
  const load = async () => {
    data = await api.rpc('supplier_statement', { supplier_id: id, from: box.querySelector('#f').value, to: box.querySelector('#t').value });
    const t = data.totals;
    box.querySelector('#sb').innerHTML = `<div class="ledger-strip" style="margin:0 16px 14px">
      <div><div class="k">عدد الفواتير</div><div class="v">${t.count}</div><div class="h">${qtyT(t.weight)} ك</div></div>
      <div><div class="k">إجمالي البيع</div><div class="v">${money(t.gross)}</div></div>
      <div><div class="k">عمولة / نولون / دخان</div><div class="v pos">${money(t.commission)}</div><div class="h">نولون ${moneyT(t.freight)} — دخان ${moneyT(t.smoke)}${n(t.other) ? ' — أخرى ' + moneyT(t.other) : ''}</div></div>
      <div><div class="k">الصافي</div><div class="v neg">${money(t.net)}</div><div class="h">اتصرف ${moneyT(t.paid)}${n(t.advance) ? ' — من العهدة ' + moneyT(t.advance) : ''} — باقي ${moneyT(t.due)}</div></div>
    </div>${data.invoices.length ? `<div class="tbl-wrap"><table class="t"><thead><tr><th>رقم</th><th>التاريخ</th><th class="n">الوزن</th><th class="n">البيع</th>
      <th class="n">العمولة</th><th class="n">النولون</th><th class="n">الدخان</th><th class="n">الصافي</th><th class="n">من العهدة</th><th>الحالة</th></tr></thead>
      <tbody>${data.invoices.map((x) => `<tr class="click" data-sett="${x.id}"><td class="num">${x.settle_no}</td><td>${date(x.date)}</td><td class="n">${qty(x.weight)}</td>
        <td class="n">${money(x.gross)}</td><td class="n">${money(x.commission)}</td><td class="n">${money(x.freight)}</td><td class="n">${money(x.smoke)}</td>
        <td class="n"><b>${money(x.net)}</b></td><td class="n">${n(x.advance) ? money(x.advance) : ''}</td><td>${statusTag(x.status)}</td></tr>`).join('')}</tbody></table></div>`
      : emptyState('مفيش فواتير في الفترة دي', '')}`;
    bindRows(app, box);
  };
  box.querySelector('#f').onchange = box.querySelector('#t').onchange = () => load().catch(err);
  box.querySelector('#yr').onclick = () => { box.querySelector('#f').value = y + '-01-01'; box.querySelector('#t').value = todayISO(); load().catch(err); };
  box.querySelector('#pr').onclick = () => data && supplierStatementDoc(data, app.settings);
  await load();
}

// ---------- العهدة لدى العميل (مقدم) — للمدير بس ----------
async function advancesPanel(app, box, id, reload) {
  const d = await api.rpc('supplier_statement', { supplier_id: id, from: '2000-01-01' });
  box.innerHTML = `<div class="ph"><h2>العهدة لدى العميل</h2><span class="tag pending">الرصيد ${moneyT(d.advance_balance)}</span>
    <button class="btn primary sm" id="addAdv">${icon('plus')} فلوس مقدم للعميل</button></div>
    <div class="pb muted small" style="padding-top:0">فلوس بتدفعها للعميل قبل ما البضاعة توصل. بتتخصم من العهدة (الدرج) وتقدر تخصمها بعدين من أي فاتورة من زرار "تعديل" في الفاتورة.</div>
    ${d.advances.length ? `<div class="tbl-wrap"><table class="t"><thead><tr><th>التاريخ</th><th class="n">المبلغ</th><th>ملاحظات</th><th>بواسطة</th><th></th></tr></thead>
    <tbody>${d.advances.map((a) => `<tr class="${a.voided ? 'void' : ''}"><td>${date(a.date)}</td><td class="n"><b>${money(a.amount)}</b></td><td>${esc(a.notes || '')}</td>
      <td class="small muted">${esc(a.by || '')}</td><td>${a.voided ? tag('void', 'ملغي') : `<button class="btn ghost sm" data-ea="${a.id}">${icon('edit')} تعديل</button>
      <button class="btn ghost sm danger" data-va="${a.id}">إلغاء</button>`}</td></tr>`).join('')}</tbody></table></div>` : ''}`;
  const form = (a = {}) => {
    const m = modal({
      title: a.id ? 'تعديل المقدم' : 'فلوس مقدم للعميل',
      body: `<form class="grid" id="af"><label class="f">المبلغ<input class="in" name="amount" type="number" step="0.01" min="0" value="${a.amount ?? ''}" required></label>
        <label class="f">ملاحظات<input class="in" name="notes" value="${esc(a.notes || '')}" placeholder="مثلاً: مقدم نقلة البطاطس"></label>
        <div class="alert info">${a.id ? 'الفرق بين المبلغ القديم والجديد هيتسجل في العهدة (الدرج).' : 'المبلغ هيتخصم من العهدة (الدرج) دلوقتي.'}</div></form>`,
      actions: '<button class="btn primary" data-ok>حفظ</button><button class="btn" data-close>رجوع</button>',
    });
    m.$('[data-ok]').onclick = () => busy(m.$('[data-ok]'), async () => {
      const v = formData(m.$('#af'));
      if (!(n(v.amount) > 0)) throw new Error('اكتب المبلغ');
      await api.rpc('save_advance', { ...v, id: a.id || null, supplier_id: id });
      ok('اتسجل'); m.close(); reload();
    });
  };
  box.querySelector('#addAdv').onclick = () => form();
  box.querySelectorAll('[data-ea]').forEach((b) => b.onclick = () => form(d.advances.find((x) => x.id === +b.dataset.ea)));
  box.querySelectorAll('[data-va]').forEach((b) => b.onclick = async () => {
    if (!await confirmBox('إلغاء المقدم ده؟ المبلغ هيرجع للعهدة (الدرج).', { title: 'إلغاء', yes: 'إلغاء المقدم', danger: true })) return;
    await busy(b, async () => { await api.rpc('void_advance', { id: +b.dataset.va }); ok('اتلغى'); reload(); });
  });
}

function bindRows(app, el) {
  el.querySelectorAll('[data-ship]').forEach((r) => r.onclick = () => app.go('#/shipments/' + r.dataset.ship));
  el.querySelectorAll('[data-sett]').forEach((r) => r.onclick = () => app.go('#/settlements/' + r.dataset.sett));
}

// ======================= النقلات =======================
function shipmentsTable(rows, showSupplier = false) {
  if (!rows.length) return emptyState('مفيش نقلات', '');
  return `<div class="tbl-wrap"><table class="t"><thead><tr><th>التاريخ</th>${showSupplier ? '<th>المورد</th>' : ''}<th>العربية</th><th>الأصناف</th>
    <th class="n">الوارد</th><th class="n">اتباع</th><th class="n">الباقي</th><th class="n">قيمة المبيعات</th><th>الحالة</th></tr></thead>
    <tbody>${rows.map((s) => {
      const tot = s.items.reduce((a, i) => ({ q: a.q + n(i.qty), s: a.s + n(i.sold_qty), v: a.v + n(i.sold_amount) }), { q: 0, s: 0, v: 0 });
      return `<tr class="click" data-ship="${s.id}"><td>${date(s.ship_date)}</td>${showSupplier ? `<td><b>${esc(s.supplier)}</b></td>` : ''}
        <td class="muted">${esc(s.truck || '—')}</td><td class="small">${s.items.map((i) => `${esc(i.item)} ${qtyT(i.qty)}`).join('، ')}</td>
        <td class="n">${qty(tot.q)}</td><td class="n">${qty(tot.s)}</td><td class="n ${tot.q - tot.s > 0 ? '' : 'muted'}">${qty(tot.q - tot.s)}</td>
        <td class="n">${money(tot.v)}</td>
        <td>${s.settlement_id ? tag(s.settle_status, 'فاتورة ' + s.settle_no + ' — ' + (STATUS[s.settle_status] || '')) : tag('cash', 'بتتباع')}</td></tr>`;
    }).join('')}</tbody></table></div>`;
}

export async function renderShipments({ app, el, query }) {
  let status = query.status || 'open';
  el.innerHTML = `<div class="page-head"><h1>النقلات الواردة</h1>
    ${app.can('suppliers') ? `<a class="btn primary" href="#/shipments/new">${icon('plus')} نقلة جديدة</a>` : ''}</div>
    <div class="tabs" id="tabs"><button data-s="open">بتتباع</button><button data-s="settled">اتعملها فاتورة</button><button data-s="all">الكل</button></div>
    <div class="panel" id="res"></div>`;
  const load = async () => {
    el.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.s === status));
    const rows = await api.rpc('list_shipments', { status });
    el.querySelector('#res').innerHTML = shipmentsTable(rows, true);
    bindRows(app, el);
  };
  el.querySelector('#tabs').onclick = (e) => { const b = e.target.closest('button'); if (b) { status = b.dataset.s; load().catch(err); } };
  await load();
}

export async function renderShipmentForm({ app, el, params, query }) {
  const editId = params[0] ? +params[0] : null;
  const [sups, ship] = await Promise.all([
    api.rpc('list_suppliers'), editId ? api.rpc('shipment_detail', { id: editId }) : null,
  ]);
  if (ship?.settlement_id) throw new Error('النقلة دي اتعملها فاتورة ومينفعش تتعدل');
  const S = ship || { supplier_id: query.supplier ? +query.supplier : '', ship_date: todayISO(), truck: '', driver: '', freight: '', unloading: '', other_expenses: '', notes: '', items: [] };
  let rows = S.items.map((i) => ({ id: i.id, name: i.item, unit: i.default_unit, qty: i.qty, locked: n(i.sold_qty) > 0, sold: n(i.sold_qty) }));
  if (!rows.length) rows = [{ name: '', unit: 'kg', qty: '' }];

  el.innerHTML = `
  <div class="page-head"><h1>${editId ? 'تعديل نقلة' : 'نقلة جديدة'}</h1><div class="sub">البضاعة اللي جت من المورد على العربية. العدد بس من غير وزن.</div></div>
  <div class="panel"><div class="pb grid">
    <div class="grid g3">
      <label class="f">المورد<div class="row" style="flex-wrap:nowrap"><select class="in" id="sup"><option value="">اختار المورد</option>
        ${sups.map((s) => `<option value="${s.id}" ${String(S.supplier_id) === String(s.id) ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
        ${app.can('suppliers') ? `<button class="btn" id="newSup" title="مورد جديد">${icon('plus')}</button>` : ''}</div></label>
      <label class="f">تاريخ الوصول<input class="in" type="date" name="ship_date" value="${S.ship_date}"></label>
      <label class="f">رقم العربية<input class="in" name="truck" value="${esc(S.truck)}"></label>
      <label class="f">السواق<input class="in" name="driver" value="${esc(S.driver)}"></label>
      <label class="f">النولون (بيتخصم من المورد)<input class="in" name="freight" type="number" min="0" value="${n(S.freight) || ''}"></label>
      <label class="f">الدخان (بتتخصم من المورد)<input class="in" name="unloading" type="number" min="0" value="${n(S.unloading) || ''}"></label>
      <label class="f">مصاريف تانية<input class="in" name="other_expenses" type="number" min="0" value="${n(S.other_expenses) || ''}"></label>
      <label class="f" style="grid-column:span 2">ملاحظات<input class="in" name="notes" value="${esc(S.notes)}"></label>
    </div>
  </div></div>
  <div class="panel"><div class="ph"><h2>الأصناف اللي في النقلة</h2><button class="btn sm" id="addRow">${icon('plus')} صنف</button></div>
    <div class="pb"><datalist id="itemsList">${app.items.map((i) => `<option value="${esc(i.name)}">`).join('')}</datalist>
    <table class="lines"><thead><tr><th>الصنف (اختار أو اكتب اسم جديد)</th><th>بيتباع غالبًا</th><th>العدد (طرد / صندوق / قطعة)</th><th></th></tr></thead><tbody id="rows"></tbody></table></div></div>
  <div class="row" style="margin-top:16px"><button class="btn primary lg" id="save">${icon('truck')} حفظ النقلة</button><a class="btn lg" href="#/shipments">رجوع</a></div>`;

  const tb = el.querySelector('#rows');
  const draw = () => {
    tb.innerHTML = rows.map((r, i) => `<tr data-i="${i}">
      <td class="item"><input class="in" list="itemsList" data-f="name" value="${esc(r.name)}" ${r.locked ? 'disabled' : ''} placeholder="مثلاً: طماطم"></td>
      <td data-l="بيتباع"><select class="in" data-f="unit" ${r.locked ? 'disabled' : ''}><option value="kg" ${r.unit === 'kg' ? 'selected' : ''}>بالكيلو</option><option value="count" ${r.unit === 'count' ? 'selected' : ''}>بالعدد</option></select></td>
      <td data-l="العدد"><input class="in" type="number" min="${r.sold || 0}" data-f="qty" value="${esc(r.qty)}" style="width:120px">${r.locked ? `<div class="small muted">اتباع منه ${qtyT(r.sold)}</div>` : ''}</td>
      <td>${r.locked ? '' : '<button class="btn ghost sm" data-del>✕</button>'}</td></tr>`).join('');
  };
  draw();
  tb.addEventListener('input', (e) => {
    const tr = e.target.closest('tr'); const f = e.target.dataset.f; if (!tr || !f) return;
    const r = rows[+tr.dataset.i]; r[f] = e.target.value;
    if (f === 'name') { const it = app.items.find((x) => x.name === e.target.value.trim()); if (it) { r.unit = it.default_unit; tr.querySelector('[data-f=unit]').value = it.default_unit; } }
  });
  tb.addEventListener('change', (e) => { const tr = e.target.closest('tr'); if (tr && e.target.dataset.f === 'unit') rows[+tr.dataset.i].unit = e.target.value; });
  tb.addEventListener('click', (e) => { if (e.target.closest('[data-del]')) { rows.splice(+e.target.closest('tr').dataset.i, 1); if (!rows.length) rows.push({ name: '', unit: 'kg', qty: '' }); draw(); } });
  tb.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.dataset.f === 'qty') { e.preventDefault(); rows.push({ name: '', unit: 'kg', qty: '' }); draw(); tb.querySelector('tr:last-child [data-f=name]').focus(); } });
  el.querySelector('#addRow').onclick = () => { rows.push({ name: '', unit: 'kg', qty: '' }); draw(); tb.querySelector('tr:last-child [data-f=name]').focus(); };
  const ns = el.querySelector('#newSup');
  if (ns) ns.onclick = async () => {
    const s = await supplierForm(app);
    if (!s) return;
    const sel = el.querySelector('#sup');
    sel.insertAdjacentHTML('beforeend', `<option value="${s.id}">${esc(s.name)}</option>`); sel.value = s.id;
  };
  el.querySelector('#save').onclick = (e) => busy(e.currentTarget, async () => {
    const head = formData(el.querySelector('.panel .pb'));
    const items = rows.filter((r) => r.name.trim() || n(r.qty)).map((r) => {
      const it = app.items.find((x) => x.name === r.name.trim());
      return { id: r.id || null, item_id: it?.id || null, item_name: r.name.trim(), default_unit: r.unit, qty: n(r.qty) };
    });
    const r = await api.rpc('save_shipment', { ...head, id: editId, supplier_id: el.querySelector('#sup').value, items });
    await app.reload();
    ok('اتحفظت النقلة');
    app.go('#/shipments/' + r.id);
  });
}

export async function renderShipment({ app, el, params }) {
  const s = await api.rpc('shipment_detail', { id: +params[0] });
  const open = !s.settlement_id;
  const anySold = s.items.some((i) => n(i.sold_qty) > 0);
  const tot = s.items.reduce((a, i) => ({ q: a.q + n(i.qty), s: a.s + n(i.sold_qty), w: a.w + n(i.sold_weight), v: a.v + n(i.sold_amount) }), { q: 0, s: 0, w: 0, v: 0 });
  el.innerHTML = `
  <div class="page-head" style="margin-bottom:12px"><a class="btn ghost sm" href="#/shipments">${icon('back')} النقلات</a></div>
  <div class="page-head"><h1>نقلة ${esc(s.supplier)} — ${date(s.ship_date)}</h1>
    ${open && app.can('settlements') ? `<a class="btn primary" href="#/settlements/new?supplier=${s.supplier_id}&ship=${s.id}">${icon('scale')} طلّع الفاتورة</a>` : ''}
    ${open && app.can('suppliers') ? `<a class="btn" href="#/shipments/${s.id}/edit">${icon('edit')} تعديل</a>` : ''}
    ${open && app.can('suppliers') && !anySold ? `<button class="btn danger" id="del">${icon('trash')} حذف</button>` : ''}
    ${s.settlement_id ? `<a class="btn" href="#/settlements/${s.settlement_id}">فاتورة رقم ${s.settle_no}</a>` : ''}
    <div class="sub">${s.truck ? 'عربية ' + esc(s.truck) + ' — ' : ''}${s.driver ? 'السواق ' + esc(s.driver) + ' — ' : ''}نولون ${moneyT(s.freight)} — دخان ${moneyT(s.unloading)}${n(s.other_expenses) ? ' — مصاريف تانية ' + moneyT(s.other_expenses) : ''}</div></div>
  <div class="ledger-strip">
    <div><div class="k">الوارد</div><div class="v">${qty(tot.q)}</div></div>
    <div><div class="k">اتباع</div><div class="v">${qty(tot.s)}</div><div class="h">باقي ${qtyT(tot.q - tot.s)}</div></div>
    <div><div class="k">الوزن المباع</div><div class="v">${qty(tot.w)} <small>ك</small></div></div>
    <div><div class="k">قيمة المبيعات</div><div class="v pos">${money(tot.v)}</div></div>
  </div>
  <div class="panel" style="margin-top:18px"><div class="ph"><h2>الأصناف</h2></div><div class="tbl-wrap"><table class="t">
    <thead><tr><th>الصنف</th><th class="n">الوارد</th><th class="n">اتباع</th><th class="n">الباقي</th><th class="n">الوزن</th><th class="n">متوسط السعر</th><th class="n">القيمة</th></tr></thead>
    <tbody>${s.items.map((i) => `<tr><td><b>${esc(i.item)}</b></td><td class="n">${qty(i.qty)}</td><td class="n">${qty(i.sold_qty)}</td>
      <td class="n">${qty(i.remaining)}</td><td class="n">${qty(i.sold_weight)}</td><td class="n">${money(i.avg_price)}</td><td class="n">${money(i.sold_amount)}</td></tr>`).join('')}</tbody></table></div></div>
  <div class="panel"><div class="ph"><h2>اتباع لمين</h2></div>${s.sales.length ? `<div class="tbl-wrap"><table class="t">
    <thead><tr><th>التاريخ</th><th>فاتورة</th><th>الزبون</th><th>الصنف</th><th class="n">العدد</th><th class="n">الوزن</th><th class="n">السعر</th><th class="n">القيمة</th></tr></thead>
    <tbody>${s.sales.map((x) => `<tr class="click" data-sale="${x.sale_id}"><td>${date(x.date)}</td><td class="num">${x.sale_no}</td><td>${esc(x.customer)}</td><td>${esc(x.item)}</td>
      <td class="n">${qty(x.qty)}</td><td class="n">${x.unit === 'kg' ? qty(x.weight) : '—'}</td><td class="n">${money(x.price)}</td><td class="n">${money(x.amount)}</td></tr>`).join('')}</tbody></table></div>`
    : emptyState('لسه مفيش بيع من النقلة دي', 'البيع بيتم من شاشة بيع جديد')}</div>`;
  el.querySelectorAll('[data-sale]').forEach((r) => r.onclick = () => app.go('#/sales/' + r.dataset.sale));
  const d = el.querySelector('#del');
  if (d) d.onclick = () => busy(d, () => doOrRequest(app, {
    kind: 'delete_shipment', target_id: s.id, summary: `حذف نقلة ${s.supplier} بتاريخ ${dateT(s.ship_date)}`,
    confirmText: 'تحذف النقلة دي نهائي؟',
    direct: async () => { await api.rpc('delete_shipment', { id: s.id }); ok('النقلة اتحذفت'); app.go('#/shipments'); },
  }));
}

// ======================= فواتير الموردين =======================
function settlementsTable(rows, showSupplier = false) {
  if (!rows.length) return emptyState('مفيش فواتير', '');
  return `<div class="tbl-wrap"><table class="t"><thead><tr><th>رقم</th><th>التاريخ</th>${showSupplier ? '<th>المورد</th>' : ''}
    <th class="n">المبيعات</th><th class="n">العمولة</th><th class="n">المصاريف</th><th class="n">الصافي للمورد</th><th>الحالة</th></tr></thead>
    <tbody>${rows.map((s) => `<tr class="click" data-sett="${s.id}"><td class="num">${s.settle_no}</td><td>${date(s.date)}</td>${showSupplier ? `<td><b>${esc(s.supplier)}</b></td>` : ''}
      <td class="n">${money(s.gross_sales)}</td><td class="n t-in">${money(s.commission_amount)}</td><td class="n">${money(s.expenses)}</td>
      <td class="n"><b>${money(s.net_amount)}</b></td><td>${statusTag(s.status)}</td></tr>`).join('')}</tbody></table></div>`;
}

export async function renderSettlements({ app, el, query }) {
  let status = query.status || 'all';
  el.innerHTML = `<div class="page-head"><h1>فواتير الموردين</h1>
    ${app.can('settlements') ? `<a class="btn primary" href="#/settlements/new">${icon('plus')} فاتورة مورد جديدة</a>` : ''}
    <div class="sub">الفاتورة بتحسب مبيعات النقلة بأسعار البيع وتخصم عمولتك والنولون والدخان. بعد موافقة المدير تقدر تصرفها من العهدة.</div></div>
    <div class="panel" id="open"></div>
    <h2 style="margin:22px 0 10px">الفواتير اللي اتعملت</h2>
    <div class="tabs" id="tabs"><button data-s="all">الكل</button><button data-s="pending">مستنية موافقة</button><button data-s="approved">جاهزة للصرف</button>
      <button data-s="paid">اتصرفت</button><button data-s="rejected">مرفوضة</button></div>
    <div class="panel" id="res"></div>`;
  const ships = await api.rpc('list_shipments', { status: 'open' });
  el.querySelector('#open').innerHTML = `<div class="ph"><h2>نقلات لسه ما اتعملهاش فاتورة</h2><span class="muted small">اختار أي نقلة، خلصت أو لسه فيها بضاعة</span></div>
    ${ships.length ? `<div class="tbl-wrap"><table class="t"><thead><tr><th>التاريخ</th><th>صاحب النقلة</th><th>الأصناف</th><th class="n">الوارد</th><th class="n">الباقي</th><th class="n">المبيعات</th><th></th></tr></thead>
    <tbody>${ships.map((x) => {
      const t = x.items.reduce((a, i) => ({ q: a.q + n(i.qty), r: a.r + n(i.remaining), v: a.v + n(i.sold_amount) }), { q: 0, r: 0, v: 0 });
      return `<tr><td>${date(x.ship_date)}</td><td><b>${esc(x.supplier)}</b></td><td class="small">${x.items.map((i) => esc(i.item)).join('، ')}</td>
        <td class="n">${qty(t.q)}</td><td class="n">${t.r ? qty(t.r) : tag('ok', 'خلصت')}</td><td class="n">${money(t.v)}</td>
        <td>${app.can('settlements') ? `<a class="btn sm primary" href="#/settlements/new?supplier=${x.supplier_id}&ship=${x.id}">${icon('receipt')} طلّع الفاتورة</a>` : ''}</td></tr>`;
    }).join('')}</tbody></table></div>` : emptyState('كل النقلات اتعملها فواتير', '')}`;
  const load = async () => {
    el.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.s === status));
    el.querySelector('#res').innerHTML = settlementsTable(await api.rpc('list_settlements', { status }), true);
    bindRows(app, el);
  };
  el.querySelector('#tabs').onclick = (e) => { const b = e.target.closest('button'); if (b) { status = b.dataset.s; load().catch(err); } };
  await load();
}

export async function renderSettlementNew({ app, el, query }) {
  const sups = await api.rpc('list_suppliers');
  let supId = query.supplier ? +query.supplier : '';
  el.innerHTML = `
  <div class="page-head"><h1>فاتورة مورد جديدة</h1><div class="sub">اختار المورد والنقلات اللي عايز تصفّيها</div></div>
  <div class="panel"><div class="pb grid g2">
    <label class="f">المورد<select class="in" id="sup"><option value="">اختار المورد</option>
      ${sups.filter((s) => s.open_shipments).map((s) => `<option value="${s.id}" ${supId === s.id ? 'selected' : ''}>${esc(s.name)} (${s.open_shipments} نقلة)</option>`).join('')}</select></label>
    <div id="ships"></div>
  </div></div>
  <div id="pv"></div>`;
  const shipsBox = el.querySelector('#ships'); const pvBox = el.querySelector('#pv');
  let ships = [];

  const loadShips = async () => {
    pvBox.innerHTML = '';
    if (!supId) { shipsBox.innerHTML = ''; return; }
    ships = await api.rpc('list_shipments', { supplier_id: supId, status: 'open' });
    shipsBox.innerHTML = `<div class="f">النقلات<div class="grid" style="gap:6px">${ships.map((s) => {
      const q = s.items.reduce((a, i) => a + n(i.qty), 0); const r = s.items.reduce((a, i) => a + n(i.remaining), 0);
      return `<label class="check"><input type="checkbox" value="${s.id}" ${!query.ship || +query.ship === s.id ? 'checked' : ''}>
        ${dateT2(s.ship_date)} — ${s.items.map((i) => esc(i.item)).join('، ')} (وارد ${qtyT(q)}${r ? '، باقي ' + qtyT(r) : ''})</label>`;
    }).join('')}</div></div>`;
    shipsBox.querySelectorAll('input').forEach((c) => c.onchange = () => preview().catch(err));
    await preview();
  };

  const preview = async () => {
    const ids = [...shipsBox.querySelectorAll('input:checked')].map((c) => +c.value);
    if (!ids.length) { pvBox.innerHTML = '<div class="alert warn" style="margin-top:16px">اختار نقلة واحدة على الأقل</div>'; return; }
    const p = await api.rpc('preview_settlement', { supplier_id: supId, shipment_ids: ids });
    const remaining = p.items.filter((i) => n(i.remaining) > 0);
    pvBox.innerHTML = `
    ${remaining.length ? `<div class="alert warn" style="margin-top:16px">لسه فيه بضاعة ما اتباعتش: ${remaining.map((i) => `${esc(i.item)} ${qtyT(i.remaining)}`).join('، ')}. بعد الفاتورة مش هتقدر تبيع منها.</div>` : ''}
    <div class="grid" style="grid-template-columns:minmax(0,1fr) 340px;gap:18px;margin-top:16px;align-items:start">
      <div class="panel" style="margin:0"><div class="ph"><h2>المبيعات بأسعار البيع</h2></div><div class="tbl-wrap"><table class="t">
        <thead><tr><th>الصنف</th><th class="n">العدد</th><th class="n">الوزن</th><th class="n">السعر</th><th class="n">القيمة</th></tr></thead>
        <tbody>${p.lines.map((l) => `<tr><td>${esc(l.item)}</td><td class="n">${qty(l.qty)}</td><td class="n">${l.unit === 'kg' ? qty(l.weight) : '—'}</td>
          <td class="n">${money(l.price)} <span class="muted small">/${l.unit === 'kg' ? 'ك' : 'وحدة'}</span></td><td class="n">${money(l.amount)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td>الإجمالي</td><td class="n">${qty(p.totals.qty)}</td><td class="n">${qty(p.totals.weight)} ك</td><td></td><td class="n">${money(p.totals.gross)}</td></tr></tfoot></table></div>
        ${p.lines.length ? '' : emptyState('لسه مفيش بيع من النقلات دي', '')}</div>
      <div class="panel totals" style="margin:0"><div class="pb grid" id="calc">
        <div class="line"><span>إجمالي المبيعات</span><b>${money(p.totals.gross)}</b></div>
        <label class="f">العمولة %<input class="in" name="commission_pct" type="number" step="0.01" value="${n(p.commission_pct)}"></label>
        <div class="line"><span>قيمة العمولة</span><b class="t-in" id="cAmt"></b></div>
        <label class="f">النولون<input class="in" name="freight" type="number" value="${n(p.freight)}"></label>
        <label class="f">الدخان<input class="in" name="unloading" type="number" value="${n(p.unloading)}"></label>
        <div class="grid g2"><label class="f">مصاريف تانية<input class="in" name="other_expenses" type="number" value="${n(p.other_expenses)}"></label>
        <label class="f">بيانها<input class="in" name="other_label" placeholder="مثلاً: مشال"></label></div>
        <label class="f">ملاحظات<input class="in" name="notes"></label>
        <div class="muted small">الصافي المستحق للمورد</div><div class="grand num" id="net"></div>
        <button class="btn primary lg" id="go">${icon('check')} ابعت للمدير للموافقة</button>
      </div></div>
    </div>`;
    const calc = pvBox.querySelector('#calc');
    const upd = () => {
      const v = formData(calc);
      const c = round2(n(p.totals.gross) * n(v.commission_pct) / 100);
      pvBox.querySelector('#cAmt').textContent = moneyT(c);
      pvBox.querySelector('#net').textContent = moneyT(n(p.totals.gross) - c - n(v.freight) - n(v.unloading) - n(v.other_expenses));
    };
    calc.addEventListener('input', upd); upd();
    pvBox.querySelector('#go').onclick = (e) => busy(e.currentTarget, async () => {
      const r = await api.rpc('create_settlement', { ...formData(calc), supplier_id: supId, shipment_ids: ids });
      ok(`اتعملت فاتورة رقم ${r.settle_no} واتبعتت للمدير`);
      app.go('#/settlements/' + r.id);
    });
  };

  el.querySelector('#sup').onchange = (e) => { supId = +e.target.value || ''; query.ship = null; loadShips().catch(err); };
  await loadShips();
}
const dateT2 = (d) => date(d);

export async function renderSettlement({ app, el, params }) {
  const s = await api.rpc('get_settlement', { id: +params[0] });
  const lines = s.details?.lines || []; const items = s.details?.items || [];
  const adv = n(s.advance_deducted), toPay = n(s.net_amount) - adv;
  el.innerHTML = `
  <div class="page-head" style="margin-bottom:12px"><a class="btn ghost sm" href="#/settlements">${icon('back')} فواتير الموردين</a></div>
  <div class="page-head"><h1>فاتورة رقم <span class="num">${s.settle_no}</span> — ${esc(s.supplier.name)}</h1>
    ${statusTag(s.status)}
    <button class="btn" id="print">${icon('print')} طباعة الفاتورة A4</button>
    ${['pending', 'approved'].includes(s.status) && (app.can('settlements') || app.can('approve')) ? `<button class="btn" id="edit">${icon('edit')} تعديل العمولة والنولون والدخان${app.can('approve') ? ' والخصم من العهدة' : ''}</button>` : ''}
    ${s.status === 'pending' && app.can('approve') ? `<button class="btn primary" id="ok">${icon('check')} موافقة</button><button class="btn danger" id="no">رفض</button>` : ''}
    ${s.status === 'approved' && app.can('payouts') ? `<button class="btn warn" id="pay">${icon('wallet')} صرف ${moneyT(toPay)} من العهدة</button>` : ''}
    <div class="sub">عملها ${esc(s.created_by_name || '')}${s.decided_by_name ? ' — ' + (s.status === 'rejected' ? 'رفضها ' : 'وافق عليها ') + esc(s.decided_by_name) : ''}${s.paid_by_name ? ' — صرفها ' + esc(s.paid_by_name) : ''}</div></div>
  ${s.status === 'rejected' ? `<div class="alert err" style="margin-bottom:14px">الفاتورة اترفضت${s.reject_reason ? ': ' + esc(s.reject_reason) : ''}. النقلات رجعت مفتوحة وتقدر تعمل فاتورة مورد جديدة.</div>` : ''}
  ${s.status === 'pending' && !app.can('approve') ? `<div class="alert warn" style="margin-bottom:14px">مستنية موافقة المدير قبل الصرف</div>` : ''}
  <div class="ledger-strip">
    <div><div class="k">إجمالي المبيعات</div><div class="v">${money(s.gross_sales)}</div><div class="h">${qtyT(s.total_qty)} طرد — ${qtyT(s.total_weight)} ك</div></div>
    <div><div class="k">عمولتك (${qtyT(s.commission_pct)}%)</div><div class="v pos">${money(s.commission_amount)}</div></div>
    <div><div class="k">نولون ودخان ومصاريف</div><div class="v">${money(n(s.freight) + n(s.unloading) + n(s.other_expenses))}</div>
      <div class="h">نولون ${moneyT(s.freight)} — دخان ${moneyT(s.unloading)}${n(s.other_expenses) ? ' — ' + esc(s.other_label || 'أخرى') + ' ' + moneyT(s.other_expenses) : ''}</div></div>
    <div><div class="k">الصافي للمورد</div><div class="v neg">${money(s.net_amount)}</div>
      ${adv ? `<div class="h">مخصوم من العهدة ${moneyT(adv)} — المطلوب صرفه <b>${moneyT(toPay)}</b></div>` : ''}</div>
  </div>
  <div class="panel" style="margin-top:18px"><div class="ph"><h2>المبيعات بأسعار البيع</h2></div><div class="tbl-wrap"><table class="t">
    <thead><tr><th>الصنف</th><th class="n">العدد</th><th class="n">الوزن</th><th class="n">السعر</th><th class="n">القيمة</th></tr></thead>
    <tbody>${lines.map((l) => `<tr><td>${esc(l.item)}</td><td class="n">${qty(l.qty)}</td><td class="n">${l.unit === 'kg' ? qty(l.weight) : '—'}</td>
      <td class="n">${money(l.price)}</td><td class="n">${money(l.amount)}</td></tr>`).join('')}</tbody></table></div></div>
  <div class="panel"><div class="ph"><h2>ملخص الأصناف</h2>
    ${s.shipments.map((x) => `<a class="btn sm" href="#/shipments/${x.id}">نقلة ${date(x.ship_date)}</a>`).join('')}</div><div class="tbl-wrap"><table class="t">
    <thead><tr><th>الصنف</th><th class="n">الوارد</th><th class="n">اتباع</th><th class="n">الباقي</th><th class="n">الوزن</th><th class="n">القيمة</th></tr></thead>
    <tbody>${items.map((i) => `<tr><td>${esc(i.item)}</td><td class="n">${qty(i.qty_in)}</td><td class="n">${qty(i.qty_sold)}</td><td class="n">${qty(i.remaining)}</td>
      <td class="n">${qty(i.weight)}</td><td class="n">${money(i.amount)}</td></tr>`).join('')}</tbody></table></div></div>`;
  el.querySelector('#print').onclick = () => settlementDoc(s);
  const ed = el.querySelector('#edit');
  if (ed) ed.onclick = () => {
    const m = modal({
      title: 'تعديل فاتورة ' + s.supplier.name,
      body: `<form class="grid" id="ef">
        <div class="alert info">إجمالي المبيعات: <b>${moneyT(s.gross_sales)}</b></div>
        <div class="grid g2"><label class="f">العمولة %<input class="in" name="commission_pct" type="number" step="0.01" value="${n(s.commission_pct)}"></label>
        <label class="f">النولون (النقل)<input class="in" name="freight" type="number" step="0.01" value="${n(s.freight)}"></label>
        <label class="f">الدخان<input class="in" name="unloading" type="number" step="0.01" value="${n(s.unloading)}"></label>
        <label class="f">مصاريف تانية<input class="in" name="other_expenses" type="number" step="0.01" value="${n(s.other_expenses)}"></label></div>
        <label class="f">بيان المصاريف التانية<input class="in" name="other_label" value="${esc(s.other_label || '')}"></label>
        ${app.can('approve') ? `<label class="f">خصم من العهدة لدى العميل <span class="muted small">(المتاح: ${moneyT(n(s.advance_balance) + adv)})</span>
          <input class="in" name="advance_deducted" type="number" step="0.01" min="0" value="${adv}"></label>` : ''}
        <div class="alert" id="net"></div>
        ${app.can('approve') ? '' : '<div class="alert warn">بعد التعديل الفاتورة هترجع تستنى موافقة المدير.</div>'}
      </form>`,
      actions: '<button class="btn primary" data-ok>حفظ التعديل</button><button class="btn" data-close>رجوع</button>',
    });
    const upd = () => {
      const v = formData(m.$('#ef'));
      const c = round2(n(s.gross_sales) * n(v.commission_pct) / 100);
      const net = n(s.gross_sales) - c - n(v.freight) - n(v.unloading) - n(v.other_expenses);
      m.$('#net').innerHTML = `العمولة ${moneyT(c)} — الصافي للمورد <b>${moneyT(net)}</b>` + (n(v.advance_deducted) ? ` — بعد خصم العهدة يتصرف له <b>${moneyT(net - n(v.advance_deducted))}</b>` : '');
    };
    m.$('#ef').addEventListener('input', upd); upd();
    m.$('[data-ok]').onclick = () => busy(m.$('[data-ok]'), async () => {
      await api.rpc('edit_settlement', { ...formData(m.$('#ef')), id: s.id });
      ok('اتعدلت الفاتورة'); m.close(); reload();
    });
  };
  const reload = () => app.go('#/settlements/' + s.id + '?r=' + Date.now());
  const okB = el.querySelector('#ok'), noB = el.querySelector('#no'), payB = el.querySelector('#pay');
  if (okB) okB.onclick = () => busy(okB, async () => { await api.rpc('decide_settlement', { id: s.id, approve: true }); ok('اتوافق على الفاتورة'); reload(); });
  if (noB) noB.onclick = async () => {
    const reason = await promptBox('سبب الرفض', { title: 'رفض الفاتورة', yes: 'رفض', danger: true });
    if (reason === null) return;
    await busy(noB, async () => { await api.rpc('decide_settlement', { id: s.id, approve: false, reason }); ok('الفاتورة اترفضت'); reload(); });
  };
  if (payB) payB.onclick = async () => {
    let bal = '';
    try { const cd = await api.rpc('cash_day', {}); bal = `<br>رصيد العهدة دلوقتي: <b>${moneyT(cd.closing)}</b>` + (n(cd.closing) < toPay ? ' <span class="t-out">(مش كفاية)</span>' : ''); } catch { /* مش عنده صلاحية يشوف العهدة */ }
    if (!await confirmBox(`هيتصرف <b>${moneyT(toPay)}</b> لـ ${esc(s.supplier.name)} من العهدة.${bal}`, { title: 'صرف الفاتورة', yes: 'صرف' })) return;
    await busy(payB, async () => { await api.rpc('pay_settlement', { id: s.id }); ok('اتصرفت الفاتورة واتخصمت من العهدة'); reload(); });
  };
}

// ======================= الأصناف (البضاعة الموجودة) =======================
export async function renderStock({ app, el }) {
  el.innerHTML = `<div class="page-head"><h1>الأصناف</h1>
    ${app.can('suppliers') ? `<a class="btn primary" href="#/shipments/new">${icon('plus')} بضاعة جديدة (نقلة)</a>` : ''}
    <div class="sub">البضاعة الموجودة دلوقتي في المحل: كل صنف، عدده، وصاحبه.${app.can('approve') ? '' : ' أي تعديل أو حذف بيروح للمدير يوافق.'}</div></div>
    <div class="panel"><div class="pb row"><input class="in" id="q" placeholder="دوّر باسم الصنف أو صاحب البضاعة" style="flex:1;min-width:200px">
      <label class="check"><input type="checkbox" id="empty"> اللي خلص كمان</label></div></div>
    <div id="res"></div>`;
  const res = el.querySelector('#res');
  const load = async () => {
    const rows = await api.rpc('list_stock', { search: el.querySelector('#q').value.trim(), include_empty: el.querySelector('#empty').checked });
    const groups = {};
    rows.forEach((r) => (groups[r.item] = groups[r.item] || []).push(r));
    const names = Object.keys(groups);
    res.innerHTML = names.length ? `<div class="ledger-strip" style="grid-template-columns:repeat(3,1fr);margin-bottom:16px">
        <div><div class="k">أصناف موجودة</div><div class="v">${names.length}</div></div>
        <div><div class="k">إجمالي العدد الباقي</div><div class="v">${qty(rows.reduce((a, r) => a + n(r.remaining), 0))}</div></div>
        <div><div class="k">أصحاب البضاعة</div><div class="v">${new Set(rows.map((r) => r.supplier)).size}</div></div></div>
      ${names.map((name) => {
        const g = groups[name]; const left = g.reduce((a, r) => a + n(r.remaining), 0);
        return `<div class="panel"><div class="ph"><h2>${icon('box')} ${esc(name)}</h2><span class="tag ${left ? 'ok' : 'void'}" style="font-size:14px">الباقي ${qtyT(left)}</span></div>
          <div class="tbl-wrap"><table class="t"><thead><tr><th>صاحب البضاعة</th><th>النقلة</th><th class="n">الوارد</th><th class="n">اتباع</th><th class="n">الباقي</th><th></th></tr></thead>
          <tbody>${g.map((r) => `<tr><td><a href="#/suppliers/${r.supplier_id}"><b>${esc(r.supplier)}</b></a></td>
            <td><a href="#/shipments/${r.shipment_id}">${date(r.ship_date)}${r.truck ? ' — ' + esc(r.truck) : ''}</a></td>
            <td class="n">${qty(r.qty)}</td><td class="n">${qty(r.sold)}</td><td class="n"><b>${qty(r.remaining)}</b></td>
            <td class="row" style="flex-wrap:nowrap;justify-content:flex-end">
              ${app.can('suppliers') || app.can('approve') ? `<button class="btn sm" data-adj="${r.shipment_item_id}">${icon('edit')} تعديل العدد</button>
              <button class="btn sm danger" data-del="${r.shipment_item_id}">${icon('trash')} حذف الباقي</button>` : ''}</td></tr>`).join('')}</tbody></table></div></div>`;
      }).join('')}` : `<div class="panel">${emptyState('مفيش بضاعة موجودة', 'البضاعة بتتضاف لما تسجل نقلة من مورد')}</div>`;
    const find = (id) => rows.find((r) => r.shipment_item_id === +id);
    res.querySelectorAll('[data-adj]').forEach((b) => b.onclick = () => {
      const r = find(b.dataset.adj);
      const m = modal({
        title: `تعديل عدد ${r.item} — ${r.supplier}`,
        body: `<div class="alert info" style="margin-bottom:12px">الوارد ${qtyT(r.qty)} — اتباع ${qtyT(r.sold)} — الباقي ${qtyT(r.remaining)}</div>
          <label class="f">العدد الكلي الجديد (مينفعش يقل عن ${qtyT(r.sold)})<input class="in big" id="nq" type="number" min="${r.sold}" value="${r.qty}"></label>`,
        actions: `<button class="btn primary" data-ok>${app.can('approve') ? 'حفظ' : 'ابعت للمدير'}</button><button class="btn" data-close>رجوع</button>`,
      });
      m.$('[data-ok]').onclick = () => busy(m.$('[data-ok]'), async () => {
        const nq = n(m.$('#nq').value);
        if (nq < n(r.sold)) throw new Error('العدد مينفعش يقل عن اللي اتباع');
        m.close();
        await doOrRequest(app, {
          kind: 'stock_adjust', target_id: r.shipment_item_id, payload: { qty: nq },
          summary: `تعديل عدد ${r.item} (${r.supplier}) من ${qtyT(r.qty)} إلى ${qtyT(nq)}`,
          direct: async () => { await api.rpc('stock_adjust', { shipment_item_id: r.shipment_item_id, qty: nq }); ok('اتعدل العدد'); },
          done: () => load().catch(err),
        });
      });
    });
    res.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => busy(b, () => {
      const r = find(b.dataset.del);
      return doOrRequest(app, {
        kind: 'stock_adjust', target_id: r.shipment_item_id, payload: { qty: n(r.sold) },
        summary: `حذف الباقي من ${r.item} (${r.supplier}): ${qtyT(r.remaining)}`,
        confirmText: `تحذف الباقي من ${esc(r.item)} (${qtyT(r.remaining)})؟`,
        direct: async () => { await api.rpc('stock_adjust', { shipment_item_id: r.shipment_item_id, qty: n(r.sold) }); ok('اتحذف الباقي'); },
        done: () => load().catch(err),
      });
    }));
  };
  el.querySelector('#q').addEventListener('input', debounce(() => load().catch(err)));
  el.querySelector('#empty').addEventListener('change', () => load().catch(err));
  await load();
}
