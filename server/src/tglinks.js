// ربط شات تليجرام بتنبيهات موقع، من السيرفر (13 نوفمبر). كان في الشيت وبيشتغل مرة واحدة.
// • المالك أو المدير بيعمل رابط من «المواقع والتثبيت»: t.me/<البوت>?start=<الموقع>_<كود>. صالح 7 أيام، ولأكتر من شخص، ويتلغى بزرار.
// • /start بالكود ده ← الشات بيتربط بالموقع (tg_links) ← التنبيهات وأزرار النتيجة بتوصله من السيرفر (notify.js · tgbot.js).
// • /stop ← بيفصل الشات من كل المواقع على السيرفر (وبيتبعت للشيت كمان علشان الروابط القديمة).
// • الكود مابيتخزنش نص صريح: بصمة للبحث، ونسخة مشفّرة علشان اللوحة تعرض الرابط تاني.
import { eq } from './db.js';
import { json, sha256, randomToken } from './util.js';
import { sealToken, openToken, tokenKeyReady } from './crypto.js';
import { loadSite, notFound, roleFor } from './sites.js';
import { audit } from './auth.js';

export const INVITE_DAYS = 7;
export const START_RE = /^\/start(?:@\w+)?\s+([A-Za-z0-9]{6,20})_([a-z0-9]{16,40})$/;
const BOT = (env) => String(env.TG_BOT_USERNAME || 'LeadTrackerpro_Bot').replace(/^@/, '');
const canManage = (sess, site) => ['owner', 'admin'].includes(roleFor(sess, site.org_id, site.id));
const linkOf = (env, siteId, code) => 'https://t.me/' + BOT(env) + '?start=' + siteId + '_' + code;

export const LINK_AUDIENCES = ['owner', 'staff'];   // صاحب الموقع والمديرين · الموظف (شكل الرسالة من tgtemplates.js)
export async function chatsFor(db, siteId) {
  try { return ((await db.select('tg_links?client_id=' + eq(siteId) + '&select=chat_id,audience&limit=50')) || []).map((r) => ({ chat: String(r.chat_id), audience: LINK_AUDIENCES.includes(r.audience) ? r.audience : 'owner' })); }
  catch (e) { return []; }   // قبل 0015
}
export async function chatLinked(db, siteId, chatId) {
  try { return !!(await db.one('tg_links?client_id=' + eq(siteId) + '&chat_id=' + eq(chatId) + '&select=id')); } catch (e) { return false; }
}

// ── اللوحة ──
async function activeInvite(env, db, siteId, audience) {
  const r = await db.one('tg_invites?client_id=' + eq(siteId) + '&audience=eq.' + audience + '&revoked_at=is.null&expires_at=gt.' + encodeURIComponent(new Date().toISOString()) + '&select=id,code_enc,expires_at,uses&order=created_at.desc');
  if (!r) return null;
  let code = null;
  try { code = await openToken(env, r.code_enc, 'tginv:' + siteId); } catch (e) { return null; }
  return { link: linkOf(env, siteId, code), expires_at: r.expires_at, uses: r.uses };
}

export async function dashTg(req, env, db, sess, url) {
  const site = await loadSite(db, sess, url.searchParams.get('site'));
  if (!site) return notFound();
  const manage = canManage(sess, site);
  const chats = ((await db.select('tg_links?client_id=' + eq(site.id) + '&select=chat_id,name,audience,created_at&order=created_at.asc&limit=50').catch(() => [])) || []);
  const invites = {};
  if (manage) for (const a of LINK_AUDIENCES) invites[a] = await activeInvite(env, db, site.id, a).catch(() => null);
  return json({ ok: true, manage, ready: !!env.TG_TOKEN && tokenKeyReady(env), invites: manage ? invites : null, invite: manage ? invites.owner : null,
    chats: chats.map((c) => ({ id: manage ? String(c.chat_id) : null, name: c.name || '', audience: LINK_AUDIENCES.includes(c.audience) ? c.audience : 'owner', at: c.created_at })) });
}

export async function dashTgInvite(req, env, db, sess) {
  const b = await req.json().catch(() => ({}));
  const site = await loadSite(db, sess, b.site);
  if (!site) return notFound();
  if (!canManage(sess, site)) return json({ ok: false, error: 'role' }, 403);
  if (!env.TG_TOKEN || !tokenKeyReady(env)) return json({ ok: false, error: 'not_configured' }, 503);
  const now = new Date().toISOString();
  const audience = LINK_AUDIENCES.includes(b.audience) ? b.audience : 'owner';
  // رابط واحد شغال لكل نوع مستلم في الموقع: الجديد بيلغي القديم من نفس النوع
  await db.update('tg_invites?client_id=' + eq(site.id) + '&audience=eq.' + audience + '&revoked_at=is.null', { revoked_at: now });
  if (b.revoke === true) { await audit(db, sess.user.id, 'tg_invite_revoked', true, site.id); return json({ ok: true, invite: null }); }
  const code = randomToken(10);   // 20 حرف hex
  const exp = new Date(Date.now() + INVITE_DAYS * 864e5).toISOString();
  await db.insert('tg_invites', [{ client_id: site.id, audience, code_hash: await sha256('tginv|' + code), code_enc: await sealToken(env, code, 'tginv:' + site.id), created_by: sess.user.id, expires_at: exp }], { returning: false });
  await audit(db, sess.user.id, 'tg_invite_created', true, site.id + ' ' + audience);
  return json({ ok: true, audience, invite: { link: linkOf(env, site.id, code), expires_at: exp, uses: 0 } });
}

export async function dashTgRemove(req, env, db, sess) {
  const b = await req.json().catch(() => ({}));
  const site = await loadSite(db, sess, b.site);
  if (!site) return notFound();
  if (!canManage(sess, site)) return json({ ok: false, error: 'role' }, 403);
  const chat = String(b.chat || '');
  if (!/^-?[0-9]{1,20}$/.test(chat)) return json({ ok: false, error: 'bad_request' }, 400);
  await db.req('DELETE', 'tg_links?client_id=' + eq(site.id) + '&chat_id=' + eq(chat));
  await audit(db, sess.user.id, 'tg_chat_removed', true, site.id);
  return json({ ok: true });
}

// ── البوت: /start <الموقع>_<الكود> · /stop ──
// بيرجّع null لو الرسالة مش لينا (الشيت يتعامل معاها: روابط الشيت القديمة)
export async function handleBotText(env, db, msg, reply) {
  const text = String(msg.text || '').trim();
  const chat = String((msg.chat || {}).id || '');
  if (!/^-?[0-9]{1,20}$/.test(chat)) return null;
  const name = String((msg.chat || {}).title || [((msg.from || {}).first_name || ''), ((msg.from || {}).last_name || '')].join(' ')).trim().slice(0, 60);
  const m = START_RE.exec(text);
  if (m) {
    const inv = await db.one('tg_invites?code_hash=eq.' + await sha256('tginv|' + m[2]) + '&select=id,client_id,audience,expires_at,revoked_at,uses').catch(() => null);
    if (!inv) return null;   // كود مش بتاعنا: غالبًا رابط من الشيت
    if (inv.client_id !== m[1] || inv.revoked_at || Date.parse(inv.expires_at) < Date.now()) {
      await reply('⚠️ انتهت صلاحية هذا الرابط أو أُلغي. اطلب رابطًا جديدًا من صاحب الموقع.');
      return { linked: false };
    }
    const site = await db.one('clients?id=' + eq(inv.client_id) + '&select=id,name');
    if (!site) { await reply('⚠️ الموقع غير موجود.'); return { linked: false }; }
    // نفس الشات بيفتح رابط تاني للموقع ← نوعه بيتحدّث (مثلًا من موظف لمدير)
    await db.insert('tg_links', [{ client_id: site.id, chat_id: chat, name: name || null, invite_id: inv.id, audience: LINK_AUDIENCES.includes(inv.audience) ? inv.audience : 'owner' }], { onConflict: 'client_id,chat_id', merge: true, returning: false });
    await db.update('tg_invites?id=' + eq(inv.id), { uses: (Number(inv.uses) || 0) + 1 });
    await reply('✅ تم ربطك بتنبيهات <b>' + esc(site.name || site.id) + '</b>.\nستصلك هنا زيارات الموقع وطلبات التواصل أولًا بأول.\nلإيقافها أرسل /stop');
    return { linked: true, site, name };
  }
  if (/^\/stop(?:@\w+)?$/.test(text)) {
    const mine = (await db.select('tg_links?chat_id=' + eq(chat) + '&select=id').catch(() => [])) || [];
    if (!mine.length) return null;   // مش مربوط على السيرفر: الشيت يرد (روابطه القديمة)
    await db.req('DELETE', 'tg_links?chat_id=' + eq(chat));
    await reply('🔕 تم إيقاف التنبيهات. لإعادتها اطلب رابطًا جديدًا من صاحب الموقع.');
    return { stopped: true };
  }
  return null;
}
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
