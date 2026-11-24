"""تجربة تفاعلية: نقلة جديدة من الشاشة ثم فاتورة بيع منها"""
from playwright.sync_api import sync_playwright

errors = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg = b.new_page(viewport={'width': 1366, 'height': 900})
    pg.route('**/*', lambda r: r.abort() if not r.request.url.startswith('http://localhost') else r.continue_())
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.goto('http://localhost:8090/')
    pg.evaluate("fetch('/dev/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'ahmed'})}).then(r=>r.json()).then(j=>localStorage.setItem('dev_uid',j.uid))")
    pg.wait_for_timeout(300)

    # نقلة جديدة
    pg.goto('http://localhost:8090/#/shipments/new'); pg.reload(); pg.wait_for_timeout(800)
    pg.select_option('#sup', label='الحاج محمود')
    pg.fill('[name=truck]', 'ق ط 777'); pg.fill('[name=freight]', '400')
    pg.fill('#rows tr:nth-child(1) [data-f=name]', 'خيار')
    pg.fill('#rows tr:nth-child(1) [data-f=qty]', '80')
    pg.press('#rows tr:nth-child(1) [data-f=qty]', 'Enter')
    pg.fill('#rows tr:nth-child(2) [data-f=name]', 'مانجو')
    pg.fill('#rows tr:nth-child(2) [data-f=qty]', '40')
    pg.click('#save'); pg.wait_for_timeout(1200)
    print('after shipment save url:', pg.url)
    pg.screenshot(path='/tmp/flow_ship.png', full_page=True)

    # بيع
    pg.goto('http://localhost:8090/#/sale'); pg.wait_for_timeout(1000)
    pg.click('#cust'); pg.fill('#cust', 'الأمانة'); pg.wait_for_timeout(200); pg.keyboard.press('Enter')
    pg.click('#pay [data-v=credit]')
    pick = '#lines tr:nth-child(1) [data-f=pick]'
    pg.click(pick); pg.fill(pick, 'خيار'); pg.wait_for_timeout(200); pg.keyboard.press('Enter')
    pg.fill('#lines tr:nth-child(1) [data-f=qty]', '5')
    pg.fill('#lines tr:nth-child(1) [data-f=weight]', '120')
    pg.fill('#lines tr:nth-child(1) [data-f=price]', '9.5')
    pg.select_option('#lines tr:nth-child(1) [data-f=crate_type_id]', index=1)
    pg.click('#addLine')
    pick2 = '#lines tr:nth-child(2) [data-f=pick]'
    pg.fill(pick2, 'مانجو'); pg.wait_for_timeout(200); pg.keyboard.press('Enter')
    pg.click('#lines tr:nth-child(2) [data-u=count]')
    pg.fill('#lines tr:nth-child(2) [data-f=qty]', '10')
    pg.fill('#lines tr:nth-child(2) [data-f=price]', '60')
    pg.fill('#paid', '500')
    pg.wait_for_timeout(300)
    print('totals:', pg.inner_text('#tGoods'), pg.inner_text('#tDep'), pg.inner_text('#tGrand'), pg.inner_text('#tRest'))
    pg.screenshot(path='/tmp/flow_sale.png', full_page=True)
    pg.on('console', lambda m: print('console:', m.text)); pg.click('[data-save=none]'); pg.wait_for_timeout(300); print('toasts0:', pg.eval_on_selector_all('.toast', 'e => e.map(x => x.textContent)')); pg.wait_for_timeout(1200)
    print('toasts:', pg.eval_on_selector_all('.toast', 'e => e.map(x => x.textContent)'))
    b.close()
print('errors:', errors or 'none')
