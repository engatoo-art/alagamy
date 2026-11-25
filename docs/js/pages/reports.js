import { api } from '../api.js';
import { esc, money, moneyT, qty, qtyT, n, icon, err, tag, date, todayISO, addDays, monthRange, emptyState, CASH_CAT, dateT, dateLong, debounce, PAY } from '../ui.js';
import { reportDoc, debtsDoc, salesDetailDoc, moneyDoc } from '../print.js';

export async function render({ app, el, query }) {
  const t = todayISO();
  const presets = {
    today: ['النهارده', t, t],
    yesterday: ['امبارح', addDays(t, -1), addDays(t, -1)],
    week: ['آخر 7 أيام', addDays(t, -6), t],
    month: ['الشهر ده', ...monthRange(t)],
    last: ['الشهر اللي فات', ...monthRange(t, -1)],
  };
  let [, from, to] = presets.today;
  let pk = 'today';
  let tab = query.tab || 'sales';
  let data = null;
  el.innerHTML = `
  <div class="page-head"><h1>التقارير</h1><a class="btn" href="#/debts">${icon('users')} المديونيات والصناديق</a></div>
  <div class="tabs" id="tabs">
    <button data-t="sales">${icon('box')} المبيعات بالتفصيل</button><button data-t="in">${icon('money')} الفلوس اللي دخلت</button>
    <button data-t="out">${icon('wallet')} الفلوس اللي خرجت</button><button data-t="summary">${icon('chart')} الملخص</button></div>
  <div class="panel"><div class="pb row" style="align-items:flex-end">
    <div class="seg" id="pre">${Object.entries(presets).map(([k, v]) => `<button data-k="${k}">${v[0]}</button>`).join('')}</div>
    <label class="f">من<input class="in" type="date" id="f1"></label><label class="f">إلى<input class="in" type="date" id="f2"></label>
    <label class="f" id="sbox" style="flex:1;min-width:160px">بحث<input class="in" id="q" placeholder="صنف أو زبون أو مورد"></label>
    <button class="btn primary" id="print">${icon('print')} طباعة A4</button>
  </div></div><div id="res"></div>`;
  const res = el.querySelector('#res');
  el.querySelectorAll('#tabs button').forEach((b) => b.querySelector('svg')?.setAttribute('style', 'width:17px;height:17px;vertical-align:-3px'));

  const load = async () => {
    el.querySelector('#f1').value = from; el.querySelector('#f2').value = to;
    el.querySelectorAll('#pre button').forEach((b) => b.classList.toggle('on', b.dataset.k === pk));
    el.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
    el.querySelector('#sbox').classList.toggle('hidden', tab !== 'sales');
    res.innerHTML = '<div class="empty">جاري التحميل…</div>';
    if (tab === 'sales') return drawSales();
    if (tab === 'in' || tab === 'out') return drawMoney(tab);
    return drawSummary();
  };
  const period = () => from === to ? dateLong(from) : `من ${dateT(from)} إلى ${dateT(to)}`;

  // ---------- المبيعات بالتفصيل ----------
  async function drawSales() {
    const r = data = await api.rpc('report_sales_detail', { from, to, search: el.querySelector('#q').value.trim() });
    const groups = {};
    r.lines.forEach((l) => (groups[l.item] = groups[l.item] || []).push(l));
    res.innerHTML = `
    <div class="ledger-strip" style="margin-top:18px">
      <div><div class="k">إجمالي المبيعات</div><div class="v">${money(r.totals.amount)}</div><div class="h">${period()}</div></div>
      <div><div class="k">العدد</div><div class="v">${qty(r.totals.qty)}</div></div>
      <div><div class="k">الوزن</div><div class="v">${qty(r.totals.weight)} <small>ك</small></div></div>
      <div><div class="k">الفواتير / الزباين</div><div class="v">${r.totals.invoices} / ${r.totals.customers}</div></div>
    </div>
    <div class="panel"><div class="ph"><h2>كل صنف لوحده</h2></div>${r.by_item.length ? `<div class="tbl-wrap"><table class="t">
      <thead><tr><th>الصنف</th><th class="n">العدد</th><th class="n">الوزن (ك)</th><th class="n">متوسط السعر</th><th class="n">المجموع</th><th class="n">عدد الزباين</th></tr></thead>
      <tbody>${r.by_item.map((x) => `<tr><td><b>${esc(x.item)}</b></td><td class="n">${qty(x.qty)}</td><td class="n">${qty(x.weight)}</td>
        <td class="n">${money(x.avg)}</td><td class="n"><b>${money(x.amount)}</b></td><td class="n">${x.customers}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td>الإجمالي</td><td class="n">${qty(r.totals.qty)}</td><td class="n">${qty(r.totals.weight)}</td><td></td><td class="n">${money(r.totals.amount)}</td><td class="n">${r.totals.customers}</td></tr></tfoot></table></div>`
      : emptyState('مفيش بيع في الفترة دي', 'غيّر التاريخ')}</div>
    ${Object.entries(groups).map(([item, ls]) => {
      const sum = ls.reduce((a, l) => ({ q: a.q + n(l.qty), w: a.w + n(l.weight), v: a.v + n(l.amount) }), { q: 0, w: 0, v: 0 });
      return `<div class="panel"><div class="ph"><h2>${esc(item)}</h2><span class="muted">${qtyT(sum.q)} عدد — ${qtyT(sum.w)} ك — ${moneyT(sum.v)}</span></div>
      <div class="tbl-wrap"><table class="t"><thead><tr><th>التاريخ</th><th>فاتورة</th><th>الزبون</th><th>صاحب البضاعة</th><th>الدفع</th>
        <th class="n">العدد</th><th class="n">الوزن</th><th class="n">السعر</th><th class="n">المجموع</th></tr></thead>
      <tbody>${ls.map((l) => `<tr class="click" data-sale="${l.sale_id}"><td>${date(l.sale_date)} <span class="small muted">${l.tm}</span></td><td class="num">${l.sale_no}</td>
        <td><b>${esc(l.customer)}</b></td><td class="muted">${esc(l.supplier || '—')}</td><td>${tag(l.payment_type, PAY[l.payment_type])}</td>
        <td class="n">${qty(l.qty)}</td><td class="n">${l.unit === 'kg' ? qty(l.weight) : '—'}</td><td class="n">${money(l.price)}</td><td class="n">${money(l.amount)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="5">إجمالي ${esc(item)}</td><td class="n">${qty(sum.q)}</td><td class="n">${qty(sum.w)}</td><td></td><td class="n">${money(sum.v)}</td></tr></tfoot></table></div></div>`;
    }).join('')}
    ${r.by_customer.length ? `<div class="panel"><div class="ph"><h2>حسب الزبون</h2></div><div class="tbl-wrap"><table class="t">
      <thead><tr><th>الزبون</th><th class="n">الفواتير</th><th class="n">العدد</th><th class="n">الوزن</th><th class="n">المجموع</th></tr></thead>
      <tbody>${r.by_customer.map((x) => `<tr><td><b>${esc(x.customer)}</b></td><td class="n">${x.invoices}</td><td class="n">${qty(x.qty)}</td><td class="n">${qty(x.weight)}</td><td class="n">${money(x.amount)}</td></tr>`).join('')}</tbody></table></div></div>` : ''}`;
    res.querySelectorAll('[data-sale]').forEach((row) => row.onclick = () => app.go('#/sales/' + row.dataset.sale));
  }

  // ---------- الفلوس اللي دخلت / خرجت ----------
  async function drawMoney(dir) {
    const r = data = await api.rpc('report_money', { from, to, direction: dir });
    const cls = dir === 'in' ? 't-in' : 't-out';
    res.innerHTML = `
    <div class="ledger-strip" style="margin-top:18px;grid-template-columns:repeat(3,1fr)">
      <div><div class="k">${dir === 'in' ? 'إجمالي اللي دخل' : 'إجمالي اللي خرج'}</div><div class="v ${dir === 'in' ? 'pos' : 'neg'}">${money(r.total)}</div><div class="h">${period()}</div></div>
      <div><div class="k">عدد المرات</div><div class="v">${r.count}</div></div>
      <div><div class="k">${dir === 'in' ? 'عدد اللي دفعوا' : 'عدد الجهات'}</div><div class="v">${r.by_party.length}</div></div>
    </div>
    <div class="grid g2" style="margin-top:18px">
      <div class="panel" style="margin:0"><div class="ph"><h2>${dir === 'in' ? 'دخلت من مين' : 'خرجت لمين'}</h2></div>${r.by_party.length ? `<div class="tbl-wrap"><table class="t">
        <thead><tr><th>الاسم</th><th class="n">المرات</th><th class="n">المجموع</th></tr></thead>
        <tbody>${r.by_party.map((x) => `<tr><td><b>${esc(x.party)}</b></td><td class="n">${x.count}</td><td class="n ${cls}"><b>${money(x.total)}</b></td></tr>`).join('')}</tbody>
        <tfoot><tr><td>الإجمالي</td><td class="n">${r.count}</td><td class="n">${money(r.total)}</td></tr></tfoot></table></div>` : emptyState('مفيش', '')}</div>
      <div class="panel" style="margin:0"><div class="ph"><h2>حسب النوع</h2></div>${r.by_category.length ? `<div class="tbl-wrap"><table class="t">
        <thead><tr><th>النوع</th><th class="n">المرات</th><th class="n">المجموع</th></tr></thead>
        <tbody>${r.by_category.map((x) => `<tr><td>${CASH_CAT[x.category] || x.category}</td><td class="n">${x.count}</td><td class="n ${cls}">${money(x.total)}</td></tr>`).join('')}</tbody></table></div>` : emptyState('مفيش', '')}</div>
    </div>
    ${r.by_day.length > 1 ? `<div class="panel"><div class="ph"><h2>مجموع كل يوم</h2></div><div class="tbl-wrap"><table class="t">
      <thead><tr><th>اليوم</th><th class="n">المرات</th><th class="n">المجموع</th></tr></thead>
      <tbody>${r.by_day.map((x) => `<tr><td>${dateLong(x.date)}</td><td class="n">${x.count}</td><td class="n ${cls}"><b>${money(x.total)}</b></td></tr>`).join('')}</tbody></table></div></div>` : ''}
    <div class="panel"><div class="ph"><h2>بالتفصيل</h2></div>${r.movements.length ? `<div class="tbl-wrap"><table class="t">
      <thead><tr><th>التاريخ</th><th>${dir === 'in' ? 'من' : 'لـ'}</th><th>النوع</th><th>البيان</th><th class="n">المبلغ</th><th>المحاسب</th></tr></thead>
      <tbody>${r.movements.map((x) => `<tr><td>${date(x.date)} <span class="small muted">${x.time}</span></td><td><b>${esc(x.party || '—')}</b></td>
        <td>${CASH_CAT[x.category] || x.category}</td><td class="small">${esc(x.description)}</td><td class="n ${cls}">${money(x.amount)}</td><td class="small muted">${esc(x.by || '')}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="4">الإجمالي</td><td class="n">${money(r.total)}</td><td></td></tr></tfoot></table></div>` : emptyState('مفيش حركة في الفترة دي', 'غيّر التاريخ')}</div>`;
  }

  // ---------- الملخص ----------
  async function drawSummary() {
    const r = data = await api.rpc('report_period', { from, to });
    const s = r.sales;
    res.innerHTML = `
    <div class="ledger-strip" style="margin-top:18px">
      <div><div class="k">إجمالي المبيعات</div><div class="v">${money(s.total)}</div><div class="h">${s.count} فاتورة${r.voided ? ` — ${r.voided} ملغية` : ''}</div></div>
      <div><div class="k">نقدي</div><div class="v pos">${money(s.cash)}</div><div class="h">رهن صناديق ${moneyT(s.deposits)}</div></div>
      <div><div class="k">آجل</div><div class="v neg">${money(s.credit)}</div><div class="h">اتدفع منه مقدم ${moneyT(s.credit_paid)}</div></div>
      <div><div class="k">تحصيلات من الزباين</div><div class="v pos">${money(r.collections)}</div></div>
    </div>
    <div class="ledger-strip" style="margin-top:12px">
      <div><div class="k">عمولتك من فواتير الموردين</div><div class="v pos">${money(r.commission.commission)}</div><div class="h">${r.commission.count} فاتورة — مبيعات ${moneyT(r.commission.gross)}</div></div>
      <div><div class="k">اتصرف للموردين</div><div class="v">${money(r.supplier_paid)}</div></div>
      <div><div class="k">رد رهن صناديق</div><div class="v">${money(n(r.crate_returns.cash) + n(r.crate_returns.account))}</div><div class="h">${r.crate_returns.count} صندوق رجع</div></div>
      <div><div class="k">رصيد العهدة آخر الفترة</div><div class="v">${money(r.cash.closing)}</div><div class="h">أول الفترة ${moneyT(r.cash.opening)}</div></div>
    </div>
    <div class="grid g2" style="margin-top:18px">
      <div class="panel" style="margin:0"><div class="ph"><h2>الأصناف المباعة</h2></div>${r.items.length ? `<div class="tbl-wrap"><table class="t">
        <thead><tr><th>الصنف</th><th class="n">العدد</th><th class="n">الوزن</th><th class="n">القيمة</th></tr></thead>
        <tbody>${r.items.map((x) => `<tr><td>${esc(x.item)}</td><td class="n">${qty(x.qty)}</td><td class="n">${qty(x.weight)}</td><td class="n">${money(x.amount)}</td></tr>`).join('')}</tbody></table></div>` : emptyState('مفيش بيع', '')}</div>
      <div class="panel" style="margin:0"><div class="ph"><h2>أكبر الزباين</h2></div>${r.customers.length ? `<div class="tbl-wrap"><table class="t">
        <tbody>${r.customers.map((x) => `<tr><td>${esc(x.customer)}</td><td class="n muted">${x.count} فاتورة</td><td class="n">${money(x.total)}</td></tr>`).join('')}</tbody></table></div>` : emptyState('مفيش بيع', '')}</div>
    </div>
    <div class="grid g2" style="margin-top:18px">
      <div class="panel" style="margin:0"><div class="ph"><h2>حركة العهدة</h2></div><div class="tbl-wrap"><table class="t">
        <thead><tr><th>النوع</th><th class="n">وارد</th><th class="n">منصرف</th></tr></thead>
        <tbody>${r.cash.by_category.map((c) => `<tr><td>${CASH_CAT[c.category] || c.category}</td><td class="n t-in">${c.direction === 'in' ? money(c.total) : ''}</td><td class="n t-out">${c.direction === 'out' ? money(c.total) : ''}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td>الإجمالي</td><td class="n">${money(r.cash.total_in)}</td><td class="n">${money(r.cash.total_out)}</td></tr></tfoot></table></div></div>
      <div class="panel" style="margin:0"><div class="ph"><h2>المصروفات</h2></div>${r.expenses.length ? `<div class="tbl-wrap"><table class="t">
        <tbody>${r.expenses.map((x) => `<tr><td>${CASH_CAT[x.category] || x.category}</td><td class="n t-out">${money(x.total)}</td></tr>`).join('')}</tbody></table></div>` : emptyState('مفيش مصروفات', '')}</div>
    </div>
    ${r.days.length > 1 ? `<div class="panel"><div class="ph"><h2>يوم بيوم</h2></div><div class="tbl-wrap"><table class="t">
      <thead><tr><th>اليوم</th><th class="n">المبيعات</th><th class="n">وارد العهدة</th><th class="n">منصرف العهدة</th><th class="n">رصيد آخر اليوم</th></tr></thead>
      <tbody>${r.days.map((x) => `<tr class="click" data-day="${x.date}"><td>${date(x.date)}</td><td class="n">${money(x.sales)}</td><td class="n t-in">${money(x.cash_in)}</td>
        <td class="n t-out">${money(x.cash_out)}</td><td class="n"><b>${money(x.closing)}</b></td></tr>`).join('')}</tbody></table></div></div>` : ''}`;
    res.querySelectorAll('[data-day]').forEach((row) => row.onclick = () => app.go('#/cash?date=' + row.dataset.day));
  }

  el.querySelector('#tabs').onclick = (e) => { const b = e.target.closest('button'); if (b) { tab = b.dataset.t; load().catch(err); } };
  el.querySelector('#pre').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; pk = b.dataset.k; [, from, to] = presets[pk]; load().catch(err); };
  el.querySelector('#f1').onchange = (e) => { from = e.target.value; pk = ''; load().catch(err); };
  el.querySelector('#f2').onchange = (e) => { to = e.target.value; pk = ''; load().catch(err); };
  el.querySelector('#q').addEventListener('input', debounce(() => load().catch(err), 350));
  el.querySelector('#print').onclick = () => {
    if (!data) return;
    if (tab === 'sales') salesDetailDoc(data, app.settings);
    else if (tab === 'in' || tab === 'out') moneyDoc(data, app.settings);
    else reportDoc(data, app.settings, from === to ? 'التقرير اليومي' : (pk === 'month' || pk === 'last' ? 'التقرير الشهري' : 'تقرير الفترة'));
  };
  await load();
}

export async function renderDebts({ app, el }) {
  const rows = await api.rpc('report_debts');
  const debt = rows.filter((r) => n(r.balance) > 0);
  const total = debt.reduce((a, r) => a + n(r.balance), 0);
  el.innerHTML = `
  <div class="page-head"><h1>المديونيات والصناديق</h1><button class="btn" id="print">${icon('print')} طباعة</button>
    <div class="sub">كل زبون عليه فلوس أو صناديق</div></div>
  <div class="ledger-strip" style="grid-template-columns:repeat(2,1fr)">
    <div><div class="k">إجمالي الفلوس اللي برة</div><div class="v neg">${money(total)}</div><div class="h">${debt.length} زبون</div></div>
    <div><div class="k">زباين ليهم فلوس عندنا</div><div class="v pos">${money(rows.filter((r) => n(r.balance) < 0).reduce((a, r) => a - n(r.balance), 0))}</div></div>
  </div>
  <div class="panel" style="margin-top:18px">${rows.length ? `<div class="tbl-wrap"><table class="t">
    <thead><tr><th>الزبون</th><th>التليفون</th><th class="n">الرصيد</th><th>الصناديق</th><th>آخر دفعة</th><th>آخر شراء</th></tr></thead>
    <tbody>${rows.map((r) => `<tr class="click" data-id="${r.id}"><td><b>${esc(r.name)}</b></td><td class="num muted">${esc(r.phone)}</td>
      <td class="n ${n(r.balance) > 0 ? 't-out' : 't-in'}"><b>${money(r.balance)}</b></td>
      <td>${r.crates.map((c) => tag('crate', c.count + ' ' + c.name)).join(' ')}</td><td>${r.last_payment ? date(r.last_payment) : '<span class="muted">—</span>'}</td><td>${date(r.last_sale)}</td></tr>`).join('')}</tbody></table></div>`
    : emptyState('مفيش مديونيات', 'كل الحسابات خالصة')}</div>`;
  el.querySelectorAll('[data-id]').forEach((r) => r.onclick = () => app.go('#/customers/' + r.dataset.id));
  el.querySelector('#print').onclick = () => debtsDoc(rows, app.settings);
}
