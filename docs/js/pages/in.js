// التحصيل: أي فلوس داخلة الدرج بمسمى — دفعة من زبون عليه آجل قديم، أو وارد تاني (تمويل، فلوس داخلة بأي اسم)
// البيع النقدي العادي مش هنا: ده بيبان في عهدة المحاسب بالتفاصيل (العدد والوزن والسعر)
import { api } from '../api.js';
import { esc, money, moneyT, n, icon, ok, err, busy, formData, todayISO, dateLong, dateT, emptyState, CASH_CAT, moneyView } from '../ui.js';
import { moneyDoc } from '../print.js';
import { moneyTable, bindMoneyRows } from './moneyrows.js';
import { paymentModal } from './customers.js';

const OTHER_CATS = ['other_in', 'funding'];

export async function render({ app, el, query }) {
  let from = query.from || todayISO(), to = query.to || todayISO();
  const c = await api.rpc('current_shift');
  const s = c.shift;
  const admin = app.can('approve');
  const canCollect = app.can('collections'), canOther = app.can('cash');

  // الفلوس اللي داخلة بتتسجل على العهدة المفتوحة — نوضح على عهدة مين
  let state, canAdd = true;
  if (s && c.mine) state = `<div class="alert info">الفلوس هتدخل على <b>عهدتك</b>.</div>`;
  else if (s && admin) state = `<div class="alert warn">العهدة المفتوحة باسم <b>${esc(s.user_name)}</b>. الفلوس هتدخل على عهدته وتتسجل باسمك انت (المدير).</div>`;
  else if (s) { canAdd = false; state = `<div class="alert err">العهدة مفتوحة باسم <b>${esc(s.user_name)}</b>. لازم يقفلها الأول وتفتح عهدتك علشان تحصّل.</div>`; }
  else if (admin) state = `<div class="alert warn">مفيش عهدة مفتوحة. الفلوس هتتسجل على الدرج باسمك انت (المدير)، وهتتضاف لرصيد العهدة اللي جاية.</div>`;
  else { canAdd = false; state = `<div class="alert err">لازم تفتح عهدتك الأول علشان تحصّل. <a href="#/cash">افتح العهدة</a></div>`; }

  const modes = [canCollect && ['cust', 'من زبون (آجل قديم)'], canOther && ['other', 'وارد تاني بمسمى']].filter(Boolean);
  let mode = modes[0]?.[0];

  el.innerHTML = `<div class="page-head"><h1>التحصيل</h1>
      <div class="sub">الفلوس اللي بتدخل الدرج بمسمى: دفعة من حساب زبون، تمويل للدرج، أو أي وارد تاني. البيع النقدي العادي بيبان في العهدة.</div></div>
    <div class="grid g2" style="align-items:start">
      <div class="panel" style="margin:0"><div class="ph"><h2>${icon('income')} تحصيل جديد</h2></div><div class="pb grid">
        ${state}
        ${canAdd && modes.length ? `
          ${modes.length > 1 ? `<div class="seg" id="mode">${modes.map(([k, l]) => `<button type="button" data-m="${k}">${l}</button>`).join('')}</div>` : ''}
          <div id="form"></div>` : (canAdd ? '<div class="muted">مش عندك صلاحية تسجيل تحصيل.</div>' : '')}
      </div></div>
      <div class="panel" style="margin:0" id="sum"></div>
    </div>
    <div class="panel" style="margin-top:18px">
      <div class="ph"><h2>اللي اتحصّل</h2>
        <label class="f inl">من <input class="in" type="date" id="f" value="${from}"></label>
        <label class="f inl">إلى <input class="in" type="date" id="t" value="${to}"></label>
        <button class="btn sm" id="today">النهارده</button><button class="btn sm" id="pr">${icon('print')} طباعة</button></div>
      <div id="list"></div></div>`;

  let data = null;
  const load = async () => {
    data = moneyView(await api.rpc('report_money', { direction: 'in', from, to }), 'in');
    const period = from === to ? dateLong(from) : `من ${dateT(from)} إلى ${dateT(to)}`;
    el.querySelector('#sum').innerHTML = `<div class="ph"><h2>الإجمالي</h2><span class="muted small">${period}</span></div><div class="pb">
      <div class="grand num t-in" style="margin-bottom:10px">${moneyT(data.total)}</div>
      ${data.by_category.map((x) => `<div class="totals"><div class="line"><span>${CASH_CAT[x.category] || x.category} <span class="muted small">(${x.count})</span></span><b>${money(x.total)}</b></div></div>`).join('') || '<span class="muted">لسه مفيش</span>'}</div>`;
    el.querySelector('#list').innerHTML = moneyTable(data, { from, to, dir: 'in', empty: 'مفيش فلوس اتحصّلت في الفترة دي' });
    bindMoneyRows(el.querySelector('#list'), data, load);
  };

  // ---------- الفورم ----------
  let customers = null;
  const drawForm = async () => {
    const box = el.querySelector('#form');
    if (!box) return;
    el.querySelectorAll('#mode button').forEach((b) => b.classList.toggle('on', b.dataset.m === mode));
    if (mode === 'cust') {
      customers = customers || await api.rpc('list_customers', { search: '' });
      const owing = customers.filter((x) => n(x.balance) > 0).sort((a, b) => n(b.balance) - n(a.balance));
      const rest = customers.filter((x) => !(n(x.balance) > 0));
      const opt = (x) => `<option value="${x.id}">${esc(x.name)}${n(x.balance) > 0 ? ' — عليه ' + money(x.balance) : ''}</option>`;
      box.innerHTML = `<form class="grid" id="cf">
        <label class="f">الزبون<select class="in" name="customer_id" required><option value="">اختار الزبون…</option>
          ${owing.length ? `<optgroup label="عليهم فلوس">${owing.map(opt).join('')}</optgroup>` : ''}
          ${rest.length ? `<optgroup label="باقي الزباين">${rest.map(opt).join('')}</optgroup>` : ''}</select></label>
        <button class="btn primary lg" type="submit">${icon('money')} كمّل التحصيل</button></form>`;
      const f = box.querySelector('#cf');
      f.onsubmit = (e) => {
        e.preventDefault();
        const cu = customers.find((x) => String(x.id) === f.customer_id.value);
        if (!cu) return err(new Error('اختار الزبون'));
        paymentModal(app, cu, async () => { customers = null; await load(); await drawForm(); });
      };
    } else if (mode === 'other') {
      box.innerHTML = `<form class="grid" id="of">
        <label class="f">النوع<select class="in" name="category">${OTHER_CATS.map((k) => `<option value="${k}">${CASH_CAT[k]}</option>`).join('')}</select></label>
        <label class="f">المبلغ<input class="in big" name="amount" type="number" min="0" step="0.01" required></label>
        <label class="f">المسمى (البيان)<input class="in" name="description" required placeholder="مثلاً: فلوس بضاعة آجل قديمة من الدفتر"></label>
        <label class="f">من مين<input class="in" name="party" placeholder="اسم اللي دفع"></label>
        <button class="btn primary lg" type="submit">${icon('check')} سجّل التحصيل</button></form>`;
      const f = box.querySelector('#of');
      f.onsubmit = (e) => {
        e.preventDefault();
        busy(f.querySelector('[type=submit]'), async () => {
          const v = formData(f);
          if (!(n(v.amount) > 0)) throw new Error('اكتب المبلغ');
          await api.rpc('add_cash', { ...v, direction: 'in' });
          ok(`اتسجل تحصيل ${moneyT(v.amount)}`);
          f.reset();
          await load();
        });
      };
    }
  };
  el.querySelectorAll('#mode button').forEach((b) => { b.onclick = () => { mode = b.dataset.m; drawForm().catch(err); }; });

  const f = el.querySelector('#f'), t = el.querySelector('#t');
  f.onchange = t.onchange = () => { from = f.value || todayISO(); to = t.value || from; load().catch(err); };
  el.querySelector('#today').onclick = () => { from = to = f.value = t.value = todayISO(); load().catch(err); };
  el.querySelector('#pr').onclick = () => data && moneyDoc(data, app.settings);
  await Promise.all([load(), drawForm()]);
}
