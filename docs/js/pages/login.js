import { api } from '../api.js';
import { esc, busy } from '../ui.js';

export async function render(onDone) {
  let mode = 'login';
  // إنشاء حساب من صفحة الدخول متاح بس أول مرة (حساب المدير). بعد كده المدير بيعمل الحسابات من الإعدادات
  let setup = false;
  try { setup = await api.setupNeeded(); } catch { /* مفيش نت */ }
  if (setup) mode = 'register';
  let fails = 0;
  const draw = () => {
    document.body.innerHTML = `
    <div class="login">
      <div class="art">
        <img src="img/logo.png" alt="">
        <div><h1>محل عبده العجمي<br>وأولاده محمد وعبدالرحمن</h1>
        <p>البيع والحسابات والنقلات والعهدة في مكان واحد، من المحل أو من البيت.</p></div>
        <span class="small" style="color:#8fb09d">حسابات المحل</span>
      </div>
      <div class="form"><div>
        <h2>${mode === 'login' ? 'تسجيل الدخول' : 'حساب جديد'}</h2>
        <p class="muted" style="margin:0 0 18px">${mode === 'login' ? 'ادخل باسم المستخدم وكلمة المرور' : 'ده أول حساب في البرنامج وهيبقى هو حساب المدير. كلمة المرور 8 حروف أو أرقام على الأقل.'}</p>
        <form class="grid" id="f">
          ${mode === 'register' ? '<label class="f">الاسم بالكامل<input class="in" name="full_name" required autocomplete="name"></label>' : ''}
          <label class="f">اسم المستخدم (بالإنجليزي)<input class="in" name="username" required autocomplete="username" dir="ltr" autocapitalize="none"></label>
          <label class="f">كلمة المرور<input class="in" name="password" type="password" required autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" dir="ltr"></label>
          <div id="msg"></div>
          <button class="btn primary lg" type="submit">${mode === 'login' ? 'دخول' : 'إنشاء الحساب'}</button>
        </form>
        <p style="margin-top:18px" class="small">${mode === 'login'
          ? (setup ? 'أول مرة؟ <a href="#" data-sw>اعمل حساب المدير</a>' : 'معندكش حساب؟ اطلب من المدير يعملك حساب.')
          : 'عندك حساب؟ <a href="#" data-sw>سجّل دخول</a>'}</p>
      </div></div>
    </div>`;
    const sw = document.querySelector('[data-sw]');
    if (sw) sw.onclick = (e) => { e.preventDefault(); mode = mode === 'login' ? 'register' : 'login'; draw(); };
    const f = document.getElementById('f');
    f.querySelector('input').focus();
    f.onsubmit = (e) => {
      e.preventDefault();
      const v = Object.fromEntries(new FormData(f));
      busy(f.querySelector('button[type=submit]'), async () => {
        if (fails >= 5) await new Promise((r) => setTimeout(r, Math.min(30, (fails - 4) * 5) * 1000));
        try {
          if (mode === 'login') await api.login(v.username, v.password);
          else await api.register(v.username, v.password, v.full_name);
          fails = 0;
          onDone();
        } catch (er) {
          fails++;
          document.getElementById('msg').innerHTML = `<div class="alert err">${esc(er.message)}</div>`;
        }
      });
    };
  };
  draw();
}
