// رفع العملاء المؤكدين لجوجل أدز (13 نوفمبر). العميل بيشوف القايمة ويضغط «أرسل»: مفيش أي رفع من غير موافقته.
// • العميل المؤكد = تواصل (واتساب أو اتصال) نتيجته «تم»، وجاي من زيارة فيها gclid (ضغطة إعلان جوجل)، في آخر 90 يوم.
// • الرفع عن طريق Data Manager API (events:ingest، صلاحية datamanager)، على إجراء تحويل نوعه «استيراد من النقرات» (UPLOAD_CLICKS).
//   التوثيق الرسمي: developers.google.com/data-manager/api/devguides/events/google-ads/offline/send-events
// • بنبعت رقم الضغطة (gclid) ووقت التحويل ورقم مميز للتحويل (transactionId) بس. مفيش اسم ولا تليفون ولا إيميل.
// • قائمة إجراءات التحويل وإنشاء إجراء جديد عن طريق Google Ads API (صلاحية adwords)، والإنشاء برضه بزرار من العميل.
import { eq } from './db.js';
import { valuesOf } from './optimize.js';
import { json } from './util.js';
import { openToken } from './crypto.js';
import { accessToken, adsClient, ADS_VERSION_DEFAULT } from './gads.js';
import { loadSite, notFound, roleFor } from './sites.js';
import { audit } from './auth.js';

const DM_URL = 'https://datamanager.googleapis.com/v1/events:ingest';
const WINDOW_DAYS = 90;          // جوجل مابيقبلش تحويل لضغطة أقدم من نافذة الإجراء (أقصاها 90 يوم)
const MAX_PER_SEND = 2000;
const WON = 'تم';
export const ACTION_NAME = 'Maestro LT – عميل مؤكد';
// إجراء ثانوي (مش داخل في المزايدة): المحادثات الفعلية (تم · بيفكر · لغى) علشان نعرف من جوجل أنهي عبارة بحث جابت ناس بجد
export const REAL_ACTION_NAME = 'Maestro LT – تواصل حقيقي';
const CONVO = new Set(['تم', 'بيفكر', 'لغى']);
const ACTION_RE = /^[0-9]{1,20}$/;
const CODE_RE = /^[A-Za-z0-9_-]{2,40}$/;
const GCLID_RE = /^[A-Za-z0-9_-]{10,200}$/;

const canManage = (sess, site) => ['owner', 'admin'].includes(roleFor(sess, site.org_id, site.id));
const short = (e) => String((e && e.message) || e || '').slice(0, 200);

async function credOf(db, site) {
  const q = (cols) => db.one('ads_credentials?client_id=' + eq(site.id) + '&status=eq.on&select=customer_id,login_customer_id,refresh_token_enc,currency,conversion_action_id,conversion_action_name' + cols + '&order=updated_at.desc');
  return q(',real_action_id,real_action_name').catch(() => q(''));   // قبل 0026
}
async function tokenOf(env, cred, fetchImpl) {
  return accessToken(env, await openToken(env, cred.refresh_token_enc, '' + cred._site + ':' + cred.customer_id), fetchImpl);
}
async function logOps(db, siteId, ops, kind, ok) {
  await db.insert('ads_pull_runs', [{ client_id: siteId, source: 'server', ok: !!ok, operations: ops, rows: { kind }, at: new Date().toISOString() }], { returning: false }).catch(() => {});
}

// رسالة جوجل كاملة (النوع · الرسالة · الحقول المرفوضة وسببها) علشان نعرف السبب من أول مرة. مفيش فيها أسرار.
export function googleError(j, status) {
  const e0 = ((Array.isArray(j) ? j[0] : j) || {}).error || {};
  const parts = [e0.status || 'HTTP ' + status, e0.message || ''];
  for (const d of e0.details || []) {
    for (const v of d.fieldViolations || []) parts.push((v.field || '') + ' ' + (v.description || v.reason || ''));
    if (d.reason) parts.push(d.reason);
    for (const er of d.errors || []) parts.push(JSON.stringify(er.errorCode || er.reason || '') + ' ' + (er.message || ''));
  }
  return parts.filter(Boolean).join(' | ').replace(/\s+/g, ' ').slice(0, 600);
}

// العملاء الجاهزين للرفع، ومعاهم رقم النقرة من الزيارة نفسها:
// gclid، أو gbraid/wbraid لنقرات الآيفون (١.٥ · 📖 Data Manager Event.adIdentifiers: gclid · gbraid · wbraid)
// kind: 'won' = «تم» · 'real' = محادثة فعلية (تم · بيفكر · لغى) · 'strong' = تواصل قوي (غاب دقيقة أو أكتر بعد ضغطة واتساب/اتصال)
const BRAID_RE = /^[A-Za-z0-9_-]{10,300}$/;
export async function candidates(db, site, now, kind, days) {
  const since = new Date((now || Date.now()) - (days || WINDOW_DAYS) * 864e5).toISOString();
  let pass = kind === 'real' ? (l) => CONVO.has(l.outcome) : (l) => l.outcome === WON;
  let strongSet = null;
  if (kind === 'strong') {
    const rets = (await db.select('raw_events?client_id=' + eq(site.id) + '&event=eq.contact_return&received_at=gte.' + encodeURIComponent(since) + '&select=match_code,payload&limit=5000').catch(() => [])) || [];
    strongSet = new Set(rets.filter((r) => r.match_code && String((r.payload || {}).app_opened || '') !== '0' && Number((r.payload || {}).away_seconds) >= 60).map((r) => String(r.match_code).replace(/^#/, '')));
    pass = (l) => strongSet.has(String(l.match_code));
  }
  const leads = ((await db.req('POST', 'rpc/dash_leads', { p_site: site.id, p_since: since })) || []).filter((l) => l.match_code && CODE_RE.test(l.match_code) && l.session_id && pass(l));
  const seen = new Set(), list = [];
  for (const l of leads) { if (seen.has(l.match_code)) continue; seen.add(l.match_code); list.push(l); }
  const sids = [...new Set(list.map((l) => l.session_id))].filter((x) => /^[A-Za-z0-9_.:-]{4,80}$/.test(x));
  const ids = new Map();
  for (let i = 0; i < sids.length; i += 80) {
    const part = sids.slice(i, i + 80);
    const rows = (await db.select('raw_events?client_id=' + eq(site.id) + '&session_id=in.(' + part.map(encodeURIComponent).join(',') + ')&event=eq.page_view&select=session_id,gclid,payload,received_at&order=received_at.asc&limit=2000')) || [];
    for (const r of rows) {
      if (ids.has(r.session_id)) continue;
      const p = r.payload || {};
      if (r.gclid && GCLID_RE.test(String(r.gclid))) ids.set(r.session_id, { type: 'gclid', id: String(r.gclid) });
      else if (p.gbraid && BRAID_RE.test(String(p.gbraid))) ids.set(r.session_id, { type: 'gbraid', id: String(p.gbraid) });
      else if (p.wbraid && BRAID_RE.test(String(p.wbraid))) ids.set(r.session_id, { type: 'wbraid', id: String(p.wbraid) });
    }
  }
  return list.filter((l) => ids.has(l.session_id)).map((l) => { const x = ids.get(l.session_id); return Object.assign({}, l, { click: x, gclid: x.type === 'gclid' ? x.id : null }); });
}

// الإرسال نفسه (الزرار والرفع اليومي): كل حدث برقمه جوه الطلب (علشان requestStatus يقول أنهي اتقبل) وقيمته وعملته
export async function sendEvents(env, db, site, cred, actionId, list, opts, fetchImpl) {
  const o = opts || {}, prefix = o.prefix || '';
  const rows = list.slice(0, MAX_PER_SEND).map((c, i) => ({ c, i, tx: 'mlt-' + prefix + site.id + '-' + c.match_code, time: new Date(Date.parse(c.outcome_at || c.at) || Date.parse(c.at)).toISOString(), value: typeof o.value === 'function' ? o.value(c) : o.value }));
  const login = cred.login_customer_id || cred.customer_id;
  const cur = /^[A-Z]{3}$/.test(String(cred.currency || '')) ? cred.currency : null;
  const body = {
    destinations: [{ operatingAccount: { accountType: 'GOOGLE_ADS', accountId: cred.customer_id }, loginAccount: { accountType: 'GOOGLE_ADS', accountId: login }, productDestinationId: actionId }],
    events: rows.map((r) => Object.assign({ adIdentifiers: { [r.c.click.type]: r.c.click.id }, eventTimestamp: r.time, transactionId: r.tx, eventSource: 'WEB' }, cur && r.value ? { conversionValue: r.value, currency: cur } : {})),
  };
  let status = 0, j = {}, err = null;
  try {
    const access = await tokenOf(env, Object.assign({ _site: site.id }, cred), fetchImpl);
    const res = await (fetchImpl || fetch)(DM_URL, { method: 'POST', headers: { Authorization: 'Bearer ' + access, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    status = res.status; j = await res.json().catch(() => ({}));
    if (!res.ok) { err = googleError(j, res.status); console.error('conv send: ' + err); }
  } catch (e) { err = short(e); }
  const scope = status === 403 && /SCOPE|scope/.test(JSON.stringify(j));
  const at = new Date().toISOString();
  const recs = rows.map((r) => ({ client_id: site.id, match_code: r.c.match_code, customer_id: cred.customer_id, conversion_action_id: actionId, transaction_id: r.tx, event_time: r.time,
    status: err ? 'failed' : 'sent', request_id: err ? null : String(j.requestId || '').slice(0, 80) || null, error: err, by_user: o.by || null, at, event_index: r.i, value: r.value || null, click_id_type: r.c.click.type, dm_status: err ? null : 'PROCESSING' }));
  await db.insert('conv_uploads', recs, { onConflict: 'client_id,match_code,conversion_action_id', merge: true, returning: false }).catch(async (e) => {
    if (!/event_index|value|click_id_type|dm_status/.test(String(e && e.message || e))) throw e;   // قبل 0031
    await db.insert('conv_uploads', recs.map(({ event_index, value, click_id_type, dm_status, ...r }) => r), { onConflict: 'client_id,match_code,conversion_action_id', merge: true, returning: false });
  });
  return { ok: !err, sent: rows.length, err, scope, requestId: j.requestId || null, warnings: Array.isArray(j.fieldWarnings) ? j.fieldWarnings.length : 0 };
}

export async function dashConv(req, env, db, sess, url) {
  const site = await loadSite(db, sess, url.searchParams.get('site'));
  if (!site) return notFound();
  const cred = await credOf(db, site).catch(() => null);
  if (!cred) return json({ ok: true, linked: false, manage: canManage(sess, site) });
  const done = (await db.select('conv_uploads?client_id=' + eq(site.id) + '&select=match_code,conversion_action_id,status,error,at,event_time&order=at.desc&limit=500').catch(() => [])) || [];
  const sentHere = new Set(done.filter((d) => d.status === 'sent' && d.conversion_action_id === cred.conversion_action_id).map((d) => d.match_code));
  const cand = await candidates(db, site);
  const failed = new Map(done.filter((d) => d.status === 'failed' && d.conversion_action_id === cred.conversion_action_id).map((d) => [d.match_code, d.error]));
  return json({ ok: true, linked: true, manage: canManage(sess, site),
    action: cred.conversion_action_id ? { id: cred.conversion_action_id, name: cred.conversion_action_name || '' } : null,
    ready: cand.filter((c) => !sentHere.has(c.match_code)).map((c) => ({ code: c.match_code, at: c.at, outcome_at: c.outcome_at, type: c.click_type, source: c.source_fine || c.source || 'google_ads', detail: c.source_detail || '', city: c.city || '', failed: failed.get(c.match_code) || null })),
    sent: done.filter((d) => d.status === 'sent').slice(0, 50).map((d) => ({ code: d.match_code, at: d.at, event_time: d.event_time })),
    sent_total: done.filter((d) => d.status === 'sent' && d.conversion_action_id === cred.conversion_action_id).length,
    real: await realState(db, site, cred, done) });
}

// المحادثات الفعلية الجاهزة للإجراء الثانوي (عددها بس: الإرسال بضغطة واحدة للكل)
async function realState(db, site, cred, done) {
  if (!cred.real_action_id) return { action: null, ready: 0 };
  const sent = new Set(done.filter((d) => d.status === 'sent' && d.conversion_action_id === cred.real_action_id).map((d) => d.match_code));
  const c = await candidates(db, site, null, 'real').catch(() => []);
  return { action: { id: cred.real_action_id, name: cred.real_action_name || REAL_ACTION_NAME }, ready: c.filter((x) => !sent.has(x.match_code)).length, sent: sent.size };
}

// ── إجراءات التحويل «استيراد من النقرات» في الحساب (عملية API واحدة) ──
async function listActions(env, db, site, cred, fetchImpl) {
  const access = await tokenOf(env, Object.assign({ _site: site.id }, cred), fetchImpl);
  const api = adsClient({ env, access, customerId: cred.customer_id, loginCustomerId: cred.login_customer_id, fetchImpl });
  let rows = [];
  try { rows = await api.query("SELECT conversion_action.id, conversion_action.name, conversion_action.type, conversion_action.status FROM conversion_action WHERE conversion_action.type = 'UPLOAD_CLICKS' AND conversion_action.status = 'ENABLED'"); }
  finally { await logOps(db, site.id, api.ops, 'conv_actions', true); }
  return { access, actions: rows.map((r) => r.conversionAction || {}).filter((a) => ACTION_RE.test(String(a.id))).map((a) => ({ id: String(a.id), name: a.name || '' })) };
}

export async function dashConvActions(req, env, db, sess, url, fetchImpl) {
  const site = await loadSite(db, sess, url.searchParams.get('site'));
  if (!site) return notFound();
  if (!canManage(sess, site)) return json({ ok: false, error: 'role' }, 403);
  const cred = await credOf(db, site);
  if (!cred) return json({ ok: false, error: 'not_linked' }, 409);
  try { return json({ ok: true, actions: (await listActions(env, db, site, cred, fetchImpl)).actions }); }
  catch (e) { console.error('conv actions: ' + short(e)); return json({ ok: false, error: 'google' }, 502); }
}

async function createRealAction(env, db, site, cred, access, fetchImpl) {
  const ver = String(env.ADS_API_VERSION || ADS_VERSION_DEFAULT).trim();
  const headers = { Authorization: 'Bearer ' + access, 'Content-Type': 'application/json' };
  if (cred.login_customer_id) headers['login-customer-id'] = cred.login_customer_id;
  const url = 'https://googleads.googleapis.com/' + ver + '/customers/' + cred.customer_id + '/conversionActions:mutate';
  const res = await (fetchImpl || fetch)(url, { method: 'POST', headers, body: JSON.stringify({ operations: [{ create: { name: REAL_ACTION_NAME, type: 'UPLOAD_CLICKS', category: 'CONTACT', status: 'ENABLED', valueSettings: { defaultValue: 1, alwaysUseDefaultValue: false } } }] }) });
  const j = await res.json().catch(() => ({}));
  const rn = String(((j.results || [])[0] || {}).resourceName || ''), id = rn.split('/').pop();
  await logOps(db, site.id, 1, 'conv_action_create', res.ok);
  if (!res.ok || !ACTION_RE.test(id)) throw new Error('create ' + res.status);
  const up = await (fetchImpl || fetch)(url, { method: 'POST', headers, body: JSON.stringify({ operations: [{ update: { resourceName: rn, primaryForGoal: false }, updateMask: 'primary_for_goal' }] }) });
  await logOps(db, site.id, 1, 'conv_action_secondary', up.ok);
  if (!up.ok) console.error('real action secondary: ' + up.status);
  return { id, name: REAL_ACTION_NAME };
}

// اختيار إجراء موجود، أو إنشاء «Maestro LT – عميل مؤكد» (بزرار العميل)
export async function dashConvAction(req, env, db, sess, fetchImpl) {
  const b = await req.json().catch(() => ({}));
  const site = await loadSite(db, sess, b.site);
  if (!site) return notFound();
  if (!canManage(sess, site)) return json({ ok: false, error: 'role' }, 403);
  const cred = await credOf(db, site);
  if (!cred) return json({ ok: false, error: 'not_linked' }, 409);
  let pick;
  try {
    const { access, actions } = await listActions(env, db, site, cred, fetchImpl);
    if (b.create === true) {
      pick = actions.find((a) => a.name === ACTION_NAME);
      if (!pick) {
        const ver = String(env.ADS_API_VERSION || ADS_VERSION_DEFAULT).trim();
        const headers = { Authorization: 'Bearer ' + access, 'Content-Type': 'application/json' };
        if (cred.login_customer_id) headers['login-customer-id'] = cred.login_customer_id;
        const res = await (fetchImpl || fetch)('https://googleads.googleapis.com/' + ver + '/customers/' + cred.customer_id + '/conversionActions:mutate', {
          method: 'POST', headers,
          body: JSON.stringify({ operations: [{ create: { name: ACTION_NAME, type: 'UPLOAD_CLICKS', category: 'QUALIFIED_LEAD', status: 'ENABLED', valueSettings: { defaultValue: 1, alwaysUseDefaultValue: false } } }] }),
        });
        const j = await res.json().catch(() => ({}));
        await logOps(db, site.id, 1, 'conv_action_create', res.ok);
        const id = String(((j.results || [])[0] || {}).resourceName || '').split('/').pop();
        if (!res.ok || !ACTION_RE.test(id)) { console.error('conv action create: ' + res.status); return json({ ok: false, error: 'google' }, 502); }
        pick = { id, name: ACTION_NAME };
        await audit(db, sess.user.id, 'conv_action_created', true, site.id + ' ' + cred.customer_id + ' ' + id);
      }
      // ومعاه «تواصل حقيقي»: ثانوي، مابيدخلش في المزايدة (primary_for_goal = false بتتظبط بـ update بعد الإنشاء)
      let real = actions.find((a) => a.name === REAL_ACTION_NAME);
      if (!real) real = await createRealAction(env, db, site, cred, access, fetchImpl).catch((e) => { console.error('real action: ' + short(e)); return null; });
      if (real) await db.update('ads_credentials?client_id=' + eq(site.id) + '&customer_id=' + eq(cred.customer_id), { real_action_id: real.id, real_action_name: real.name.slice(0, 120) }).catch(() => {});
    } else {
      pick = actions.find((a) => a.id === String(b.action_id || ''));
      if (!pick) return json({ ok: false, error: 'bad_action' }, 400);   // لازم يكون من قايمة جوجل
    }
  } catch (e) { console.error('conv action: ' + short(e)); return json({ ok: false, error: 'google' }, 502); }
  await db.update('ads_credentials?client_id=' + eq(site.id) + '&customer_id=' + eq(cred.customer_id), { conversion_action_id: pick.id, conversion_action_name: pick.name.slice(0, 120), updated_at: new Date().toISOString() });
  await audit(db, sess.user.id, 'conv_action_set', true, site.id + ' ' + pick.id);
  return json({ ok: true, action: pick });
}

// ── الإرسال (بعد موافقة العميل على القايمة) ──
export async function dashConvSend(req, env, db, sess, fetchImpl) {
  const b = await req.json().catch(() => ({}));
  const site = await loadSite(db, sess, b.site);
  if (!site) return notFound();
  if (!canManage(sess, site)) return json({ ok: false, error: 'role' }, 403);
  const cred = await credOf(db, site);
  if (!cred) return json({ ok: false, error: 'not_linked' }, 409);
  // kind 'real' = كل المحادثات الفعلية الجاهزة للإجراء الثانوي (بضغطة صاحب الموقع)
  const real = b.kind === 'real', actionId = real ? cred.real_action_id : cred.conversion_action_id;
  if (!actionId) return json({ ok: false, error: 'no_action' }, 409);
  const want = new Set((Array.isArray(b.codes) ? b.codes : []).map(String).filter((c) => CODE_RE.test(c)));
  if (!real && !want.size) return json({ ok: false, error: 'bad_request' }, 400);
  const sent = new Set(((await db.select('conv_uploads?client_id=' + eq(site.id) + '&conversion_action_id=' + eq(actionId) + '&status=eq.sent&select=match_code&limit=5000')) || []).map((r) => r.match_code));
  const list = (await candidates(db, site, null, real ? 'real' : 'won')).filter((c) => (real || want.has(c.match_code)) && !sent.has(c.match_code)).slice(0, MAX_PER_SEND);
  if (!list.length) return json({ ok: false, error: 'nothing' }, 409);
  const V = await valuesOf(db, site.id);
  const r = await sendEvents(env, db, site, cred, actionId, list, { prefix: real ? 'r-' : '', value: real ? (c) => (c.outcome === WON ? V.won : V.convo) : V.won, by: sess.user.id }, fetchImpl);
  const rows = { length: r.sent }, err = r.err, scope = r.scope, j = { requestId: r.requestId, fieldWarnings: new Array(r.warnings) };
  await audit(db, sess.user.id, 'conv_uploaded', !err, site.id + (real ? ' real ' : ' ') + rows.length + (err ? ' ' + err.slice(0, 60) : ''));
  if (err) return json({ ok: false, error: scope ? 'scope' : 'google', detail: err }, scope ? 403 : 502);
  return json({ ok: true, sent: rows.length, request_id: j.requestId || null, warnings: Array.isArray(j.fieldWarnings) ? j.fieldWarnings.length : 0 });
}
