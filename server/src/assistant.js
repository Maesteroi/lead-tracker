// المساعد الذكي (16 نوفمبر · claude/briefs/2026-11-16-ai-assistant.md).
// 3 مهام، ولكل مهمة موديل يختاره الأدمن: brief (يبني ملف نشاطك بالمحادثة) · answer (يجاوب من أرقامك) · suggest (يقترح تحسينات).
// • Claude بالمكتبة الرسمية (@anthropic-ai/sdk). المفتاح من الأدمن (متشفّر في ai_settings) أو من أسرار Cloudflare (ANTHROPIC_API_KEY).
// • أدوات قراية بس لبيانات الموقع اللي العميل فيه، بنفس صلاحيات اللوحة. مفيش ولا أداة بتعدّل في جوجل أدز: التعديل من زرار الموافقة في صفحته (قاعدة 2).
// • ملف النشاط: المساعد بيقترح (propose_business_file)، والحفظ بضغطة العميل من نفس فحص البريف (المجالات الممنوعة).
// • التعليم المستمر: 👍/👎 والتصحيحات بتتحفظ دروس للموقع، ودروس الأدمن للكل، وبتدخل في تعليمات المساعد في كل محادثة.
// • حد يومي للرسايل لكل موقع، وكل نداء بيتسجل بتكلفته في ai_calls.
import Anthropic from '@anthropic-ai/sdk';
import { eq } from './db.js';
import { json } from './util.js';
import { sealToken, openToken } from './crypto.js';
import { loadSite, notFound, isPlatform, hasPerm, roleFor } from './sites.js';
import { audit } from './auth.js';
import { loadBrief } from './brief.js';
import { bannedIn } from './verticals.js';

export const TASKS = ['brief', 'answer', 'suggest'];
// الأسعار بالدولار لكل مليون توكن (دخل / خرج) من جدول Anthropic · للتسجيل التقريبي للتكلفة
export const MODELS = { 'claude-opus-5-5': [4, 20], 'claude-sonnet-5-5': [2, 10], 'claude-haiku-5-5': [0.1, 0.5] };
const DEFAULT_MODELS = { brief: 'claude-opus-5-5', answer: 'claude-opus-5-5', suggest: 'claude-opus-5-5' };
const MAX_STEPS = 6, MAX_HISTORY = 30, MAX_MSG = 2000;
const AAD = 'ai:settings';
const superOnly = (sess) => isPlatform(sess) || hasPerm(sess, 'billing');
const canManage = (sess, site) => ['owner', 'admin'].includes(roleFor(sess, site.org_id, site.id));
const r4 = (v) => Math.round((Number(v) || 0) * 10000) / 10000;

async function settingsOf(db) {
  const s = await db.one('ai_settings?id=eq.1&select=*').catch(() => null);
  return Object.assign({ api_key_enc: null, key_last4: null, models: DEFAULT_MODELS, daily_limit: 40, enabled: true }, s || {}, { models: Object.assign({}, DEFAULT_MODELS, (s && s.models) || {}) });
}
async function keyOf(env, s) {
  if (s.api_key_enc) { try { return await openToken(env, s.api_key_enc, AAD); } catch (e) { console.error('ai key open'); } }
  return env.ANTHROPIC_API_KEY || null;
}

// ── تعليمات المساعد: ثابتة (بتتخزّن مؤقتًا) + دروس + المهمة ──
const SYSTEM = `أنت «مساعد مايسترو»، مساعد ذكي داخل منصة Maestro LT لأصحاب الأنشطة التي تعلن على جوجل أدز في مصر والسعودية والخليج.
المنصة تحمي ميزانية الإعلان من النقرات المشبوهة، وتقيس من صار عميلًا فعليًا: تواصل ← محادثة فعلية ← «تم» (اتفاق).

قواعد ثابتة:
- اكتب بنفس لغة ولهجة صاحب النشاط، بجمل قصيرة وواضحة، بلا مصطلحات تقنية إلا إذا سأل.
- لا تخترع أي رقم. كل رقم تذكره يأتي من أداة، واذكر من أي صفحة في المنصة (مثل «كشف الحساب» أو «الكلمات المفتاحية»).
- المقياس هو العميل الفعلي و«تم»، لا النقرات ولا الزيارات.
- لا تعدّل أي شيء في حساب الإعلانات. إذا اقترحت تعديلًا، قل أين يضغط صاحب النشاط زر الموافقة في المنصة.
- المنصة لا تخدم: القروض، الخمور، المواعدة، أدوية الإجهاض، الشيوخ الروحانيين، المساج. إن كان النشاط منها، اعتذر بلطف ولا تكمل.
- لا تطلب كلمات مرور أو أرقام بطاقات أو أكواد تحقق أبدًا.
- إن لم تكن البيانات كافية، قل ذلك صراحة واقترح ما يجعلها كافية (مثل تسجيل نتيجة كل تواصل).`;

const TASK_TEXT = {
  brief: `مهمتك الآن: بناء «ملف النشاط» بالمحادثة. اسأل سؤالًا واحدًا في كل مرة، وابدأ بقراءة الملف الحالي (get_business_file).
اعرف: ماذا يقدم بالضبط، وما لا يقدمه (ليتجنب من يبحث عنه)، والمدن، ومخاوف العميل قبل الشراء والوعد الذي يطمئنه، والأسعار التقريبية، والمنافسين.
عندما تكتمل الصورة، استدعِ propose_business_file بالملخص، وقل له: راجعه واضغط «احفظ في ملفك».`,
  answer: 'مهمتك الآن: الإجابة عن أسئلة صاحب النشاط من أرقامه، باستخدام الأدوات. ابدأ بالإجابة المباشرة ثم السبب.',
  suggest: `مهمتك الآن: اقتراح أهم 3 تحسينات لهذا الشهر، مرتبة بأثرها على «تم». استخدم الأدوات أولًا.
لكل اقتراح: المشكلة بالأرقام، والحل، وأين يضغط في المنصة لتنفيذه بموافقته.`,
};

// ── الأدوات (قراية بس) ──
const TOOLS = [
  { name: 'get_business_file', description: 'Read the business file (what the business offers, does not offer, customer fears and promises, about text).', input_schema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'get_journey', description: 'Last 30 days customer journey from ads: spend, ad visits, real visits, contacts, real conversations, deals done, and the biggest leak.', input_schema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'get_keywords_by_outcome', description: 'Keywords and search terms judged by real outcome (done, real conversation), the negative and positive suggestions with their money, and the search groups by spend.', input_schema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'get_statement', description: 'Account statement for the last 30 days: billed clicks and where they went (from the ad itself, reached the site, suspicious, never loaded, refunded), spend and what can still be claimed.', input_schema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'propose_business_file', description: 'Propose an updated business file for the owner to review and save with one press. Does not save anything by itself.',
    input_schema: { type: 'object', additionalProperties: false, properties: {
      about: { type: 'string', description: 'Two or three sentences in the owner language about the business and its customer.' },
      offer: { type: 'array', items: { type: 'string' }, description: 'Words and short phrases that describe what the business really offers.' },
      exclude: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { word: { type: 'string' }, why: { type: 'string' } }, required: ['word', 'why'] }, description: 'What people search for that the business does not offer, with why.' },
      fears: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { fear: { type: 'string' }, promise: { type: 'string' } }, required: ['fear', 'promise'] }, description: 'Customer fears before buying and the promise that answers each.' },
    }, required: ['about', 'offer', 'exclude', 'fears'] } },
];

async function credOf(db, site) {
  return db.one('ads_credentials?client_id=' + eq(site.id) + '&status=eq.on&select=customer_id,login_customer_id,refresh_token_enc,currency&order=updated_at.desc').catch(() => null);
}
async function runTool(name, input, ctx) {
  const { db, site } = ctx;
  try {
    if (name === 'get_business_file') return (await loadBrief(db, site.id)) || { empty: true };
    if (name === 'get_journey') {
      const { windowData, funnelOf, leakOf } = await import('./analysis.js');
      const t = Date.now(), w = await windowData(db, site, t - 30 * 864e5);
      const f = funnelOf(w.sessions, w.leads, w.daily, t - 30 * 864e5, t + 1);
      return { days: 30, journey: f, biggest_leak: leakOf(f), page: 'تحليل الحملة' };
    }
    if (name === 'get_keywords_by_outcome') {
      const cred = await credOf(db, site); if (!cred) return { linked: false, note: 'Google Ads is not linked for this site.' };
      const { suggest } = await import('./negatives.js');
      const s = await suggest(db, site, cred);
      return { level: s.level, target_cost_per_result: s.target, totals: s.totals, keywords: s.keywords.slice(0, 15), negatives: s.suggestions.slice(0, 10).map((x) => ({ text: x.text, match: x.match, reason: x.reason, cost: x.cost, conv: x.conv, real: x.real, won: x.won })),
        groups: s.groups.slice(0, 10), watch: s.watch, currency: cred.currency, page: 'الكلمات المفتاحية' };
    }
    if (name === 'get_statement') {
      const { build } = await import('./statement.js');
      const { periodOf } = await import('./dash.js');
      const r = await build(db, site, periodOf(new URL('https://x/?range=30'), Date.now()));
      delete r.rows; return Object.assign({ page: 'كشف الحساب' }, r);
    }
    if (name === 'propose_business_file') {
      const p = { about: String(input.about || '').slice(0, 500), offer: (input.offer || []).map(String).slice(0, 40), exclude: (input.exclude || []).slice(0, 40), fears: (input.fears || []).slice(0, 10) };
      ctx.proposal = p;
      return { ok: true, shown_to_owner: true };
    }
    return { error: 'unknown tool' };
  } catch (e) { console.error('ai tool ' + name + ': ' + String(e && e.message || e).slice(0, 120)); return { error: 'not available now' }; }
}

async function lessonsFor(db, siteId) {
  const q = (f) => db.select('ai_lessons?active=eq.true&' + f + '&select=text,client_id&order=created_at.desc&limit=20').catch(() => []);
  const [mine, all] = await Promise.all([q('client_id=' + eq(siteId)), q('client_id=is.null')]);
  const rows = (mine || []).concat(all || []);
  return rows.map((r) => (r.client_id ? '- (هذا النشاط) ' : '- ') + r.text).join('\n');
}

// ── المحادثة ──
export async function dashAssistant(req, env, db, sess, fetchImpl) {
  const b = await req.json().catch(() => ({}));
  const site = await loadSite(db, sess, b.site);
  if (!site) return notFound();
  const task = TASKS.includes(b.task) ? b.task : 'answer';
  const text = String(b.message || '').trim().slice(0, MAX_MSG);
  if (!text) return json({ ok: false, error: 'empty' }, 400);
  const s = await settingsOf(db);
  if (!s.enabled) return json({ ok: false, error: 'off' }, 409);
  const key = await keyOf(env, s);
  if (!key) return json({ ok: false, error: 'not_configured' }, 409);
  // الحد اليومي لكل موقع
  const since = new Date(Date.now() - 864e5).toISOString();
  const used = ((await db.select('ai_calls?client_id=' + eq(site.id) + '&task=like.assistant*&at=gte.' + since + '&select=id&limit=2000').catch(() => [])) || []).length;
  if (s.daily_limit && used >= s.daily_limit) return json({ ok: false, error: 'limit', limit: s.daily_limit }, 429);
  if (bannedIn([text])) return json({ ok: true, reply: 'عذرًا، المنصة لا تخدم هذا المجال.', banned: true });
  let chat = null;
  if (b.chat_id && /^[0-9a-f-]{36}$/i.test(String(b.chat_id))) chat = await db.one('ai_chats?id=' + eq(b.chat_id) + '&client_id=' + eq(site.id) + '&select=*').catch(() => null);
  const history = chat ? (chat.messages || []).slice(-MAX_HISTORY) : [];
  const model = MODELS[s.models[task]] ? s.models[task] : DEFAULT_MODELS[task];
  const lessons = await lessonsFor(db, site.id);
  const system = [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: TASK_TEXT[task] + '\n\nاسم النشاط/الموقع: ' + (site.name || '') + (lessons ? '\n\nدروس من تصحيحات سابقة (التزم بها):\n' + lessons : '') }];
  const messages = history.map((m) => ({ role: m.role, content: m.text || '…' })).concat([{ role: 'user', content: text }]);
  const client = new Anthropic({ apiKey: key, fetch: fetchImpl || undefined, maxRetries: 1 });
  const ctx = { db, site, proposal: null };
  const usage = { input: 0, output: 0, cache_read: 0, cache_write: 0 };
  let reply = '', ok = true, refused = false;
  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const params = { model, max_tokens: 4000, system, tools: TOOLS, messages };
      const res = model === 'claude-haiku-5-5' ? await client.messages.create(params)
        : await client.beta.messages.create(Object.assign({ betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }, params));   // رفض أمان = إعادة تلقائية على موديل بديل
      const u = res.usage || {};
      usage.input += u.input_tokens || 0; usage.output += u.output_tokens || 0; usage.cache_read += u.cache_read_input_tokens || 0; usage.cache_write += u.cache_creation_input_tokens || 0;
      if (res.stop_reason === 'refusal') { refused = true; reply = 'عذرًا، لا أستطيع المساعدة في هذا.'; break; }
      const texts = res.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim();
      const calls = res.content.filter((c) => c.type === 'tool_use');
      if (res.stop_reason === 'pause_turn') { messages.push({ role: 'assistant', content: res.content }); continue; }
      if (!calls.length) { reply = texts; break; }
      messages.push({ role: 'assistant', content: res.content });
      const results = [];
      for (const c of calls) results.push({ type: 'tool_result', tool_use_id: c.id, content: JSON.stringify(await runTool(c.name, c.input || {}, ctx)).slice(0, 30000) });
      messages.push({ role: 'user', content: results });
      if (step === MAX_STEPS - 1) reply = texts || 'لم أكمل الإجابة. اسألني بطريقة أخرى.';
    }
  } catch (e) {
    ok = false;
    const status = e instanceof Anthropic.APIError ? e.status : 0;
    console.error('assistant: ' + status + ' ' + String(e && e.message || e).slice(0, 160));
    await logCall(db, site.id, task, model, usage, false);
    return json({ ok: false, error: status === 401 ? 'bad_key' : status === 429 ? 'busy' : 'ai' }, 502);
  }
  await logCall(db, site.id, task, model, usage, ok && !refused);
  const turns = history.concat([{ role: 'user', text, at: new Date().toISOString() }, { role: 'assistant', text: reply, at: new Date().toISOString(), proposal: ctx.proposal || undefined }]).slice(-MAX_HISTORY);
  if (chat) await db.update('ai_chats?id=' + eq(chat.id), { messages: turns, updated_at: new Date().toISOString() });
  else { const row = (await db.insert('ai_chats', [{ client_id: site.id, user_id: sess.user.id, task, messages: turns }])) || []; chat = row[0] || { id: null }; }
  return json({ ok: true, chat_id: chat.id, reply, proposal: ctx.proposal, turn: turns.length - 1, model });
}
async function logCall(db, siteId, task, model, u, ok) {
  const [pi, po] = MODELS[model] || [0, 0];
  const cost = ((u.input + u.cache_write * 1.25 + u.cache_read * 0.1) * pi + u.output * po) / 1e6;
  await db.insert('ai_calls', [{ client_id: siteId, task: 'assistant:' + task, model, input_units: u.input + u.cache_read + u.cache_write, output_units: u.output, cost_usd: r4(cost), ok, at: new Date().toISOString() }], { returning: false }).catch(() => {});
}

// آخر محادثة للموقع (للعرض لما اللوحة تتفتح) + هل المساعد شغال
export async function dashAssistantState(req, env, db, sess, url) {
  const site = await loadSite(db, sess, url.searchParams.get('site'));
  if (!site) return notFound();
  const s = await settingsOf(db);
  const ready = s.enabled && !!(s.api_key_enc || env.ANTHROPIC_API_KEY);
  const last = await db.one('ai_chats?client_id=' + eq(site.id) + '&user_id=' + eq(sess.user.id) + '&select=id,task,messages,updated_at&order=updated_at.desc').catch(() => null);
  return json({ ok: true, ready, manage: canManage(sess, site), chat: last && Date.now() - Date.parse(last.updated_at) < 3 * 864e5 ? last : null });
}

// 👍/👎 + تصحيح ← درس لهذا النشاط (التعليم المستمر)
export async function dashAssistantFeedback(req, env, db, sess) {
  const b = await req.json().catch(() => ({}));
  const site = await loadSite(db, sess, b.site);
  if (!site) return notFound();
  const chat = /^[0-9a-f-]{36}$/i.test(String(b.chat_id || '')) ? await db.one('ai_chats?id=' + eq(b.chat_id) + '&client_id=' + eq(site.id) + '&select=id').catch(() => null) : null;
  if (!chat) return notFound();
  const rating = b.rating === 1 ? 1 : -1, note = String(b.note || '').trim().slice(0, 500);
  await db.insert('ai_feedback', [{ chat_id: chat.id, turn: Math.max(0, Math.round(Number(b.turn) || 0)), rating, note: note || null, user_id: sess.user.id }], { returning: false });
  if (note) await db.insert('ai_lessons', [{ client_id: site.id, text: note, source: 'feedback', active: true, created_by: sess.user.id, created_at: new Date().toISOString() }], { returning: false });
  return json({ ok: true, learned: !!note });
}

// ── الأدمن: المفتاح · الموديل لكل مهمة · الحد اليومي · الدروس العامة · الاستهلاك ──
export async function platformAi(req, env, db, sess) {
  if (!superOnly(sess)) return notFound();
  const s = await settingsOf(db);
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  const calls = (await db.select('ai_calls?task=like.assistant*&at=gte.' + since + '&select=task,model,cost_usd,ok&limit=20000').catch(() => [])) || [];
  const lessons = (await db.select('ai_lessons?select=id,client_id,text,source,active,created_at&order=created_at.desc&limit=100').catch(() => [])) || [];
  return json({ ok: true, configured: !!(s.api_key_enc || env.ANTHROPIC_API_KEY), from_env: !s.api_key_enc && !!env.ANTHROPIC_API_KEY, key_last4: s.key_last4, models: s.models, daily_limit: s.daily_limit, enabled: s.enabled,
    choices: Object.keys(MODELS).map((id) => ({ id, price: MODELS[id] })), tasks: TASKS,
    usage: { calls: calls.length, failed: calls.filter((c) => !c.ok).length, cost_usd: r4(calls.reduce((a, c) => a + (Number(c.cost_usd) || 0), 0)) }, lessons });
}
export async function platformAiSave(req, env, db, sess) {
  if (!superOnly(sess)) return notFound();
  const b = await req.json().catch(() => ({}));
  const patch = { updated_by: sess.user.id, updated_at: new Date().toISOString() };
  if (b.api_key !== undefined) {
    const k = String(b.api_key || '').trim();
    if (k === '') { patch.api_key_enc = null; patch.key_last4 = null; }
    else { if (!/^sk-ant-[A-Za-z0-9_-]{20,200}$/.test(k)) return json({ ok: false, error: 'key' }, 400); patch.api_key_enc = await sealToken(env, k, AAD); patch.key_last4 = k.slice(-4); }
  }
  if (b.models && typeof b.models === 'object') {
    const m = {}; for (const t of TASKS) { const v = b.models[t]; if (v !== undefined) { if (!MODELS[v]) return json({ ok: false, error: 'model' }, 400); m[t] = v; } }
    patch.models = Object.assign({}, (await settingsOf(db)).models, m);
  }
  if (b.daily_limit !== undefined) { const v = Math.round(Number(b.daily_limit)); if (!(v >= 0 && v <= 1000)) return json({ ok: false, error: 'limit' }, 400); patch.daily_limit = v; }
  if (b.enabled !== undefined) patch.enabled = b.enabled === true;
  await db.insert('ai_settings', [Object.assign({ id: 1 }, patch)], { onConflict: 'id', merge: true, returning: false });
  await audit(db, sess.user.id, 'ai_settings', true, Object.keys(patch).filter((k) => !/updated|enc/.test(k)).join(','));
  return json({ ok: true });
}
// اختبار المفتاح والموديل بنداء صغير
export async function platformAiTest(req, env, db, sess, fetchImpl) {
  if (!superOnly(sess)) return notFound();
  const b = await req.json().catch(() => ({}));
  const s = await settingsOf(db), key = await keyOf(env, s);
  if (!key) return json({ ok: false, error: 'not_configured' }, 409);
  const model = MODELS[b.model] ? b.model : s.models.answer;
  try {
    const client = new Anthropic({ apiKey: key, fetch: fetchImpl || undefined, maxRetries: 0 });
    const res = await client.messages.create({ model, max_tokens: 200, messages: [{ role: 'user', content: 'قل «جاهز» فقط.' }] });
    return json({ ok: true, model, reply: res.content.filter((c) => c.type === 'text').map((c) => c.text).join('').slice(0, 100) });
  } catch (e) {
    const status = e instanceof Anthropic.APIError ? e.status : 0;
    return json({ ok: false, error: status === 401 ? 'bad_key' : status === 404 ? 'model' : 'ai', status }, 502);
  }
}
export async function platformAiLesson(req, env, db, sess) {
  if (!superOnly(sess)) return notFound();
  const b = await req.json().catch(() => ({}));
  if (b.id !== undefined) {
    const id = Math.round(Number(b.id)); if (!(id > 0)) return json({ ok: false, error: 'id' }, 400);
    if (b.delete === true) await db.req('DELETE', 'ai_lessons?id=eq.' + id);
    else await db.update('ai_lessons?id=eq.' + id, { active: b.active !== false });
    return json({ ok: true });
  }
  const text = String(b.text || '').trim().slice(0, 500);
  if (text.length < 5) return json({ ok: false, error: 'text' }, 400);
  await db.insert('ai_lessons', [{ client_id: null, text, source: 'admin', active: true, created_by: sess.user.id, created_at: new Date().toISOString() }], { returning: false });
  return json({ ok: true });
}
