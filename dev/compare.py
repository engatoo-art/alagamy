"""مقارنة: نفس البيانات على Supabase (pg) وعلى نسخة الاستضافة بعد النقل (php) لازم تطلع نفس الأرقام بالظبط.
   python3 dev/compare.py snapshot OUT_DIR       ← على pg: بيطلع النسخة الكاملة + الأرقام المرجعية
   python3 dev/compare.py check OUT_DIR ADMIN_PW ← على php بعد التسطيب والنقل: بيقارن"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H

mode, out = sys.argv[1], sys.argv[2]


def numbers(admin):
    r = {}
    d = H.call(admin, "dashboard")
    r["dashboard"] = {k: d[k] for k in ("total_debts", "debtors", "open_shipments", "crates_out", "to_pay", "pending")}
    r["cash_balance"] = H.call(admin, "current_shift")["cash_balance"]
    r["customers"] = {c["name"]: [c["balance"], sorted((x["name"], x["count"]) for x in c["crates"])]
                      for c in H.call(admin, "list_customers", {"include_inactive": True})}
    r["zimam"] = {z["name"]: [z["balance"], z["oldest_unpaid"], z["purchases"], z["credit_purchases"], z["total_purchases"]]
                  for z in H.call(admin, "report_zimam", {})}
    r["suppliers"] = {s["name"]: [s["open_shipments"], s["pending_amount"], s["due_amount"], s["paid_amount"], s["advance_balance"]]
                      for s in H.call(admin, "list_suppliers", {"include_inactive": True})}
    per = H.call(admin, "report_period", {"from": "2000-01-01", "to": "2999-12-31"})
    r["period"] = {"sales": per["sales"], "collections": per["collections"], "crate_returns": per["crate_returns"],
                   "commission": per["commission"], "supplier_paid": per["supplier_paid"],
                   "cash": {k: per["cash"][k] for k in ("opening", "closing", "total_in", "total_out")}}
    r["statements"] = {}
    for c in H.call(admin, "list_customers", {"include_inactive": True}):
        st = H.call(admin, "customer_statement", {"id": c["id"]})
        r["statements"][c["name"]] = [st["balance"], st["opening"], len(st["entries"]), st["totals"],
                                      [e["balance"] for e in st["entries"]]]
    for s in H.call(admin, "list_suppliers", {"include_inactive": True}):
        st = H.call(admin, "supplier_statement", {"supplier_id": s["id"], "from": "2000-01-01"})
        r["statements"]["sup:" + s["name"]] = [st["advance_balance"], st["totals"]]
    stock = H.call(admin, "list_stock", {"include_empty": True})
    r["stock"] = sorted([x["item"], x["supplier"], x["qty"], x["sold"]] for x in stock)
    r["shifts"] = sorted([s["user_name"], s["opening_amount"], s["status"], s["difference"], s["live_in"], s["live_out"]]
                         for s in H.call(admin, "list_shifts", {"from": "2000-01-01"}))
    r["sales"] = sorted([s["sale_no"], s["customer"], s["grand_total"], s["paid_amount"], s["approval_status"], s["voided"], s["items"]]
                        for s in H.call(admin, "list_sales", {"from": "2000-01-01", "to": "2999-12-31", "include_voided": True}))
    return r


def norm(x):
    if isinstance(x, bool) or x is None:
        return x
    if isinstance(x, (int, float)):
        return round(float(x), 2)
    if isinstance(x, str):
        try:
            return round(float(x), 2) if x.strip() and x.replace(".", "", 1).replace("-", "", 1).isdigit() else x
        except ValueError:
            return x
    if isinstance(x, dict):
        return {k: norm(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [norm(v) for v in x]
    return x


def diff(a, b, path=""):
    out = []
    if isinstance(a, dict) and isinstance(b, dict):
        for k in sorted(set(a) | set(b)):
            if k not in a or k not in b:
                out.append(f"{path}/{k}: موجود في ناحية بس")
            else:
                out += diff(a[k], b[k], f"{path}/{k}")
    elif isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            out.append(f"{path}: عدد مختلف {len(a)} != {len(b)}")
        for i, (x, y) in enumerate(zip(a, b)):
            out += diff(x, y, f"{path}[{i}]")
    elif isinstance(a, float) and isinstance(b, float):
        if abs(a - b) > 0.011:
            out.append(f"{path}: {a} != {b}")
    elif a != b:
        out.append(f"{path}: {a!r} != {b!r}")
    return out


if mode == "snapshot":
    admin = H.sql("select id from profiles where username = 'admin'")
    os.makedirs(out, exist_ok=True)
    # زي زرار "نزّل النسخة الكاملة" في البرنامج
    json.dump(H.call(admin, "export_all"), open(os.path.join(out, "export.json"), "w"), ensure_ascii=False)
    json.dump(norm(numbers(admin)), open(os.path.join(out, "ref.json"), "w"), ensure_ascii=False, indent=1)
    print("✔ اتطلعت النسخة الكاملة والأرقام المرجعية")
else:
    pw = sys.argv[3]
    ex = json.load(open(os.path.join(out, "export.json")))
    tables = {"users": "profiles", "customers": "customers", "suppliers": "suppliers", "items": "items", "crate_types": "crate_types",
              "shipments": "shipments", "shipment_items": "shipment_items", "sales": "sales", "sale_lines": "sale_lines",
              "customer_payments": "customer_payments", "crate_returns": "crate_returns", "settlements": "settlements",
              "cash_movements": "cash_movements", "supplier_advances": "supplier_advances", "change_requests": "change_requests",
              "cash_shifts": "cash_shifts"}
    for k, t in tables.items():
        n = int(H.sql(f"select count(*) from {t}"))
        assert n == len(ex[k]), f"{t}: {n} != {len(ex[k])}"
    print("✔ كل الجداول اتنقلت بنفس عدد الصفوف")
    d = H.http("login", {"username": "admin", "password": pw})
    admin = d["user"]["id"]
    H.TOKENS[admin] = d["token"]
    H.PASSWORDS[admin] = ("admin", pw)
    ref = json.load(open(os.path.join(out, "ref.json")))
    got = norm(numbers(admin))
    problems = diff(ref, got)
    if problems:
        print("\n".join(problems[:60]))
        raise SystemExit(f"✘ فيه {len(problems)} اختلاف بين النسختين")
    # الحسابات اللي اتنقلت من غير كلمة سر: مش بتدخل لحد ما المدير يعملها كلمة سر
    try:
        H.http("login", {"username": "ahmed", "password": "anything-123"}); raise AssertionError("imported user must not log in")
    except RuntimeError as e:
        assert "كلمة سر جديدة" in str(e), e
    print("✔ كل الأرقام بعد النقل زي البرنامج القديم بالظبط (أرصدة، زمامات، عملاء، درج، عهد، كشوف، بضاعة، فواتير)")
