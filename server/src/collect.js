// استقبال أحداث الزوار من «بوابة» على دومين الموقع نفسه (19-20 نوفمبر): مواقع مش ووردبريس (زي app.maestrolt.com).
// الصفحة بتبعت لمسار على موقعها (/_lt/e) ← الـWorker بتاع الموقع بيضيف المكان والجهاز الحقيقيين ومفتاح البوابة ويبعتها هنا.
// المفتاح مابيظهرش في أي صفحة. بنفس منطق البلجن (class-ltp-rest.php): نفس الفلاتر والحدود وشكل الحدث، ثم processEvent.
// مفتاح البوابة لكل موقع بيتحسب من SESSION_SECRET + رقم الموقع (HMAC)، فمفيش حاجة تتخزن، ويظهر لمحمود من لوحة الإدارة.
import { eq } from './db.js';
import { json, safeEqual } from './util.js';
import { processEvent } from './events.js';
import { normalizeDomain } from './sites.js';

export const EVENTS = ['page_view', 'scroll_50', 'scroll_90', 'click', 'exit', 'consent', 'view_item', 'fp_update', 'contact_return'];
const CLICK_TYPES = ['wa', 'call', 'sms', 'email', 'msg', 'social', 'map', 'cart', 'checkout', 'form', 'button'];
const LIMIT_IP = 1000, LIMIT_SESSION = 200, LIMIT_CLICKS = 60, LIMIT_GLOBAL = 6000;

export async function gatewayKey(env, siteId) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode('gw:' + String(env.SESSION_SECRET || '')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(String(siteId))));
  return 'ltg' + [...sig].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 40);
}

// حدود الاستخدام (في ذاكرة النسخة: تقريبية لكن كافية لحماية الدفتر. الحماية الأولى حدود البوابة نفسها)
const hits = new Map();
function hit(key, max, ttlMs, now) {
  const h = hits.get(key);
  if (!h || h.until < now) { if (hits.size > 5000) hits.clear(); hits.set(key, { n: 1, until: now + ttlMs }); return true; }
  if (h.n >= max) return false;
  h.n++; return true;
}
export function resetCollectLimits() { hits.clear(); }

const str = (p, k, max) => { const v = p[k]; return (typeof v === 'string' || typeof v === 'number') ? String(v).replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, max || 200) : ''; };
const int = (p, k) => { const n = Math.floor(Number(p[k])); return Number.isFinite(n) && n > 0 ? n : 0; };
const cell = (s) => (/^[=+\-@]/.test(s) ? '’' + s : s);   // الشيت بيعتبر أي نص بيبدأ بـ = + - @ معادلة
const isBot = (ua) => !ua || /bot|crawl|spider|slurp|lighthouse|pagespeed|preview|monitoring|uptime/i.test(ua);
const isAutomation = (ua) => !ua || /headless|python|curl|wget|phantom|selenium|puppeteer|playwright|scrapy|go-http|okhttp|java\//i.test(ua);

export function uaInfo(ua) {
  const device = /iPad|Tablet/i.test(ua) ? 'تابلت' : /Mobi|Android|iPhone/i.test(ua) ? 'موبايل' : 'كمبيوتر';
  let os = 'أخرى';
  for (const [re, n] of [[/iPhone|iPad|iOS/i, 'iOS'], [/Android/i, 'Android'], [/Windows/i, 'Windows'], [/Mac OS/i, 'Mac'], [/Linux/i, 'Linux']]) if (re.test(ua)) { os = n; break; }
  let browser = 'أخرى';
  for (const [re, n] of [[/Instagram/i, 'Instagram (داخل التطبيق)'], [/FBAN|FBAV|FB_IAB/i, 'Facebook (داخل التطبيق)'], [/TikTok|BytedanceWebview/i, 'TikTok (داخل التطبيق)'], [/Snapchat/i, 'Snapchat (داخل التطبيق)'], [/SamsungBrowser/i, 'Samsung Internet'], [/Edg\//i, 'Edge'], [/OPR\/|Opera/i, 'Opera'], [/CriOS|Chrome/i, 'Chrome'], [/FxiOS|Firefox/i, 'Firefox'], [/Safari/i, 'Safari']]) if (re.test(ua)) { browser = n; break; }
  return [device, os, browser];
}

// الوقت المحلي للموقع بصيغة MySQL (زي current_time('mysql') في ووردبريس)
export function localTime(tz, d) {
  try { return new Intl.DateTimeFormat('sv-SE', { timeZone: tz || 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(d || new Date()).replace('T', ' '); }
  catch (e) { return (d || new Date()).toISOString().slice(0, 19).replace('T', ' '); }
}

const hostOf = (u) => { try { return normalizeDomain(new URL(String(u)).hostname); } catch (e) { return ''; } };

// POST /v1/collect  { site_id, gw, meta: { ip, ua, country, city, origin }, p: { …حقول المتصفح… } }
export async function handleCollect(req, env, db, ctx, fetchImpl, now) {
  now = now || Date.now();
  let body; try { body = await req.json(); } catch (e) { return json({ ok: false, error: 'bad json' }, 400); }
  if (!body || typeof body !== 'object' || !body.p || typeof body.p !== 'object') return json({ ok: false, error: 'bad json' }, 400);
  const siteId = String(body.site_id || '');
  if (!siteId || !env.SESSION_SECRET || !safeEqual(String(body.gw || ''), await gatewayKey(env, siteId))) return json({ ok: false, error: 'forbidden' }, 403);
  const client = await db.one('clients?id=' + eq(siteId) + '&select=id,name,org_id,key_hash,status,timezone,country_code,domains');
  if (!client || client.status !== 'on') return json({ ok: false, error: 'forbidden' }, 403);

  const ok = () => json({ ok: true });   // الرفض الهادئ زي البلجن: الزائر مايعرفش
  const p = body.p, meta = body.meta && typeof body.meta === 'object' ? body.meta : {};
  const event = str(p, 'event', 40);
  if (!EVENTS.includes(event)) return json({ ok: false, error: 'bad event' }, 400);

  // الطلب لازم يكون من دومين الموقع المسجّل
  const doms = (client.domains || []).map(normalizeDomain);
  const oh = hostOf(meta.origin);
  if (oh && !doms.includes(oh)) return ok();

  const ua = String(meta.ua || '').slice(0, 500);
  if (isBot(ua)) return ok();
  const hasAd = !!(str(p, 'gclid') || str(p, 'gbraid') || str(p, 'wbraid'));
  const auto = isAutomation(ua) ? 1 : 0;
  if (auto && !hasAd) return ok();

  const sid = str(p, 'sid', 20), vid = str(p, 'vid', 20);
  if (!/^[A-Za-z0-9]{6,20}$/.test(sid)) return ok();
  if (vid && !/^[A-Za-z0-9]{4,20}$/.test(vid)) return ok();
  const ct = str(p, 'ct', 10);
  if (event === 'click' && !CLICK_TYPES.includes(ct)) return ok();

  const ip = String(meta.ip || '').slice(0, 64);
  const H = 3600e3;
  if (!hit('ip:' + ip, LIMIT_IP, H, now) || !hit('s:' + sid, LIMIT_SESSION, H, now) || !hit('g:' + client.id, LIMIT_GLOBAL, H, now)) return ok();
  if (event === 'click' && !hit('c:' + sid, LIMIT_CLICKS, H, now)) return ok();
  if (!hit('d:' + sid + event + ip + ct + str(p, 'tnum', 30) + str(p, 'btn', 40) + str(p, 'bt', 80), 1, 3000, now)) return ok();   // نفس الحدث خلال 3 ثواني

  const [dev, os, br] = uaInfo(ua);
  const cr = event === 'contact_return';
  const nul = (k, max) => (p[k] === undefined || p[k] === null ? null : Math.min(max, int(p, k)));
  const payload = {
    site: client.name, site_id: client.id, home_url: meta.origin ? meta.origin.replace(/\/+$/, '') + '/' : '',
    event, time: localTime(client.timezone, new Date(now)), session_id: sid, visitor_id: vid,
    title: cell(str(p, 'title', 200)), url: str(p, 'url', 500), path: str(p, 'path', 300), page_id: 0,
    click_type: ct, btn_pos: str(p, 'btn', 40), btn_text: cell(str(p, 'bt', 80)), href: str(p, 'href', 500),
    target_num: str(p, 'tnum', 30), match_code: str(p, 'mc', 20), detect_via: str(p, 'via', 30),
    is_test: int(p, 'test') ? 1 : 0,
    fp4: str(p, 'fp4', 48).replace(/[^A-Za-z0-9_-]/g, ''), fp3: str(p, 'fp3', 48).replace(/[^A-Za-z0-9|.]/g, ''), fp2: str(p, 'fp2', 16).toLowerCase().replace(/[^a-f0-9]/g, ''),
    behavior: cell(str(p, 'bh', 120)), target_geo: '|',
    lead_level: ['primary', 'important', 'normal', 'support'].includes(str(p, 'lv', 10)) ? str(p, 'lv', 10) : '',
    product_id: 0, product_name: '', product_price: 0, category: '', currency: '',
    source: str(p, 's', 20), source_fine: str(p, 's2', 30), source_detail: str(p, 'sd', 150),
    first_source: str(p, 'fs', 30), first_source_detail: str(p, 'fsd', 150), first_source_at: str(p, 'fsat', 20),
    referrer: str(p, 'rh', 200), referrer_path: str(p, 'rp', 500), utm: str(p, 'utm', 300),
    gclid: str(p, 'gclid'), gbraid: str(p, 'gbraid'), wbraid: str(p, 'wbraid'), fbclid: str(p, 'fbclid'), msclkid: str(p, 'msclkid'), ttclid: str(p, 'ttclid'),
    landing: str(p, 'lp', 300),
    pages_count: int(p, 'pv'), seconds: int(p, 'sec'), page_seconds: int(p, 'psec'), journey: str(p, 'jr', 1000),
    scroll_depth: int(p, 'scroll'), mouse_moves: int(p, 'mm'), interactions: int(p, 'ia'),
    away_seconds: cr ? Math.min(86400, int(p, 'away')) : 0, app_opened: cr && int(p, 'opened') ? 1 : 0,
    wake_pct: cr ? nul('wake', 100) : null, beats: cr ? nul('bt', 7200) : null, beats_60: cr ? nul('bt60', 80) : null, beat_gap: cr ? nul('gap', 86400) : null,
    webdriver: int(p, 'wd') ? 1 : 0, automation: auto, page_load_ms: int(p, 'plms'), ttfb_ms: int(p, 'ttfb'),
    visit_no: int(p, 'vis'), first_visit: str(p, 'first', 20),
    device: dev, os, browser: br, screen: str(p, 'scr', 20), viewport: str(p, 'vp', 20), dpr: str(p, 'dpr', 10), lang: str(p, 'lang', 40),
    timezone: str(p, 'tz', 50), platform: str(p, 'plat', 40), cores: int(p, 'cores'), memory: int(p, 'mem'), connection: str(p, 'conn', 20),
    battery: str(p, 'bat', 10), touch: int(p, 'touch'), gpu: str(p, 'gpu', 100), cookies_on: int(p, 'ck'), dnt: int(p, 'dnt'),
    fingerprint: str(p, 'fp', 32), consent: str(p, 'consent', 20),
    country: String(meta.country || '').slice(0, 60), city: String(meta.city || '').slice(0, 120), ip, ua,
    via: 'gateway',   // وصل من بوابة الموقع (مش من بلجن)
  };
  return processEvent(env, db, ctx, fetchImpl, client, payload);
}
