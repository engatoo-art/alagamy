import { api } from '../api.js';
import {
  esc, money, moneyT, n, icon, ok, err, busy, modal, formData, todayISO, addDays, dateLong, emptyState, CASH_CAT,
  confirmBox, date, tag, monthRange, toast,
} from '../ui.js';
import { cashDoc, shiftDoc } from '../print.js';

const IN_CATS = ['funding', 'other_in'];
const OUT_CATS = ['transport', 'bill', 'salary', 'withdrawal', 'other_out'];
const timeT = (ts) => ts ? new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Cairo' }) : '';
const dayT = (ts) => ts ? new Date(ts).toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' }) : '';
const expected = (s) => n(s.opening_amount) + n(s.live_in) - n(s.live_out);

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
    await api.rpc('add_cash', { ...formData(m.$('#cf')), direction: dir });
    ok('اتسجل على العهدة');
    m.close(); after();
  });
  m.$('[data-ok]').onclick = go;
  m.$('#cf').onsubmit = (e) => { e.preventDefault(); go(); };
}

function closeModal(app, s, after) {
  const exp = expected(s);
  const m = modal({
    title: 'قفل عهدة ' + s.user_name,
    body: `<div class="ledger-strip" style="grid-template-columns:repeat(2,1fr);margin-bottom:14px">
        <div><div class="k">رصيد أول العهدة</div><div class="v">${money(s.opening_amount)}</div></div>
        <div><div class="k">المفروض يكون معاك</div><div class="v">${money(exp)}</div><div class="h">دخل ${moneyT(s.live_in)}، خرج ${moneyT(s.live_out)}</div></div>
      </div>
      <form class="grid" id="sf">
        <label class="f">عدّ الفلوس اللي في الدرج واكتب المبلغ الفعلي<input class="in big" name="counted" type="number" min="0" step="0.01" value="${exp}"></label>
        <div id="diff" class="alert info">مفيش عجز ولا زيادة</div>
        <label class="f">ملاحظات<input class="in" name="notes" placeholder="مثلاً: سلّمت العهدة لمنى"></label>
        <label class="check"><input type="checkbox" name="print" checked> اطبع تقرير العهدة</label>
      </form>`,
    actions: `<button class="btn primary" data-ok>${icon('check')} قفل العهدة</button><button class="btn" data-close>رجوع</button>`,
  });
  const inp = m.$('[name=counted]');
  const upd = () => {
    const d = Math.round((n(inp.value) - exp) * 100) / 100;
    const box = m.$('#diff');
    box.className = 'alert ' + (d < 0 ? 'err' : d > 0 ? 'warn' : 'info');
    box.innerHTML = d < 0 ? `عجز <b>${moneyT(-d)}</b>` : d > 0 ? `زيادة <b>${moneyT(d)}</b>` : 'مفيش عجز ولا زيادة';
  };
  inp.oninput = upd; upd();
  m.$('[data-ok]').onclick = () => busy(m.$('[data-ok]'), async () => {
    const v = formData(m.$('#sf'));
    const r = await api.rpc('close_shift', { counted: v.counted, notes: v.notes });
    ok(`العهدة اتقفلت بـ ${moneyT(r.counted_amount)}` + (n(r.difference) ? ` — ${n(r.difference) < 0 ? 'عجز' : 'زيادة'} ${moneyT(Math.abs(n(r.difference)))}` : ''));
    if (v.print) shiftDoc(r, '80mm');
    m.close(); after();
  });
}

// ======================= الصفحة =======================
export async function render({ app, el, query }) {
  const canDay = app.can('cash') || app.can('reports');
  let tab = query.tab || 'shift';
  let day = query.date || todayISO();
  if (query.date) tab = 'day';

  el.innerHTML = `<div class="page-head"><h1>العهدة</h1>
      <div class="sub">كل محاسب بيفتح عهدته أول ما يبدأ، وأي فلوس داخلة أو خارجة بتتسجل عليها لوحدها. في الآخر بيقفلها، واللي بعده بيبدأ بنفس الفلوس.</div></div>
    <div class="tabs" id="tabs"><button data-t="shift">العهدة الحالية</button>${canDay ? '<button data-t="day">حركة اليوم</button>' : ''}<button data-t="history">سجل العهد</button></div>
    <div id="body"></div>`;
  const body = el.querySelector('#body');
  const show = () => {
    el.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
    body.innerHTML = '<div class="empty">جاري التحميل…</div>';
    return ({ shift: drawShift, day: drawDay, history: drawHistory })[tab]().catch(err);
  };
  el.querySelector('#tabs').onclick = (e) => { const b = e.target.closest('button'); if (b) { tab = b.dataset.t; show(); } };

  // ---------- العهدة الحالية ----------
  async function drawShift() {
    const c = await api.rpc('current_shift');
    const s = c.shift;
    if (!s) {
      const last = c.last;
      body.innerHTML = `<div class="account">
          <div class="stamp"><div>مفيش<b>عهدة</b></div></div>
          <div><h1>مفيش عهدة مفتوحة دلوقتي</h1>
            <div class="meta">${last ? `آخر عهدة كانت مع <b>${esc(last.user_name)}</b> واتقفلت ${date(dayT(last.closed_at))} الساعة ${timeT(last.closed_at)} بـ ${moneyT(last.counted_amount)}` : 'دي أول عهدة في البرنامج'}</div></div>
          <div class="bal"><div class="k">هتبدأ عهدتك بـ</div><div class="v">${money(c.cash_balance)} <small>ج</small></div></div>
        </div>
        <div class="row" style="margin-top:14px"><button class="btn primary lg" id="open">${icon('wallet')} افتح عهدتي</button>
          <span class="muted">عدّ الفلوس اللي في الدرج الأول، واتأكد إنها ${moneyT(c.cash_balance)}.</span></div>`;
      if (query.out) { query.out = null; setTimeout(() => toast('لازم تفتح عهدتك الأول علشان تسجّل مصروف'), 50); }
      body.querySelector('#open').onclick = async (e) => {
        if (!await confirmBox(`هتستلم الدرج بـ <b>${moneyT(c.cash_balance)}</b>. الفلوس دي هتبقى على مسؤوليتك لحد ما تقفل العهدة.`, { title: 'فتح العهدة', yes: 'استلمت، افتح العهدة' })) return;
        await busy(e.target, async () => { await api.rpc('open_shift'); ok('عهدتك اتفتحت'); await drawShift(); });
      };
      return;
    }
    const canClose = c.mine || app.can('approve');
    const old = dayT(s.opened_at) < todayISO();
    const rep = await api.rpc('shift_report', { id: s.id }).catch(() => null);
    body.innerHTML = `
      ${old ? `<div class="alert warn" style="margin-bottom:14px">العهدة دي مفتوحة من ${dateLong(dayT(s.opened_at))}. المفروض تتقفل آخر كل يوم.</div>` : ''}
      ${!c.mine ? `<div class="alert ${app.can('approve') ? 'info' : 'warn'}" style="margin-bottom:14px">العهدة المفتوحة باسم <b>${esc(s.user_name)}</b>.${app.can('approve') ? ' انت مدير، فتقدر تقفلها.' : ' لازم يقفلها الأول علشان تفتح عهدتك.'}</div>` : ''}
      <div class="account">
        <div class="stamp"><div>عهدة<b class="num">${s.id}</b></div></div>
        <div><h1>${esc(s.user_name)}</h1><div class="meta">مفتوحة من ${date(dayT(s.opened_at))} الساعة ${timeT(s.opened_at)} — ${s.count} حركة</div></div>
        <div class="bal"><div class="k">المفروض يكون في الدرج</div><div class="v">${money(expected(s))} <small>ج</small></div></div>
      </div>
      <div class="ledger-strip" style="margin-top:14px;grid-template-columns:repeat(3,1fr)">
        <div><div class="k">رصيد أول العهدة</div><div class="v">${money(s.opening_amount)}</div><div class="h">اتسلّم من العهدة اللي قبلها</div></div>
        <div><div class="k">دخل</div><div class="v pos">${money(s.live_in)}</div></div>
        <div><div class="k">خرج</div><div class="v neg">${money(s.live_out)}</div></div>
      </div>
      <div class="row" style="margin:14px 0">
        ${canClose ? `<button class="btn primary" id="close">${icon('check')} قفل العهدة</button>` : ''}
        ${app.can('cash') && c.mine ? `<button class="btn" data-d="in">${icon('plus')} وارد للدرج</button><button class="btn warn" data-d="out">${icon('wallet')} مصروف</button>` : ''}
        ${rep ? `<button class="btn" id="pr">${icon('print')} طباعة</button>` : ''}
      </div>
      ${rep ? movementsPanel(rep.movements, 'حركة العهدة') : ''}`;
    const cl = body.querySelector('#close');
    if (cl) cl.onclick = () => closeModal(app, s, () => drawShift().catch(err));
    body.querySelectorAll('[data-d]').forEach((b) => b.onclick = () => cashModal(b.dataset.d, () => drawShift().catch(err)));
    const pr = body.querySelector('#pr');
    if (pr) pr.onclick = () => shiftDoc(rep, 'A4');
    if (query.out && app.can('cash') && c.mine) { query.out = null; cashModal('out', () => drawShift().catch(err)); }
    bindGo();
  }

  // ---------- حركة اليوم كله ----------
  async function drawDay() {
    const cd = await api.rpc('cash_day', { date: day });
    const ins = cd.by_category.filter((c) => c.direction === 'in');
    const outs = cd.by_category.filter((c) => c.direction === 'out');
    const sum = (list, cls) => list.length ? list.map((c) => `<div class="totals"><div class="line"><span>${CASH_CAT[c.category] || c.category} <span class="muted small">(${c.count})</span></span><b class="${cls}">${money(c.total)}</b></div></div>`).join('') : '<span class="muted">مفيش</span>';
    body.innerHTML = `
      <div class="row" style="margin-bottom:14px">
        <button class="btn sm" data-nav="-1">اليوم اللي قبله</button>
        <input class="in" type="date" id="day" value="${day}" style="width:auto">
        <button class="btn sm" data-nav="1" ${day >= todayISO() ? 'disabled' : ''}>اليوم اللي بعده</button>
        <b style="margin-inline-start:8px">${dateLong(day)}</b><span class="spacer"></span>
        <button class="btn" data-p="A4">${icon('print')} طباعة</button><button class="btn" data-p="80mm">إيصال</button>
      </div>
      <div class="ledger-strip">
        <div><div class="k">رصيد أول اليوم</div><div class="v">${money(cd.opening)}</div></div>
        <div><div class="k">الوارد</div><div class="v pos">${money(cd.total_in)}</div></div>
        <div><div class="k">المنصرف</div><div class="v neg">${money(cd.total_out)}</div></div>
        <div><div class="k">الرصيد آخر اليوم</div><div class="v">${money(cd.closing)}</div></div>
      </div>
      <div class="grid g2" style="margin-top:18px">
        <div class="panel" style="margin:0"><div class="ph"><h2>الوارد</h2></div><div class="pb">${sum(ins, 't-in')}</div></div>
        <div class="panel" style="margin:0"><div class="ph"><h2>المنصرف</h2></div><div class="pb">${sum(outs, 't-out')}</div></div>
      </div>
      ${movementsPanel(cd.movements, 'كل حركات اليوم', cd)}`;
    body.querySelectorAll('[data-p]').forEach((b) => b.onclick = () => cashDoc(cd, app.settings, b.dataset.p));
    body.querySelectorAll('[data-nav]').forEach((b) => b.onclick = () => { day = addDays(day, +b.dataset.nav); drawDay().catch(err); });
    body.querySelector('#day').onchange = (e) => { day = e.target.value || todayISO(); drawDay().catch(err); };
    bindGo();
  }

  // ---------- سجل العهد ----------
  async function drawHistory() {
    const [from] = monthRange(todayISO(), -1);
    const rows = await api.rpc('list_shifts', { from });
    body.innerHTML = `<div class="panel">${rows.length ? `<div class="tbl-wrap"><table class="t">
      <thead><tr><th>رقم</th><th>المحاسب</th><th>فتحها</th><th>قفلها</th><th class="n">أول العهدة</th><th class="n">دخل</th><th class="n">خرج</th>
        <th class="n">المفروض</th><th class="n">الفعلي</th><th class="n">عجز / زيادة</th></tr></thead>
      <tbody>${rows.map((s) => {
        const closed = s.status === 'closed';
        const exp = closed ? n(s.expected_amount) : expected(s);
        const d = n(s.difference);
        return `<tr class="click" data-shift="${s.id}"><td class="num">${s.id}</td><td><b>${esc(s.user_name)}</b></td>
          <td class="small">${date(dayT(s.opened_at))} ${timeT(s.opened_at)}</td>
          <td class="small">${closed ? date(dayT(s.closed_at)) + ' ' + timeT(s.closed_at) : tag('pending', 'مفتوحة')}</td>
          <td class="n">${money(s.opening_amount)}</td><td class="n t-in">${money(closed ? s.total_in : s.live_in)}</td>
          <td class="n t-out">${money(closed ? s.total_out : s.live_out)}</td><td class="n">${money(exp)}</td>
          <td class="n"><b>${closed ? money(s.counted_amount) : '—'}</b></td>
          <td class="n ${d < 0 ? 't-out' : d > 0 ? 't-in' : 'muted'}">${closed ? (d ? (d < 0 ? 'عجز ' : 'زيادة ') + moneyT(Math.abs(d)) : 'مظبوطة') : ''}</td></tr>`;
      }).join('')}</tbody></table></div>` : emptyState('لسه مفيش عهد', 'أول عهدة بتتفتح من تبويب العهدة الحالية')}</div>
      <p class="muted small">اضغط على أي عهدة علشان تطبع تقريرها.</p>`;
    body.querySelectorAll('[data-shift]').forEach((r) => r.onclick = () => busy(r, async () => shiftDoc(await api.rpc('shift_report', { id: +r.dataset.shift }), 'A4')));
  }

  function movementsPanel(list, title, cd) {
    return `<div class="panel"><div class="ph"><h2>${title}</h2></div>${list.length ? `<div class="tbl-wrap"><table class="t">
      <thead><tr><th>الوقت</th><th>النوع</th><th>البيان</th><th class="n">دخل</th><th class="n">خرج</th><th>المحاسب</th></tr></thead>
      <tbody>${list.map((x) => `<tr ${x.ref_type === 'sale' ? `class="click" data-go="#/sales/${x.ref_id}"` : x.ref_type === 'settlement' ? `class="click" data-go="#/settlements/${x.ref_id}"` : ''}>
        <td class="num muted">${x.time}</td><td>${CASH_CAT[x.category] || x.category}</td><td>${esc(x.description)}</td>
        <td class="n t-in">${x.direction === 'in' ? money(x.amount) : ''}</td><td class="n t-out">${x.direction === 'out' ? money(x.amount) : ''}</td>
        <td class="small muted">${esc(x.by || '')}</td></tr>`).join('')}</tbody>
      ${cd ? `<tfoot><tr><td colspan="3">الإجمالي</td><td class="n">${money(cd.total_in)}</td><td class="n">${money(cd.total_out)}</td><td></td></tr></tfoot>` : ''}</table></div>`
      : emptyState('لسه مفيش حركة', '')}</div>`;
  }
  const bindGo = () => body.querySelectorAll('[data-go]').forEach((r) => r.onclick = () => app.go(r.dataset.go));

  await show();
}
