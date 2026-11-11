// المكان التقريبي للزائر من الـIP (G-28). نفس سلسلة الخدمات المجانية اللي الشيت بيستخدمها: ipwho.is ← geojs.io ← ipapi.co.
// «فوري ومن غير أي تأثير سلبي» (قرار محمود 11 نوفمبر):
//   • البحث بيتعمل بعد ما السيرفر يرد على البلجن (ctx.waitUntil)، فالحدث مابيتأخرش ثانية.
//   • أي فشل (الخدمات واقعة · بطء · رد غلط) مايأثرش على الحدث: بيتسجل من غير مكان، والكرون يكمّله بعدين.
//   • كل خدمة ليها مهلة 2.5 ثانية بالكتير، والـIP المتشاف قبل كده بيتاخد من الكاش (30 يوم) من غير بحث.
//   • عناوين الشبكات الداخلية والفاضية مابتتبعتش لأي خدمة، والـIP مابيتكتبش في أي لوج.
//   • GEO_LOOKUP = "off" بيقفل الخاصية كلها من غير نشر كود.
import { eq } from './db.js';

const TTL_MS = 30 * 24 * 3600 * 1000;
const BACKFILL_WINDOW_MS = 3 * 24 * 3600 * 1000;
const clean = (s, n) => String(s == null ? '' : s).trim().slice(0, n || 80);

export const PROVIDERS = [
  { name: 'ipwho.is', url: (ip) => 'https://ipwho.is/' + encodeURIComponent(ip),
    parse: (g) => (!g || g.success === false || !g.country) ? null : { country: g.country, country_code: g.country_code, region: g.region, city: g.city, isp: (g.connection && (g.connection.isp || g.connection.org)) || '', asn: g.connection && g.connection.asn ? 'AS' + g.connection.asn : '' } },
  { name: 'geojs.io', url: (ip) => 'https://get.geojs.io/v1/ip/geo/' + encodeURIComponent(ip) + '.json',
    parse: (g) => (!g || !g.country) ? null : { country: g.country, country_code: g.country_code, region: g.region, city: g.city, isp: g.organization_name || '', asn: g.asn ? 'AS' + g.asn : '' } },
  { name: 'ipapi.co', url: (ip) => 'https://ipapi.co/' + encodeURIComponent(ip) + '/json/',
    parse: (g) => (!g || g.error || !(g.country_name || g.country)) ? null : { country: g.country_name || g.country, country_code: g.country_code || g.country, region: g.region, city: g.city, isp: g.org || '', asn: g.asn || '' } },
];

// IP عام صالح؟ (الداخلي والمحلي والفاضي مابيتبعتش لأي خدمة)
export function publicIp(ip) {
  const s = String(ip || '').trim();
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (v4) {
    const o = v4.slice(1).map(Number);
    if (o.some((x) => x > 255)) return '';
    const [a, b] = o;
    if (a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) return '';
    return s;
  }
  if (/^[0-9a-f:]{2,39}$/i.test(s) && s.includes(':')) {
    const l = s.toLowerCase();
    if (l === '::' || l === '::1' || /^f[cd]/.test(l) || /^fe[89ab]/.test(l)) return '';
    return l;
  }
  return '';
}

function norm(r, src) {
  return { country: clean(r.country, 60), country_code: clean(r.country_code, 4).toUpperCase(), region: clean(r.region, 80), city: clean(r.city, 80), isp: clean(r.isp, 120), asn: clean(r.asn, 20), src };
}

async function getJson(f, url, ms) {
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await f(url, { headers: { Accept: 'application/json', 'User-Agent': 'MaestroLT/1.0' }, signal: ctl.signal });
    if (res.status !== 200) return null;
    return await res.json().catch(() => null);
  } finally { clearTimeout(timer); }
}

export async function lookupIp(env, ip, fetchImpl) {
  const f = fetchImpl || ((...a) => fetch(...a));
  const ms = Number(env.GEO_TIMEOUT_MS) > 0 ? Number(env.GEO_TIMEOUT_MS) : 2500;
  for (const p of PROVIDERS) {
    try {
      const r = p.parse(await getJson(f, p.url(ip), ms));
      if (r && r.country) return norm(r, p.name);
    } catch (e) { /* الخدمة دي فشلت أو اتأخرت: اللي بعدها */ }
  }
  return null;
}

// من الكاش لو حديث، وإلا بحث + حفظ في الكاش. null لو كل الخدمات فشلت.
export async function geoFor(env, db, ip, fetchImpl) {
  const hit = await db.one('ip_geo?ip=eq.' + encodeURIComponent(ip) + '&select=country,country_code,region,city,isp,asn,src,looked_up_at');
  if (hit && Date.parse(hit.looked_up_at) > Date.now() - TTL_MS) {
    const { looked_up_at, ...geo } = hit; void looked_up_at;
    return geo;
  }
  const geo = await lookupIp(env, ip, fetchImpl);
  if (!geo) return null;
  await db.insert('ip_geo', [Object.assign({ ip, looked_up_at: new Date().toISOString() }, geo)], { merge: true, onConflict: 'ip', returning: false });
  return geo;
}

// حدث واحد: بيحط المكان على صف raw_events. مابيرميش أي خطأ أبداً.
export async function enrichEvent(env, db, rowId, ip, fetchImpl) {
  if (String(env.GEO_LOOKUP || '').toLowerCase() === 'off') return { skipped: 'off' };
  try {
    const pub = publicIp(ip);
    if (!pub) { await db.update('raw_events?id=' + eq(rowId), { geo: { src: 'none' } }); return { skipped: 'ip' }; }
    const geo = await geoFor(env, db, pub, fetchImpl);
    if (!geo) return { failed: true };                       // الكرون يكمّله
    await db.update('raw_events?id=' + eq(rowId), { geo });
    return { ok: true };
  } catch (e) {
    console.error('geo: ' + String(e && e.message || e).replace(/\d{1,3}(\.\d{1,3}){3}|[0-9a-f]{1,4}(:[0-9a-f]{0,4}){2,7}/gi, '<ip>').slice(0, 120));
    return { failed: true };
  }
}

// الكرون: الأحداث (زيارات وضغطات) اللي ملهاش مكان من آخر 3 أيام، دفعة صغيرة كل 5 دقايق
export async function geoBackfill(env, db, fetchImpl, limit) {
  if (String(env.GEO_LOOKUP || '').toLowerCase() === 'off') return { skipped: 'off' };
  const since = new Date(Date.now() - BACKFILL_WINDOW_MS).toISOString();
  const rows = (await db.select('raw_events?geo=is.null&event=in.(page_view,click)&received_at=gte.' + encodeURIComponent(since) + '&select=id,payload&order=received_at.desc&limit=' + (limit || 20))) || [];
  let filled = 0, failed = 0;
  for (const r of rows) {
    const out = await enrichEvent(env, db, r.id, r.payload && r.payload.ip, fetchImpl);
    if (out.ok || out.skipped) filled++; else failed++;
  }
  return { checked: rows.length, filled, failed };
}
