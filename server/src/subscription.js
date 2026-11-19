// كشف حساب الاشتراك + تنبيه الدفعة القادمة (18 نوفمبر · محمود: «كشف حساب في أكونت العميل للمدفوعات السابقة ونظام اشتراكه وتنبيه للدفعة القادمة»).
//  • orgStatement: الاشتراك الحالي (الباقة · المدة · العدد) · موعد الدفعة القادمة وقيمتها المتوقعة · كل المدفوعات (كل واحدة بالمدة اللي غطّتها) · إجمالي المدفوع لكل عملة.
//    بيطلع في ردّ صفحة الاشتراك (billing.js)، ولمالك الحساب بس.
//  • renewalReminders: الكرون كل ساعة. تنبيه تيليجرام لمالك الحساب قبل نهاية الاشتراك (أو التجربة) بـ 7 · 3 · 1 أيام، ومرة بعد الانتهاء.
//    مرة واحدة لكل مرحلة (organizations.renew_notified_for + renew_notified_stage، migration 0033)، ولو اتجدد الاشتراك التنبيهات بتبدأ من الأول.
//    والشريط اللي فوق اللوحة (dash.js trialBar) بيفضل شغال من غير تيليجرام.
import { eq } from './db.js';
import { audit } from './auth.js';
import { escHtml } from './telegram.js';
import { loadBilling, ctxFor, countryOf, quoteFor } from './billing.js';
import { tellOwners } from './payments.js';

const DAY = 864e5;
const addMonths = (from, n) => { const d = new Date(from); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString(); };
const money = (v, c) => (Math.round(Number(v) * 100) / 100).toLocaleString('en-US') + ' ' + c;
const PLAN_AR = { basic: 'الأساسية', pro: 'النمو', agency: 'الوكالات' };

function planLabel(bill, id) {
  const p = id && bill && (bill.plans || []).find((x) => x.id === id);
  return (p && (p.name_ar || p.name_en)) || PLAN_AR[id] || id || '—';
}

// الدفعة القادمة المتوقعة: نفس باقة ومدة وعدد آخر دفعة اتقبلت بالأسعار الحالية (تقدير، والأسعار ممكن تتغير)
async function nextAmount(db, org, bill, ctx, last) {
  try {
    const plan = (bill.plans || []).find((p) => p.id === org.plan && p.active);
    if (!plan) return null;
    const period = last ? last.period : 'month', units = org.plan_units || (last && last.units) || plan.min_units || 1;
    const q = await quoteFor(db, org, bill, plan, ctx, period, units, null);
    return q && !q.error ? { amount: q.total, currency: q.currency, period, units } : null;
  } catch (e) { return null; }
}

export async function orgStatement(db, org, bill, ctx, now) {
  const t0 = now || Date.now();
  const rows = (await db.select('payments?org_id=' + eq(org.id) + '&select=id,plan_id,period,amount,currency,status,reason,discount,units,ref,method_id,created_at,reviewed_at,period_end&order=created_at.desc&limit=200').catch(() => [])) || [];
  const mids = [...new Set(rows.map((r) => r.method_id).filter(Boolean))];
  const methods = new Map();
  if (mids.length) for (const m of (await db.select('payment_methods?id=in.(' + mids.map(encodeURIComponent).join(',') + ')&select=id,kind,label').catch(() => [])) || []) methods.set(m.id, { kind: m.kind, label: m.label || '' });
  // المدة اللي كل دفعة مقبولة غطّتها: من آخر دفعة سابقة لسه سارية (أو من وقت القبول) لحد period_end
  const approved = rows.filter((r) => r.status === 'approved' && r.period_end).sort((a, b) => Date.parse(a.reviewed_at || a.created_at) - Date.parse(b.reviewed_at || b.created_at));
  const cover = new Map();
  let prevEnd = 0;
  for (const r of approved) {
    const at = Date.parse(r.reviewed_at || r.created_at), from = Math.max(at, prevEnd), to = Date.parse(r.period_end);
    cover.set(r.id, { from: new Date(from).toISOString(), to: r.period_end });
    prevEnd = Math.max(prevEnd, to);
  }
  const list = rows.map((r) => ({ id: r.id, at: r.created_at, status: r.status, plan: r.plan_id, period: r.period, units: r.units || 1, amount: Number(r.amount), currency: r.currency, discount: r.discount || 0, ref: r.ref || '', method: methods.get(r.method_id) || null, reason: r.reason || '', reviewed_at: r.reviewed_at || null, from: cover.has(r.id) ? cover.get(r.id).from : null, to: cover.has(r.id) ? cover.get(r.id).to : null }));
  const totals = {}, paid = approved;
  for (const r of paid) { const t = totals[r.currency] || (totals[r.currency] = { currency: r.currency, amount: 0, count: 0 }); t.amount += Number(r.amount); t.count++; }
  const last = approved.length ? approved[approved.length - 1] : null;
  const active = org.status === 'active', trial = org.status === 'trial';
  const due = active ? org.plan_period_end : trial ? org.trial_ends_at : null;
  const next = due ? { kind: active ? 'renew' : 'trial_end', at: due, days: Math.ceil((Date.parse(due) - t0) / DAY) } : null;
  if (next && active) next.est = await nextAmount(db, org, bill, ctx, last);
  return {
    subscription: {
      status: org.status, plan: org.plan || null, plan_name: org.plan ? planLabel(bill, org.plan) : null, units: org.plan_units || (last && last.units) || null,
      period: last ? last.period : null, started_at: approved.length ? (approved[0].reviewed_at || approved[0].created_at) : null,
      period_end: org.plan_period_end || null, trial_ends_at: org.trial_ends_at || null, founder: !!org.founder_no,
    },
    next, totals: Object.values(totals).map((x) => ({ currency: x.currency, amount: Math.round(x.amount * 100) / 100, count: x.count })),
    pending: rows.filter((r) => r.status === 'pending').length, rows: list,
  };
}

// ── تنبيه الدفعة القادمة ──
export const STAGES = [7, 3, 1, 0];
export function stageFor(daysLeft) { if (daysLeft <= 0) return 0; if (daysLeft <= 1) return 1; if (daysLeft <= 3) return 3; if (daysLeft <= 7) return 7; return null; }

function text(kind, stage, org, bill, est, dueIso, daysLeft) {
  const date = dueIso.slice(0, 10), link = '<a href="https://app.maestrolt.com/#/billing">افتح صفحة الاشتراك</a>';
  const nm = escHtml(org.name || '');
  if (kind === 'trial_end') {
    return (stage === 0 ? '⚠️ <b>انتهت تجربتك</b>' : '⏰ <b>تجربتك تنتهي ' + (daysLeft <= 1 ? 'غدًا' : 'بعد ' + daysLeft + ' أيام') + '</b>') + (nm ? '\nالحساب: ' + nm : '') + '\nتاريخ الانتهاء: ' + date +
      '\n' + (stage === 0 ? 'الحماية متوقفة حتى تشترك.' : 'اشترك قبل الانتهاء لتبقى الحماية تعمل.') + '\n' + link;
  }
  return (stage === 0 ? '⚠️ <b>انتهى اشتراكك</b>' : '⏰ <b>موعد دفعتك القادمة ' + (daysLeft <= 1 ? 'غدًا' : 'بعد ' + daysLeft + ' أيام') + '</b>') + (nm ? '\nالحساب: ' + nm : '') +
    '\nالباقة: ' + escHtml(planLabel(bill, org.plan)) + '\nينتهي الاشتراك في: ' + date + (est ? '\nالمبلغ المتوقع: ' + money(est.amount, est.currency) : '') +
    '\n' + (stage === 0 ? 'جدّد الآن لتعود الحماية.' : 'جدّد قبل الانتهاء لتبقى الحماية تعمل دون انقطاع.') + '\n' + link;
}

export async function renewalReminders(env, db, fetchImpl, now) {
  const t0 = now || Date.now(), soon = new Date(t0 + 8 * DAY).toISOString();
  const cols = 'id,name,status,plan,plan_units,plan_period_end,trial_ends_at,country,founder_no,founder_since,renew_notified_for,renew_notified_stage';
  let act = [], tri = [];
  const sel = async (q) => { try { return (await db.select(q)) || []; } catch (e) { return (await db.select(q.replace(',renew_notified_for,renew_notified_stage', ''))) || []; } };   // قبل migration 0033
  act = await sel('organizations?status=eq.active&plan_period_end=lt.' + encodeURIComponent(soon) + '&select=' + cols + '&limit=300').catch(() => []);
  tri = await sel('organizations?status=eq.trial&trial_ends_at=lt.' + encodeURIComponent(soon) + '&select=' + cols + '&limit=300').catch(() => []);
  let bill = null, sent = 0, checked = 0;
  for (const org of act.map((o) => ({ o, kind: 'renew', due: o.plan_period_end })).concat(tri.map((o) => ({ o, kind: 'trial_end', due: o.trial_ends_at })))) {
    if (!org.due || !('renew_notified_for' in org.o)) continue;   // من غير migration 0033 مانقدرش نمنع تكرار التنبيه، فمابنبعتش
    const days = Math.ceil((Date.parse(org.due) - t0) / DAY);
    if (days < -3) continue;                         // مر عليه أكتر من 3 أيام: مانزعّجش العميل
    const stage = stageFor(days);
    if (stage === null) continue;
    checked++;
    const o = org.o, sameDue = o.renew_notified_for && Date.parse(o.renew_notified_for) === Date.parse(org.due);
    if (sameDue && o.renew_notified_stage != null && o.renew_notified_stage <= stage) continue;   // المرحلة دي (أو أقرب منها) اتبعتت
    let est = null;
    if (org.kind === 'renew') {
      bill = bill || await loadBilling(db);
      const ctx = ctxFor(bill, await countryOf(db, o).catch(() => null));
      const lastRow = (await db.select('payments?org_id=' + eq(o.id) + '&status=eq.approved&select=period,units&order=reviewed_at.desc&limit=1').catch(() => []))[0] || null;
      est = await nextAmount(db, o, bill, ctx, lastRow);
    } else bill = bill || await loadBilling(db);
    const n = await tellOwners(env, db, o.id, text(org.kind, stage, o, bill, est, org.due, Math.max(0, days)), fetchImpl);
    if (n > 0) {
      await db.update('organizations?id=' + eq(o.id), { renew_notified_for: org.due, renew_notified_stage: stage });
      await audit(db, null, 'renewal_reminder', true, (o.id + ' ' + org.kind + ' d' + stage).slice(0, 200)).catch(() => {});
      sent++;
    }
  }
  return { checked, sent };
}
