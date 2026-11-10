// تنبيهات تليجرام لمحمود بس (TG_TOKEN و TG_CHAT_ID في أسرار الـWorker).
// رابط تليجرام فيه توكن البوت، فأي خطأ بيتكتب من غير الرابط.

export const escHtml = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function telegramReady(env) { return !!env.TG_TOKEN && !!env.TG_CHAT_ID; }

// بيرجّع true لو الرسالة اتبعتت. مابيرميش خطأ: اللي بينده بيسجّل إن التنبيه ماوصلش.
export async function sendTelegram(env, html, fetchImpl) {
  if (!telegramReady(env)) return false;
  const f = fetchImpl || ((...a) => fetch(...a));
  try {
    const res = await f('https://api.telegram.org/bot' + env.TG_TOKEN + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: env.TG_CHAT_ID, text: String(html).slice(0, 4000), parse_mode: 'HTML', disable_web_page_preview: true }),
    });
    if (!res.ok) { console.error('telegram ' + res.status); return false; }
    return true;
  } catch (e) {
    console.error('telegram: network');
    return false;
  }
}
