// المساعد الذكي (16 نوفمبر): الأدمن يحط المفتاح ويختار موديل لكل مهمة · محادثة بأدوات قراية · اقتراح ملف النشاط والحفظ بضغطة ·
// الحد اليومي · التعليم المستمر (تصحيح ← درس) · ومفيش أي تعديل على جوجل.
import test from 'node:test';
import assert from 'node:assert/strict';
import { world, loggedIn } from './helpers.js';

function fakeClaude(script) {
  const calls = [];
  const wrap = (inner) => async (url, init) => {
    const u = new URL(typeof url === 'string' ? url : url.url);
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
  w.fs.t.ai_settings = [{ id: 1, models: { brief: 'claude-opus-5-5', answer: 'claude-opus-5-5', suggest: 'claude-opus-5-5' }, daily_limit: 40, enabled: true }];
  return { w, env, boss, owner, pc, gc, site, fc };
}
const KEY = 'sk-ant-api03-' + 'x'.repeat(40) + 'AB12';

test('assistant admin: the key is stored encrypted (only the last 4 shown), a model per task, a daily limit; customers cannot', async () => {
  const s = await setup([{ text: 'جاهز' }]);
  assert.equal((await s.gc(s.boss, '/v1/platform/ai')).body.configured, false);
  assert.equal((await s.pc(s.boss, '/v1/platform/ai', { api_key: 'not-a-key' })).body.error, 'key');
  assert.equal((await s.pc(s.boss, '/v1/platform/ai', { api_key: KEY, models: { brief: 'claude-opus-5-5', answer: 'claude-sonnet-5-5', suggest: 'claude-haiku-5-5' }, daily_limit: 25 })).status, 200);
  assert.equal((await s.pc(s.boss, '/v1/platform/ai', { models: { answer: 'gpt-x' } })).body.error, 'model');
  const g = (await s.gc(s.boss, '/v1/platform/ai')).body;
  assert.deepEqual([g.configured, g.key_last4, g.models.answer, g.models.suggest, g.daily_limit], [true, 'AB12', 'claude-sonnet-5-5', 'claude-haiku-5-5', 25]);
  assert.ok(!JSON.stringify(g).includes(KEY) && !s.w.fs.t.ai_settings[0].api_key_enc.includes(KEY), 'never returned, never stored in plain text');
  const t = await s.pc(s.boss, '/v1/platform/ai/test', { model: 'claude-haiku-5-5' });
  assert.deepEqual([t.body.ok, t.body.reply], [true, 'جاهز']);
  assert.equal(s.fc.calls[0].key, KEY, 'the decrypted key is sent only to Anthropic');
  assert.equal((await s.gc(s.owner, '/v1/platform/ai')).status, 404);
});

test('assistant brief: reads the business file, proposes an update (not saved by itself), with the chosen model; the owner saves it with one press', async () => {
  const s = await setup([{ tool: 'get_business_file' }, { tool: 'propose_business_file', input: { about: 'نستخرج تصريح الزواج من أجنبية.', offer: ['تصريح زواج', 'معقب'], exclude: [{ word: 'خطابة', why: 'لسنا خطّابة' }], fears: [{ fear: 'النصب', promise: 'الدفع بعد الإنجاز' }] } }, { text: 'راجع الملخص واضغط «احفظ في ملفك».' }]);
  await s.pc(s.boss, '/v1/platform/ai', { api_key: KEY });
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
  await s.pc(s.boss, '/v1/platform/ai', { api_key: KEY });
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
  await s.pc(s.boss, '/v1/platform/ai', { api_key: KEY, daily_limit: 1 });
  assert.equal((await s.pc(s.owner, '/v1/dash/assistant', { site: s.site.id, message: 'مرحبا' })).body.error, 'bad_key');
  const lim = await s.pc(s.owner, '/v1/dash/assistant', { site: s.site.id, message: 'مرحبا' });
  assert.equal(lim.body.error, 'limit');
  s.w.fs.t.ai_calls = [];
  const b = await s.pc(s.owner, '/v1/dash/assistant', { site: s.site.id, message: 'عندي محل مساج' });
  assert.equal(b.body.banned, true);
  const other = await loggedIn(s.w, 'other@x.example');
  assert.equal((await s.pc(other, '/v1/dash/assistant', { site: s.site.id, message: 'x' })).status, 404);
});
