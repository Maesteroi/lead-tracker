// المساعد الذكي (16 نوفمبر · claude/briefs/2026-11-16-ai-assistant.md).
// 3 مراحل: brief (يبني ملف نشاطك بالمحادثة) · answer (يجاوب من أرقامك) · suggest (يقترح تحسينات).
// • لكل مرحلة سلسلة نماذج يختارها الأدمن بالترتيب (محمود: «dropdown بالنماذج: Anthropic · OpenAI · Gemini · DeepSeek · وأكتب اسم النموذج والـAPI
//   بإيدي · وأكتر من نموذج للمرحلة يشتغلوا بالتوالي: لو خلص يكمل للي بعده · وقبل ما يخلص يدّيني إنذار»).
//   أول نموذج شغال ومفتاحه موجود وماعداش ميزانيته الشهرية بيرد. لو فشل (مفتاح · رصيد · ضغط · عطل) بننتقل للي بعده ونبعت إنذار تليجرام.
//   إنذار عند 80% من ميزانية المزوّد الشهرية، وعند الوصول لـ100% بيتخطّى المزوّد ده لحد الشهر الجاي.
// • Claude بالمكتبة الرسمية (@anthropic-ai/sdk) ومعاه أدوات قراية. OpenAI وGemini وDeepSeek بواجهة OpenAI المتوافقة (chat/completions)
//   والأرقام بتتجهّز من السيرفر قبل السؤال (مش كل المزوّدين بيدعموا الأدوات بنفس الشكل).
// • المفاتيح متشفّرة (AES-GCM) ومابترجعش للمتصفح أبدًا، أو من أسرار Cloudflare (ANTHROPIC_API_KEY · OPENAI_API_KEY · GEMINI_API_KEY · DEEPSEEK_API_KEY).
// • مفيش ولا أداة بتعدّل في جوجل أدز (قاعدة 2). ملف النشاط: اقتراح، والحفظ بضغطة العميل.
// • التعليم المستمر: تصحيحات العميل دروس لنشاطه، ودروس الأدمن للكل. حد يومي لكل موقع، وكل نداء بيتسجل بتكلفته.
import Anthropic from '@anthropic-ai/sdk';
import { eq } from './db.js';
import { json } from './util.js';
import { sealToken, openToken } from './crypto.js';
import { loadSite, notFound, isPlatform, hasPerm, roleFor } from './sites.js';
import { audit } from './auth.js';
import { loadBrief } from './brief.js';
import { bannedIn } from './verticals.js';
import { sendTelegram, escHtml } from './telegram.js';

export const TASKS = ['brief', 'answer', 'suggest'];
// المزوّدين · Gemini وDeepSeek من صفحاتهم الرسمية (واجهة OpenAI المتوافقة، 16 نوفمبر)
export const PROVIDERS = {
  anthropic: { label: 'Anthropic (Claude)', env: 'ANTHROPIC_API_KEY', key: /^sk-ant-[A-Za-z0-9_-]{20,200}$/, suggest: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'] },
  openai: { label: 'OpenAI', base: 'https://api.openai.com/v1', env: 'OPENAI_API_KEY', key: /^sk-[A-Za-z0-9_-]{20,300}$/, suggest: [] },
  gemini: { label: 'Google Gemini', base: 'https://generativelanguage.googleapis.com/v1beta/openai', env: 'GEMINI_API_KEY', key: /^[A-Za-z0-9_-]{20,200}$/, suggest: [] },
  deepseek: { label: 'DeepSeek', base: 'https://api.deepseek.com', env: 'DEEPSEEK_API_KEY', key: /^sk-[A-Za-z0-9_-]{20,200}$/, suggest: ['deepseek-flash', 'deepseek-v4-pro'] },
};
// أسعار Claude المعروفة (دولار لكل مليون توكن: دخل / خرج). الباقي الأدمن بيكتب سعره، وإلا التكلفة بتتسجل صفر والإنذار مابيشتغلش
export const KNOWN_PRICES = { 'anthropic:claude-opus-5-5': [4, 20], 'anthropic:claude-sonnet-5-5': [2, 10], 'anthropic:claude-haiku-5-5': [0.1, 0.5] };
const DEFAULT_CHAIN = [{ provider: 'anthropic', model: 'claude-opus-5-5' }];
const MODEL_RE = /^[A-Za-z0-9._:\/-]{2,80}$/;
const MAX_STEPS = 6, MAX_HISTORY = 30, MAX_MSG = 2000, MAX_CHAIN = 4;
const superOnly = (sess) => isPlatform(sess) || hasPerm(sess, 'billing');
const canManage = (sess, site) => ['owner', 'admin'].includes(roleFor(sess, site.org_id, site.id));
const r4 = (v) => Math.round((Number(v) || 0) * 10000) / 10000;
const monthStart = () => new Date().toISOString().slice(0, 7) + '-01T00:00:00Z';

async function settingsOf(db) {
  const s = await db.one('ai_settings?id=eq.1&select=*').catch(() => null);
  const chains = {}; for (const t of TASKS) chains[t] = (s && s.chains && Array.isArray(s.chains[t]) && s.chains[t].length ? s.chains[t] : DEFAULT_CHAIN).filter((x) => PROVIDERS[x.provider] && MODEL_RE.test(String(x.model || ''))).slice(0, MAX_CHAIN);
  return Object.assign({ keys: {}, key_last4: {}, budgets: {}, alerted: {}, daily_limit: 40, enabled: true }, s || {}, { chains });
}
async function keyFor(env, s, provider) {
  const enc = (s.keys || {})[provider];
  if (enc) { try { return await openToken(env, enc, 'ai:' + provider); } catch (e) { console.error('ai key open ' + provider); } }
  return env[PROVIDERS[provider].env] || null;
}
const priceOf = (item) => (Array.isArray(item.price) && item.price.length === 2 ? item.price.map(Number) : KNOWN_PRICES[item.provider + ':' + item.model] || [0, 0]);
async function spentThisMonth(db, provider) {
  const rows = (await db.select('ai_calls?model=like.' + encodeURIComponent(provider + ':*') + '&at=gte.' + monthStart() + '&select=cost_usd&limit=50000').catch(() => [])) || [];
  return rows.reduce((a, r) => a + (Number(r.cost_usd) || 0), 0);
}
// إنذار تليجرام للإدارة (مرة واحدة لكل سبب في اليوم)
async function warn(env, db, s, key, html, fetchImpl) {
  const day = new Date().toISOString().slice(0, 10);
  if ((s.alerted || {})[key] === day) return;
  s.alerted = Object.assign({}, s.alerted || {}, { [key]: day });
  await db.update('ai_settings?id=eq.1', { alerted: s.alerted }).catch(() => {});
  if (String(env.TG_ALERTS || '').toLowerCase() !== 'off') await sendTelegram(env, html, fetchImpl).catch(() => {});
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


// ── Claude: حلقة الأدوات ──
async function viaClaude(item, key, ctx, system, messages, fetchImpl) {
  const client = new Anthropic({ apiKey: key, fetch: fetchImpl || undefined, maxRetries: 1 });
  const usage = { input: 0, output: 0, cache_read: 0, cache_write: 0 };
  let reply = '';
  for (let step = 0; step < MAX_STEPS; step++) {
    const params = { model: item.model, max_tokens: 4000, system, tools: TOOLS, messages };
    const res = /haiku/.test(item.model) ? await client.messages.create(params)
      : await client.beta.messages.create(Object.assign({ betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }, params));   // رفض أمان = إعادة تلقائية على موديل بديل
    const u = res.usage || {};
    usage.input += u.input_tokens || 0; usage.output += u.output_tokens || 0; usage.cache_read += u.cache_read_input_tokens || 0; usage.cache_write += u.cache_creation_input_tokens || 0;
    if (res.stop_reason === 'refusal') return { reply: 'عذرًا، لا أستطيع المساعدة في هذا.', usage, refused: true };
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
  return { reply, usage };
}
// ── OpenAI · Gemini · DeepSeek: واجهة OpenAI المتوافقة · الأرقام متجهّزة في التعليمات · اقتراح الملف بين <file>…</file> ──
async function viaCompat(item, key, ctx, systemText, history, text, fetchImpl) {
  const task = ctx.task, data = {};
  data.business_file = await runTool('get_business_file', {}, ctx);
  if (task !== 'brief') { data.journey = await runTool('get_journey', {}, ctx); data.keywords = await runTool('get_keywords_by_outcome', {}, ctx); data.statement = await runTool('get_statement', {}, ctx); }
  const sys = systemText + '\n\nبيانات الحساب (JSON، استخدمها فقط ولا تخترع غيرها):\n' + JSON.stringify(data).slice(0, 40000)
    + (task === 'brief' ? '\n\nعندما تكتمل الصورة، ضع الملف المقترح في آخر ردك بين <file> و</file> بصيغة JSON: {"about":"","offer":[],"exclude":[{"word":"","why":""}],"fears":[{"fear":"","promise":""}]}' : '');
  const body = { model: item.model, messages: [{ role: 'system', content: sys }].concat(history.map((m) => ({ role: m.role, content: m.text || '…' })), [{ role: 'user', content: text }]) };
  body[item.provider === 'openai' ? 'max_completion_tokens' : 'max_tokens'] = 4000;
  const res = await (fetchImpl || fetch)(PROVIDERS[item.provider].base + '/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(String((j.error && (j.error.message || j.error.code)) || 'HTTP ' + res.status).slice(0, 200)); e.status = res.status; throw e; }
  let reply = String((((j.choices || [])[0] || {}).message || {}).content || '').trim();
  const m = /<file>([\s\S]*?)<\/file>/.exec(reply);
  if (m) { try { const p = JSON.parse(m[1]); await runTool('propose_business_file', p, ctx); } catch (e) { /* اقتراح مش صالح: بنتجاهله */ } reply = reply.replace(m[0], '').trim(); }
  const u = j.usage || {};
  return { reply: reply || '…', usage: { input: u.prompt_tokens || 0, output: u.completion_tokens || 0, cache_read: 0, cache_write: 0 } };
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
  const since = new Date(Date.now() - 864e5).toISOString();
  const used = ((await db.select('ai_calls?client_id=' + eq(site.id) + '&task=like.assistant*&at=gte.' + since + '&select=id&limit=2000').catch(() => [])) || []).length;
  if (s.daily_limit && used >= s.daily_limit) return json({ ok: false, error: 'limit', limit: s.daily_limit }, 429);
  if (bannedIn([text])) return json({ ok: true, reply: 'عذرًا، المنصة لا تخدم هذا المجال.', banned: true });
  let chat = null;
  if (b.chat_id && /^[0-9a-f-]{36}$/i.test(String(b.chat_id))) chat = await db.one('ai_chats?id=' + eq(b.chat_id) + '&client_id=' + eq(site.id) + '&select=*').catch(() => null);
  const history = chat ? (chat.messages || []).slice(-MAX_HISTORY) : [];
  const lessons = await lessonsFor(db, site.id);
  const taskText = TASK_TEXT[task] + '\n\nاسم النشاط/الموقع: ' + (site.name || '') + (lessons ? '\n\nدروس من تصحيحات سابقة (التزم بها):\n' + lessons : '');
  const ctx = { db, site, task, proposal: null };
  let out = null, used_item = null, configured = false;
  for (const item of s.chains[task]) {
    const key = await keyFor(env, s, item.provider);
    if (!key) continue;
    configured = true;
    const budget = Number((s.budgets || {})[item.provider]) || 0;
    const spent = budget ? await spentThisMonth(db, item.provider) : 0;
    if (budget && spent >= budget) { await warn(env, db, s, 'out:' + item.provider, '⛔ <b>المساعد الذكي</b>\nميزانية ' + escHtml(PROVIDERS[item.provider].label) + ' الشهرية خلصت ($' + r4(spent) + ' من $' + budget + '). بنستخدم النموذج التالي في السلسلة.', fetchImpl); continue; }
    try {
      out = item.provider === 'anthropic'
        ? await viaClaude(item, key, ctx, [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }, { type: 'text', text: taskText }], history.map((m) => ({ role: m.role, content: m.text || '…' })).concat([{ role: 'user', content: text }]), fetchImpl)
        : await viaCompat(item, key, ctx, SYSTEM + '\n\n' + taskText, history, text, fetchImpl);
      used_item = item;
      const cost = await logCall(db, site.id, task, item, out.usage, !out.refused);
      if (budget && spent + cost >= budget * 0.8) await warn(env, db, s, 'p80:' + item.provider, '⚠️ <b>المساعد الذكي</b>\nاستهلاك ' + escHtml(PROVIDERS[item.provider].label) + ' وصل ' + Math.round((spent + cost) / budget * 100) + '% من ميزانية الشهر ($' + r4(spent + cost) + ' من $' + budget + '). اشحن الرصيد أو زوّد الميزانية قبل ما يخلص.', fetchImpl);
      break;
    } catch (e) {
      const status = e instanceof Anthropic.APIError ? e.status : (e && e.status) || 0;
      console.error('assistant ' + item.provider + ':' + item.model + ' ' + status + ' ' + String(e && e.message || e).slice(0, 160));
      await logCall(db, site.id, task, item, { input: 0, output: 0, cache_read: 0, cache_write: 0 }, false);
      await warn(env, db, s, 'fail:' + item.provider + ':' + item.model, '⚠️ <b>المساعد الذكي</b>\nالنموذج ' + escHtml(item.provider + ' · ' + item.model) + ' فشل (' + status + ': ' + escHtml(String(e && e.message || e).slice(0, 120)) + '). ' + (status === 401 || status === 403 ? 'المفتاح مرفوض.' : status === 402 || status === 429 ? 'الرصيد أو الحد خلص.' : '') + ' بنستخدم النموذج التالي في السلسلة.', fetchImpl);
    }
  }
  if (!out) return json({ ok: false, error: configured ? 'ai' : 'not_configured' }, configured ? 502 : 409);
  const turns = history.concat([{ role: 'user', text, at: new Date().toISOString() }, { role: 'assistant', text: out.reply, at: new Date().toISOString(), proposal: ctx.proposal || undefined }]).slice(-MAX_HISTORY);
  if (chat) await db.update('ai_chats?id=' + eq(chat.id), { messages: turns, updated_at: new Date().toISOString() });
  else { const row = (await db.insert('ai_chats', [{ client_id: site.id, user_id: sess.user.id, task, messages: turns }])) || []; chat = row[0] || { id: null }; }
  return json({ ok: true, chat_id: chat.id, reply: out.reply, proposal: ctx.proposal, turn: turns.length - 1, model: used_item.model, provider: used_item.provider });
}
async function logCall(db, siteId, task, item, u, ok) {
  const [pi, po] = priceOf(item);
  const cost = ((u.input + u.cache_write * 1.25 + u.cache_read * 0.1) * pi + u.output * po) / 1e6;
  await db.insert('ai_calls', [{ client_id: siteId, task: 'assistant:' + task, model: item.provider + ':' + item.model, input_units: u.input + u.cache_read + u.cache_write, output_units: u.output, cost_usd: r4(cost), ok, at: new Date().toISOString() }], { returning: false }).catch(() => {});
  return cost;
}

// آخر محادثة للموقع (للعرض لما اللوحة تتفتح) + هل المساعد شغال
export async function dashAssistantState(req, env, db, sess, url) {
  const site = await loadSite(db, sess, url.searchParams.get('site'));
  if (!site) return notFound();
  const s = await settingsOf(db);
  let ready = false;
  if (s.enabled) for (const t of TASKS) for (const it of s.chains[t]) if (!ready && await keyFor(env, s, it.provider)) ready = true;
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

// ── الأدمن: مفتاح وميزانية لكل مزوّد · سلسلة نماذج لكل مرحلة (بالترتيب، والسعر) · الحد اليومي · الدروس · الاستهلاك ──
export async function platformAi(req, env, db, sess) {
  if (!superOnly(sess)) return notFound();
  const s = await settingsOf(db);
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  const calls = (await db.select('ai_calls?task=like.assistant*&at=gte.' + since + '&select=task,model,cost_usd,ok&limit=20000').catch(() => [])) || [];
  const lessons = (await db.select('ai_lessons?select=id,client_id,text,source,active,created_at&order=created_at.desc&limit=100').catch(() => [])) || [];
  const providers = {};
  for (const [id, p] of Object.entries(PROVIDERS)) providers[id] = { label: p.label, saved: !!(s.keys || {})[id], from_env: !(s.keys || {})[id] && !!env[p.env], last4: (s.key_last4 || {})[id] || null, budget: Number((s.budgets || {})[id]) || 0, spent_month: r4(await spentThisMonth(db, id)), suggest: p.suggest };
  const chains = {}; for (const t of TASKS) chains[t] = s.chains[t].map((x) => Object.assign({}, x, { price: priceOf(x) }));
  return json({ ok: true, providers, chains, tasks: TASKS, daily_limit: s.daily_limit, enabled: s.enabled,
    configured: Object.values(providers).some((p) => p.saved || p.from_env),
    usage: { calls: calls.length, failed: calls.filter((c) => !c.ok).length, cost_usd: r4(calls.reduce((a, c) => a + (Number(c.cost_usd) || 0), 0)) }, lessons });
}
export async function platformAiSave(req, env, db, sess) {
  if (!superOnly(sess)) return notFound();
  const b = await req.json().catch(() => ({}));
  const s = await settingsOf(db);
  const patch = { updated_by: sess.user.id, updated_at: new Date().toISOString() };
  if (b.keys && typeof b.keys === 'object') {
    const keys = Object.assign({}, s.keys || {}), last4 = Object.assign({}, s.key_last4 || {});
    for (const [prov, raw] of Object.entries(b.keys)) {
      if (!PROVIDERS[prov]) return json({ ok: false, error: 'provider' }, 400);
      const k = String(raw || '').trim();
      if (k === '') { delete keys[prov]; delete last4[prov]; continue; }
      if (!PROVIDERS[prov].key.test(k)) return json({ ok: false, error: 'key', provider: prov }, 400);
      keys[prov] = await sealToken(env, k, 'ai:' + prov); last4[prov] = k.slice(-4);
    }
    patch.keys = keys; patch.key_last4 = last4;
  }
  if (b.budgets && typeof b.budgets === 'object') {
    const bud = Object.assign({}, s.budgets || {});
    for (const [prov, v] of Object.entries(b.budgets)) { if (!PROVIDERS[prov]) return json({ ok: false, error: 'provider' }, 400); const n = Number(v); if (!(n >= 0 && n <= 100000)) return json({ ok: false, error: 'budget' }, 400); bud[prov] = Math.round(n * 100) / 100; }
    patch.budgets = bud;
  }
  if (b.chains && typeof b.chains === 'object') {
    const chains = Object.assign({}, s.chains);
    for (const t of TASKS) {
      if (b.chains[t] === undefined) continue;
      const list = Array.isArray(b.chains[t]) ? b.chains[t] : [];
      if (!list.length || list.length > MAX_CHAIN) return json({ ok: false, error: 'chain', task: t }, 400);
      chains[t] = [];
      for (const x of list) {
        const model = String((x && x.model) || '').trim();
        if (!PROVIDERS[x && x.provider] || !MODEL_RE.test(model)) return json({ ok: false, error: 'model', task: t }, 400);
        const item = { provider: x.provider, model };
        if (Array.isArray(x.price) && x.price.length === 2 && x.price.every((v) => v !== '' && v != null && Number(v) >= 0 && Number(v) < 1000)) item.price = x.price.map(Number);
        chains[t].push(item);
      }
    }
    patch.chains = chains;
  }
  if (b.daily_limit !== undefined) { const v = Math.round(Number(b.daily_limit)); if (!(v >= 0 && v <= 1000)) return json({ ok: false, error: 'limit' }, 400); patch.daily_limit = v; }
  if (b.enabled !== undefined) patch.enabled = b.enabled === true;
  await db.insert('ai_settings', [Object.assign({ id: 1 }, patch)], { onConflict: 'id', merge: true, returning: false });
  await audit(db, sess.user.id, 'ai_settings', true, Object.keys(patch).filter((k) => !/updated|keys/.test(k)).join(',') + (patch.keys ? ',keys' : ''));
  return json({ ok: true });
}
// اختبار مزوّد ونموذج بنداء صغير
export async function platformAiTest(req, env, db, sess, fetchImpl) {
  if (!superOnly(sess)) return notFound();
  const b = await req.json().catch(() => ({}));
  const s = await settingsOf(db);
  const item = { provider: PROVIDERS[b.provider] ? b.provider : 'anthropic', model: MODEL_RE.test(String(b.model || '')) ? String(b.model) : 'claude-haiku-5-5' };
  const key = await keyFor(env, s, item.provider);
  if (!key) return json({ ok: false, error: 'not_configured' }, 409);
  try {
    let reply;
    if (item.provider === 'anthropic') {
      const client = new Anthropic({ apiKey: key, fetch: fetchImpl || undefined, maxRetries: 0 });
      const res = await client.messages.create({ model: item.model, max_tokens: 200, messages: [{ role: 'user', content: 'قل «جاهز» فقط.' }] });
      reply = res.content.filter((c) => c.type === 'text').map((c) => c.text).join('');
    } else {
      const body = { model: item.model, messages: [{ role: 'user', content: 'قل «جاهز» فقط.' }] }; body[item.provider === 'openai' ? 'max_completion_tokens' : 'max_tokens'] = 200;
      const res = await (fetchImpl || fetch)(PROVIDERS[item.provider].base + '/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { const e = new Error('x'); e.status = res.status; throw e; }
      reply = String((((j.choices || [])[0] || {}).message || {}).content || '');
    }
    return json({ ok: true, provider: item.provider, model: item.model, reply: reply.slice(0, 100) });
  } catch (e) {
    const status = e instanceof Anthropic.APIError ? e.status : (e && e.status) || 0;
    return json({ ok: false, error: status === 401 || status === 403 ? 'bad_key' : status === 404 || status === 400 ? 'model' : status === 402 || status === 429 ? 'quota' : 'ai', status }, 502);
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
