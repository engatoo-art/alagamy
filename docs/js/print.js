import { esc, moneyT, qtyT, dateT, dateLong, UNIT, PAY, CASH_CAT, STATUS, n } from './ui.js';

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600;700&display=swap');
* { box-sizing: border-box; }
body { margin: 0; font-family: "IBM Plex Sans Arabic", Tahoma, sans-serif; color: #000; direction: rtl; font-variant-numeric: tabular-nums; }
.num { direction: ltr; unicode-bidi: isolate; display: inline-block; }
table { width: 100%; border-collapse: collapse; }
.c { text-align: center; } .l { text-align: left; }
.head { text-align: center; }
.head img { width: 52px; height: 52px; }
.head h1 { margin: 2px 0 0; font-size: 18px; }
.head p { margin: 0; font-size: 12px; }
.meta td { padding: 1px 0; font-size: 12px; }
.items th { font-size: 11.5px; border-bottom: 1px solid #000; padding: 3px 2px; text-align: right; }
.items td { font-size: 12px; padding: 3px 2px; border-bottom: 1px dashed #999; vertical-align: top; }
.tot td { padding: 2px 0; font-size: 13px; }
.tot .g td { font-size: 16px; font-weight: 700; border-top: 1.5px solid #000; padding-top: 4px; }
.foot { text-align: center; font-size: 11.5px; margin-top: 8px; border-top: 1px dashed #000; padding-top: 6px; }
.badge { display: inline-block; border: 1.5px solid #000; padding: 0 8px; font-weight: 700; border-radius: 4px; }
/* 80mm */
.r80 { width: 72mm; margin: 0 auto; padding: 2mm 0; }
/* A4 */
.a4 { padding: 12mm 12mm; font-size: 13px; }
.a4 .top { display: flex; align-items: center; gap: 14px; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 12px; }
.a4 .top img { width: 64px; height: 64px; }
.a4 .top h1 { margin: 0; font-size: 22px; }
.a4 .top .doc { margin-inline-start: auto; text-align: left; }
.a4 .top .doc b { font-size: 18px; display: block; }
.a4 h2 { font-size: 15px; margin: 14px 0 6px; }
.a4 .grid { display: grid; grid-template-columns: repeat(4, 1fr); border: 1px solid #000; }
.a4 .grid div { padding: 6px 8px; border-inline-start: 1px solid #000; }
.a4 .grid div:first-child { border-inline-start: 0; }
.a4 .grid small { display: block; font-size: 11px; }
.a4 .grid b { font-size: 15px; }
.a4 table.d th { background: #eee; border: 1px solid #000; padding: 5px 6px; font-size: 12px; text-align: right; }
.a4 table.d td { border: 1px solid #000; padding: 4px 6px; font-size: 12.5px; }
.a4 table.d tfoot td { font-weight: 700; background: #f3f3f3; }
.a4 .sign { display: flex; justify-content: space-between; margin-top: 40px; }
.a4 .sign div { width: 30%; text-align: center; border-top: 1px solid #000; padding-top: 4px; }
@page { margin: 0; }
`;

export function printDoc(inner, { size = '80mm', title = 'طباعة' } = {}) {
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;width:0;height:0;border:0;bottom:0;left:0';
  document.body.append(f);
  const page = size === 'A4' ? '@page { size: A4; margin: 0; }' : '@page { size: 80mm auto; margin: 0; }';
  const d = f.contentDocument;
  d.open();
  d.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(title)}</title>
    <style>${CSS}${page}</style></head><body>${inner}</body></html>`);
  d.close();
  const go = () => {
    if (window.__printPreview) { f.style.cssText = `position:fixed;top:0;left:0;right:auto;width:${size === 'A4' ? '210mm' : '80mm'};height:100%;background:#fff;z-index:999;border:0`; return; }
    f.contentWindow.focus();
    f.contentWindow.print();
    setTimeout(() => f.remove(), 60000);
  };
  const imgs = [...d.images].map((i) => i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; })).filter(Boolean);
  Promise.race([Promise.all([d.fonts?.ready, ...imgs]), new Promise((r) => setTimeout(r, 2500))]).then(go);
}

const logo = () => `<img src="${location.origin}${location.pathname.replace(/[^/]*$/, '')}img/logo.png" alt="">`;
const m = (v) => `<span class="num">${moneyT(v)}</span>`;
const q = (v) => `<span class="num">${qtyT(v)}</span>`;
const nowT = () => new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Cairo' });

function head80(s, docTitle) {
  return `<div class="head">${logo()}<h1>${esc(s.shop_name)}</h1>
    ${s.address ? `<p>${esc(s.address)}</p>` : ''}${s.phone ? `<p>ت: <span class="num">${esc(s.phone)}</span></p>` : ''}
    <p style="margin-top:4px"><span class="badge">${esc(docTitle)}</span></p></div>`;
}
function headA4(s, docTitle, docNo, docDate) {
  return `<div class="top">${logo()}<div><h1>${esc(s.shop_name)}</h1>
    <div>${esc(s.address || '')} ${s.phone ? ' — ت: <span class="num">' + esc(s.phone) + '</span>' : ''}</div></div>
    <div class="doc"><b>${esc(docTitle)}</b>${docNo ? `رقم <span class="num">${esc(docNo)}</span><br>` : ''}${docDate || ''}</div></div>`;
}
const foot80 = (s, by) => `<div class="foot">${esc(s.receipt_footer || '')}<br>${by ? 'المحاسب: ' + esc(by) + ' — ' : ''}<span class="num">${nowT()}</span></div>`;

function lineQty(l) {
  return l.unit === 'kg'
    ? `${q(l.weight)} ك${n(l.qty) ? ` <small>(${q(l.qty)} طرد)</small>` : ''}`
    : `${q(l.qty)} ${UNIT.count}`;
}

// ---------- فاتورة البيع ----------
export function saleDoc(d, size = '80mm') {
  const s = d.settings, sale = d.sale;
  const remaining = n(sale.grand_total) - n(sale.paid_amount);
  const status = sale.voided ? 'ملغية' : (sale.approval_status === 'pending' ? 'آجل — مستني موافقة المدير' : '');
  const totals = `
    <table class="tot">
      <tr><td>قيمة البضاعة</td><td class="l">${m(sale.goods_total)}</td></tr>
      ${n(sale.deposit_total) ? `<tr><td>رهن الصناديق</td><td class="l">${m(sale.deposit_total)}</td></tr>` : ''}
      ${n(sale.discount) ? `<tr><td>خصم</td><td class="l">${m(sale.discount)}</td></tr>` : ''}
      <tr class="g"><td>الإجمالي</td><td class="l">${m(sale.grand_total)}</td></tr>
      ${sale.payment_type === 'credit' ? `<tr><td>المدفوع</td><td class="l">${m(sale.paid_amount)}</td></tr>
        <tr><td><b>الباقي (آجل)</b></td><td class="l"><b>${m(remaining)}</b></td></tr>` : ''}
      ${d.balance != null && sale.payment_type === 'credit' ? `<tr><td>إجمالي الحساب بعد الفاتورة</td><td class="l"><b>${m(d.balance)}</b></td></tr>` : ''}
    </table>`;
  const crates = d.lines.filter((l) => l.crates > 0);
  if (size === 'A4') {
    const body = `<div class="a4">${headA4(s, 'فاتورة بيع', sale.sale_no, dateLong(sale.sale_date))}
      <table class="meta"><tr><td>الزبون: <b>${esc(d.customer_display)}</b>${d.customer?.phone ? ' — <span class="num">' + esc(d.customer.phone) + '</span>' : ''}</td>
      <td class="l">طريقة الدفع: <b>${PAY[sale.payment_type]}</b> ${status ? '— ' + status : ''}</td></tr></table>
      <table class="d" style="margin-top:10px"><thead><tr><th>#</th><th>الصنف</th><th>العدد</th><th>الوزن (ك)</th><th>السعر</th><th>القيمة</th><th>الصناديق</th><th>الرهن</th></tr></thead>
      <tbody>${d.lines.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.item)}${l.supplier ? ` <small>(${esc(l.supplier)})</small>` : ''}</td>
        <td>${q(l.qty)}</td><td>${l.unit === 'kg' ? q(l.weight) : '—'}</td><td>${m(l.price)} / ${l.unit === 'kg' ? 'ك' : 'وحدة'}</td>
        <td>${m(l.amount)}</td><td>${l.crates ? q(l.crates) + ' ' + esc(l.crate || '') : ''}</td><td>${n(l.deposit_amount) ? m(l.deposit_amount) : ''}</td></tr>`).join('')}</tbody></table>
      <div style="width:45%;margin-inline-start:auto;margin-top:10px">${totals}</div>
      ${sale.notes ? `<p>ملاحظات: ${esc(sale.notes)}</p>` : ''}
      <div class="sign"><div>المحاسب: ${esc(d.created_by_name || '')}</div><div>توقيع الزبون</div></div></div>`;
    return printDoc(body, { size, title: 'فاتورة ' + sale.sale_no });
  }
  const body = `<div class="r80">${head80(s, 'فاتورة بيع')}
    <table class="meta" style="margin-top:6px">
      <tr><td>رقم: <b class="num">${sale.sale_no}</b></td><td class="l">${dateT(sale.sale_date)}</td></tr>
      <tr><td colspan="2">الزبون: <b>${esc(d.customer_display)}</b></td></tr>
      <tr><td colspan="2">الدفع: <b>${PAY[sale.payment_type]}</b>${status ? ' — ' + status : ''}</td></tr>
    </table>
    <table class="items" style="margin-top:4px"><thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th class="l">القيمة</th></tr></thead>
    <tbody>${d.lines.map((l) => `<tr><td>${esc(l.item)}</td><td>${lineQty(l)}</td><td>${m(l.price)}</td><td class="l">${m(l.amount)}</td></tr>`).join('')}</tbody></table>
    ${crates.length ? `<div style="font-size:12px;margin-top:4px">الصناديق: ${crates.map((l) => `${q(l.crates)} ${esc(l.crate)}${n(l.deposit_unit) ? ' × ' + m(l.deposit_unit) : ''}`).join('، ')}</div>` : ''}
    <div style="margin-top:6px">${totals}</div>
    ${foot80(s, d.created_by_name)}</div>`;
  return printDoc(body, { size, title: 'فاتورة ' + sale.sale_no });
}

// ---------- إيصالات صغيرة ----------
export function paymentDoc(r, s) {
  printDoc(`<div class="r80">${head80(s, 'إيصال استلام نقدية')}
    <table class="meta" style="margin-top:8px">
      <tr><td>رقم الإيصال</td><td class="l num">${r.id}</td></tr>
      <tr><td>التاريخ</td><td class="l">${dateT(r.date)}</td></tr>
      <tr><td>استلمنا من</td><td class="l"><b>${esc(r.customer)}</b></td></tr>
    </table>
    <table class="tot" style="margin-top:6px"><tr class="g"><td>المبلغ</td><td class="l">${m(r.amount)}</td></tr>
    <tr><td>الباقي على الحساب</td><td class="l"><b>${m(r.balance)}</b></td></tr></table>
    ${r.notes ? `<p style="font-size:12px">${esc(r.notes)}</p>` : ''}${foot80(s, r.by)}</div>`, { title: 'إيصال' });
}

export function crateDoc(r, s) {
  printDoc(`<div class="r80">${head80(s, 'إيصال مرتجع صناديق')}
    <table class="meta" style="margin-top:8px">
      <tr><td>رقم</td><td class="l num">${r.id}</td></tr>
      <tr><td>التاريخ</td><td class="l">${dateT(r.date)}</td></tr>
      <tr><td>الزبون</td><td class="l"><b>${esc(r.customer)}</b></td></tr>
      <tr><td>الصناديق</td><td class="l">${q(r.count)} ${esc(r.crate)}</td></tr>
    </table>
    <table class="tot" style="margin-top:6px"><tr class="g"><td>قيمة الرهن</td><td class="l">${m(r.amount)}</td></tr>
    <tr><td colspan="2">${r.method === 'cash' ? 'اترد للزبون نقدي من العهدة' : 'اتخصم من حساب الزبون'}</td></tr>
    <tr><td>رصيد الحساب</td><td class="l"><b>${m(r.balance)}</b></td></tr></table>${foot80(s, r.by)}</div>`, { title: 'مرتجع صناديق' });
}

// ---------- كشف حساب زبون ----------
export function statementDoc(st, s) {
  const c = st.customer;
  printDoc(`<div class="a4">${headA4(s, 'كشف حساب', null, `من ${dateT(st.from)} إلى ${dateT(st.to)}`)}
    <div class="grid"><div><small>الزبون</small><b>${esc(c.name)}</b></div><div><small>التليفون</small><b class="num">${esc(c.phone || '—')}</b></div>
      <div><small>الرصيد السابق</small><b>${m(st.opening)}</b></div><div><small>الرصيد الحالي</small><b>${m(st.balance)}</b></div></div>
    ${st.crates.length ? `<p>صناديق عليه: ${st.crates.map((x) => `<b>${q(x.count)}</b> ${esc(x.name)}`).join('، ')}</p>` : ''}
    <table class="d" style="margin-top:10px"><thead><tr><th>التاريخ</th><th>البيان</th><th>التفاصيل</th><th>عليه</th><th>له</th><th>الرصيد</th></tr></thead>
    <tbody><tr><td></td><td colspan="4">رصيد سابق</td><td>${m(st.opening)}</td></tr>
    ${st.entries.map((e) => `<tr><td>${dateT(e.date)}</td><td>${esc(e.description)}${e.kind === 'sale' ? ' رقم <span class="num">' + e.ref_no + '</span>' : ''}</td>
      <td style="font-size:11.5px">${(e.lines || []).map((l) => `${esc(l.item)} ${l.unit === 'kg' ? q(l.weight) + 'ك' : q(l.qty) + ' عدد'} × ${m(l.price)}${l.crates ? ' + ' + q(l.crates) + ' صندوق' : ''}`).join('<br>')}${n(e.info) ? 'رد ' + m(e.info) + ' نقدي' : ''}</td>
      <td>${n(e.debit) ? m(e.debit) : ''}</td><td>${n(e.credit) ? m(e.credit) : ''}</td><td>${m(e.balance)}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td colspan="3">الإجمالي</td><td>${m(st.totals.debit)}</td><td>${m(st.totals.credit)}</td><td>${m(st.balance)}</td></tr></tfoot></table>
    <div class="sign"><div>المحاسب</div><div>المدير</div><div>توقيع الزبون</div></div></div>`, { size: 'A4', title: 'كشف حساب ' + c.name });
}

// ---------- تصفية مورد ----------
export function settlementDoc(st) {
  const s = st.settings; const lines = st.details?.lines || []; const items = st.details?.items || [];
  printDoc(`<div class="a4">${headA4(s, 'فاتورة تصفية مورد', st.settle_no, dateLong(st.created_at))}
    <div class="grid"><div><small>المورد</small><b>${esc(st.supplier.name)}</b></div>
      <div><small>النقلات</small><b>${st.shipments.map((x) => dateT(x.ship_date) + (x.truck ? ' (' + esc(x.truck) + ')' : '')).join('، ')}</b></div>
      <div><small>الحالة</small><b>${STATUS[st.status] || ''}</b></div><div><small>الوزن الكلي المباع</small><b>${q(st.total_weight)} ك</b></div></div>
    <h2>المبيعات حسب سعر البيع</h2>
    <table class="d"><thead><tr><th>الصنف</th><th>العدد</th><th>الوزن (ك)</th><th>السعر</th><th>القيمة</th></tr></thead>
    <tbody>${lines.map((l) => `<tr><td>${esc(l.item)}</td><td>${q(l.qty)}</td><td>${l.unit === 'kg' ? q(l.weight) : '—'}</td>
      <td>${m(l.price)} / ${l.unit === 'kg' ? 'ك' : 'وحدة'}</td><td>${m(l.amount)}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td>الإجمالي</td><td>${q(st.total_qty)}</td><td>${q(st.total_weight)}</td><td></td><td>${m(st.gross_sales)}</td></tr></tfoot></table>
    <h2>ملخص الأصناف</h2>
    <table class="d"><thead><tr><th>الصنف</th><th>الوارد</th><th>المباع</th><th>الباقي</th><th>الوزن</th><th>القيمة</th></tr></thead>
    <tbody>${items.map((l) => `<tr><td>${esc(l.item)}</td><td>${q(l.qty_in)}</td><td>${q(l.qty_sold)}</td><td>${q(l.remaining)}</td><td>${q(l.weight)}</td><td>${m(l.amount)}</td></tr>`).join('')}</tbody></table>
    <h2>الحساب</h2>
    <table class="d" style="width:55%"><tbody>
      <tr><td>إجمالي المبيعات</td><td>${m(st.gross_sales)}</td></tr>
      <tr><td>العمولة (${q(st.commission_pct)}%)</td><td>- ${m(st.commission_amount)}</td></tr>
      ${n(st.freight) ? `<tr><td>النولون</td><td>- ${m(st.freight)}</td></tr>` : ''}
      ${n(st.unloading) ? `<tr><td>العتالة</td><td>- ${m(st.unloading)}</td></tr>` : ''}
      ${n(st.other_expenses) ? `<tr><td>${esc(st.other_label || 'مصاريف أخرى')}</td><td>- ${m(st.other_expenses)}</td></tr>` : ''}
    </tbody><tfoot><tr><td>صافي المستحق للمورد</td><td>${m(st.net_amount)}</td></tr></tfoot></table>
    ${st.notes ? `<p>ملاحظات: ${esc(st.notes)}</p>` : ''}
    <div class="sign"><div>المحاسب: ${esc(st.created_by_name || '')}</div><div>اعتماد المدير: ${esc(st.decided_by_name || '')}</div><div>توقيع المورد بالاستلام</div></div></div>`,
  { size: 'A4', title: 'تصفية ' + st.settle_no });
}

// ---------- العهدة ----------
export function cashDoc(cd, s, size = 'A4') {
  const rows = cd.movements.map((x) => `<tr><td>${x.time || ''}</td><td>${CASH_CAT[x.category] || x.category}</td><td>${esc(x.description)}</td>
    <td>${x.direction === 'in' ? m(x.amount) : ''}</td><td>${x.direction === 'out' ? m(x.amount) : ''}</td></tr>`).join('');
  const period = cd.from === cd.to ? dateLong(cd.from) : `من ${dateT(cd.from)} إلى ${dateT(cd.to)}`;
  if (size === '80mm') {
    return printDoc(`<div class="r80">${head80(s, 'تقرير العهدة')}<p class="c" style="font-size:12px">${period}</p>
      <table class="tot"><tr><td>رصيد أول المدة</td><td class="l">${m(cd.opening)}</td></tr>
      <tr><td>الوارد</td><td class="l">${m(cd.total_in)}</td></tr><tr><td>المنصرف</td><td class="l">${m(cd.total_out)}</td></tr>
      <tr class="g"><td>الرصيد</td><td class="l">${m(cd.closing)}</td></tr></table>
      <table class="items" style="margin-top:6px"><tbody>${cd.by_category.map((c) => `<tr><td>${c.direction === 'in' ? 'وارد' : 'منصرف'}: ${CASH_CAT[c.category] || c.category}</td><td class="l">${m(c.total)}</td></tr>`).join('')}</tbody></table>
      ${foot80(s)}</div>`);
  }
  printDoc(`<div class="a4">${headA4(s, 'تقرير العهدة', null, period)}
    <div class="grid"><div><small>رصيد أول المدة</small><b>${m(cd.opening)}</b></div><div><small>الوارد</small><b>${m(cd.total_in)}</b></div>
      <div><small>المنصرف</small><b>${m(cd.total_out)}</b></div><div><small>الرصيد آخر المدة</small><b>${m(cd.closing)}</b></div></div>
    <table class="d" style="margin-top:12px"><thead><tr><th>الوقت</th><th>النوع</th><th>البيان</th><th>وارد</th><th>منصرف</th></tr></thead>
    <tbody>${rows}</tbody><tfoot><tr><td colspan="3">الإجمالي</td><td>${m(cd.total_in)}</td><td>${m(cd.total_out)}</td></tr></tfoot></table>
    <div class="sign"><div>المحاسب</div><div>المدير</div><div></div></div></div>`, { size: 'A4', title: 'العهدة' });
}

// ---------- تقرير عهدة محاسب ----------
export function shiftDoc(r, size = '80mm') {
  const s = r.settings; const closed = r.status === 'closed';
  const tin = closed ? r.total_in : r.live_in, tout = closed ? r.total_out : r.live_out;
  const exp = closed ? r.expected_amount : n(r.opening_amount) + n(tin) - n(tout);
  const d = n(r.difference);
  const when = (ts) => ts ? new Date(ts).toLocaleString('en-GB', { timeZone: 'Africa/Cairo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
  const summary = `<table class="tot">
      <tr><td>رصيد أول العهدة</td><td class="l">${m(r.opening_amount)}</td></tr>
      <tr><td>دخل</td><td class="l">${m(tin)}</td></tr>
      <tr><td>خرج</td><td class="l">${m(tout)}</td></tr>
      <tr class="g"><td>المفروض يكون في الدرج</td><td class="l">${m(exp)}</td></tr>
      ${closed ? `<tr><td>الفعلي</td><td class="l"><b>${m(r.counted_amount)}</b></td></tr>
      <tr><td>${d < 0 ? 'عجز' : d > 0 ? 'زيادة' : 'الفرق'}</td><td class="l"><b>${d ? m(Math.abs(d)) : 'مظبوطة'}</b></td></tr>` : ''}
    </table>`;
  const cats = r.by_category.filter((c) => !['shift_short', 'shift_over'].includes(c.category));
  if (size === '80mm') {
    return printDoc(`<div class="r80">${head80(s, 'تقرير عهدة')}
      <table class="meta" style="margin-top:6px"><tr><td>المحاسب: <b>${esc(r.user_name)}</b></td><td class="l">رقم <span class="num">${r.id}</span></td></tr>
      <tr><td>من: ${when(r.opened_at)}</td><td class="l">إلى: ${closed ? when(r.closed_at) : 'لسه مفتوحة'}</td></tr></table>
      <div style="margin-top:6px">${summary}</div>
      <table class="items" style="margin-top:6px"><tbody>${cats.map((c) => `<tr><td>${c.direction === 'in' ? 'دخل' : 'خرج'}: ${CASH_CAT[c.category] || c.category} (${c.count})</td><td class="l">${m(c.total)}</td></tr>`).join('')}</tbody></table>
      ${r.notes ? `<p style="font-size:12px">${esc(r.notes)}</p>` : ''}
      <div class="foot">توقيع المحاسب: ..................<br>توقيع المستلم: ..................</div></div>`, { title: 'عهدة ' + r.id });
  }
  printDoc(`<div class="a4">${headA4(s, 'تقرير عهدة', r.id, esc(r.user_name))}
    <table class="meta"><tr><td>فتحها: ${when(r.opened_at)}</td><td class="l">قفلها: ${closed ? when(r.closed_at) + ' — ' + esc(r.closed_by_name || '') : 'لسه مفتوحة'}</td></tr></table>
    <div style="width:55%;margin:10px 0">${summary}</div>
    <table class="d"><thead><tr><th>الوقت</th><th>النوع</th><th>البيان</th><th>دخل</th><th>خرج</th></tr></thead>
    <tbody>${r.movements.map((x) => `<tr><td>${x.time}</td><td>${CASH_CAT[x.category] || x.category}</td><td>${esc(x.description)}</td>
      <td>${x.direction === 'in' ? m(x.amount) : ''}</td><td>${x.direction === 'out' ? m(x.amount) : ''}</td></tr>`).join('')}</tbody></table>
    ${r.notes ? `<p>ملاحظات: ${esc(r.notes)}</p>` : ''}
    <div class="sign"><div>المحاسب: ${esc(r.user_name)}</div><div>المستلم</div><div>المدير</div></div></div>`, { size: 'A4', title: 'عهدة ' + r.id });
}

// ---------- التقارير ----------
export function reportDoc(r, s, title) {
  const sl = r.sales;
  printDoc(`<div class="a4">${headA4(s, title, null, r.from === r.to ? dateLong(r.from) : `من ${dateT(r.from)} إلى ${dateT(r.to)}`)}
    <div class="grid"><div><small>إجمالي المبيعات</small><b>${m(sl.total)}</b></div><div><small>نقدي</small><b>${m(sl.cash)}</b></div>
      <div><small>آجل</small><b>${m(sl.credit)}</b></div><div><small>عدد الفواتير</small><b>${q(sl.count)}</b></div></div>
    <div class="grid" style="margin-top:8px"><div><small>تحصيلات</small><b>${m(r.collections)}</b></div><div><small>عمولتك</small><b>${m(r.commission.commission)}</b></div>
      <div><small>اتصرف للموردين</small><b>${m(r.supplier_paid)}</b></div><div><small>رصيد العهدة</small><b>${m(r.cash.closing)}</b></div></div>
    <h2>الأصناف المباعة</h2>
    <table class="d"><thead><tr><th>الصنف</th><th>العدد</th><th>الوزن (ك)</th><th>القيمة</th></tr></thead>
    <tbody>${r.items.map((x) => `<tr><td>${esc(x.item)}</td><td>${q(x.qty)}</td><td>${q(x.weight)}</td><td>${m(x.amount)}</td></tr>`).join('')}</tbody></table>
    <h2>حركة العهدة</h2>
    <table class="d"><thead><tr><th>النوع</th><th>وارد</th><th>منصرف</th></tr></thead>
    <tbody>${r.cash.by_category.map((c) => `<tr><td>${CASH_CAT[c.category] || c.category}</td><td>${c.direction === 'in' ? m(c.total) : ''}</td><td>${c.direction === 'out' ? m(c.total) : ''}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td>الإجمالي</td><td>${m(r.cash.total_in)}</td><td>${m(r.cash.total_out)}</td></tr></tfoot></table>
    ${r.days.length > 1 ? `<h2>حسب اليوم</h2><table class="d"><thead><tr><th>اليوم</th><th>المبيعات</th><th>وارد العهدة</th><th>منصرف العهدة</th><th>رصيد آخر اليوم</th></tr></thead>
    <tbody>${r.days.map((x) => `<tr><td>${dateT(x.date)}</td><td>${m(x.sales)}</td><td>${m(x.cash_in)}</td><td>${m(x.cash_out)}</td><td>${m(x.closing)}</td></tr>`).join('')}</tbody></table>` : ''}
    <div class="sign"><div>المحاسب</div><div>المدير</div><div></div></div></div>`, { size: 'A4', title });
}

export function debtsDoc(list, s) {
  const total = list.reduce((a, x) => a + n(x.balance), 0);
  printDoc(`<div class="a4">${headA4(s, 'كشف المديونيات والصناديق', null, dateLong(new Date().toISOString()))}
    <table class="d"><thead><tr><th>الزبون</th><th>التليفون</th><th>الرصيد</th><th>صناديق عليه</th><th>آخر دفعة</th></tr></thead>
    <tbody>${list.map((x) => `<tr><td>${esc(x.name)}</td><td class="num">${esc(x.phone || '')}</td><td>${m(x.balance)}</td>
      <td>${x.crates.map((c) => q(c.count) + ' ' + esc(c.name)).join('، ')}</td><td>${dateT(x.last_payment)}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td colspan="2">الإجمالي</td><td>${m(total)}</td><td colspan="2"></td></tr></tfoot></table></div>`, { size: 'A4', title: 'المديونيات' });
}
