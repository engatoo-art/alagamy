import { CONFIG } from './config.js';

// نسخة الاستضافة (PHP + MySQL): البرنامج بيكلم api/ على نفس الموقع
const PHP = CONFIG.BACKEND === 'php';
// وضع التجربة المحلية: لو مفيش بيانات Supabase بنكلم سيرفر التجربة
const DEV = !PHP && !CONFIG.SUPABASE_URL;
const TOKEN_KEY = 'alagamy_token';

async function phpPost(fn, body, auth = true) {
  const headers = { 'Content-Type': 'application/json' };
  const tok = localStorage.getItem(TOKEN_KEY);
  if (auth && tok) { headers.Authorization = 'Bearer ' + tok; headers['X-Auth-Token'] = tok; }
  let r;
  try {
    r = await fetch((CONFIG.API_URL || 'api/') + '?fn=' + fn, { method: 'POST', headers, body: JSON.stringify(body || {}), cache: 'no-store' });
  } catch { throw new Error('مفيش اتصال بالإنترنت أو السيرفر مش بيرد'); }
  let j = null;
  try { j = await r.json(); } catch { /* رد مش JSON */ }
  if (!r.ok || !j) {
    if (r.status === 401 && j?.code === 'auth') localStorage.removeItem(TOKEN_KEY);
    throw new Error(j?.error || 'السيرفر مش بيرد صح (' + r.status + ')');
  }
  return j.data;
}
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
  if (/Database error saving new user|إنشاء الحسابات مقفول/i.test(msg)) return 'إنشاء الحسابات مقفول — المدير بس اللي يعمل حسابات من الإعدادات';
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
  php: PHP,

  async session() {
    if (PHP) return localStorage.getItem(TOKEN_KEY) ? { user: {} } : null;
    if (DEV) return localStorage.getItem('dev_uid') ? { user: { id: localStorage.getItem('dev_uid') } } : null;
    const c = await client();
    const { data } = await c.auth.getSession();
    return data.session;
  },

  async login(username, password) {
    if (!username || !password) throw new Error('اكتب اسم المستخدم وكلمة المرور');
    if (PHP) {
      const d = await phpPost('login', { username: username.trim().toLowerCase(), password }, false);
      localStorage.setItem(TOKEN_KEY, d.token);
      return;
    }
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
    if (PHP) {
      if ((password || '').length < 8) throw new Error('كلمة المرور لازم تكون 8 حروف أو أرقام على الأقل');
      const d = await phpPost('setup', { username: username.trim().toLowerCase(), password, full_name: fullName }, false);
      localStorage.setItem(TOKEN_KEY, d.token);
      return;
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
    if ((password || '').length < 8) throw new Error('كلمة المرور لازم تكون 8 حروف أو أرقام على الأقل');
    if (PHP) return (await this.rpc('create_user', { username, password, full_name: fullName })).id;
    // دعوة لمرة واحدة من المدير — من غيرها قاعدة البيانات بترفض إنشاء أي حساب
    const { invite } = await this.rpc('create_invite', { username });
    if (DEV) {
      const j = await devPost('/dev/register', { username, full_name: fullName, invite });
      return j.uid;
    }
    const { createClient } = await loadLib();
    const tmp = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'alagamy-new-user' },
    });
    const { data, error } = await tmp.auth.signUp({
      email: email(username), password, options: { data: { username, full_name: fullName, invite } },
    });
    if (error) throw new Error(friendly(error.message));
    if (!data.user?.id || (data.user.identities && data.user.identities.length === 0)) {
      throw new Error('اسم المستخدم ده موجود قبل كده، اختار اسم تاني');
    }
    return data.user.id;
  },

  async setupNeeded() {
    if (PHP) { try { return (await phpPost('setup_needed', {}, false)) === true; } catch { return false; } }
    if (DEV) return (await devPost('/dev/setup_needed', {})).needed;
    const c = await client();
    const { data, error } = await c.rpc('setup_needed', { p: {} });
    return !error && data === true;
  },

  async changePassword(newPassword, current) {
    if ((newPassword || '').length < 8) throw new Error('كلمة المرور لازم تكون 8 حروف أو أرقام على الأقل');
    if (PHP) { await this.rpc('change_my_password', { password: newPassword, current }); return; }
    if (DEV) return;
    const c = await client();
    const { error } = await c.auth.updateUser({ password: newPassword });
    if (error) throw new Error(friendly(error.message));
  },

  async logout() {
    if (PHP) { try { await phpPost('logout', {}); } catch { /* الجلسة خلصت أصلاً */ } localStorage.removeItem(TOKEN_KEY); return; }
    if (DEV) { localStorage.removeItem('dev_uid'); return; }
    const c = await client();
    await c.auth.signOut();
  },

  async rpc(fn, p = {}) {
    if (PHP) return phpPost(fn, { p });
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
