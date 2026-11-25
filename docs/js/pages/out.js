// الخارج: تسجيل مصروف من الدرج على طول + كل اللي خرج النهارده (أو في أي فترة)
import { api } from '../api.js';
import { esc, money, moneyT, n, icon, ok, err, busy, formData, todayISO, dateLong, dateT, emptyState, CASH_CAT } from '../ui.js';
import { moneyDoc } from '../print.js';

const OUT_CATS = ['transport', 'bill', 'salary', 'withdrawal', 'other_out'];

export async function render({ app, el, query }) {
  let from = query.from || todayISO(), to = query.to || todayISO();
  const c = await api.rpc('current_shift');
  const s = c.shift;
  const admin = app.can('approve');
  // المصروف بيتخصم من العهدة المفتوحة — نوضح من عهدة مين
  let state, canAdd = true;
  if (s && c.mine) {
    state = `<div class="alert info">المصروف هيتخصم من <b>عهدتك</b>. المفروض في الدرج دلوقتي <b>${moneyT(n(s.opening_amount) + n(s.live_in) - n(s.live_out))}</b>.</div>`;
  } else if (s && admin) {
    state = `<div class="alert warn">العهدة المفتوحة باسم <b>${esc(s.user_name)}</b>. المصروف هيتخصم من عهدته ويتسجل باسمك انت (المدير).</div>`;
  } else if (s) {
    canAdd = false;
    state = `<div class="alert err">العهدة مفتوحة باسم <b>${esc(s.user_name)}</b>. لازم يقفلها الأول وتفتح عهدتك علشان تسجل مصروف.</div>`;
  } else if (admin) {
    state = `<div class="alert warn">مفيش عهدة مفتوحة. المصروف هيتسجل على الدرج باسمك انت (المدير)، وهيتخصم من رصيد العهدة اللي جاية.</div>`;
  } else {
    canAdd = false;
    state = `<div class="alert err">لازم تفتح عهدتك الأول علشان تسجل مصروف. <a href="#/cash">افتح العهدة</a></div>`;
  }

  el.innerHTML = `<div class="page-head"><h1>الخارج</h1>
      <div class="sub">أي فلوس بتخرج من الدرج: أجرة نقل، فواتير، يوميات، سحب، أو أي مصروف تاني.</div></div>
    <div class="grid g2" style="align-items:start">
      <div class="panel" style="margin:0"><div class="ph"><h2>${icon('wallet')} مصروف جديد</h2></div><div class="pb grid">
        ${state}
        ${canAdd && app.can('cash') ? `<form class="grid" id="of">
          <label class="f">النوع<select class="in" name="category">${OUT_CATS.map((k) => `<option value="${k}">${CASH_CAT[k]}</option>`).join('')}</select></label>
          <label class="f">المبلغ<input class="in big" name="amount" type="number" min="0" step="0.01" required></label>
          <label class="f">البيان<input class="in" name="description" required placeholder="مثلاً: أجرة عربية نقل لمحل الأمانة"></label>
          <label class="f">اتصرف لـ<input class="in" name="party" placeholder="اسم اللي استلم الفلوس"></label>
          <button class="btn warn lg" type="submit">${icon('check')} سجّل المصروف</button>
        </form>` : (canAdd ? '<div class="muted">مش عندك صلاحية تسجيل مصروفات.</div>' : '')}
      </div></div>
      <div class="panel" style="margin:0" id="sum"></div>
    </div>
    <div class="panel" style="margin-top:18px">
      <div class="ph"><h2>اللي خرج</h2>
        <label class="f inl">من <input class="in" type="date" id="f" value="${from}"></label>
        <label class="f inl">إلى <input class="in" type="date" id="t" value="${to}"></label>
        <button class="btn sm" id="today">النهارده</button><button class="btn sm" id="pr">${icon('print')} طباعة</button></div>
      <div id="list"></div></div>`;

  let data = null;
  const load = async () => {
    data = await api.rpc('report_money', { direction: 'out', from, to });
    // العجز وتصفير الدرج مش مصروفات — بيبانوا في العهدة والتقارير
    const skip = ['shift_short', 'shift_over', 'drawer_reset'];
    data.movements = data.movements.filter((x) => !skip.includes(x.category));
    data.by_category = data.by_category.filter((x) => !skip.includes(x.category));
    data.total = data.movements.reduce((a, x) => a + n(x.amount), 0);
    data.count = data.movements.length;
    const parties = {};
    data.movements.forEach((x) => { const k = x.party || 'بدون اسم'; parties[k] = parties[k] || { party: k, count: 0, total: 0 }; parties[k].count++; parties[k].total += n(x.amount); });
    data.by_party = Object.values(parties).sort((a, b) => b.total - a.total);
    const period = from === to ? dateLong(from) : `من ${dateT(from)} إلى ${dateT(to)}`;
    el.querySelector('#sum').innerHTML = `<div class="ph"><h2>الإجمالي</h2><span class="muted small">${period}</span></div><div class="pb">
      <div class="grand num t-out" style="margin-bottom:10px">${moneyT(data.total)}</div>
      ${data.by_category.map((x) => `<div class="totals"><div class="line"><span>${CASH_CAT[x.category] || x.category} <span class="muted small">(${x.count})</span></span><b>${money(x.total)}</b></div></div>`).join('') || '<span class="muted">لسه مفيش</span>'}</div>`;
    el.querySelector('#list').innerHTML = data.movements.length ? `<div class="tbl-wrap"><table class="t">
      <thead><tr>${from === to ? '' : '<th>التاريخ</th>'}<th>الوقت</th><th>النوع</th><th>البيان</th><th>لمين</th><th class="n">المبلغ</th><th>بواسطة</th></tr></thead>
      <tbody>${data.movements.map((x) => `<tr>${from === to ? '' : `<td>${dateT(x.date)}</td>`}<td class="muted">${x.time}</td>
        <td>${CASH_CAT[x.category] || x.category}</td><td>${esc(x.description)}</td><td>${esc(x.party || '')}</td>
        <td class="n t-out"><b>${money(x.amount)}</b></td><td class="small muted">${esc(x.by || '')}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="${from === to ? 4 : 5}">الإجمالي (${data.count})</td><td class="n">${money(data.total)}</td><td></td></tr></tfoot></table></div>`
      : emptyState('مفيش فلوس خرجت في الفترة دي', '');
  };
  const f = el.querySelector('#f'), t = el.querySelector('#t');
  f.onchange = t.onchange = () => { from = f.value || todayISO(); to = t.value || from; load().catch(err); };
  el.querySelector('#today').onclick = () => { from = to = f.value = t.value = todayISO(); load().catch(err); };
  el.querySelector('#pr').onclick = () => data && moneyDoc(data, app.settings);
  const form = el.querySelector('#of');
  if (form) form.onsubmit = (e) => {
    e.preventDefault();
    busy(form.querySelector('[type=submit]'), async () => {
      const v = formData(form);
      if (!(n(v.amount) > 0)) throw new Error('اكتب المبلغ');
      await api.rpc('add_cash', { ...v, direction: 'out' });
      ok(`اتسجل مصروف ${moneyT(v.amount)}`);
      form.reset();
      await load();
    });
  };
  await load();
}
