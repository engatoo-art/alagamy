"""اختبار سيناريوهات البرنامج على قاعدة بيانات محلية
   BACKEND=pg  (الافتراضي): Supabase/PostgreSQL المحلي
   BACKEND=php: نسخة الاستضافة (PHP + MySQL) — السيرفر على PHP_URL وقاعدة البيانات MYSQL_* """
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from harness import *  # noqa

ok = lambda m: print("✔", m)

admin = new_user("admin", "المدير")
# حد غريب يحاول يعمل حساب من غير دعوة المدير
try:
    new_user("hacker", "x"); raise AssertionError("signup without invite should fail")
except RuntimeError as e:
    assert "مقفول" in str(e), e
try:
    new_user("hacker2", "x", invite="000"); raise AssertionError("bad invite should fail")
except RuntimeError as e:
    assert "مقفول" in str(e), e
ok("محدش يقدر يعمل حساب من غير دعوة من المدير")
acc = new_user("ahmed", "أحمد المحاسب", inviter=admin)
me = call(admin, "app_bootstrap")
assert me["me"]["role"] == "admin" and me["me"]["active"], me
ok("أول مستخدم بقى مدير ومتفعّل")
r = call(acc, "app_bootstrap")
assert r["me"]["active"] is False
expect_error(acc, "dashboard", {}, "مش متفعل")

perms = {k: True for k in ["sales", "customers", "collections", "suppliers", "settlements", "cash", "payouts"]}
call(admin, "save_user", {"id": acc, "active": True, "perms": perms})
ok("المدير فعّل المحاسب وإداله صلاحيات")
expect_error(acc, "add_cash", {"direction": "in", "category": "funding", "amount": 10, "description": "x"}, "افتح عهدتك")
sh = call(acc, "open_shift")
assert float(sh["opening_amount"]) == 0
ok("المحاسب فتح عهدته")
expect_error(acc, "save_settings", {"shop_name": "x"}, "صلاحية")
expect_error(admin, "save_user", {"id": admin, "role": "accountant"}, "مينفعش")
call(admin, "save_user", {"id": acc, "perms": {**perms, "users": True}})
expect_error(acc, "save_user", {"id": acc, "role": "admin"}, "للمدير بس")
expect_error(acc, "create_user" if PHP else "create_invite", {"username": "x123", "password": "12345678"}, "للمدير بس")
call(admin, "save_user", {"id": acc, "perms": perms})
ok("محاسب معاه صلاحية المستخدمين مايقدرش يخلي نفسه مدير")

crates = {c["name"]: c for c in call(admin, "app_bootstrap")["crate_types"]}
big = crates["صندوق بلاستيك كبير"]["id"]
wood = crates["صندوق خشب (بدون رهن)"]["id"]

sup = call(acc, "save_supplier", {"name": "الحاج محمود", "phone": "0100", "commission_pct": 8})
ship = call(acc, "save_shipment", {"supplier_id": sup["id"], "truck": "ن ق 123", "freight": 500, "unloading": 150,
                                   "items": [{"item_name": "طماطم", "qty": 100}, {"item_name": "برتقال", "qty": 50, "default_unit": "kg"},
                                             {"item_name": "بطيخ", "qty": 200, "default_unit": "count"}]})
assert len(ship["items"]) == 3
ok(f"نقلة جديدة من {ship['supplier']} فيها 3 أصناف")
stock = call(acc, "available_stock")
si = {s["item"]: s for s in stock}
assert si["طماطم"]["remaining"] == 100

cust = call(acc, "save_customer", {"name": "محل الأمانة", "phone": "0111", "credit_requested": True})
assert cust["credit_approved"] is False and cust["credit_requested"] is True
cash_c = call(acc, "save_customer", {"name": "عم سيد"})

# بيع نقدي بالكيلو مع رهن صناديق
s1 = call(acc, "create_sale", {"customer_id": cash_c["id"], "payment_type": "cash", "lines": [
    {"shipment_item_id": si["طماطم"]["shipment_item_id"], "unit": "kg", "qty": 10, "weight": 200, "price": 12, "crate_type_id": big, "crates": 10},
    {"shipment_item_id": si["بطيخ"]["shipment_item_id"], "unit": "count", "qty": 20, "price": 35, "crate_type_id": wood, "crates": 5}]})
assert float(s1["sale"]["goods_total"]) == 200 * 12 + 20 * 35, s1["sale"]
assert float(s1["sale"]["deposit_total"]) == 500
assert float(s1["sale"]["grand_total"]) == 3100 + 500
assert float(s1["sale"]["paid_amount"]) == 3600
ok(f"فاتورة نقدي رقم {s1['sale']['sale_no']}: بضاعة 3100 + رهن 500 = 3600")

# بيع آجل لزبون مش متوافق عليه => موافقة
s2 = call(acc, "create_sale", {"customer_id": cust["id"], "payment_type": "credit", "paid_amount": 1000, "lines": [
    {"shipment_item_id": si["طماطم"]["shipment_item_id"], "unit": "kg", "qty": 30, "weight": 600, "price": 11, "crate_type_id": big, "crates": 30}]})
assert s2["sale"]["approval_status"] == "pending"
assert float(s2["sale"]["grand_total"]) == 6600 + 1500
ok("فاتورة آجل اتسجلت ومستنية موافقة المدير")
expect_error(acc, "create_sale", {"payment_type": "credit", "lines": [{"item_id": 1, "unit": "kg", "weight": 1, "price": 1}]}, "زبون مسجل")
expect_error(acc, "create_sale", {"customer_id": cash_c["id"], "payment_type": "cash", "lines": [
    {"shipment_item_id": si["برتقال"]["shipment_item_id"], "unit": "kg", "qty": 60, "weight": 100, "price": 10}]}, "أكبر من الباقي")
expect_error(acc, "create_sale", {"payment_type": "cash", "customer_name": "عابر", "lines": [
    {"shipment_item_id": si["برتقال"]["shipment_item_id"], "unit": "kg", "qty": 1, "weight": 20, "price": 10, "crate_type_id": big, "crates": 1}]}, "رهن")

pend = call(admin, "pending_approvals")
assert len(pend["sales"]) == 1 and len(pend["customers"]) == 1
call(admin, "decide_sale", {"id": s2["sale"]["id"], "approve": True})
call(admin, "decide_customer_credit", {"id": cust["id"], "approve": True, "credit_limit": 20000})
ok("المدير وافق على الفاتورة والآجل بحد 20000")

st = call(acc, "customer_statement", {"id": cust["id"]})
assert float(st["balance"]) == 8100 - 1000, st["balance"]
assert st["crates"][0]["count"] == 30
ok(f"كشف حساب محل الأمانة: عليه {st['balance']} و30 صندوق")

pay = call(acc, "add_payment", {"customer_id": cust["id"], "amount": 2000, "notes": "دفعة"})
assert float(pay["balance"]) == 5100
ret = call(acc, "return_crates", {"customer_id": cust["id"], "crate_type_id": big, "count": 10, "method": "account"})
assert float(ret["balance"]) == 4600, ret
expect_error(acc, "return_crates", {"customer_id": cust["id"], "crate_type_id": big, "count": 25, "method": "account"}, "عليه 20")
ret2 = call(acc, "return_crates", {"customer_id": cash_c["id"], "crate_type_id": big, "count": 4, "method": "cash"})
assert float(ret2["amount"]) == 200
ok("دفعة 2000 + مرتجع 10 صناديق خصم من الحساب + مرتجع 4 صناديق نقدي")

call(acc, "add_cash", {"direction": "in", "category": "funding", "amount": 1000, "description": "تمويل الدرج من صاحب المحل"})
call(acc, "add_cash", {"direction": "out", "category": "transport", "amount": 300, "description": "أجرة عربية نقل"})
cd = call(acc, "cash_day", {})
expected = 3600 + 1000 + 2000 - 200 + 1000 - 300
assert float(cd["closing"]) == expected, (cd["closing"], expected)
ok(f"العهدة: الرصيد {cd['closing']} (مظبوط)")

# تصفية المورد
pv = call(acc, "preview_settlement", {"supplier_id": sup["id"], "shipment_ids": [ship["id"]]})
gross = float(pv["totals"]["gross"])
assert gross == 2400 + 700 + 6600, gross
assert float(pv["totals"]["weight"]) == 800
stl = call(acc, "create_settlement", {"supplier_id": sup["id"], "shipment_ids": [ship["id"]]})
assert float(stl["commission_amount"]) == round(gross * 0.08, 2)
assert float(stl["net_amount"]) == gross - round(gross * 0.08, 2) - 500 - 150
ok(f"تصفية رقم {stl['settle_no']}: مبيعات {gross} - عمولة {stl['commission_amount']} - نولون وعتالة = {stl['net_amount']}")
expect_error(acc, "pay_settlement", {"id": stl["id"]}, "موافقة المدير")
expect_error(acc, "decide_settlement", {"id": stl["id"], "approve": True}, "صلاحية")
expect_error(acc, "create_sale", {"customer_id": cash_c["id"], "payment_type": "cash", "lines": [
    {"shipment_item_id": si["برتقال"]["shipment_item_id"], "unit": "kg", "qty": 1, "weight": 20, "price": 10}]}, "اتقفلت")
call(admin, "decide_settlement", {"id": stl["id"], "approve": True})
paid = call(acc, "pay_settlement", {"id": stl["id"]})
assert paid["status"] == "paid"
cd2 = call(acc, "cash_day", {})
assert float(cd2["closing"]) == expected - float(stl["net_amount"])
ok("المدير وافق والمحاسب صرف، والمبلغ اتخصم من العهدة")

expect_error(acc, "void_sale", {"id": s1["sale"]["id"]}, "صلاحية")
expect_error(admin, "void_sale", {"id": s1["sale"]["id"]}, "تصفية")

# تقارير
d = call(admin, "dashboard")
rp = call(admin, "report_period", {})
debts = call(admin, "report_debts")
assert any(x["name"] == "محل الأمانة" for x in debts)
assert float(rp["commission"]["commission"]) == float(stl["commission_amount"])
ok(f"لوحة التحكم والتقارير شغالة — مبيعات النهارده {d['sales_total']}، عمولتك {rp['commission']['commission']}")

ex = call(admin, "export_all")
assert len(ex["sales"]) == 2 and len(ex["cash_movements"]) >= 6
ok("النسخة الاحتياطية بتطلع كل الجداول")
expect_error(acc, "export_all", {}, "صلاحية")

# حماية الجداول من الوصول المباشر
if PHP:
    for tok in [None, "0" * 64]:
        try:
            http("list_sales", {"p": {}}, tok)
            raise AssertionError("call without login should be denied")
        except RuntimeError as e:
            assert "سجّل دخول" in str(e), e
    print("  ✔ مفيش أي عملية من غير دخول")
else:
  try:
    sql("begin; set local role authenticated; select * from public.sales; commit;")
    raise AssertionError("direct table access should be denied")
  except RuntimeError as e:
    assert "permission denied" in str(e)
    print("  ✔ الجداول مقفولة قدام الوصول المباشر")

# باقي الدوال تشتغل من غير أخطاء
for fn, p in [("list_customers", {}), ("list_customers", {"only_debt": True}), ("list_suppliers", {}),
              ("list_shipments", {"status": "all"}), ("shipment_detail", {"id": ship["id"]}), ("list_sales", {}),
              ("get_sale", {"id": s1["sale"]["id"]}), ("list_settlements", {}), ("get_settlement", {"id": stl["id"]}),
              ("list_users", {}), ("pending_approvals", {})]:
    call(admin, fn, p)
ok("كل دوال العرض شغالة")

# قفل العهدة بعجز 100 واستلام العهدة التالية
call(acc, "add_cash", {"direction": "in", "category": "funding", "amount": 10000, "description": "تمويل"})
cur = call(acc, "current_shift")
exp = float(cur["shift"]["opening_amount"]) + float(cur["shift"]["live_in"]) - float(cur["shift"]["live_out"])
mate = new_user("mona", "منى", inviter=admin)
call(admin, "save_user", {"id": mate, "active": True, "perms": {"sales": True, "collections": True}})
expect_error(mate, "open_shift", {}, "مفتوحة باسم")
expect_error(mate, "add_payment", {"customer_id": cust["id"], "amount": 5}, "مفتوحة دلوقتي باسم")
rep = call(acc, "close_shift", {"counted": exp - 100, "notes": "تسليم"})
assert float(rep["expected_amount"]) == exp and float(rep["difference"]) == -100, rep
ok(f"العهدة اتقفلت: المفروض {exp} والفعلي {exp-100} — عجز 100")
nxt = call(mate, "open_shift")
assert float(nxt["opening_amount"]) == exp - 100, nxt["opening_amount"]
ok(f"منى فتحت عهدتها بنفس الفلوس اللي اتسلمت: {nxt['opening_amount']}")
call(mate, "add_payment", {"customer_id": cust["id"], "amount": 50})
assert len(call(admin, "list_shifts")) == 2 and len(call(mate, "list_shifts")) == 1
call(admin, "shift_report", {"id": rep["id"]})
expect_error(mate, "shift_report", {"id": rep["id"]}, "عهدة محاسب تاني")
ok("سجل العهد والصلاحيات مظبوطين")

# ===== طلبات التعديل والحذف والبضاعة والتقارير =====
call(admin, "save_user", {"id": acc, "perms": {**perms, "reports": True}})
sh2 = call(acc, "save_shipment", {"supplier_id": sup["id"], "items": [{"item_name": "جوافة", "qty": 30}, {"item_name": "ليمون", "qty": 10}]})
stock = {x["item"]: x for x in call(acc, "list_stock") if x["shipment_id"] == sh2["id"]}
assert stock["جوافة"]["remaining"] == 30 and stock["ليمون"]["supplier"] == "الحاج محمود"
s3 = call(mate, "create_sale", {"customer_id": cash_c["id"], "payment_type": "cash", "lines": [
    {"shipment_item_id": stock["جوافة"]["shipment_item_id"], "unit": "kg", "qty": 4, "weight": 80, "price": 10}]})
expect_error(acc, "edit_sale", {"id": s3["sale"]["id"]}, "صلاحية")
line_id = s3["lines"][0]["id"]
rq = call(acc, "request_change", {"kind": "edit_sale", "target_id": s3["sale"]["id"], "reason": "السعر غلط",
                                  "payload": {"lines": [{"id": line_id, "price": 12}]}})
expect_error(acc, "request_change", {"kind": "edit_sale", "target_id": s3["sale"]["id"]}, "مستني")
assert any(r["id"] == rq["id"] for r in call(admin, "pending_approvals")["requests"])
call(admin, "decide_change", {"id": rq["id"], "approve": True})
s3b = call(admin, "get_sale", {"id": s3["sale"]["id"]})
assert float(s3b["sale"]["grand_total"]) == 960 and float(s3b["sale"]["paid_amount"]) == 960
mv = call(admin, "report_money", {"direction": "in"})
assert any(m["category"] == "sale_edit" and float(m["amount"]) == 160 for m in mv["movements"])
ok("المحاسب طلب تعديل سعر، المدير وافق، والفاتورة اتعدلت وفرق 160 دخل العهدة")
rq2 = call(acc, "request_change", {"kind": "void_sale", "target_id": s3["sale"]["id"], "reason": "الزبون رجّع البضاعة"})
call(admin, "decide_change", {"id": rq2["id"], "approve": False, "note": "لا"})
assert call(admin, "get_sale", {"id": s3["sale"]["id"]})["sale"]["voided"] is False
rq3 = call(acc, "request_change", {"kind": "void_sale", "target_id": s3["sale"]["id"], "reason": "الزبون رجّع البضاعة"})
call(admin, "decide_change", {"id": rq3["id"], "approve": True})
assert call(admin, "get_sale", {"id": s3["sale"]["id"]})["sale"]["voided"] is True
ok("طلب إلغاء اترفض مرة واتوافق عليه مرة")
expect_error(acc, "stock_adjust", {"shipment_item_id": stock["ليمون"]["shipment_item_id"], "qty": 5}, "صلاحية")
rq4 = call(acc, "request_change", {"kind": "stock_adjust", "target_id": stock["ليمون"]["shipment_item_id"], "payload": {"qty": 0}, "reason": "اتلف"})
call(admin, "decide_change", {"id": rq4["id"], "approve": True})
assert not any(x["item"] == "ليمون" and x["shipment_id"] == sh2["id"] for x in call(admin, "list_stock"))
call(admin, "stock_adjust", {"shipment_item_id": stock["جوافة"]["shipment_item_id"], "qty": 50})
assert [x for x in call(admin, "list_stock") if x["shipment_item_id"] == stock["جوافة"]["shipment_item_id"]][0]["remaining"] == 50
ok("الأصناف: حذف بموافقة المدير، والمدير زوّد العدد على طول")
stl2 = call(acc, "create_settlement", {"supplier_id": sup["id"], "shipment_ids": [sh2["id"]], "freight": 100, "unloading": 50})
call(admin, "decide_settlement", {"id": stl2["id"], "approve": True})
e = call(acc, "edit_settlement", {"id": stl2["id"], "commission_pct": 5, "unloading": 70})
assert e["status"] == "pending" and float(e["unloading"]) == 70
e = call(admin, "edit_settlement", {"id": stl2["id"], "freight": 120})
assert float(e["net_amount"]) == float(e["gross_sales"]) - float(e["commission_amount"]) - 120 - 70
ok("فاتورة المورد اتعدلت (العمولة والدخان والنولون) ورجعت تستنى موافقة لما المحاسب عدّل")
rd = call(acc, "report_sales_detail", {"from": "2000-01-01"})
assert rd["by_item"] and rd["lines"] and float(rd["totals"]["amount"]) > 0
ro = call(acc, "report_money", {"direction": "out", "from": "2000-01-01"})
assert ro["by_party"] and float(ro["total"]) > 0
ok(f"التقارير المفصلة: {len(rd['lines'])} سطر بيع، {ro['count']} حركة خارجة")
# ===== الزمامات =====
z = call(admin, "report_zimam", {})
amana = [x for x in z if x["name"] == "محل الأمانة"][0]
assert float(amana["balance"]) > 0 and amana["purchases"] >= 1 and amana["oldest_unpaid"]
sql(("update sales set sale_date = date_sub(sale_date, interval 10 day) where customer_id = %d" if PHP else
     "update sales set sale_date = sale_date - 10 where customer_id = %d") % cust["id"])
z10 = call(admin, "report_zimam", {"min_days": 7})
assert any(x["name"] == "محل الأمانة" and x["days_late"] >= 10 for x in z10)
assert call(admin, "report_zimam", {"min_days": 30}) == [] or all(x["days_late"] >= 30 for x in call(admin, "report_zimam", {"min_days": 30}))
r = call(acc, "rate_customer", {"id": cust["id"], "rating_pay": 2, "rating_general": 4, "guarantor": "الحاج سيد", "rating_note": "بيتأخر"})
assert r["rating_pay"] == 2 and r["guarantor"] == "الحاج سيد"
assert call(admin, "report_zimam", {"search": "سيد"})[0]["name"] == "محل الأمانة"
ok(f"الزمامات: محل الأمانة متأخر {z10[0]['days_late']} يوم، الضامن والتقييم اتسجلوا، والبحث بالضامن شغال")
# ===== العهدة لدى العميل + كشف العميل + المحاسبين =====
expect_error(acc, "save_advance", {"supplier_id": sup["id"], "amount": 1000}, "صلاحية")
adv = call(admin, "save_advance", {"supplier_id": sup["id"], "amount": 1000, "notes": "مقدم الموسم"})
assert float(adv["balance"]) == 1000
sh3 = call(acc, "save_shipment", {"supplier_id": sup["id"], "items": [{"item_name": "عنب", "qty": 10}]})
si3 = sh3["items"][0]["id"]
call(mate, "create_sale", {"customer_id": cash_c["id"], "payment_type": "cash", "lines": [{"shipment_item_id": si3, "unit": "kg", "qty": 10, "weight": 200, "price": 20}]})
st3 = call(acc, "create_settlement", {"supplier_id": sup["id"], "shipment_ids": [sh3["id"]], "freight": 0, "unloading": 0})
expect_error(acc, "edit_settlement", {"id": st3["id"], "advance_deducted": 300}, "للمدير")
expect_error(admin, "edit_settlement", {"id": st3["id"], "advance_deducted": 5000}, "فيها")
e3 = call(admin, "edit_settlement", {"id": st3["id"], "advance_deducted": 600})
assert float(e3["advance_deducted"]) == 600 and float(e3["advance_balance"]) == 400
call(admin, "decide_settlement", {"id": st3["id"], "approve": True})
before = float(call(admin, "current_shift")["cash_balance"])
call(mate, "pay_settlement", {"id": st3["id"]}) if False else call(admin, "pay_settlement", {"id": st3["id"]})
after = float(call(admin, "current_shift")["cash_balance"])
assert round(before - after, 2) == round(float(e3["net_amount"]) - 600, 2)
expect_error(admin, "save_advance", {"id": adv["id"], "amount": 500}, "مينفعش")
call(admin, "save_advance", {"id": adv["id"], "amount": 800})
ss = call(acc, "supplier_statement", {"supplier_id": sup["id"], "from": "2000-01-01"})
assert ss["totals"]["count"] >= 2 and float(ss["advance_balance"]) == 200
ok(f"العهدة لدى العميل: مقدم 1000، خصم 600 من فاتورة، اتصرف الصافي ناقص المقدم، والرصيد {ss['advance_balance']}")
accs = call(admin, "list_accountants")
mona = [x for x in accs if x["username"] == "mona"][0]
sid = [x for x in call(admin, "list_shifts", {"from": "2000-01-01"}) if x["user_name"] == "منى"][0]["id"]
det = call(admin, "shift_detail", {"id": sid})
assert det["sales_totals"]["count"] >= 1 and det["sales"][0]["lines"]
expect_error(admin, "review_shift", {"id": sid}, "مقفولة")
first_closed = [x for x in call(admin, "list_shifts", {"from": "2000-01-01"}) if x["status"] == "closed"][0]
rv = call(admin, "review_shift", {"id": first_closed["id"], "note": "تمام"})
assert rv["reviewed_by_name"] == "المدير"
ok(f"المحاسبين: منى عملت {mona['sales_count']} فاتورة، وتفاصيل العهدة فيها البيع والأصناف، والمراجعة اتسجلت")
# ---------- ربط العهد ببعض وتصفير الدرج ----------
cur = call(mate, "current_shift")
if cur["shift"]:
    call(admin, "close_shift", {})
bal0 = float(call(acc, "current_shift")["cash_balance"])
s1 = call(acc, "open_shift")
assert float(s1["opening_amount"]) == bal0
expect_error(admin, "reset_drawer", {}, "فيه عهدة مفتوحة")
c1 = call(acc, "close_shift", {"counted": bal0 + 50})
assert float(c1["difference"]) == 50
s2 = call(mate, "open_shift")
assert float(s2["opening_amount"]) == bal0 + 50 and float(s2["prev_difference"]) == 50 and s2["prev_user_name"] == "أحمد المحاسب", s2
c2 = call(mate, "close_shift", {"counted": bal0 + 20})
assert float(c2["difference"]) == -30
expect_error(acc, "open_shift", {"zero": True}, "للمدير بس")
expect_error(acc, "reset_drawer", {}, "للمدير بس")
s3 = call(admin, "open_shift", {"zero": True})
assert float(s3["opening_amount"]) == 0 and float(s3["reset_amount"]) == bal0 + 20 and float(s3["prev_difference"]) == -30, s3
assert s3["reset_by_name"] == "المدير"
call(admin, "close_shift", {"counted": 0})
r = call(admin, "reset_drawer", {})
assert float(r["reset"]) == 0 and float(r["cash_balance"]) == 0
accs = {x["username"]: x for x in call(admin, "list_accountants")}
assert float(accs["mona"]["short"]) >= 30 and float(accs["ahmed"]["over"]) >= 50
ok("العهد مربوطة ببعض: الزيادة اتنقلت للعهدة اللي بعدها، العجز اتسجل على المحاسب، والتصفير للمدير بس")

# ---------- حذف حساب واسترجاعه ----------
tmp = new_user("temp1", "محاسب مؤقت", inviter=admin)
call(admin, "save_user", {"id": tmp, "active": True, "perms": {"sales": True, "cash": True}})
expect_error(admin, "delete_user", {"id": admin}, "حسابك")
expect_error(acc, "delete_user", {"id": tmp}, "للمدير بس")
call(tmp, "open_shift")
expect_error(admin, "delete_user", {"id": tmp}, "عهدته مفتوحة")
call(tmp, "close_shift", {"counted": float(call(tmp, "current_shift")["shift"]["opening_amount"])})
call(admin, "delete_user", {"id": tmp})
expect_error(tmp, "current_shift", {}, "")
users = {u["username"]: u for u in call(admin, "list_users")}
assert users["temp1"]["deleted_at"] and users["temp1"]["days_left"] == 7, users["temp1"]
call(admin, "restore_user", {"id": tmp})
call(tmp, "current_shift")
call(admin, "delete_user", {"id": tmp})
sql(f"update profiles set deleted_at = now() - interval 8 day where id = '{tmp}'" if PHP else
    f"update profiles set deleted_at = now() - interval '8 days' where id = '{tmp}'")
assert "temp1" not in {u["username"] for u in call(admin, "list_users")}
expect_error(admin, "restore_user", {"id": tmp}, "نهائي")
assert sql(f"select full_name from profiles where id = '{tmp}'") == "محاسب مؤقت"
new_user("temp1", "محاسب جديد بنفس الاسم", inviter=admin)
ok("حذف حساب المحاسب: بيتقفل على طول، بيرجع خلال 7 أيام، وبعدها بيتمسح والاسم بيتحرر والفواتير بتفضل باسمه")

# ---------- بيانات التواصل وتغيير كلمة السر من المدير ----------
expect_error(admin, "save_user", {"id": acc, "email": "ahmed-at-gmail"}, "الإيميل")
expect_error(admin, "save_user", {"id": acc, "phone": "012"}, "رقم")
u = call(admin, "save_user", {"id": acc, "email": " Ahmed@Gmail.com ", "phone": "0101 234 5678", "whatsapp": "+20 101 234 5678"})
assert u["email"] == "ahmed@gmail.com" and u["phone"] == "01012345678" and u["whatsapp"] == "+201012345678", u
if not PHP:
    sql(f"update auth.users set encrypted_password = extensions.crypt('old-pass-1', extensions.gen_salt('bf')) where id = '{acc}'")
    sql(f"insert into auth.sessions(user_id) values ('{acc}')")
else:
    call(acc, "app_bootstrap")
    old_token = TOKENS[acc]
expect_error(acc, "admin_set_password", {"id": mate, "password": "12345678"}, "للمدير بس")
expect_error(admin, "admin_set_password", {"id": admin, "password": "12345678"}, "حسابي")
expect_error(admin, "admin_set_password", {"id": acc, "password": "123"}, "8 حروف")
call(admin, "admin_set_password", {"id": acc, "password": "new-pass-2026"})
if PHP:
    assert sql(f"select count(*) from sessions where user_id = '{acc}'") == "0"
    try:
        http("app_bootstrap", {"p": {}}, old_token); raise AssertionError("old session should be gone")
    except RuntimeError as e:
        assert "سجّل دخول" in str(e)
    try:
        http("login", {"username": "ahmed", "password": PASSWORDS[acc][1]}); raise AssertionError("old password should fail")
    except RuntimeError as e:
        assert "غلط" in str(e)
    assert http("login", {"username": "ahmed", "password": "new-pass-2026"})["token"]
    assert sql(f"select password_hash like '$2y$%' from profiles where id = '{acc}'") == "1"
else:
    assert sql(f"select encrypted_password = extensions.crypt('new-pass-2026', encrypted_password) from auth.users where id = '{acc}'") == "t"
    assert sql(f"select encrypted_password like '$2a$%' from auth.users where id = '{acc}'") == "t"
    assert sql(f"select count(*) from auth.sessions where user_id = '{acc}'") == "0"
ok("بيانات التواصل بتتحفظ مظبوطة، والمدير بيغيّر كلمة السر (bcrypt) وبيخرّج المحاسب من كل الأجهزة")

print("\nكل الاختبارات نجحت ✔")
