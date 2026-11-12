// تسجيل الزيارة كفيديو (rrweb) — محمود 11 نوفمبر: «اعمل rrweb… واعمل supabase… مش عايز نسخة بالظبط من ClickBan عايز أفضل».
// الفرق عن ClickBan: إحنا بنعيد الصفحة الحقيقية بتاعة موقع العميل والزائر بيتحرك فيها، مش نقطة على مربع رمادي.
//
// الطريق: متصفح الزائر ← POST /v1/replay على طول (مش عن طريق ووردبريس العميل، علشان مانتقّلش عليه).
//   • الإذن: ووردبريس بيدّي المتصفح تذكرة قصيرة للجلسة دي بس: «الموقع.الجلسة.الانتهاء.التوقيع»،
//     والتوقيع HMAC-SHA256 بمفتاح = بصمة مفتاح الموقع (sha256)، اللي السيرفر عنده (key_hash). المفتاح نفسه مابيطلعش من ووردبريس.
//   • ومعاها: الطلب لازم يكون جاي من دومين الموقع نفسه (Origin).
//   • أول طلب «start»: السيرفر بيقول يسجّل ولا لأ (الحساب مقفول له التسجيل · حد اليوم · الإيقاف العام) وبالحدود.
//   • القطع بتتخزن مضغوطة (gzip) في Supabase Storage (حاوية replays خاصة)، وبتتمسح بعد 30 يوم.
//   • REPLAY = "off" بيقفله كله من غير نشر.
// الخصوصية (في البلجن): زوار الإعلان بس · كل خانات الكتابة متخبية · صفحات الدفع والحساب مابتتسجلش.
import { json, safeEqual } from './util.js';
import { eq } from './db.js';

export const BUCKET = 'replays';
export const LIMITS = { chunk: 2 * 1024 * 1024, session: 8 * 1024 * 1024, minutes: 15, perDay: 3000, keepDays: 30 };
const SITE_RE = /^[A-Za-z0-9]{6,20}$/;
const SID_RE = /^[A-Za-z0-9_-]{4,64}$/;
const enc = new TextEncoder();

// CORS مفتوح للمواقع (من غير كوكيز): الإذن بالتذكرة والـOrigin، مش بالكوكي
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Max-Age': '86400' };
const out = (obj, status) => { const r = json(obj, status); for (const k of Object.keys(CORS)) r.headers.set(k, CORS[k]); r.headers.set('Cache-Control', 'no-store'); return r; };
export const replayPreflight = () => new Response(null, { status: 204, headers: CORS });

async function hmacHex(key, msg) {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, enc.encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
// نفس اللي البلجن بيعمله (class-ltp-replay.php)
export async function replayToken(keyHash, site, sid, exp) { return site + '.' + sid + '.' + exp + '.' + (await hmacHex(keyHash, 'replay|' + site + '|' + sid + '|' + exp)); }

export function originAllowed(origin, domains) {
  let host = '';
  try { host = new URL(String(origin || '')).hostname.toLowerCase(); } catch (e) { return false; }
  if (!host) return false;
  const h = host.replace(/^www\./, '');
  return (domains || []).some((d) => { d = String(d || '').toLowerCase().replace(/^www\./, ''); return d && (h === d || h.endsWith('.' + d)); });
}

async function checkTicket(db, t, now) {
  const m = /^([A-Za-z0-9]{6,20})\.([A-Za-z0-9_-]{4,64})\.(\d{10})\.([a-f0-9]{64})$/.exec(String(t || ''));
  if (!m) return null;
  const [, site, sid, expS, sig] = m;
  const exp = Number(expS);
  if (exp * 1000 < now || exp * 1000 > now + 3 * 3600e3) return null;           // منتهية، أو مدتها أطول من المسموح
  const c = await db.one('clients?id=' + eq(site) + '&select=id,key_hash,org_id,status,domains');
  if (!c || !c.key_hash || !c.org_id || c.status === 'off') return null;
  const good = await hmacHex(c.key_hash, 'replay|' + site + '|' + sid + '|' + exp);
  return safeEqual(good, sig) ? { client: c, sid, exp } : null;
}

const dayOf = (iso) => String(iso || new Date().toISOString()).slice(0, 10);
const pathOf = (site, day, sid, seq) => site + '/' + day + '/' + sid + '/' + String(seq).padStart(4, '0') + '.json.gz';

async function gzip(text) {
  const cs = new CompressionStream('gzip');
  const w = cs.writable.getWriter(); w.write(enc.encode(text)); w.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}
async function gunzip(buf) {
  const ds = new DecompressionStream('gzip');
  const w = ds.writable.getWriter(); w.write(new Uint8Array(buf)); w.close();
  return new Response(ds.readable).text();
}

// POST /v1/replay — من متصفح الزائر. أي رفض = {ok:false, rec:false} والبلجن بيوقف التسجيل بهدوء (مفيش أي تأثير على الموقع)
export async function handleReplay(req, env, db) {
  const no = (why, status) => out({ ok: false, rec: false, error: why }, status || 200);
  if (String(env.REPLAY || '').toLowerCase() === 'off') return no('off');
  const len = Number(req.headers.get('content-length') || 0);
  if (len > LIMITS.chunk + 4096) return no('too_big', 413);
  const text = await req.text();
  if (text.length > LIMITS.chunk + 4096) return no('too_big', 413);
  let b; try { b = JSON.parse(text); } catch (e) { return no('json', 400); }
  if (!b || typeof b !== 'object') return no('json', 400);
  const now = Date.now();
  const tk = await checkTicket(db, b.t, now);
  if (!tk) return no('ticket', 403);
  if (!originAllowed(req.headers.get('origin'), tk.client.domains)) return no('origin', 403);
  const site = tk.client.id, sid = tk.sid;

  // البداية: يسجّل ولا لأ؟
  if (b.start) {
    const org = await db.one('organizations?id=' + eq(tk.client.org_id) + '&select=replay,status');
    if (!org || org.replay === false || org.status === 'off') return no('disabled');
    const today = new Date(now).toISOString().slice(0, 10);
    const over = await db.select('replay_sessions?client_id=' + eq(site) + '&started_at=gte.' + today + 'T00:00:00Z&select=session_id&order=started_at.asc&limit=1&offset=' + LIMITS.perDay).catch(() => []);
    if (over && over.length) return no('daily_cap');
    return out({ ok: true, rec: true, max_kb: Math.floor(LIMITS.session / 1024), max_min: LIMITS.minutes, chunk_kb: Math.floor(LIMITS.chunk / 1024) });
  }

  const seq = Number(b.seq);
  if (!Number.isInteger(seq) || seq < 0 || seq > 199) return no('seq', 400);
  if (!Array.isArray(b.ev) || !b.ev.length || b.ev.length > 20000) return no('events', 400);
  const body = JSON.stringify(b.ev);
  const rows = await db.req('POST', 'rpc/replay_add', { p_site: site, p_sid: sid, p_seq: seq, p_bytes: body.length, p_max_bytes: LIMITS.session });
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row || !row.started_at) return no('session_full');
  if (Date.parse(row.started_at) < now - (LIMITS.minutes + 5) * 60e3) return no('too_long');
  await db.putObject(BUCKET, pathOf(site, dayOf(row.started_at), sid, seq), await gzip(body), 'application/gzip');
  return out({ ok: true, rec: true, seq });
}

// اللوحة: كل قطع الزيارة بالترتيب، أحداث rrweb جاهزة للمشغّل (dash.js بيتأكد من الصلاحية وبيضيف بيانات الزيارة)
export async function loadReplay(db, siteId, sid) {
  if (!SID_RE.test(String(sid || ''))) return null;
  const row = await db.one('replay_sessions?client_id=' + eq(siteId) + '&session_id=' + eq(sid) + '&select=started_at,last_at,chunks,max_seq,bytes');
  if (!row) return null;
  const day = dayOf(row.started_at), parts = [];
  for (let i = 0; i <= Math.min(row.max_seq, 199); i++) parts.push(i);
  const chunks = await Promise.all(parts.map((i) => db.getObject(BUCKET, pathOf(siteId, day, sid, i)).then(gunzip).then((t) => JSON.parse(t)).catch(() => null)));
  const events = [];
  for (const c of chunks) if (Array.isArray(c)) for (const e of c) events.push(e);
  events.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  return { started_at: row.started_at, last_at: row.last_at, bytes: Number(row.bytes) || 0, events };
}

// الزيارات اللي ليها تسجيل في الفترة (علشان زرار «▶ شوف الزيارة»)
export async function replaySet(db, siteId, sinceIso) {
  const rows = await db.select('replay_sessions?client_id=' + eq(siteId) + '&last_at=gte.' + encodeURIComponent(sinceIso) + '&select=session_id&limit=2000').catch(() => []);
  return new Set((rows || []).map((r) => r.session_id));
}

// الكرون: التسجيلات الأقدم من 30 يوم بتتمسح (الملفات والسطر)
export async function cleanupReplays(db) {
  const old = await db.select('replay_sessions?started_at=lt.' + encodeURIComponent(new Date(Date.now() - LIMITS.keepDays * 864e5).toISOString()) + '&select=client_id,session_id,started_at,max_seq&limit=50').catch(() => []);
  let n = 0;
  for (const r of old || []) {
    const paths = [];
    for (let i = 0; i <= Math.min(Number(r.max_seq) || 0, 199); i++) paths.push(pathOf(r.client_id, dayOf(r.started_at), r.session_id, i));
    const ok = await db.deleteObjects(BUCKET, paths).catch(() => false);
    if (!ok) continue;
    await db.req('DELETE', 'replay_sessions?client_id=' + eq(r.client_id) + '&session_id=' + eq(r.session_id));
    n++;
  }
  return { deleted: n };
}
