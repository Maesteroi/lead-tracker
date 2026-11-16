// «حسّن حملتك بضغطة» (16 نوفمبر · محمود: «فيه عند ClickBan حسّن حملتك بضغطة: الحاجات اللي هعملها تعديل على الحملة علشان تتحسن»).
// مش تقرير: قايمة تعديلات حقيقية في إعدادات جوجل أدز، كل واحدة «دلوقتي ← بعد التعديل» وتمنها في آخر 30 يوم، وتتنفذ بضغطة بموافقتك (قاعدة 2).
// اللي عند ClickBan (من صفحاتهم): المكان «التواجد» بدل «التواجد أو الاهتمام» · إيقاف شركاء البحث · إيقاف الشبكة الإعلانية في حملة البحث · السلبيات.
// زيادة عندنا: كل تعديل بدليله بالفلوس من حسابك · إيقاف الكلمات اللي ثبت بالإحصاء إنها مابتجيبش تواصل · «تراجع» لأي تعديل · ومتابعة أثره على التحويل.
// المرجع (اتأكدنا منه 16 نوفمبر): Campaign.NetworkSettings (target_google_search · target_search_network = شركاء البحث ويحتاج target_google_search ·
// target_content_network = الشبكة الإعلانية) · Campaign.GeoTargetTypeSetting.positive_geo_target_type (PRESENCE · PRESENCE_OR_INTEREST · SEARCH_INTEREST).
import { eq } from './db.js';
import { json } from './util.js';
import { openToken } from './crypto.js';
import { accessToken, adsClient } from './gads.js';
import { loadSite, notFound, roleFor } from './sites.js';
import { audit } from './auth.js';
import { scoredSessions } from './dash.js';
import { suggest, addNegative } from './negatives.js';
import { expertOf } from './expert.js';
import { windowData, funnelOf } from './analysis.js';

const canManage = (sess, site) => ['owner', 'admin'].includes(roleFor(sess, site.org_id, site.id));
const n0 = (v) => Number(v) || 0;
const r2 = (v) => Math.round(n0(v) * 100) / 100;
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const ID = /^\d{1,20}$/;
const CODES = ['partners_off', 'display_off', 'geo_presence', 'negatives', 'pause_kw'];

async function credOf(db, site) {
  return db.one('ads_credentials?client_id=' + eq(site.id) + '&status=eq.on&select=customer_id,login_customer_id,refresh_token_enc,currency,timezone&order=updated_at.desc');
}
async function apiFor(env, site, cred, fetchImpl) {
  const access = await accessToken(env, await openToken(env, cred.refresh_token_enc, site.id + ':' + cred.customer_id), fetchImpl);
  return adsClient({ env, access, customerId: cred.customer_id, loginCustomerId: cred.login_customer_id, fetchImpl });
}

// ── القايمة: من إعدادات جوجل الحالية + أرقام آخر 30 يوم ──
export async function fixList(env, db, site, cred, fetchImpl, now) {
  const t = now || Date.now();
  const api = await apiFor(env, site, cred, fetchImpl);
  const [camps, nets] = await Promise.all([
    api.query("SELECT campaign.id, campaign.name, campaign.advertising_channel_type, campaign.network_settings.target_google_search, campaign.network_settings.target_search_network, campaign.network_settings.target_content_network, campaign.geo_target_type_setting.positive_geo_target_type FROM campaign WHERE campaign.status = 'ENABLED'"),
    api.query("SELECT campaign.id, segments.ad_network_type, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign WHERE campaign.status = 'ENABLED' AND segments.date DURING LAST_30_DAYS").catch(() => []),
  ]);
  const byNet = new Map();
  for (const r of nets || []) {
    const id = String((r.campaign || {}).id || ''), k = id + '|' + ((r.segments || {}).adNetworkType || '');
    const x = byNet.get(k) || { clicks: 0, cost: 0, conv: 0 };
    x.clicks += n0((r.metrics || {}).clicks); x.cost += n0((r.metrics || {}).costMicros) / 1e6; x.conv += n0((r.metrics || {}).conversions); byNet.set(k, x);
  }
  const net = (id, type) => byNet.get(id + '|' + type) || { clicks: 0, cost: 0, conv: 0 };
  const since = new Date(t - 30 * 864e5).toISOString();
  const [sessions, leads] = await Promise.all([
    scoredSessions(db, site.id, since, 3000, 'ar').catch(() => []),
    db.req('POST', 'rpc/dash_leads', { p_site: site.id, p_since: since }).catch(() => []),
  ]);
  const ad = (sessions || []).filter((s) => s.ad), outside = ad.filter((s) => s.outside).length;
  const items = [];
  const it = (o) => items.push(Object.assign({ sure: true }, o, { key: o.code + ':' + (o.campaign || o.k || '') }));
  for (const r of camps || []) {
    const c = r.campaign || {}, id = String(c.id || ''), ns = c.networkSettings || {};
    if (!ID.test(id) || c.advertisingChannelType !== 'SEARCH') continue;   // الإعدادات دي لحملات البحث بس
    const name = c.name || id;
    const sp = net(id, 'SEARCH_PARTNERS'), cn = net(id, 'CONTENT'), gs = net(id, 'SEARCH');
    const rate = (x) => (x.clicks ? x.conv / x.clicks : 0);
    if (ns.targetSearchNetwork) it({ code: 'partners_off', campaign: id, name, now: 'on', next: 'off', clicks: sp.clicks, cost: r2(sp.cost), conv: r2(sp.conv), conv_rate: pct(rate(sp) * 100, 100), search_rate: pct(rate(gs) * 100, 100), impact: r2(sp.cost) });
    if (ns.targetContentNetwork) it({ code: 'display_off', campaign: id, name, now: 'on', next: 'off', clicks: cn.clicks, cost: r2(cn.cost), conv: r2(cn.conv), impact: r2(cn.cost) });
    const geo = (c.geoTargetTypeSetting || {}).positiveGeoTargetType || '';
    if (geo && geo !== 'PRESENCE') it({ code: 'geo_presence', campaign: id, name, now: geo, next: 'PRESENCE', outside, of: ad.length, p: pct(outside, ad.length), impact: r2(ad.length ? (outside / ad.length) * (gs.cost + sp.cost) : 0) });
  }
  // السلبيات: الآمنة بس (مش بتمنع كلمة شغالة، ومش جابت تواصل)
  const neg = await suggest(db, site, cred, t).catch(() => null);
  const safe = ((neg && neg.suggestions) || []).filter((s) => !s.protect && !(s.blocks_own || []).length);
  if (safe.length) it({ code: 'negatives', k: 'all', n: safe.length, cost: r2(safe.reduce((a, s) => a + n0(s.cost), 0)), terms: safe.slice(0, 6).map((s) => s.text), impact: r2(safe.reduce((a, s) => a + n0(s.cost), 0)) });
  // الكلمات اللي ثبت بالإحصاء إنها مابتجيبش تواصل (من تقرير الخبير)
  const ex = await expertOf(db, site, cred, t, { sessions: sessions || [], leads: leads || [] }).catch(() => null);
  for (const k of ((ex && ex.keywords) || []).filter((x) => x.verdict === 'cut').slice(0, 5)) it({ code: 'pause_kw', k: k.k, match: k.match, cost: k.cost, clicks: k.clicks, reached: k.reached, expected: k.expected, impact: k.save });
  items.sort((a, b) => b.impact - a.impact);
  return { items, done: await doneList(db, site, t), currency: cred.currency || '' };
}

async function doneList(db, site, t) {
  const rows = (await db.select('analysis_fixes?client_id=' + eq(site.id) + '&at=gte.' + new Date(t - 60 * 864e5).toISOString() + '&select=id,code,item_key,action,target,at,status&order=at.desc&limit=40').catch(() => [])) || [];
  return rows.filter((r) => CODES.includes(r.action)).map((r) => ({ id: r.id, code: r.action, key: r.item_key, target: r.target || {}, at: r.at, undone: r.status === 'closed' }));
}

export async function dashCampfix(req, env, db, sess, url, fetchImpl) {
  const site = await loadSite(db, sess, url.searchParams.get('site'));
  if (!site) return notFound();
  const cred = await credOf(db, site).catch(() => null);
  if (!cred) return json({ ok: true, linked: false });
  try { return json(Object.assign({ ok: true, linked: true, manage: canManage(sess, site) }, await fixList(env, db, site, cred, fetchImpl))); }
  catch (e) { console.error('campfix: ' + String(e && e.message || e).slice(0, 160)); return json({ ok: false, error: 'google' }, 502); }
}

// ── التنفيذ: البنود بتتقري من جوجل تاني على السيرفر (مش من المتصفح)، وكل بند بيتسجّل بقيمته القديمة علشان «تراجع» ومتابعة الأثر ──
async function record(db, site, sess, it, target, now) {
  const w = await windowData(db, site, now - 14 * 864e5);
  const baseline = Object.assign({ days: 14 }, funnelOf(w.sessions, w.leads, w.daily, now - 14 * 864e5, now));
  await db.insert('analysis_fixes', [{ client_id: site.id, code: it.code, item_key: it.key.slice(0, 140), mode: 'auto', action: it.code, target, by_user: sess.user.id, at: new Date(now).toISOString(), baseline, status: 'tracking' }], { returning: false });
}
export async function dashCampfixApply(req, env, db, sess, fetchImpl) {
  const b = await req.json().catch(() => ({}));
  const site = await loadSite(db, sess, b.site);
  if (!site) return notFound();
  if (!canManage(sess, site)) return json({ ok: false, error: 'role' }, 403);
  const cred = await credOf(db, site).catch(() => null);
  if (!cred) return json({ ok: false, error: 'not_linked' }, 409);
  const keys = (Array.isArray(b.keys) ? b.keys : []).map(String).slice(0, 30);
  if (!keys.length) return json({ ok: false, error: 'bad_request' }, 400);
  const now = Date.now();
  let list;
  try { list = await fixList(env, db, site, cred, fetchImpl, now); } catch (e) { return json({ ok: false, error: 'google' }, 502); }
  const api = await apiFor(env, site, cred, fetchImpl);
  const res = [];
  for (const key of keys) {
    const it = list.items.find((x) => x.key === key);
    if (!it) { res.push({ key, ok: false, error: 'gone' }); continue; }
    try {
      const rn = it.campaign ? 'customers/' + cred.customer_id + '/campaigns/' + it.campaign : null;
      let target = { campaign: it.campaign || null, name: it.name || null, before: it.now || null, after: it.next || null };
      if (it.code === 'partners_off') await api.mutate('campaigns:mutate', { operations: [{ update: { resourceName: rn, networkSettings: { targetSearchNetwork: false } }, updateMask: 'networkSettings.targetSearchNetwork' }] });
      else if (it.code === 'display_off') await api.mutate('campaigns:mutate', { operations: [{ update: { resourceName: rn, networkSettings: { targetContentNetwork: false } }, updateMask: 'networkSettings.targetContentNetwork' }] });
      else if (it.code === 'geo_presence') await api.mutate('campaigns:mutate', { operations: [{ update: { resourceName: rn, geoTargetTypeSetting: { positiveGeoTargetType: 'PRESENCE' } }, updateMask: 'geoTargetTypeSetting.positiveGeoTargetType' }] });
      else if (it.code === 'pause_kw') {
        const rows = await api.query("SELECT ad_group_criterion.resource_name, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type FROM keyword_view WHERE ad_group_criterion.status = 'ENABLED' AND ad_group.status = 'ENABLED' AND campaign.status != 'REMOVED'");
        const rns = rows.map((r) => r.adGroupCriterion || {}).filter((c) => (c.keyword || {}).text === it.k && (c.keyword || {}).matchType === it.match).map((c) => c.resourceName).filter(Boolean).slice(0, 20);
        if (!rns.length) { res.push({ key, ok: false, error: 'not_live' }); continue; }
        await api.mutate('adGroupCriteria:mutate', { operations: rns.map((r) => ({ update: { resourceName: r, status: 'PAUSED' }, updateMask: 'status' })) });
        target = { keyword: it.k, match: it.match, resources: rns };
      } else if (it.code === 'negatives') {
        const neg = await suggest(db, site, cred, now);
        const safe = neg.suggestions.filter((s) => !s.protect && !(s.blocks_own || []).length);
        const made = [], added = [];
        for (const s of safe) {
          const r = await addNegative(env, db, site, cred, s, fetchImpl);
          await db.insert('neg_decisions', [{ client_id: site.id, text: s.text, match_type: s.match, decision: 'add', reason: s.reason, campaigns: s.campaigns.map((c) => c.id), cost: s.cost, by_user: sess.user.id, at: new Date().toISOString(), applied_at: r.ok ? new Date().toISOString() : null, error: r.ok ? null : r.error }], { onConflict: 'client_id,text,match_type', merge: true, returning: false });
          if (r.ok) { made.push(...r.resources); added.push(s.text); }
        }
        if (!added.length) { res.push({ key, ok: false, error: 'google' }); continue; }
        target = { n: added.length, terms: added.slice(0, 30), resources: made.slice(0, 400) };
      }
      await record(db, site, sess, it, target, now).catch((e) => console.error('campfix record: ' + e.message));
      await audit(db, sess.user.id, 'campfix_' + it.code, true, site.id + ' ' + key.slice(0, 80));
      res.push({ key, ok: true });
    } catch (e) {
      await audit(db, sess.user.id, 'campfix_' + it.code, false, site.id + ' ' + String(e.message || e).slice(0, 100));
      res.push({ key, ok: false, error: 'google', detail: String(e.message || e).slice(0, 160) });
    }
  }
  await db.insert('ads_pull_runs', [{ client_id: site.id, source: 'server', ok: res.every((r) => r.ok), operations: res.length, rows: { kind: 'campfix', n: res.filter((r) => r.ok).length }, at: new Date(now).toISOString() }], { returning: false }).catch(() => {});
  return json({ ok: res.some((r) => r.ok), results: res });
}

// ── التراجع: نرجّع القيمة القديمة بالظبط ──
export async function dashCampfixUndo(req, env, db, sess, fetchImpl) {
  const b = await req.json().catch(() => ({}));
  const site = await loadSite(db, sess, b.site);
  if (!site) return notFound();
  if (!canManage(sess, site)) return json({ ok: false, error: 'role' }, 403);
  const cred = await credOf(db, site).catch(() => null);
  if (!cred) return json({ ok: false, error: 'not_linked' }, 409);
  const row = await db.one('analysis_fixes?client_id=' + eq(site.id) + '&id=' + eq(Number(b.id) || 0) + '&status=eq.tracking&select=id,action,target').catch(() => null);
  if (!row || !CODES.includes(row.action)) return json({ ok: false, error: 'not_found' }, 404);
  const tg = row.target || {}, api = await apiFor(env, site, cred, fetchImpl);
  const rn = tg.campaign && ID.test(tg.campaign) ? 'customers/' + cred.customer_id + '/campaigns/' + tg.campaign : null;
  try {
    if (row.action === 'partners_off' && rn) await api.mutate('campaigns:mutate', { operations: [{ update: { resourceName: rn, networkSettings: { targetSearchNetwork: true } }, updateMask: 'networkSettings.targetSearchNetwork' }] });
    else if (row.action === 'display_off' && rn) await api.mutate('campaigns:mutate', { operations: [{ update: { resourceName: rn, networkSettings: { targetContentNetwork: true } }, updateMask: 'networkSettings.targetContentNetwork' }] });
    else if (row.action === 'geo_presence' && rn) await api.mutate('campaigns:mutate', { operations: [{ update: { resourceName: rn, geoTargetTypeSetting: { positiveGeoTargetType: /^(PRESENCE_OR_INTEREST|SEARCH_INTEREST)$/.test(tg.before) ? tg.before : 'PRESENCE_OR_INTEREST' } }, updateMask: 'geoTargetTypeSetting.positiveGeoTargetType' }] });
    else if (row.action === 'pause_kw' && (tg.resources || []).length) await api.mutate('adGroupCriteria:mutate', { operations: tg.resources.slice(0, 20).map((r) => ({ update: { resourceName: r, status: 'ENABLED' }, updateMask: 'status' })) });
    else if (row.action === 'negatives' && (tg.resources || []).length) {
      for (let i = 0; i < tg.resources.length; i += 100) await api.mutate('campaignCriteria:mutate', { operations: tg.resources.slice(i, i + 100).map((r) => ({ remove: r })) });
      for (const tx of tg.terms || []) await db.req('DELETE', 'neg_decisions?client_id=' + eq(site.id) + '&text=' + eq(tx)).catch(() => {});
    } else return json({ ok: false, error: 'bad_request' }, 400);
  } catch (e) {
    await audit(db, sess.user.id, 'campfix_undo', false, site.id + ' ' + String(e.message || e).slice(0, 100));
    return json({ ok: false, error: 'google', detail: String(e.message || e).slice(0, 160) }, 502);
  }
  await db.update('analysis_fixes?id=' + eq(row.id), { status: 'closed', target: Object.assign({}, tg, { undone_at: new Date().toISOString(), undone_by: sess.user.id }) });
  await audit(db, sess.user.id, 'campfix_undo', true, site.id + ' ' + row.action);
  return json({ ok: true });
}
