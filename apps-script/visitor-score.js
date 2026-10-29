/**
 * visitor-score.js — v3.11.0: «درجة الزائر» (0–100، تقديرية) + الأجهزة اللي ضغطت الإعلان أكتر من مرة
 *
 * قرار محمود 29 أكتوبر: درجة مؤقتة لحد التطبيق، من الإشارات اللي عندنا، وأوزانها بتتظبط من نتايج «التنفيذ».
 * بتتحسب كل صبح جوه analyzeClickGap لزيارات الإعلان (اللي ليها gclid) في آخر SCORE_WINDOW_DAYS يوم،
 * وبتتكتب في عمودين في سجل الموقع: «درجة الزائر» و«أسباب الدرجة».
 * استخدامها: (1) تقرير الأجهزة المشبوهة · (2) الرفع لجوجل بيستبعد الدرجة الواطية · (3) جمهور «مشبوه».
 *
 * الدرجة «تقديرية» (مش مؤكدة) لحد ما «تم» تتجمع. الكود بيحسب، والذكاء الاصطناعي مالوش دعوة (القاعدة 4).
 */

var SCORE_COL = 'درجة الزائر', SCORE_WHY_COL = 'أسباب الدرجة';
var SCORE_WINDOW_DAYS = 14;      // الدرجة بتتحدّث للزيارات دي (النتيجة ممكن تتسجل بعد أيام)
var REPEAT_WINDOW_DAYS = 7;      // نافذة «نفس الجهاز ضغط كذا مرة»
var REPEAT_STRONG = 3;           // 3 ضغطات إعلان أو أكتر من نفس الجهاز من غير تواصل = مشبوه بقوة
var SCORE_LOW = 40;              // تحت كده = منخفض (مايترفعش لجوجل)

// الأوزان: نقطة البداية 50. كل وزن بسببه، والسبب بيتكتب جنب الدرجة
var SCORE_W = {
  contacted: 25,    // ضغط واتساب أو اتصال على الموقع
  done: 25,         // «تم»
  maybe: 15,        // «عميل محتمل» / «بيفكر»
  later: 5,         // «مؤجل»
  cancel: -10,      // «لغى» (إنسان حقيقي بس ماكملش)
  notSerious: -25,  // «مش جاد»
  noMsg: -30,       // «ماوصلش رسالة»
  vpn: -40,         // VPN / سيرفر
  bot: -40,         // متصفح آلي
  quick: -25,       // أقل من 3 ثواني من غير تفاعل ولا تواصل
  engaged: 5,       // 30 ثانية أو أكتر، أو 3 تفاعلات أو أكتر
  outside: -30,     // جوجل قال إنه برّه الاستهداف
  repeat2: -10,     // نفس الجهاز ضغط الإعلان مرتين من غير تواصل
  repeat3: -30      // نفس الجهاز ضغط الإعلان 3 مرات أو أكتر من غير تواصل
};

// v = زيارة من visitsByGclid_ · ci = { day, out } من «نقرات جوجل» · rep = عدد ضغطات نفس الجهاز في النافذة
function scoreVisit_(v, ci, rep) {
  var s = 50, why = [];
  function add(w, label) { s += w; why.push((w > 0 ? '+' : '') + w + ' ' + label); }
  if (v.contacted) add(SCORE_W.contacted, 'تواصل');
  var o = v.outcome || '';
  if (v.done) add(SCORE_W.done, 'تم');
  else if (v.maybe) add(SCORE_W.maybe, o || 'عميل محتمل');
  else if (o === 'مؤجل') add(SCORE_W.later, 'مؤجل');
  else if (o === 'لغى') add(SCORE_W.cancel, 'لغى');
  else if (o === 'مش جاد') add(SCORE_W.notSerious, 'مش جاد');
  if (v.noMsg) add(SCORE_W.noMsg, 'ماوصلش رسالة');
  if (/VPN|داتا سنتر|Tor|بروكسي/.test(v.net || '')) add(SCORE_W.vpn, 'VPN/سيرفر');
  if (v.bot) add(SCORE_W.bot, 'متصفح آلي');
  if (v.secs < 3 && v.inter === 0 && !v.contacted) add(SCORE_W.quick, 'أقل من 3 ثواني من غير تفاعل');
  else if (v.secs >= 30 || v.inter >= 3) add(SCORE_W.engaged, 'قعد/اتفاعل');
  if (ci && ci.out) add(SCORE_W.outside, 'برّه الاستهداف');
  if (!v.contacted && rep >= REPEAT_STRONG) add(SCORE_W.repeat3, 'نفس الجهاز ' + rep + ' ضغطات');
  else if (!v.contacted && rep === 2) add(SCORE_W.repeat2, 'نفس الجهاز ضغطتين');
  s = Math.max(0, Math.min(100, s));
  return { score: s, band: s >= 70 ? 'عالي' : s >= SCORE_LOW ? 'متوسط' : 'منخفض', why: why.join(' · ') || 'مفيش إشارات' };
}

// بيتنده من gapForSite_ بعد المطابقة. info: gclid ← { day, out } · بيرجّع سطور للتقرير
function scoreSite_(log, V, info, st, rec, siteId) {
  var gids = Object.keys(info).filter(function (g) { return V[g] && V[g].row; });
  if (!gids.length) return null;
  var maxDay = gids.reduce(function (m, g) { return info[g].day > m ? info[g].day : m; }, '');
  var from14 = shiftDay_(maxDay, -(SCORE_WINDOW_DAYS - 1)), from7 = shiftDay_(maxDay, -(REPEAT_WINDOW_DAYS - 1));

  // ── نفس الجهاز: ضغطات إعلان مختلفة (gclid) في آخر 7 أيام
  var dev = {};
  gids.forEach(function (g) {
    var v = V[g], d = info[g].day;
    if (!v.dev || d < from7) return;
    var x = dev[v.dev] || (dev[v.dev] = { key: v.dev, g: {}, contacted: false, ips: {}, nets: {}, cities: {} });
    x.g[g] = 1;
    if (v.contacted) x.contacted = true;
    if (v.ip) x.ips[v.ip] = v.net || '';
    if (info[g].city) x.cities[info[g].city] = 1;
  });
  function repOf(v) { var x = v.dev && dev[v.dev]; return x ? Object.keys(x.g).length : 1; }

  // ── الدرجة: بتتكتب للزيارات اللي في آخر 14 يوم (عمود واحد، كتابة واحدة)
  var cS = extraCol_(log, SCORE_COL), cW = extraCol_(log, SCORE_WHY_COL);
  var rows = gids.filter(function (g) { return info[g].day >= from14; });
  if (rows.length) {
    var minRow = rows.reduce(function (m, g) { return Math.min(m, V[g].row); }, Infinity), maxRow = rows.reduce(function (m, g) { return Math.max(m, V[g].row); }, 0);
    var n = maxRow - minRow + 1;
    var sv = log.getRange(minRow, cS, n, 1).getValues(), wv = log.getRange(minRow, cW, n, 1).getValues();
    var byOutcome = {};
    rows.forEach(function (g) {
      var v = V[g], r = scoreVisit_(v, info[g], repOf(v));
      sv[v.row - minRow][0] = r.score;
      wv[v.row - minRow][0] = r.band + ' — ' + r.why;
      var k = v.done ? 'تم' : v.maybe ? 'عميل محتمل/بيفكر' : v.noMsg ? 'ماوصلش رسالة' : v.contacted ? 'تواصل (من غير نتيجة)' : 'ماتواصلش';
      var b = byOutcome[k] || (byOutcome[k] = { n: 0, sum: 0 });
      b.n++; b.sum += r.score;
    });
    log.getRange(minRow, cS, n, 1).setValues(sv);
    log.getRange(minRow, cW, n, 1).setValues(wv);
  }

  // ── الأجهزة المشبوهة: 3 ضغطات أو أكتر من غير تواصل
  var sus = Object.keys(dev).map(function (k) { return dev[k]; })
    .filter(function (x) { return !x.contacted && Object.keys(x.g).length >= REPEAT_STRONG; })
    .sort(function (a, b) { return Object.keys(b.g).length - Object.keys(a.g).length; });
  var L = [];
  if (sus.length) {
    L.push('🔁 <b>أجهزة ضغطت الإعلان ' + REPEAT_STRONG + ' مرات أو أكتر في ' + REPEAT_WINDOW_DAYS + ' أيام ومحدش منها تواصل: ' + sus.length + '</b>');
    sus.slice(0, 5).forEach(function (x) {
      var ips = Object.keys(x.ips);
      L.push('• جهاز …' + esc_(x.key.slice(-6)) + ': ' + Object.keys(x.g).length + ' ضغطات · ' + ips.length + ' IP' + (Object.keys(x.cities).length ? ' · ' + esc_(Object.keys(x.cities).slice(0, 3).join('، ')) : ''));
      // استبعاد IP «مقترح» (مستني موافقتك في تبويب الأوامر) — الشبكة الثابتة بس، الموبايل لأ (القاعدة 2 + §٧)
      ips.forEach(function (ip) {
        var net = x.ips[ip];
        if (!st || !st.cid || /جوال|موبايل|mobile/i.test(net)) return;
        try { adsQueueAction_(st.cid, rec.n || siteId, 'استبعاد IP', st.campaigns || [], ip, 'نفس الجهاز ضغط الإعلان ' + Object.keys(x.g).length + ' مرات من غير تواصل (' + (net || 'شبكة؟') + ')', 'مقترح'); }
        catch (e) { console.error('queue repeat ip: ' + e); }
      });
    });
    L.push('اللي على شبكة ثابتة اتضاف «مقترح» في «⚙️ أوامر جوجل أدز» — غيّره لـ«معتمد» لو موافق.');
  }
  var ob = Object.keys(byOutcome || {});
  if (ob.length) L.push('📈 متوسط درجة الزائر (تقديرية، ' + SCORE_WINDOW_DAYS + ' يوم): ' + ob.map(function (k) { return esc_(k) + ' ' + Math.round(byOutcome[k].sum / byOutcome[k].n) + ' (' + byOutcome[k].n + ')'; }).join(' · '));
  return L.length ? L.join('\n') : null;
}

function shiftDay_(day, n) {
  var p = String(day).split('-').map(Number);
  if (p.length !== 3 || !p[0]) return '';
  var d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
  return d.toISOString().slice(0, 10);
}
