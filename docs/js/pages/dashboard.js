import { api } from '../api.js';
import { esc, money, icon, dateLong, n, tag, PAY, emptyState, dateT } from '../ui.js';

export async function render({ app, el }) {
  const [d, cs] = await Promise.all([api.rpc('dashboard'), api.rpc('current_shift')]);
  app.setPending(d.pending);
  const max = Math.max(1, ...d.week.map((w) => n(w.total)));
  const lastBackup = localStorage.getItem('last_backup');
  const needBackup = app.can('backup') && (!lastBackup || (Date.now() - Number(lastBackup)) > 7 * 864e5);

  el.innerHTML = `
  <div class="page-head">
    <h1>${new Date().getHours() < 12 ? 'صباح الخير' : 'مساء الخير'}، ${esc((app.me.full_name || app.me.username).split(' ')[0])}</h1>
    ${app.can('sales') ? `<a class="btn primary lg" href="#/sale">${icon('plus')} بيع جديد</a>` : ''}
    <div class="sub">${dateLong(d.today)}</div>
  </div>

  ${cs.shift ? (cs.mine ? `<div class="alert info" style="margin-bottom:14px">عهدتك مفتوحة — المفروض في الدرج دلوقتي <b>${money(n(cs.shift.opening_amount) + n(cs.shift.live_in) - n(cs.shift.live_out))}</b>. <a href="#/cash">العهدة</a></div>`
      : `<div class="alert info" style="margin-bottom:14px">العهدة مفتوحة باسم <b>${esc(cs.shift.user_name)}</b>. <a href="#/cash">العهدة</a></div>`)
    : `<div class="alert warn" style="margin-bottom:14px">مفيش عهدة مفتوحة. أي محاسب هيبيع نقدي أو يحصّل لازم يفتح عهدته الأول. <a href="#/cash">افتح العهدة</a></div>`}
  ${d.pending ? `<div class="alert warn" style="margin-bottom:14px">فيه <b>${d.pending}</b> طلب مستني موافقتك. <a href="#/approvals">افتح الموافقات</a></div>` : ''}
  ${needBackup ? `<div class="alert info" style="margin-bottom:14px">بقالك أكتر من أسبوع من غير نسخة احتياطية Excel. <a href="#/settings?tab=backup">نزّل نسخة دلوقتي</a></div>` : ''}

  <div class="ledger-strip">
    <div><div class="k">مبيعات النهارده</div><div class="v">${money(d.sales_total)}</div><div class="h">${d.sales_count} فاتورة</div></div>
    <div><div class="k">نقدي</div><div class="v pos">${money(d.cash_sales)}</div><div class="h">آجل: ${money(d.credit_sales)}</div></div>
    <div><div class="k">تحصيلات النهارده</div><div class="v pos">${money(d.collections)}</div><div class="h">من حسابات الزباين</div></div>
    <div><div class="k">رصيد العهدة دلوقتي</div><div class="v">${d.cash_balance == null ? '—' : money(d.cash_balance)}</div>
      <div class="h">وارد ${money(d.cash_in)}، منصرف ${money(d.cash_out)}</div></div>
  </div>

  <div class="grid g2" style="margin-top:18px">
    <div class="panel"><div class="ph"><h2>آخر الفواتير</h2><a class="btn sm ghost" href="#/sales">كل الفواتير</a></div>
      ${d.recent.length ? `<div class="tbl-wrap"><table class="t"><tbody>${d.recent.map((s) => `
        <tr class="click" data-go="#/sales/${s.id}"><td class="num muted">${s.sale_no}</td><td>${esc(s.customer)}</td>
        <td>${tag(s.payment_type, PAY[s.payment_type])} ${s.approval_status === 'pending' ? tag('pending', 'مستني موافقة') : ''}</td>
        <td class="n">${money(s.grand_total)}</td><td class="muted small">${s.time}</td></tr>`).join('')}</tbody></table></div>`
        : emptyState('لسه مفيش فواتير النهارده', app.can('sales') ? 'ابدأ من زرار بيع جديد' : '')}
    </div>
    <div class="panel"><div class="ph"><h2>مبيعات آخر 7 أيام</h2></div><div class="pb">
      <div class="bars">${d.week.map((w, i) => `<div class="b ${i === 6 ? 'today' : ''}" title="${dateT(w.date)}: ${n(w.total).toLocaleString('en-US')}">
        <i style="height:${Math.round((n(w.total) / max) * 100)}%"></i><span>${i === 6 ? 'النهارده' : dateT(w.date).slice(0, 5)}</span></div>`).join('')}</div>
    </div></div>
  </div>

  <div class="ledger-strip" style="margin-top:18px">
    <div><div class="k">فلوس برة عند الزباين</div><div class="v neg">${money(d.total_debts)}</div><div class="h"><a href="#/debts">${d.debtors} زبون عليه فلوس</a></div></div>
    <div><div class="k">صناديق برة</div><div class="v">${money(d.crates_out)}</div><div class="h"><a href="#/crates">مين عليه صناديق</a></div></div>
    <div><div class="k">نقلات لسه بتتباع</div><div class="v">${d.open_shipments}</div><div class="h"><a href="#/shipments">النقلات</a></div></div>
    <div><div class="k">مستحق للموردين</div><div class="v wait">${money(d.to_pay)}</div><div class="h"><a href="#/settlements">تصفيات متوافق عليها</a></div></div>
  </div>`;

  el.querySelectorAll('[data-go]').forEach((r) => r.onclick = () => app.go(r.dataset.go));
}
