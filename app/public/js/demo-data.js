// بيانات وهمية واقعية للوحة التجريبية (قرار 8 نوفمبر: «لوحة تجريبية ببيانات وهمية من غير رابط بيانات»).
// بتتولد في المتصفح من بذرة ثابتة، فنفس الأرقام كل مرة. مفيش أي طلب لأي سيرفر.
// نفس شكل البيانات اللي اللوحة الحقيقية هتاخدها من السيرفر (window.LTData)، فالشاشات واحدة.
(function () {
  'use strict';
  function rng(seed) { var s = seed >>> 0; return function () { s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function pick(r, a) { return a[Math.floor(r() * a.length)]; }
  function wpick(r, pairs) { var t = 0, i; for (i = 0; i < pairs.length; i++) t += pairs[i][1]; var x = r() * t; for (i = 0; i < pairs.length; i++) { x -= pairs[i][1]; if (x <= 0) return pairs[i][0]; } return pairs[0][0]; }
  function id(r, n) { var a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', s = ''; for (var i = 0; i < n; i++) s += a[Math.floor(r() * a.length)]; return s; }
  var DAY = 864e5;
  var NOW = Date.now();
  var dayStr = function (ms) { return new Date(ms + 3 * 3600e3).toISOString().slice(0, 10); };

  var PLACES = [
    ['الرياض', ['العليا', 'النرجس', 'الملقا', 'السليمانية', 'الياسمين', 'الروضة']],
    ['جدة', ['الروضة', 'السلامة', 'الحمراء', 'النعيم', 'الصفا']],
    ['مكة المكرمة', ['العزيزية', 'الشوقية', 'النسيم']],
    ['المدينة المنورة', ['قباء', 'العوالي']],
    ['الدمام', ['الفيصلية', 'الشاطئ']],
  ];
  var SITES = [
    { id: 'uEpXTJ6JhbdN', name: 'روضة الصالحين للعمرة', domain: 'rawda.site', currency: 'ر.س', cpc: 4.6, perDay: 62, seed: 7,
      keywords: ['برنامج عمرة', 'عمرة من الرياض', 'رحلات عمرة باص', 'عمرة رخيصة', 'حملة عمرة', 'عمرة رمضان'],
      campaigns: ['عمرة — بحث', 'عمرة — خرائط'] },
    { id: 'KzFeD6ZXsbYH', name: 'الإنجاز السريع', domain: 'enjaz.biz', currency: 'ر.س', cpc: 6.2, perDay: 38, seed: 11,
      keywords: ['معقب', 'تعقيب معاملات', 'معقب الرياض', 'استخراج تصريح', 'نقل كفالة', 'تجديد إقامة'],
      campaigns: ['خدمات التعقيب — بحث'] },
    // عملاء تانيين للوكالة (شاشة «كل العملاء» والتقارير)
    { id: 'Nkb7Clinic01', name: 'عيادات النخبة للأسنان', domain: 'nokhba-dental.sa', currency: 'ر.س', cpc: 9.4, perDay: 44, seed: 23,
      keywords: ['تقويم أسنان', 'زراعة أسنان', 'تبييض أسنان', 'عيادة أسنان قريبة', 'ابتسامة هوليود'], campaigns: ['التقويم — بحث', 'الزراعة — بحث'] },
    { id: 'Afq9Cool0001', name: 'مؤسسة الأفق للتكييف', domain: 'ofoq-ac.com', currency: 'ر.س', cpc: 3.8, perDay: 70, seed: 31,
      keywords: ['صيانة مكيفات', 'تنظيف مكيفات', 'فني تكييف', 'تركيب مكيف سبليت', 'شحن فريون'], campaigns: ['صيانة — بحث', 'صيانة — خرائط'] },
    { id: 'Nql4Movers01', name: 'نقل عفش جدة', domain: 'jeddah-movers.com', currency: 'ر.س', cpc: 5.1, perDay: 55, seed: 41,
      keywords: ['نقل عفش جدة', 'شركة نقل اثاث', 'نقل عفش مع التغليف', 'دينا نقل عفش'], campaigns: ['نقل عفش — بحث'] },
    { id: 'Lms2Store001', name: 'متجر لمسة للعطور', domain: 'lamsa.store', currency: 'ر.س', cpc: 2.2, perDay: 90, seed: 53,
      keywords: ['عطور رجالية', 'عطر عود', 'عطور نسائية فخمة', 'بخور'], campaigns: ['متجر — بحث', 'متجر — تسوق'] },
  ];

  var T = window.LT.t;
  var REASONS = {
    dc: T('dm.r.dc'), vpn: T('dm.r.vpn'), repeat: T('dm.r.repeat'), fast: T('dm.r.fast'), nomove: T('dm.r.nomove'),
    far: T('dm.r.far'), samedev: T('dm.r.samedev'), bot: T('dm.r.bot'), comp: T('dm.r.comp'),
  };
  var fmtR = function (t, o) { return t.replace(/\{(\w)\}/g, function (_, k) { return o[k]; }); };

  function build(site) {
    var r = rng(site.seed);
    var visits = [], days = [], leads = [];
    for (var d = 29; d >= 0; d--) {
      var base = NOW - d * DAY, day = dayStr(base);
      var n = Math.round(site.perDay * (0.75 + r() * 0.5) * (d === 0 ? Math.min(1, ((NOW + 3 * 3600e3) % DAY) / DAY + 0.15) : 1));
      var attack = (d === 9 || d === 4) ? Math.round(site.perDay * 0.45) : 0;
      var st = { day: day, real: 0, suspicious: 0, blocked: 0, billed: 0, offsite: 0, reached: 0, not_loaded: 0, refunded: 0, cost: 0, invalid_cost: 0 };
      for (var i = 0; i < n + attack; i++) {
        var isAttack = i >= n;
        var t = base - ((NOW - base) > 0 ? 0 : 0) - Math.floor(r() * (d === 0 ? ((NOW + 3 * 3600e3) % DAY) : DAY));
        var src = isAttack ? 'google_ads' : wpick(r, [['google_ads', 68], ['google_organic', 14], ['google_maps', 9], ['direct', 6], ['social', 3]]);
        var place = pick(r, PLACES), city = place[0], district = pick(r, place[1]);
        var net = isAttack ? wpick(r, [['dc', 5], ['vpn', 3], ['mobile', 2]]) : wpick(r, [['mobile', 70], ['home', 26], ['vpn', 3], ['dc', 1]]);
        var dev = wpick(r, [[T('dm.dev.mobile'), 82], [T('dm.dev.pc'), 15], [T('dm.dev.tablet'), 3]]);
        var os = dev === T('dm.dev.pc') ? pick(r, ['Windows', 'macOS']) : wpick(r, [['iOS', 55], ['Android', 45]]);
        var reasons = [], score;
        if (isAttack || net === 'dc' || net === 'vpn') {
          if (net === 'dc') reasons.push(REASONS.dc);
          if (net === 'vpn') reasons.push(REASONS.vpn);
          if (isAttack) reasons.push(fmtR(REASONS.repeat, { n: window.LT.n(3 + Math.floor(r() * 4), 'time'), m: window.LT.n(2 + Math.floor(r() * 6), 'minute') }));
          if (r() < 0.6) reasons.push(fmtR(REASONS.fast, { s: window.LT.n(1 + Math.floor(r() * 4), 'second') }));
          if (r() < 0.4) reasons.push(REASONS.nomove);
          if (r() < 0.25) reasons.push(fmtR(REASONS.samedev, { k: 3 + Math.floor(r() * 5) }));
          if (isAttack && r() < 0.15) reasons.push(REASONS.bot);
          score = 70 + Math.floor(r() * 29);
        } else if (r() < 0.07) {
          reasons.push(r() < 0.5 ? REASONS.far : fmtR(REASONS.comp, { k: 3 + Math.floor(r() * 3) }));
          if (r() < 0.5) reasons.push(fmtR(REASONS.fast, { s: window.LT.n(2 + Math.floor(r() * 5), 'second') }));
          score = 45 + Math.floor(r() * 25);
        } else score = Math.floor(r() * 30);
        var status = score >= 80 ? 'blocked' : score >= 45 ? 'suspicious' : 'real';
        var pages = status === 'real' ? 1 + Math.floor(r() * 4) : 1;
        var dur = status === 'real' ? 20 + Math.floor(r() * 260) : Math.floor(r() * 8);
        var contact = status === 'real' && r() < 0.16 ? wpick(r, [['wa', 62], ['call', 38]]) : '';
        var kw = src === 'google_ads' ? pick(r, site.keywords) : '';
        var v = { id: id(r, 10), at: new Date(t).toISOString(), day: day, src: src, kw: kw, campaign: src === 'google_ads' ? pick(r, site.campaigns) : '',
          city: city, district: district, net: net, device: dev, os: os, pages: pages, dur: dur, scroll: status === 'real' ? 30 + Math.floor(r() * 70) : Math.floor(r() * 10),
          contact: contact, score: score, status: status, reasons: reasons, ip: '•••.' + (10 + Math.floor(r() * 240)) + '.' + Math.floor(r() * 255), visit_no: status === 'real' && r() < 0.2 ? 2 + Math.floor(r() * 3) : 1 };
        v.journey = journey(r, v, t, site);
        visits.push(v);
        st[status]++;
        if (src === 'google_ads') { st.billed++; st.reached++; st.cost += site.cpc * (0.7 + r() * 0.6); if (status !== 'real') st.invalid_cost += site.cpc; }
        if (contact) {
          var outcome = wpick(r, [['تم', 34], ['بيفكر', 22], ['لغى', 10], ['مش جاد', 9], ['ماوصلش رسالة', 7], ['', 18]]);
          leads.push({ id: v.id, at: v.at, type: contact, code: id(r, 4), src: src, kw: kw, city: city, district: district, outcome: d < 1 && r() < 0.6 ? '' : outcome, visit: v.id });
        }
      }
      // ضغطات جوه الإعلان نفسه (اتصال · واتساب · اتجاهات) والصفحة اللي مافتحتش، ورجوع جوجل
      var off = Math.round(st.billed * (0.10 + r() * 0.06)), nl = Math.round(st.billed * (0.04 + r() * 0.04));
      st.offsite = off; st.not_loaded = nl; st.billed += off + nl; st.cost += (off + nl) * site.cpc;
      st.refunded = Math.round((st.suspicious + st.blocked) * (0.18 + r() * 0.1));
      st.cost = Math.round(st.cost); st.invalid_cost = Math.round(st.invalid_cost);
      days.push(st);
    }
    visits.sort(function (a, b) { return a.at < b.at ? 1 : -1; });
    leads.sort(function (a, b) { return a.at < b.at ? 1 : -1; });
    return { site: site, visits: visits, days: days, leads: leads, protection: protection(r, site, visits) };
  }

  function journey(r, v, t, site) {
    var ev = [], at = t;
    var push = function (dt, kind, text) { at += dt * 1000; ev.push({ at: new Date(at).toISOString(), kind: kind, text: text }); };
    push(0, 'ad', v.src === 'google_ads' ? T('dm.j.ad') + (v.kw ? ' — «' + v.kw + '»' : '') : T(v.src === 'google_maps' ? 'dm.j.maps' : v.src === 'google_organic' ? 'dm.j.organic' : v.src === 'social' ? 'dm.j.social' : 'dm.j.direct'));
    push(1, 'page', T('dm.j.home'));
    if (v.status !== 'real') { push(Math.max(1, v.dur), 'exit', T('dm.j.closed')); return ev; }
    var paths = T('dm.paths').split('|');
    for (var i = 1; i < v.pages; i++) push(8 + Math.floor(r() * 50), 'page', T('j.page', { t: pick(r, paths) }));
    if (v.scroll > 60) push(5 + Math.floor(r() * 30), 'scroll', T('j.s90') + ' (' + v.scroll + '%)');
    if (v.contact) push(4 + Math.floor(r() * 30), 'contact', T(v.contact === 'wa' ? 'j.wa' : 'j.call'));
    push(5 + Math.floor(r() * 40), 'exit', T('dm.j.left'));
    return ev;
  }

  function protection(r, site, visits) {
    var bad = visits.filter(function (v) { return v.status !== 'real'; });
    var pending = bad.filter(function (v) { return v.status === 'suspicious'; }).slice(0, site.seed === 7 ? 4 : Math.floor(r() * 4)).map(function (v) {
      return { id: 'p' + v.id, kind: v.net === 'dc' ? T('dm.k.range') : T('dm.k.device'), value: v.ip, score: v.score, reasons: v.reasons, clicks: 2 + Math.floor(r() * 5), cost: Math.round(site.cpc * (2 + r() * 5)), city: v.city };
    });
    var blocked = bad.filter(function (v) { return v.status === 'blocked'; }).slice(0, 8).map(function (v, i) {
      return { id: 'b' + v.id, kind: v.net === 'dc' ? T('dm.k.range') : v.net === 'vpn' ? 'VPN' : T('dm.k.device'), value: v.ip, where: i % 3 === 0 ? T('dm.where.both') : T('dm.where.google'), at: v.at, expires_days: 30 - Math.floor(r() * 25), reasons: v.reasons };
    });
    return { mode: 'active', strict: 'balanced', pending: pending, blocked: blocked,
      own: [{ label: T('dm.own.phone'), at: new Date(NOW - 12 * DAY).toISOString() }, { label: T('dm.own.laptop'), at: new Date(NOW - 5 * DAY).toISOString() }] };
  }

  var cache = {};
  function data(siteId) { var s = SITES.filter(function (x) { return x.id === siteId; })[0] || SITES[0]; return cache[s.id] || (cache[s.id] = build(s)); }
  function inRange(list, range, key) {
    var since = dayStr(NOW - (range - 1) * DAY);
    return list.filter(function (x) { return (key ? x[key] : x.day) >= since; });
  }
  function prevRange(list, range) {
    var a = dayStr(NOW - (2 * range - 1) * DAY), b = dayStr(NOW - range * DAY);
    return list.filter(function (x) { return x.day >= a && x.day <= b; });
  }
  function sum(list, k) { return list.reduce(function (s, x) { return s + (x[k] || 0); }, 0); }

  // لكل عميل: ملخص الفترة (للوكالة)
  function summary(siteId, range) {
    var D = data(siteId), days = inRange(D.days, range), prev = prevRange(D.days, range);
    var leads = D.leads.filter(function (l) { return l.at.slice(0, 10) >= dayStr(NOW - (range - 1) * DAY); });
    var won = leads.filter(function (l) { return l.outcome === 'تم'; }).length;
    var tot = sum(days, 'real') + sum(days, 'suspicious') + sum(days, 'blocked');
    var bad = sum(days, 'suspicious') + sum(days, 'blocked'), pbad = sum(prev, 'suspicious') + sum(prev, 'blocked');
    var ptot = sum(prev, 'real') + pbad;
    var cost = sum(days, 'cost');
    return { id: D.site.id, name: D.site.name, domain: D.site.domain, currency: D.site.currency,
      billed: sum(days, 'billed'), cost: cost, saved: sum(days, 'invalid_cost'), bad: bad, visits: tot,
      bad_pct: tot ? Math.round((bad / tot) * 1000) / 10 : 0, bad_pct_prev: ptot ? Math.round((pbad / ptot) * 1000) / 10 : 0,
      leads: leads.length, won: won, cpl: won ? Math.round(cost / won) : null,
      pending: D.protection.pending.length, delivery: D.site.id === 'Nql4Movers01' ? 98.7 : 99.8,
      ads: D.site.id !== 'Lms2Store001', template: D.site.id !== 'KzFeD6ZXsbYH' };
  }

  window.LTDemo = {
    demo: true,
    agency: { name: 'وكالة المدار للتسويق', email: 'reports@almadar.agency' },
    clients: function (range) { return Promise.resolve(SITES.map(function (s) { return summary(s.id, range); })); },
    summary: function (siteId, range) { return Promise.resolve(summary(siteId, range)); },
    sites: function () { return Promise.resolve(SITES.map(function (s) { return { id: s.id, name: s.name, domain: s.domain, currency: s.currency }; })); },
    overview: function (siteId, range) {
      var D = data(siteId), days = inRange(D.days, range), prev = prevRange(D.days, range);
      var leads = inRange(D.leads.map(function (l) { return Object.assign({ day: l.at.slice(0, 10) }, l); }), range);
      var won = leads.filter(function (l) { return l.outcome === 'تم'; }).length;
      var k = function (list) { return { billed: sum(list, 'billed'), real: sum(list, 'real'), suspicious: sum(list, 'suspicious'), blocked: sum(list, 'blocked'), saved: sum(list, 'invalid_cost'), cost: sum(list, 'cost') }; };
      var cur = k(days), pk = k(prev);
      cur.leads = leads.length; cur.won = won; cur.cpl = won ? Math.round(cur.cost / won) : null;
      var live = D.visits.filter(function (v) { return NOW - Date.parse(v.at) < 5 * 60e3; }).length || 3;
      return Promise.resolve({ currency: D.site.currency, kpi: cur, prev: pk, days: days, live: live,
        status: { protection: D.protection.mode, delivery: 99.8, ads: true, tracking_template: D.site.id !== 'KzFeD6ZXsbYH' },
        actions: [
          D.protection.pending.length ? { kind: 'approve', n: D.protection.pending.length } : null,
          leads.filter(function (l) { return !l.outcome; }).length ? { kind: 'outcome', n: leads.filter(function (l) { return !l.outcome; }).length } : null,
          { kind: 'refund', amount: Math.round(cur.saved * 0.6) },
          D.site.id === 'KzFeD6ZXsbYH' ? { kind: 'template' } : null,
        ].filter(Boolean),
        suspicious: D.visits.filter(function (v) { return v.status !== 'real'; }).slice(0, 5),
        places: topPlaces(inRange(D.visits, range).filter(function (v) { return v.status !== 'real'; })) });
    },
    statement: function (siteId, range) {
      var D = data(siteId), days = inRange(D.days, range);
      var vis = inRange(D.visits, range).filter(function (v) { return v.src === 'google_ads'; });
      var group = function (key) {
        var m = {}; vis.forEach(function (v) { var g = v[key] || '—'; var x = m[g] || (m[g] = { name: g, reached: 0, bad: 0 }); x.reached++; if (v.status !== 'real') x.bad++; });
        return Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) { return b.reached - a.reached; });
      };
      return Promise.resolve({ currency: D.site.currency, days: days,
        total: { billed: sum(days, 'billed'), offsite: sum(days, 'offsite'), reached: sum(days, 'reached'), not_loaded: sum(days, 'not_loaded'), refunded: sum(days, 'refunded'), cost: sum(days, 'cost'), invalid_cost: sum(days, 'invalid_cost'), bad: sum(days, 'suspicious') + sum(days, 'blocked') },
        by: { campaign: group('campaign'), kw: group('kw'), city: group('city'), district: group('district') } });
    },
    visits: function (siteId, range) { return Promise.resolve(inRange(data(siteId).visits, range)); },
    protection: function (siteId) { return Promise.resolve(data(siteId).protection); },
    leads: function (siteId, range) {
      var D = data(siteId), days = inRange(D.days, range);
      var list = D.leads.filter(function (l) { return l.at.slice(0, 10) >= dayStr(NOW - (range - 1) * DAY); });
      return Promise.resolve({ currency: D.site.currency, cost: sum(days, 'cost'), list: list });
    },
    alerts: function () {
      return Promise.resolve({
        rules: [
          { id: 'attack', name: T('dm.al.attack'), desc: T('dm.al.attack.d'), on: true, ch: ['tg', 'push'] },
          { id: 'overspend', name: T('dm.al.overspend'), desc: T('dm.al.overspend.d'), on: true, ch: ['tg', 'push'] },
          { id: 'disapproved', name: T('dm.al.disapproved'), desc: T('dm.al.disapproved.d'), on: true, ch: ['tg', 'push', 'email'] },
          { id: 'stopped', name: T('dm.al.stopped'), desc: T('dm.al.stopped.d'), on: true, ch: ['tg'] },
          { id: 'tracking', name: T('dm.al.tracking'), desc: T('dm.al.tracking.d'), on: true, ch: ['tg', 'email'] },
          { id: 'weekly', name: T('dm.al.weekly'), desc: T('dm.al.weekly.d'), on: false, ch: ['email'] },
        ],
        log: [
          { at: new Date(NOW - 4 * DAY - 3 * 3600e3).toISOString(), rule: T('dm.al.attack'), text: T('dm.log.1'), level: 'bad' },
          { at: new Date(NOW - 6 * DAY).toISOString(), rule: T('dm.al.disapproved'), text: T('dm.log.2'), level: 'warn' },
          { at: new Date(NOW - 9 * DAY - 5 * 3600e3).toISOString(), rule: T('dm.al.attack'), text: T('dm.log.3'), level: 'bad' },
          { at: new Date(NOW - 12 * DAY).toISOString(), rule: T('dm.al.overspend'), text: T('dm.log.4'), level: 'warn' },
        ] });
    },
    setup: function () {
      return Promise.resolve(SITES.map(function (s, i) {
        return { id: s.id, name: s.name, domain: s.domain, installed: true, plugin: '2.12.2', delivery: [99.9, 100, 99.7, 100, 99.8, 100, 99.9], ads: true, account: i ? '512-339-8841' : '784-201-5530', template: i === 0, own: 2, last_event: new Date(NOW - (i + 1) * 60e3).toISOString() };
      }));
    },
  };
  function topPlaces(list) {
    var m = {}; list.forEach(function (v) { var k = v.city + ' · ' + v.district; m[k] = (m[k] || 0) + 1; });
    return Object.keys(m).map(function (k) { return { name: k, n: m[k] }; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 5);
  }
})();
