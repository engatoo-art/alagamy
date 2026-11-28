import { api } from '../api.js';
import { esc, money, moneyT, qty, qtyT, n, icon, ok, err, busy, tag, date, emptyState, promptBox, PAY, CASH_CAT, UNIT, mvShown, voidTag } from '../ui.js';
import { shiftDetailDoc } from '../print.js';
import { chainNotes } from './cash.js';

const dayT = (ts) => ts ? new Date(ts).toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' }) : '';
const timeT = (ts) => ts ? new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Cairo' }) : '';
const diffTag = (d, closed) => {
  if (!closed) return tag('pending', 'مفتوحة');
  d = n(d);
  return d < 0 ? tag('rejected', 'عجز ' + moneyT(-d)) : d > 0 ? tag('approved', 'زيادة ' + moneyT(d)) : tag('ok', 'مظبوطة');
};

// ======================= كل المحاسبين =======================
export async function renderList({ app, el }) {
  const rows = await api.rpc('list_accountants');
  el.innerHTML = `<div class="page-head"><h1>المحاسبين</h1>
    <div class="sub">كل محاسب وعهده: بدأت بكام واتقفلت بكام، وفيها عجز ولا زيادة. اضغط على أي محاسب علشان تشوف عهده بالتفصيل.</div></div>
    <div class="panel">${rows.length ? `<div class="tbl-wrap"><table class="t">
      <thead><tr><th>المحاسب</th><th class="n">عدد العهد</th><th>دلوقتي</th><th class="n">إجمالي العجز</th><th class="n">إجمالي الزيادة</th>
        <th class="n">مستنية مراجعة</th><th class="n">الفواتير</th><th class="n">مبيعاته</th></tr></thead>
      <tbody>${rows.map((u) => `<tr class="click" data-u="${u.id}"><td><b>${esc(u.name)}</b> ${String(u.username).startsWith("deleted-") ? "" : `<span class="muted small num">${esc(u.username)}</span>`}
          ${u.role === 'admin' ? tag('approved', 'مدير') : ''}${u.deleted ? tag('void', 'حسابه محذوف') : ''}</td>
        <td class="n">${u.shifts}</td><td>${u.open ? tag('pending', 'عهدته مفتوحة') : '<span class="muted">—</span>'}</td>
        <td class="n ${n(u.short) ? 't-out' : 'muted'}">${money(u.short)}</td><td class="n ${n(u.over) ? 't-in' : 'muted'}">${money(u.over)}</td>
        <td class="n">${u.unreviewed ? tag('pending', u.unreviewed) : '<span class="muted">0</span>'}</td>
        <td class="n">${u.sales_count}</td><td class="n">${money(u.sales_total)}</td></tr>`).join('')}</tbody></table></div>`
      : emptyState('لسه مفيش محاسبين', 'ضيفهم من الإعدادات')}</div>`;
  el.querySelectorAll('[data-u]').forEach((r) => r.onclick = () => app.go('#/accountants/' + r.dataset.u));
}

// ======================= عهد محاسب واحد =======================
export async function renderOne({ app, el, params }) {
  const [accs, shifts] = await Promise.all([api.rpc('list_accountants'), api.rpc('list_shifts', { from: '2000-01-01' })]);
  const u = accs.find((x) => x.id === params[0]);
  if (!u) throw new Error('المحاسب غير موجود');
  const mine = shifts.filter((s) => s.user_id === u.id);
  el.innerHTML = `
  <div class="page-head" style="margin-bottom:12px"><a class="btn ghost sm" href="#/accountants">${icon('back')} المحاسبين</a></div>
  <div class="page-head"><h1>${esc(u.name)}</h1><div class="sub">${u.shifts} عهدة — ${u.sales_count} فاتورة بيع بإجمالي ${moneyT(u.sales_total)}</div></div>
  <div class="ledger-strip">
    <div><div class="k">عدد العهد</div><div class="v">${u.shifts}</div></div>
    <div><div class="k">إجمالي العجز</div><div class="v neg">${money(u.short)}</div></div>
    <div><div class="k">إجمالي الزيادة</div><div class="v pos">${money(u.over)}</div></div>
    <div><div class="k">مستنية مراجعة</div><div class="v wait">${u.unreviewed}</div></div>
  </div>
  <div class="panel" style="margin-top:18px">${mine.length ? `<div class="tbl-wrap"><table class="t">
    <thead><tr><th>رقم</th><th>فتحها</th><th>قفلها</th><th class="n">أول العهدة</th><th class="n">دخل</th><th class="n">خرج</th>
      <th class="n">المفروض</th><th class="n">الفعلي</th><th>النتيجة</th><th>المراجعة</th></tr></thead>
    <tbody>${mine.map((s) => {
      const closed = s.status === 'closed';
      const exp = closed ? n(s.expected_amount) : n(s.opening_amount) + n(s.live_in) - n(s.live_out);
      return `<tr class="click" data-s="${s.id}"><td class="num">${s.id}</td><td>${date(dayT(s.opened_at))} <span class="small muted">${timeT(s.opened_at)}</span></td>
        <td>${closed ? date(dayT(s.closed_at)) + ` <span class="small muted">${timeT(s.closed_at)}</span>` : ''}</td>
        <td class="n">${money(s.opening_amount)}${n(s.prev_difference) > 0 ? `<div class="small t-in">منه ${moneyT(s.prev_difference)} زيادة من ${esc(s.prev_user_name || '')}</div>` : ''}${s.reset_by ? '<div class="small muted">بعد تصفير الدرج</div>' : ''}</td><td class="n t-in">${money(closed ? s.total_in : s.live_in)}</td><td class="n t-out">${money(closed ? s.total_out : s.live_out)}</td>
        <td class="n">${money(exp)}</td><td class="n"><b>${closed ? money(s.counted_amount) : '—'}</b></td>
        <td>${diffTag(s.difference, closed)}</td><td>${s.reviewed_at ? tag('ok', 'تمت المراجعة') : closed ? tag('pending', 'لسه') : ''}</td></tr>`;
    }).join('')}</tbody></table></div>` : emptyState('المحاسب ده لسه مفتحش عهد', '')}</div>`;
  el.querySelectorAll('[data-s]').forEach((r) => r.onclick = () => app.go('#/shifts/' + r.dataset.s));
}

// ======================= تفاصيل عهدة =======================
export async function renderShift({ app, el, params }) {
  const d = await api.rpc('shift_detail', { id: +params[0] });
  const closed = d.status === 'closed';
  const tin = closed ? d.total_in : d.live_in, tout = closed ? d.total_out : d.live_out;
  const exp = closed ? n(d.expected_amount) : n(d.opening_amount) + n(tin) - n(tout);
  const st = d.sales_totals;
  el.innerHTML = `
  <div class="page-head" style="margin-bottom:12px"><a class="btn ghost sm" href="#/accountants/${d.user_id}">${icon('back')} عهد ${esc(d.user_name)}</a></div>
  <div class="page-head"><h1>عهدة ${esc(d.user_name)} رقم <span class="num">${d.id}</span></h1>
    ${diffTag(d.difference, closed)} ${d.reviewed_at ? tag('ok', 'تمت المراجعة') : ''}
    <button class="btn" id="pr">${icon('print')} طباعة بالتفصيل</button>
    ${closed && !d.reviewed_at && app.can('approve') ? `<button class="btn primary" id="rv">${icon('check')} تمت المراجعة وكله تمام</button>` : ''}
    <div class="sub">من ${date(dayT(d.opened_at))} ${timeT(d.opened_at)} ${closed ? `إلى ${date(dayT(d.closed_at))} ${timeT(d.closed_at)} — قفلها ${esc(d.closed_by_name || '')}` : '— لسه مفتوحة'}
      ${d.reviewed_at ? ` — راجعها ${esc(d.reviewed_by_name || '')}${d.review_note ? ': ' + esc(d.review_note) : ''}` : ''}</div></div>
  ${chainNotes(d, app.can('approve')).replace(/class="alert /g, 'style="margin-bottom:12px" class="alert ')}
  <div class="ledger-strip">
    <div><div class="k">أول العهدة</div><div class="v">${money(d.opening_amount)}</div><div class="h">${d.reset_by ? 'المدير صفّر الدرج' : d.prev_user_name ? 'من عهدة ' + esc(d.prev_user_name) : 'أول عهدة'}</div></div>
    <div><div class="k">دخل / خرج</div><div class="v"><span class="t-in">${money(tin)}</span> <small class="muted">/</small> <span class="t-out">${money(tout)}</span></div></div>
    <div><div class="k">المفروض في الدرج</div><div class="v">${money(exp)}</div></div>
    <div><div class="k">الفعلي</div><div class="v ${n(d.difference) < 0 ? 'neg' : ''}">${closed ? money(d.counted_amount) : '—'}</div></div>
  </div>
  <div class="ledger-strip" style="margin-top:12px">
    <div><div class="k">فواتير البيع</div><div class="v">${st.count}</div><div class="h">إجمالي ${moneyT(st.total)}</div></div>
    <div><div class="k">نقدي اتقبض</div><div class="v pos">${money(st.cash)}</div></div>
    <div><div class="k">آجل</div><div class="v neg">${money(st.credit)}</div></div>
    <div><div class="k">رهن الصناديق</div><div class="v">${money(st.deposit)}</div><div class="h">${qtyT(st.crates)} صندوق برهن</div></div>
  </div>
  <div class="panel" style="margin-top:18px"><div class="ph"><h2>باع إيه</h2></div>${d.items.length ? `<div class="tbl-wrap"><table class="t">
    <thead><tr><th>الصنف</th><th class="n">العدد</th><th class="n">الوزن</th><th class="n">المجموع</th></tr></thead>
    <tbody>${d.items.map((x) => `<tr><td><b>${esc(x.item)}</b></td><td class="n">${qty(x.qty)}</td><td class="n">${qty(x.weight)}</td><td class="n">${money(x.amount)}</td></tr>`).join('')}</tbody></table></div>`
    : emptyState('مفيش بيع في العهدة دي', '')}</div>
  <div class="panel"><div class="ph"><h2>كل الفواتير</h2></div>${d.sales.length ? `<div class="tbl-wrap"><table class="t">
    <thead><tr><th>الوقت</th><th>فاتورة</th><th>الزبون</th><th>الأصناف</th><th>الدفع</th><th class="n">البضاعة</th><th class="n">الرهن</th><th class="n">الإجمالي</th><th class="n">اتقبض</th></tr></thead>
    <tbody>${d.sales.map((s) => `<tr class="click ${s.voided ? 'void' : ''}" data-sale="${s.id}"><td class="num muted">${s.time}</td><td class="num">${s.sale_no}</td>
      <td><b>${esc(s.customer)}</b></td>
      <td class="small">${s.lines.map((l) => `${esc(l.item)} ${l.unit === 'kg' ? qtyT(l.weight) + 'ك' : qtyT(l.qty) + ' ' + UNIT.count} × ${moneyT(l.price)}${l.crates ? ` + ${l.crates} ${esc(l.crate || 'صندوق')}` : ''}`).join('<br>')}</td>
      <td>${tag(s.payment_type, PAY[s.payment_type])}${s.voided ? ` <span class="vnote">${tag('void', 'اتحذفت')} <span class="small muted">${esc(s.voided_by_name || '')}${s.void_reason ? ': ' + esc(s.void_reason) : ''}</span></span>` : ''}</td>
      <td class="n">${money(s.goods)}</td><td class="n">${n(s.deposit) ? money(s.deposit) : ''}</td><td class="n"><b>${money(s.total)}</b></td><td class="n t-in">${money(s.paid)}</td></tr>`).join('')}</tbody></table></div>`
    : emptyState('مفيش فواتير', '')}</div>
  <div class="panel"><div class="ph"><h2>كل حركة الفلوس</h2></div>${d.movements.length ? `<div class="tbl-wrap"><table class="t">
    <thead><tr><th>الوقت</th><th>النوع</th><th>البيان</th><th class="n">دخل</th><th class="n">خرج</th><th>بواسطة</th></tr></thead>
    <tbody>${mvShown(d.movements).map((x) => `<tr class="${n(x.voided) ? 'void' : ''}"><td class="num muted">${x.time}</td><td>${CASH_CAT[x.category] || x.category}</td><td>${esc(x.description)}${voidTag(x)}</td>
      <td class="n t-in">${x.direction === 'in' ? money(x.amount) : ''}</td><td class="n t-out">${x.direction === 'out' ? money(x.amount) : ''}</td><td class="small muted">${esc(x.by || '')}</td></tr>`).join('')}</tbody></table></div>`
    : emptyState('مفيش حركة', '')}</div>
  ${d.change_log?.length ? `<div class="panel"><div class="ph"><h2>${icon('edit')} التعديلات والحذف في العهدة دي</h2><span class="muted small">المحذوف مش محسوب في الفلوس ولا البضاعة</span></div>
    <div class="tbl-wrap"><table class="t"><thead><tr><th>الوقت</th><th>إيه اللي حصل</th><th>السبب</th><th>بواسطة</th></tr></thead>
    <tbody>${d.change_log.map((c) => `<tr><td class="num muted">${timeT(c.at)}</td><td>${tag(c.action === 'void' ? 'void' : 'pending', c.action === 'void' ? 'حذف' : 'تعديل')} ${esc(c.summary)}</td>
      <td class="small">${esc(c.reason || '')}</td><td class="small muted">${esc(c.by || '')}</td></tr>`).join('')}</tbody></table></div></div>` : ''}`;
  el.querySelectorAll('[data-sale]').forEach((r) => r.onclick = () => app.go('#/sales/' + r.dataset.sale));
  el.querySelector('#pr').onclick = () => shiftDetailDoc(d);
  const rv = el.querySelector('#rv');
  if (rv) rv.onclick = async () => {
    const note = await promptBox('ملاحظة (اختياري)', { title: 'مراجعة العهدة', yes: 'تمت المراجعة', placeholder: 'مثلاً: الفلوس اتسلمت كاملة' });
    if (note === null) return;
    await busy(rv, async () => { await api.rpc('review_shift', { id: d.id, note }); ok('اتسجلت المراجعة'); app.go('#/shifts/' + d.id + '?r=' + Date.now()); });
  };
}
