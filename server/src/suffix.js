// لاحقة الرابط في حساب الإعلانات (15 نوفمبر · محمود: «ايوا اتوماتيك»).
// بنكتبها إحنا في الحساب بضغطة واحدة من العميل (قاعدة 2: مفيش تعديل من غير موافقة)، بدل ما يحطها بإيده.
// • فايدتها: الكلمة ونوع المطابقة ومكان الضغطة والجهاز بيوصلوا مع الزيارة نفسها (لحظة التنبيه)، مش تاني يوم من click_view.
// • لو في الحساب لاحقة قبل كده (أداة تانية أو تتبع العميل): بنسيب بتاعتهم زي ما هي ونضيف بتاعتنا جنبها، وبنشيل بتاعتنا القديمة بس (lt_).
// • لاحقة الحملة بتغلب لاحقة الحساب: بنعرض الحملات اللي ليها لاحقة خاصة بيها ومابنلمسهاش.
// المرجع الرسمي:
//  • Customer.final_url_suffix «Only mutable in an update operation» (reference/rpc/v26/Customer)
//  • CustomerService.MutateCustomer ← POST /v26/customers/{customer_id}:mutate · body { operation: { update, updateMask } } (customer_service.proto v26)
//  • ValueTrack: {keyword} {matchtype} {network} {device} {loc_physical_ms} {campaignid} {adgroupid} (support.google.com/google-ads/answer/6305348)
import { eq } from './db.js';
import { json } from './util.js';
import { openToken } from './crypto.js';
import { accessToken, adsClient } from './gads.js';
import { loadSite, notFound, roleFor } from './sites.js';
import { audit } from './auth.js';

export const OURS = 'lt_kw={keyword}&lt_mt={matchtype}&lt_net={network}&lt_dev={device}&lt_loc={loc_physical_ms}&lt_cmp={campaignid}&lt_ag={adgroupid}';
const canManage = (sess, site) => ['owner', 'admin'].includes(roleFor(sess, site.org_id, site.id));

export const hasOurs = (s) => String(s || '').includes('lt_kw={keyword}');
// بتاعتهم + بتاعتنا (من غير تكرار)
export function mergeSuffix(current) {
  const theirs = String(current || '').replace(/^[?&]+/, '').split('&').filter((p) => p && !/^lt_[a-z]+=/.test(p));
  return theirs.concat([OURS]).join('&');
}

async function credOf(db, site) {
  return db.one('ads_credentials?client_id=' + eq(site.id) + '&status=eq.on&select=customer_id,login_customer_id,refresh_token_enc&order=updated_at.desc');
}
async function clientFor(env, site, cred, fetchImpl) {
  const access = await accessToken(env, await openToken(env, cred.refresh_token_enc, site.id + ':' + cred.customer_id), fetchImpl);
  return adsClient({ env, access, customerId: cred.customer_id, loginCustomerId: cred.login_customer_id, fetchImpl });
}
async function readState(api) {
  const c = ((await api.query('SELECT customer.final_url_suffix, customer.tracking_url_template FROM customer'))[0] || {}).customer || {};
  const camps = (await api.query("SELECT campaign.id, campaign.name, campaign.final_url_suffix FROM campaign WHERE campaign.status != 'REMOVED'").catch(() => []))
    .map((r) => r.campaign || {}).filter((x) => x.finalUrlSuffix);
  return { current: c.finalUrlSuffix || '', tracking: !!c.trackingUrlTemplate, campaigns_own: camps.map((x) => ({ name: x.name || String(x.id), ours: hasOurs(x.finalUrlSuffix) })) };
}
async function remember(db, site, cred, current) {
  await db.update('ads_credentials?client_id=' + eq(site.id) + '&customer_id=' + eq(cred.customer_id), { final_url_suffix: current, suffix_checked_at: new Date().toISOString() }).catch(() => {});
}

// الفحص: عمليتين قراية
export async function dashSuffix(req, env, db, sess, url, fetchImpl) {
  const site = await loadSite(db, sess, url.searchParams.get('site'));
  if (!site) return notFound();
  if (!canManage(sess, site)) return json({ ok: false, error: 'role' }, 403);
  const cred = await credOf(db, site).catch(() => null);
  if (!cred) return json({ ok: false, error: 'not_linked' }, 409);
  try {
    const api = await clientFor(env, site, cred, fetchImpl);
    const st = await readState(api);
    await remember(db, site, cred, st.current);
    return json(Object.assign({ ok: true, ours: hasOurs(st.current), proposed: mergeSuffix(st.current) }, st));
  } catch (e) { console.error('suffix read: ' + String(e && e.message || e).slice(0, 160)); return json({ ok: false, error: 'google' }, 502); }
}

// الضبط: بعد ضغطة العميل بس
export async function dashSuffixSet(req, env, db, sess, fetchImpl) {
  const b = await req.json().catch(() => ({}));
  const site = await loadSite(db, sess, b.site);
  if (!site) return notFound();
  if (!canManage(sess, site)) return json({ ok: false, error: 'role' }, 403);
  const cred = await credOf(db, site).catch(() => null);
  if (!cred) return json({ ok: false, error: 'not_linked' }, 409);
  let api, before = '', after = '';
  try {
    api = await clientFor(env, site, cred, fetchImpl);
    before = (await readState(api)).current;
    after = mergeSuffix(before);
    if (after !== before) await api.mutate(':mutate', { operation: { update: { resourceName: 'customers/' + cred.customer_id, finalUrlSuffix: after }, updateMask: 'finalUrlSuffix' } });
    await remember(db, site, cred, after);
  } catch (e) {
    const msg = String(e && e.message || e).slice(0, 300);
    await audit(db, sess.user.id, 'suffix_set', false, site.id + ' ' + msg.slice(0, 120));
    return json({ ok: false, error: 'google', detail: msg }, 502);
  }
  await db.insert('ads_pull_runs', [{ client_id: site.id, source: 'server', ok: true, operations: api.ops, rows: { kind: 'suffix_set', changed: after !== before }, at: new Date().toISOString() }], { returning: false }).catch(() => {});
  await audit(db, sess.user.id, 'suffix_set', true, site.id + (before ? ' kept: ' + before.slice(0, 80) : ''));
  return json({ ok: true, suffix: after, kept: before && before !== after ? before.split('&').filter((p) => p && !/^lt_[a-z]+=/.test(p)).join('&') : '' });
}
