// تجربة «الساعتين» (13 نوفمبر): الوقت الحقيقي (Date.now) مقابل ساعة الشغل (performance.now) اللي بتقف لما الموبايل ينام.
// لو الزائر كان بيكتب أو في مكالمة، الموبايل صاحي والساعتين قريبين. لو ساب الموبايل والشاشة قفلت، ساعة الشغل بتقف.
// ومعاهم «نبضة» كل ثانية والصفحة في الخلفية: النبضات بتقف لما الموبايل ينام (أو المتصفح يجمّد الصفحة).
// مفيش أي حاجة بتتبعت لأي سيرفر: النتيجة على الشاشة، وزرار نسخ.
(function () {
  'use strict';
  var NAMES = { wa_chat: 'واتساب: محادثة', wa_lock: 'واتساب: قفل الشاشة', call_talk: 'اتصال: مكالمة', call_lock: 'اتصال: قفل الشاشة' };
  var run = null, results = [];
  var $ = function (id) { return document.getElementById(id); };
  var fmt = function (ms) { var s = Math.round(ms / 1000); return s >= 60 ? Math.floor(s / 60) + ' د ' + (s % 60) + ' ث' : s + ' ث'; };
  function scenario() { var r = document.querySelector('input[name="sc"]:checked'); return r ? r.value : 'wa_chat'; }
  function start(channel) {
    var w0 = Date.now(), m0 = performance.now();
    run = { sc: scenario(), channel: channel, w0: w0, m0: m0, beats: [[w0, m0]], hidden: null, events: [] };
    if (run.timer) clearInterval(run.timer);
    run.timer = setInterval(function () { if (run) run.beats.push([Date.now(), performance.now()]); }, 1000);
    $('live').textContent = 'بدأ القياس: ' + NAMES[run.sc] + '. نفّذ المطلوب ثم ارجع هنا.';
  }
  function finish() {
    if (!run || run.hidden == null) return;
    clearInterval(run.timer);
    var w1 = Date.now(), m1 = performance.now();
    var wall = w1 - run.hidden.w, mono = m1 - run.hidden.m;
    // النبضات وقت الغياب بس، وأطول فترة «نوم»: فرق الساعتين بين نبضتين متتاليتين
    var beats = run.beats.filter(function (b) { return b[0] >= run.hidden.w; }).concat([[w1, m1]]);
    var prev = [run.hidden.w, run.hidden.m], longest = 0, slept = 0, gapMax = 0;
    beats.forEach(function (b) {
      var dw = b[0] - prev[0], dm = b[1] - prev[1], s = Math.max(0, dw - dm);
      slept += s; if (s > longest) longest = s; if (dw > gapMax) gapMax = dw; prev = b;
    });
    var r = { sc: run.sc, channel: run.channel, wall_s: Math.round(wall / 1000), mono_s: Math.round(mono / 1000), ratio: wall ? Math.round((mono / wall) * 100) : 0,
      beats: beats.length - 1, longest_sleep_s: Math.round(longest / 1000), max_gap_s: Math.round(gapMax / 1000), events: run.events, ua: navigator.userAgent };
    results.push(r); run = null; draw();
    $('live').textContent = 'تم: ' + NAMES[r.sc] + ' · الموبايل كان صاحيًا ' + r.ratio + '% من الوقت.';
  }
  function draw() {
    var tb = $('rows'); while (tb.firstChild) tb.removeChild(tb.firstChild);
    results.forEach(function (r) {
      var tr = document.createElement('tr');
      [NAMES[r.sc], fmt(r.wall_s * 1000), fmt(r.mono_s * 1000), r.ratio + '%', String(r.beats), fmt(r.longest_sleep_s * 1000)].forEach(function (t) { var td = document.createElement('td'); td.textContent = t; tr.appendChild(td); });
      tb.appendChild(tr);
    });
    $('raw').textContent = JSON.stringify(results, null, 1);
  }
  document.addEventListener('visibilitychange', function () {
    if (!run) return;
    run.events.push([document.visibilityState, Date.now() - run.w0, Math.round(performance.now() - run.m0)]);
    if (document.visibilityState === 'hidden' && run.hidden == null) run.hidden = { w: Date.now(), m: performance.now() };
    else if (document.visibilityState === 'visible') finish();
  });
  ['freeze', 'resume', 'pagehide', 'pageshow', 'blur', 'focus'].forEach(function (ev) {
    (ev === 'blur' || ev === 'focus' ? window : document).addEventListener(ev, function () { if (run) run.events.push([ev, Date.now() - run.w0, Math.round(performance.now() - run.m0)]); });
  });
  $('wa').addEventListener('click', function () { start('wa'); });
  $('call').addEventListener('click', function () { start('call'); });
  $('copy').addEventListener('click', function () {
    var t = JSON.stringify(results);
    var ok = function () { $('copied').textContent = 'تم النسخ. الصقه في المحادثة.'; };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(ok, function () { $('copied').textContent = 'انسخ النص أدناه يدويًا.'; });
    else $('copied').textContent = 'انسخ النص أدناه يدويًا.';
  });
})();
