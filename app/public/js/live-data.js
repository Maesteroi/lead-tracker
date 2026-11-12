// البيانات الحقيقية للوحة العميل (من api.maestrolt.com/v1/dash/*). نفس شكل LTDemo، فالشاشات واحدة.
// درجة الخطر و«ليه» وطابور الموافقة شغالين (الحماية جزء 1، 12 نوفمبر). اللي لسه (الحظر جوه جوجل · كشف الحساب · تنبيهات العميل) بيرجع null أو soon، والشاشة بتعرضه «قريباً» بصراحة.
(function () {
  'use strict';
  var LT = window.LT, me = null;
  var get = function (path) { return LT.api(path).then(function (r) { if (r.status === 401) { location.replace('/login?next=' + encodeURIComponent(location.pathname)); throw new Error('auth'); } if (!r.ok) throw new Error('http ' + r.status); return r.body; }); };
  var q = function (site, range) { return '?site=' + encodeURIComponent(site) + (range ? '&range=' + range : ''); };
  var cache = {};
  function overviewRaw(site, range) { var k = site + '|' + range; return cache[k] || (cache[k] = get('/v1/dash/overview' + q(site, range)).finally(function () { setTimeout(function () { delete cache[k]; }, 30000); })); }

  function mapOverview(o) {
    var k = o.kpi, sc = !!o.status.scoring;
    var actions = [];
    if (k.pending) actions.push({ kind: 'pending', n: k.pending });
    if (k.open) actions.push({ kind: 'outcome', n: k.open });
    if (!o.status.ads) actions.push({ kind: 'ads' });
    if (o.status.delivery != null && o.status.delivery < 99.5) actions.push({ kind: 'delivery', pct: o.status.delivery });
    return {
      live: o.live, currency: 'ر.س', scoring: sc,
      kpi: { billed: null, sessions: k.sessions, real: sc ? k.real : k.sessions, suspicious: sc ? k.suspicious : null, high: sc ? k.high : null, blocked: null, saved: null, cost: null,
        leads: k.leads, contacts: k.contacts, won: k.won, open: k.open, cpl: null, pageviews: k.pageviews, ad_sessions: k.ad_sessions, ad_bad: k.ad_bad, pending: k.pending || 0, outside: k.outside || 0, outside_leads: k.outside_leads || 0 },
      prev: { real: o.prev.sessions, contacts: o.prev.contacts },
      days: o.days.map(function (d) { return sc ? { day: d.day, real: d.real, suspicious: d.suspicious, high: d.high, contacts: d.contacts } : { day: d.day, real: d.sessions, suspicious: 0, high: 0, contacts: d.contacts }; }),
      status: { protection: sc ? 'monitor' : 'soon', delivery: o.status.delivery, ads: o.status.ads, tracking_template: null, paired: o.status.paired, scoring: sc },
      actions: actions, suspicious: (o.suspicious || []).map(mapVisit), places: o.places, sources: o.sources, devices: o.devices,
    };
  }
  function mapVisit(s) {
    return { id: s.id, at: s.at, city: s.city || 'مكان مش معروف', district: s.region || '', src: s.source, kw: s.detail || '', campaign: '',
      device: s.device || '—', os: s.os || '', net: null, isp: s.isp || '', pages: s.pages, dur: s.seconds == null ? null : Math.round(s.seconds), scroll: s.scroll,
      contact: s.contact ? s.contact.split(',')[0] : '', code: s.code, score: s.score == null ? null : s.score, status: s.status || 'none', reasons: s.reasons || [], verdict: s.verdict || null,
      ad: !!s.ad, outside: !!s.outside, country: s.country_ar || s.country || '', repeats: s.repeats || 0, replay: !!s.replay, checks: s.checks || [], visit_no: s.visit_no, landing: s.landing, automation: s.automation, journey: null, live: true };
  }

  window.LTData = {
    live: true,
    init: function () { return LT.me().then(function (m) { me = m; return m; }); },
    me: function () { return me; },
    agency: null,
    sites: function () { return get('/v1/sites').then(function (b) { return (b.sites || []).map(function (s) { return { id: s.id, name: s.name, domain: (s.domains || [])[0] || '', currency: 'ر.س', org: b.all ? (s.org_name || '') : '', org_id: s.org_id }; }); }); },
    overview: function (site, range) { return overviewRaw(site, range).then(mapOverview); },
    statement: function () { return Promise.resolve({ unavailable: 'ads' }); },
    visits: function (site, range) { return get('/v1/dash/visits' + q(site, range)).then(function (b) { return (b.sessions || []).map(mapVisit); }); },
    session: function (site, sid) {
      return get('/v1/dash/session' + q(site) + '&sid=' + encodeURIComponent(sid)).then(function (b) {
        return (b.events || []).map(function (e) {
          var kind = e.event === 'contact_return' ? 'contact' : e.event === 'page_view' ? 'page' : e.event === 'click' ? (e.click_type === 'wa' || e.click_type === 'call' ? 'contact' : 'click') : e.event === 'exit' ? 'exit' : e.event.indexOf('scroll') === 0 ? 'scroll' : 'other';
          var text = e.event === 'page_view' ? 'فتح «' + (e.title || e.path || 'صفحة') + '»'
            : e.event === 'click' ? (e.click_type === 'wa' ? 'ضغط واتساب' : e.click_type === 'call' ? 'ضغط اتصال' : 'ضغط زرار') + (e.btn_text ? ' — «' + e.btn_text + '»' : '')
            : e.event === 'exit' ? 'خرج من الصفحة' + (e.seconds ? ' بعد ' + e.seconds + ' ثانية' : '')
            : e.event === 'contact_return' ? 'رجع للصفحة بعد التواصل' : e.event === 'scroll_50' ? 'نزل لنص الصفحة' : e.event === 'scroll_90' ? 'نزل لآخر الصفحة' : e.event === 'fp_update' ? 'اتعرف الجهاز' : e.event;
          return { at: e.at, kind: kind, text: text };
        }).filter(function (e) { return e.kind !== 'other' || e.text; });
      });
    },
    protection: function (site, range) {
      return get('/v1/dash/protection' + q(site, range || 7)).then(function (b) {
        return { live: true, mode: b.mode, ads: b.ads, stats: b.stats, pending: (b.pending || []).map(mapVisit), decided: (b.decided || []).map(mapVisit), reasons: b.top_reasons || [] };
      }, function (e) { if (String(e && e.message) === 'auth') throw e; return { soon: true }; });
    },
    verdict: function (site, sid, v) { return LT.api('/v1/dash/verdict', { method: 'POST', body: { site: site, sid: sid, verdict: v } }).then(function (r) { if (!r.ok) throw new Error(r.status === 403 ? 'role' : 'http'); return r.body; }); },
    leads: function (site, range) {
      return get('/v1/dash/leads' + q(site, range)).then(function (b) {
        return { currency: 'ر.س', cost: null, list: (b.leads || []).map(function (l) { return { id: l.code || l.at, at: l.at, type: l.type, code: l.code || '—', src: l.source, kw: l.detail || '', city: l.city || '—', district: l.region || '', outcome: l.outcome, session: l.session, outside: !!l.outside, outside_note: l.outside_note || '', strength: l.strength || null }; }) };
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
    // فريق الحساب (G-29): المالك والمدير بيدعوا ويعدّلوا
    team: function (org) { return LT.api('/v1/team?org=' + encodeURIComponent(org)).then(function (r) { if (r.status === 403) return { forbidden: true }; if (!r.ok) throw new Error('http'); return r.body; }); },
    teamPost: function (path, body) { return LT.api('/v1/team/' + path, { method: 'POST', body: body }).then(function (r) { return r; }); },
    pairCode: function (site) { return LT.api('/v1/sites/' + encodeURIComponent(site) + '/pair-code', { method: 'POST' }).then(function (r) { if (r.status !== 201) throw new Error(r.status === 403 ? 'role' : 'http'); return r.body; }); },
    clients: function (range) {
      return window.LTData.sites().then(function (sites) {
        return Promise.all(sites.map(function (s) {
          return overviewRaw(s.id, range).then(function (o) {
            var bad = o.status.scoring ? (o.kpi.suspicious || 0) + (o.kpi.high || 0) : null;
            return { id: s.id, name: s.name, domain: s.domain, currency: 'ر.س', billed: null, cost: null, saved: null, bad: bad, visits: o.kpi.sessions, bad_pct: bad == null || !o.kpi.sessions ? null : Math.round((bad / o.kpi.sessions) * 1000) / 10, bad_pct_prev: null,
              leads: o.kpi.leads, won: o.kpi.won, cpl: null, pending: o.kpi.pending || 0, delivery: o.status.delivery, ads: o.status.ads, template: null, open: o.kpi.open };
          });
        }));
      });
    },
    summary: function (site, range) { return window.LTData.clients(range).then(function (l) { return l.filter(function (x) { return x.id === site; })[0] || l[0]; }); },
  };
})();
