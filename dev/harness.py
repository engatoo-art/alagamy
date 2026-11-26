"""أدوات الاختبار المشتركة: نفس الاختبارات بتشتغل على Supabase (pg) أو نسخة الاستضافة (php)"""
import json, os, subprocess, sys, urllib.request, urllib.error

BACKEND = os.environ.get("BACKEND", "pg")
PHP = BACKEND == "php"
ENV = {"PGHOST": "/tmp", "PGPORT": "5544", "PGUSER": "postgres", "PATH": "/usr/bin:/bin",
       **{k: os.environ[k] for k in ("PGHOST", "PGPORT", "PGUSER", "PGPASSWORD", "PGDATABASE") if k in os.environ}}
PHP_URL = os.environ.get("PHP_URL", "http://127.0.0.1:8099/api/")
TOKENS, PASSWORDS = {}, {}

def mysql(q):
    r = subprocess.run(["mysql", "-h", os.environ.get("MYSQL_HOST", "127.0.0.1"), "-u", os.environ.get("MYSQL_USER", "root"),
                        "-p" + os.environ.get("MYSQL_PASS", "root"), "--default-character-set=utf8mb4", os.environ.get("MYSQL_DB", "app"), "-N", "-B", "-e", q],
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip())
    return r.stdout.strip()

def http(fn, body, token=None):
    req = urllib.request.Request(PHP_URL + "?fn=" + fn, data=json.dumps(body, ensure_ascii=False).encode(), method="POST",
                                 headers={"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read())["data"]
    except urllib.error.HTTPError as e:
        try:
            j = json.loads(e.read())
        except Exception:
            j = {"error": f"HTTP {e.code}"}
        err = RuntimeError(j.get("error", ""))
        err.code = j.get("code")
        raise err

def php_login(uid):
    d = http("login", {"username": PASSWORDS[uid][0], "password": PASSWORDS[uid][1]})
    TOKENS[uid] = d["token"]

def php_call(uid, fn, p):
    if uid not in TOKENS:
        php_login(uid)
    try:
        return http(fn, {"p": p or {}}, TOKENS[uid])
    except RuntimeError as e:
        if getattr(e, "code", None) != "auth":
            raise
        php_login(uid)  # الجلسة اتمسحت (حذف/استرجاع/تغيير كلمة سر) — دخول تاني
        return http(fn, {"p": p or {}}, TOKENS[uid])

def sql(q):
    if PHP:
        return mysql(q)
    r = subprocess.run(["psql", "-d", os.environ.get("PGDATABASE", "app"), "-At", "-v", "ON_ERROR_STOP=1", "-c", q], capture_output=True, text=True, env=ENV)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip())
    return r.stdout.strip()

def call(uid, fn, p=None):
    if PHP:
        return php_call(uid, fn, p)
    body = json.dumps(p or {}, ensure_ascii=False).replace("$J$", "")
    q = (f"begin; set local role authenticated; select set_config('request.jwt.claim.sub', '{uid}', true); "
         f"select public.{fn}($J${body}$J$::jsonb); commit;")
    r = subprocess.run(["psql", "-d", os.environ.get("PGDATABASE", "app"), "-At", "-v", "ON_ERROR_STOP=1"], input=q, capture_output=True, text=True, env=ENV)
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

def new_user(username, full, inviter=None, invite=None):
    if PHP:
        pw = "pass-" + username + "-2026"
        if inviter:
            uid = call(inviter, "create_user", {"username": username, "password": pw, "full_name": full})["id"]
        else:
            # أول حساب بس اللي بيتعمل من غير المدير
            d = http("setup", {"username": username, "password": pw, "full_name": full})
            uid = d["user"]["id"]
            TOKENS[uid] = d["token"]
        PASSWORDS[uid] = (username, pw)
        TOKENS.pop(uid, None) if inviter else None
        return uid
    if inviter:
        invite = call(inviter, "create_invite", {"username": username})["invite"]
    inv = f',"invite":"{invite}"' if invite else ""
    return sql(f"""insert into auth.users(email, raw_user_meta_data) values ('{username}@alagamy.app',
                '{{"username":"{username}","full_name":"{full}"{inv}}}') returning id""").splitlines()[0]

