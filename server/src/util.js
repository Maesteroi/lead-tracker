// أدوات مشتركة: الهاش، والرد، وتوحيد الأرقام والأوقات.

export async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text)));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// مقارنة بوقت ثابت (علشان التوقيت مايكشفش المفتاح)
export function safeEqual(a, b) {
  a = String(a || ''); b = String(b || '');
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}

export function randomToken(bytes) {
  const a = new Uint8Array(bytes || 24);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// كود ربط سهل يتكتب: 8 حروف من غير الحروف اللي بتتلخبط (0/O · 1/I)
export function pairCode() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const a = new Uint8Array(8);
  crypto.getRandomValues(a);
  return [...a].map((b) => abc[b % abc.length]).join('');
}

const AR_DIGITS = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9', '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9' };

// رقم موبايل ← صيغة دولية موحّدة (من غير +). cc = كود البلد الافتراضي للعميل (966 · 20 · 965 · 971)
// بيرجّع '' لو مش رقم (اسم جهة اتصال مثلاً)
export function toE164(raw, cc) {
  let s = String(raw || '').replace(/[٠-٩۰-۹]/g, (d) => AR_DIGITS[d]);
  if (/[A-Za-z؀-ۿ]/.test(s.replace(/[٠-٩۰-۹]/g, ''))) return '';   // فيه حروف = اسم مش رقم
  s = s.replace(/[^\d+]/g, '');
  if (!s) return '';
  if (s.startsWith('+')) s = s.slice(1);
  else if (s.startsWith('00')) s = s.slice(2);
  else if (s.startsWith('0')) s = String(cc || '966') + s.replace(/^0+/, '');
  else if (s.length <= 10 && cc) s = String(cc) + s;
  // مصر: 20 + 010… ← 2010…
  s = s.replace(/^200(?=1\d{9}$)/, '20');
  // السعودية: 966 + 05… ← 9665…
  s = s.replace(/^9660(?=5\d{8}$)/, '966');
  return /^\d{8,15}$/.test(s) ? s : '';
}

// «2026-10-28 18:10:00» بتوقيت الموقع ← ISO (UTC). tzOffsetMin = فرق التوقيت بالدقايق (السعودية 180)
export function localToIso(local, tzOffsetMin) {
  const m = String(local || '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) - (tzOffsetMin || 0) * 60000;
  return new Date(ms).toISOString();
}

// فرق التوقيت لمنطقة زمنية (بالدقايق) في لحظة معينة
export function tzOffsetMinutes(tz, at) {
  try {
    const d = at ? new Date(at) : new Date();
    const f = new Intl.DateTimeFormat('en-US', { timeZone: tz || 'Asia/Riyadh', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
    const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    return Math.round((asUtc - d.getTime()) / 60000);
  } catch (e) { return 180; }
}

// الأرقام جوه النص ← [رقم] (قبل ما يروح للموديل)
export function redactNumbers(text) {
  return String(text || '').replace(/[٠-٩۰-۹]/g, (d) => AR_DIGITS[d]).replace(/\+?\d[\d\s\-]{6,}\d/g, '[رقم]');
}
