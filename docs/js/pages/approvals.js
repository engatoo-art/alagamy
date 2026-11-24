import { api } from '../api.js';
import { esc, money, moneyT, icon, ok, err, busy, modal, date, emptyState, promptBox } from '../ui.js';

export async function render({ app, el }) {
  const draw = async () => {
    const p = await api.rpc('pending_approvals');
    const total = p.sales.length + p.settlements.length + p.customers.length + p.users.length;
    app.setPending(total);
    el.innerHTML = `
    <div class="page-head"><h1>الموافقات</h1><div class="sub">${total ? `${total} طلب مستني قرارك` : 'مفيش حاجة مستنياك دلوقتي'}</div></div>

    ${p.users.length ? `<div class="panel"><div class="ph"><h2>حسابات جديدة مستنية تفعيل</h2><a class="btn sm" href="#/settings?tab=users">إدارة المستخدمين</a></div>
      <div class="tbl-wrap"><table class="t"><tbody>${p.users.map((u) => `<tr><td><b>${esc(u.full_name || u.username)}</b> <span class="muted num">${esc(u.username)}</span></td>
      <td><a class="btn sm primary" href="#/settings?tab=users&user=${u.id}">تفعيل وتحديد الصلاحيات</a></td></tr>`).join('')}</tbody></table></div></div>` : ''}

    <div class="panel"><div class="ph"><h2>فواتير آجل</h2></div>${p.sales.length ? `<div class="tbl-wrap"><table class="t">
      <thead><tr><th>فاتورة</th><th>الزبون</th><th class="n">الفاتورة</th><th class="n">الباقي آجل</th><th class="n">رصيده كله</th><th>حد الآجل</th><th>المحاسب</th><th></th></tr></thead>
      <tbody>${p.sales.map((s) => `<tr><td><a href="#/sales/${s.id}" class="num">${s.sale_no}</a> <span class="muted small">${date(s.date)}</span></td>
        <td><a href="#/customers/${s.customer_id}">${esc(s.customer)}</a></td><td class="n">${money(s.grand_total)}</td>
        <td class="n t-out">${money(s.remaining)}</td><td class="n"><b>${money(s.balance)}</b></td>
        <td class="small">${s.credit_approved ? (s.credit_limit > 0 ? moneyT(s.credit_limit) : 'من غير حد') : 'مش مسموح له'}</td><td class="small muted">${esc(s.by)}</td>
        <td class="row" style="flex-wrap:nowrap"><button class="btn sm primary" data-sale="${s.id}" data-ok="1">موافقة</button><button class="btn sm danger" data-sale="${s.id}" data-ok="0">رفض وإلغاء</button></td></tr>`).join('')}</tbody></table></div>`
      : emptyState('مفيش فواتير آجل مستنية', '')}</div>

    <div class="panel"><div class="ph"><h2>تصفيات الموردين قبل الصرف</h2></div>${p.settlements.length ? `<div class="tbl-wrap"><table class="t">
      <thead><tr><th>رقم</th><th>المورد</th><th class="n">المبيعات</th><th class="n">العمولة</th><th class="n">المصاريف</th><th class="n">الصافي</th><th></th></tr></thead>
      <tbody>${p.settlements.map((s) => `<tr><td><a class="num" href="#/settlements/${s.id}">${s.settle_no}</a></td><td>${esc(s.supplier)}</td>
        <td class="n">${money(s.gross_sales)}</td><td class="n t-in">${money(s.commission_amount)}</td><td class="n">${money(s.expenses)}</td>
        <td class="n"><b>${money(s.net_amount)}</b></td><td><a class="btn sm primary" href="#/settlements/${s.id}">راجع ووافق</a></td></tr>`).join('')}</tbody></table></div>`
      : emptyState('مفيش تصفيات مستنية', '')}</div>

    <div class="panel"><div class="ph"><h2>طلبات السماح بالآجل</h2></div>${p.customers.length ? `<div class="tbl-wrap"><table class="t">
      <tbody>${p.customers.map((c) => `<tr><td><a href="#/customers/${c.id}"><b>${esc(c.name)}</b></a> <span class="muted num">${esc(c.phone)}</span></td>
        <td class="n">رصيده ${money(c.balance)}</td>
        <td class="row" style="flex-wrap:nowrap"><button class="btn sm primary" data-cust="${c.id}" data-name="${esc(c.name)}">موافقة</button><button class="btn sm danger" data-custno="${c.id}">رفض</button></td></tr>`).join('')}</tbody></table></div>`
      : emptyState('مفيش طلبات', '')}</div>`;

    el.querySelectorAll('[data-sale]').forEach((b) => b.onclick = async () => {
      const yes = b.dataset.ok === '1';
      let reason = '';
      if (!yes) { reason = await promptBox('سبب الرفض (الفاتورة هتتلغي)', { title: 'رفض الآجل', yes: 'رفض وإلغاء', danger: true }); if (reason === null) return; }
      await busy(b, async () => { await api.rpc('decide_sale', { id: +b.dataset.sale, approve: yes, reason }); ok(yes ? 'اتوافق على الفاتورة' : 'الفاتورة اترفضت واتلغت'); await draw(); });
    });
    el.querySelectorAll('[data-cust]').forEach((b) => b.onclick = () => {
      const m = modal({
        title: 'السماح بالآجل — ' + b.dataset.name,
        body: `<label class="f">أقصى مبلغ ممكن يبقى عليه (0 = من غير حد)<input class="in big" id="lim" type="number" min="0" value="0"></label>`,
        actions: '<button class="btn primary" data-ok>موافقة</button><button class="btn" data-close>رجوع</button>',
      });
      m.$('[data-ok]').onclick = () => busy(m.$('[data-ok]'), async () => {
        await api.rpc('decide_customer_credit', { id: +b.dataset.cust, approve: true, credit_limit: m.$('#lim').value });
        ok('اتسمح للزبون بالآجل'); m.close(); await draw();
      });
    });
    el.querySelectorAll('[data-custno]').forEach((b) => b.onclick = () => busy(b, async () => {
      await api.rpc('decide_customer_credit', { id: +b.dataset.custno, approve: false }); ok('اترفض الطلب'); await draw();
    }));
  };
  await draw();
}
