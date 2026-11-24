"""يفتح صفحات البرنامج في Chrome ويصورها ويجمع أي أخطاء"""
import sys, json
from playwright.sync_api import sync_playwright

PAGES = sys.argv[1].split(',') if len(sys.argv) > 1 else ['/']
USER = sys.argv[2] if len(sys.argv) > 2 else 'admin'
W = int(sys.argv[3]) if len(sys.argv) > 3 else 1366
errors = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg = b.new_page(viewport={'width': W, 'height': 900}, device_scale_factor=1)
    pg.route('**/*', lambda r: r.abort() if not r.request.url.startswith('http://localhost') else r.continue_())
    pg.on('console', lambda m: errors.append(f'console.{m.type}: {m.text}') if m.type in ('error',) else None)
    pg.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    pg.goto('http://localhost:8090/')
    pg.evaluate("u => fetch('/dev/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u})}).then(r=>r.json()).then(j=>localStorage.setItem('dev_uid',j.uid))", USER)
    for i, path in enumerate(PAGES):
        pg.goto('http://localhost:8090/#' + path)
        pg.reload()
        pg.wait_for_timeout(900)
        name = f'/tmp/shot_{USER}_{i}.png'
        pg.screenshot(path=name, full_page=True)
        toasts = pg.eval_on_selector_all('.toast.err', 'els => els.map(e => e.textContent)')
        print(path, '->', name, ('ERR TOAST: ' + '; '.join(toasts)) if toasts else '')
    b.close()
print('\n'.join(e for e in errors if 'net::ERR' not in e and 'Failed to load resource' not in e) or 'no js errors')
