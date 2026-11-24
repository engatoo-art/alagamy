"""اختبار سيناريوهات البرنامج على قاعدة بيانات محلية"""
import json, subprocess, sys

ENV = {"PGHOST": "/tmp", "PGPORT": "5544", "PGUSER": "postgres", "PATH": "/usr/bin:/bin"}

def sql(q):
    r = subprocess.run(["psql", "-d", "app", "-At", "-v", "ON_ERROR_STOP=1", "-c", q], capture_output=True, text=True, env=ENV)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip())
    return r.stdout.strip()

def call(uid, fn, p=None):
    body = json.dumps(p or {}, ensure_ascii=False).replace("$J$", "")
    q = (f"begin; set local role authenticated; select set_config('request.jwt.claim.sub', '{uid}', true); "
         f"select public.{fn}($J${body}$J$::jsonb); commit;")
    r = subprocess.run(["psql", "-d", "app", "-At", "-v", "ON_ERROR_STOP=1"], input=q, capture_output=True, text=True, env=ENV)
    if r.returncode != 0:
        err = r.stderr.strip().splitlines()
        raise RuntimeError(next((l for l in err if "ERROR" in l), r.stderr.strip()))
    lines = [l for l in r.stdout.strip().splitlines() if l not in ("BEGIN", "COMMIT", "SET", "")]
    return json.loads(lines[-1])

def expect_error(uid, fn, p, contains):
    try:
        call(uid, fn, p)
    except RuntimeError as e:
        assert contains in str(e), f"wrong error: {e}"
        print(f"  ✔ رفض متوقع: {contains}")
        return
    raise AssertionError(f"{fn} should have failed with {contains}")

def new_user(username, full):
    return sql(f"""insert into auth.users(email, raw_user_meta_data) values ('{username}@alagamy.app',
                '{{"username":"{username}","full_name":"{full}"}}') returning id""").splitlines()[0]

ok = lambda m: print("✔", m)

admin = new_user("admin", "المدير")
acc = new_user("ahmed", "أحمد المحاسب")
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
mate = new_user("mona", "منى")
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
print("\nكل الاختبارات نجحت ✔")
