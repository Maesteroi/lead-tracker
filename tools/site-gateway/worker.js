// «بوابة التتبع» لأي موقع على Cloudflare (نسخة مستقلة: تتحط في Worker جديد بمسار الموقع/_lt/*) — 20 نوفمبر.
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

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname === '/_lt/e') return gateway(req, env, ctx);
    return new Response(null, { status: 404 });   // المسار /_lt/* بس هو اللي بيوصل هنا
  },
};
