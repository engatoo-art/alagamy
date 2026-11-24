import { CONFIG } from './config.js';

// وضع التجربة المحلية: لو مفيش بيانات Supabase بنكلم سيرفر التجربة
const DEV = !CONFIG.SUPABASE_URL;
let sb = null;
let lib = null;

// مكتبة Supabase: من نسخة جوه البرنامج لو موجودة (تطبيق الويندوز والموبايل)، وإلا من النت
async function loadLib() {
  if (!lib) {
    try { lib = await import('./vendor/supabase.js'); }
    catch { lib = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'); }
  }
  return lib;
}

async function client() {
  if (DEV) return null;
  if (!sb) {
    const { createClient } = await loadLib();
    sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return sb;
}

const email = (username) => `${username.trim().toLowerCase()}@${CONFIG.EMAIL_DOMAIN}`;

function friendly(msg) {
  if (!msg) return 'حصلت مشكلة، حاول تاني';
  if (/Invalid login credentials/i.test(msg)) return 'اسم المستخدم أو كلمة المرور غلط';
  if (/already registered|already exists/i.test(msg)) return 'اسم المستخدم ده موجود قبل كده، اختار اسم تاني';
  if (/Password should be at least/i.test(msg)) return 'كلمة المرور لازم تكون 6 حروف أو أرقام على الأقل';
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'مفيش اتصال بالإنترنت أو السيرفر مش بيرد';
  if (/JWT expired/i.test(msg)) return 'انتهت الجلسة، سجّل دخول تاني';
  if (/signups are disabled/i.test(msg)) return 'إنشاء الحسابات مقفول من إعدادات Supabase';
  if (/Email not confirmed/i.test(msg)) return 'لازم تقفل Confirm email من إعدادات Supabase';
  if (/rate limit/i.test(msg)) return 'محاولات كتير ورا بعض، استنى دقيقة وحاول تاني';
  return msg;
}

async function devPost(path, body) {
  const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || 'خطأ');
  return j;
}

export const api = {
  dev: DEV,

  async session() {
    if (DEV) return localStorage.getItem('dev_uid') ? { user: { id: localStorage.getItem('dev_uid') } } : null;
    const c = await client();
    const { data } = await c.auth.getSession();
    return data.session;
  },

  async login(username, password) {
    if (!username || !password) throw new Error('اكتب اسم المستخدم وكلمة المرور');
    if (DEV) {
      const j = await devPost('/dev/login', { username: username.trim().toLowerCase() });
      localStorage.setItem('dev_uid', j.uid);
      return;
    }
    const c = await client();
    const { error } = await c.auth.signInWithPassword({ email: email(username), password });
    if (error) throw new Error(friendly(error.message));
  },

  async register(username, password, fullName) {
    if (!/^[a-zA-Z0-9_.]{3,30}$/.test(username.trim())) {
      throw new Error('اسم المستخدم لازم يكون بالإنجليزي (حروف وأرقام) ومن 3 حروف على الأقل');
    }
    if (DEV) {
      const j = await devPost('/dev/register', { username: username.trim().toLowerCase(), full_name: fullName });
      localStorage.setItem('dev_uid', j.uid);
      return;
    }
    const c = await client();
    const { error } = await c.auth.signUp({
      email: email(username), password,
      options: { data: { username: username.trim().toLowerCase(), full_name: fullName } },
    });
    if (error) throw new Error(friendly(error.message));
    const s = await c.auth.getSession();
    if (!s.data.session) await this.login(username, password);
  },

  // المدير بيعمل حساب لمحاسب من غير ما يخرج من حسابه
  async createUser(username, password, fullName) {
    username = (username || '').trim().toLowerCase();
    if (!/^[a-z0-9_.]{3,30}$/.test(username)) {
      throw new Error('اسم المستخدم لازم يكون بالإنجليزي (حروف وأرقام) ومن 3 حروف على الأقل');
    }
    if ((password || '').length < 6) throw new Error('كلمة المرور لازم تكون 6 حروف أو أرقام على الأقل');
    if (DEV) {
      const j = await devPost('/dev/register', { username, full_name: fullName });
      return j.uid;
    }
    const { createClient } = await loadLib();
    const tmp = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'alagamy-new-user' },
    });
    const { data, error } = await tmp.auth.signUp({
      email: email(username), password, options: { data: { username, full_name: fullName } },
    });
    if (error) throw new Error(friendly(error.message));
    if (!data.user?.id || (data.user.identities && data.user.identities.length === 0)) {
      throw new Error('اسم المستخدم ده موجود قبل كده، اختار اسم تاني');
    }
    return data.user.id;
  },

  async changePassword(newPassword) {
    if (DEV) return;
    const c = await client();
    const { error } = await c.auth.updateUser({ password: newPassword });
    if (error) throw new Error(friendly(error.message));
  },

  async logout() {
    if (DEV) { localStorage.removeItem('dev_uid'); return; }
    const c = await client();
    await c.auth.signOut();
  },

  async rpc(fn, p = {}) {
    if (DEV) {
      const j = await devPost('/dev/rpc/' + fn, { uid: localStorage.getItem('dev_uid'), p });
      return j.data;
    }
    const c = await client();
    const { data, error } = await c.rpc(fn, { p });
    if (error) throw new Error(friendly(error.message));
    return data;
  },
};
