// تقرير النقرات اليومي من السيرفر (15 نوفمبر). كان في الشيت (apps-script/click-gap.js)، والشيت بقى مابيشوفش الزيارات
// من ساعة ما المواقع اتنقلت على السيرفر، فكان بيكتب «وصلت للموقع 0%». هنا الضغطات (ads_clicks) والزيارات (raw_events) الاتنين على السيرفر.
// لكل موقع مربوط بجوجل أدز: بعد ما يوم أمس يتسحب (last_ok_day) ← رسالة واحدة لمحمود (TG_CHAT_ID)، مرة واحدة في اليوم (daily_reports).
import { eq } from './db.js';
import { tg } from './notify.js';
import { escHtml as esc } from './telegram.js';
import { riyadhDay } from './health.js';
import { scoredSessions } from './dash.js';
import { targetCountries } from './score.js';

const CALL = new Set(['CALLS', 'MOBILE_CALL_TRACKING', 'CALL_TRACKING', 'LOCATION_FORMAT_CALL']);
const MAP = new Set(['GET_DIRECTIONS', 'LOCATION_EXPANSION', 'LOCATION_FORMAT_DIRECTIONS', 'LOCATION_FORMAT_MAP', 'LOCATION_FORMAT_STORE_INFO', 'LOCATION_FORMAT_TEXT', 'LOCATION_FORMAT_IMAGE']);
const kind = (t) => (CALL.has(String(t || '').toUpperCase()) ? 'call' : MAP.has(String(t || '').toUpperCase()) ? 'map' : 'site');
const MIN_ARRIVAL = 85;
const MATCH_AR = { EXACT: 'مطابقة تامة', PHRASE: 'مطابقة عبارة', BROAD: 'مطابقة واسعة' };
const addDay = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);

// أرقام يوم واحد لموقع واحد (بتتختبر لوحدها)
export async function clicksDay(db, site, cred, day) {
  const range = 'client_id=' + eq(site.id) + '&customer_id=' + eq(cred.customer_id) + '&day=eq.' + day;
  const [clicks, camp] = await Promise.all([
    db.select('ads_clicks?' + range + '&select=gclid,click_type,keyword,match_type,presence_country,presence_city,presence_most_specific&limit=20000'),
    db.select('ads_campaign_daily?' + range + '&select=clicks,invalid_clicks&limit=500'),
  ]);
  const list = clicks || [];
  const board = (camp || []).reduce((a, r) => a + (Number(r.clicks) || 0), 0), invalid = (camp || []).reduce((a, r) => a + (Number(r.invalid_clicks) || 0), 0);
  // الزيارات اللي معاها gclid حوالين اليوم ← الجلسة ← حالتها وتواصلها ونتيجته
  const since = new Date(Date.parse(addDay(day, -1) + 'T00:00:00Z')).toISOString();
  const evs = (await db.select('raw_events?client_id=' + eq(site.id) + '&gclid=not.is.null&received_at=gte.' + encodeURIComponent(since) + '&received_at=lt.' + encodeURIComponent(new Date(Date.parse(addDay(day, 2) + 'T00:00:00Z')).toISOString()) + '&select=gclid,session_id&limit=20000')) || [];
  const sessByG = new Map(); for (const e of evs) if (!sessByG.has(e.gclid)) sessByG.set(e.gclid, e.session_id);
  const sessions = await scoredSessions(db, site.id, since, 3000, 'ar').catch(() => []);
  const sById = new Map(sessions.map((s) => [s.session_id, s]));
  const leads = ((await db.req('POST', 'rpc/dash_leads', { p_site: site.id, p_since: since }).catch(() => [])) || []);
  const lBySess = new Map(); for (const l of leads) if (l.session_id) { const x = lBySess.get(l.session_id) || { won: false }; if (l.outcome === 'تم') x.won = true; lBySess.set(l.session_id, x); }
  // الاستهداف: بلاد الموقع من البلجن، وأسماء أماكن جوجل
  const targets = [...new Set(sessions.flatMap((s) => targetCountries(s.target_geo)))];
  const geoIds = [...new Set(list.flatMap((c) => [c.presence_country, c.presence_city, c.presence_most_specific]).filter(Boolean))];
  const geo = new Map();
  for (let i = 0; i < geoIds.length; i += 150) for (const g of (await db.select('geo_targets?id=in.(' + geoIds.slice(i, i + 150).join(',') + ')&select=id,name,country_code').catch(() => [])) || []) geo.set(String(g.id), g);
  const out = { board, invalid, total: list.length, call: 0, map: 0, site: 0, reached: 0, bad: 0, contacted: 0, won: 0, outside: 0, outsidePlaces: new Map(), cities: new Map(), keywords: new Map(), targets };
  for (const c of list) {
    const k = kind(c.click_type); out[k]++;
    const sid = sessByG.get(c.gclid), s = sid ? sById.get(sid) : null, l = sid ? lBySess.get(sid) : null;
    if (k === 'site' && sid) out.reached++;
    if (s && s.status && s.status !== 'real') out.bad++;
    if (l) out.contacted++; if (l && l.won) out.won++;
    const country = geo.get(String(c.presence_country)), place = geo.get(String(c.presence_city || c.presence_most_specific));
    const pname = (place && place.name) || (country && country.name) || '';
    if (pname) out.cities.set(pname, (out.cities.get(pname) || 0) + 1);
    if (targets.length && country && country.country_code && !targets.includes(String(country.country_code).toUpperCase())) {
      out.outside++; const n = pname + (country.name && pname !== country.name ? ' (' + country.name + ')' : ''); out.outsidePlaces.set(n, (out.outsidePlaces.get(n) || 0) + 1);
    }
    const kk = (c.keyword || '—') + '|' + (c.match_type || '');
    const x = out.keywords.get(kk) || { kw: c.keyword || '—', match: c.match_type || '', clicks: 0, reached: 0, bad: 0, contacted: 0, won: 0 };
    x.clicks++; if (sid) x.reached++; if (s && s.status && s.status !== 'real') x.bad++; if (l) x.contacted++; if (l && l.won) x.won++;
    out.keywords.set(kk, x);
  }
  out.arrival = out.site ? Math.round((out.reached / out.site) * 100) : null;
  return out;
}

export function clicksText(name, day, d) {
  const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => esc(k) + ' ' + v).join(' · ');
  const L = ['📊 <b>' + esc(name) + '</b> — نقرات ' + day + ' (من الخادم)'];
  L.push('نقرات جوجل: ' + d.total + ' (لوحة جوجل: ' + d.board + ' · استبعدها جوجل: ' + d.invalid + ')');
  if (d.call || d.map) L.push('لا تفتح الموقع: اتصال من الإعلان ' + d.call + ' · خرائط ' + d.map + ' ← نقرات للموقع: ' + d.site);
  L.push('وصلت إلى الموقع: ' + d.reached + ' من ' + d.site + (d.arrival == null ? '' : ' (' + d.arrival + '%)') + ' · الفجوة: ' + (d.site - d.reached));
  if (d.arrival != null && d.arrival < MIN_ARRIVAL) L.push('⚠️ أقل من حد الجودة (' + MIN_ARRIVAL + '%): نقرات لا تفتح الصفحة (خروج سريع أو آلية)، أو زيارات يفوّتها التتبع. للمراجعة قبل أي استنتاج.');
  L.push('مشبوهة من الواصلين: ' + d.bad + ' · تواصلوا: ' + d.contacted + ' · تم الاتفاق: ' + d.won);
  if (d.targets.length) L.push('خارج الاستهداف حسب جوجل: ' + d.outside + (d.outside ? ' (' + top(d.outsidePlaces, 5) + ')' : ''));
  if (d.cities.size) L.push('الأماكن (جوجل): ' + top(d.cities, 5));
  const kws = [...d.keywords.values()].sort((a, b) => b.clicks - a.clicks).slice(0, 5);
  if (kws.length) {
    L.push('أعلى الكلمات (نقرات · وصلت · مشبوهة · تواصل · اتفاق):');
    for (const k of kws) L.push('• ' + esc(k.kw) + (MATCH_AR[k.match] ? ' (' + MATCH_AR[k.match] + ')' : '') + ': ' + [k.clicks, k.reached, k.bad, k.contacted, k.won].join(' · '));
  }
  return L.join('\n');
}

// الكرون: لكل موقع مربوط، بعد ما يوم أمس يتسحب، مرة واحدة
export async function dailyClicksReports(env, db, fetchImpl, nowMs) {
  if (!env.TG_TOKEN || !env.TG_CHAT_ID || String(env.TG_ALERTS || '').toLowerCase() === 'off') return { skipped: 'off' };
  const day = riyadhDay((nowMs || Date.now()) - 864e5);
  const creds = (await db.select('ads_credentials?status=eq.on&last_ok_day=gte.' + day + '&select=client_id,customer_id,last_ok_day')) || [];
  let sent = 0;
  for (const cred of creds) {
    const kindKey = 'clicks:' + cred.client_id;
    if (await db.one('daily_reports?kind=' + eq(kindKey) + '&day=eq.' + day + '&select=day')) continue;
    const claim = await db.insert('daily_reports', [{ kind: kindKey, day }], { ignoreDuplicates: true, onConflict: 'kind,day' });
    if (!claim || !claim[0]) continue;
    const site = await db.one('clients?id=' + eq(cred.client_id) + '&select=id,name');
    if (!site) continue;
    const d = await clicksDay(db, site, cred, day);
    const r = await tg(env, 'sendMessage', { chat_id: String(env.TG_CHAT_ID), text: clicksText(site.name || site.id, day, d), parse_mode: 'HTML', disable_web_page_preview: true }, fetchImpl);
    if (!r.ok) { await db.req('DELETE', 'daily_reports?kind=' + eq(kindKey) + '&day=eq.' + day); continue; }
    sent++;
  }
  return { sent };
}
