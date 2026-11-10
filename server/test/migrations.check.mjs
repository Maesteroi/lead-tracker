// فحص الـmigrations على Postgres حقيقي (PGlite، من غير إنترنت ولا Supabase): بيشغّل 0001→0004 بالترتيب مرتين (لازم تنجح الاتنين: idempotent)،
// ويتأكد إن كل جدول عليه RLS، وإن الأعمدة اللي الكود بيستخدمها موجودة، وإن القيود بتشتغل (google_sub مكرر · دور غلط · كود ربط مكرر · الحذف بيمسح العضويات).
// مش في الفحص الآلي (محتاج تنصيب): cd server && npm i --no-save @electric-sql/pglite@0.2.17 && node test/migrations.check.mjs
// بيحاكي بس الأدوار وسكيما storage اللي Supabase بيوفّرهم، وبيشيل سطر create extension pgcrypto (PGlite مافيهوش).
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
const dir = new URL('../supabase/migrations/', import.meta.url).pathname;
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const db = new PGlite();
// أدوار Supabase اللي الملفات بتشير لها
await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin;`).catch((e) => console.log('roles:', e.message));
await db.exec(`create schema if not exists storage; create table if not exists storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);`);
for (const f of files) {
  try { await db.exec(fs.readFileSync(dir + f, 'utf8').replace(/create extension[^;]*pgcrypto[^;]*;/gi, '')); console.log('OK   ', f); } catch (e) { console.log('FAIL ', f, '→', e.message); process.exitCode = 1; }
}
console.log('--- second run (idempotency) ---');
for (const f of files) {
  try { await db.exec(fs.readFileSync(dir + f, 'utf8').replace(/create extension[^;]*pgcrypto[^;]*;/gi, '')); console.log('OK   ', f); } catch (e) { console.log('FAIL ', f, '→', e.message); process.exitCode = 1; }
}
const rls = await db.query(`select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by 1`);
console.log('tables:', rls.rows.length, '| without RLS:', rls.rows.filter((r) => !r.relrowsecurity).map((r) => r.relname).join(',') || 'none');
// أعمدة اللي الكود بيستخدمها
const need = { users: ['id','google_sub','email','name','locale','last_login_at'], organizations: ['id','name','type','status','trial_ends_at'], memberships: ['user_id','org_id','role','site_ids'], sessions: ['id','user_id','token_hash','csrf_token','user_agent','expires_at','last_seen_at'], auth_events: ['id','user_id','kind','ok','reason','at'], clients: ['id','name','key_hash','status','org_id','domains','paired_at','timezone','country_code','created_at'], site_pair_codes: ['id','site_id','code_hash','created_by','expires_at','used_at','attempts'] };
for (const [t, cols] of Object.entries(need)) {
  const r = await db.query(`select column_name from information_schema.columns where table_schema='public' and table_name=$1`, [t]);
  const have = new Set(r.rows.map((x) => x.column_name)); const miss = cols.filter((c) => !have.has(c));
  console.log(t.padEnd(18), miss.length ? 'MISSING ' + miss.join(',') : 'ok');
}
try {
// السلوك: عمل مستخدم + حساب + عضوية + موقع + كود ربط + تصادم
await db.exec(`insert into users(google_sub,email) values ('s1','a@b.com');`);
await db.exec(`insert into organizations(name) values ('o');`);
const u = (await db.query('select id from users')).rows[0].id, o = (await db.query('select id from organizations')).rows[0].id;
await db.query(`insert into memberships(user_id,org_id,role) values ($1,$2,'owner')`, [u, o]);
await db.query(`insert into clients(id,name,key_hash,org_id,domains) values ('Site1234567','x','h',$1,'{rawda.site}')`, [o]);
const cs = await db.query(`select id from clients where domains @> '{rawda.site}'`); console.log('domains contains query:', cs.rows.length === 1 ? 'ok' : 'BAD');
await db.query(`insert into site_pair_codes(site_id,code_hash,created_by,expires_at) values ('Site1234567','h1',$1, now()+interval '15 min')`, [u]);
for (const [name, sql] of [['duplicate google_sub', `insert into users(google_sub,email) values ('s1','c@d.com')`], ['bad role', `insert into memberships(user_id,org_id,role) values ('${u}','${o}','god')`], ['duplicate code hash', `insert into site_pair_codes(site_id,code_hash,expires_at) values ('Site1234567','h1', now())`]]) {
  try { await db.exec(sql); console.log('NOT REJECTED:', name); process.exitCode = 1; } catch (e) { console.log('rejected ok:', name); }
}
try { await db.exec(`delete from users`); } catch (e) { console.log('delete users:', e.message); } const cnt = (await db.query('select count(*)::int n from memberships')).rows[0].n; console.log('cascade memberships after user delete:', cnt);

} catch (e) { console.log('BEHAVIOUR CHECK FAILED:', e.message); process.exitCode = 1; }
