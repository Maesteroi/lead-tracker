// الذكاء الاصطناعي: تحويل المكالمة لنص + تحليل المحادثة أو المكالمة.
// المزوّد قابل للتغيير (أي مزوّد بواجهة متوافقة مع OpenAI): AI_BASE_URL · AI_API_KEY · AI_MODEL_CLASSIFY · AI_MODEL_TRANSCRIBE.
// اختيار المزوّد والموديل بيتراجع من الصفحات الرسمية وقت التفعيل (details/ai-models.md). من غير مفتاح: التحليل بيتأجل، ومفيش حاجة بتترفع.
import { redactNumbers } from './util.js';

export const PROMPT_VERSION = 'classify-v1';

export const LABELS = ['حجز', 'سأل سعر', 'مهتم', 'مش جاد', 'منافس', 'شكوى', 'سبام', 'غير واضح'];
export const OBJECTIONS = ['السعر', 'المكان', 'الموعد', 'الثقة', 'الجودة', 'مقارنة بمنافس', 'تاني', 'مفيش'];

const SYSTEM = `إنت محلل مبيعات لشركة خدمات أو متجر في السعودية أو الخليج أو مصر.
هتقرا محادثة واتساب أو نص مكالمة بين زبون (Z) وصاحب الشغل أو موظفه (B)، باللهجة.
رجّع JSON بس، من غير أي كلام تاني، بالشكل ده:
{"label": واحد من ${JSON.stringify(LABELS)},
 "confidence": رقم من 0 لـ1 (ثقتك في التصنيف),
 "seriousness": رقم صحيح من 1 لـ10 (جدية الزبون إنه يشتري أو يحجز),
 "objection": واحد من ${JSON.stringify(OBJECTIONS)} (أهم اعتراض أو تردد عند الزبون),
 "signals": قايمة من: "بعت لوكيشن"، "حدد ميعاد"، "اتفق على سعر"، "طلب فاتورة أو دفع"، "سأل عن الضمان"، "طلب يكلّم حد"، "قارن بمنافس"، "قال هيفكر",
 "outcome_hint": واحد من ["اتفقوا","لسه","رفض","مش واضح"],
 "summary": سطر واحد بالمصري يوصف اللي حصل}
قواعد: ماتخمّنش. لو المعلومة مش موجودة في الكلام قول "غير واضح" أو "مش واضح" وقلل الثقة. الأرقام في النص متشالة ومكتوب مكانها [رقم].`;

export function buildTranscript(messages) {
  return messages.map((m) => (m.direction === 'in' ? 'Z: ' : 'B: ') + (m.type && m.type !== 'text' ? '[' + m.type + '] ' : '') + redactNumbers(m.text || '')).join('\n').slice(0, 12000);
}

// تنضيف رد الموديل (لو رجّع حاجة برّه القايمة بتتصحح أو تتعلّم «غير واضح»)
export function parseClassification(text) {
  let o;
  try { o = JSON.parse(String(text).replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch (e) { return null; }
  const num = (v, lo, hi) => { const n = Number(v); return isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null; };
  return {
    label: LABELS.includes(o.label) ? o.label : 'غير واضح',
    confidence: num(o.confidence, 0, 1) ?? 0,
    seriousness: o.seriousness == null ? null : Math.round(num(o.seriousness, 1, 10)),
    objection: OBJECTIONS.includes(o.objection) ? o.objection : 'تاني',
    signals: Array.isArray(o.signals) ? o.signals.map(String).slice(0, 8) : [],
    outcome_hint: ['اتفقوا', 'لسه', 'رفض', 'مش واضح'].includes(o.outcome_hint) ? o.outcome_hint : 'مش واضح',
    summary: String(o.summary || '').slice(0, 300),
  };
}

export function aiEnabled(env) { return !!(env.AI_API_KEY && env.AI_BASE_URL && env.AI_MODEL_CLASSIFY); }

export async function classify(env, transcript, fetchImpl) {
  const f = fetchImpl || fetch;
  const res = await f(String(env.AI_BASE_URL).replace(/\/$/, '') + '/chat/completions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env.AI_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: env.AI_MODEL_CLASSIFY,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: transcript }],
    }),
  });
  if (!res.ok) throw new Error('ai ' + res.status + ': ' + (await res.text()).slice(0, 200));
  const j = await res.json();
  const out = parseClassification(j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content);
  return { result: out, usage: j.usage || {} };
}

export async function transcribe(env, bytes, mime, fetchImpl) {
  const f = fetchImpl || fetch;
  const fd = new FormData();
  const ext = /mpeg|mp3/.test(mime) ? 'mp3' : /wav/.test(mime) ? 'wav' : /ogg|opus/.test(mime) ? 'ogg' : 'm4a';
  fd.append('file', new Blob([bytes], { type: mime || 'audio/mp4' }), 'call.' + ext);
  fd.append('model', env.AI_MODEL_TRANSCRIBE);
  fd.append('language', 'ar');
  const res = await f(String(env.AI_BASE_URL).replace(/\/$/, '') + '/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env.AI_API_KEY },
    body: fd,
  });
  if (!res.ok) throw new Error('transcribe ' + res.status + ': ' + (await res.text()).slice(0, 200));
  const j = await res.json();
  return String(j.text || '');
}
