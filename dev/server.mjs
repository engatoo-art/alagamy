// سيرفر التجربة المحلية: بيعرض البرنامج وبيكلم Postgres المحلي بدل Supabase
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../docs');
const ENV = { ...process.env, PGHOST: '/tmp', PGPORT: '5544', PGUSER: 'postgres', PGDATABASE: 'app' };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };

function psql(sql) {
  return new Promise((resolve, reject) => {
    const p = execFile('psql', ['-At', '-v', 'ON_ERROR_STOP=1'], { env: ENV, maxBuffer: 50e6 }, (e, out, errOut) => {
      if (e) {
        const line = errOut.split('\n').find((l) => l.includes('ERROR')) || errOut;
        return reject(new Error(line.replace(/^.*ERROR:\s*/, '').trim()));
      }
      resolve(out.split('\n').filter((l) => l && !['BEGIN', 'COMMIT', 'SET'].includes(l)));
    });
    p.stdin.end(sql);
  });
}
const lit = (s) => '$Q$' + String(s).replaceAll('$Q$', '') + '$Q$';

async function rpc(fn, uid, p) {
  if (!/^[a-z_]+$/.test(fn)) throw new Error('bad fn');
  const out = await psql(`begin; set local role authenticated;
    select set_config('request.jwt.claim.sub', ${lit(uid || '')}, true);
    select public.${fn}(${lit(JSON.stringify(p || {}))}::jsonb); commit;`);
  return JSON.parse(out[out.length - 1] || 'null');
}

const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };

http.createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url.startsWith('/dev/')) {
      let body = ''; for await (const c of req) body += c;
      const j = JSON.parse(body || '{}');
      if (req.url === '/dev/login') {
        const r = await psql(`select id from auth.users where email = ${lit(j.username + '@alagamy.app')}`);
        if (!r.length) return send(res, 400, { error: 'اسم المستخدم أو كلمة المرور غلط' });
        return send(res, 200, { uid: r[0] });
      }
      if (req.url === '/dev/register') {
        const r = await psql(`insert into auth.users(email, raw_user_meta_data) values (${lit(j.username + '@alagamy.app')},
          ${lit(JSON.stringify({ username: j.username, full_name: j.full_name }))}::jsonb) returning id`);
        return send(res, 200, { uid: r[0] });
      }
      const fn = req.url.replace('/dev/rpc/', '');
      return send(res, 200, { data: await rpc(fn, j.uid, j.p) });
    }
    let f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (f.endsWith('/')) f += 'index.html';
    if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  } catch (e) {
    send(res, 400, { error: e.message });
  }
}).listen(8090, () => console.log('http://localhost:8090'));
