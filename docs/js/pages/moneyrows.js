// جدول التحصيل والخارج: كل حركة ومعاها تعديل وحذف (للمدير، أو للمحاسب في عهدته)
// المحذوف والمتعدل بيفضل ظاهر باهت ومكتوب عليه، بس مش بيتجمع
import { api } from '../api.js';
import { esc, money, moneyT, n, icon, ok, busy, modal, formData, promptBox, dateT, emptyState, CASH_CAT, voidTag, mvCounted } from '../ui.js';

export function moneyTable(data, { from, to, dir, empty }) {
  const one = from === to;
  const cls = dir === 'in' ? 't-in' : 't-out';
  if (!data.movements.length) return emptyState(empty, '');
  return `<div class="tbl-wrap"><table class="t">
    <thead><tr>${one ? '' : '<th>التاريخ</th>'}<th>الوقت</th><th>النوع</th><th>البيان</th><th>${dir === 'in' ? 'من مين' : 'لمين'}</th><th class="n">المبلغ</th><th>بواسطة</th><th></th></tr></thead>
    <tbody>${data.movements.map((x) => `<tr class="${mvCounted(x) ? '' : 'void'}">${one ? '' : `<td>${dateT(x.date)}</td>`}<td class="muted">${x.time}</td>
      <td>${CASH_CAT[x.category] || x.category}</td><td>${esc(x.description)}${voidTag(x)}</td><td>${esc(x.party || '')}</td>
      <td class="n ${cls}"><b>${money(x.amount)}</b></td><td class="small muted">${esc(x.by || '')}</td>
      <td class="row-acts">${x.can_change ? `<button class="btn sm ghost" data-edit="${x.id}">${icon('edit')} تعديل</button><button class="btn sm ghost danger" data-del="${x.id}">${icon('trash')} حذف</button>` : ''}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td colspan="${one ? 4 : 5}">الإجمالي (${data.count})${data.changed ? ` <span class="small muted">— فيه ${data.changed} اتحذف أو اتعدل ومش محسوب</span>` : ''}</td>
      <td class="n">${money(data.total)}</td><td colspan="2"></td></tr></tfoot></table></div>`;
}

export function bindMoneyRows(root, data, reload) {
  const find = (id) => data.movements.find((x) => String(x.id) === String(id));
  root.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
    const x = find(b.dataset.del);
    const reason = await promptBox(`هتحذف <b>${esc(x.description)}</b> بمبلغ <b>${moneyT(x.amount)}</b>. هتفضل ظاهرة إنها اتحذفت ومش هتتحسب.<br>اكتب السبب:`,
      { title: 'حذف', yes: 'احذف', danger: true, placeholder: 'مثلاً: اتسجلت مرتين' });
    if (reason === null) return;
    await busy(b, async () => {
      if (x.ref_type === 'payment') await api.rpc('void_payment', { id: x.ref_id, reason });
      else await api.rpc('void_cash', { id: x.id, reason });
      ok('اتحذفت — وظاهرة في السجل إنها اتحذفت');
      await reload();
    });
  });
  root.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => {
    const x = find(b.dataset.edit);
    const pay = x.ref_type === 'payment';
    const m = modal({
      title: 'تعديل ' + (pay ? 'تحصيل من ' + x.party : x.description),
      body: `<form class="grid" id="ef">
        <label class="f">المبلغ<input class="in big" name="amount" type="number" min="0" step="0.01" value="${n(x.amount)}" required></label>
        ${pay ? '' : `<label class="f">البيان<input class="in" name="description" value="${esc(x.description)}" required></label>
          <label class="f">${x.direction === 'in' ? 'من مين' : 'لمين'}<input class="in" name="party" value="${esc(x.party || '')}"></label>`}
        <label class="f">سبب التعديل<input class="in" name="reason" required placeholder="مثلاً: المبلغ اتكتب غلط"></label>
        <div class="alert info">القديم هيفضل ظاهر مكتوب عليه "اتعدل"، والجديد هو اللي هيتحسب.</div></form>`,
      actions: `<button class="btn primary" data-ok>${icon('check')} احفظ التعديل</button><button class="btn" data-close>رجوع</button>`,
    });
    m.$('[data-ok]').onclick = () => busy(m.$('[data-ok]'), async () => {
      const v = formData(m.$('#ef'));
      if (!(n(v.amount) > 0)) throw new Error('اكتب المبلغ');
      if (!v.reason) throw new Error('اكتب سبب التعديل');
      if (pay) await api.rpc('edit_payment', { id: x.ref_id, amount: v.amount, reason: v.reason });
      else await api.rpc('edit_cash', { id: x.id, ...v });
      ok('اتعدلت');
      m.close();
      await reload();
    });
  });
}
