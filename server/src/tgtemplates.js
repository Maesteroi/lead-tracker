// شكل تنبيهات تليجرام لكل نوع مستلم (13 نوفمبر، موافقة محمود على الخطة):
//   platform = إدارة المنصة (كل التفاصيل) · owner = صاحب الموقع والمديرين (شكل بسيط) · staff = الموظف.
// كل جزء في الرسالة ليه مفتاح «يظهر / لا يظهر» من لوحة الإدارة، ومعاينة حية. الافتراضي بسيط للعميل.
import { json } from './util.js';
import { hasPerm, isPlatform } from './sites.js';
import { audit } from './auth.js';

export const AUDIENCES = ['platform', 'owner', 'staff'];
export const FIELDS = [
  ['start', 'بداية الزيارة ومدتها'], ['visit_no', 'رقم الزيارة (أولى · ثانية …)'], ['pages', 'الصفحات التي فتحها'], ['store', 'المنتجات والسلة والشراء'],
  ['buttons', 'الأزرار الأخرى التي ضغطها'], ['contact', 'ضغطة الواتساب أو الاتصال ورمزها'], ['btn_detail', 'تفاصيل الزر (أهميته ونصه ومكانه في الصفحة)'],
  ['target_num', 'الرقم الذي ضغط عليه'], ['strength', 'احتمالية التواصل'], ['source', 'المصدر (إعلان جوجل · بحث جوجل …)'], ['keyword', 'الكلمة أو العبارة'],
  ['gclid', 'رقم النقرة من جوجل (GCLID)'], ['utm', 'معلمات الحملة (UTM)'], ['device', 'الجهاز'], ['place', 'المكان'], ['isp', 'شركة الإنترنت'],
  ['outside', 'ملاحظة «خارج النطاق المستهدف»'], ['actions', 'أزرار النتيجة (تم الاتفاق · يفكّر …)'],
];
const ALL = Object.fromEntries(FIELDS.map(([k]) => [k, true]));
const SIMPLE = Object.assign({}, ALL, { btn_detail: false, target_num: false, gclid: false, utm: false, isp: false });
export const DEFAULTS = { platform: ALL, owner: SIMPLE, staff: Object.assign({}, SIMPLE, { keyword: false }) };
export const ALL_ON = ALL;

let cache = null, cacheAt = 0;
export async function loadTemplates(db) {
  if (cache && Date.now() - cacheAt < 60000) return cache;
  const out = {};
  let rows = [];
  try { rows = (await db.select('tg_templates?select=audience,fields')) || []; } catch (e) { /* قبل 0016 */ }
  for (const a of AUDIENCES) {
    const r = rows.find((x) => x.audience === a);
    out[a] = Object.assign({}, DEFAULTS[a], clean(r && r.fields));
  }
  cache = out; cacheAt = Date.now();
  return out;
}
export const resetTemplateCache = () => { cache = null; };
function clean(f) { const o = {}; if (f && typeof f === 'object') for (const [k] of FIELDS) if (typeof f[k] === 'boolean') o[k] = f[k]; return o; }

// ── لوحة الإدارة ──
const canEdit = (sess) => isPlatform(sess) || hasPerm(sess, 'telegram');

export async function tgTemplatesGet(req, env, db, sess) {
  if (!canEdit(sess)) return json({ ok: false, error: 'not_found' }, 404);
  resetTemplateCache();
  return json({ ok: true, fields: FIELDS.map(([key, label]) => ({ key, label })), audiences: await loadTemplates(db), defaults: DEFAULTS });
}

export async function tgTemplatesSave(req, env, db, sess) {
  if (!canEdit(sess)) return json({ ok: false, error: 'not_found' }, 404);
  const b = await req.json().catch(() => ({}));
  if (!AUDIENCES.includes(b.audience)) return json({ ok: false, error: 'bad_request' }, 400);
  const fields = b.reset === true ? {} : clean(b.fields);
  await db.insert('tg_templates', [{ audience: b.audience, fields, updated_by: sess.user.id, updated_at: new Date().toISOString() }], { onConflict: 'audience', merge: true, returning: false });
  resetTemplateCache();
  await audit(db, sess.user.id, 'platform_tg_template', true, b.audience);
  return json({ ok: true, audience: b.audience, fields: (await loadTemplates(db))[b.audience] });
}
