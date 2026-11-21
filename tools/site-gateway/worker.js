// «بوابة التتبع» لأي موقع على Cloudflare (نسخة مستقلة: تتحط في Worker جديد بمسار الموقع/*) — 20 نوفمبر، والتركيب التلقائي 21 نوفمبر.
// الصفحات العامة (الدخول والتجربة) بتبعت زياراتها لهنا بدل ما تتصل بالسيرفر مباشرة، والبوابة بتضيف المكان والجهاز
// الحقيقيين (من Cloudflare) ومفتاح البوابة السري وتحوّلها لـ api.maestrolt.com/v1/collect. المفتاح مابيظهرش في أي صفحة.
// الإعدادات من لوحة Cloudflare (Settings ← Variables and Secrets): LT_SITE_ID (نص) و LT_GW_KEY (Secret). من غيرهم البوابة ساكتة ومفيش ضرر.
const COLLECT = 'https://api.maestrolt.com/v1/collect';
const MAX_BODY = 12 * 1024;

export async function gateway(req, env, ctx, fetchImpl) {
  const f = fetchImpl || fetch;
  if (req.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });
  if (!env.LT_SITE_ID || !env.LT_GW_KEY) return new Response(null, { status: 204 });
  const len = Number(req.headers.get('content-length') || 0);
  if (len > MAX_BODY) return new Response(null, { status: 413 });
  let text; try { text = await req.text(); } catch (e) { return new Response(null, { status: 400 }); }
  if (text.length > MAX_BODY) return new Response(null, { status: 413 });
  let p; try { p = JSON.parse(text); } catch (e) { return new Response(null, { status: 400 }); }
  if (!p || typeof p !== 'object' || Array.isArray(p)) return new Response(null, { status: 400 });
  let origin = req.headers.get('origin') || '';
  if (!origin) { try { origin = new URL(req.headers.get('referer') || '').origin; } catch (e) { origin = ''; } }
  const cf = req.cf || {};
  const meta = {
    ip: req.headers.get('cf-connecting-ip') || '', ua: req.headers.get('user-agent') || '', origin,
    country: cf.country || req.headers.get('cf-ipcountry') || '', city: [cf.city, cf.region].filter(Boolean).join(' '),
  };
  const send = f(COLLECT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ site_id: env.LT_SITE_ID, gw: env.LT_GW_KEY, meta, p }) }).catch(() => {});
  if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(send); else await send;
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}

// ── وضع التركيب التلقائي (21 نوفمبر · محمود: «أسهل طريقة للعميل غير المتخصص، ومن غير تنازل عن الدقة») ──
// الـWorker على المسار «الدومين/*»: كل صفحة HTML عامة بيتحط فيها سطر التتبع تلقائيًا قبل </body>، فالعميل مايلمسش ملفات موقعه.
// الدقة: نفس سكربت التتبع ونفس البوابة. مابنحطش السطر لو الصفحة فيها سكربت التتبع أصلًا، ولا في صفحات الدخول والإدارة والدفع،
// وأي ملف غير HTML (صور وCSS وJS) بيعدّي زي ما هو. ولو حصل أي خطأ، الموقع يفتح عادي من غير تتبع (مايتعطلش أبدًا).
export const TRACKER = 'https://app.maestrolt.com/lt/tracker.js';
const TAG = '<script src="' + TRACKER + '" data-ltp-cfg=\'{"endpoint":"/_lt/e","consentRequired":0,"trackAll":0,"version":"gw-2"}\'></script>';
const SKIP = /^\/(wp-admin|wp-login|admin|administrator|login|signin|sign-in|account|my-account|checkout|cart|dashboard|api)(\/|$)/i;
const MAX_HTML = 2 * 1024 * 1024;

export function injectTag(html) {
  if (html.indexOf('/lt/tracker.js') >= 0) return null;                 // موجود أصلًا
  const i = html.toLowerCase().lastIndexOf('</body>');
  return i < 0 ? null : html.slice(0, i) + TAG + html.slice(i);
}

export async function pass(req, env, ctx, fetchImpl) {
  const f = fetchImpl || fetch;
  const res = await f(req);
  try {
    const url = new URL(req.url);
    if (req.method !== 'GET' || res.status !== 200 || SKIP.test(url.pathname)) return res;
    if (!/text\/html/i.test(res.headers.get('content-type') || '')) return res;
    if (Number(res.headers.get('content-length') || 0) > MAX_HTML) return res;
    const body = res.clone();
    const html = await body.text();
    if (html.length > MAX_HTML) return res;
    const out = injectTag(html);
    if (out === null) return res;
    const h = new Headers(res.headers);
    h.delete('content-length'); h.delete('content-encoding'); h.delete('etag');
    return new Response(out, { status: res.status, statusText: res.statusText, headers: h });
  } catch (e) { return res; }
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname === '/_lt/e') return gateway(req, env, ctx);
    if (url.pathname.startsWith('/_lt/')) return new Response(null, { status: 404 });
    return pass(req, env, ctx);               // باقي الموقع: يعدّي، ويتحط في صفحاته سطر التتبع
  },
};
