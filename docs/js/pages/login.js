import { api } from '../api.js';
import { esc, busy } from '../ui.js';

export function render(onDone) {
  let mode = 'login';
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
        <p class="muted" style="margin:0 0 18px">${mode === 'login' ? 'ادخل باسم المستخدم وكلمة المرور' : 'الحساب الجديد بيشتغل بعد ما المدير يفعّله. أول حساب بيتعمل بيبقى هو المدير.'}</p>
        <form class="grid" id="f">
          ${mode === 'register' ? '<label class="f">الاسم بالكامل<input class="in" name="full_name" required autocomplete="name"></label>' : ''}
          <label class="f">اسم المستخدم (بالإنجليزي)<input class="in" name="username" required autocomplete="username" dir="ltr" autocapitalize="none"></label>
          <label class="f">كلمة المرور<input class="in" name="password" type="password" required autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" dir="ltr"></label>
          <div id="msg"></div>
          <button class="btn primary lg" type="submit">${mode === 'login' ? 'دخول' : 'إنشاء الحساب'}</button>
        </form>
        <p style="margin-top:18px" class="small">${mode === 'login'
          ? 'معندكش حساب؟ <a href="#" data-sw>اعمل حساب جديد</a>'
          : 'عندك حساب؟ <a href="#" data-sw>سجّل دخول</a>'}</p>
      </div></div>
    </div>`;
    document.querySelector('[data-sw]').onclick = (e) => { e.preventDefault(); mode = mode === 'login' ? 'register' : 'login'; draw(); };
    const f = document.getElementById('f');
    f.querySelector('input').focus();
    f.onsubmit = (e) => {
      e.preventDefault();
      const v = Object.fromEntries(new FormData(f));
      busy(f.querySelector('button[type=submit]'), async () => {
        try {
          if (mode === 'login') await api.login(v.username, v.password);
          else await api.register(v.username, v.password, v.full_name);
          onDone();
        } catch (er) {
          document.getElementById('msg').innerHTML = `<div class="alert err">${esc(er.message)}</div>`;
        }
      });
    };
  };
  draw();
}
