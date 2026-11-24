import { api } from '../api.js';
import { esc, money, moneyT, qty, n, icon, err, tag, date, todayISO, addDays, monthRange, emptyState, CASH_CAT, dateT } from '../ui.js';
import { reportDoc, debtsDoc } from '../print.js';

export async function render({ app, el }) {
  const t = todayISO();
  const presets = {
    today: ['النهارده', t, t],
    yesterday: ['امبارح', addDays(t, -1), addDays(t, -1)],
    month: ['الشهر ده', ...monthRange(t)],
    last: ['الشهر اللي فات', ...monthRange(t, -1)],
  };
  let [, from, to] = presets.today;
  let pk = 'today';
  el.innerHTML = `
  <div class="page-head"><h1>التقارير</h1><a class="btn" href="#/debts">${icon('users')} المديونيات والصناديق</a></div>
  <div class="panel"><div class="pb row" style="align-items:flex-end">
    <div class="seg" id="pre">${Object.entries(presets).map(([k, v]) => `<button data-k="${k}">${v[0]}</button>`).join('')}</div>
    <label class="f">من<input class="in" type="date" id="f1"></label><label class="f">إلى<input class="in" type="date" id="f2"></label>
    <button class="btn" id="print">${icon('print')} طباعة التقرير</button>
  </div></div><div id="res"></div>`;
  const res = el.querySelector('#res');
  let data;
  const load = async () => {
    el.querySelector('#f1').value = from; el.querySelector('#f2').value = to;
    el.querySelectorAll('#pre button').forEach((b) => b.classList.toggle('on', b.dataset.k === pk));
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
      <div><div class="k">عمولتك من التصفيات</div><div class="v pos">${money(r.commission.commission)}</div><div class="h">${r.commission.count} تصفية — مبيعات ${moneyT(r.commission.gross)}</div></div>
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
  };
  el.querySelector('#pre').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; pk = b.dataset.k; [, from, to] = presets[pk]; load().catch(err); };
  el.querySelector('#f1').onchange = (e) => { from = e.target.value; pk = ''; load().catch(err); };
  el.querySelector('#f2').onchange = (e) => { to = e.target.value; pk = ''; load().catch(err); };
  el.querySelector('#print').onclick = () => data && reportDoc(data, app.settings, from === to ? 'التقرير اليومي' : (pk === 'month' || pk === 'last' ? 'التقرير الشهري' : 'تقرير الفترة'));
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
