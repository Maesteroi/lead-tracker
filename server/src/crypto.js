// تشفير توكنات جوجل أدز قبل ما تتخزن (AES-256-GCM).
// المفتاح TOKEN_ENC_KEY (32 بايت، base64) في أسرار الـWorker بس. من غيره أو لو طوله غلط: كل حاجة بتقف (مفيش تخزين نص صريح).
// aad بيربط النص المشفّر بصفّه (العميل + الحساب)، فلو اتنقل لصف تاني مايتفكش.

const te = new TextEncoder();
const td = new TextDecoder();
const b64 = (u8) => btoa(String.fromCharCode(...u8));
const unb64 = (s) => Uint8Array.from(atob(String(s)), (c) => c.charCodeAt(0));

async function importKey(env) {
  let bytes;
  try { bytes = unb64(env.TOKEN_ENC_KEY || ''); } catch (e) { bytes = new Uint8Array(0); }
  if (bytes.length !== 32) throw new Error('TOKEN_ENC_KEY missing or not 32 bytes');
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export function tokenKeyReady(env) {
  try { return unb64(env.TOKEN_ENC_KEY || '').length === 32; } catch (e) { return false; }
}

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
