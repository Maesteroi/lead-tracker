// تنبيهات تليجرام من السيرفر (المرحلة 1 · قرار محمود 11 نوفمبر: «السيرفر يبعت التنبيهات بنفسه»).
// نفس شكل تنبيهات الشيت: رسالة واحدة لكل جلسة، بتتعدّل مع كل زيارة صفحة أو ضغطة.
//   • للمواقع اللي بتبعت للسيرفر بس (المربوطة من لوحة Maestro = عندها org_id). المواقع اللي لسه على الشيت
//     الشيت هو اللي بيبعت تنبيهاتها، فمابنكررش.
//   • لمحمود بس في المرحلة دي (TG_CHAT_ID). شات العميل مرحلة جاية.
//   • أزرار النتيجة (11 نوفمبر): لما الجلسة فيها ضغطة واتساب أو اتصال بكود، الرسالة بيبقى عليها نفس زراير الشيت
//     (تم · بيفكر · لغى · مش جاد · ماوصلش رسالة). الضغطة بتوصل للسيرفر نفسه (tgbot.js) وبتتسجل في outcomes.
//   • بعد الرد على البلجن (ctx.waitUntil) وبعد تحديد المكان، فمابيأخّرش الحدث، وأي فشل في تليجرام مابيأثرش عليه.
//   • TG_ALERTS = "off" بيقفلها من غير نشر.
import { eq } from './db.js';
import { chatsFor } from './tglinks.js';
import { loadTemplates, ALL_ON } from './tgtemplates.js';
import { escHtml as esc } from './telegram.js';
import { outsideTarget, targetCountries, countryAr, contactStrength } from './score.js';

const SESSION_MS = 30 * 60 * 1000;      // نفس مدة جلسة الشيت

// نفس زراير الشيت بالظبط (apps-script/outcome-buttons.js)، ونفس شكل callback_data: «o|<SiteID>|<الكود>|<رقم النتيجة>»
export const OUTCOMES = [['تم', '✅'], ['بيفكر', '🤔'], ['لغى', '❌'], ['مش جاد', '🚫'], ['ماوصلش رسالة', '📭']];
// القيم المتخزنة فوق ثابتة (الشيت وقاعدة البيانات). اللي بيظهر على الزرار بالفصحى (قرار 12 نوفمبر).
export const OUTCOME_LABEL = { 'تم': 'تم الاتفاق', 'بيفكر': 'يفكّر', 'لغى': 'ألغى', 'مش جاد': 'غير جادّ', 'ماوصلش رسالة': 'لم تصل رسالة' };
export function outcomeKeyboard(siteId, code, chosen) {
  code = String(code || '').replace(/^#/, '');
  if (!siteId || !code) return null;
  const btn = (i) => ({ text: (chosen === OUTCOMES[i][0] ? '✓ ' : OUTCOMES[i][1] + ' ') + OUTCOME_LABEL[OUTCOMES[i][0]], callback_data: 'o|' + siteId + '|' + code + '|' + i });
  return { inline_keyboard: [[btn(0), btn(1), btn(2)], [btn(3), btn(4)]] };
}
// آخر ضغطة واتساب أو اتصال بكود في الجلسة (مش تجربة) = اللي الزراير بتسجّل عليها (نفس قاعدة الشيت)
export function contactCode(p) {
  const ct = String(p.click_type || p.ct || '');
  if (p.event === 'click' && (ct === 'wa' || ct === 'call') && p.match_code && String(p.is_test) !== '1') {
    const c = String(p.match_code).replace(/^#/, '');
    return /^[A-Za-z0-9]{2,20}$/.test(c) ? c : '';
  }
  return '';
}
// زيارة من بره البلد المستهدف: مفيش زراير نتيجة (مستحيل تبقى عميل)، والرسالة عليها ملحوظة بدلها
export const isOutside = (info) => !!info && outsideTarget(info.cc, info.tgeo);
const markupFor = (clientId, info, tpl) => (info && info.oc && !isOutside(info) && (!tpl || tpl.actions !== false) ? outcomeKeyboard(clientId, info.oc, info.oc_v || '') : undefined);
const MAX_LINES = 40;
const MAX_TEXT = 3900;

const CT_AR = { wa: '💬 واتساب', call: '📞 اتصال', sms: '✉️ رسالة نصية', email: '📧 بريد إلكتروني', msg: '📨 تيليجرام/ماسنجر', social: '👥 تواصل اجتماعي', map: '📍 خريطة', cart: '🛒 إضافة إلى السلة', checkout: '💳 إتمام الطلب', form: '📝 إرسال نموذج', button: '🔘 زر' };
const LEVEL_AR = { primary: '🎯 أساسي', important: '⭐ مهم', normal: '▫️ عادي', support: '🛟 خدمة عملاء' };
const SRC_AR = { maps: 'خرائط جوجل', google: 'جوجل', bing: 'بينج', ai: 'ذكاء اصطناعي', social: 'تواصل اجتماعي', ads: 'إعلان مدفوع', listening: 'رصد', direct: 'مباشر', other: 'موقع آخر' };
const SRC2_AR = { google_ads: 'إعلان جوجل', bing_ads: 'إعلان بينج', tiktok_ads: 'إعلان تيك توك', ads_other: 'إعلان آخر', google_organic: 'جوجل (دون إعلان)', google_maps: 'خرائط جوجل', search_other: 'محرك بحث آخر', facebook: 'فيسبوك', instagram: 'إنستجرام', tiktok: 'تيك توك', snapchat: 'سناب شات', youtube: 'يوتيوب', x: 'إكس (تويتر)', whatsapp: 'واتساب', threads: 'ثريدز', linkedin: 'لينكدإن', social_other: 'تواصل اجتماعي آخر', ai: 'ذكاء اصطناعي', listening: 'رصد', direct: 'مباشر', other_site: 'موقع آخر' };

const hhmm = (t) => (String(t || '').split(' ')[1] || '').slice(0, 5);
const secs = (t) => { const m = /(\d{1,2}):(\d{2}):(\d{2})/.exec(String(t || '')); return m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) : 0; };
function dur(s) {
  s = Math.max(0, Math.floor(s));
  if (s < 60) return s + 'ث';
  if (s < 3600) { const mm = Math.floor(s / 60), ss = s % 60; return mm + 'د' + (ss ? ' ' + ss + 'ث' : ''); }
  return Math.floor(s / 3600) + 'س ' + Math.round((s % 3600) / 60) + 'د';
}

// الحدث ده يستاهل سطر في التنبيه؟ (نفس قاعدة الشيت: الضغطات «العادية» وخدمة العملاء لأ، ورقم المطوّر لأ)
export function eventLine(p, tpl) {
  const on = (k) => !tpl || tpl[k] !== false;            // من غير قالب = كل حاجة (إدارة المنصة)
  const t = hhmm(p.time);
  const e = String(p.event || '');
  if (e === 'page_view') return on('pages') ? '👁️ ' + t + ' · ' + esc(String(p.title || p.path || '/').slice(0, 90)) : '';
  if (['view_item', 'add_to_cart', 'begin_checkout', 'purchase', 'sign_up'].includes(e) && !on('store')) return '';
  if (e === 'view_item') return '🛍️ ' + t + ' · ' + esc(String(p.product_name || p.title || 'منتج').slice(0, 90));
  if (e === 'add_to_cart') return '🛒 ' + t + ' · ' + esc(String(p.product_name || p.btn_text || 'منتج').slice(0, 90)) + (p.quantity ? ' ×' + esc(p.quantity) : '');
  if (e === 'begin_checkout') return '💳 ' + t + ' · بدء الدفع' + (p.cart_total ? ' (' + esc(p.cart_total) + ')' : '');
  if (e === 'purchase') return '💰 ' + t + ' · <b>شراء: ' + esc(p.order_total || 0) + ' ' + esc(p.currency || '') + '</b>';
  if (e === 'sign_up') return '📝 ' + t + ' · حساب جديد';
  if (e === 'contact_return' && String(p.is_test) !== '1') {   // بلجن 2.13.1: قوة التواصل (تقديري)
    if (!on('strength')) return '';
    const st = contactStrength(p.away_seconds, p.app_opened, 'ar', p.click_type || p.ct);
    const icon = st.customer.key === 'strong' ? '💪' : st.customer.key === 'normal' ? '↩️' : '⚠️';
    return icon + ' ' + t + ' · احتمالية التواصل: <b>' + st.customer.label + '</b> (تقديرية)';   // للعميل: الاحتمالية بس، من غير مدة ولا طريقة القياس (محمود 13 نوفمبر)
  }
  if (e !== 'click') return '';
  const lv = String(p.lead_level || '');
  if (lv === 'normal' || lv === 'support') return '';
  if (/:ext/.test(String(p.detect_via || ''))) return '';
  const ct = String(p.click_type || p.ct || '');
  const isContact = ct === 'wa' || ct === 'call';
  if (!on(isContact ? 'contact' : 'buttons')) return '';
  const detail = on('btn_detail');
  let line = (String(p.is_test) === '1' ? '🧪 ' : '🎯 ') + t + ' · ' + (CT_AR[ct] || '🔘 زر');
  if (detail && LEVEL_AR[lv]) line += ' · ' + LEVEL_AR[lv];
  if (p.match_code) line += ' · رمز <b>#' + esc(String(p.match_code).replace(/^#/, '').slice(0, 20)) + '</b>';
  const bt = String(p.btn_text || p.bt || '').trim();
  if (bt && bt !== '—' && (detail || !isContact)) line += ' — "' + esc(bt.slice(0, 40)) + '"';
  if (detail && p.btn_pos) line += ' [' + esc(String(p.btn_pos).slice(0, 30)) + ']';
  if (on('target_num') && p.target_num) line += '\n   📱 <code>' + esc(String(p.target_num).slice(0, 20)) + '</code>';
  if (detail && p.href && !['wa', 'call', 'sms'].includes(ct)) {
    let h = String(p.href).replace(/^https?:\/\//, '').split('?')[0];
    if (h.length > 70) h = h.slice(0, 70) + '...';
    line += '\n   🔗 <code>' + esc(h) + '</code>';
  }
  return line;
}

// بيانات الجلسة اللي بتظهر تحت (أول قيمة مش فاضية بتفضل)
function mergeInfo(old, p, geo) {
  const o = Object.assign({}, old || {});
  for (const k of ['source', 'source_fine', 'source_detail', 'gclid', 'utm', 'device', 'os', 'browser', 'visit_no']) if (!o[k] && p[k]) o[k] = String(p[k]).slice(0, 120);
  if (!o.tgeo && p.target_geo) o.tgeo = String(p.target_geo).slice(0, 120);
  if (!o.cc && /^[A-Za-z]{2}$/.test(String(p.country || ''))) o.cc = String(p.country).toUpperCase();     // لو الموقع الجغرافي لسه مااتعرفش
  o.seconds = Math.max(Number(o.seconds) || 0, Number(p.seconds) || 0);
  o.last_time = p.time || o.last_time;
  o.test = o.test || String(p.is_test) === '1';
  if (geo && geo.country && !o.country) Object.assign(o, { country: geo.country, cc: String(geo.country_code || o.cc || '').toUpperCase().slice(0, 2), city: geo.city || '', region: geo.region || '', isp: geo.isp || '' });
  const oc = contactCode(p);
  if (oc && oc !== o.oc) { o.oc = oc; delete o.oc_v; }               // كود جديد: الاختيار القديم مايتنقلش عليه
  return o;
}

function render(siteName, startedAt, body, info, tpl) {
  const on = (k) => !tpl || tpl[k] !== false;
  const out = ['🌐 <b>' + esc(siteName) + '</b>'];
  const d = Math.max(secs(info.last_time) - secs(startedAt), Number(info.seconds) || 0);
  if (on('start') || on('visit_no') || info.test) {
    const parts = [];
    if (on('start')) parts.push('🕒 بدأت الزيارة ' + hhmm(startedAt) + (d > 0 ? ' · ⏱️ ' + dur(d) : ''));
    if (on('visit_no')) parts.push('👤 ' + (tpl && !tpl.btn_detail ? visitWord(info.visit_no) : 'زيارة #' + esc(info.visit_no || 1)));
    out.push((info.test ? '🧪 تجربة · ' : '') + parts.join(' · '));
  }
  out.push('━━━━━━━━━━━━━━━━━━━');
  out.push(...body);
  out.push('━━━━━━━━━━━━━━━━━━━');
  if (on('source') && (info.source_fine || info.source)) out.push('🧭 ' + esc(SRC2_AR[info.source_fine] || SRC_AR[info.source] || info.source || info.source_fine) + (on('keyword') && info.source_detail ? ' · ' + esc(info.source_detail) : ''));
  if (on('gclid') && info.gclid) out.push('🎯 GCLID: <code>' + esc(String(info.gclid).slice(0, 20)) + '...</code>');
  if (on('utm') && info.utm) out.push('📊 ' + esc(info.utm));
  if (on('device') && info.device) out.push('📱 ' + esc((on('btn_detail') ? [info.device, info.os, info.browser] : [info.device]).filter(Boolean).join(' · ')));
  const loc = on('btn_detail') ? [info.city ? info.city + ' (تقريبي)' : '', info.region && info.region !== info.city ? info.region : '', info.country].filter(Boolean).join('، ') : [info.city, info.country].filter(Boolean).join('، ');
  if (on('place') && loc) out.push('📍 ' + esc(loc));
  if (on('isp') && info.isp) out.push('🏢 ' + esc(info.isp));
  if (on('outside') && isOutside(info)) {
    out.push('━━━━━━━━━━━━━━━━━━━');
    out.push('🌍 <b>خارج النطاق المستهدف</b>: الزيارة من ' + esc(countryAr(info.cc, info.country)) + '، وموقعك يستهدف ' + esc(targetCountries(info.tgeo).map((c) => countryAr(c)).join(' و')) + ' فقط.');
    out.push('📝 لا تحتاج إلى نتيجة، وسُجّلت في لوحة التحكم «خارج النطاق» ولن تُحتسب عليك.');
  }
  return out.join('\n');
}

// نص الرسالة. لو طويل على تليجرام: أقدم السطور بتتشال (من غير ما نقطع وسط وسم HTML)
const ORD = ['الأولى', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة'];
const visitWord = (n) => { n = Math.max(1, Number(n) || 1); return 'الزيارة ' + (ORD[n - 1] || 'رقم ' + n); };
export function sessionText(siteName, startedAt, lines, info, tpl) {
  let body = (lines || []).filter(Boolean);
  let text = render(siteName, startedAt, body, info || {}, tpl);
  while (text.length > MAX_TEXT && body.length > 1) { body = body.slice(1); text = render(siteName, startedAt, ['…'].concat(body), info || {}, tpl); }
  return text;
}

export async function tg(env, method, payload, fetchImpl) {
  const f = fetchImpl || ((...a) => fetch(...a));
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const res = await f('https://api.telegram.org/bot' + env.TG_TOKEN + '/' + method, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: ctl.signal });
    const j = await res.json().catch(() => ({}));
    return { ok: res.ok && j.ok === true, j, status: res.status };
  } catch (e) {
    return { ok: false, j: {}, status: 0 };
  } finally { clearTimeout(timer); }
}

const key = (clientId, sid, chat) => 'tg_sessions?client_id=' + eq(clientId) + '&session_id=' + eq(sid) + '&chat_id=' + eq(chat);

// حدث واحد ← رسالة الجلسة (جديدة أو تعديل). مابيرميش أي خطأ أبداً.
// كل شاتات الموقع: محمود (TG_CHAT_ID) + الشاتات المربوطة من اللوحة (tg_links). كل شات ليه رسالة جلسة لوحده.
export async function notifyEvent(env, db, client, payload, geo, fetchImpl) {
  try {
    if (!env.TG_TOKEN || String(env.TG_ALERTS || '').toLowerCase() === 'off') return { skipped: 'off' };
    if (!client || !client.org_id) return { skipped: 'sheet-site' };              // الشيت بيبعت تنبيهات المواقع دي
    // زيارة من جهاز صاحب الموقع أو فريقه («هذه زيارتي»): مفيش تنبيه
    if (payload && payload.visitor_id) {
      const own = await db.one('own_devices?client_id=' + eq(client.id) + '&visitor_id=' + eq(String(payload.visitor_id).slice(0, 64)) + '&select=id').catch(() => null);
      if (own) return { skipped: 'own' };
    }
    // كل شات بشكل نوعه: إدارة المنصة · صاحب الموقع والمديرين · الموظف (tgtemplates.js)
    const tpls = await loadTemplates(db);
    const chats = [];
    if (env.TG_CHAT_ID) chats.push({ chat: String(env.TG_CHAT_ID), audience: 'platform' });
    for (const c of await chatsFor(db, client.id)) if (!chats.some((x) => x.chat === c.chat)) chats.push(c);
    if (!chats.length) return { skipped: 'no-chat' };
    const out = [];
    for (const c of chats) out.push(await notifyChat(env, db, client, payload, geo, fetchImpl, c.chat, tpls[c.audience] || tpls.owner));
    return out.length === 1 ? out[0] : { chats: out };
  } catch (e) {
    console.error('notify: ' + String(e && e.message || e).slice(0, 120));
    return { failed: true };
  }
}

async function notifyChat(env, db, client, payload, geo, fetchImpl, chat, tpl) {
  try {
    const line = eventLine(payload || {}, tpl);
    const sid = String(payload.session_id || '').slice(0, 64);
    if (!line || !sid) return { skipped: 'no-line' };
    const name = client.name || client.id;
    const now = new Date().toISOString();

    let row = await db.one(key(client.id, sid, chat) + '&select=message_id,started_at,lines,info,updated_at');
    if (row && Date.parse(row.updated_at) < Date.now() - SESSION_MS) {           // جلسة قديمة: رسالة جديدة
      await db.req('DELETE', key(client.id, sid, chat));
      row = null;
    }
    if (!row) {
      const info = mergeInfo({}, payload, geo);
      const ins = await db.insert('tg_sessions', [{ client_id: client.id, session_id: sid, chat_id: chat, started_at: String(payload.time || ''), lines: [line], info, updated_at: now }], { ignoreDuplicates: true, onConflict: 'client_id,session_id,chat_id' });
      if (ins && ins[0]) {
        const sent = await tg(env, 'sendMessage', { chat_id: chat, text: sessionText(name, payload.time, [line], info, tpl), parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: markupFor(client.id, info, tpl) }, fetchImpl);
        if (!sent.ok) { await db.req('DELETE', key(client.id, sid, chat)); console.error('telegram send ' + sent.status); return { failed: true }; }
        await db.update(key(client.id, sid, chat), { message_id: sent.j.result.message_id });
        // حدث تاني من نفس الجلسة وصل وإحنا بنبعت: نعدّل الرسالة علشان يبان
        const after = await db.one(key(client.id, sid, chat) + '&select=lines,info,started_at');
        if (after && Array.isArray(after.lines) && after.lines.length > 1) {
          await tg(env, 'editMessageText', { chat_id: chat, message_id: sent.j.result.message_id, text: sessionText(name, after.started_at, after.lines, after.info || info, tpl), parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: markupFor(client.id, after.info || info, tpl) }, fetchImpl);
        }
        return { sent: true };
      }
      row = await db.one(key(client.id, sid, chat) + '&select=message_id,started_at,lines,info,updated_at');
      if (!row) return { failed: true };
    }
    const lines = (Array.isArray(row.lines) ? row.lines : []).concat(line).slice(-MAX_LINES);
    const info = mergeInfo(row.info, payload, geo);
    await db.update(key(client.id, sid, chat), { lines, info, updated_at: now });
    if (!row.message_id) return { queued: true };                                   // الرسالة الأولى لسه بتتبعت، وهي هتعدّل نفسها
    const ed = await tg(env, 'editMessageText', { chat_id: chat, message_id: row.message_id, text: sessionText(name, row.started_at, lines, info, tpl), parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: markupFor(client.id, info, tpl) }, fetchImpl);
    if (!ed.ok && !/not modified/i.test(String(ed.j && ed.j.description || ''))) { console.error('telegram edit ' + ed.status); return { failed: true }; }
    return { edited: true };
  } catch (e) {
    console.error('notify: ' + String(e && e.message || e).slice(0, 120));
    return { failed: true };
  }
}

// «اختبار الاتصال» من إعدادات البلجن (الموقع بيبعت للسيرفر): رسالة واحدة لمحمود إن السيرفر استلم ومفتاح الموقع سليم.
// الشيت كان بيبعت «اختبار ناجح»؛ المواقع اللي بقت على السيرفر كانت بتنجح في الاختبار من غير أي رسالة (11 نوفمبر، روضة).
export async function notifyTest(env, client, fetchImpl) {
  try {
    if (!env.TG_TOKEN || !env.TG_CHAT_ID || String(env.TG_ALERTS || '').toLowerCase() === 'off') return { skipped: 'off' };
    if (!client) return { skipped: 'no-site' };
    const text = '✅ <b>اختبار ناجح</b> — ' + esc(client.name || client.id) + '\nالموقع متصل بخادم Maestro LT، والأحداث تصل.';
    const r = await tg(env, 'sendMessage', { chat_id: String(env.TG_CHAT_ID), text, parse_mode: 'HTML', disable_web_page_preview: true }, fetchImpl);
    return { sent: r.ok };
  } catch (e) {
    return { error: true };
  }
}

// الكرون: رسايل الجلسات القديمة (أكتر من يومين) بتتشال من الجدول
export async function cleanupSessions(db) {
  await db.req('DELETE', 'tg_sessions?updated_at=lt.' + encodeURIComponent(new Date(Date.now() - 2 * 864e5).toISOString()));
  return { ok: true };
}

// معاينة شكل التنبيه (لوحة الإدارة): زيارة نموذجية من إعلان جوجل بضغطة واتساب
export function previewText(tpl) {
  const ev = [
    { event: 'page_view', time: '2026-11-13 16:14:02', title: 'الإنجاز السريع' },
    { event: 'click', time: '2026-11-13 16:14:40', click_type: 'button', lead_level: 'important', btn_text: 'الأوراق المطلوبة', btn_pos: 'داخل المحتوى', href: 'https://enjaz.biz/docs' },
    { event: 'click', time: '2026-11-13 16:15:01', click_type: 'wa', lead_level: 'primary', match_code: '9B5W', btn_text: 'WhatsApp', btn_pos: 'عائم', target_num: '966544908507' },
    { event: 'contact_return', time: '2026-11-13 16:19:12', click_type: 'wa', away_seconds: 250, app_opened: 1 },
  ];
  const info = { source: 'ads', source_fine: 'google_ads', source_detail: 'تعقيب معاملات الدمام', gclid: 'Cj0KCQiAh9vXBhDKARIsAB12', device: 'موبايل', os: 'Android', browser: 'Chrome', visit_no: 1, city: 'الدمام', region: 'المنطقة الشرقية', country: 'السعودية', cc: 'SA', isp: 'Etihad Etisalat', seconds: 54, last_time: '2026-11-13 16:15:01', oc: '9B5W' };
  const lines = ev.map((p) => eventLine(p, tpl)).filter(Boolean);
  return { text: sessionText('الإنجاز السريع', '2026-11-13 16:14:02', lines, info, tpl), buttons: !!markupFor('SITE', info, tpl) };
}
