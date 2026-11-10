// Maestro LT — Google Ads connect service (Cloudflare Worker)
// Same flow as the old Render service: /connect -> Google consent -> /callback -> save token in Apps Script.
// Settings (Worker > Settings > Variables and Secrets):
//   GOOGLE_CLIENT_ID      (variable)
//   GOOGLE_CLIENT_SECRET  (secret)
//   HMAC_SECRET           (secret)  must equal the Apps Script one
//   APPS_SCRIPT_URL       (secret)
//   REDIRECT_URI          (variable) default https://auth.maestrolt.com/callback
//   SCOPES                (variable, optional) default adwords only
//   LINK_SECRET           (secret, optional) when set, /connect needs &sig=HMAC("connect:"+site_id)

const enc = new TextEncoder();
const dec = new TextDecoder();
const COOKIE = 'lt_oauth';
const STATE_TTL_MS = 10 * 60 * 1000;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const randomHex = (n = 16) => toHex(crypto.getRandomValues(new Uint8Array(n)));

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toHex(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}

function safeEqual(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function b64uEncode(str) {
  let bin = '';
  enc.encode(str).forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64uDecode(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return dec.decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

function getCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return '';
}

const BASE_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};
const CLEAR_COOKIE = `${COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`;

function page(title, body, status = 200, clearCookie = false) {
  const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Maestro LT</title>
<style>body{font-family:Arial,Tahoma,sans-serif;text-align:center;padding:48px 16px;background:#f5f6f4;color:#14232b}
.box{background:#fff;border-radius:12px;padding:36px 28px;max-width:560px;margin:0 auto;box-shadow:0 2px 12px rgba(0,0,0,.08);line-height:1.9}
h1{font-size:1.5rem;margin:0 0 12px}a{color:#2438b5}small{color:#4d5f66}</style></head>
<body><main class="box"><h1>${title}</h1>${body}</main></body></html>`;
  const headers = new Headers(BASE_HEADERS);
  if (clearCookie) headers.append('Set-Cookie', CLEAR_COOKIE);
  return new Response(html, { status, headers });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

function missingConfig(env) {
  return ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'HMAC_SECRET', 'APPS_SCRIPT_URL'].filter((k) => !env[k]);
}

const redirectUri = (env) => env.REDIRECT_URI || 'https://auth.maestrolt.com/callback';

function home() {
  return page(
    'Maestro LT',
    `<p>خدمة ربط حساب Google Ads. لبدء الربط افتح اللينك اللي وصلك من فريقنا.</p>
<p><small>Google Ads connection service for Maestro LT customers.</small></p>
<p><a href="https://maestrolt.com/privacy" rel="noopener">سياسة الخصوصية</a> · <a href="https://maestrolt.com/terms" rel="noopener">الشروط</a></p>`
  );
}

async function connect(url, env) {
  const siteId = (url.searchParams.get('site_id') || '').trim();
  if (!siteId) return page('❌ خطأ', '<p>مفيش site_id</p>', 400);
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(siteId)) return page('❌ خطأ', '<p>site_id غير صالح</p>', 400);

  if (env.LINK_SECRET) {
    const sig = url.searchParams.get('sig') || '';
    const expected = await hmacHex(env.LINK_SECRET, 'connect:' + siteId);
    if (!safeEqual(sig, expected)) return page('❌ لينك غير صالح', '<p>اطلب لينك ربط جديد من فريقنا.</p>', 403);
  }

  const nonce = randomHex(16);
  const payload = b64uEncode(JSON.stringify({ s: siteId, n: nonce, t: Date.now() }));
  const state = payload + '.' + (await hmacHex(env.HMAC_SECRET, 'state:' + payload));

  const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  auth.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  auth.searchParams.set('redirect_uri', redirectUri(env));
  auth.searchParams.set('response_type', 'code');
  auth.searchParams.set('scope', env.SCOPES || 'https://www.googleapis.com/auth/adwords');
  auth.searchParams.set('access_type', 'offline');
  auth.searchParams.set('prompt', 'consent');
  auth.searchParams.set('state', state);

  return new Response(null, {
    status: 302,
    headers: {
      Location: auth.toString(),
      'Set-Cookie': `${COOKIE}=${nonce}; Max-Age=600; Path=/; HttpOnly; Secure; SameSite=Lax`,
      'Cache-Control': 'no-store',
    },
  });
}

async function callback(url, request, env) {
  const error = (url.searchParams.get('error') || '').trim();
  const code = (url.searchParams.get('code') || '').trim();
  const state = (url.searchParams.get('state') || '').trim();

  if (error) return page('❌ فشل الربط', `<p>السبب: ${esc(error)}</p>`, 400, true);
  if (!code || !state) return page('❌ خطأ', '<p>مفيش code أو state</p>', 400, true);

  const [payload, sig] = state.split('.');
  if (!payload || !sig || !safeEqual(sig, await hmacHex(env.HMAC_SECRET, 'state:' + payload))) {
    return page('❌ خطأ', '<p>الطلب غير صالح. افتح لينك الربط من جديد.</p>', 400, true);
  }
  let st;
  try { st = JSON.parse(b64uDecode(payload)); } catch { return page('❌ خطأ', '<p>الطلب غير صالح.</p>', 400, true); }
  if (!st || !st.s || Date.now() - Number(st.t) > STATE_TTL_MS) {
    return page('⌛ انتهت الجلسة', '<p>افتح لينك الربط من جديد.</p>', 400, true);
  }
  if (!safeEqual(getCookie(request, COOKIE), st.n)) {
    return page('❌ خطأ', '<p>افتح لينك الربط وكمّل من نفس المتصفح، وتأكد إن الكوكيز مفعّلة.</p>', 400, true);
  }
  const siteId = String(st.s);

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri(env),
      grant_type: 'authorization_code',
    }),
  });
  const tokens = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok) {
    console.error('token exchange failed:', tokens.error || tokenRes.status);
    return page('❌ خطأ', `<p>${esc(tokens.error_description || tokens.error || 'فشل الربط مع جوجل')}</p>`, 502, true);
  }
  if (!tokens.refresh_token) {
    return page(
      '⚠️ تحذير',
      `<p>مفيش refresh_token. غالباً الربط اتعمل قبل كده.</p>
<p>روح لحساب Google:<br><a href="https://myaccount.google.com/permissions" rel="noopener">myaccount.google.com/permissions</a><br>
وامسح صلاحية التطبيق وحاول تاني.</p>`,
      200,
      true
    );
  }

  // Same signature format the Apps Script already verifies: HMAC-SHA256(site_id + ':' + refresh_token)
  const signature = await hmacHex(env.HMAC_SECRET, siteId + ':' + tokens.refresh_token);
  const saveRes = await fetch(env.APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'save_token', site_id: siteId, refresh_token: tokens.refresh_token, signature }),
    redirect: 'follow',
  });
  const saveText = await saveRes.text();
  let saved = {};
  try { saved = JSON.parse(saveText); } catch { /* Apps Script may answer with plain text */ }
  if (!saveRes.ok || saved.ok === false || saved.success === false || saved.status === 'error') {
    console.error('save_token failed:', saveRes.status, saveText.slice(0, 200));
    return page('❌ خطأ', '<p>تم الربط مع جوجل لكن تعذّر حفظ البيانات عندنا. ابعت لنا لقطة من الصفحة وهنراجعها.</p>', 502, true);
  }

  return page('✅ تم الربط بنجاح!', '<p>تم ربط موقعك بحساب Google Ads.</p><p>تقدر تقفل الصفحة وترجع للموقع.</p>', 200, true);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (request.method !== 'GET' && request.method !== 'HEAD') return page('❌ خطأ', '<p>الطريقة غير مسموحة.</p>', 405);
      if (url.pathname === '/') return home();
      if (url.pathname === '/health') return json({ status: 'ok', timestamp: new Date().toISOString() });
      if (url.pathname === '/connect' || url.pathname === '/callback') {
        const missing = missingConfig(env);
        if (missing.length) {
          console.error('missing config:', missing.join(', '));
          return page('❌ خطأ', '<p>الخدمة غير مكتملة الإعداد.</p>', 500);
        }
        return url.pathname === '/connect' ? await connect(url, env) : await callback(url, request, env);
      }
      return page('❌ خطأ', '<p>الصفحة غير موجودة.</p>', 404);
    } catch (e) {
      console.error('unhandled:', e && e.message);
      return page('❌ خطأ', '<p>حصل خطأ غير متوقع. جرّب مرة تانية.</p>', 500, true);
    }
  },
};
