// رفع العملاء المؤكدين لجوجل أدز (13 نوفمبر). العميل بيشوف القايمة ويضغط «أرسل»: مفيش أي رفع من غير موافقته.
// • العميل المؤكد = تواصل (واتساب أو اتصال) نتيجته «تم»، وجاي من زيارة فيها gclid (ضغطة إعلان جوجل)، في آخر 90 يوم.
// • الرفع عن طريق Data Manager API (events:ingest، صلاحية datamanager)، على إجراء تحويل نوعه «استيراد من النقرات» (UPLOAD_CLICKS).
//   التوثيق الرسمي: developers.google.com/data-manager/api/devguides/events/google-ads/offline/send-events
// • بنبعت رقم الضغطة (gclid) ووقت التحويل ورقم مميز للتحويل (transactionId) بس. مفيش اسم ولا تليفون ولا إيميل.
// • قائمة إجراءات التحويل وإنشاء إجراء جديد عن طريق Google Ads API (صلاحية adwords)، والإنشاء برضه بزرار من العميل.
import { eq } from './db.js';
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
const ACTION_RE = /^[0-9]{1,20}$/;
const CODE_RE = /^[A-Za-z0-9_-]{2,40}$/;
const GCLID_RE = /^[A-Za-z0-9_-]{10,200}$/;

const canManage = (sess, site) => ['owner', 'admin'].includes(roleFor(sess, site.org_id, site.id));
const short = (e) => String((e && e.message) || e || '').slice(0, 200);

async function credOf(db, site) {
  return db.one('ads_credentials?client_id=' + eq(site.id) + '&status=eq.on&select=customer_id,login_customer_id,refresh_token_enc,currency,conversion_action_id,conversion_action_name&order=updated_at.desc');
}
async function tokenOf(env, cred, fetchImpl) {
  return accessToken(env, await openToken(env, cred.refresh_token_enc, '' + cred._site + ':' + cred.customer_id), fetchImpl);
}
async function logOps(db, siteId, ops, kind, ok) {
  await db.insert('ads_pull_runs', [{ client_id: siteId, source: 'server', ok: !!ok, operations: ops, rows: { kind }, at: new Date().toISOString() }], { returning: false }).catch(() => {});
}

// العملاء المؤكدين الجاهزين للرفع (ومعاهم الـgclid من الزيارة نفسها)
export async function candidates(db, site, now) {
  const since = new Date((now || Date.now()) - WINDOW_DAYS * 864e5).toISOString();
  const leads = ((await db.req('POST', 'rpc/dash_leads', { p_site: site.id, p_since: since })) || []).filter((l) => l.outcome === WON && l.match_code && CODE_RE.test(l.match_code) && l.session_id);
  const seen = new Set(), list = [];
  for (const l of leads) { if (seen.has(l.match_code)) continue; seen.add(l.match_code); list.push(l); }
  const sids = [...new Set(list.map((l) => l.session_id))].filter((s) => /^[A-Za-z0-9_.:-]{4,80}$/.test(s));
  const gclid = new Map();
  for (let i = 0; i < sids.length; i += 80) {
    const part = sids.slice(i, i + 80);
    const rows = (await db.select('raw_events?client_id=' + eq(site.id) + '&session_id=in.(' + part.map(encodeURIComponent).join(',') + ')&gclid=not.is.null&select=session_id,gclid,received_at&order=received_at.asc&limit=2000')) || [];
    for (const r of rows) if (!gclid.has(r.session_id) && GCLID_RE.test(String(r.gclid))) gclid.set(r.session_id, String(r.gclid));
  }
  return list.filter((l) => gclid.has(l.session_id)).map((l) => Object.assign({}, l, { gclid: gclid.get(l.session_id) }));
}

// ── الحالة (لكل اللي يقدر يشوف اللوحة) ──
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
    sent_total: done.filter((d) => d.status === 'sent').length });
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
  if (!cred.conversion_action_id) return json({ ok: false, error: 'no_action' }, 409);
  const want = new Set((Array.isArray(b.codes) ? b.codes : []).map(String).filter((c) => CODE_RE.test(c)));
  if (!want.size) return json({ ok: false, error: 'bad_request' }, 400);
  const sent = new Set(((await db.select('conv_uploads?client_id=' + eq(site.id) + '&conversion_action_id=' + eq(cred.conversion_action_id) + '&status=eq.sent&select=match_code&limit=5000')) || []).map((r) => r.match_code));
  const list = (await candidates(db, site)).filter((c) => want.has(c.match_code) && !sent.has(c.match_code)).slice(0, MAX_PER_SEND);
  if (!list.length) return json({ ok: false, error: 'nothing' }, 409);
  const rows = list.map((c) => ({ c, tx: 'mlt-' + site.id + '-' + c.match_code, time: new Date(Date.parse(c.outcome_at || c.at) || Date.parse(c.at)).toISOString() }));
  const login = cred.login_customer_id || cred.customer_id;
  const body = {
    destinations: [{ operatingAccount: { accountType: 'GOOGLE_ADS', accountId: cred.customer_id }, loginAccount: { accountType: 'GOOGLE_ADS', accountId: login }, productDestinationId: cred.conversion_action_id }],
    events: rows.map((r) => ({ adIdentifiers: { gclid: r.c.gclid }, eventTimestamp: r.time, transactionId: r.tx, eventSource: 'WEB' })),
  };
  let status = 0, j = {}, err = null;
  try {
    const access = await tokenOf(env, Object.assign({ _site: site.id }, cred), fetchImpl);
    const res = await (fetchImpl || fetch)(DM_URL, { method: 'POST', headers: { Authorization: 'Bearer ' + access, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    status = res.status; j = await res.json().catch(() => ({}));
    if (!res.ok) { const e0 = (Array.isArray(j) ? j[0] : j).error || {}; err = String(e0.status || e0.message || 'error ' + res.status).slice(0, 160); }
  } catch (e) { err = short(e); }
  // صلاحية datamanager مش موجودة في الربط الحالي ← العميل يعيد الربط
  const scope = status === 403 && /SCOPE|scope/.test(JSON.stringify(j));
  const at = new Date().toISOString();
  await db.insert('conv_uploads', rows.map((r) => ({ client_id: site.id, match_code: r.c.match_code, customer_id: cred.customer_id, conversion_action_id: cred.conversion_action_id, transaction_id: r.tx, event_time: r.time,
    status: err ? 'failed' : 'sent', request_id: err ? null : String(j.requestId || '').slice(0, 80) || null, error: err, by_user: sess.user.id, at })), { onConflict: 'client_id,match_code,conversion_action_id', merge: true, returning: false });
  await audit(db, sess.user.id, 'conv_uploaded', !err, site.id + ' ' + rows.length + (err ? ' ' + err.slice(0, 60) : ''));
  if (err) return json({ ok: false, error: scope ? 'scope' : 'google', detail: err }, scope ? 403 : 502);
  return json({ ok: true, sent: rows.length, request_id: j.requestId || null, warnings: Array.isArray(j.fieldWarnings) ? j.fieldWarnings.length : 0 });
}
