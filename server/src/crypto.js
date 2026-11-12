// تشفير توكنات جوجل أدز قبل ما تتخزن (AES-256-GCM).
// المفتاح TOKEN_ENC_KEY (32 بايت، base64) في أسرار الـWorker بس. من غيره أو لو طوله غلط: كل حاجة بتقف (مفيش تخزين نص صريح).
// aad بيربط النص المشفّر بصفّه (العميل + الحساب)، فلو اتنقل لصف تاني مايتفكش.

const te = new TextEncoder();
const td = new TextDecoder();
const b64 = (u8) => btoa(String.fromCharCode(...u8));
const unb64 = (s) => Uint8Array.from(atob(String(s)), (c) => c.charCodeAt(0));

// TOKEN_ENC_KEY: يا إما 32 بايت base64 (44 حرف)، يا إما عبارة سهلة تتفتكر (20 حرف أو أكتر، قرار محمود 12 نوفمبر:
// «لو عملته 44 أكيد هانساه»). العبارة بتتحوّل لمفتاح 32 بايت بـSHA-256. نفس العبارة = نفس المفتاح دايماً.
export const MIN_PASSPHRASE = 20;
function rawKey(env) {
  const v = String(env.TOKEN_ENC_KEY || '');
  if (/^[A-Za-z0-9+/]{43}=$/.test(v)) { try { const b = unb64(v); if (b.length === 32) return { b64: b }; } catch (e) { /* عبارة */ } }
  return v.length >= MIN_PASSPHRASE ? { phrase: v } : null;
}
async function importKey(env) {
  const k = rawKey(env);
  if (!k) throw new Error('TOKEN_ENC_KEY missing or too short');
  const bytes = k.b64 || new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode('maestro-lt/token-enc/v1|' + k.phrase)));
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export function tokenKeyReady(env) { return !!rawKey(env); }

export async function sealToken(env, plain, aad) {
  const key = await importKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: te.encode(String(aad || '')) }, key, te.encode(String(plain)));
  return 'v1.' + b64(iv) + '.' + b64(new Uint8Array(ct));
}

export async function openToken(env, sealed, aad) {
  const parts = String(sealed || '').split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') throw new Error('token: bad format');
  const key = await importKey(env);
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(parts[1]), additionalData: te.encode(String(aad || '')) }, key, unb64(parts[2]));
    return td.decode(pt);
  } catch (e) {
    throw new Error('token: cannot decrypt');   // مفتاح غلط أو الصف اتغيّر — من غير أي تفاصيل
  }
}
