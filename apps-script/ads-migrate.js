/**
 * ads-migrate.js — v3.13.0 (S02: جوجل أدز على السيرفر)
 * migrateTokensToServer(): بتنقل ربط حسابات جوجل أدز من تبويب «_Tokens» للسيرفر، وهناك بيتخزن مشفّر.
 *  • بيشغّلها محمود بإيده من المحرر (مرة واحدة، وتتعاد بعد أي ربط جديد).
 *  • مابتطبعش ولا ترجّع ولا تبعت على تليجرام أي توكن: أسماء المواقع والنتيجة بس.
 *  • مابتمسحش حاجة من الشيت. مسح «_Tokens» قرار لوحده بعد 3 أيام سحب ناجح من السيرفر.
 * المطلوب قبلها: SERVER_URL و SERVER_ADMIN_TOKEN في Script Properties، و«🖥️ مزامنة المواقع مع السيرفر» اتعملت.
 * بتعتمد على adsIntelSites_ (ads-pull.js) و serverCall_ (server-sync.js).
 */

var ADS_MIGRATE_BACKFILL_DAYS = 30;   // خط الأساس: السيرفر يسحب آخر 30 يوم أول مرة

function migrateTokensToServer() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tk = ss.getSheetByName('_Tokens');
  var total = tk ? Math.max(tk.getLastRow() - 1, 0) : 0;
  var sites = adsIntelSites_(ss);
  var ok = [], bad = [];
  sites.forEach(function (s) {
    try {
      serverCall_('post', '/v1/admin/ads/credentials', {
        client_id: s.id, customer_id: s.cid, login_customer_id: s.login || '', refresh_token: s.refresh,
        campaign_ids: s.campaigns, backfill_days: ADS_MIGRATE_BACKFILL_DAYS
      });
      ok.push(s.name);
    } catch (e) {
      bad.push(s.name + ': ' + adsMigrateSafe_(e, s.refresh));
    }
  });
  var lines = ['🔐 نقل ربط جوجل أدز للسيرفر: ' + ok.length + ' من ' + total + ' صف في _Tokens'];
  if (ok.length) lines.push('✅ ' + ok.join(' · '));
  if (bad.length) lines = lines.concat(['❌ ماتنقلش:'], bad.map(function (x) { return '• ' + x; }));
  if (total > sites.length) lines.push('⚠️ ' + (total - sites.length) + ' صف اتخطّى (ناقص رقم الحساب أو التوكن أو رقم الموقع)');
  var msg = lines.join('\n');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  return { total: total, moved: ok.length, failed: bad.length, skipped: Math.max(total - sites.length, 0) };
}

// رسالة الخطأ من غير أي احتمال إن التوكن يظهر فيها
function adsMigrateSafe_(e, secret) {
  var m = String(e && e.message || e);
  if (secret) m = m.split(secret).join('[…]');
  if (/ 404/.test(m) && /client/.test(m)) return 'الموقع مش على السيرفر ← شغّل «🖥️ مزامنة المواقع مع السيرفر» الأول';
  if (/ 503/.test(m)) return 'السيرفر لسه مافيهوش مفتاح التشفير (TOKEN_ENC_KEY)';
  return m.slice(0, 160);
}
