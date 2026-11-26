"""بيفتح كل صفحات البرنامج في متصفح حقيقي ويتأكد إن مفيش أخطاء.
   python3 dev/ui_sweep.py BASE_URL USERNAME PASSWORD SHOTS_DIR"""
import os, sys
from playwright.sync_api import sync_playwright

base, user, pw, shots = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
os.makedirs(shots, exist_ok=True)
routes = ['#/', '#/sale', '#/sales', '#/sales/1', '#/customers', '#/customers/1', '#/crates', '#/suppliers', '#/suppliers/1',
          '#/shipments', '#/shipments/new', '#/shipments/1', '#/settlements', '#/settlements/1', '#/stock', '#/accountants',
          '#/shifts/1', '#/cash', '#/cash?tab=day', '#/cash?tab=history', '#/out', '#/approvals', '#/reports',
          '#/reports?tab=out', '#/debts', '#/settings', '#/settings?tab=users', '#/settings?tab=backup', '#/settings?tab=crates',
          '#/settings?tab=items', '#/account']
bad = []
with sync_playwright() as p:
    b = p.chromium.launch()
    for vw, tag in [((1366, 860), 'pc'), ((390, 844), 'phone')]:
        pg = b.new_page(viewport={'width': vw[0], 'height': vw[1]})
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: m.type == 'error' and 'fonts.g' not in m.text and errs.append(m.text))
        pg.goto(base)
        pg.wait_for_selector('input[name=username]', timeout=15000)
        pg.fill('input[name=username]', user)
        pg.fill('input[name=password]', pw)
        pg.click('button[type=submit]')
        pg.wait_for_selector('#page', timeout=15000)
        pg.wait_for_timeout(1200)
        for r in routes:
            pg.goto(base + r)
            pg.wait_for_timeout(1100)
            txt = pg.inner_text('#page') if pg.query_selector('#page') else ''
            if 'حصلت مشكلة' in txt:
                bad.append(f'{tag} {r}: {txt[:160]!r}')
            if tag == 'pc' or r in ('#/', '#/sale', '#/cash', '#/out'):
                pg.screenshot(path=os.path.join(shots, f"{tag}_{r.strip('#/').replace('/', '_').replace('?', '_') or 'home'}.png"), full_page=True)
        # البيع: قايمة الأصناف بتظهر
        pg.goto(base + '#/sale'); pg.wait_for_timeout(1200)
        pg.click('[data-f=pick]'); pg.wait_for_timeout(500)
        if not pg.query_selector('.combo-list'):
            bad.append(f'{tag} sale: قايمة الأصناف مظهرتش')
        # الخروج
        pg.goto(base + '#/'); pg.wait_for_timeout(600)
        bad += [f'{tag} console: {e}' for e in errs]
    b.close()
if bad:
    print('\n'.join(bad))
    raise SystemExit(f'✘ {len(bad)} مشكلة في الصفحات')
print(f'✔ كل الصفحات ({len(routes)}) اتفتحت على الكمبيوتر والموبايل من غير أخطاء على نسخة الاستضافة')
