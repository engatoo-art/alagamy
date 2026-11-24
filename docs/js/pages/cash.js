import { api } from '../api.js';
import { esc, money, moneyT, icon, ok, err, busy, modal, formData, todayISO, addDays, dateLong, emptyState, CASH_CAT } from '../ui.js';
import { cashDoc } from '../print.js';

const IN_CATS = ['funding', 'other_in'];
const OUT_CATS = ['transport', 'bill', 'salary', 'withdrawal', 'other_out'];

function cashModal(dir, after) {
  const cats = dir === 'in' ? IN_CATS : OUT_CATS;
  const m = modal({
    title: dir === 'in' ? 'وارد للعهدة' : 'مصروف من العهدة',
    body: `<form class="grid" id="cf">
      <label class="f">النوع<select class="in" name="category">${cats.map((c) => `<option value="${c}">${CASH_CAT[c]}</option>`).join('')}</select></label>
      <label class="f">المبلغ<input class="in big" name="amount" type="number" min="0" step="0.01" required></label>
      <label class="f">البيان<input class="in" name="description" required placeholder="${dir === 'in' ? 'مثلاً: تمويل الدرج من صاحب المحل' : 'مثلاً: أجرة عربية نقل لمحل الأمانة'}"></label>
      <label class="f">${dir === 'in' ? 'من' : 'اتصرف لـ'}<input class="in" name="party"></label>
    </form>`,
    actions: `<button class="btn ${dir === 'in' ? 'primary' : 'warn'}" data-ok>تسجيل</button><button class="btn" data-close>رجوع</button>`,
  });
  const go = () => busy(m.$('[data-ok]'), async () => {
    const r = await api.rpc('add_cash', { ...formData(m.$('#cf')), direction: dir });
    ok(`اتسجل — رصيد العهدة ${moneyT(r.balance)}`);
    m.close(); after();
  });
  m.$('[data-ok]').onclick = go;
  m.$('#cf').onsubmit = (e) => { e.preventDefault(); go(); };
}

export async function render({ app, el, query }) {
  let day = query.date || todayISO();
  const draw = async () => {
    const cd = await api.rpc('cash_day', { date: day });
    const ins = cd.by_category.filter((c) => c.direction === 'in');
    const outs = cd.by_category.filter((c) => c.direction === 'out');
    el.innerHTML = `
    <div class="page-head"><h1>العهدة اليومية</h1>
      ${app.can('cash') ? `<button class="btn primary" data-d="in">${icon('plus')} وارد للدرج</button><button class="btn warn" data-d="out">${icon('wallet')} مصروف</button>` : ''}
      <button class="btn" data-p="A4">${icon('print')} طباعة</button><button class="btn" data-p="80mm">إيصال</button>
      <div class="sub">كل فلوس داخلة أو خارجة من الدرج بتتسجل هنا لوحدها: البيع النقدي والتحصيلات ورد الرهن وصرف الموردين.</div></div>
    <div class="row" style="margin-bottom:14px">
      <button class="btn sm" data-nav="-1">اليوم اللي قبله</button>
      <input class="in" type="date" id="day" value="${day}" style="width:auto">
      <button class="btn sm" data-nav="1" ${day >= todayISO() ? 'disabled' : ''}>اليوم اللي بعده</button>
      <b style="margin-inline-start:8px">${dateLong(day)}</b>
    </div>
    <div class="ledger-strip">
      <div><div class="k">رصيد أول اليوم</div><div class="v">${money(cd.opening)}</div></div>
      <div><div class="k">الوارد</div><div class="v pos">${money(cd.total_in)}</div></div>
      <div><div class="k">المنصرف</div><div class="v neg">${money(cd.total_out)}</div></div>
      <div><div class="k">الرصيد آخر اليوم</div><div class="v">${money(cd.closing)}</div><div class="h">المفروض يكون ده اللي في الدرج</div></div>
    </div>
    <div class="grid g2" style="margin-top:18px">
      <div class="panel"><div class="ph"><h2>الوارد</h2></div><div class="pb">${ins.length ? ins.map((c) => `<div class="totals"><div class="line"><span>${CASH_CAT[c.category] || c.category} <span class="muted small">(${c.count})</span></span><b class="t-in">${money(c.total)}</b></div></div>`).join('') : '<span class="muted">مفيش وارد</span>'}</div></div>
      <div class="panel" style="margin-top:0"><div class="ph"><h2>المنصرف</h2></div><div class="pb">${outs.length ? outs.map((c) => `<div class="totals"><div class="line"><span>${CASH_CAT[c.category] || c.category} <span class="muted small">(${c.count})</span></span><b class="t-out">${money(c.total)}</b></div></div>`).join('') : '<span class="muted">مفيش منصرف</span>'}</div></div>
    </div>
    <div class="panel"><div class="ph"><h2>كل الحركات</h2></div>${cd.movements.length ? `<div class="tbl-wrap"><table class="t">
      <thead><tr><th>الوقت</th><th>النوع</th><th>البيان</th><th class="n">وارد</th><th class="n">منصرف</th><th>المحاسب</th></tr></thead>
      <tbody>${cd.movements.map((x) => `<tr ${x.ref_type === 'sale' ? `class="click" data-go="#/sales/${x.ref_id}"` : x.ref_type === 'settlement' ? `class="click" data-go="#/settlements/${x.ref_id}"` : ''}>
        <td class="num muted">${x.time}</td><td>${CASH_CAT[x.category] || x.category}</td><td>${esc(x.description)}</td>
        <td class="n t-in">${x.direction === 'in' ? money(x.amount) : ''}</td><td class="n t-out">${x.direction === 'out' ? money(x.amount) : ''}</td>
        <td class="small muted">${esc(x.by || '')}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="3">الإجمالي</td><td class="n">${money(cd.total_in)}</td><td class="n">${money(cd.total_out)}</td><td></td></tr></tfoot></table></div>`
      : emptyState('مفيش حركة في اليوم ده', '')}</div>`;
    el.querySelectorAll('[data-d]').forEach((b) => b.onclick = () => cashModal(b.dataset.d, () => draw().catch(err)));
    el.querySelectorAll('[data-p]').forEach((b) => b.onclick = () => cashDoc(cd, app.settings, b.dataset.p));
    el.querySelectorAll('[data-nav]').forEach((b) => b.onclick = () => { day = addDays(day, +b.dataset.nav); draw().catch(err); });
    el.querySelector('#day').onchange = (e) => { day = e.target.value || todayISO(); draw().catch(err); };
    el.querySelectorAll('[data-go]').forEach((r) => r.onclick = () => app.go(r.dataset.go));
  };
  await draw();
}
