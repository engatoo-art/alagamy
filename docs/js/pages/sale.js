import { api } from '../api.js';
import {
  esc, money, moneyT, qty, qtyT, n, round2, icon, ok, err, busy, combo, modal, confirmBox, promptBox, tag, statusTag,
  PAY, UNIT, todayISO, date, dateT, emptyState, debounce,
} from '../ui.js';
import { saleDoc } from '../print.js';
import { customerForm } from './customers.js';
import { doOrRequest } from '../requests.js';

// ======================= بيع جديد =======================
export async function renderNew({ app, el, query }) {
  const [stock, customers, cs] = await Promise.all([api.rpc('available_stock'), api.rpc('list_customers'), api.rpc('current_shift')]);
  const shiftOk = cs.mine || (app.can('approve') && !cs.shift);
  const S = {
    customer: customers.find((c) => String(c.id) === query.customer) || null,
    walkIn: '', payment: 'cash', paid: '', discount: '', notes: '', lines: [],
  };
  let key = 0;
  const crateOpts = app.crate_types.filter((c) => c.active);
  const items = stock.map((s) => ({ kind: 'stock', ...s, label: `${s.item} — ${s.supplier}` }));
  // الكمية المحجوزة من نفس سطر النقلة في باقي سطور الفاتورة
  const usedElsewhere = (si, L) => S.lines.filter((x) => x !== L && x.pick?.shipment_item_id === si).reduce((a, x) => a + n(x.qty), 0);
  const left = (p, L) => n(p.remaining) - usedElsewhere(p.shipment_item_id, L);
  // الأصناف اللي لسه ليها باقي بس، واللي عدده خلص بيختفي
  const pickables = (L) => items.filter((p) => left(p, L) > 0);
  const newLine = () => ({ key: ++key, pick: null, unit: 'kg', qty: '', weight: '', price: '', crate_type_id: '', crates: '' });
  S.lines.push(newLine());

  el.innerHTML = `
  <div class="page-head"><h1>بيع جديد</h1><a class="btn" href="#/sales">${icon('receipt')} الفواتير</a></div>
  ${shiftOk ? '' : `<div class="alert warn" style="margin-bottom:14px">${cs.shift ? `العهدة مفتوحة باسم <b>${esc(cs.shift.user_name)}</b>. البيع النقدي والمدفوع مقدم بيتسجل على عهدة المحاسب اللي فاتحها، فلازم يقفلها وانت تفتح عهدتك.` : 'مفيش عهدة مفتوحة. البيع النقدي محتاج عهدة.'} <a href="#/cash">افتح العهدة</a></div>`}
  <div class="sale-grid">
    <div class="panel"><div class="pb">
      <div class="row" style="align-items:flex-end">
        <label class="f" style="flex:1;min-width:220px">الزبون
          <div><input class="in" id="cust" placeholder="اكتب اسم الزبون أو سيبه فاضي للبيع النقدي" autocomplete="off"></div></label>
        <button class="btn" id="newCust">${icon('plus')} زبون جديد</button>
        <div class="seg credit" id="pay"><button data-v="cash" class="on">نقدي</button><button data-v="credit">آجل</button></div>
      </div>
      <div id="custBox"></div>
      ${items.length ? '' : `<div class="alert warn" style="margin-top:14px">مفيش بضاعة متاحة للبيع دلوقتي. سجّل نقلة واردة من مورد الأول${app.can('suppliers') ? ' — <a href="#/shipments/new">نقلة جديدة</a>' : ''}.</div>`}
      <div class="tbl-wrap" style="margin-top:16px">
        <table class="lines"><thead><tr>
          <th style="min-width:200px">الصنف</th><th>البيع</th><th>العدد</th><th>الوزن (ك)</th><th>السعر</th>
          <th>الصندوق</th><th>صناديق</th><th class="n">القيمة</th><th></th></tr></thead>
        <tbody id="lines"></tbody></table>
      </div>
      <div class="row" style="margin-top:10px">
        <button class="btn" id="addLine">${icon('plus')} سطر جديد</button>
        <span class="muted small">Enter في آخر خانة بيفتح سطر جديد</span>
      </div>
      <label class="f" style="margin-top:14px">ملاحظات<input class="in" id="notes"></label>
    </div></div>

    <aside class="panel totals"><div class="pb">
      <div>
        <div class="line"><span>قيمة البضاعة</span><b id="tGoods">0</b></div>
        <div class="line"><span>رهن الصناديق</span><b id="tDep">0</b></div>
        <div class="line"><span>خصم</span><input class="in" id="disc" type="number" min="0" step="0.01" style="width:110px;height:32px"></div>
      </div>
      <div>
        <div class="muted small" style="margin-top:6px">الإجمالي</div>
        <div class="grand num" id="tGrand">0</div>
        <div id="paidBox" class="hidden" style="margin-top:8px">
          <label class="f">المدفوع مقدم<input class="in" id="paid" type="number" min="0" step="0.01" placeholder="0"></label>
          <div class="line"><span>الباقي آجل على الزبون</span><b id="tRest" class="t-out">0</b></div>
        </div>
      </div>
      <div>
        <div id="warn"></div>
        <div class="grid" style="gap:8px;margin-top:6px">
          <button class="btn primary lg" data-save="80mm">${icon('print')} حفظ وطباعة إيصال</button>
          <div class="row" style="gap:8px"><button class="btn" style="flex:1" data-save="A4">حفظ وطباعة A4</button>
          <button class="btn" style="flex:1" data-save="none">حفظ بس</button></div>
        </div>
      </div>
    </div></aside>
  </div>`;

  const $ = (s) => el.querySelector(s);
  const custIn = $('#cust');
  if (S.customer) custIn.value = S.customer.name;

  combo(custIn, {
    items: () => customers.filter((c) => c.active),
    label: (c) => c.name,
    sub: (c) => (n(c.balance) ? `عليه ${moneyT(c.balance)}` : '') + (c.phone ? ` ${esc(c.phone)}` : ''),
    onPick: (c) => { S.customer = c; drawCust(); recalc(); focusFirstLine(); },
  });
  custIn.addEventListener('input', () => {
    if (S.customer && custIn.value !== S.customer.name) { S.customer = null; drawCust(); }
    S.walkIn = custIn.value.trim();
  });

  $('#newCust').onclick = async () => {
    const c = await customerForm(app, { name: custIn.value.trim() });
    if (!c) return;
    const full = { ...c, balance: 0, crates: [] };
    customers.push(full); S.customer = full; custIn.value = c.name; drawCust(); recalc();
  };

  const paySeg = $('#pay');
  paySeg.onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    S.payment = b.dataset.v;
    paySeg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    $('#paidBox').classList.toggle('hidden', S.payment !== 'credit');
    drawCust(); recalc();
  };

  function drawCust() {
    const c = S.customer;
    if (!c) {
      $('#custBox').innerHTML = S.payment === 'credit'
        ? '<div class="cust-box"><span class="t-out">البيع الآجل لازم يكون لزبون مسجل — اختار الزبون أو اعمله جديد</span></div>' : '';
      return;
    }
    const credit = c.credit_approved
      ? tag('ok', 'مسموح له بالآجل' + (n(c.credit_limit) ? ` لحد ${moneyT(c.credit_limit)}` : ''))
      : tag('pending', 'الآجل محتاج موافقة المدير');
    $('#custBox').innerHTML = `<div class="cust-box"><b>${esc(c.name)}</b>
      <span>الرصيد: <b class="${n(c.balance) > 0 ? 't-out' : ''}">${money(c.balance)}</b></span>
      ${c.crates?.length ? `<span>${c.crates.map((x) => `${x.count} ${esc(x.name)}`).join('، ')}</span>` : ''}
      ${S.payment === 'credit' ? credit : ''}<a class="small" href="#/customers/${c.id}" style="margin-inline-start:auto">كشف الحساب</a></div>`;
  }

  // ---- السطور ----
  const tbody = $('#lines');
  function lineRow(L) {
    const tr = document.createElement('tr');
    tr.dataset.k = L.key;
    tr.innerHTML = `
      <td class="item"><div><input class="in" data-f="pick" placeholder="اختار الصنف" autocomplete="off" value="${esc(L.pick?.label || '')}"></div>
        <div class="small muted" data-rem></div></td>
      <td data-l="البيع"><div class="seg unit-seg"><button type="button" data-u="kg">كيلو</button><button type="button" data-u="count">عدد</button></div></td>
      <td data-l="العدد"><input class="in" data-f="qty" type="number" min="0" step="1" style="width:76px" value="${esc(L.qty)}"></td>
      <td data-l="الوزن (ك)"><input class="in" data-f="weight" type="number" min="0" step="0.001" style="width:96px" value="${esc(L.weight)}"></td>
      <td data-l="السعر"><input class="in" data-f="price" type="number" min="0" step="0.01" style="width:90px" value="${esc(L.price)}"></td>
      <td data-l="الصندوق"><select class="in" data-f="crate_type_id" style="width:150px"><option value="">بدون</option>
        ${crateOpts.map((c) => `<option value="${c.id}" ${String(L.crate_type_id) === String(c.id) ? 'selected' : ''}>${esc(c.name)}${n(c.deposit) ? ' (' + moneyT(c.deposit) + ')' : ''}</option>`).join('')}</select></td>
      <td data-l="صناديق"><input class="in" data-f="crates" type="number" min="0" step="1" style="width:70px" value="${esc(L.crates)}"></td>
      <td class="amt num" data-amt>0</td>
      <td><button class="btn ghost sm x" data-del title="شيل السطر">✕</button></td>`;
    const pickIn = tr.querySelector('[data-f=pick]');
    combo(pickIn, {
      items: () => pickables(L), label: (p) => p.label,
      sub: (p) => `باقي ${qtyT(left(p, L))} — ${dateT(p.ship_date)}`,
      empty: (q) => (!items.length
        ? 'مفيش بضاعة في المحل دلوقتي. الأصناف هنا بتيجي من <b>النقلات الواردة</b> — سجّل نقلة الأول وهتظهر هنا.'
        : q ? `مفيش "${esc(q)}" في البضاعة الموجودة. لو لسه واصلة، سجّلها في النقلات الواردة.` : 'كل البضاعة اللي في النقلات اتباعت.'),
      onPick: (p) => { L.pick = p; L.unit = p.default_unit || 'kg'; syncUnit(); recalc(); tr.querySelector('[data-f=qty]').focus(); },
    });
    pickIn.addEventListener('input', () => { if (L.pick && pickIn.value !== L.pick.label) { L.pick = null; recalc(); } });
    const syncUnit = () => {
      tr.querySelectorAll('[data-u]').forEach((b) => b.classList.toggle('on', b.dataset.u === L.unit));
      const w = tr.querySelector('[data-f=weight]');
      w.disabled = L.unit === 'count';
      if (L.unit === 'count') { w.value = ''; L.weight = ''; }
    };
    tr.querySelectorAll('[data-u]').forEach((b) => b.onclick = () => { L.unit = b.dataset.u; syncUnit(); recalc(); });
    tr.querySelectorAll('[data-f]:not([data-f=pick])').forEach((inp) => {
      inp.addEventListener('input', () => {
        L[inp.dataset.f] = inp.value;
        if (inp.dataset.f === 'qty' && L.crate_type_id && !L.cratesTouched) {
          L.crates = inp.value; tr.querySelector('[data-f=crates]').value = inp.value;
        }
        if (inp.dataset.f === 'crates') L.cratesTouched = true;
        if (inp.dataset.f === 'crate_type_id' && inp.value && !L.crates) {
          L.crates = L.qty; tr.querySelector('[data-f=crates]').value = L.qty;
        }
        recalc();
      });
      inp.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const fields = [...tr.querySelectorAll('[data-f]:not(:disabled)')];
        const i = fields.indexOf(inp);
        if (i < fields.length - 1) fields[i + 1].focus();
        else addLine();
      });
    });
    tr.querySelector('[data-del]').onclick = () => {
      S.lines = S.lines.filter((x) => x !== L);
      tr.remove();
      if (!S.lines.length) addLine();
      recalc();
    };
    syncUnit();
    return tr;
  }
  function addLine() {
    const L = newLine();
    const prev = S.lines[S.lines.length - 1];
    if (prev) L.crate_type_id = prev.crate_type_id;
    S.lines.push(L);
    const tr = lineRow(L);
    tbody.append(tr);
    tr.querySelector('[data-f=pick]').focus();
  }
  const focusFirstLine = () => tbody.querySelector('[data-f=pick]')?.focus();
  S.lines.forEach((L) => tbody.append(lineRow(L)));
  $('#addLine').onclick = addLine;

  const lineAmt = (L) => round2(L.unit === 'kg' ? n(L.weight) * n(L.price) : n(L.qty) * n(L.price));
  const lineDep = (L) => {
    const ct = crateOpts.find((c) => String(c.id) === String(L.crate_type_id));
    return ct ? round2(n(L.crates) * n(ct.deposit)) : 0;
  };
  const filled = () => S.lines.filter((L) => L.pick || n(L.price) || n(L.weight) || n(L.qty));

  function recalc() {
    let goods = 0, dep = 0; const warns = [];
    S.lines.forEach((L) => {
      const tr = tbody.querySelector(`tr[data-k="${L.key}"]`);
      const a = lineAmt(L); goods += a; dep += lineDep(L);
      if (tr) {
        tr.querySelector('[data-amt]').textContent = moneyT(a);
        const rem = tr.querySelector('[data-rem]');
        if (L.pick) {
          const avail = left(L.pick, L);
          const over = n(L.qty) > avail;
          rem.innerHTML = `${esc(L.pick.supplier)} — باقي <b class="${over ? 't-out' : ''}">${qtyT(avail)}</b>`;
          if (over) warns.push(`${L.pick.item}: العدد أكبر من الباقي في النقلة`);
        } else rem.textContent = '';
      }
      if (lineDep(L) > 0 && !S.customer) warns.push('رهن الصناديق لازم يكون لزبون مسجل');
    });
    const disc = n($('#disc').value);
    const grand = round2(goods + dep - disc);
    $('#tGoods').textContent = moneyT(goods);
    $('#tDep').textContent = moneyT(dep);
    $('#tGrand').textContent = moneyT(grand);
    const paid = Math.min(n($('#paid').value), grand);
    $('#tRest').textContent = moneyT(grand - paid);
    if (S.payment === 'credit' && S.customer) {
      const after = n(S.customer.balance) + grand - paid;
      if (!S.customer.credit_approved && !app.can('approve')) warns.push('الزبون ده مش متوافق له على الآجل — الفاتورة هتروح للمدير يوافق');
      else if (n(S.customer.credit_limit) && after > n(S.customer.credit_limit) && !app.can('approve'))
        warns.push(`الحساب هيبقى ${moneyT(after)} وده أكتر من الحد المسموح — الفاتورة هتروح للمدير`);
    }
    $('#warn').innerHTML = [...new Set(warns)].map((w) => `<div class="alert warn" style="margin-bottom:6px">${esc(w)}</div>`).join('');
    return grand;
  }
  ['#disc', '#paid'].forEach((s) => $(s).addEventListener('input', recalc));
  drawCust();
  recalc();

  el.querySelectorAll('[data-save]').forEach((btn) => btn.onclick = () => busy(btn, async () => {
    const lines = filled();
    if (!lines.length) throw new Error('ضيف صنف واحد على الأقل');
    const bad = lines.find((L) => !L.pick);
    if (bad) throw new Error('اختار الصنف من القائمة في كل سطر');
    const noQty = lines.find((L) => n(L.qty) <= 0);
    if (noQty) throw new Error(`اكتب العدد لـ ${noQty.pick.item} علشان يتخصم من النقلة`);
    const over = lines.find((L) => n(L.qty) > left(L.pick, L));
    if (over) throw new Error(`عدد ${over.pick.item} أكبر من الباقي في النقلة (${qtyT(left(over.pick, over))})`);
    const payload = {
      customer_id: S.customer?.id || null,
      customer_name: S.customer ? '' : S.walkIn,
      payment_type: S.payment,
      paid_amount: S.payment === 'credit' ? n($('#paid').value) : null,
      discount: n($('#disc').value),
      notes: $('#notes').value.trim(),
      lines: lines.map((L) => ({
        shipment_item_id: L.pick.shipment_item_id,
        item_id: L.pick.item_id, unit: L.unit, qty: n(L.qty), weight: n(L.weight), price: n(L.price),
        crate_type_id: L.crate_type_id || null, crates: n(L.crates),
      })),
    };
    const r = await api.rpc('create_sale', payload);
    ok(`اتحفظت فاتورة رقم ${r.sale.sale_no}` + (r.sale.approval_status === 'pending' ? ' — مستنية موافقة المدير' : ''));
    if (btn.dataset.save !== 'none') saleDoc(r, btn.dataset.save);
    app.go('#/sale?t=' + Date.now());
  }));
}

// ======================= قايمة الفواتير =======================
export async function renderList({ app, el, query }) {
  const t = todayISO();
  const F = { from: query.from || t, to: query.to || t, payment_type: 'all', search: '', include_voided: false };
  el.innerHTML = `
  <div class="page-head"><h1>الفواتير</h1>${app.can('sales') ? `<a class="btn primary" href="#/sale">${icon('plus')} بيع جديد</a>` : ''}</div>
  <div class="panel"><div class="pb row" style="align-items:flex-end">
    <label class="f">من<input class="in" type="date" name="from" value="${F.from}"></label>
    <label class="f">إلى<input class="in" type="date" name="to" value="${F.to}"></label>
    <label class="f">الدفع<select class="in" name="payment_type"><option value="all">الكل</option><option value="cash">نقدي</option><option value="credit">آجل</option></select></label>
    <label class="f" style="flex:1;min-width:180px">بحث<input class="in" name="search" placeholder="رقم الفاتورة أو اسم الزبون"></label>
    <label class="check"><input type="checkbox" name="include_voided"> الملغية كمان</label>
  </div></div>
  <div class="panel" id="res"></div>`;
  const res = el.querySelector('#res');
  const load = async () => {
    el.querySelectorAll('[name]').forEach((i) => F[i.name] = i.type === 'checkbox' ? i.checked : i.value);
    const rows = await api.rpc('list_sales', F);
    const live = rows.filter((r) => !r.voided);
    const sum = (k) => live.reduce((a, r) => a + n(r[k]), 0);
    res.innerHTML = rows.length ? `<div class="tbl-wrap"><table class="t"><thead><tr><th>رقم</th><th>التاريخ</th><th>الزبون</th><th>الأصناف</th>
      <th>الدفع</th><th class="n">الإجمالي</th><th class="n">المدفوع</th><th>المحاسب</th></tr></thead>
      <tbody>${rows.map((r) => `<tr class="click ${r.voided ? 'void' : ''}" data-id="${r.id}"><td class="num">${r.sale_no}</td>
        <td>${date(r.date)} <span class="muted small">${r.time}</span></td><td>${esc(r.customer)}</td>
        <td class="small muted" style="max-width:240px">${esc(r.items || '')}</td>
        <td>${tag(r.payment_type, PAY[r.payment_type])} ${r.voided ? tag('void', 'ملغية') : statusTag(r.approval_status)}</td>
        <td class="n">${money(r.grand_total)}</td><td class="n">${money(r.paid_amount)}</td><td class="small muted">${esc(r.by || '')}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="5">${live.length} فاتورة</td><td class="n">${money(sum('grand_total'))}</td><td class="n">${money(sum('paid_amount'))}</td><td></td></tr></tfoot></table></div>`
      : emptyState('مفيش فواتير في الفترة دي', 'غيّر التاريخ أو البحث');
    res.querySelectorAll('[data-id]').forEach((r) => r.onclick = () => app.go('#/sales/' + r.dataset.id));
  };
  el.querySelectorAll('[name]').forEach((i) => i.addEventListener(i.name === 'search' ? 'input' : 'change', debounce(() => load().catch(err), 300)));
  await load();
}

// ======================= عرض فاتورة =======================
export async function renderView({ app, el, params }) {
  const d = await api.rpc('get_sale', { id: +params[0] });
  const s = d.sale;
  const rest = n(s.grand_total) - n(s.paid_amount);
  el.innerHTML = `
  <div class="page-head"><h1>فاتورة رقم <span class="num">${s.sale_no}</span></h1>
    <button class="btn primary" data-p="80mm">${icon('print')} إيصال</button><button class="btn" data-p="A4">طباعة A4</button>
    ${app.can('sales') && !s.voided ? `<button class="btn" data-edit>${icon('edit')} تعديل الأسعار</button><button class="btn danger" data-void>${icon('trash')} إلغاء الفاتورة</button>` : ''}
    <div class="sub">${date(s.sale_date)} — ${esc(d.created_by_name || '')}</div></div>
  ${s.voided ? `<div class="alert err" style="margin-bottom:14px">الفاتورة دي ملغية${s.void_reason ? ': ' + esc(s.void_reason) : ''}</div>` : ''}
  ${s.approval_status === 'pending' && !s.voided ? `<div class="alert warn" style="margin-bottom:14px">الفاتورة الآجل دي مستنية موافقة المدير</div>` : ''}
  <div class="panel"><div class="ph"><h2>${esc(d.customer_display)}</h2>${tag(s.payment_type, PAY[s.payment_type])}
    ${s.customer_id ? `<a class="btn sm" href="#/customers/${s.customer_id}">كشف الحساب</a>` : ''}</div>
    <div class="tbl-wrap"><table class="t"><thead><tr><th>الصنف</th><th>المورد</th><th>البيع</th><th class="n">العدد</th><th class="n">الوزن</th>
      <th class="n">السعر</th><th class="n">القيمة</th><th>الصناديق</th><th class="n">الرهن</th></tr></thead>
    <tbody>${d.lines.map((l) => `<tr><td>${esc(l.item)}</td><td class="muted">${esc(l.supplier || '—')}</td><td>${UNIT[l.unit]}</td>
      <td class="n">${qty(l.qty)}</td><td class="n">${l.unit === 'kg' ? qty(l.weight) : '—'}</td><td class="n">${money(l.price)}</td>
      <td class="n">${money(l.amount)}</td><td>${l.crates ? qty(l.crates) + ' ' + esc(l.crate) : ''}</td><td class="n">${n(l.deposit_amount) ? money(l.deposit_amount) : ''}</td></tr>`).join('')}</tbody></table></div>
    <div class="pb" style="display:flex;justify-content:flex-end"><div style="min-width:280px" class="totals">
      <div class="line"><span>البضاعة</span><b>${money(s.goods_total)}</b></div>
      <div class="line"><span>رهن الصناديق</span><b>${money(s.deposit_total)}</b></div>
      ${n(s.discount) ? `<div class="line"><span>خصم</span><b>${money(s.discount)}</b></div>` : ''}
      <div class="line"><span>الإجمالي</span><b class="grand" style="font-size:22px">${money(s.grand_total)}</b></div>
      <div class="line"><span>المدفوع</span><b class="t-in">${money(s.paid_amount)}</b></div>
      ${rest ? `<div class="line"><span>الباقي آجل</span><b class="t-out">${money(rest)}</b></div>` : ''}
    </div></div>
    ${s.notes ? `<div class="pb muted">ملاحظات: ${esc(s.notes)}</div>` : ''}</div>`;
  el.querySelectorAll('[data-p]').forEach((b) => b.onclick = () => saleDoc(d, b.dataset.p));
  const reload = () => app.go('#/sales/' + s.id + '?r=' + Date.now());
  const v = el.querySelector('[data-void]');
  if (v) v.onclick = async () => {
    if (app.can('approve')) {
      const reason = await promptBox('سبب الإلغاء', { title: 'إلغاء الفاتورة', yes: 'إلغاء الفاتورة', danger: true });
      if (reason === null) return;
      return busy(v, async () => {
        await api.rpc('void_sale', { id: s.id, reason });
        ok('الفاتورة اتلغت' + (n(s.paid_amount) ? ' والمبلغ اتخصم من العهدة' : ''));
        reload();
      });
    }
    await busy(v, () => doOrRequest(app, {
      kind: 'void_sale', target_id: s.id, summary: `إلغاء فاتورة رقم ${s.sale_no} — ${d.customer_display} — ${moneyT(s.grand_total)}`,
    }));
  };
  const e = el.querySelector('[data-edit]');
  if (e) e.onclick = () => {
    const m = modal({
      title: 'تعديل أسعار فاتورة ' + s.sale_no, wide: true,
      body: `<table class="t"><thead><tr><th>الصنف</th><th>البيع</th><th>العدد</th><th>الوزن</th><th>السعر</th><th class="n">القيمة</th></tr></thead>
        <tbody>${d.lines.map((l) => `<tr data-l="${l.id}" data-u="${l.unit}"><td><b>${esc(l.item)}</b></td><td>${UNIT[l.unit]}</td>
          <td><input class="in" data-f="qty" type="number" min="0" value="${n(l.qty)}" style="width:80px"></td>
          <td><input class="in" data-f="weight" type="number" min="0" step="0.001" value="${n(l.weight)}" style="width:100px" ${l.unit === 'count' ? 'disabled' : ''}></td>
          <td><input class="in" data-f="price" type="number" min="0" step="0.01" value="${n(l.price)}" style="width:100px"></td>
          <td class="n" data-a>${moneyT(l.amount)}</td></tr>`).join('')}</tbody></table>
        <div class="alert info" id="tot" style="margin-top:12px"></div>
        ${app.can('approve') ? '' : '<div class="alert warn" style="margin-top:8px">التعديل هيتبعت للمدير ومش هيتنفذ غير لما يوافق.</div>'}`,
      actions: `<button class="btn primary" data-ok>${app.can('approve') ? 'حفظ التعديل' : 'ابعت للمدير'}</button><button class="btn" data-close>رجوع</button>`,
    });
    const rows = () => m.$$('tr[data-l]').map((tr) => ({
      id: +tr.dataset.l, unit: tr.dataset.u,
      qty: n(tr.querySelector('[data-f=qty]').value), weight: n(tr.querySelector('[data-f=weight]').value), price: n(tr.querySelector('[data-f=price]').value),
    }));
    const upd = () => {
      let goods = 0;
      rows().forEach((r) => {
        const a = round2(r.unit === 'kg' ? r.weight * r.price : r.qty * r.price); goods += a;
        m.$(`tr[data-l="${r.id}"] [data-a]`).textContent = moneyT(a);
      });
      const grand = goods + n(s.deposit_total) - n(s.discount);
      m.$('#tot').innerHTML = `الإجمالي الجديد <b>${moneyT(grand)}</b> بدل ${moneyT(s.grand_total)}` +
        (s.payment_type === 'cash' && grand !== n(s.grand_total) ? ` — الفرق ${moneyT(Math.abs(grand - n(s.grand_total)))} ${grand > n(s.grand_total) ? 'هيدخل' : 'هيخرج من'} العهدة` : '');
    };
    m.el.addEventListener('input', upd); upd();
    m.$('[data-ok]').onclick = () => busy(m.$('[data-ok]'), async () => {
      const lines = rows().map(({ id, qty: q, weight, price }) => ({ id, qty: q, weight, price }));
      if (app.can('approve')) {
        await api.rpc('edit_sale', { id: s.id, lines });
        ok('اتعدلت الفاتورة'); m.close(); reload();
      } else {
        m.close();
        await doOrRequest(app, {
          kind: 'edit_sale', target_id: s.id, payload: { lines },
          summary: `تعديل فاتورة رقم ${s.sale_no} — ${d.customer_display}: ` + rows().map((r) => {
            const old = d.lines.find((l) => l.id === r.id);
            return `${old.item} ${n(old.price) !== r.price ? `السعر ${moneyT(old.price)} ← ${moneyT(r.price)}` : ''}${n(old.weight) !== r.weight ? ` الوزن ${qtyT(old.weight)} ← ${qtyT(r.weight)}` : ''}${n(old.qty) !== r.qty ? ` العدد ${qtyT(old.qty)} ← ${qtyT(r.qty)}` : ''}`;
          }).join('، '),
        });
      }
    });
  };
}
