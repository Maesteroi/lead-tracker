// البيانات الحقيقية للوحة العميل (من api.maestrolt.com/v1/dash/*). نفس شكل LTDemo، فالشاشات واحدة.
// درجة الخطر و«ليه» وطابور الموافقة شغالين (الحماية جزء 1، 12 نوفمبر). اللي لسه (الحظر جوه جوجل · كشف الحساب · تنبيهات العميل) بيرجع null أو soon، والشاشة بتعرضه «قريباً» بصراحة.
(function () {
  'use strict';
  var LT = window.LT, me = null;
  var get = function (path) { return LT.api(path).then(function (r) { if (r.status === 401) { location.replace('/login?next=' + encodeURIComponent(location.pathname)); throw new Error('auth'); } if (!r.ok) throw new Error('http ' + r.status); return r.body; }); };
  var q = function (site, range) { var cr = typeof range === 'string' && /^\d{4}-\d{2}-\d{2}~\d{4}-\d{2}-\d{2}$/.test(range) ? range.split('~') : null; return '?site=' + encodeURIComponent(site) + (cr ? '&from=' + cr[0] + '&to=' + cr[1] : range ? '&range=' + range : '') + (LT.lang && LT.lang !== 'ar' ? '&lang=' + LT.lang : ''); };   // لغة أسباب الحماية والفحوصات من السيرفر
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
      live: o.live, currency: o.ads && o.ads.currency && o.ads.currency !== 'SAR' ? o.ads.currency : LT.t('sar'), scoring: sc, ads: o.ads || null,
      kpi: { billed: o.ads && o.ads.totals ? o.ads.totals.clicks : null, sessions: k.sessions, real: sc ? k.real : k.sessions, suspicious: sc ? k.suspicious : null, high: sc ? k.high : null, blocked: null, saved: null, cost: o.ads && o.ads.totals ? o.ads.totals.cost : null,
        leads: k.leads, contacts: k.contacts, won: k.won, open: k.open, cpl: null, pageviews: k.pageviews, ad_sessions: k.ad_sessions, ad_bad: k.ad_bad, pending: k.pending || 0, outside: k.outside || 0, outside_leads: k.outside_leads || 0 },
      prev: { real: o.prev.sessions, contacts: o.prev.contacts },
      days: o.days.map(function (d) { return sc ? { day: d.day, sessions: d.sessions, real: d.real, suspicious: d.suspicious, high: d.high, contacts: d.contacts } : { day: d.day, sessions: d.sessions, real: d.sessions, suspicious: 0, high: 0, contacts: d.contacts }; }),
      status: { protection: sc ? 'monitor' : 'soon', delivery: o.status.delivery, ads: o.status.ads, tracking_template: null, paired: o.status.paired, scoring: sc },
      actions: actions, suspicious: (o.suspicious || []).map(mapVisit), places: o.places, sources: o.sources, source_tree: o.source_tree || null, devices: o.devices,
      period: o.period || null, countries: o.countries || [], cities: o.cities || [], sources_conv: o.sources_conv || [], targets: o.targets || [], reasons: o.reasons || [], hours: o.hours || null, landing: o.landing || [], recent: (o.recent || []).map(mapVisit),
    };
  }
  function mapVisit(s) {
    return { id: s.id, at: s.at, city: s.city || LT.t('place.unknown'), district: s.region || '', src: s.source, kw: s.detail || '', campaign: '',
      device: s.device || '—', os: s.os || '', net: null, isp: s.isp || '', pages: s.pages, dur: s.seconds == null ? null : Math.round(s.seconds), scroll: s.scroll,
      contact: s.contact ? s.contact.split(',')[0] : '', code: s.code, score: s.score == null ? null : s.score, status: s.status || 'none', reasons: s.reasons || [], verdict: s.verdict || null,
      ad: !!s.ad, outside: !!s.outside, country: s.country_ar || s.country || '', repeats: s.repeats || 0, replay: !!s.replay, checks: s.checks || [], visit_no: s.visit_no, landing: s.landing, automation: s.automation, journey: null, live: true };
  }

  window.LTData = {
    live: true,
    init: function () { return LT.me().then(function (m) { me = m; return m; }); },
    me: function () { return me; },
    agency: null,
    sites: function () { return get('/v1/sites').then(function (b) { return (b.sites || []).map(function (s) { return { id: s.id, name: s.name, domain: (s.domains || [])[0] || '', currency: LT.t('sar'), org: b.all ? (s.org_name || '') : '', org_id: s.org_id }; }); }); },
    overview: function (site, range) { return overviewRaw(site, range).then(mapOverview); },
    statement: function (site, range) { return get('/v1/dash/statement' + q(site, range)); },
    statementCsv: function (site, range) { return LT.download('/v1/dash/statement.csv' + q(site, range)); },
    visits: function (site, range) { return get('/v1/dash/visits' + q(site, range)).then(function (b) { return (b.sessions || []).map(mapVisit); }); },
    session: function (site, sid) {
      return get('/v1/dash/session' + q(site) + '&sid=' + encodeURIComponent(sid)).then(function (b) {
        return (b.events || []).map(function (e) {
          var kind = e.event === 'contact_return' ? 'contact' : e.event === 'page_view' ? 'page' : e.event === 'click' ? (e.click_type === 'wa' || e.click_type === 'call' ? 'contact' : 'click') : e.event === 'exit' ? 'exit' : e.event.indexOf('scroll') === 0 ? 'scroll' : 'other';
          var T = LT.t;
          var text = e.event === 'page_view' ? T('j.page', { t: e.title || e.path || T('j.page.none') })
            : e.event === 'click' ? T(e.click_type === 'wa' ? 'j.wa' : e.click_type === 'call' ? 'j.call' : 'j.click') + (e.btn_text ? ' — «' + e.btn_text + '»' : '')
            : e.event === 'exit' ? T('j.exit') + (e.seconds ? ' ' + T('j.after', { t: LT.n(e.seconds, 'second') }) : '')
            : e.event === 'contact_return' ? T('j.return') : e.event === 'scroll_50' ? T('j.s50') : e.event === 'scroll_90' ? T('j.s90') : e.event === 'fp_update' ? T('j.fp') : e.event;
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
        return { currency: LT.t('sar'), cost: null, list: (b.leads || []).map(function (l) { return { id: l.code || l.at, at: l.at, type: l.type, code: l.code || '—', src: l.source, kw: l.detail || '', city: l.city || '—', district: l.region || '', outcome: l.outcome, session: l.session, outside: !!l.outside, outside_note: l.outside_note || '', strength: l.strength || null }; }) };
      });
    },
    setOutcome: function (site, code, value) { return LT.api('/v1/dash/outcome', { method: 'POST', body: { site: site, code: code, value: value } }).then(function (r) { if (!r.ok) throw new Error(r.body.error || 'http'); return r.body; }); },
    alerts: function () {
      var adm = me && me.user && me.user.platform_admin;
      var T = LT.t;
      return Promise.resolve({ live: true, rules: [
        { id: 'session', name: T('alerts.r.session'), desc: T('alerts.r.session.d'), on: !!adm, soon: !adm, ch: ['tg'] },
        { id: 'delivery', name: T('alerts.r.delivery'), desc: T('alerts.r.delivery.d'), on: !!adm, soon: !adm, ch: ['tg'] },
        { id: 'attack', name: T('alerts.r.attack'), desc: T('alerts.r.attack.d'), on: false, soon: true, ch: ['tg', 'push'] },
        { id: 'overspend', name: T('alerts.r.overspend'), desc: T('alerts.r.after_ads'), on: false, soon: true, ch: ['tg', 'push'] },
        { id: 'disapproved', name: T('alerts.r.disapproved'), desc: T('alerts.r.after_ads'), on: false, soon: true, ch: ['tg', 'push', 'email'] },
        { id: 'weekly', name: T('alerts.r.weekly'), desc: T('alerts.r.weekly.d'), on: false, soon: true, ch: ['email'] },
      ], log: [] });
    },
    setup: function () {
      return get('/v1/dash/setup').then(function (b) {
        return (b.sites || []).map(function (s) {
          return { id: s.id, name: s.name, domain: (s.domains || [])[0] || '', installed: s.installed, paired: s.paired, plugin: s.plugin || null,
            delivery: s.delivery.slice().reverse().map(function (d) { return d.pct; }), ads: s.ads, ads_state: s.ads_state || null, role: s.role || null,
            account: s.ads_state && s.ads_state.account ? s.ads_state.account.replace(/^(\d{3})(\d{3})(\d+)$/, '$1-$2-$3') : '', template: null, own: s.own || 0, last_event: s.last_event };
        });
      });
    },
    // فريق الحساب (G-29): المالك والمدير بيدعوا ويعدّلوا
    team: function (org) { return LT.api('/v1/team?org=' + encodeURIComponent(org)).then(function (r) { if (r.status === 403) return { forbidden: true }; if (!r.ok) throw new Error('http'); return r.body; }); },
    teamPost: function (path, body) { return LT.api('/v1/team/' + path, { method: 'POST', body: body }).then(function (r) { return r; }); },
    // ربط جوجل أدز من اللوحة (adslink.js على السيرفر): لينك موقّع ← موافقة جوجل ← اختيار الحساب
    adsLink: function (site) { return LT.api('/v1/dash/ads/link', { method: 'POST', body: { site: site } }).then(function (r) { if (!r.ok) throw new Error(r.body && r.body.error || 'http'); return r.body.url; }); },
    adsAccounts: function (site, n) { return LT.api('/v1/dash/ads/accounts?site=' + encodeURIComponent(site) + '&n=' + encodeURIComponent(n)).then(function (r) { if (!r.ok) throw new Error(r.body && r.body.error || 'http'); return r.body.accounts || []; }); },
    adsChoose: function (site, n, cid) { return LT.api('/v1/dash/ads/choose', { method: 'POST', body: { site: site, n: n, customer_id: cid } }).then(function (r) { if (!r.ok) throw new Error(r.body && r.body.error || 'http'); return r.body; }); },
    adsUnlink: function (site) { return LT.api('/v1/dash/ads/unlink', { method: 'POST', body: { site: site } }).then(function (r) { if (!r.ok) throw new Error(r.body && r.body.error || 'http'); return r.body; }); },
    // تنبيهات تليجرام للموقع: رابط ربط لأكتر من شخص (tglinks.js على السيرفر)
    tg: function (site) { return LT.api('/v1/dash/tg?site=' + encodeURIComponent(site)).then(function (r) { if (!r.ok) throw new Error('http'); return r.body; }); },
    tgInvite: function (site, revoke, audience) { return LT.api('/v1/dash/tg/invite', { method: 'POST', body: { site: site, revoke: !!revoke, audience: audience || 'owner' } }).then(function (r) { if (!r.ok) throw new Error(r.body && r.body.error || 'http'); return r.body.invite; }); },
    tgRemove: function (site, chat) { return LT.api('/v1/dash/tg/remove', { method: 'POST', body: { site: site, chat: chat } }).then(function (r) { if (!r.ok) throw new Error('http'); return r.body; }); },
    // الكلمات السلبية (negatives.js على السيرفر)
    negatives: function (site) { return LT.api('/v1/dash/negatives?site=' + encodeURIComponent(site)).then(function (r) { if (!r.ok) throw new Error('http'); return r.body; }); },
    negExisting: function (site) { return LT.api('/v1/dash/negatives/existing?site=' + encodeURIComponent(site)).then(function (r) { if (!r.ok) throw new Error('http'); return r.body; }); },
    // الاشتراك والدفع بالإيصال (billing.js · payments.js)
    billing: function (org) { return LT.api('/v1/dash/billing?org=' + encodeURIComponent(org)).then(function (r) { if (!r.ok) throw new Error('http'); return r.body; }); },
    billingCoupon: function (body) { return LT.api('/v1/dash/billing/coupon', { method: 'POST', body: body }).then(function (r) { if (!r.ok) throw new Error(r.body && r.body.error || 'http'); return r.body; }); },
    billingPay: function (body) { return LT.api('/v1/dash/billing/pay', { method: 'POST', body: body }).then(function (r) { if (!r.ok) throw new Error(r.body && r.body.error || 'http'); return r.body; }); },
    // تحليل الحملة وإصلاحها (analysis.js)
    analysis: function (site) { return LT.api('/v1/dash/analysis?site=' + encodeURIComponent(site)).then(function (r) { if (!r.ok) throw new Error('http'); return r.body; }); },
    analysisDone: function (site, b) { return LT.api('/v1/dash/analysis/done', { method: 'POST', body: Object.assign({ site: site }, b) }).then(function (r) { if (!r.ok) throw new Error(r.body && r.body.error || 'http'); return r.body; }); },
    analysisFix: function (site, fix) { return LT.api('/v1/dash/analysis/fix', { method: 'POST', body: Object.assign({ site: site }, fix) }).then(function (r) { if (!r.ok) { var e = new Error(r.body && r.body.error || 'http'); e.detail = r.body && r.body.detail; throw e; } return r.body; }); },
    // «امنعه في جوجل» و«هذه زيارتي» (blocks.js)
    blockIp: function (site, sid, reason) { return LT.api('/v1/dash/block', { method: 'POST', body: { site: site, sid: sid, reason: reason } }).then(function (r) { if (!r.ok) { var e = new Error(r.body && r.body.error || 'http'); e.detail = r.body && r.body.detail; throw e; } return r.body; }); },
    unblockIp: function (site, id) { return LT.api('/v1/dash/unblock', { method: 'POST', body: { site: site, id: id } }).then(function (r) { if (!r.ok) throw new Error('http'); return r.body; }); },
    blocks: function (site) { return LT.api('/v1/dash/blocks?site=' + encodeURIComponent(site)).then(function (r) { if (!r.ok) throw new Error('http'); return r.body; }); },
    ownDevice: function (site, sid, remove) { return LT.api('/v1/dash/own', { method: 'POST', body: remove ? { site: site, remove: remove } : { site: site, sid: sid } }).then(function (r) { if (!r.ok) throw new Error(r.body && r.body.error || 'http'); return r.body; }); },
    // فهم النشاط (brief.js)
    brief: function (site) { return LT.api('/v1/dash/brief?site=' + encodeURIComponent(site)).then(function (r) { if (!r.ok) throw new Error('http'); return r.body; }); },
    briefSave: function (site, b) { return LT.api('/v1/dash/brief', { method: 'POST', body: { site: site, offer: b.offer, exclude: b.exclude, about: b.about || '', fears: b.fears || [] } }).then(function (r) { if (!r.ok) { var e = new Error(r.body && r.body.error || 'http'); e.label = r.body && r.body.label; throw e; } return r.body; }); },
    // الكلمات الإيجابية (keywords.js) ولاحقة الرابط (suffix.js)
    keywords: function (site) { return LT.api('/v1/dash/keywords?site=' + encodeURIComponent(site)).then(function (r) { if (!r.ok) throw new Error('http'); return r.body; }); },
    kwDecide: function (site, id, decision) { return LT.api('/v1/dash/keywords/decide', { method: 'POST', body: { site: site, id: id, decision: decision } }).then(function (r) { if (!r.ok) { var e = new Error(r.body && r.body.error || 'http'); e.detail = r.body && r.body.detail; throw e; } return r.body; }); },
    suffixSet: function (site) { return LT.api('/v1/dash/suffix', { method: 'POST', body: { site: site } }).then(function (r) { if (!r.ok) { var e = new Error(r.body && r.body.error || 'http'); e.detail = r.body && r.body.detail; throw e; } return r.body; }); },
    negDecide: function (site, id, decision) { return LT.api('/v1/dash/negatives/decide', { method: 'POST', body: { site: site, id: id, decision: decision } }).then(function (r) { if (!r.ok) { var e = new Error(r.body && r.body.error || 'http'); e.detail = r.body && r.body.detail; throw e; } return r.body; }); },
    // رفع العملاء المؤكدين لجوجل أدز بموافقة العميل (convupload.js على السيرفر)
    conv: function (site) { return LT.api('/v1/dash/conv?site=' + encodeURIComponent(site)).then(function (r) { if (!r.ok) throw new Error('http'); return r.body; }); },
    convActions: function (site) { return LT.api('/v1/dash/conv/actions?site=' + encodeURIComponent(site)).then(function (r) { if (!r.ok) throw new Error(r.body && r.body.error || 'http'); return r.body.actions || []; }); },
    convAction: function (site, body) { return LT.api('/v1/dash/conv/action', { method: 'POST', body: Object.assign({ site: site }, body) }).then(function (r) { if (!r.ok) throw new Error(r.body && r.body.error || 'http'); return r.body.action; }); },
    convSendReal: function (site) { return LT.api('/v1/dash/conv/send', { method: 'POST', body: { site: site, kind: 'real' } }).then(function (r) { if (!r.ok) throw new Error(r.body && r.body.error || 'http'); return r.body; }); },
    convSend: function (site, codes) { return LT.api('/v1/dash/conv/send', { method: 'POST', body: { site: site, codes: codes } }).then(function (r) { if (!r.ok) throw new Error(r.body && r.body.error || 'http'); return r.body; }); },
    pairCode: function (site) { return LT.api('/v1/sites/' + encodeURIComponent(site) + '/pair-code', { method: 'POST' }).then(function (r) { if (r.status !== 201) throw new Error(r.status === 403 ? 'role' : 'http'); return r.body; }); },
    clients: function (range) {
      return window.LTData.sites().then(function (sites) {
        return Promise.all(sites.map(function (s) {
          return overviewRaw(s.id, range).then(function (o) {
            var bad = o.status.scoring ? (o.kpi.suspicious || 0) + (o.kpi.high || 0) : null;
            return { id: s.id, name: s.name, domain: s.domain, currency: LT.t('sar'), billed: null, cost: null, saved: null, bad: bad, visits: o.kpi.sessions, bad_pct: bad == null || !o.kpi.sessions ? null : Math.round((bad / o.kpi.sessions) * 1000) / 10, bad_pct_prev: null,
              leads: o.kpi.leads, won: o.kpi.won, cpl: null, pending: o.kpi.pending || 0, delivery: o.status.delivery, ads: o.status.ads, template: null, open: o.kpi.open };
          });
        }));
      });
    },
    summary: function (site, range) { return window.LTData.clients(range).then(function (l) { return l.filter(function (x) { return x.id === site; })[0] || l[0]; }); },
  };
})();
