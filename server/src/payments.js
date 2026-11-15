// الدفع، المرحلة 2 (15 نوفمبر · briefs/2026-11-12-payments.md §3–4): التحويل اليدوي بالإيصال ومراجعته.
// العميل: يختار الباقة والمدة والوسيلة ← يحوّل المبلغ اللي السيرفر حسبه ← يرفع صورة الإيصال + رقم العملية ← «بنراجع خلال ساعات، بحد أقصى 24 ساعة».
// الأدمن: تنبيه تليجرام لكل إيصال ← شاشة «المدفوعات» (الصورة · رقم العملية · تحذير لو الإيصال متكرر) ← «موافقة» أو «رفض بسبب».
// الموافقة: الباقة تتفعّل للمدة (بتتضاف على اللي فاضل لو لسه شغال)، ومقعد المؤسس بيتحجز لو الطلب اتعمل بخصم المؤسسين وفيه مقاعد.
// أمان: صاحب الحساب بس اللي يدفع · المبلغ من السيرفر مش من المتصفح · الصورة بتتفحص من أول بايتات (JPEG/PNG/WEBP) ولحد 5 ميجا
//       · مخزن خاص (receipts) · رقم العملية مايتقبلش مرتين على نفس الوسيلة · نفس الصورة لو اترفعت تاني بتتعلّم للأدمن.
import { eq } from './db.js';
import { json } from './util.js';
import { isPlatform, hasPerm, notFound, roleFor } from './sites.js';
import { audit } from './auth.js';
import { loadBilling, methodsFor, ctxFor, countryOf, ORG_BILL, quoteFor } from './billing.js';
import { sendTelegram, escHtml } from './telegram.js';
import { tg } from './notify.js';

export const BUCKET = 'receipts';
const MAX_BYTES = 5 * 1024 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REF_RE = /^[A-Za-z0-9\-_.#/ ]{4,40}$/;
const MANUAL = ['instapay', 'vodafone_cash'];
const PLAN_AR = { basic: 'الأساسية', pro: 'النمو', agency: 'الوكالات' };
const KIND_AR = { instapay: 'إنستا باي', vodafone_cash: 'فودافون كاش', paymob: 'Paymob' };
const REMIND_H = 20;

// نوع الصورة من أول بايتات (مش من اسم الملف)
export function sniff(b) {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length > 12 && String.fromCharCode(b[0], b[1], b[2], b[3]) === 'RIFF' && String.fromCharCode(b[8], b[9], b[10], b[11]) === 'WEBP') return 'image/webp';
  return null;
}
function fromDataUrl(s) {
  const m = /^data:image\/[a-z]+;base64,([A-Za-z0-9+/=]+)$/.exec(String(s || ''));
  if (!m || m[1].length > Math.ceil(MAX_BYTES / 3) * 4 + 8) return null;
  return Uint8Array.from(atob(m[1]), (c) => c.charCodeAt(0));
}
const addMonths = (from, n) => { const d = new Date(from); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString(); };
const money = (v, c) => (Math.round(Number(v) * 100) / 100).toLocaleString('en-US') + ' ' + c;

// ── العميل: طلب اشتراك بإيصال ──
export async function dashPay(req, env, db, sess, fetchImpl) {
  const b = await req.json().catch(() => ({}));
  const orgId = String(b.org || '');
  if (!UUID_RE.test(orgId)) return notFound();
  const role = roleFor(sess, orgId);
  if (!role) return notFound();
  if (role !== 'owner') return json({ ok: false, error: 'role' }, 403);
  const org = await db.one('organizations?id=' + eq(orgId) + '&select=' + ORG_BILL).catch(() => db.one('organizations?id=' + eq(orgId) + '&select=' + ORG_BILL.replace(',country', '')));   // قبل 0021
  if (!org) return notFound();
  if (!['month', 'year'].includes(b.period)) return json({ ok: false, error: 'period' }, 400);
  const ref = String(b.ref || '').trim();
  if (!REF_RE.test(ref)) return json({ ok: false, error: 'ref' }, 400);
  const bill = await loadBilling(db);
  const plan = bill.plans.find((p) => p.id === b.plan && p.active);
  if (!plan) return json({ ok: false, error: 'plan' }, 400);
  const ctx = ctxFor(bill, await countryOf(db, org)), currency = ctx.currency;
  const methods = await methodsFor(db, org, currency);
  const method = methods.find((m) => m.id === b.method_id);
  if (!method || !MANUAL.includes(method.kind)) return json({ ok: false, error: 'method' }, 400);
  // السعر النهائي من السيرفر: أحسن خصم واحد من (المؤسسين · خصم الباقة · الكوبون)
  const q = await quoteFor(db, org, bill, plan, ctx, b.period, b.units, b.coupon);
  if (q.error) return json({ ok: false, error: q.error }, 400);
  const bytes = fromDataUrl(b.receipt);
  if (!bytes || bytes.length < 200) return json({ ok: false, error: 'receipt' }, 400);
  if (bytes.length > MAX_BYTES) return json({ ok: false, error: 'too_big' }, 413);
  const mime = sniff(bytes);
  if (!mime) return json({ ok: false, error: 'receipt' }, 400);
  // طلب واحد مستني لكل حساب · رقم العملية مرة واحدة على نفس الوسيلة
  const pending = await db.one('payments?org_id=' + eq(org.id) + '&status=eq.pending&select=id');
  if (pending) return json({ ok: false, error: 'pending' }, 409);
  const usedRef = await db.one('payments?method_id=' + eq(method.id) + '&ref=' + eq(ref) + '&status=neq.rejected&select=id');
  if (usedRef) return json({ ok: false, error: 'ref_used' }, 409);
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((x) => x.toString(16).padStart(2, '0')).join('');
  const dup = await db.one('payments?receipt_hash=' + eq(hash) + '&select=id&order=created_at.asc');
  const id = crypto.randomUUID();
  const path = org.id + '/' + id + '.' + mime.split('/')[1];
  await db.putObject(BUCKET, path, bytes, mime);
  const units = q.units, amount = q.total, disc = q.discount;
  const founder = !org.founder_no && q.source === 'founder';
  const coupon = q.source === 'coupon' ? q.coupon : null;
  await db.insert('payments', [{ id, org_id: org.id, plan_id: plan.id, period: b.period, amount, currency, method_id: method.id, ref, receipt_path: path, receipt_hash: hash, receipt_mime: mime,
    dup_of: dup ? dup.id : null, founder, discount: disc, units, coupon_code: coupon ? coupon.code : null, coupon_off: coupon ? coupon.off : null, status: 'pending', created_by: sess.user.id, created_at: new Date().toISOString() }], { returning: false });
  await audit(db, sess.user.id, 'payment_submitted', true, org.id + ' ' + plan.id + ' ' + b.period + ' ' + amount + ' ' + currency);
  await sendTelegram(env, ['💳 <b>إيصال جديد للمراجعة</b>', 'الحساب: ' + escHtml(org.name || org.id), 'الباقة: ' + (plan.name_ar || PLAN_AR[plan.id] || plan.id) + (units > 1 ? ' · ' + units + ' مشاريع' : '') + ' · ' + (b.period === 'year' ? 'سنوي' : 'شهري'),
    'المبلغ: ' + money(amount, currency) + (coupon ? ' (كوبون ' + escHtml(coupon.code) + ')' : disc ? ' (خصم ' + disc + '%)' : ''), 'الوسيلة: ' + (KIND_AR[method.kind] || method.kind) + ' · رقم العملية: <code>' + escHtml(ref) + '</code>',
    dup ? '⚠️ نفس صورة إيصال اترفعت قبل كده' : null, '', '<a href="https://app.maestrolt.com/admin#billing">افتح للمراجعة</a>'].filter((x) => x != null).join('\n'), fetchImpl);
  return json({ ok: true, id, amount, currency, status: 'pending' });
}

// سجل المدفوعات للعميل (في صفحة الاشتراك)
export async function orgPayments(db, orgId) {
  const rows = (await db.select('payments?org_id=' + eq(orgId) + '&select=id,plan_id,period,amount,currency,status,reason,discount,units,created_at,reviewed_at,period_end&order=created_at.desc&limit=20').catch(() => [])) || [];
  return rows.map((p) => ({ id: p.id, plan: p.plan_id, period: p.period, amount: Number(p.amount), currency: p.currency, status: p.status, reason: p.reason || '', discount: p.discount || 0, units: p.units || 1, at: p.created_at, reviewed_at: p.reviewed_at, period_end: p.period_end }));
}

// ── الإدارة ──
async function reviewer(db, sess) {
  if (isPlatform(sess) || hasPerm(sess, 'billing') || hasPerm(sess, 'payments_review')) return { all: true };
  const pm = await db.one('platform_members?user_id=' + eq(sess.user.id) + '&select=own_payments').catch(() => null);
  return pm && pm.own_payments ? { all: false, owner: sess.user.id } : null;
}
async function visible(db, rv, rows) {
  if (rv.all || !rows.length) return rows;
  const mine = new Set(((await db.select('payment_methods?owner_id=' + eq(rv.owner) + '&select=id')) || []).map((m) => m.id));
  return rows.filter((p) => mine.has(p.method_id));
}

export async function platformPayments(req, env, db, sess, url) {
  const rv = await reviewer(db, sess);
  if (!rv) return notFound();
  const st = ['pending', 'approved', 'rejected'].includes(url.searchParams.get('status')) ? url.searchParams.get('status') : 'pending';
  let rows = (await db.select('payments?status=eq.' + st + '&select=id,org_id,plan_id,period,amount,currency,method_id,ref,dup_of,founder,discount,units,status,reason,created_at,reviewed_at,period_end&order=created_at.' + (st === 'pending' ? 'asc' : 'desc') + '&limit=100')) || [];
  rows = await visible(db, rv, rows);
  const ids = (k) => [...new Set(rows.map((r) => r[k]).filter(Boolean))];
  const orgs = ids('org_id').length ? (await db.select('organizations?id=in.(' + ids('org_id').join(',') + ')&select=id,name,plan,status,plan_period_end,founder_no')) || [] : [];
  const methods = ids('method_id').length ? (await db.select('payment_methods?id=in.(' + ids('method_id').join(',') + ')&select=id,kind,label')) || [] : [];
  const now = Date.now();
  return json({ ok: true, status: st, payments: rows.map((p) => {
    const o = orgs.find((x) => x.id === p.org_id) || {}, m = methods.find((x) => x.id === p.method_id) || {};
    return { id: p.id, org: { id: p.org_id, name: o.name || '', plan: o.plan || null, status: o.status || '', period_end: o.plan_period_end || null, founder_no: o.founder_no || null },
      plan: p.plan_id, period: p.period, amount: Number(p.amount), currency: p.currency, method: { kind: m.kind || '', label: m.label || '' }, ref: p.ref, dup: !!p.dup_of,
      founder: !!p.founder, discount: p.discount || 0, units: p.units || 1, status: p.status, reason: p.reason || '', at: p.created_at, hours: Math.floor((now - Date.parse(p.created_at)) / 36e5), reviewed_at: p.reviewed_at, period_end: p.period_end };
  }) });
}

// صورة الإيصال (data URL، علشان سياسة الأمان في اللوحة: img-src 'self' data:)
export async function platformReceipt(req, env, db, sess, url) {
  const rv = await reviewer(db, sess);
  if (!rv) return notFound();
  const id = String(url.searchParams.get('id') || '');
  if (!UUID_RE.test(id)) return notFound();
  const p = await db.one('payments?id=' + eq(id) + '&select=id,method_id,receipt_path,receipt_mime');
  if (!p || !(await visible(db, rv, [p])).length || !p.receipt_path) return notFound();
  const buf = new Uint8Array(await db.getObject(BUCKET, p.receipt_path));
  let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return json({ ok: true, src: 'data:' + (p.receipt_mime || sniff(buf) || 'image/jpeg') + ';base64,' + btoa(bin) });
}

export async function platformPaymentReview(req, env, db, sess, fetchImpl) {
  const rv = await reviewer(db, sess);
  if (!rv) return notFound();
  const b = await req.json().catch(() => ({}));
  if (!UUID_RE.test(String(b.id || ''))) return notFound();
  if (!['approve', 'reject'].includes(b.decision)) return json({ ok: false, error: 'bad_request' }, 400);
  const p = await db.one('payments?id=' + eq(b.id) + '&select=id,org_id,plan_id,period,amount,currency,method_id,founder,units,coupon_code,status');
  if (!p || !(await visible(db, rv, [p])).length) return notFound();
  if (p.status !== 'pending') return json({ ok: false, error: 'done' }, 409);
  const now = new Date().toISOString();
  const org = await db.one('organizations?id=' + eq(p.org_id) + '&select=id,name,plan_period_end,founder_no');
  if (b.decision === 'reject') {
    const reason = String(b.reason || '').trim().slice(0, 300);
    if (reason.length < 3) return json({ ok: false, error: 'reason' }, 400);
    await db.update('payments?id=' + eq(p.id) + '&status=eq.pending', { status: 'rejected', reason, reviewed_by: sess.user.id, reviewed_at: now });
    await audit(db, sess.user.id, 'payment_rejected', true, p.org_id + ' ' + reason.slice(0, 80));
    await tellOwners(env, db, p.org_id, '❌ <b>لم نقبل التحويل</b>\nالسبب: ' + escHtml(reason) + '\nيمكنك رفع إيصال جديد من صفحة «الاشتراك» في لوحتك.', fetchImpl);
    return json({ ok: true, status: 'rejected' });
  }
  // التفعيل: من آخر المدة الحالية لو لسه شغالة، وإلا من دلوقتي
  const base = org && org.plan_period_end && Date.parse(org.plan_period_end) > Date.now() ? org.plan_period_end : now;
  const end = addMonths(base, p.period === 'year' ? 12 : 1);
  const patch = { plan: p.plan_id, status: 'active', plan_period_end: end, status_changed_at: now, plan_units: p.units || 1 };
  let seat = null;
  if (p.founder && org && !org.founder_no) {
    const bill = await loadBilling(db);
    if (bill.founders.used < bill.founders.limit) { seat = bill.founders.used + 1; patch.founder_no = seat; patch.founder_since = now; }
  }
  await db.update('payments?id=' + eq(p.id) + '&status=eq.pending', { status: 'approved', reviewed_by: sess.user.id, reviewed_at: now, period_end: end });
  if (p.coupon_code) { const c = await db.one('coupons?code=' + eq(p.coupon_code) + '&select=used').catch(() => null); if (c) await db.update('coupons?code=' + eq(p.coupon_code), { used: (c.used || 0) + 1 }).catch(() => {}); }
  await db.update('organizations?id=' + eq(p.org_id), patch);
  await audit(db, sess.user.id, 'payment_approved', true, p.org_id + ' ' + p.plan_id + ' ' + p.period + ' → ' + end.slice(0, 10) + (seat ? ' founder#' + seat : ''));
  await tellOwners(env, db, p.org_id, '✅ <b>تم تفعيل اشتراكك</b>\nالباقة: ' + (PLAN_AR[p.plan_id] || p.plan_id) + '\nحتى: ' + end.slice(0, 10) + (seat ? '\n🎖️ أنت من المؤسسين (رقم ' + seat + ')' : ''), fetchImpl);
  return json({ ok: true, status: 'approved', period_end: end, founder_no: seat });
}

// رسالة لشاتات «صاحب الموقع والمديرين» المربوطة بأي موقع في الحساب
async function tellOwners(env, db, orgId, html, fetchImpl) {
  try {
    if (!env.TG_TOKEN || String(env.TG_ALERTS || '').toLowerCase() === 'off') return;
    const sites = ((await db.select('clients?org_id=' + eq(orgId) + '&select=id')) || []).map((s) => s.id);
    if (!sites.length) return;
    const chats = [...new Set(((await db.select('tg_links?client_id=in.(' + sites.map(encodeURIComponent).join(',') + ')&audience=eq.owner&select=chat_id').catch(() => [])) || []).map((x) => String(x.chat_id)))];
    for (const chat of chats.slice(0, 10)) await tg(env, 'sendMessage', { chat_id: chat, text: html, parse_mode: 'HTML', disable_web_page_preview: true }, fetchImpl).catch(() => {});
  } catch (e) { console.error('payments notify: ' + String(e && e.message || e).slice(0, 100)); }
}

// الكرون: إيصال مستني أكتر من 20 ساعة ← تذكير مرة واحدة (الوعد للعميل 24 ساعة بحد أقصى)
export async function remindPending(env, db, fetchImpl, now) {
  const before = new Date((now || Date.now()) - REMIND_H * 36e5).toISOString();
  const rows = (await db.select('payments?status=eq.pending&reminded_at=is.null&created_at=lt.' + encodeURIComponent(before) + '&select=id,org_id,amount,currency,created_at&limit=20').catch(() => [])) || [];
  for (const p of rows) {
    const ok = await sendTelegram(env, '⏰ <b>إيصال مستني من ' + Math.floor(((now || Date.now()) - Date.parse(p.created_at)) / 36e5) + ' ساعة</b>\nوعدنا العميل بالمراجعة خلال 24 ساعة بحد أقصى.\nالمبلغ: ' + money(p.amount, p.currency) + '\n<a href="https://app.maestrolt.com/admin#billing">افتح للمراجعة</a>', fetchImpl);
    if (ok) await db.update('payments?id=' + eq(p.id), { reminded_at: new Date().toISOString() });
  }
  return { reminded: rows.length };
}
