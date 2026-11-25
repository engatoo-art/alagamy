import { api } from './api.js';
import { ok, promptBox, confirmBox, esc } from './ui.js';

export const KIND = {
  void_sale: 'إلغاء فاتورة بيع',
  edit_sale: 'تعديل أسعار فاتورة بيع',
  stock_adjust: 'تعديل عدد صنف في البضاعة',
  delete_shipment: 'حذف نقلة',
  void_payment: 'إلغاء دفعة',
};

// المدير بينفذ على طول، والمحاسب بيبعت طلب للمدير يوافق عليه
export async function doOrRequest(app, { kind, target_id, payload = {}, summary, direct, confirmText, done }) {
  if (app.can('approve')) {
    if (confirmText && !await confirmBox(confirmText, { danger: kind !== 'edit_sale' && kind !== 'stock_adjust', yes: 'تأكيد' })) return false;
    await direct();
    done && done(false);
    return true;
  }
  const reason = await promptBox(`${esc(summary)}<br><span class="muted small">العملية دي محتاجة موافقة المدير. اكتب السبب وهيوصله طلب.</span>`,
    { title: 'طلب موافقة — ' + KIND[kind], yes: 'ابعت للمدير', placeholder: 'السبب' });
  if (reason === null) return false;
  await api.rpc('request_change', { kind, target_id, payload, summary, reason });
  ok('اتبعت الطلب للمدير، وهيتنفذ أول ما يوافق');
  done && done(true);
  return true;
}
