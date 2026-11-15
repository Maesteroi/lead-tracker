// واجهة اللوحة (S03): الدخول · الجلسة · المواقع. اللوحة على app.maestrolt.com بتكلّم api.maestrolt.com بكوكي الجلسة،
// فهنا CORS لعنوان اللوحة بس (مش لأي عنوان)، وكل ردود الجلسة no-store.
import { json } from './util.js';
import { appOrigin, authStart, authCallback, authLogout, authStatus, getSession, checkCsrf } from './auth.js';
import { me, listSites, createSite, rotateKey, installStatus, loadSite, notFound } from './sites.js';
import { createPairCode } from './pairing.js';
import { connectSite } from './connect.js';
import { isPlatformAdmin, overview, updateOrg, telegramStatus, telegramSwitch } from './platform.js';
import { platformTeam, platformRoleSave, platformRoleDelete, platformInvite, platformInviteCancel, platformMember, platformAudit, teamList, teamInvite, teamInviteCancel, teamMember } from './team.js';
import { dashOverview, dashVisits, dashSession, dashLeads, dashSetup, dashOutcome, dashProtection, dashVerdict, dashReplay } from './dash.js';
import { dashAdsLink, dashAdsAccounts, dashAdsChoose, dashAdsUnlink } from './adslink.js';
import { dashConv, dashConvActions, dashConvAction, dashConvSend } from './convupload.js';
import { dashTg, dashTgInvite, dashTgRemove } from './tglinks.js';
import { tgTemplatesGet, tgTemplatesSave } from './tgtemplates.js';
import { previewText } from './notify.js';
import { contactLab } from './contactlab.js';
import { dashBilling, platformBilling, platformPlanSave, platformBillingSettings, platformMethodSave, platformOwnPayments, platformCountrySave, dashCoupon } from './billing.js';
import { platformPlanDelete, platformFeatureSave, platformCouponSave } from './plans.js';
import { dashPay, platformPayments, platformReceipt, platformPaymentReview } from './payments.js';
import { dashNegatives, dashNegativesExisting, dashNegativeDecide } from './negatives.js';
import { dashKeywords, dashKeywordDecide } from './keywords.js';
import { dashBrief, dashBriefSave } from './brief.js';
import { dashBlockIp, dashUnblockIp, dashBlocks, dashOwnDevice } from './blocks.js';
import { dashAnalysis, dashAnalysisFix, dashAnalysisDone } from './analysis.js';
import { dashStatement, dashStatementCsv } from './statement.js';
import { dashSettings, dashSettingsSave, logoutOthers } from './settings.js';
import { dashSuffix, dashSuffixSet } from './suffix.js';

const SITE_ACT = /^\/v1\/sites\/([A-Za-z0-9]{6,20})\/(rotate-key|install-status|pair-code)$/;
const ORG_ACT = /^\/v1\/platform\/orgs\/([^/]+)$/;

export const isAppPath = (p) => p === '/v1/me' || p.startsWith('/v1/auth/') || p === '/v1/sites' || p.startsWith('/v1/sites/') || p === '/v1/connect' || p.startsWith('/v1/platform/') || p.startsWith('/v1/dash/') || p === '/v1/team' || p.startsWith('/v1/team/');

function corsHeaders(req, env) {
  const o = req.headers.get('origin');
  if (!o || o !== appOrigin(env)) return null;
  return { 'Access-Control-Allow-Origin': o, 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'content-type, x-csrf-token', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Max-Age': '600', Vary: 'Origin' };
}

function finish(res, req, env, api) {
  const h = new Headers(res.headers);
  h.set('Cache-Control', 'no-store');
  if (api) { const c = corsHeaders(req, env); if (c) for (const k of Object.keys(c)) h.set(k, c[k]); }
  return new Response(res.body, { status: res.status, headers: h });
}

export async function handleApp(req, env, db, url, p, fetchImpl) {
  const m = req.method;
  // الدخول (تنقّل متصفح عادي، مش API)
  if (m === 'GET' && p === '/v1/auth/google/start') return finish(await authStart(req, env, db, url), req, env, false);
  if (m === 'GET' && p === '/v1/auth/google/callback') return finish(await authCallback(req, env, db, url, fetchImpl), req, env, false);

  // باقي الواجهة: API للوحة
  if (m === 'OPTIONS') {
    const c = corsHeaders(req, env);
    return c ? new Response(null, { status: 204, headers: c }) : new Response(null, { status: 403 });
  }
  const sess = await getSession(req, db);
  if (!sess) return finish(json({ ok: false, error: 'unauthenticated' }, 401), req, env, true);
  if (!checkCsrf(req, env, sess)) return finish(json({ ok: false, error: 'csrf' }, 403), req, env, true);

  let res;
  // لوحة إدارة المنصة: لمدير المنصة بس، وأي حد تاني بياخد 404
  if (p.startsWith('/v1/platform/')) {
    const oa = ORG_ACT.exec(p);
    if (!isPlatformAdmin(sess)) res = notFound();
    else if (m === 'GET' && p === '/v1/platform/overview') res = await overview(req, env, db, sess);
    else if (m === 'POST' && oa) res = await updateOrg(req, env, db, sess, oa[1]);
    else if (m === 'GET' && p === '/v1/platform/telegram') res = await telegramStatus(req, env, db, sess, fetchImpl);
    else if (m === 'POST' && p === '/v1/platform/telegram') res = await telegramSwitch(req, env, db, sess, fetchImpl);
    else if (m === 'GET' && p === '/v1/platform/team') res = await platformTeam(req, env, db, sess);
    else if (m === 'POST' && p === '/v1/platform/roles') res = await platformRoleSave(req, env, db, sess);
    else if (m === 'POST' && p === '/v1/platform/roles/delete') res = await platformRoleDelete(req, env, db, sess);
    else if (m === 'POST' && p === '/v1/platform/invites') res = await platformInvite(req, env, db, sess);
    else if (m === 'POST' && p === '/v1/platform/invites/cancel') res = await platformInviteCancel(req, env, db, sess);
    else if (m === 'POST' && p === '/v1/platform/members') res = await platformMember(req, env, db, sess);
    else if (m === 'GET' && p === '/v1/platform/audit') res = await platformAudit(req, env, db, sess);
    // شكل تنبيهات تليجرام لكل نوع مستلم (tgtemplates.js) + معاينة
    else if (m === 'GET' && p === '/v1/platform/tg-templates') res = await tgTemplatesGet(req, env, db, sess);
    else if (m === 'POST' && p === '/v1/platform/tg-templates') res = await tgTemplatesSave(req, env, db, sess);
    else if (m === 'POST' && p === '/v1/platform/tg-templates/preview') res = await tgPreview(req, sess);
    else if (m === 'GET' && p === '/v1/platform/contact-lab') res = await contactLab(req, env, db, sess);
    // الباقات والأسعار ووسائل الدفع (billing.js)
    else if (m === 'GET' && p === '/v1/platform/billing') res = await platformBilling(req, env, db, sess);
    else if (m === 'POST' && p === '/v1/platform/billing/plan') res = await platformPlanSave(req, env, db, sess);
    else if (m === 'POST' && p === '/v1/platform/billing/settings') res = await platformBillingSettings(req, env, db, sess);
    else if (m === 'POST' && p === '/v1/platform/billing/method') res = await platformMethodSave(req, env, db, sess);
    else if (m === 'POST' && p === '/v1/platform/billing/own') res = await platformOwnPayments(req, env, db, sess);
    else if (m === 'POST' && p === '/v1/platform/billing/country') res = await platformCountrySave(req, env, db, sess);
    else if (m === 'POST' && p === '/v1/platform/billing/plan/delete') res = await platformPlanDelete(req, env, db, sess);
    else if (m === 'POST' && p === '/v1/platform/billing/feature') res = await platformFeatureSave(req, env, db, sess);
    else if (m === 'POST' && p === '/v1/platform/billing/coupon') res = await platformCouponSave(req, env, db, sess);
    // المدفوعات: المراجعة بالإيصال (payments.js)
    else if (m === 'GET' && p === '/v1/platform/payments') res = await platformPayments(req, env, db, sess, url);
    else if (m === 'GET' && p === '/v1/platform/payments/receipt') res = await platformReceipt(req, env, db, sess, url);
    else if (m === 'POST' && p === '/v1/platform/payments/review') res = await platformPaymentReview(req, env, db, sess, fetchImpl);
    else res = notFound();
    return finish(res, req, env, true);
  }
  // فريق العميل جوه حسابه (team.js)
  if (p.startsWith('/v1/team')) {
    if (m === 'GET' && p === '/v1/team') res = await teamList(req, env, db, sess, url);
    else if (m === 'POST' && p === '/v1/team/invite') res = await teamInvite(req, env, db, sess);
    else if (m === 'POST' && p === '/v1/team/invite/cancel') res = await teamInviteCancel(req, env, db, sess);
    else if (m === 'POST' && p === '/v1/team/member') res = await teamMember(req, env, db, sess);
    else res = notFound();
    return finish(res, req, env, true);
  }
  // لوحة العميل: البيانات الحقيقية (dash.js)
  if (p.startsWith('/v1/dash/')) {
    if (m === 'GET' && p === '/v1/dash/overview') res = await dashOverview(req, env, db, sess, url);
    else if (m === 'GET' && p === '/v1/dash/visits') res = await dashVisits(req, env, db, sess, url);
    else if (m === 'GET' && p === '/v1/dash/session') res = await dashSession(req, env, db, sess, url);
    else if (m === 'GET' && p === '/v1/dash/leads') res = await dashLeads(req, env, db, sess, url);
    else if (m === 'GET' && p === '/v1/dash/setup') res = await dashSetup(req, env, db, sess);
    else if (m === 'POST' && p === '/v1/dash/outcome') res = await dashOutcome(req, env, db, sess);
    else if (m === 'GET' && p === '/v1/dash/protection') res = await dashProtection(req, env, db, sess, url);
    else if (m === 'POST' && p === '/v1/dash/verdict') res = await dashVerdict(req, env, db, sess);
    // «امنعه في جوجل» (استبعاد IP على مستوى الحساب بموافقة) · «هذه زيارتي» (blocks.js)
    else if (m === 'POST' && p === '/v1/dash/block') res = await dashBlockIp(req, env, db, sess, fetchImpl);
    else if (m === 'POST' && p === '/v1/dash/unblock') res = await dashUnblockIp(req, env, db, sess, fetchImpl);
    else if (m === 'GET' && p === '/v1/dash/blocks') res = await dashBlocks(req, env, db, sess, url);
    else if (m === 'POST' && p === '/v1/dash/own') res = await dashOwnDevice(req, env, db, sess);
    // حسابي والإعدادات (settings.js)
    else if (m === 'GET' && p === '/v1/dash/settings') res = await dashSettings(req, env, db, sess, url);
    else if (m === 'POST' && p === '/v1/dash/settings') res = await dashSettingsSave(req, env, db, sess);
    // كشف الحساب وملف طلب الاسترداد (statement.js)
    else if (m === 'GET' && p === '/v1/dash/statement') res = await dashStatement(req, env, db, sess, url);
    else if (m === 'GET' && p === '/v1/dash/statement.csv') res = await dashStatementCsv(req, env, db, sess, url);
    // «حلّل حملتك وأصلحها بضغطة» (analysis.js)
    else if (m === 'GET' && p === '/v1/dash/analysis') res = await dashAnalysis(req, env, db, sess, url, fetchImpl);
    else if (m === 'POST' && p === '/v1/dash/analysis/fix') res = await dashAnalysisFix(req, env, db, sess, fetchImpl);
    else if (m === 'POST' && p === '/v1/dash/analysis/done') res = await dashAnalysisDone(req, env, db, sess);
    else if (m === 'GET' && p === '/v1/dash/replay') res = await dashReplay(req, env, db, sess, url);
    // ربط جوجل أدز من اللوحة (adslink.js)
    else if (m === 'POST' && p === '/v1/dash/ads/link') res = await dashAdsLink(req, env, db, sess);
    else if (m === 'GET' && p === '/v1/dash/ads/accounts') res = await dashAdsAccounts(req, env, db, sess, url, fetchImpl);
    else if (m === 'POST' && p === '/v1/dash/ads/choose') res = await dashAdsChoose(req, env, db, sess);
    else if (m === 'POST' && p === '/v1/dash/ads/unlink') res = await dashAdsUnlink(req, env, db, sess);
    // رفع العملاء المؤكدين لجوجل أدز بموافقة العميل (convupload.js)
    else if (m === 'GET' && p === '/v1/dash/conv') res = await dashConv(req, env, db, sess, url);
    else if (m === 'GET' && p === '/v1/dash/conv/actions') res = await dashConvActions(req, env, db, sess, url, fetchImpl);
    else if (m === 'POST' && p === '/v1/dash/conv/action') res = await dashConvAction(req, env, db, sess, fetchImpl);
    else if (m === 'POST' && p === '/v1/dash/conv/send') res = await dashConvSend(req, env, db, sess, fetchImpl);
    // الاشتراك: الباقات بأسعار عملة الحساب ووسائل الدفع المتاحة (billing.js)
    else if (m === 'GET' && p === '/v1/dash/billing') res = await dashBilling(req, env, db, sess, url);
    else if (m === 'POST' && p === '/v1/dash/billing/pay') res = await dashPay(req, env, db, sess, fetchImpl);
    else if (m === 'POST' && p === '/v1/dash/billing/coupon') res = await dashCoupon(req, env, db, sess);
    // الكلمات السلبية: اقتراحات من عبارات البحث + قرار صاحب الموقع + الإضافة لجوجل بموافقته (negatives.js)
    else if (m === 'GET' && p === '/v1/dash/negatives') res = await dashNegatives(req, env, db, sess, url);
    else if (m === 'GET' && p === '/v1/dash/negatives/existing') res = await dashNegativesExisting(req, env, db, sess, url, fetchImpl);
    else if (m === 'POST' && p === '/v1/dash/negatives/decide') res = await dashNegativeDecide(req, env, db, sess, fetchImpl);
    // الكلمات الإيجابية: عبارات بتجيب عملاء ومش موجودة ككلمة ← تتضاف للمجموعة بموافقة صاحب الموقع (keywords.js)
    // فهم النشاط: اللي بنقدمه واللي مش بنقدمه، والكلمات المتكررة للتصنيف (brief.js)
    else if (m === 'GET' && p === '/v1/dash/brief') res = await dashBrief(req, env, db, sess, url);
    else if (m === 'POST' && p === '/v1/dash/brief') res = await dashBriefSave(req, env, db, sess);
    else if (m === 'GET' && p === '/v1/dash/keywords') res = await dashKeywords(req, env, db, sess, url);
    else if (m === 'POST' && p === '/v1/dash/keywords/decide') res = await dashKeywordDecide(req, env, db, sess, fetchImpl);
    // لاحقة الرابط في حساب الإعلانات: فحص · وضبط بضغطة واحدة (suffix.js)
    else if (m === 'GET' && p === '/v1/dash/suffix') res = await dashSuffix(req, env, db, sess, url, fetchImpl);
    else if (m === 'POST' && p === '/v1/dash/suffix') res = await dashSuffixSet(req, env, db, sess, fetchImpl);
    // تنبيهات تليجرام للموقع: رابط ربط من اللوحة (tglinks.js)
    else if (m === 'GET' && p === '/v1/dash/tg') res = await dashTg(req, env, db, sess, url);
    else if (m === 'POST' && p === '/v1/dash/tg/invite') res = await dashTgInvite(req, env, db, sess);
    else if (m === 'POST' && p === '/v1/dash/tg/remove') res = await dashTgRemove(req, env, db, sess);
    else res = notFound();
    return finish(res, req, env, true);
  }
  const act = SITE_ACT.exec(p);
  if (m === 'GET' && p === '/v1/me') res = await me(req, env, db, sess);
  else if (m === 'POST' && p === '/v1/auth/logout') res = await authLogout(req, env, db, sess);
  else if (m === 'POST' && p === '/v1/auth/logout-others') res = sess ? await logoutOthers(req, env, db, sess) : json({ ok: false, error: 'auth' }, 401);
  else if (m === 'GET' && p === '/v1/sites') res = await listSites(req, env, db, sess);
  else if (m === 'POST' && p === '/v1/sites') res = await createSite(req, env, db, sess);
  else if (m === 'POST' && p === '/v1/connect') res = await connectSite(req, env, db, sess, fetchImpl);
  else if (m === 'POST' && act && act[2] === 'rotate-key') res = await rotateKey(req, env, db, sess, act[1]);
  else if (m === 'POST' && act && act[2] === 'pair-code') { const site = await loadSite(db, sess, act[1]); res = site ? await createPairCode(req, env, db, sess, site) : notFound(); }
  else if (m === 'GET' && act && act[2] === 'install-status') res = await installStatus(req, env, db, sess, act[1]);
  else res = notFound();
  return finish(res, req, env, true);
}

export { authStatus };

// معاينة الشكل من غير حفظ (لوحة الإدارة)
async function tgPreview(req, sess) {
  const { FIELDS } = await import('./tgtemplates.js');
  const { hasPerm, isPlatform } = await import('./sites.js');
  if (!(isPlatform(sess) || hasPerm(sess, 'telegram'))) return json({ ok: false, error: 'not_found' }, 404);
  const b = await req.json().catch(() => ({}));
  const tpl = {}; for (const [k] of FIELDS) tpl[k] = !b.fields || b.fields[k] !== false;
  return json(Object.assign({ ok: true }, previewText(tpl)));
}
