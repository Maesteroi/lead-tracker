// البيانات الحقيقية للوحة العميل (من api.maestrolt.com/v1/dash/*). نفس شكل LTDemo، فالشاشات واحدة.
// اللي لسه مااشتغلش على السيرفر (درجة الحماية · جوجل أدز · تنبيهات العميل) بيرجع null أو soon، والشاشة بتعرضه «قريباً» بصراحة.
(function () {
  'use strict';
  var LT = window.LT, me = null;
  var get = function (path) { return LT.api(path).then(function (r) { if (r.status === 401) { location.replace('/login?next=' + encodeURIComponent(location.pathname)); throw new Error('auth'); } if (!r.ok) throw new Error('http ' + r.status); return r.body; }); };
  var q = function (site, range) { return '?site=' + encodeURIComponent(site) + (range ? '&range=' + range : ''); };
  var cache = {};
  function overviewRaw(site, range) { var k = site + '|' + range; return cache[k] || (cache[k] = get('/v1/dash/overview' + q(site, range)).finally(function () { setTimeout(function () { delete cache[k]; }, 30000); })); }

  function mapOverview(o) {
    var k = o.kpi;
    var actions = [];
    if (k.open) actions.push({ kind: 'outcome', n: k.open });
    if (!o.status.ads) actions.push({ kind: 'ads' });
    if (o.status.delivery != null && o.status.delivery < 99.5) actions.push({ kind: 'delivery', pct: o.status.delivery });
    return {
      live: o.live, currency: 'ر.س', scoring: false,
      kpi: { billed: null, real: k.sessions, suspicious: null, blocked: null, saved: null, cost: null, leads: k.leads, contacts: k.contacts, won: k.won, open: k.open, cpl: null, pageviews: k.pageviews },
      prev: { real: o.prev.sessions, contacts: o.prev.contacts },
      days: o.days.map(function (d) { return { day: d.day, real: d.sessions, suspicious: 0, blocked: 0, contacts: d.contacts }; }),
      status: { protection: 'soon', delivery: o.status.delivery, ads: o.status.ads, tracking_template: null, paired: o.status.paired, scoring: false },
      actions: actions, suspicious: [], places: o.places, sources: o.sources, devices: o.devices,
    };
  }
  function mapVisit(s) {
    return { id: s.id, at: s.at, city: s.city || 'مكان مش معروف', district: s.region || '', src: s.source, kw: s.detail || '', campaign: '',
      device: s.device || '—', os: s.os || '', net: null, isp: s.isp || '', pages: s.pages, dur: s.seconds == null ? null : Math.round(s.seconds), scroll: s.scroll,
      contact: s.contact ? s.contact.split(',')[0] : '', code: s.code, score: null, status: 'none', reasons: [], visit_no: s.visit_no, landing: s.landing, automation: s.automation, journey: null };
  }

  window.LTData = {
    live: true,
    init: function () { return LT.me().then(function (m) { me = m; return m; }); },
    me: function () { return me; },
    agency: null,
    sites: function () { return get('/v1/sites').then(function (b) { return (b.sites || []).map(function (s) { return { id: s.id, name: s.name, domain: (s.domains || [])[0] || '', currency: 'ر.س' }; }); }); },
    overview: function (site, range) { return overviewRaw(site, range).then(mapOverview); },
    statement: function () { return Promise.resolve({ unavailable: 'ads' }); },
    visits: function (site, range) { return get('/v1/dash/visits' + q(site, range)).then(function (b) { return (b.sessions || []).map(mapVisit); }); },
    session: function (site, sid) {
      return get('/v1/dash/session' + q(site) + '&sid=' + encodeURIComponent(sid)).then(function (b) {
        return (b.events || []).map(function (e) {
          var kind = e.event === 'page_view' ? 'page' : e.event === 'click' ? (e.click_type === 'wa' || e.click_type === 'call' ? 'contact' : 'click') : e.event === 'exit' ? 'exit' : e.event.indexOf('scroll') === 0 ? 'scroll' : 'other';
          var text = e.event === 'page_view' ? 'فتح «' + (e.title || e.path || 'صفحة') + '»'
            : e.event === 'click' ? (e.click_type === 'wa' ? 'ضغط واتساب' : e.click_type === 'call' ? 'ضغط اتصال' : 'ضغط زرار') + (e.btn_text ? ' — «' + e.btn_text + '»' : '')
            : e.event === 'exit' ? 'خرج من الصفحة' + (e.seconds ? ' بعد ' + e.seconds + ' ثانية' : '')
            : e.event === 'scroll_50' ? 'نزل لنص الصفحة' : e.event === 'scroll_90' ? 'نزل لآخر الصفحة' : e.event === 'fp_update' ? 'اتعرف الجهاز' : e.event;
          return { at: e.at, kind: kind, text: text };
        }).filter(function (e) { return e.kind !== 'other' || e.text; });
      });
    },
    protection: function () { return Promise.resolve({ soon: true }); },
    leads: function (site, range) {
      return get('/v1/dash/leads' + q(site, range)).then(function (b) {
        return { currency: 'ر.س', cost: null, list: (b.leads || []).map(function (l) { return { id: l.code || l.at, at: l.at, type: l.type, code: l.code || '—', src: l.source, kw: l.detail || '', city: l.city || '—', district: l.region || '', outcome: l.outcome, session: l.session }; }) };
      });
    },
    setOutcome: function (site, code, value) { return LT.api('/v1/dash/outcome', { method: 'POST', body: { site: site, code: code, value: value } }).then(function (r) { if (!r.ok) throw new Error(r.body.error || 'http'); return r.body; }); },
    alerts: function () {
      var adm = me && me.user && me.user.platform_admin;
      return Promise.resolve({ live: true, rules: [
        { id: 'session', name: 'تنبيه لكل زيارة فيها تواصل (تليجرام)', desc: 'رسالة لكل جلسة بتتحدّث مع كل صفحة وضغطة، وعليها زراير النتيجة.', on: !!adm, soon: !adm, ch: ['tg'] },
        { id: 'delivery', name: 'تقرير التوصيل كل يوم الصبح', desc: 'هل كل الأحداث وصلت من موقعك امبارح (المعيار 99.5%).', on: !!adm, soon: !adm, ch: ['tg'] },
        { id: 'attack', name: 'هجوم ضغطات', desc: 'لو المشبوه زاد فجأة.', on: false, soon: true, ch: ['tg', 'push'] },
        { id: 'overspend', name: 'صرف زايد', desc: 'بعد ربط جوجل أدز.', on: false, soon: true, ch: ['tg', 'push'] },
        { id: 'disapproved', name: 'إعلان اترفض أو حملة وقفت', desc: 'بعد ربط جوجل أدز.', on: false, soon: true, ch: ['tg', 'push', 'email'] },
        { id: 'weekly', name: 'ملخص الأسبوع', desc: 'كل سبت الصبح بالإيميل.', on: false, soon: true, ch: ['email'] },
      ], log: [] });
    },
    setup: function () {
      return get('/v1/dash/setup').then(function (b) {
        return (b.sites || []).map(function (s) {
          return { id: s.id, name: s.name, domain: (s.domains || [])[0] || '', installed: s.installed, paired: s.paired, plugin: s.plugin || null,
            delivery: s.delivery.slice().reverse().map(function (d) { return d.pct; }), ads: s.ads, account: '', template: null, own: 0, last_event: s.last_event };
        });
      });
    },
    pairCode: function (site) { return LT.api('/v1/sites/' + encodeURIComponent(site) + '/pair-code', { method: 'POST' }).then(function (r) { if (r.status !== 201) throw new Error(r.status === 403 ? 'role' : 'http'); return r.body; }); },
    clients: function (range) {
      return window.LTData.sites().then(function (sites) {
        return Promise.all(sites.map(function (s) {
          return overviewRaw(s.id, range).then(function (o) {
            return { id: s.id, name: s.name, domain: s.domain, currency: 'ر.س', billed: null, cost: null, saved: null, bad: null, visits: o.kpi.sessions, bad_pct: null, bad_pct_prev: null,
              leads: o.kpi.leads, won: o.kpi.won, cpl: null, pending: 0, delivery: o.status.delivery, ads: o.status.ads, template: null, open: o.kpi.open };
          });
        }));
      });
    },
    summary: function (site, range) { return window.LTData.clients(range).then(function (l) { return l.filter(function (x) { return x.id === site; })[0] || l[0]; }); },
  };
})();
