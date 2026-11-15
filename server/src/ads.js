// جوجل أدز على السيرفر (S02): سحب يومي لكل حساب مربوط (قراية بس) + تنبيهات لمحمود + عداد عمليات الـAPI.
// مقفول افتراضياً: مابيشتغلش غير لما ADS_PULL_ENABLED = "1" والأسرار كلها متحطة.
// كل نبضة (كل 5 دقايق) بتسحب يوم واحد لحساب واحد بس، علشان الشغل يفضل صغير ومحدود:
//   امبارح الأول (ومعاه صحة الحساب والتنبيهات)، وبعده الأيام الناقصة من الأحدث للأقدم (خط الأساس).
import { eq } from './db.js';
import { json, tzOffsetMinutes } from './util.js';
import { sealToken, openToken, tokenKeyReady } from './crypto.js';
import { accessToken, adsClient, Q, geoId } from './gads.js';
import { sendTelegram, telegramReady, escHtml } from './telegram.js';
import { ACTION_NAME as WON_ACTION, REAL_ACTION_NAME as REAL_ACTION } from './convupload.js';

const RETRY_DAYS = 7;        // الأيام اللي فاتت بترجع تتسحب لوحدها لو ناقصة
const MAX_ATTEMPTS = 3;      // محاولات اليوم الواحد في 24 ساعة
const CLICK_VIEW_DAYS = 90;  // حد جوجل لـclick_view
const MAX_BACKFILL = 400;
const CHUNK = 500;

export function adsEnabled(env) {
  return env.ADS_PULL_ENABLED === '1' && tokenKeyReady(env) && !!env.GOOGLE_CLIENT_ID && !!env.GOOGLE_CLIENT_SECRET;
}

// ── التواريخ ──
export const addDays = (day, n) => new Date(Date.parse(day + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);

// آخر يوم «خلص» في توقيت الحساب: امبارح من بعد 3 الفجر، وقبلها أول امبارح
export function readyDay(now, tz) {
  const local = new Date(now.getTime() + tzOffsetMinutes(tz || 'Asia/Riyadh', now) * 60000);
  return addDays(local.toISOString().slice(0, 10), local.getUTCHours() >= 3 ? -1 : -2);
}

// ── عداد العمليات: آخر 24 ساعة على مشروع Cloud كله (السيرفر + Apps Script) ──
export async function usage24h(db, now) {
  const since = new Date(now.getTime() - 24 * 3600000).toISOString();
  const rows = (await db.select('ads_pull_runs?at=gte.' + encodeURIComponent(since) + '&select=source,operations&limit=5000')) || [];
  const out = { server: 0, apps_script: 0, total: 0 };
  for (const r of rows) {
    if (r.source !== 'server' && r.source !== 'apps_script') continue;
    out[r.source] += Number(r.operations) || 0;
    out.total += Number(r.operations) || 0;
  }
  return out;
}

const scrub = (msg, secrets) => secrets.reduce((m, s) => (s ? m.split(s).join('[…]') : m), String(msg || '')).slice(0, 300);

let lastInfraAlert = 0;   // تنبيه عطل البنية (جدول ناقص مثلاً): مرة في الساعة بالكتير لكل نسخة شغالة

// ── النبضة ──
export async function adsTick(env, db, opts) {
  opts = opts || {};
  if (!adsEnabled(env)) return { skipped: 'off' };
  const now = opts.now || new Date();
  try {
    const limit = Number(env.ADS_DAILY_LIMIT) || 15000;
    const usage = await usage24h(db, now);
    if (usage.total >= limit * 0.9) {
      await quotaStop(env, db, now, usage, limit, opts.fetchImpl);
      return { skipped: 'quota', usage: usage.total };
    }
    const creds = (await db.select('ads_credentials?status=eq.on&order=last_pull_at.asc.nullsfirst&limit=200')) || [];
    for (const cred of creds) {
      const job = await nextDay(db, cred, now);
      if (job) return await pullDay(env, db, cred, job, { now, fetchImpl: opts.fetchImpl, usage, limit });
    }
    return { idle: true, accounts: creds.length };
  } catch (e) {
    const msg = String(e && e.message || e).slice(0, 200);
    console.error('ads tick: ' + msg);
    if (now.getTime() - lastInfraAlert > 3600000) {
      lastInfraAlert = now.getTime();
      await sendTelegram(env, '⚠️ <b>سحب جوجل أدز واقف</b>\n' + escHtml(msg), opts.fetchImpl);
    }
    return { error: msg };
  }
}

async function quotaStop(env, db, now, usage, limit, fetchImpl) {
  const since = new Date(now.getTime() - 24 * 3600000).toISOString();
  const sent = await db.one('ads_pull_runs?source=eq.quota_alert&at=gte.' + encodeURIComponent(since) + '&select=id');
  if (sent) return;
  const ok = await sendTelegram(env, '🛑 <b>توقّف سحب بيانات جوجل أدز مؤقتًا</b>\nاستهلاك الـAPI ' + usage.total + ' من ' + limit + ' في آخر 24 ساعة (الخادم ' + usage.server + ' · الجدول ' + usage.apps_script + '). سيُستأنف تلقائيًا عندما ينخفض الاستهلاك.', fetchImpl);
  await db.insert('ads_pull_runs', [{ source: 'quota_alert', ok, operations: 0, error: 'quota ' + usage.total + '/' + limit, at: now.toISOString() }], { returning: false });
}

// اليوم الجاي المطلوب لحساب: الأحدث الأول. اليوم اللي فشل 3 مرات في آخر 24 ساعة بيستنى.
export async function nextDay(db, cred, now) {
  const ready = readyDay(now, cred.timezone);
  let start = addDays(ready, -(RETRY_DAYS - 1));
  if (cred.backfill_from && cred.backfill_from < start) start = cred.backfill_from;
  const floor = addDays(ready, -MAX_BACKFILL);
  if (start < floor) start = floor;
  const runs = (await db.select('ads_pull_runs?client_id=' + eq(cred.client_id) + '&customer_id=' + eq(cred.customer_id) +
    '&source=eq.server&day=gte.' + start + '&select=day,ok,at&limit=5000')) || [];
  const done = new Set(); const fails = {};
  const dayAgo = now.getTime() - 24 * 3600000;
  for (const r of runs) {
    if (r.ok) done.add(r.day);
    else if (Date.parse(r.at) >= dayAgo) fails[r.day] = (fails[r.day] || 0) + 1;
  }
  for (let d = ready; d >= start; d = addDays(d, -1)) {
    if (done.has(d) || (fails[d] || 0) >= MAX_ATTEMPTS) continue;
    return { day: d, latest: d === ready, attempt: (fails[d] || 0) + 1 };
  }
  return null;
}

const num = (x) => Number(x) || 0;

async function upsert(db, table, rows, onConflict) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db.insert(table, rows.slice(i, i + CHUNK), { merge: true, onConflict, returning: false });
  }
}

// ── سحب يوم واحد لحساب واحد ──
async function pullDay(env, db, cred, job, ctx) {
  const { now, fetchImpl } = ctx;
  const client = await db.one('clients?id=' + eq(cred.client_id) + '&select=id,name');
  const name = client ? client.name : cred.client_id;
  const only = Array.isArray(cred.campaign_ids) && cred.campaign_ids.length ? new Set(cred.campaign_ids.map(String)) : null;
  const keep = (r) => !only || only.has(String((r.campaign || {}).id));
  const base = { client_id: cred.client_id, customer_id: cred.customer_id, day: job.day };
  const pulled_at = now.toISOString();
  const secrets = [];
  const counts = {};
  let api = null;

  try {
    const refresh = await openToken(env, cred.refresh_token_enc, cred.client_id + ':' + cred.customer_id);
    secrets.push(refresh);
    const access = await accessToken(env, refresh, fetchImpl);
    secrets.push(access);
    api = adsClient({ env, access, customerId: cred.customer_id, loginCustomerId: cred.login_customer_id, fetchImpl });

    // صحة الحساب (لامبارح بس: الحالة «دلوقتي» مالهاش تاريخ)
    let customer = null; let camps = null;
    if (job.latest) {
      customer = ((await api.query(Q.customer()))[0] || {}).customer || {};
      camps = {};
      for (const r of (await api.query(Q.campaigns())).filter(keep)) {
        const c = r.campaign || {};
        camps[c.id] = { id: String(c.id), name: c.name || '', status: c.status || '', primary: c.primaryStatus || '', reasons: c.primaryStatusReasons || [],
          budget_micros: num((r.campaignBudget || {}).amountMicros), impressions: 0, clicks: 0, disapproved: 0, limited: 0 };
      }
      for (const r of (await api.query(Q.adsPolicy())).filter(keep)) {
        const c = camps[(r.campaign || {}).id]; if (!c) continue;
        const st = ((r.adGroupAd || {}).policySummary || {}).approvalStatus;
        if (st === 'DISAPPROVED') c.disapproved++;
        if (st === 'APPROVED_LIMITED' || st === 'AREA_OF_INTEREST_ONLY') c.limited++;
      }
    }

    // أداء الحملات + أنواع الضغطات (اتصال · خرايط · موقع)
    const daily = {};
    for (const r of (await api.query(Q.campaignDay(job.day))).filter(keep)) {
      const c = r.campaign || {}, m = r.metrics || {};
      daily[c.id] = Object.assign({}, base, { campaign_id: String(c.id), campaign_name: c.name || '', impressions: num(m.impressions), clicks: num(m.clicks),
        invalid_clicks: num(m.invalidClicks), cost_micros: num(m.costMicros), conversions: num(m.conversions), conversions_value: num(m.conversionsValue), click_types: {}, pulled_at });
    }
    for (const r of (await api.query(Q.clickTypes(job.day))).filter(keep)) {
      const d = daily[(r.campaign || {}).id]; if (!d) continue;
      const t = (r.segments || {}).clickType || 'UNKNOWN';
      d.click_types[t] = (d.click_types[t] || 0) + num((r.metrics || {}).clicks);
    }
    const dailyRows = Object.values(daily);
    await upsert(db, 'ads_campaign_daily', dailyRows, 'client_id,customer_id,day,campaign_id');
    counts.campaigns = dailyRows.length;

    // عبارات البحث
    const terms = {};
    for (const r of (await api.query(Q.searchTerms(job.day))).filter(keep)) {
      const c = r.campaign || {}, g = r.adGroup || {}, kw = ((r.segments || {}).keyword || {}).info || {}, m = r.metrics || {};
      const row = Object.assign({}, base, { campaign_id: String(c.id || ''), campaign_name: c.name || '', ad_group_id: String(g.id || ''), ad_group_name: g.name || '',
        keyword: kw.text || '', match_type: kw.matchType || '', search_term: (r.searchTermView || {}).searchTerm || '',
        clicks: num(m.clicks), impressions: num(m.impressions), cost_micros: num(m.costMicros), conversions: num(m.conversions), pulled_at });
      const k = [row.campaign_id, row.ad_group_id, row.keyword, row.match_type, row.search_term].join('\u0001');
      if (terms[k]) { for (const f of ['clicks', 'impressions', 'cost_micros', 'conversions']) terms[k][f] += row[f]; } else terms[k] = row;
    }
    // النتيجة الفعلية لكل عبارة من جوجل (بعد رفع «عميل مؤكد» و«تواصل حقيقي»): أي فشل هنا مايوقفش السحب
    try {
      const wonNames = new Set([WON_ACTION, cred.conversion_action_name].filter(Boolean)), realNames = new Set([REAL_ACTION, cred.real_action_name].filter(Boolean));
      for (const r of (await api.query(Q.searchTermActions(job.day))).filter(keep)) {
        const kw = ((r.segments || {}).keyword || {}).info || {}, name = (r.segments || {}).conversionActionName || '';
        const k = [String((r.campaign || {}).id || ''), String((r.adGroup || {}).id || ''), kw.text || '', kw.matchType || '', (r.searchTermView || {}).searchTerm || ''].join('\u0001');
        const t = terms[k]; if (!t) continue;
        const v = num((r.metrics || {}).allConversions);
        if (wonNames.has(name)) t.won_conv = (t.won_conv || 0) + v;
        else if (realNames.has(name)) t.real_conv = (t.real_conv || 0) + v;
      }
    } catch (e) { console.error('term actions: ' + String(e.message || e).slice(0, 120)); }
    const termRows = Object.values(terms).map((t) => Object.assign({ won_conv: 0, real_conv: 0 }, t));
    // قبل 0026 (مفيش عمودي النتيجة): نرفع من غيرهم بدل ما السحب كله يقف
    await upsert(db, 'ads_search_terms', termRows, 'client_id,customer_id,day,campaign_id,ad_group_id,keyword,match_type,search_term')
      .catch((e) => { if (!/won_conv|real_conv/.test(String(e && e.message || e))) throw e; return upsert(db, 'ads_search_terms', termRows.map(({ won_conv, real_conv, ...r }) => r), 'client_id,customer_id,day,campaign_id,ad_group_id,keyword,match_type,search_term'); });
    counts.terms = termRows.length;

    // الضغطات واحدة واحدة (آخر 90 يوم بس)
    counts.clicks = 0;
    if (job.day >= addDays(readyDay(now, cred.timezone), -(CLICK_VIEW_DAYS - 2))) {
      const clicks = {}; const geoNames = new Set();
      for (const r of (await api.query(Q.clicks(job.day))).filter(keep)) {
        const cv = r.clickView || {}, p = cv.locationOfPresence || {}, a = cv.areaOfInterest || {}, k = cv.keywordInfo || {}, s = r.segments || {};
        if (!cv.gclid) continue;
        [p.city, p.region, p.country, p.mostSpecific, a.city, a.country].forEach((g) => { if (g) geoNames.add(g); });
        const row = Object.assign({}, base, { gclid: cv.gclid, click_type: s.clickType || '', campaign_id: String((r.campaign || {}).id || ''), campaign_name: (r.campaign || {}).name || '',
          ad_group_name: (r.adGroup || {}).name || '', keyword: k.text || null, match_type: k.matchType || null, device: s.device || null, network: s.adNetworkType || null,
          slot: s.slot || null, page_number: cv.pageNumber == null ? null : num(cv.pageNumber),
          presence_city: geoId(p.city), presence_region: geoId(p.region), presence_country: geoId(p.country), presence_most_specific: geoId(p.mostSpecific),
          interest_city: geoId(a.city), interest_country: geoId(a.country), clicks: num((r.metrics || {}).clicks) || 1, pulled_at });
        const key = row.gclid + '\u0001' + row.click_type;
        if (clicks[key]) clicks[key].clicks += row.clicks; else clicks[key] = row;
      }
      const clickRows = Object.values(clicks);
      await upsert(db, 'ads_clicks', clickRows, 'client_id,customer_id,day,gclid,click_type');
      counts.clicks = clickRows.length;
      counts.places = await learnPlaces(db, api, [...geoNames], pulled_at);
    }

    // صحة الحساب والتنبيهات
    let alerts = [];
    const usageNow = ctx.usage.total + api.ops;
    if (job.latest) {
      for (const d of dailyRows) { const c = camps[d.campaign_id]; if (c) { c.impressions = d.impressions; c.clicks = d.clicks; } }
      const list = Object.values(camps);
      alerts = buildAlerts(name, customer.status, list);
      if (usageNow >= ctx.limit * 0.7) alerts.push('📈 استهلاك الـAPI ' + usageNow + ' من ' + ctx.limit + ' في آخر 24 ساعة');
      let sent = false;
      if (alerts.length) {
        sent = await sendTelegram(env, '🔎 <b>جوجل أدز — ' + escHtml(name) + '</b> · ' + job.day + '\n' + alerts.map(escHtml).join('\n'), fetchImpl);
        if (!sent) console.error('ads alerts not delivered: ' + cred.client_id + ' ' + job.day);
      }
      await upsert(db, 'ads_account_health', [Object.assign({}, base, { customer_status: customer.status || null, currency: customer.currencyCode || null,
        campaigns: list, alerts, alert_sent: sent, usage_24h: usageNow, checked_at: pulled_at })], 'client_id,customer_id,day');
    }

    await db.insert('ads_pull_runs', [Object.assign({}, base, { source: 'server', ok: true, operations: api.ops, rows: counts, error: null, at: pulled_at })], { returning: false });
    const patch = { last_pull_at: pulled_at, last_error: null, updated_at: pulled_at };
    if (!cred.last_ok_day || job.day > cred.last_ok_day) patch.last_ok_day = job.day;
    if (customer) { if (customer.currencyCode) patch.currency = customer.currencyCode; if (customer.timeZone) patch.timezone = customer.timeZone; }
    await db.update('ads_credentials?id=' + eq(cred.id), patch);
    return { ok: true, client_id: cred.client_id, day: job.day, operations: api.ops, rows: counts, alerts: alerts.length };
  } catch (e) {
    const reason = scrub(e && e.message || e, secrets);
    const reauth = e && e.code === 'invalid_grant';
    console.error('ads pull ' + cred.client_id + ' ' + job.day + ': ' + reason);
    const ops = api ? api.ops : 0;
    try {
      await db.insert('ads_pull_runs', [Object.assign({}, base, { source: 'server', ok: false, operations: ops, rows: counts, error: reason, at: pulled_at })], { returning: false });
      const patch = { last_pull_at: pulled_at, last_error: reason, updated_at: pulled_at };
      if (reauth) patch.status = 'reauth';
      await db.update('ads_credentials?id=' + eq(cred.id), patch);
    } catch (e2) { console.error('ads pull log: ' + String(e2 && e2.message || e2).slice(0, 150)); }
    if (reauth || job.attempt === 1 || job.attempt >= MAX_ATTEMPTS) {
      const tail = reauth ? '\nانتهى الربط أو أُلغي ← يجب إعادة ربط الحساب. توقّف السحب لهذا الحساب.'
        : job.attempt >= MAX_ATTEMPTS ? '\nهذه آخر محاولة اليوم، وسيُعاد غدًا.' : '\nسيُعاد تلقائيًا.';
      await sendTelegram(env, '⚠️ <b>فشل سحب بيانات جوجل أدز</b>\n' + escHtml(name) + ' · ' + job.day + ' · المحاولة ' + job.attempt + ' من ' + MAX_ATTEMPTS + '\n' + escHtml(reason) + tail, fetchImpl);
    }
    return { ok: false, client_id: cred.client_id, day: job.day, operations: ops, error: reason };
  }
}

// أسماء الأماكن الجديدة بس (المدينة · الحي · الرمز البريدي). لو فشلت، اليوم مايفشلش: الرقم متخزن والاسم ييجي بعدين.
async function learnPlaces(db, api, names, at) {
  const ids = [...new Set(names.map(geoId).filter(Boolean))];
  if (!ids.length) return 0;
  try {
    const known = new Set();
    for (let i = 0; i < ids.length; i += 150) {
      for (const r of (await db.select('geo_targets?id=in.(' + ids.slice(i, i + 150).join(',') + ')&select=id')) || []) known.add(String(r.id));
    }
    const missing = ids.filter((id) => !known.has(id));
    const rows = [];
    for (let i = 0; i < missing.length; i += 200) {
      for (const r of await api.query(Q.geo(missing.slice(i, i + 200).map((id) => 'geoTargetConstants/' + id)))) {
        const g = r.geoTargetConstant || {};
        const id = geoId(g.resourceName) || (g.id != null ? String(g.id) : null);
        if (id) rows.push({ id, name: g.name || null, target_type: g.targetType || null, country_code: g.countryCode || null, fetched_at: at });
      }
    }
    if (rows.length) await upsert(db, 'geo_targets', rows, 'id');
    return rows.length;
  } catch (e) {
    console.error('ads places: ' + String(e && e.message || e).slice(0, 150));
    return 0;
  }
}

const STATUS_AR = { SUSPENDED: 'موقوف من جوجل', CANCELED: 'ملغى', CLOSED: 'مغلق' };
const REASON_AR = {
  HAS_ADS_DISAPPROVED: 'فيها إعلان مرفوض', HAS_ADS_LIMITED_BY_POLICY: 'إعلان مقيَّد بالسياسة', BUDGET_CONSTRAINED: 'الميزانية تحدّ من الظهور',
  BUDGET_MISCONFIGURED: 'إعداد الميزانية خاطئ', BIDDING_STRATEGY_MISCONFIGURED: 'إعداد المزايدة خاطئ', BIDDING_STRATEGY_LEARNING: 'المزايدة في مرحلة التعلّم',
  BIDDING_STRATEGY_LIMITED: 'المزايدة محدودة', MOST_ADS_UNDER_REVIEW: 'أغلب الإعلانات تحت المراجعة', NO_KEYWORDS: 'لا توجد كلمات مفعّلة',
  NO_AD_GROUP_ADS: 'لا توجد إعلانات مفعّلة', NO_AD_GROUPS: 'لا توجد مجموعات مفعّلة', AD_GROUPS_PAUSED: 'المجموعات موقوفة', AD_GROUP_ADS_PAUSED: 'الإعلانات موقوفة',
  KEYWORDS_PAUSED: 'الكلمات موقوفة', SEARCH_VOLUME_LIMITED: 'حجم البحث منخفض', CAMPAIGN_ENDED: 'الحملة انتهت', CAMPAIGN_PENDING: 'لم تبدأ الحملة بعد',
  MISSING_LOCATION_TARGETING: 'لا يوجد استهداف جغرافي',
};
const reasonsAr = (list) => (list || []).map((r) => REASON_AR[r] || r).join('، ');

// مفيش في الـAPI حقل بيقول «الدفع فشل» لحسابات الدفع التلقائي (المراجعة الرسمية 10 نوفمبر)،
// فالإشارة: حملة شغالة وماظهرتش خالص امبارح. ولو كل الحملات الشغالة كده ← غالباً الدفع أو حالة الحساب.
export function buildAlerts(name, customerStatus, campaigns) {
  const out = [];
  if (customerStatus && customerStatus !== 'ENABLED') out.push('🚨 الحساب ' + (STATUS_AR[customerStatus] || customerStatus) + ' ← الإعلانات لا تظهر');
  const on = campaigns.filter((c) => c.status === 'ENABLED');
  const silent = on.filter((c) => c.impressions === 0);
  if (on.length > 1 && silent.length === on.length) {
    out.push('🚨 كل الحملات المفعّلة (' + on.length + ') لم تظهر أمس إطلاقًا ← غالبًا بسبب الدفع أو حالة الحساب');
  } else {
    for (const c of silent) out.push('🚨 «' + c.name + '» مفعّلة ولم تظهر أمس إطلاقًا' + (c.reasons.length ? ' (' + reasonsAr(c.reasons) + ')' : '') + ' ← راجع الدفع والسياسات');
  }
  for (const c of on) if (c.disapproved) out.push('⛔ «' + c.name + '»: ' + c.disapproved + ' إعلان مرفوض');
  return out;
}

// ── نقاط الإدارة (بمفتاح ADMIN_TOKEN) ──

// الشيت بيبعت توكن الربط مرة واحدة، وبيتخزن مشفّر. التوكن مابيرجعش في أي رد ومابيتكتبش في أي لوج.
export async function saveCredentials(req, env, db) {
  if (!tokenKeyReady(env)) return json({ ok: false, error: 'ads_not_configured' }, 503);
  const b = await req.json().catch(() => ({}));
  const clientId = String(b.client_id || '');
  const cid = String(b.customer_id || '').replace(/\D/g, '');
  const rt = typeof b.refresh_token === 'string' ? b.refresh_token.trim() : '';
  if (!/^[0-9]{6,12}$/.test(cid)) return json({ ok: false, error: 'customer_id' }, 400);
  if (rt.length < 20 || rt.length > 2048) return json({ ok: false, error: 'refresh_token' }, 400);
  const c = await db.one('clients?id=' + eq(clientId) + '&select=id,name');
  if (!c) return json({ ok: false, error: 'client' }, 404);
  const login = String(b.login_customer_id || '').replace(/\D/g, '');
  const camps = Array.isArray(b.campaign_ids) ? [...new Set(b.campaign_ids.map((x) => String(x).replace(/\D/g, '')).filter(Boolean))] : [];
  const now = new Date().toISOString();
  const row = { client_id: c.id, customer_id: cid, login_customer_id: /^[0-9]{6,12}$/.test(login) ? login : null,
    refresh_token_enc: await sealToken(env, rt, c.id + ':' + cid), campaign_ids: camps.length ? camps : null, status: 'on', last_error: null, updated_at: now };
  const days = Math.floor(Number(b.backfill_days));
  if (days > 0) row.backfill_from = addDays(now.slice(0, 10), -Math.min(days, MAX_BACKFILL));
  await db.insert('ads_credentials', [row], { merge: true, onConflict: 'client_id,customer_id', returning: false });
  return json({ ok: true, client: c.name, customer_id: cid, campaigns: camps.length || 'all' });
}

export async function setBackfill(req, env, db) {
  const b = await req.json().catch(() => ({}));
  const cid = String(b.customer_id || '').replace(/\D/g, '');
  const days = Math.floor(Number(b.days));
  if (!(days > 0)) return json({ ok: false, error: 'days' }, 400);
  const from = addDays(new Date().toISOString().slice(0, 10), -Math.min(days, MAX_BACKFILL));
  const rows = await db.update('ads_credentials?client_id=' + eq(String(b.client_id || '')) + '&customer_id=' + eq(cid), { backfill_from: from });
  if (!rows || !rows.length) return json({ ok: false, error: 'account' }, 404);
  return json({ ok: true, backfill_from: from });
}

// الحالة من غير أي سر: مين مربوط، وآخر يوم اتسحب، وآخر خطأ، واستهلاك الـAPI
export async function adsStatus(req, env, db) {
  const now = new Date();
  const accounts = (await db.select('ads_credentials?select=client_id,customer_id,status,currency,timezone,campaign_ids,backfill_from,last_pull_at,last_ok_day,last_error&order=client_id.asc&limit=500')) || [];
  const usage = await usage24h(db, now);
  const limit = Number(env.ADS_DAILY_LIMIT) || 15000;
  return json({ ok: true, enabled: adsEnabled(env), configured: { token_key: tokenKeyReady(env), oauth: !!env.GOOGLE_CLIENT_ID && !!env.GOOGLE_CLIENT_SECRET, telegram: telegramReady(env), switch_on: env.ADS_PULL_ENABLED === '1' },
    accounts, operations_24h: usage, limit, percent: Math.round((usage.total / limit) * 1000) / 10 });
}

// الشيت بيبلّغ عدد عمليات pullAdsIntel علشان العداد يغطي المصدرين (نفس مشروع Cloud = نفس الحد)
export async function reportUsage(req, env, db) {
  const b = await req.json().catch(() => ({}));
  const ops = Math.floor(Number(b.operations));
  if (!(ops >= 0) || ops > 100000) return json({ ok: false, error: 'operations' }, 400);
  const cid = String(b.customer_id || '').replace(/\D/g, '') || null;
  await db.insert('ads_pull_runs', [{ source: 'apps_script', customer_id: cid, ok: b.ok !== false, operations: ops, at: new Date().toISOString() }], { returning: false });
  const usage = await usage24h(db, new Date());
  return json({ ok: true, operations_24h: usage });
}
