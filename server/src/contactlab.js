// لوحة الإدارة ← «قياس التواصل (تجريبي)» (13 نوفمبر): هل «الشاشة كانت شغالة وقت الغياب» بتتنبأ بالتواصل فعلًا؟
// بنقارن آخر 30 يوم: كل رجوع بعد ضغطة واتساب أو اتصال (contact_return من بلجن 2.13.5) ← قراءة الشاشة (محادثة · بين الحالتين · مقفولة · آيفون)
// ← النتيجة اللي صاحب الموقع اختارها (تم الاتفاق · لم تصل رسالة · غيرهم · لسه). محمود يقرر بعد أسبوعين يدخل في «احتمالية التواصل» ولا لأ.
import { json } from './util.js';
import { isPlatform } from './sites.js';
import { screenAwake } from './score.js';

const DAYS = 30;
export async function contactLab(req, env, db, sess) {
  if (!isPlatform(sess)) return json({ ok: false, error: 'not_found' }, 404);
  const since = new Date(Date.now() - DAYS * 864e5).toISOString();
  const rets = (await db.select('raw_events?event=eq.contact_return&received_at=gte.' + encodeURIComponent(since) + '&select=client_id,match_code,payload&order=received_at.desc&limit=5000').catch(() => [])) || [];
  const outs = (await db.select('outcomes?at=gte.' + encodeURIComponent(new Date(Date.now() - (DAYS + 15) * 864e5).toISOString()) + '&select=client_id,match_code,value,at&order=at.asc&limit=20000').catch(() => [])) || [];
  const last = new Map(); for (const o of outs) if (o.match_code) last.set(o.client_id + '|' + o.match_code, o.value);
  const B = ['chat', 'mid', 'lock', 'ios', 'none'];
  const rows = Object.fromEntries(B.map((b) => [b, { bucket: b, n: 0, won: 0, nomsg: 0, other: 0, open: 0 }]));
  const seen = new Set();
  for (const r of rets) {
    const p = r.payload || {}; if (String(p.is_test) === '1') continue;
    const k = r.client_id + '|' + (r.match_code || ''); if (!r.match_code || seen.has(k)) continue; seen.add(k);   // آخر رجوع لكل ضغطة
    if (!Number(p.app_opened)) continue;                                                                          // التطبيق ماتفتحش: مالهاش شاشة تتقاس
    const sa = screenAwake(p, p.os);
    const row = rows[sa ? sa.bucket : 'none'];
    const o = last.get(k);
    row.n++; if (o === 'تم') row.won++; else if (o === 'ماوصلش رسالة') row.nomsg++; else if (o) row.other++; else row.open++;
  }
  const out = B.map((b) => Object.assign(rows[b], { won_pct: rows[b].n - rows[b].open ? Math.round((rows[b].won / (rows[b].n - rows[b].open)) * 100) : null, nomsg_pct: rows[b].n - rows[b].open ? Math.round((rows[b].nomsg / (rows[b].n - rows[b].open)) * 100) : null }));
  return json({ ok: true, days: DAYS, rows: out, total: out.reduce((a, r) => a + r.n, 0) });
}
