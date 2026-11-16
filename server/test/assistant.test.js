// المساعد الذكي (16 نوفمبر): الأدمن يحط المفتاح ويختار موديل لكل مهمة · محادثة بأدوات قراية · اقتراح ملف النشاط والحفظ بضغطة ·
// الحد اليومي · التعليم المستمر (تصحيح ← درس) · ومفيش أي تعديل على جوجل.
import test from 'node:test';
import assert from 'node:assert/strict';
import { world, loggedIn } from './helpers.js';

function fakeClaude(script) {
  const calls = [];
  const wrap = (inner) => async (url, init) => {
    const u = new URL(typeof url === 'string' ? url : url.url);
    if (['api.openai.com', 'api.deepseek.com', 'generativelanguage.googleapis.com'].includes(u.hostname)) {
      const body = JSON.parse(init.body); const h = new Headers(init.headers || {});
      calls.push({ host: u.hostname, path: u.pathname, key: String(h.get('authorization') || '').replace(/^Bearer /, ''), body });
      const next = script.shift() || { text: 'تمام' };
      if (next.status) return new Response(JSON.stringify({ error: { message: 'insufficient quota', code: 'insufficient_quota' } }), { status: next.status, headers: { 'content-type': 'application/json' } });
      return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: next.text } }], usage: { prompt_tokens: 2000, completion_tokens: 300 } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (u.hostname !== 'api.anthropic.com') return inner(url, init);
    const body = JSON.parse(init.body);
    const h = new Headers(init.headers || {});
    calls.push({ path: u.pathname + u.search, key: h.get('x-api-key') || String(h.get('authorization') || '').replace(/^Bearer /, ''), beta: h.get('anthropic-beta') || '', body });
    const next = script.shift() || { text: 'تمام' };
    if (next.status) return new Response(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'bad key' } }), { status: next.status, headers: { 'content-type': 'application/json' } });
    const content = next.tool ? [{ type: 'tool_use', id: 'tu_' + calls.length, name: next.tool, input: next.input || {} }] : [{ type: 'text', text: next.text }];
    return new Response(JSON.stringify({ id: 'msg_' + calls.length, type: 'message', role: 'assistant', model: body.model, content, stop_reason: next.tool ? 'tool_use' : 'end_turn', stop_sequence: null,
      usage: { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 500, cache_creation_input_tokens: 0 } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { calls, wrap };
}
async function setup(script) {
  const fc = fakeClaude(script || []);
  const w = world({ wrapFetch: fc.wrap });
  const env = Object.assign({}, w.env, { TOKEN_ENC_KEY: Buffer.alloc(32, 9).toString('base64'), TG_ALERTS: 'off' });
  const boss = await loggedIn(w, 'boss@maestro.example');
  w.fs.t.users.find((u) => u.email === 'boss@maestro.example').platform_admin = true;
  const owner = await loggedIn(w, 'owner@enjaz.example');
  const pc = (u, path, body) => w.call('POST', path, { env, cookie: u.sess, body, headers: { origin: 'https://app.maestrolt.com', 'x-csrf-token': u.csrf } });
  const gc = (u, path) => w.call('GET', path, { env, cookie: u.sess });
  const site = (await pc(owner, '/v1/sites', { org_id: owner.org.id, name: 'الإنجاز', domain: 'enjaz.example' })).body.site;
  w.fs.t.ai_settings = [{ id: 1, keys: {}, key_last4: {}, budgets: {}, alerted: {}, daily_limit: 40, enabled: true }];
  return { w, env, boss, owner, pc, gc, site, fc };
}
const KEY = 'sk-ant-api03-' + 'x'.repeat(40) + 'AB12', DSK = 'sk-' + 'd'.repeat(32) + 'ZZ99';

test('assistant admin: a key per provider (Anthropic · OpenAI · Gemini · DeepSeek) stored encrypted, a chain of models per stage typed by hand, budgets; customers cannot', async () => {
  const s = await setup([{ text: 'جاهز' }, { text: 'جاهز' }]);
  assert.equal((await s.gc(s.boss, '/v1/platform/ai')).body.configured, false);
  assert.equal((await s.pc(s.boss, '/v1/platform/ai', { keys: { anthropic: 'not-a-key' } })).body.error, 'key');
  assert.equal((await s.pc(s.boss, '/v1/platform/ai', { keys: { mistral: 'x' } })).body.error, 'provider');
  const ok = await s.pc(s.boss, '/v1/platform/ai', { keys: { anthropic: KEY, deepseek: DSK }, budgets: { anthropic: 50, deepseek: 10 }, daily_limit: 25,
    chains: { answer: [{ provider: 'deepseek', model: 'deepseek-flash', price: [0.3, 1.2] }, { provider: 'anthropic', model: 'claude-sonnet-5-5' }] } });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal((await s.pc(s.boss, '/v1/platform/ai', { chains: { answer: [{ provider: 'openai', model: 'bad model name!' }] } })).body.error, 'model');
  const g = (await s.gc(s.boss, '/v1/platform/ai')).body;
  assert.deepEqual([g.configured, g.providers.anthropic.last4, g.providers.deepseek.last4, g.providers.openai.saved, g.providers.deepseek.budget, g.daily_limit], [true, 'AB12', 'ZZ99', false, 10, 25]);
  assert.deepEqual(g.chains.answer.map((x) => [x.provider, x.model, x.price]), [['deepseek', 'deepseek-flash', [0.3, 1.2]], ['anthropic', 'claude-sonnet-5-5', [2, 10]]], 'Claude prices are known; others as typed');
  assert.ok(!JSON.stringify(g).includes(KEY) && !JSON.stringify(s.w.fs.t.ai_settings[0].keys).includes(KEY), 'never returned, never stored in plain text');
  const t = await s.pc(s.boss, '/v1/platform/ai/test', { provider: 'deepseek', model: 'deepseek-flash' });
  assert.deepEqual([t.body.ok, t.body.reply, s.fc.calls[0].host, s.fc.calls[0].path, s.fc.calls[0].key], [true, 'جاهز', 'api.deepseek.com', '/chat/completions', DSK]);
  assert.equal((await s.gc(s.owner, '/v1/platform/ai')).status, 404);
});

test('assistant chain: the first model fails (quota) → the next one answers, and the admin gets a Telegram alert; at 80% of a provider budget, a warning', async () => {
  const s = await setup([{ status: 429 }, { text: 'من Claude' }, { text: 'رد ديب سيك' }]);
  await s.pc(s.boss, '/v1/platform/ai', { keys: { anthropic: KEY, deepseek: DSK }, budgets: { deepseek: 0.19 }, chains: { answer: [{ provider: 'deepseek', model: 'deepseek-flash', price: [50, 200] }, { provider: 'anthropic', model: 'claude-haiku-5-5' }] } });
  s.env.TG_ALERTS = 'on'; s.env.TG_TOKEN = 'T'; s.env.TG_CHAT_ID = '1';
  const r = await s.pc(s.owner, '/v1/dash/assistant', { site: s.site.id, task: 'answer', message: 'مين أحسن كلمة؟' });
  assert.deepEqual([r.status, r.body.reply, r.body.provider], [200, 'من Claude', 'anthropic'], 'DeepSeek ran out, Claude continued');
  assert.ok(s.w.g.telegram.some((m) => /deepseek-flash/.test(m.text) && /الرصيد أو الحد خلص/.test(m.text)), 'the admin is told');
  const r2 = await s.pc(s.owner, '/v1/dash/assistant', { site: s.site.id, task: 'answer', chat_id: r.body.chat_id, message: 'وكمان؟' });
  assert.deepEqual([r2.body.reply, r2.body.provider], ['رد ديب سيك', 'deepseek']);
  assert.ok(s.fc.calls.at(-1).body.messages[0].content.includes('بيانات الحساب'), 'non-Claude providers get the numbers prepared by the server');
  assert.ok(s.w.g.telegram.some((m) => /وصل \d+% من ميزانية الشهر/.test(m.text)), 'warned before the budget runs out');
});

test('assistant brief: reads the business file, proposes an update (not saved by itself), with the chosen model; the owner saves it with one press', async () => {
  const s = await setup([{ tool: 'get_business_file' }, { tool: 'propose_business_file', input: { about: 'نستخرج تصريح الزواج من أجنبية.', offer: ['تصريح زواج', 'معقب'], exclude: [{ word: 'خطابة', why: 'لسنا خطّابة' }], fears: [{ fear: 'النصب', promise: 'الدفع بعد الإنجاز' }] } }, { text: 'راجع الملخص واضغط «احفظ في ملفك».' }]);
  await s.pc(s.boss, '/v1/platform/ai', { keys: { anthropic: KEY } });
  const r = await s.pc(s.owner, '/v1/dash/assistant', { site: s.site.id, task: 'brief', message: 'عايز أعمل ملف نشاطي' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual([r.body.reply, r.body.proposal.offer, r.body.model], ['راجع الملخص واضغط «احفظ في ملفك».', ['تصريح زواج', 'معقب'], 'claude-opus-5-5']);
  assert.ok(!(s.w.fs.t.site_brief || []).length, 'nothing saved by the assistant');
  const req0 = s.fc.calls[0];
  assert.ok(/server-side-fallback-2026-07-01/.test(req0.beta) && req0.body.fallbacks === 'default', 'server-side fallback on a safety refusal');
  assert.deepEqual(req0.body.tools.map((t) => t.name).sort(), ['get_business_file', 'get_journey', 'get_keywords_by_outcome', 'get_statement', 'propose_business_file'], 'read-only tools; nothing that changes Google Ads');
  assert.ok(s.w.fs.t.ai_calls.some((c) => c.task === 'assistant:brief' && c.cost_usd > 0), 'cost logged');
  const save = await s.pc(s.owner, '/v1/dash/brief', Object.assign({ site: s.site.id }, r.body.proposal));
  assert.equal(save.status, 200);
  // المحادثة بتكمل
  const r2 = await s.pc(s.owner, '/v1/dash/assistant', { site: s.site.id, task: 'brief', chat_id: r.body.chat_id, message: 'تمام' });
  assert.equal(s.fc.calls.at(-1).body.messages.length, 3, 'history: user, assistant, user');
  assert.equal(r2.body.chat_id, r.body.chat_id);
});

test('assistant learning: a correction becomes a lesson for this business and is in every next conversation; admin lessons apply to all', async () => {
  const s = await setup([{ text: 'أهلًا' }, { text: 'تمام' }]);
  await s.pc(s.boss, '/v1/platform/ai', { keys: { anthropic: KEY } });
  const r = await s.pc(s.owner, '/v1/dash/assistant', { site: s.site.id, task: 'answer', message: 'مين أحسن كلمة؟' });
  const f = await s.pc(s.owner, '/v1/dash/assistant/feedback', { site: s.site.id, chat_id: r.body.chat_id, turn: r.body.turn, rating: -1, note: 'لا نقدم خدمة توثيق العقود' });
  assert.deepEqual([f.status, f.body.learned], [200, true]);
  await s.pc(s.boss, '/v1/platform/ai/lesson', { text: 'لا تذكر أسعار المنافسين أبدًا' });
  await s.pc(s.owner, '/v1/dash/assistant', { site: s.site.id, task: 'answer', message: 'سؤال تاني' });
  const sys = JSON.stringify(s.fc.calls.at(-1).body.system);
  assert.ok(sys.includes('لا نقدم خدمة توثيق العقود') && sys.includes('لا تذكر أسعار المنافسين'));
});

test('assistant limits: daily limit per site, banned verticals, a bad key said plainly, not configured', async () => {
  const s = await setup([{ status: 401 }]);
  assert.equal((await s.pc(s.owner, '/v1/dash/assistant', { site: s.site.id, message: 'مرحبا' })).body.error, 'not_configured');
  await s.pc(s.boss, '/v1/platform/ai', { keys: { anthropic: KEY }, daily_limit: 1 });
  assert.equal((await s.pc(s.owner, '/v1/dash/assistant', { site: s.site.id, message: 'مرحبا' })).body.error, 'ai', 'the only model failed (bad key)');
  const lim = await s.pc(s.owner, '/v1/dash/assistant', { site: s.site.id, message: 'مرحبا' });
  assert.equal(lim.body.error, 'limit');
  s.w.fs.t.ai_calls = [];
  const b = await s.pc(s.owner, '/v1/dash/assistant', { site: s.site.id, message: 'عندي محل مساج' });
  assert.equal(b.body.banned, true);
  const other = await loggedIn(s.w, 'other@x.example');
  assert.equal((await s.pc(other, '/v1/dash/assistant', { site: s.site.id, message: 'x' })).status, 404);
});
