// سجل التعديلات والحذف: أي حاجة اتحذفت أو اتعدلت بعد ما اتسجلت — ظاهر للمدير وللمحاسبين
import { api } from '../api.js';
import { esc, money, icon, ok, err, busy, tag, todayISO, addDays, dateLong, dateT, emptyState } from '../ui.js';

const TARGET = {
  sale: 'فاتورة بيع', payment: 'تحصيل من زبون', cash_in: 'تحصيل بمسمى', cash_out: 'خارج', shipment: 'نقلة',
  stock: 'مخزون', advance: 'مقدم لعميل', settlement: 'فاتورة مورد',
};
const LINK = { sale: (id) => `#/sales/${id}`, shipment: (id) => `#/shipments/${id}` };
const timeT = (ts) => ts ? new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Cairo' }) : '';
const dayT = (ts) => ts ? new Date(ts).toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' }) : '';

export async function render({ app, el, query }) {
  let from = query.from || addDays(todayISO(), -6), to = query.to || todayISO();
  const admin = app.can('approve');
  el.innerHTML = `<div class="page-head"><h1>التعديلات والحذف</h1>
      <div class="sub">كل حاجة اتحذفت أو اتعدلت بعد ما اتسجلت: فواتير، تحصيل، خارج، بضاعة. المحذوف مش محسوب في الفلوس ولا البضاعة، بس بيفضل ظاهر هنا وفي العهدة والتقارير.</div></div>
    <div class="panel"><div class="ph"><h2>${icon('edit')} السجل</h2>
      <label class="f inl">من <input class="in" type="date" id="f" value="${from}"></label>
      <label class="f inl">إلى <input class="in" type="date" id="t" value="${to}"></label>
      ${admin ? `<button class="btn sm primary" id="seen">${icon('check')} شفت كل اللي جديد</button>` : ''}</div>
      <div id="list"></div></div>`;
  const load = async () => {
    const r = await api.rpc('list_changes', { from, to });
    el.querySelector('#list').innerHTML = r.rows.length ? `<div class="tbl-wrap"><table class="t">
      <thead><tr><th>الوقت</th><th>العملية</th><th>على إيه</th><th>التفاصيل</th><th class="n">المبلغ</th><th>السبب</th><th>بواسطة</th>${admin ? '<th></th>' : ''}</tr></thead>
      <tbody>${r.rows.map((c) => `<tr ${LINK[c.target] && c.target_id ? `class="click" data-go="${LINK[c.target](c.target_id)}"` : ''}>
        <td>${dateT(dayT(c.at))} <span class="small muted">${timeT(c.at)}</span></td>
        <td>${tag(c.action === 'void' ? 'void' : 'pending', c.action === 'void' ? 'حذف' : 'تعديل')}</td>
        <td>${TARGET[c.target] || c.target}</td><td>${esc(c.summary)}</td>
        <td class="n">${Number(c.amount) ? money(Math.abs(c.amount)) : ''}</td><td class="small">${esc(c.reason || '')}</td>
        <td class="small">${esc(c.by || '')}${c.by_admin ? ' <span class="muted">(مدير)</span>' : ''}${c.requested_by_name ? `<div class="muted">بطلب من ${esc(c.requested_by_name)}</div>` : ''}</td>
        ${admin ? `<td>${c.seen_at ? '' : tag('pending', 'جديد')}</td>` : ''}</tr>`).join('')}</tbody></table></div>`
      : emptyState('مفيش أي تعديل أو حذف في الفترة دي', '');
    el.querySelectorAll('[data-go]').forEach((x) => x.onclick = () => app.go(x.dataset.go));
  };
  const f = el.querySelector('#f'), t = el.querySelector('#t');
  f.onchange = t.onchange = () => { from = f.value || todayISO(); to = t.value || from; load().catch(err); };
  const seen = el.querySelector('#seen');
  if (seen) seen.onclick = () => busy(seen, async () => {
    await api.rpc('mark_changes_seen');
    app.setChanges(0);
    ok('اتعلّم إنك شفت كل التعديلات');
    await load();
  });
  await load();
}
