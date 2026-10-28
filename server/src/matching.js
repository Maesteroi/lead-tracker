// المطابقة: التواصل ده جه من أنهي ضغطة؟ (claude/maestro/details/matching.md)
// دوال صافية من غير قاعدة بيانات، علشان تتختبر لوحدها.

// كود المطابقة اللي البلجن بيحطه في رسالة الواتساب: «— كود #MK83»
export function extractCode(text) {
  const s = String(text || '').replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  const m = s.match(/#\s?([A-Z0-9]{4})(?![A-Za-z0-9])/);
  return m ? m[1] : '';
}

// الواتساب: رسالة أول محادثة ← الضغطة
// clicks = ضغطات واتساب للعميل [{id, match_code, at}] · firstAt = وقت أول رسالة · codeInText = الكود لو موجود
export function matchWhatsApp({ firstAt, codeInText, clicks, windowMin }) {
  windowMin = windowMin || 10;
  if (codeInText) {
    const c = clicks.find((k) => String(k.match_code || '').replace(/^#/, '') === codeInText);
    if (c) return { method: 'code', confidence: 'confirmed', click: c };
  }
  const t = new Date(firstAt).getTime();
  const near = clicks.filter((k) => {
    const d = (t - new Date(k.at).getTime()) / 60000;
    return d >= -0.5 && d <= windowMin;   // نص دقيقة سماح لفرق الساعات
  }).sort((a, b) => new Date(b.at) - new Date(a.at));
  if (near.length === 1) return { method: 'time', confidence: 'likely', click: near[0] };
  if (near.length > 1) return { method: 'time', confidence: 'weak', click: near[0] };
  return { method: 'none', confidence: 'none', click: null };
}

// المكالمات: مكالمة واردة ← ضغطة اتصال على الموقع قبلها بـ0–90 ثانية
export function matchCall({ startedAt, direction, clicks, windowS }) {
  windowS = windowS || 90;
  if (direction !== 'in') return { method: 'none', confidence: 'none', click: null };
  const t = new Date(startedAt).getTime();
  const near = clicks.filter((k) => {
    const d = (t - new Date(k.at).getTime()) / 1000;
    return d >= -10 && d <= windowS;
  }).sort((a, b) => new Date(b.at) - new Date(a.at));
  if (near.length === 1) return { method: 'time', confidence: 'confirmed', click: near[0] };
  if (near.length > 1) return { method: 'time', confidence: 'likely', click: near[0] };
  return { method: 'none', confidence: 'none', click: null };
}

// جدية المكالمة من مدتها (الحدود بتتظبط لكل عميل)
export function callSeriousness(status, durationS, th) {
  th = th || {};
  if (status !== 'answered') return null;
  if (durationS >= (th.serious_call_s || 120)) return 'serious';
  if (durationS >= (th.weak_call_s || 30)) return 'weak';
  return 'not_serious';
}

// أول رد بشري (بالثواني) من رسايل المحادثة مرتبة بالوقت
export function firstReplySeconds(messages) {
  const sorted = [...messages].sort((a, b) => new Date(a.at) - new Date(b.at));
  const firstIn = sorted.find((m) => m.direction === 'in');
  if (!firstIn) return null;
  const reply = sorted.find((m) => m.direction === 'out' && new Date(m.at) >= new Date(firstIn.at));
  return reply ? Math.round((new Date(reply.at) - new Date(firstIn.at)) / 1000) : null;
}

// محادثة جديدة ولا تكملة؟ (أكتر من 7 أيام سكوت = محادثة جديدة)
export function isNewConversation(lastMessageAt, at, gapDays) {
  if (!lastMessageAt) return true;
  return (new Date(at) - new Date(lastMessageAt)) / 86400000 > (gapDays || 7);
}
