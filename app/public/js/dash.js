// لوحة العميل: الشاشات السبعة (موافقة محمود 11 نوفمبر). نفس الكود للوحة التجريبية (بيانات LTDemo) والحقيقية (LTData لما تجهز).
// المرجع: claude/briefs/2026-11-11-app-screens-vs-competitors.md · claude/design-system.md
(function () {
  'use strict';
  var LT = window.LT, el = LT.el, clear = LT.clear, C = window.LTCharts, fmt = C.fmt;
  var DATA = window.LTData || window.LTDemo;
  var $ = function (id) { return document.getElementById(id); };
  var state = { site: null, range: 7, sites: [], filter: 'all', q: '', tab: 'campaign', level: 'simple' };
  // مستوى العرض (قرار 11 نوفمبر): بسيط لصاحب البزنس · تفصيلي للوكالات. بيتحفظ في الجلسة بس (sessionStorage، مش تخزين دايم). في اللوحة الحقيقية الافتراضي من نوع الحساب.
  try { var lv = sessionStorage.getItem('lt_level'); if (lv === 'simple' || lv === 'detailed') state.level = lv; } catch (e) { /* مفيش تخزين: الافتراضي */ }
  function setLevel(v) { state.level = v; try { sessionStorage.setItem('lt_level', v); } catch (e) { /* عادي */ } buildNav(); buildTop(); render(); }
  var NS = 'http://www.w3.org/2000/svg';

  // ── أيقونات (خطوط بسيطة) ──
  var ICONS = {
    overview: 'M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10',
    statement: 'M6 3h12v18l-3-2-3 2-3-2-3 2V3zM9 8h6M9 12h6',
    visits: 'M12 5c-6 0-9 7-9 7s3 7 9 7 9-7 9-7-3-7-9-7zM12 15a3 3 0 100-6 3 3 0 000 6z',
    protection: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3zM9 12l2 2 4-4',
    negatives: 'M11 4a7 7 0 100 14 7 7 0 000-14zM21 21l-5-5M8 11h6',
    leads: 'M16 19v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1M9.5 10a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM17 11l2 2 4-4',
    alerts: 'M18 16V11a6 6 0 10-12 0v5l-2 2h16l-2-2zM10 20a2 2 0 004 0',
    sites: 'M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
    more: 'M5 12h.01M12 12h.01M19 12h.01',
    clients: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
    reports: 'M7 3h7l5 5v13H7zM14 3v5h5M10 17v-3M13 17v-6M16 17v-2',
    team: 'M9 11a4 4 0 100-8 4 4 0 000 8zM2 21v-1a6 6 0 0112 0v1M16 3.5a4 4 0 010 7.5M22 21v-1a6 6 0 00-4-5.6',
    billing: 'M3 6h18v12H3zM3 10h18M7 15h4',
    install: 'M12 3v12M7 10l5 5 5-5M5 21h14',
    analysis: 'M3 3v18h18M7 15l4-4 3 3 6-7M17 7h3v3',
    admin: 'M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4',
  };
  function icon(name) {
    var svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('class', 'ic'); svg.setAttribute('aria-hidden', 'true');
    var p = document.createElementNS(NS, 'path'); p.setAttribute('d', ICONS[name]); svg.appendChild(p); return svg;
  }

  var T = LT.t;   // النصوص من ملف اللغة (js/lang/*.js)
  var ROUTES = ['overview', 'analysis', 'clients', 'statement', 'visits', 'protection', 'negatives', 'leads', 'alerts', 'reports', 'sites', 'team', 'billing'].map(function (k) { return [k, T('nav.' + k)]; });
  var NAV = { simple: ['overview', 'analysis', 'leads', 'protection', 'negatives', 'alerts', 'sites', 'team', 'billing'], detailed: ROUTES.map(function (r) { return r[0]; }) };
  var BOTTOMS = { simple: ['overview', 'leads', 'protection', 'alerts'], detailed: ['overview', 'statement', 'visits', 'protection'] };
  var BOTTOM = BOTTOMS.detailed;
  var STATUS = { real: [T('status.real'), 'ok'], suspicious: [T('status.suspicious'), 'warn'], high: [T('status.high'), 'bad'], blocked: [T('status.blocked'), 'bad'] };
  var NET = { mobile: T('net.mobile'), home: T('net.home'), vpn: 'VPN', dc: T('net.dc') };
  var OUT = { 'تم': 'ok', 'بيفكر': 'info', 'لغى': 'bad', 'مش جاد': 'warn', 'ماوصلش رسالة': '' };   // ألوان النتيجة (القيم المتخزنة)

  // ── أدوات ──
  function money(n, cur) { return n == null || isNaN(n) ? '—' : fmt(Math.round(n)) + ' ' + (cur || ''); }
  function nf(n) { return n == null || isNaN(n) ? '—' : fmt(n); }
  function srcName(k) { var x = T('src.' + k); return x === 'src.' + k ? (k || T('src.direct')) : x; }
  function pct(a, b) { return b ? Math.round((a / b) * 1000) / 10 : 0; }
  function delta(cur, prev, goodUp) {
    if (!prev) return null;
    var d = Math.round(((cur - prev) / prev) * 100);
    if (!d) return el('span', { class: 'dl', text: T('delta.same') });
    var good = goodUp === null ? null : goodUp ? d > 0 : d < 0;
    var full = T(d > 0 ? 'delta.up' : 'delta.down', { p: Math.abs(d) });
    return el('span', { class: 'dl ' + (good === null ? '' : good ? 'up' : 'down'), title: full, 'aria-label': full }, [document.createTextNode((d > 0 ? '▲ ' : '▼ ') + Math.abs(d) + '%'), el('small', { text: ' ' + T('delta.short') })]);
  }
  function timeAr(iso) { try { return new Date(iso).toLocaleString(LT.locale, { weekday: 'short', hour: 'numeric', minute: '2-digit' }); } catch (e) { return iso; } }
  function clock(iso) { try { return new Date(iso).toLocaleTimeString(LT.locale, { hour: 'numeric', minute: '2-digit', second: '2-digit' }); } catch (e) { return iso; } }
  function dateAr(iso) { try { return new Date(iso).toLocaleDateString(LT.locale, { day: 'numeric', month: 'long' }); } catch (e) { return iso; } }
  function pill(t, c) { return el('span', { class: 'pill ' + (c || ''), text: t }); }
  function card(title, children, extra) { return el('section', { class: 'panel-card' + (extra ? ' ' + extra : '') }, [title ? el('div', { class: 'sec-head' }, [el('h2', { text: title })]) : null].concat(children)); }
  function kpi(label, value, sub, cls, d) { return el('div', { class: 'kpi ' + (cls || 'info') }, [el('div', { class: 'k-label', text: label }), el('div', { class: 'k-val', text: value }), sub ? el('div', { class: 'k-sub', text: sub }) : null, d || null]); }
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(function () { t.hidden = true; }, 3000); }
  function demoAct(msg) { toast(DATA.demo ? msg + ' ' + T('demo.not_real') : msg); }
  function scoreBadge(v) { return el('span', { class: 'score s-' + v.status, title: T('score.title') }, [el('b', { text: String(v.score) })]); }

  // ── الإطار ──
  function buildNav() {
    var side = clear($('side-nav')), bottom = clear($('bottom-nav'));
    BOTTOM = BOTTOMS[state.level];
    ROUTES.filter(function (r) { return NAV[state.level].indexOf(r[0]) >= 0; }).forEach(function (r) {
      side.appendChild(el('a', { href: '#/' + r[0], 'data-r': r[0] }, [icon(r[0]), el('span', { text: r[1] })]));
    });
    BOTTOM.forEach(function (k) { var r = ROUTES.filter(function (x) { return x[0] === k; })[0]; bottom.appendChild(el('a', { href: '#/' + k, 'data-r': k }, [icon(k), el('span', { text: k === 'statement' ? T('nav.statement.short') : k === 'leads' ? T('nav.leads.short') : r[1] })])); });
    var more = el('button', { type: 'button', class: 'more', 'aria-haspopup': 'true' }, [icon('more'), el('span', { text: T('frame.more') })]);
    more.addEventListener('click', openMore);
    bottom.appendChild(more);
    drawInstall();
  }
  // «ثبّت التطبيق» في القائمة الجانبية و«المزيد» (15 نوفمبر): زرار التثبيت الرسمي لو المتصفح بيدعمه، وإلا خطوات الآيفون والأندرويد
  var installEvt = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); installEvt = e; drawInstall(); });
  window.addEventListener('appinstalled', function () { installEvt = null; drawInstall(); toast(T('inst.done')); });
  function doInstall() {
    if (!installEvt) { openInstall(); return; }
    installEvt.prompt();
    (installEvt.userChoice || Promise.resolve({})).then(function (c) { if (c && c.outcome === 'accepted') { installEvt = null; drawInstall(); } });
  }
  function installBtn(cls) { var b = el('button', { class: cls, type: 'button' }, [icon('install'), el('span', { text: T('inst.btn') })]); b.addEventListener('click', function () { closeDrawer(); doInstall(); }); return b; }
  function drawInstall() { var box = $('side-install'); if (!box) return; clear(box); if (!installed()) box.appendChild(installBtn('side-install-btn')); }
  // شاشة البداية (اللوجو المتحرك) لحد أول رسم للصفحة
  function hideBoot() { var b = $('boot'); if (!b || b.classList.contains('out')) return; b.classList.add('out'); setTimeout(function () { if (b.parentNode) b.parentNode.removeChild(b); }, 400); }
  function openMore() {
    var body = clear($('d-body'));
    $('d-title').textContent = T('frame.more'); $('d-sub').textContent = '';
    ROUTES.filter(function (r) { return BOTTOM.indexOf(r[0]) < 0 && NAV[state.level].indexOf(r[0]) >= 0; }).forEach(function (r) {
      var a = el('a', { class: 'more-link', href: '#/' + r[0] }, [icon(r[0]), el('span', { text: r[1] })]);
      a.addEventListener('click', closeDrawer);
      body.appendChild(a);
    });
    var sw = el('button', { class: 'more-link', type: 'button' }, [icon('more'), el('span', { text: T(state.level === 'simple' ? 'level.to_detailed' : 'level.to_simple') })]);
    sw.addEventListener('click', function () { closeDrawer(); setLevel(state.level === 'simple' ? 'detailed' : 'simple'); });
    body.appendChild(sw);
    if (!installed()) body.appendChild(installBtn('more-link'));
    // إدارة المنصة (للمدير بس) في نسخة الموبايل والتطبيق: مكانها في القائمة الجانبية مش ظاهر هنا
    if (state.admin) body.appendChild(el('a', { class: 'more-link more-admin', href: '/admin' }, [icon('admin'), el('span', { text: T('frame.admin.short') })]));
    var ls = LT.i18n.switcher();
    if (ls) { ls.className = 'more-link'; body.appendChild(ls); }
    if (DATA.live) { var lo = el('button', { class: 'more-link', type: 'button' }, [el('span', { text: T('frame.logout') })]); lo.addEventListener('click', function () { LT.logout().then(function () { location.replace('/login'); }); }); body.appendChild(lo); }
    openDrawer();
  }
  function buildTop() {
    var sel = clear($('site'));
    // مدير المنصة بيشوف مواقع كل الحسابات: متقسمة حسب الحساب
    var orgs = []; state.sites.forEach(function (s) { if (s.org && orgs.indexOf(s.org) < 0) orgs.push(s.org); });
    if (orgs.length) orgs.forEach(function (o) { sel.appendChild(el('optgroup', { label: o }, state.sites.filter(function (s) { return s.org === o; }).map(function (s) { return el('option', { value: s.id, text: s.name }); }))); });
    else state.sites.forEach(function (s) { sel.appendChild(el('option', { value: s.id, text: s.name })); });
    sel.value = state.site;
    sel.onchange = function () { state.site = sel.value; render(); };
    var lvl = clear($('level'));
    ['simple', 'detailed'].forEach(function (k) {
      var x = [k, T('level.' + k)];
      var b = el('button', { type: 'button', 'aria-pressed': String(state.level === x[0]), text: x[1], title: T('level.' + k + '.tip') });
      b.addEventListener('click', function () { if (state.level !== x[0]) setLevel(x[0]); });
      lvl.appendChild(b);
    });
    rangePicker(clear($('range')));
  }
  // ── اختيار الفترة: جاهزة (النهارده · امبارح · 7 · 14 · 30 · الشهر ده · الشهر اللي فات · 90) أو من–إلى ──
  // state.range: رقم = آخر N يوم، أو «YYYY-MM-DD~YYYY-MM-DD» لفترة محددة
  function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function presets() {
    var t = new Date(), y = new Date(t.getFullYear(), t.getMonth(), t.getDate() - 1);
    var m0 = new Date(t.getFullYear(), t.getMonth(), 1), lm0 = new Date(t.getFullYear(), t.getMonth() - 1, 1), lm1 = new Date(t.getFullYear(), t.getMonth(), 0);
    return [['today', 1], ['yesterday', ymd(y) + '~' + ymd(y)], ['7', 7], ['14', 14], ['30', 30], ['month', ymd(m0) + '~' + ymd(t)], ['lastmonth', ymd(lm0) + '~' + ymd(lm1)], ['90', 90]];
  }
  function rangeLabel() {
    var hit = presets().filter(function (p) { return p[1] === state.range; })[0];
    if (hit) return T('rg.' + hit[0]);
    var p = String(state.range).split('~'); if (p.length !== 2) return T('rg.7');
    var f = function (x) { return new Date(x + 'T12:00:00').toLocaleDateString(LT.locale, { day: 'numeric', month: 'short' }); };
    return p[0] === p[1] ? f(p[0]) : f(p[0]) + ' – ' + f(p[1]);
  }
  function rangePicker(box) {
    box.className = 'range-pick';
    var btn = el('button', { class: 'range-btn', type: 'button', 'aria-haspopup': 'true', 'aria-expanded': 'false', text: rangeLabel() });
    var pop = el('div', { class: 'range-pop', role: 'menu', hidden: '' });
    var close = function () { pop.hidden = true; btn.setAttribute('aria-expanded', 'false'); document.removeEventListener('click', outside, true); };
    var outside = function (e) { if (!box.contains(e.target)) close(); };
    var pick = function (v) { state.range = v; close(); buildTop(); render(); };
    presets().forEach(function (p) {
      var b = el('button', { class: 'opt-r', type: 'button', role: 'menuitemradio', 'aria-checked': String(state.range === p[1]), text: T('rg.' + p[0]) });
      b.addEventListener('click', function () { pick(p[1]); });
      pop.appendChild(b);
    });
    var today = ymd(new Date()), cur = String(state.range).split('~');
    var from = el('input', { type: 'date', max: today, 'aria-label': T('rg.from') }), to = el('input', { type: 'date', max: today, 'aria-label': T('rg.to') });
    from.value = cur.length === 2 ? cur[0] : ymd(new Date(Date.now() - 6 * 864e5)); to.value = cur.length === 2 ? cur[1] : today;
    var apply = el('button', { class: 'btn sm', type: 'button', text: T('rg.apply') });
    apply.addEventListener('click', function () {
      var a = from.value, z = to.value;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(z) || a > z || z > today) { toast(T('rg.bad')); return; }
      if ((Date.parse(z) - Date.parse(a)) / 864e5 > 91) { toast(T('rg.max')); return; }
      pick(a + '~' + z);
    });
    pop.appendChild(el('div', { class: 'custom' }, [el('b', { text: T('rg.custom') }), el('label', {}, [el('span', { text: T('rg.from') }), from]), el('label', {}, [el('span', { text: T('rg.to') }), to]), apply]));
    btn.addEventListener('click', function () { if (pop.hidden) { pop.hidden = false; btn.setAttribute('aria-expanded', 'true'); document.addEventListener('click', outside, true); } else close(); });
    pop.addEventListener('keydown', function (e) { if (e.key === 'Escape') { close(); btn.focus(); } });
    box.appendChild(btn); box.appendChild(pop);
  }
  function route() { var h = (location.hash || '').replace(/^#\//, ''); return ROUTES.some(function (r) { return r[0] === h; }) ? h : 'overview'; }
  function render() {
    var r = route(), view = clear($('view'));
    document.body.classList.toggle('level-simple', state.level === 'simple');
    document.body.classList.toggle('level-detailed', state.level !== 'simple');
    Array.prototype.forEach.call(document.querySelectorAll('[data-r]'), function (a) { if (a.getAttribute('data-r') === r) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    var title = ROUTES.filter(function (x) { return x[0] === r; })[0][1];
    $('page-title').textContent = title;
    document.title = title + ' · ' + T('app.name') + (DATA.demo ? T('frame.demo_suffix') : '');
    $('range').hidden = r === 'protection' || r === 'negatives' || r === 'alerts' || r === 'sites' || r === 'reports' || r === 'team' || r === 'billing' || r === 'analysis' || (r === 'overview' && state.level === 'simple');
    $('site').parentNode.hidden = r === 'clients';
    if (r === 'overview' && state.level === 'simple') $('page-title').textContent = T('nav.overview.simple');
    if (state.level === 'simple' && NAV.simple.indexOf(r) < 0) { /* شاشة تفصيلية من رابط: بتتفتح عادي */ }
    trialBar(r);
    view.appendChild(el('div', { class: 'loading' }, [el('span', { class: 'spinner' }), document.createTextNode(T('frame.loading'))]));
    (r === 'overview' && state.level === 'simple' ? (DATA.live ? lSimple : vSimple) : (DATA.live && LIVE_VIEWS[r]) || VIEWS[r])(view).then(function () { var l = view.querySelector('.loading'); if (l) l.remove(); window.scrollTo(0, 0); });
  }

  // شريط الاشتراك فوق كل الصفحات (15 نوفمبر): قبل نهاية التجربة بـ3 أيام · بعد نهايتها (الحماية متوقفة) · قبل نهاية الاشتراك بـ5 أيام
  function trialBar(r) {
    var old = $('trial-bar'); if (old) old.remove();
    if (!DATA.live || !DATA.me || r === 'billing') return;
    var me = DATA.me() || {}, site = (state.sites || []).filter(function (x) { return x.id === state.site; })[0];
    var org = site && (me.orgs || []).filter(function (o) { return o.id === site.org_id; })[0];
    if (!org) return;
    var now = Date.now(), kind = null, n = 0;
    if (org.status === 'trial' && org.trial_ends_at) { n = Math.ceil((Date.parse(org.trial_ends_at) - now) / 864e5); kind = n <= 0 ? 'over' : n <= 3 ? 'soon' : null; }
    else if (org.status === 'off' || org.status === 'past_due') kind = 'over';
    else if (org.status === 'active' && org.plan_period_end) { n = Math.ceil((Date.parse(org.plan_period_end) - now) / 864e5); kind = n <= 0 ? 'over' : n <= 5 ? 'renew' : null; }
    if (!kind) return;
    var bar = el('div', { id: 'trial-bar', class: 'trial-bar ' + (kind === 'over' ? 'bad' : 'warn'), role: 'status' }, [
      el('span', { text: kind === 'over' ? T('tb.over') : kind === 'soon' ? T('tb.soon', { n: LT.n(n, 'day') }) : T('tb.renew', { n: LT.n(n, 'day') }) }),
      el('a', { class: 'btn sm', href: '#/billing', text: T(kind === 'renew' ? 'tb.renew.go' : 'tb.go') }),
    ]);
    var v = $('view'); v.parentNode.insertBefore(bar, v);
  }

  // ════════ 1) الرئيسية ════════

  // ════════ الخلاصة (المستوى البسيط لصاحب البزنس) ════════
  // 3 إجابات كبيرة · «تعمل إيه دلوقتي» (3 بالكتير) · «حمايتك كاملة؟» · ملخص الأسبوع بالكلام. من غير جداول.
  function installed() { try { return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; } catch (e) { return false; } }
  function vSimple(view) {
    return Promise.all([DATA.overview(state.site, 7), DATA.setup(), DATA.protection(state.site)]).then(function (res) {
      clear(view);
      var d = res[0], k = d.kpi, cur = d.currency, site = res[1].filter(function (x) { return x.id === state.site; })[0] || res[1][0], prot = res[2];
      var pend = prot.pending.length;
      var safe = !d.status.ads || !site.installed ? 'bad' : (pend || !d.status.tracking_template || d.status.delivery < 99.5) ? 'warn' : 'ok';
      var safeText = T('d.safe.' + safe);
      var safeSub = safe === 'ok' ? T('d.safe.ok.sub') : pend ? T('d.safe.pend', { n: LT.n(pend, 'svisit') }) : !d.status.tracking_template ? T('d.safe.suffix') : T('d.safe.setup');
      view.appendChild(el('div', { class: 'answers' }, [
        el('div', { class: 'ans ' + safe }, [el('span', { class: 'q', text: T('ans.protected.q') }), el('b', { class: 'a', text: safeText }), el('span', { class: 's', text: safeSub })]),
        el('div', { class: 'ans ok' }, [el('span', { class: 'q', text: T('d.ans.saved.q') }), el('b', { class: 'a', text: money(k.saved, cur) }), el('span', { class: 's', text: T('d.ans.saved.s', { n: LT.n(k.suspicious + k.blocked, 'sclick') }) })]),
        el('div', { class: 'ans info' }, [el('span', { class: 'q', text: T('ans.won.q') }), el('b', { class: 'a', text: LT.n(k.won, 'customer') }), el('span', { class: 's', text: k.cpl ? T('d.ans.cpl', { m: money(k.cpl, cur) }) : T('d.ans.leads_wait', { n: LT.n(k.leads, 'contact') }) })]),
      ]));
      // تعمل إيه دلوقتي (3 بالكتير)
      var acts = el('div', { class: 'actions' });
      d.actions.slice(0, 3).forEach(function (a) {
        var m = a.kind === 'approve' ? ['protection', 'warn', T('d.sact.approve', { n: LT.n(a.n, 'svisit') }), T('d.sact.approve.sub'), T('d.sact.approve.go')]
          : a.kind === 'outcome' ? ['leads', 'info', T('act.outcome.simple', { n: LT.n(a.n, 'contact') }), T('act.outcome.sub'), T('act.outcome.go')]
          : a.kind === 'refund' ? ['protection', 'ok', T('d.sact.refund', { m: money(a.amount, cur) }), T('d.sact.refund.sub'), T('d.sact.refund.go')]
          : ['sites', 'warn', T('d.sact.suffix'), T('d.act.suffix.sub'), T('steps.how')];
        acts.appendChild(el('a', { class: 'act ' + m[1], href: '#/' + m[0] }, [el('b', { text: m[2] }), el('span', { text: m[3] }), el('em', { text: m[4] + ' ' + T('arrow') })]));
      });
      if (d.actions.length) view.appendChild(card(T('act.title'), [acts]));
      // حمايتك كاملة؟
      var steps = [
        [T('steps.installed'), site.installed, 'sites'],
        [T('steps.ads'), site.ads, 'sites'],
        [T('d.steps.suffix'), site.template, 'sites'],
        [T('d.steps.own'), site.own > 0, 'protection'],
        [T('d.steps.tg'), true, 'alerts'],
        [T('steps.app'), installed(), 'app'],
      ];
      var done = steps.filter(function (x) { return x[1]; }).length;
      var bar = el('i'); bar.style.width = Math.round((done / steps.length) * 100) + '%';
      var list = el('ul', { class: 'steps-check' });
      steps.forEach(function (x) {
        var li = el('li', { class: x[1] ? 'ok' : 'todo' }, [el('i', { class: 'ck', text: x[1] ? '✓' : '' }), el('span', { text: x[0] })]);
        if (!x[1]) {
          var go = el(x[2] === 'app' ? 'button' : 'a', x[2] === 'app' ? { class: 'linkish', type: 'button', text: T('steps.how') } : { class: 'linkish', href: '#/' + x[2], text: T('steps.finish') });
          if (x[2] === 'app') go.addEventListener('click', openInstall);
          li.appendChild(go);
        }
        list.appendChild(li);
      });
      view.appendChild(card(T('steps.title'), [el('div', { class: 'progress' }, [el('div', { class: 'p-bar' }, [bar]), el('b', { text: T('steps.of', { a: done, b: steps.length }) })]), list]));
      // ملخص الأسبوع بالكلام
      var p = d.prev, better = k.suspicious + k.blocked <= (p.suspicious + p.blocked);
      view.appendChild(card(T('story.title'), [el('p', { class: 'story', text:
        T('d.story.1', { r: LT.n(k.real, 'rvisitor'), l: fmt(k.leads), w: fmt(k.won) }) + (k.cpl ? ' ' + T('d.story.cpl', { m: money(k.cpl, cur) }) : '') + '. ' +
        T(better ? 'd.story.less' : 'd.story.more', { n: LT.n(k.suspicious + k.blocked, 'sclick') }) + T('d.story.saved', { m: money(k.saved, cur) }) }),
        el('button', { class: 'btn ghost sm', type: 'button', text: T('story.more') }),
      ]));
      view.querySelector('.story + .btn').addEventListener('click', function () { setLevel('detailed'); });
    });
  }
  function openInstall() {
    var body = clear($('d-body'));
    $('d-title').textContent = T('inst.title'); $('d-sub').textContent = T('inst.sub');
    body.appendChild(el('section', { class: 'd-sec' }, [el('h3', { class: 'legend', text: T('inst.ios') }), el('ol', { class: 'how' }, [el('li', { text: T('inst.ios.1') }), el('li', { text: T('inst.ios.2') }), el('li', { text: T('inst.ios.3') })])]));
    body.appendChild(el('section', { class: 'd-sec' }, [el('h3', { class: 'legend', text: T('inst.android') }), el('ol', { class: 'how' }, [el('li', { text: T('inst.android.1') }), el('li', { text: T('inst.android.2') }), el('li', { text: T('inst.android.3') })])]));
    openDrawer();
  }

  // ════════ 2) كشف الحساب ════════
  function vStatement(view) {
    return DATA.statement(state.site, state.range).then(function (d) {
      clear(view); var t = d.total, cur = d.currency;
      view.appendChild(el('div', { class: 'callout' }, [el('b', { text: T('st.callout', { n: LT.n(t.billed, 'click'), m: money(t.cost, cur) }) }), el('span', { text: T('st.callout.sub') })]));
      var fun = el('div');
      C.hbars(fun, [
        { label: T('d.k.billed'), value: t.billed, cls: 'c-data' },
        { label: T('st.offsite'), sub: T('st.offsite.sub'), value: t.offsite, cls: 'c-data' },
        { label: T('st.reached'), value: t.reached, cls: 'c-real' },
        { label: T('st.bad'), value: t.bad, cls: 'c-sus' },
        { label: T('st.not_loaded'), value: t.not_loaded, cls: 'c-blk' },
        { label: T('st.refunded'), value: t.refunded, cls: 'c-ok' },
      ], { max: t.billed });
      view.appendChild(el('div', { class: 'grid-2' }, [
        card(T('st.where'), [fun]),
        card(T('st.money'), [el('div', { class: 'kpis two' }, [
          kpi(T('st.spend'), money(t.cost, cur), LT.n(t.billed, 'click'), 'info'),
          kpi(T('st.on_bad'), money(t.invalid_cost, cur), T('st.of_spend', { p: pct(t.invalid_cost, t.cost) }), 'warn'),
          kpi(T('st.google_back'), LT.n(t.refunded, 'click'), T('st.unasked'), 'ok'),
          kpi(T('st.claim'), money(t.invalid_cost * 0.6, cur), T('st.claim.sub'), 'ok'),
        ]), el('button', { class: 'btn sm', type: 'button', text: T('st.pdf') })]),
      ]));
      view.querySelector('.btn.sm').addEventListener('click', function () { window.print(); });
      // حسب
      var seg = el('div', { class: 'seg', role: 'tablist' });
      var body = el('div');
      var TABS = ['campaign', 'kw', 'city', 'district'].map(function (k) { return [k, T('st.by.' + k)]; });
      var draw = function () {
        clear(seg); clear(body);
        TABS.forEach(function (tb) { var b = el('button', { type: 'button', 'aria-pressed': String(state.tab === tb[0]), text: tb[1] }); b.addEventListener('click', function () { state.tab = tb[0]; draw(); }); seg.appendChild(b); });
        var rows = d.by[state.tab].slice(0, 10);
        var tbody = el('tbody');
        rows.forEach(function (r) { tbody.appendChild(el('tr', {}, [el('td', { class: 'first', text: r.name }), el('td', { 'data-l': T('st.h.reached'), class: 'num', text: fmt(r.reached) }), el('td', { 'data-l': T('st.h.bad'), class: 'num', text: fmt(r.bad) }), el('td', { 'data-l': T('st.h.ratio') }, [pill(pct(r.bad, r.reached) + '%', pct(r.bad, r.reached) > 15 ? 'warn' : 'ok')])])); });
        body.appendChild(el('div', { class: 'tbl-wrap' }, [el('table', { class: 'tbl static' }, [el('thead', {}, [el('tr', {}, [el('th', { text: TABS.filter(function (x) { return x[0] === state.tab; })[0][1] }), el('th', { text: T('st.h.reached') }), el('th', { text: T('st.h.bad') }), el('th', { text: T('st.h.bad_ratio') })])]), tbody])]));
      };
      draw();
      view.appendChild(card(T('st.by'), [seg, body]));
    });
  }

  // ════════ 3) الزيارات ════════
  function vVisits(view) {
    return DATA.visits(state.site, state.range).then(function (list) {
      clear(view);
      var live = list.filter(function (v) { return Date.now() - Date.parse(v.at) < 10 * 60e3; }).length;
      var tools = el('div', { class: 'tools' });
      var search = el('input', { type: 'search', placeholder: T('visits.search'), 'aria-label': T('visits.search.label') });
      search.value = state.q;
      var seg = el('div', { class: 'seg' });
      var FILT = (DATA.live ? ['all', 'bad', 'contact', 'ads', 'outside'] : ['all', 'real', 'suspicious', 'blocked']).map(function (k) { return [k, T('visits.f.' + k)]; });
      if (FILT.every(function (f) { return f[0] !== state.filter; })) state.filter = 'all';
      var matchF = function (v, f) { return f === 'all' || (f === 'contact' ? !!v.contact : f === 'ads' ? (v.ad || v.src === 'google_ads') : f === 'bad' ? (v.status === 'suspicious' || v.status === 'high') : f === 'outside' ? !!v.outside : v.status === f); };
      var count = function (f) { return list.filter(function (v) { return matchF(v, f); }).length; };
      FILT.forEach(function (f) {
        var b = el('button', { type: 'button', 'aria-pressed': String(state.filter === f[0]) }, [document.createTextNode(f[1]), el('span', { class: 'n', text: fmt(count(f[0])) })]);
        b.addEventListener('click', function () { state.filter = f[0]; vVisits(view); });
        seg.appendChild(b);
      });
      tools.appendChild(el('label', { class: 'search' }, [search])); tools.appendChild(seg);
      var tbody = el('tbody'), shown = 25;
      var moreBtn = el('button', { class: 'btn ghost sm more-rows', type: 'button' });
      moreBtn.addEventListener('click', function () { shown += 25; draw(); });
      var draw = function () {
        clear(tbody);
        var q = state.q.trim();
        var all = list.filter(function (v) { return matchF(v, state.filter) && (!q || (v.city + v.district + v.kw + srcName(v.src)).indexOf(q) >= 0); });
        var rows = all.slice(0, shown);
        moreBtn.hidden = all.length <= shown;
        moreBtn.textContent = T('visits.more', { n: LT.n(all.length - shown, 'visit') });
        rows.forEach(function (v) {
          var tr = el('tr', { tabindex: '0' }, [
            el('td', { class: 'first' }, [el('div', { class: 'acc-name', text: placeOf(v) }), el('span', { class: 'dim', text: timeAr(v.at) }), v.replay ? replayLink(v) : null]),
            el('td', { 'data-l': T('visits.h.source') }, [el('div', { text: srcName(v.src) }), v.kw ? el('span', { class: 'dim', text: '«' + v.kw + '»' }) : null]),
            el('td', { 'data-l': T('visits.h.device'), class: 'pro-only', text: v.device + (v.os ? ' · ' + v.os : '') }),
            el('td', { 'data-l': T('visits.h.network'), class: 'pro-only', text: v.net ? NET[v.net] : shortIsp(v.isp) }),
            el('td', { 'data-l': T('visits.h.engage'), text: LT.n(v.pages, 'page') + (v.dur == null ? '' : ' · ' + (v.dur < 60 ? T('visits.s', { n: v.dur }) : T('visits.m', { n: Math.round(v.dur / 60) }))) + (v.contact ? ' · ' + (v.contact === 'wa' ? '💬' : '📞') : '') }),
            el('td', { 'data-l': T('visits.h.score'), class: 'pro-only' }, [v.score == null ? el('span', { class: 'dim', text: '—', title: T('visits.noscore') }) : scoreBadge(v)]),
            el('td', { 'data-l': T('visits.h.status') }, [v.live ? livePill(v) : pill(STATUS[v.status][0], STATUS[v.status][1])]),
          ]);
          tr.addEventListener('click', function () { openVisit(v); });
          tr.addEventListener('keydown', function (e) { if (e.key === 'Enter') openVisit(v); });
          tbody.appendChild(tr);
        });
        if (!rows.length) tbody.appendChild(el('tr', {}, [el('td', { colspan: '7', class: 'empty', text: T('visits.empty') })]));
      };
      search.addEventListener('input', function () { state.q = search.value; shown = 25; draw(); });
      draw();
      view.appendChild(el('div', { class: 'status-strip' }, [el('span', { class: 'st live-now' }, [el('i', { class: 'dot live' }), document.createTextNode(T('visits.live', { n: LT.n(live, 'visit') }))]), el('span', { class: 'hint', text: T('visits.hint') })]));
      view.appendChild(card('', [el('div', { class: 'sec-head' }, [el('h2', { text: T('visits.title') }), tools]),
        el('div', { class: 'tbl-wrap' }, [el('table', { class: 'tbl' }, [el('thead', {}, [el('tr', {}, ['place', 'source', 'device', 'network', 'engage', 'score', 'status'].map(function (h) { return el('th', { text: T('visits.h.' + h), class: h === 'device' || h === 'network' || h === 'score' ? 'pro-only' : '' }); }))]), tbody])]), moreBtn]));
    });
  }
  // حالة الزيارة الحقيقية: حكمك الأول، بعدين الدرجة، بعدين «خارج النطاق»، بعدين التواصل
  function livePill(v) {
    if (v.verdict === 'fraud') return pill(T('verdict.fraud'), 'bad');
    if (v.verdict === 'real') return pill(T('verdict.real') + ' ✓', 'ok');
    if (v.status === 'high' || v.status === 'suspicious') return pill(STATUS[v.status][0], STATUS[v.status][1]);
    if (v.outside) return pill(T('visit.outside'), '');
    if (v.contact) return pill(T(v.contact === 'wa' ? 'visit.contacted.wa' : 'visit.contacted.call'), 'ok');
    return v.status === 'none' ? pill(T('visit.one'), '') : pill(T('status.real'), 'ok');
  }
  // فحوصات الزيارة: ✓ نجح · ✗ لم ينجح · — لا ينطبق أو غير معروف بعد
  function checksList(list) {
    return el('ul', { class: 'checks vchecks' }, list.map(function (c) {
      var cls = c.ok === true ? 'ok' : c.ok === false ? 'bad' : 'soon';
      return el('li', { class: cls }, [el('i', { class: 'ck', text: c.ok === true ? '✓' : c.ok === false ? '✗' : '—', 'aria-label': T(c.ok === true ? 'check.pass' : c.ok === false ? 'check.fail' : 'check.na') }), el('b', { text: c.label }), el('span', { text: c.detail })]);
    }));
  }
  // «▶ شاهد الزيارة» (تسجيل rrweb): صفحة لوحدها بمشغّل كبير
  function replayHref(v) { return '/replay?site=' + encodeURIComponent(state.site) + '&sid=' + encodeURIComponent(v.id); }
  function replayLink(v, big) {
    var a = el('a', { class: big ? 'btn rp-open' : 'rp-link', href: replayHref(v), title: T('replay.watch') }, [document.createTextNode(big ? '▶ ' + T('replay.watch') : '▶ ' + T('replay.short'))]);
    a.addEventListener('click', function (e) { e.stopPropagation(); });
    return a;
  }
  function placeOf(v) { return v.city + (v.district ? ' · ' + v.district : ''); }
  function shortIsp(x) { x = String(x || ''); if (!x) return '—'; return x.replace(/\b(company|joint[- ]stock|jsc|co\.?|ltd\.?|llc|inc\.?|a)\b/gi, '').replace(/[,]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 32); }
  function openVisit(v) {
    if (v.live) return openLiveVisit(v);
    var body = clear($('d-body'));
    $('d-title').textContent = placeOf(v);
    $('d-sub').textContent = timeAr(v.at) + ' · ' + srcName(v.src) + (v.kw ? ' «' + v.kw + '»' : '');
    body.appendChild(el('div', { class: 'verdict s-' + v.status }, [el('div', { class: 'vd-score' }, [el('b', { text: String(v.score) }), el('small', { text: T('visit.of100') })]), el('div', {}, [el('b', { text: STATUS[v.status][0] }), el('span', { text: T(v.status === 'real' ? 'd.visit.normal' : 'visit.head.why') })])]));
    if (v.reasons.length) body.appendChild(el('section', { class: 'd-sec' }, [el('h3', { class: 'legend', text: T('visit.why') }), el('ul', { class: 'why' }, v.reasons.map(function (r) { return el('li', { text: r }); }))]));
    body.appendChild(el('section', { class: 'd-sec' }, [el('h3', { class: 'legend', text: T('visit.journey') }), el('ol', { class: 'timeline' }, v.journey.map(function (e) { return el('li', { class: 'k-' + e.kind }, [el('time', { text: clock(e.at) }), el('span', { text: e.text })]); }))]));
    body.appendChild(el('section', { class: 'd-sec' }, [el('h3', { class: 'legend', text: T('visit.details') }), el('dl', { class: 'facts' }, [
      [T('f.device'), v.device + ' · ' + v.os], [T('f.network'), NET[v.net]], [T('f.ip'), '⁦' + v.ip + '⁩'], [T('f.campaign'), v.campaign || '—'], [T('f.visit_no'), String(v.visit_no)], [T('f.scroll'), v.scroll + '%'],
    ].reduce(function (a, f) { a.push(el('dt', { text: f[0] })); a.push(el('dd', { text: f[1] })); return a; }, []))]));
    var acts = el('div', { class: 'd-foot-act' });
    if (v.status !== 'blocked') { var b1 = el('button', { class: 'btn', type: 'button', text: T('d.visit.block') }); b1.addEventListener('click', function () { demoAct(T('d.visit.blocked')); closeDrawer(); }); acts.appendChild(b1); }
    else { var b2 = el('button', { class: 'btn ghost', type: 'button', text: T('d.unblock') }); b2.addEventListener('click', function () { demoAct(T('d.unblocked')); closeDrawer(); }); acts.appendChild(b2); }
    var b3 = el('button', { class: 'btn ghost', type: 'button', text: T('d.visit.mine') }); b3.addEventListener('click', function () { demoAct(T('d.visit.mine.done')); closeDrawer(); }); acts.appendChild(b3);
    setFoot(acts);
    openDrawer();
  }

  // زيارة حقيقية (من السيرفر): الدرجة والأسباب من الحماية، والمسار بيتحمّل لما تفتح الزيارة
  // «امنعه في جوجل» (بتأكيد) و«هذه زيارتي» من تفاصيل الزيارة (15 نوفمبر)
  function visitActions(v, after) {
    var box = el('section', { class: 'd-sec v-acts' }, [el('h3', { class: 'legend', text: T('va.title') })]);
    var row = el('div', { class: 'v-acts-row' });
    if (state.adsOn !== false && v.status !== 'real' && v.verdict !== 'real' && v.ad !== false) {
      var blk = el('button', { class: 'btn sm', type: 'button', text: T('va.block') }), sure = false;
      blk.addEventListener('click', function () {
        if (!sure) { sure = true; blk.textContent = T('va.block.sure'); return; }
        blk.disabled = true;
        DATA.blockIp(state.site, v.id, (v.reasons || [])[0] || '').then(function (r) {
          toast(r.already ? T('va.block.again') : T(r.dc ? 'va.block.dc' : 'va.block.ok')); blk.textContent = T('va.blocked'); if (after) after();
        }, function (e) { blk.disabled = false; sure = false; blk.textContent = T('va.block'); var k = 'va.e.' + e.message; toast(T(k) === k ? T('va.e.google') : T(k)); });
      });
      row.appendChild(blk);
    }
    var mine = el('button', { class: 'btn ghost sm', type: 'button', text: T('va.own') });
    mine.addEventListener('click', function () { mine.disabled = true; DATA.ownDevice(state.site, v.id).then(function () { toast(T('va.own.ok')); closeDrawer(); if (after) after(); }, function () { mine.disabled = false; toast(T('err.save')); }); });
    row.appendChild(mine);
    box.appendChild(row);
    box.appendChild(el('p', { class: 'hint', text: T('va.hint') }));
    return box;
  }
  function openLiveVisit(v, after) {
    var body = clear($('d-body'));
    $('d-title').textContent = placeOf(v);
    $('d-sub').textContent = timeAr(v.at) + ' · ' + srcName(v.src) + (v.kw ? ' «' + v.kw + '»' : '');
    var scored = v.score != null && v.status !== 'none';
    var head = !scored ? [T(v.contact ? 'visit.head.contacted' : 'visit.head.recorded'), T('visit.head.noscore')]
      : v.verdict === 'fraud' ? [T('verdict.fraud'), T('visit.head.fraud')]
      : v.verdict === 'real' ? [T('verdict.real'), T('visit.head.real')]
      : v.status === 'real' ? [T('status.real'), T(v.reasons.length ? 'visit.head.real_hint' : 'visit.head.normal')]
      : [STATUS[v.status][0], T('visit.head.why')];
    body.appendChild(el('div', { class: 'verdict s-' + (scored ? (v.verdict === 'fraud' ? 'high' : v.verdict === 'real' ? 'real' : v.status) : 'none') }, [
      el('div', { class: 'vd-score' }, scored ? [el('b', { text: String(v.score) }), el('small', { text: T('visit.of100') })] : [el('b', { text: v.contact ? (v.contact === 'wa' ? '💬' : '📞') : '👁️' }), el('small', { text: LT.n(v.pages, 'page') })]),
      el('div', {}, [el('b', { text: head[0] }), el('span', { text: head[1] })])]));
    if (v.replay) body.appendChild(el('div', { class: 'rp-cta' }, [replayLink(v, true), el('span', { class: 'hint', text: T('replay.hint') })]));
    if (v.outside) body.appendChild(el('div', { class: 'callout' }, [el('b', { text: T('visit.outside') }), el('span', { text: T('visit.outside.text', { c: v.country || T('visit.other_country') }) })]));
    if (v.checks && v.checks.length) body.appendChild(el('section', { class: 'd-sec' }, [el('h3', { class: 'legend', text: T('visit.checks') }), checksList(v.checks)]));
    var why = v.reasons.filter(function (r) { return !/^(حكمك|Your review)/.test(r); });
    if (scored && why.length) body.appendChild(el('section', { class: 'd-sec' }, [el('h3', { class: 'legend', text: T('visit.why') }), el('ul', { class: 'why' }, why.map(function (r) { return el('li', { text: r }); }))]));
    var tl = el('ol', { class: 'timeline' }, [el('li', {}, [el('span', { class: 'spinner' }), el('span', { text: T('visit.journey.loading') })])]);
    body.appendChild(el('section', { class: 'd-sec' }, [el('h3', { class: 'legend', text: T('visit.journey') }), tl]));
    body.appendChild(el('section', { class: 'd-sec' }, [el('h3', { class: 'legend', text: T('visit.details') }), el('dl', { class: 'facts' }, [
      [T('f.source'), srcName(v.src) + (v.kw ? ' · ' + v.kw : '')], [T('f.device'), v.device + (v.os ? ' · ' + v.os : '')], [T('f.network'), shortIsp(v.isp)], [T('f.landing'), v.landing || '—'],
      [T('f.duration'), v.dur == null ? '—' : LT.n(v.dur, 'second')], [T('f.visit_no'), String(v.visit_no || 1)], [T('f.code'), v.code ? '#' + v.code : '—'],
    ].concat(v.repeats > 1 ? [[T('f.repeats'), LT.n(v.repeats, 'time')]] : []).reduce(function (a, f) { a.push(el('dt', { text: f[0] })); a.push(el('dd', { text: f[1] })); return a; }, []))]));
    if (DATA.blockIp) body.appendChild(visitActions(v, after));
    setFoot(scored && DATA.verdict ? verdictButtons(v, function () { openLiveVisit(v, after); if (after) after(); }) : null);
    openDrawer();
    DATA.session(state.site, v.id).then(function (ev) {
      clear(tl);
      if (!ev.length) tl.appendChild(el('li', {}, [el('span', { text: T('visit.journey.empty') })]));
      ev.forEach(function (e) { tl.appendChild(el('li', { class: 'k-' + e.kind }, [el('time', { text: clock(e.at) }), el('span', { text: e.text })])); });
    }, function () { clear(tl); tl.appendChild(el('li', {}, [el('span', { text: T('visit.journey.fail') })])); });
  }
  // حكمك على الزيارة (عميل حقيقي · احتيال مؤكَّد · تراجع): بيتحفظ على السيرفر، وبيغلب الدرجة
  function setVerdict(v, value, done) {
    DATA.verdict(state.site, v.id, value).then(function () {
      v.verdict = value;
      if (value === 'real') v.status = 'real';
      if (value === 'fraud') { v.status = 'high'; v.score = Math.max(v.score || 0, 90); }
      toast(T(value === 'real' ? 'verdict.saved.real' : value === 'fraud' ? 'verdict.saved.fraud' : 'verdict.saved.undo'));
      if (done) done();
    }, function (e) { toast(T(e && e.message === 'role' ? 'verdict.err.role' : 'err.save')); });
  }
  function verdictButtons(v, done) {
    var box = el('div', { class: 'd-foot-act' });
    if (v.verdict) { var u = el('button', { class: 'btn ghost', type: 'button', text: T('verdict.undo') }); u.addEventListener('click', function () { setVerdict(v, null, function () { v.status = 'none'; render(); closeDrawer(); }); }); box.appendChild(u); return box; }
    var real = el('button', { class: 'btn ghost', type: 'button', text: T('verdict.real') }), bad = el('button', { class: 'btn', type: 'button', text: T('verdict.fraud') });
    real.addEventListener('click', function () { setVerdict(v, 'real', done); });
    bad.addEventListener('click', function () { setVerdict(v, 'fraud', done); });
    box.appendChild(real); box.appendChild(bad);
    return box;
  }

  // ════════ 4) الحماية ════════
  function vProtection(view) {
    return DATA.protection(state.site).then(function (p) {
      clear(view);
      var modeSeg = el('div', { class: 'seg wide3', role: 'radiogroup', 'aria-label': T('pr.mode') });
      var MODES = ['test', 'monitor', 'active'].map(function (k) { return [k, T('pr.mode.' + k), T('pr.mode.' + k + '.d')]; });
      var modeHint = el('p', { class: 'hint' });
      var drawModes = function () { clear(modeSeg); MODES.forEach(function (m) { var b = el('button', { type: 'button', role: 'radio', 'aria-checked': String(p.mode === m[0]), text: m[1] }); b.addEventListener('click', function () { p.mode = m[0]; drawModes(); demoAct(T('pr.mode') + ': ' + m[1]); }); modeSeg.appendChild(b); if (p.mode === m[0]) modeHint.textContent = m[2]; }); };
      drawModes();
      var strictSeg = el('div', { class: 'seg', role: 'radiogroup', 'aria-label': T('pr.strict') });
      var drawStrict = function () { clear(strictSeg); ['calm', 'balanced', 'strict'].forEach(function (k) { var name = T('pr.strict.' + k); var b = el('button', { type: 'button', role: 'radio', 'aria-checked': String(p.strict === k), text: name }); b.addEventListener('click', function () { p.strict = k; drawStrict(); demoAct(T('pr.strict') + ': ' + name); }); strictSeg.appendChild(b); }); };
      drawStrict();
      view.appendChild(card(T('pr.mode'), [modeSeg, modeHint, el('div', { class: 'row-l' }, [el('span', { class: 'legend', text: T('pr.strict') }), strictSeg]), el('p', { class: 'hint', text: T('pr.strict.hint') })]));
      // طابور الموافقة
      var q = el('div', { class: 'queue' });
      var drawQ = function () {
        clear(q);
        if (!p.pending.length) { q.appendChild(el('p', { class: 'muted', text: T('pr.q.empty') })); return; }
        p.pending.forEach(function (x, i) {
          var ok = el('button', { class: 'btn sm', type: 'button', text: T('pr.q.approve') }), no = el('button', { class: 'btn ghost sm', type: 'button', text: T('pr.q.real') });
          ok.addEventListener('click', function () { p.pending.splice(i, 1); drawQ(); demoAct(T('pr.q.approved')); });
          no.addEventListener('click', function () { p.pending.splice(i, 1); drawQ(); demoAct(T('pr.q.realed')); });
          q.appendChild(el('div', { class: 'q-item' }, [
            el('div', { class: 'q-main' }, [el('div', {}, [el('b', {}, [document.createTextNode(x.kind + ' '), el('span', { class: 'ltr', text: x.value })]), el('span', { class: 'dim', text: ' · ' + x.city + ' · ' + LT.n(x.clicks, 'click') + ' · ' + x.cost + ' ' + T('sar') })]), el('ul', { class: 'why sm' }, x.reasons.map(function (r) { return el('li', { text: r }); }))]),
            el('div', { class: 'q-act' }, [el('span', { class: 'score s-suspicious' }, [el('b', { text: String(x.score) })]), ok, no]),
          ]));
        });
      };
      drawQ();
      view.appendChild(card(T('pr.q.title'), [el('p', { class: 'hint', text: T('pr.q.hint') }), q]));
      // المحظورين
      var tb = el('tbody');
      p.blocked.forEach(function (b) {
        var back = el('button', { class: 'btn ghost sm', type: 'button', text: T('pr.b.undo') }); back.addEventListener('click', function () { demoAct(T('d.unblocked')); });
        tb.appendChild(el('tr', {}, [el('td', { class: 'first' }, [el('b', {}, [document.createTextNode(b.kind + ' '), el('span', { class: 'ltr', text: b.value })]), el('div', { class: 'dim', text: b.reasons[0] || '' })]), el('td', { 'data-l': T('pr.b.where'), text: b.where }), el('td', { 'data-l': T('pr.b.since'), text: dateAr(b.at) }), el('td', { 'data-l': T('pr.b.ends'), text: T('pr.b.after', { n: LT.n(b.expires_days, 'day') }) }), el('td', { class: 'last' }, [back])]));
      });
      view.appendChild(card(T('pr.b.title'), [el('div', { class: 'tbl-wrap' }, [el('table', { class: 'tbl static' }, [el('thead', {}, [el('tr', {}, [T('pr.b.item'), T('pr.b.where'), T('pr.b.since'), T('pr.b.ends'), ''].map(function (h) { return el('th', { text: h }); }))]), tb])])]));
      // أجهزتي + الاسترداد
      var own = el('ul', { class: 'd-sites' }, p.own.map(function (o) { return el('li', {}, [el('span', { class: 's-name', text: o.label }), el('span', { class: 'dim', text: T('pr.own.since', { d: dateAr(o.at) }) })]); }));
      var add = el('button', { class: 'btn ghost sm', type: 'button', text: T('pr.own.add') }); add.addEventListener('click', function () { demoAct(T('pr.own.copied')); });
      var ref = el('button', { class: 'btn sm', type: 'button', text: T('pr.ref.btn') }); ref.addEventListener('click', function () { demoAct(T('pr.ref.prep')); });
      view.appendChild(el('div', { class: 'grid-2' }, [
        card(T('pr.own.title'), [own, add]),
        card(T('pr.ref.title'), [el('p', { text: T('pr.ref.text') }), el('p', { class: 'hint', text: T('pr.ref.hint') }), ref]),
      ]));
    });
  }

  // ════════ 5) العملاء الحقيقيين ════════
  // نتايج التواصل: القيم المتخزنة ثابتة (الشيت وتليجرام وقاعدة البيانات)، والاسم المعروض من ملف اللغة
  var OUTCODES = ['تم', 'بيفكر', 'لغى', 'مش جاد', 'ماوصلش رسالة'];
  var OUTKEY = { 'تم': 'agreed', 'بيفكر': 'thinking', 'لغى': 'cancelled', 'مش جاد': 'not_serious', 'ماوصلش رسالة': 'no_msg' };
  function outName(v) { return OUTKEY[v] ? T('outcome.' + OUTKEY[v]) : v; }
  function vLeads(view) {
    return DATA.leads(state.site, state.range).then(function (d) {
      clear(view);
      var L = d.list, won = L.filter(function (l) { return l.outcome === 'تم'; }).length, open = L.filter(function (l) { return !l.outcome && !l.outside; }).length;
      var wa = L.filter(function (l) { return l.type === 'wa'; }).length, out = L.filter(function (l) { return l.outside; }).length;
      view.appendChild(el('p', { class: 'simple-only simple-line', text: T('leads.line', { n: fmt(L.length - out), wa: fmt(wa), call: fmt(L.length - wa), won: fmt(won) }) + (open ? ' ' + T('leads.line.open', { n: fmt(open) }) : '') + (out ? ' ' + T('leads.line.out', { n: fmt(out) }) : '') }));
      view.appendChild(el('div', { class: 'kpis four pro-only' }, [
        kpi(T('kpi.contacts'), fmt(L.length), T('leads.k.split', { wa: fmt(wa), call: fmt(L.filter(function (l) { return l.type === 'call'; }).length) }), 'info'),
        kpi(T('leads.k.won'), fmt(won), T('leads.k.won.sub', { p: pct(won, L.length) }), 'ok'),
        kpi(T('leads.k.cpl'), won && d.cost != null ? money(d.cost / won, d.currency) : '—', T(d.cost == null ? 'leads.k.cpl.ads' : 'leads.k.cpl.how'), 'ok'),
        kpi(T('kpi.open'), fmt(open), T('leads.k.open.sub'), open ? 'warn' : 'mute'),
      ]));
      if (DATA.conv) view.appendChild(convCard());
      var dist = {}; L.forEach(function (l) { var k = l.outcome || (l.outside ? '__out' : '__none'); dist[k] = (dist[k] || 0) + 1; });
      var ch = el('div');
      C.hbars(ch, OUTCODES.concat(['__out', '__none']).filter(function (k) { return dist[k]; }).map(function (k) { return { label: k === '__out' ? T('visit.outside') : k === '__none' ? T('leads.none') : outName(k), value: dist[k], cls: k === 'تم' ? 'c-ok' : k === '__none' || k === '__out' ? 'c-mute' : 'c-data' }; }), { compact: true });
      var tb = el('tbody'), shownL = 25;
      var moreL = el('button', { class: 'btn ghost sm more-rows', type: 'button' });
      var drawL = function () {
      clear(tb);
      moreL.hidden = L.length <= shownL; moreL.textContent = T('leads.more', { n: LT.n(L.length - shownL, 'contact') });
      L.slice(0, shownL).forEach(function (l) {
        var sel = l.outside ? el('span', { title: l.outside_note || '' }, [pill(T('visit.outside'), ''), el('div', { class: 'dim', text: l.outside_note || T('leads.outside.note') })]) : el('select', { 'aria-label': T('leads.h.outcome') }, [''].concat(OUTCODES).map(function (o) { return el('option', { value: o, text: o ? outName(o) : T('leads.none.opt') }); }));
        if (!l.outside) sel.value = l.outcome;
        if (!l.outside) sel.addEventListener('change', function () {
          var before = l.outcome, v = sel.value;
          if (!DATA.setOutcome) { l.outcome = v; demoAct(T('leads.saved', { o: v ? outName(v) : T('leads.none'), c: '' })); return; }
          if (!v || l.code === '—') { sel.value = before; toast(T(!v ? 'leads.err.none' : 'leads.err.nocode')); return; }
          sel.disabled = true;
          DATA.setOutcome(state.site, l.code, v).then(function () { l.outcome = v; sel.disabled = false; toast(T('leads.saved', { o: outName(v), c: ' (#' + l.code + ')' })); }, function () { sel.value = before; sel.disabled = false; toast(T('err.save')); });
        });
        tb.appendChild(el('tr', {}, [
          el('td', { class: 'first' }, [el('b', { text: (l.type === 'wa' ? '💬 ' + T('wa') : '📞 ' + T('call')) + ' · ' + T('leads.code', { c: l.code }) }), el('div', { class: 'dim', text: timeAr(l.at) }), l.strength ? el('div', { class: 'strength' }, [pill(T('leads.strength', { s: l.strength.label }), l.strength.key === 'strong' ? 'ok' : l.strength.key === 'normal' ? 'info' : 'warn'), el('small', { class: 'dim', text: ' ' + (l.strength.detail ? l.strength.detail + ' · ' : '') + T('estimate') })]) : null]),
          el('td', { 'data-l': T('visits.h.source'), class: 'pro-only' }, [el('div', { text: srcName(l.src) }), l.kw ? el('span', { class: 'dim', text: '«' + l.kw + '»' }) : null]),
          el('td', { 'data-l': T('f.place'), text: l.city + (l.district ? ' · ' + l.district : '') }),
          el('td', { 'data-l': T('leads.h.outcome') }, [sel]),
        ]));
      });
      };
      moreL.addEventListener('click', function () { shownL += 25; drawL(); });
      drawL();
      view.appendChild(el('div', { class: 'grid-2 pro-only' }, [
        card(T('leads.results'), [ch, el('p', { class: 'hint', text: T('leads.results.hint') })]),
        card(T('leads.why'), [el('p', { text: T('leads.why.text') })]),
      ]));
      view.appendChild(card(T('leads.all'), [el('div', { class: 'tbl-wrap' }, [el('table', { class: 'tbl static' }, [el('thead', {}, [el('tr', {}, ['contact', 'source', 'place', 'outcome'].map(function (h) { return el('th', { text: T('leads.h.' + h), class: h === 'source' ? 'pro-only' : '' }); }))]), tb])]), moreL]));
    });
  }

  // ── ارفع العملاء المؤكدين لجوجل أدز: القايمة ← موافقة العميل ← الإرسال (مفيش رفع أوتوماتيك) ──
  function convCard() {
    var body = el('div', {}, [el('p', {}, [el('span', { class: 'spinner' }), el('span', { text: T('conv.loading') })])]);
    var box = card(T('conv.title'), [el('p', { class: 'hint', text: T('conv.intro') }), body]);
    box.classList.add('conv-card');
    var site = state.site;
    var load = function () {
      DATA.conv(site).then(function (d) {
        clear(body);
        if (!d.linked) { body.appendChild(el('p', {}, [el('span', { text: T('conv.not_linked') + ' ' }), el('a', { class: 'linkish', href: '#/sites', text: T('nav.sites') })])); return; }
        // إجراء التحويل
        if (!d.action) {
          if (!d.manage) { body.appendChild(el('p', { class: 'muted', text: T('conv.ask_owner') })); return; }
          body.appendChild(actionPicker(function () { load(); }));
          return;
        }
        var chg = d.manage ? el('button', { class: 'linkish', type: 'button', text: T('conv.change') }) : null;
        body.appendChild(el('p', { class: 'conv-action' }, [el('span', { text: T('conv.action', { a: d.action.name || d.action.id }) + ' ' }), chg]));
        if (chg) chg.addEventListener('click', function () { clear(body); body.appendChild(actionPicker(function () { load(); })); });
        if (d.sent_total) body.appendChild(el('p', { class: 'hint', text: T('conv.sent_total', { n: fmt(d.sent_total) }) }));
        if (!d.ready.length) { body.appendChild(el('p', { class: 'muted', text: T('conv.none') })); return; }
        var picked = {};
        var list = el('div', { class: 'opts conv-list' });
        d.ready.forEach(function (r) {
          picked[r.code] = true;
          var cb = el('input', { type: 'checkbox', checked: '' });
          cb.addEventListener('change', function () { picked[r.code] = cb.checked; sync(); });
          if (!d.manage) cb.disabled = true;
          list.appendChild(el('label', { class: 'opt' }, [cb, el('span', {}, [
            el('b', { text: (r.type === 'wa' ? '💬 ' + T('wa') : '📞 ' + T('call')) + ' · ' + T('leads.code', { c: r.code }) }),
            el('small', { text: timeAr(r.outcome_at || r.at) + (r.city ? ' · ' + r.city : '') + ' · ' + srcName(r.source) }),
            r.failed ? el('small', { class: 'danger-text', text: T('conv.failed_before') + ' (' + String(r.failed).slice(0, 140) + ')' }) : null,
          ])]));
        });
        body.appendChild(list);
        if (!d.manage) { body.appendChild(el('p', { class: 'muted', text: T('conv.ask_owner') })); return; }
        var send = el('button', { class: 'btn', type: 'button' });
        var note = el('p', { class: 'hint', text: T('conv.what') });
        var sure = false;
        var count = function () { return Object.keys(picked).filter(function (k) { return picked[k]; }).length; };
        var sync = function () { sure = false; var n = count(); send.disabled = !n; send.textContent = T('conv.send', { n: fmt(n) }); };
        send.addEventListener('click', function () {
          if (!sure) { sure = true; send.textContent = T('conv.send.sure', { n: fmt(count()) }); return; }
          send.disabled = true;
          DATA.convSend(site, Object.keys(picked).filter(function (k) { return picked[k]; })).then(function (r) { toast(T('conv.sent', { n: fmt(r.sent) })); load(); }, function (e) {
            send.disabled = false; sure = false; sync();
            toast(T(e.message === 'scope' ? 'conv.err.scope' : e.message === 'nothing' ? 'conv.none' : 'conv.err.google'));
            if (e.message === 'scope') load();
          });
        });
        sync();
        body.appendChild(el('div', { class: 'conv-act' }, [send]));
        body.appendChild(note);
      }, function () { clear(body); body.appendChild(el('p', { class: 'muted', text: T('conv.err.load') })); });
    };
    // اختيار إجراء تحويل «استيراد من النقرات» من الحساب، أو إنشاء واحد بزرار
    function actionPicker(done) {
      var wrap = el('div', { class: 'conv-pick' }, [el('p', { text: T('conv.pick.text') })]);
      var sel = el('select', { 'aria-label': T('conv.pick.label') }, [el('option', { value: '', text: T('conv.pick.loading') })]);
      sel.disabled = true;
      var use = el('button', { class: 'btn ghost sm', type: 'button', text: T('conv.pick.use'), disabled: '' });
      var mk = el('button', { class: 'btn sm', type: 'button', text: T('conv.pick.create') });
      wrap.appendChild(el('div', { class: 'conv-row' }, [sel, use]));
      wrap.appendChild(el('div', { class: 'conv-row' }, [mk, el('small', { class: 'dim', text: T('conv.pick.create.hint') })]));
      DATA.convActions(site).then(function (acts) {
        clear(sel);
        sel.appendChild(el('option', { value: '', text: acts.length ? T('conv.pick.choose') : T('conv.pick.none') }));
        acts.forEach(function (a) { sel.appendChild(el('option', { value: a.id, text: a.name + ' (' + a.id + ')' })); });
        sel.disabled = !acts.length;
      }, function () { clear(sel); sel.appendChild(el('option', { value: '', text: T('conv.err.google') })); });
      sel.addEventListener('change', function () { use.disabled = !sel.value; });
      use.addEventListener('click', function () { use.disabled = true; DATA.convAction(site, { action_id: sel.value }).then(function (a) { toast(T('conv.action.set', { a: a.name })); done(); }, function () { use.disabled = false; toast(T('err.save')); }); });
      var sureMk = false;
      mk.addEventListener('click', function () {
        if (!sureMk) { sureMk = true; mk.textContent = T('conv.pick.create.sure'); return; }
        mk.disabled = true;
        DATA.convAction(site, { create: true }).then(function (a) { toast(T('conv.action.set', { a: a.name })); done(); }, function () { mk.disabled = false; sureMk = false; mk.textContent = T('conv.pick.create'); toast(T('conv.err.google')); });
      });
      return wrap;
    }
    load();
    return box;
  }

  // ════════ الكلمات السلبية: اقتراحات من عبارات البحث · «أضِفها» لجوجل بموافقتك · «اتركها» ════════
  // صفحة «الكلمات» (15 نوفمبر): تبويبين · سلبية (بتضيّع فلوسك) · إيجابية (بتجيب عملاء ومش موجودة ككلمة)
  var kwTab = 'neg';
  function vNegatives(view) {
    if (!DATA.negatives) { clear(view); view.appendChild(soonCard(T('neg.title'), [T('neg.soon.1'), T('neg.soon.2'), T('neg.soon.3')])); return Promise.resolve(); }
    clear(view);
    var tabs = el('div', { class: 'seg kw-tabs', role: 'tablist' }), body = el('div');
    [['neg', T('kw.tab.neg')], ['pos', T('kw.tab.pos')]].forEach(function (t) {
      var b = el('button', { type: 'button', role: 'tab', 'aria-selected': kwTab === t[0] ? 'true' : 'false', text: t[1] });
      b.addEventListener('click', function () { if (kwTab === t[0]) return; kwTab = t[0]; vNegatives(view); });
      tabs.appendChild(b);
    });
    var briefBox = el('div');
    view.appendChild(briefBox); view.appendChild(tabs); view.appendChild(body);
    if (DATA.brief) briefCard(briefBox, function () { vNegatives(view); });
    body.appendChild(el('p', { class: 'loading', text: T('frame.loading') }));
    return (kwTab === 'pos' && DATA.keywords ? vPositive(body) : vNegList(body)).catch(function () { clear(body); body.appendChild(el('p', { class: 'muted', text: T('frame.load_fail') })); });
  }
  // «نشاطك كما نفهمه» (15 نوفمبر): اللي بتقدمه واللي مش بتقدمه، والكلمات المتكررة في بحث عملائك تصنّفها بضغطة. الاقتراحات كلها بتتبني عليه
  // الكلمة بشكل جوجل: [تامة] · "عبارة" · واسعة
  function kwNote(text, match) { return match === 'EXACT' ? '[' + text + ']' : match === 'PHRASE' ? '"' + text + '"' : text; }
  var briefOpen = null;   // بيفضل مفتوح أو مقفول زي ما سابه في الجلسة
  function briefCard(box, redraw) {
    DATA.brief(state.site).then(function (d) {
      clear(box);
      var b = { offer: d.brief.offer.slice(), exclude: d.brief.exclude.slice(), about: d.brief.about || '', fears: (d.brief.fears || []).slice() };
      var save = function (msg) { return DATA.briefSave(state.site, b).then(function () { toast(msg || T('adm.bl.saved')); redraw(); }, function (e) { toast(e.message === 'banned' ? T('bf.banned', { l: e.label || '' }) : T('err.save')); redraw(); }); };
      var chip = function (text, cls, sub, onDel) {
        var c = el('span', { class: 'bf-chip ' + cls }, [el('span', { text: text }), sub ? el('small', { text: sub }) : null]);
        if (onDel && d.manage) { var x = el('button', { type: 'button', class: 'bf-x', 'aria-label': T('bf.remove', { w: text }), text: '×' }); x.addEventListener('click', onDel); c.appendChild(x); }
        return c;
      };
      var offer = el('div', { class: 'bf-chips' }, b.offer.length ? b.offer.map(function (w, i) { return chip(w, 'ok', null, function () { b.offer.splice(i, 1); save(); }); }) : [el('span', { class: 'muted', text: T('bf.offer.none') })]);
      var excl = el('div', { class: 'bf-chips' }, b.exclude.length ? b.exclude.map(function (x, i) { return chip(x.word, 'no', x.why, function () { b.exclude.splice(i, 1); save(); }); }) : [el('span', { class: 'muted', text: T('bf.ex.none') })]);
      var kids = [el('p', { class: 'hint', text: T('bf.intro') })];
      var ab = el('textarea', { class: 'bf-about', maxlength: '500', rows: '2', placeholder: T('bf.about.ph'), 'aria-label': T('bf.about') }); ab.value = b.about; ab.disabled = !d.manage;
      ab.addEventListener('change', function () { b.about = ab.value.trim(); save(); });
      kids.push(el('h3', { class: 'legend', text: T('bf.about') }), ab, el('h3', { class: 'legend', text: T('bf.offer') }), offer);
      if (d.manage) {
        var oi = el('input', { type: 'text', class: 'bl-in', maxlength: '40', placeholder: T('bf.offer.ph'), 'aria-label': T('bf.offer') }), ob = el('button', { class: 'btn sm', type: 'button', text: T('bf.add') });
        ob.addEventListener('click', function () { var v = oi.value.trim(); if (v.length < 2) return; b.offer.push(v); save(); });
        kids.push(el('div', { class: 'bl-add' }, [oi, ob]));
      }
      kids.push(el('h3', { class: 'legend', text: T('bf.ex') }), excl);
      if (d.manage) {
        var ei = el('input', { type: 'text', class: 'bl-in', maxlength: '40', placeholder: T('bf.ex.ph'), 'aria-label': T('bf.ex') }), ew = el('input', { type: 'text', class: 'bl-in', maxlength: '80', placeholder: T('bf.why.ph'), 'aria-label': T('bf.why') }), eb = el('button', { class: 'btn sm', type: 'button', text: T('bf.add') });
        eb.addEventListener('click', function () { var v = ei.value.trim(); if (v.length < 2) return; b.exclude.push({ word: v, why: ew.value.trim() }); save(); });
        kids.push(el('div', { class: 'bl-add' }, [ei, ew, eb]));
      }
      // مخاوف العميل ووعدك اللي بيعالجها (للإعلان)
      kids.push(el('h3', { class: 'legend', text: T('bf.fears') }), el('p', { class: 'hint', text: T('bf.fears.i') }),
        el('div', { class: 'bf-chips' }, b.fears.length ? b.fears.map(function (x, i) { return chip(x.fear, 'fear', x.promise ? '← ' + x.promise : '', function () { b.fears.splice(i, 1); save(); }); }) : [el('span', { class: 'muted', text: T('bf.ex.none') })]));
      if (d.manage) {
        var fi = el('input', { type: 'text', class: 'bl-in', maxlength: '80', placeholder: T('bf.fear.ph'), 'aria-label': T('bf.fear') }), fp = el('input', { type: 'text', class: 'bl-in', maxlength: '90', placeholder: T('bf.promise.ph'), 'aria-label': T('bf.promise') }), fb = el('button', { class: 'btn sm', type: 'button', text: T('bf.add') });
        fb.addEventListener('click', function () { var v = fi.value.trim(); if (v.length < 2) return; b.fears.push({ fear: v, promise: fp.value.trim() }); save(); });
        kids.push(el('div', { class: 'bl-add' }, [fi, fp, fb]));
      }
      if (d.words.length) {
        kids.push(el('h3', { class: 'legend', text: T('bf.words') }), el('p', { class: 'hint', text: T('bf.words.i') }));
        kids.push(el('div', { class: 'bf-words' }, d.words.map(function (w) {
          var yes = el('button', { type: 'button', class: 'bf-yes', title: T('bf.mine'), 'aria-label': T('bf.mine') + ': ' + w.word, text: '✓' }), no = el('button', { type: 'button', class: 'bf-no', title: T('bf.notmine'), 'aria-label': T('bf.notmine') + ': ' + w.word, text: '✕' });
          yes.addEventListener('click', function () { b.offer.push(w.word); save(T('bf.added.offer', { w: w.word })); });
          no.addEventListener('click', function () { b.exclude.push({ word: w.word, why: '' }); save(T('bf.added.ex', { w: w.word })); });
          return el('div', { class: 'bf-word' }, [el('b', { text: w.word }), el('small', { class: 'dim', text: T('bf.word.s', { c: fmt(w.clicks), t: fmt(w.terms) }) }), d.manage ? el('span', { class: 'bf-act' }, [yes, no]) : null]);
        })));
      }
      var det = el('details', { class: 'panel-card bf-card' }, [el('summary', {}, [el('b', { text: T('bf.title') }), el('small', { class: 'dim', text: d.empty ? T('bf.empty') : T('bf.sum', { o: fmt(b.offer.length), e: fmt(b.exclude.length) }) })])].concat(kids));
      if (briefOpen === true || (briefOpen === null && (d.empty || !b.offer.length))) det.setAttribute('open', '');
      det.addEventListener('toggle', function () { briefOpen = det.open; });
      box.appendChild(det);
    }, function () { clear(box); });
  }
  function vPositive(view) {
    return DATA.keywords(state.site).then(function (d) {
      clear(view);
      if (!d.linked) { view.appendChild(card(T('kw.title'), [el('p', {}, [el('span', { text: T('conv.not_linked') + ' ' }), el('a', { class: 'linkish', href: '#/sites', text: T('nav.sites') })])])); return; }
      var cur = d.currency === 'SAR' ? T('sar') : d.currency;
      var list = el('div', { class: 'neg-list' });
      if (!d.suggestions.length) list.appendChild(el('p', { class: 'muted', text: T(d.need_brief ? 'kw.need_brief' : 'kw.none') }));
      d.suggestions.forEach(function (x) {
        var acts = el('div', { class: 'neg-acts' });
        if (d.manage) {
          var add = el('button', { class: 'btn sm', type: 'button', text: T('kw.add') }), keep = el('button', { class: 'btn ghost sm', type: 'button', text: T('neg.keep') });
          var sure = false;
          add.addEventListener('click', function () {
            if (!sure) { sure = true; add.textContent = T('kw.add.sure', { g: x.group.name || x.group.id }); return; }
            add.disabled = keep.disabled = true;
            DATA.kwDecide(state.site, x.id, 'add').then(function () { toast(T('kw.added', { k: x.text })); render(); }, function (e) { add.disabled = keep.disabled = false; sure = false; add.textContent = T('kw.add'); toast(T('neg.err') + (e.detail ? ' (' + String(e.detail).slice(0, 80) + ')' : '')); });
          });
          keep.addEventListener('click', function () { keep.disabled = add.disabled = true; DATA.kwDecide(state.site, x.id, 'keep').then(function () { toast(T('neg.kept', { k: x.text })); render(); }, function () { keep.disabled = add.disabled = false; toast(T('err.save')); }); });
          acts.appendChild(add); acts.appendChild(keep);
        }
        list.appendChild(el('div', { class: 'neg-item kw-item' }, [
          el('div', { class: 'neg-h' }, [el('b', { class: 'kw-note', text: kwNote(x.text, 'EXACT') }), el('span', { class: 'pill', text: T('neg.m.exact') }), el('span', { class: 'pill ok', text: T('kw.r.' + x.reason) })]),
          el('p', { class: 'hint', text: T('kw.why.exact') }),
          x.weak ? el('p', { class: 'hint warn-text', text: T('kw.weak') }) : null,
          el('p', { class: 'dim', text: T('kw.stats', { c: fmt(x.clicks), v: fmt(x.conv), m: money2(x.cost, cur) }) }),
          el('p', { class: 'hint', text: T('kw.where', { g: x.group.name || x.group.id, c: x.group.campaign || '—' }) + (x.from.length ? ' · ' + T('kw.from', { k: x.from.map(function (f) { return f.text; }).join('، ') }) : '') }),
          acts,
        ]));
      });
      view.appendChild(card(T('kw.title'), [el('p', { class: 'hint', text: T('kw.intro', { d: d.days }) }), list]));
      if (d.decided.length) {
        view.appendChild(card(T('neg.decided'), [el('ul', { class: 'feed' }, d.decided.map(function (x) {
          return el('li', {}, [el('span', { class: 'pill ' + (x.decision === 'add' ? (x.applied_at ? 'ok' : 'warn') : ''), text: T(x.decision === 'add' ? (x.applied_at ? 'neg.d.added' : 'neg.d.failed') : 'neg.d.kept') }), el('div', {}, [el('span', { text: x.text + ' · ' + T('neg.m.exact') })]), el('time', { text: timeAr(x.at) })]);
        }))]));
      }
    });
  }
  // تشخيص الحساب (المنهجية بند 10): السبب الجذري قبل السلبيات · قراية بس
  function auditCard(a, cur) {
    var items = [];
    if (a.broad_pct >= 50) items.push(['warn', T('au.broad', { p: a.broad_pct })]);
    if (a.off_pct != null && a.off_pct >= 15) items.push(['warn', T('au.off', { p: a.off_pct, m: money2(a.off_cost, cur) })]);
    if (a.adj_conv > 0) items.push(['bad', T('au.conv', { n: fmt(a.adj_conv), c: fmt(a.adj_clicks) })]);
    (a.bad_keywords || []).forEach(function (k) { items.push(['bad', T('au.badkw', { k: k.keyword, w: k.word }) + (k.why ? ' (' + k.why + ')' : '')]); });
    if (a.info_clicks > 0) items.push(['info', T('au.info', { c: fmt(a.info_clicks), m: money2(a.info_cost, cur) })]);
    if (!items.length) return null;
    return card(T('au.title'), [el('p', { class: 'hint', text: T('au.intro') }), el('ul', { class: 'au-list' }, items.map(function (x) { return el('li', { class: x[0] }, [el('i', { text: x[0] === 'info' ? 'i' : '!' }), el('span', { text: x[1] })]); }))], 'au-card');
  }
  function vNegList(view) {
    return DATA.negatives(state.site).then(function (d) {
      clear(view);
      if (!d.linked) { view.appendChild(card(T('neg.title'), [el('p', {}, [el('span', { text: T('conv.not_linked') + ' ' }), el('a', { class: 'linkish', href: '#/sites', text: T('nav.sites') })])])); return; }
      var cur = d.currency === 'SAR' ? T('sar') : d.currency;
      view.appendChild(el('p', { class: 'simple-line', text: T('neg.line', { d: d.days, n: fmt(d.suggestions.length), w: money2(d.waste, cur), t: money2(d.total_cost, cur) }) }));
      if (d.audit) { var ac = auditCard(d.audit, cur); if (ac) view.appendChild(ac); }
      if (d.need_brief) view.appendChild(el('p', { class: 'callout warn', text: T('neg.need_brief') }));
      var list = el('div', { class: 'neg-list' });
      if (!d.suggestions.length) list.appendChild(el('p', { class: 'muted', text: T('neg.none') }));
      d.suggestions.forEach(function (x) {
        var acts = el('div', { class: 'neg-acts' });
        if (d.manage) {
          var add = el('button', { class: 'btn sm', type: 'button', text: T('neg.add') }), keep = el('button', { class: 'btn ghost sm', type: 'button', text: T('neg.keep') });
          var sure = false;
          add.addEventListener('click', function () {
            if (!sure) { sure = true; add.textContent = T('neg.add.sure', { n: x.campaigns.length }); return; }
            add.disabled = keep.disabled = true;
            DATA.negDecide(state.site, x.id, 'add').then(function () { toast(T('neg.added', { k: x.text })); render(); }, function (e) { add.disabled = keep.disabled = false; sure = false; add.textContent = T('neg.add'); toast(T('neg.err') + (e.detail ? ' (' + String(e.detail).slice(0, 80) + ')' : '')); });
          });
          keep.addEventListener('click', function () { keep.disabled = add.disabled = true; DATA.negDecide(state.site, x.id, 'keep').then(function () { toast(T('neg.kept', { k: x.text })); render(); }, function () { keep.disabled = add.disabled = false; toast(T('err.save')); }); });
          acts.appendChild(add); acts.appendChild(keep);
        }
        list.appendChild(el('div', { class: 'neg-item' }, [
          el('div', { class: 'neg-h' }, [el('b', { class: 'kw-note', text: kwNote(x.text, x.match) }), el('span', { class: 'pill', text: T('neg.m.' + x.match.toLowerCase()) }), el('span', { class: 'pill ' + (x.reason === 'not_offer' ? 'bad' : x.reason === 'generic' || x.reason === 'off_offer' ? 'warn' : 'info'), text: T('neg.r.' + x.reason) + (x.why ? ': ' + x.why : '') })]),
          el('p', { class: 'hint', text: T('neg.why.' + (x.reason === 'generic' ? 'generic' : x.match.toLowerCase())) }),
          x.narrowed ? el('p', { class: 'hint warn-text', text: T('neg.narrowed', { f: x.narrowed.from, k: (x.narrowed.blocked || []).join('، ') }) }) : null,
          (x.blocks_own || []).length ? el('p', { class: 'hint warn-text', text: T('neg.blocks_own', { k: x.blocks_own.join('، ') }) }) : null,
          (x.variants || []).length > 1 ? el('p', { class: 'hint', text: T('neg.variants', { v: x.variants.join(' · ') }) }) : null,
          el('p', { class: 'hint ok-text', text: '✓ ' + T('neg.safe') }),
          el('p', { class: 'dim', text: T('neg.stats', { c: fmt(x.clicks), m: money2(x.cost, cur), p: x.campaigns.map(function (c) { return c.name; }).join('، ') }) }),
          x.terms.length > 1 || x.terms[0] !== x.text ? el('p', { class: 'hint', text: T('neg.terms') + ' ' + x.terms.join(' · ') }) : null,
          x.reason === 'not_offer' && x.conv > 0 ? el('p', { class: 'hint warn-text', text: T('neg.conv_warn', { n: fmt(x.conv) }) }) : x.protect && x.reason !== 'not_offer' ? el('p', { class: 'hint warn-text', text: T('neg.protect') }) : null,
          acts,
        ]));
      });
      view.appendChild(card(T('neg.title'), [el('p', { class: 'hint', text: T('neg.intro') }), list]));
      // الموجود في الحساب (عند الطلب)
      if (d.manage) {
        var exBox = el('div'), exBtn = el('button', { class: 'btn ghost sm', type: 'button', text: T('neg.existing') });
        exBtn.addEventListener('click', function () {
          exBtn.disabled = true;
          DATA.negExisting(state.site).then(function (r) {
            clear(exBox);
            var rows = r.campaign.map(function (x) { return [x.text, T('neg.m.' + String(x.match).toLowerCase()), x.campaign]; }).concat(r.shared.map(function (x) { return [x.text, T('neg.m.' + String(x.match).toLowerCase()), T('neg.list', { l: x.list })]; }));
            exBox.appendChild(el('p', { class: 'hint', text: T('neg.existing.n', { n: fmt(rows.length) }) }));
            if (rows.length) exBox.appendChild(el('div', { class: 'tbl-wrap' }, [el('table', { class: 'tbl static' }, [el('tbody', {}, rows.slice(0, 200).map(function (r2) { return el('tr', {}, r2.map(function (c) { return el('td', { text: c }); })); }))])]));
          }, function () { exBtn.disabled = false; toast(T('neg.err')); });
        });
        view.appendChild(card(T('neg.existing.title'), [el('p', { class: 'hint', text: T('neg.existing.hint') }), exBtn, exBox]));
      }
      if (d.decided.length) {
        view.appendChild(card(T('neg.decided'), [el('ul', { class: 'feed' }, d.decided.map(function (x) {
          return el('li', {}, [el('span', { class: 'pill ' + (x.decision === 'add' ? (x.applied_at ? 'ok' : 'warn') : ''), text: T(x.decision === 'add' ? (x.applied_at ? 'neg.d.added' : 'neg.d.failed') : 'neg.d.kept') }), el('div', {}, [el('span', { text: x.text + ' · ' + T('neg.m.' + String(x.match_type).toLowerCase()) })]), el('time', { text: timeAr(x.at) })]);
        }))]));
      }
    });
  }
  // ════════ 6) التنبيهات ════════
  function vAlerts(view) {
    return DATA.alerts(state.site).then(function (d) {
      clear(view);
      var CH = { tg: T('alerts.ch.tg'), wa: T('alerts.ch.wa'), push: T('alerts.ch.push'), email: T('alerts.ch.email') };   // واتساب: قريبًا لحد ما محمود يفعّله
      var list = el('div', { class: 'rules' });
      d.rules.forEach(function (r) {
        var sw = r.soon ? pill(T('soon'), '') : el('button', { class: 'switch', type: 'button', role: 'switch', 'aria-checked': String(r.on), 'aria-label': r.name });
        if (!r.soon) sw.addEventListener('click', function () { if (DATA.live) { toast(T('alerts.soon_toggle')); return; } r.on = !r.on; sw.setAttribute('aria-checked', String(r.on)); demoAct(T(r.on ? 'alerts.on' : 'alerts.off', { n: r.name })); });
        var chips = el('div', { class: 'chips' }, Object.keys(CH).map(function (c) {
          var b = el('button', { class: 'chip' + (r.ch.indexOf(c) >= 0 ? ' on' : ''), type: 'button', 'aria-pressed': String(r.ch.indexOf(c) >= 0), text: CH[c] });
          if (c === 'wa') { b.disabled = true; b.classList.add('soon'); b.setAttribute('aria-pressed', 'false'); b.title = T('alerts.ch.wa.soon'); return b; }
          b.addEventListener('click', function () { var i = r.ch.indexOf(c); if (i >= 0) r.ch.splice(i, 1); else r.ch.push(c); b.classList.toggle('on'); b.setAttribute('aria-pressed', String(i < 0)); });
          return b;
        }));
        list.appendChild(el('div', { class: 'rule' }, [el('div', { class: 'r-main' }, [el('b', { text: r.name }), el('span', { class: 'dim', text: r.desc }), chips]), sw]));
      });
      if (!d.log.length) d.log = [];
      var log = el('ul', { class: 'feed' }, d.log.map(function (x) { return el('li', {}, [el('span', { class: 'pill ' + x.level, text: x.rule }), el('div', {}, [el('span', { text: x.text })]), el('time', { text: timeAr(x.at) })]); }));
      view.appendChild(el('div', { class: 'grid-2' }, [card(T('nav.alerts'), [list]), card(T('alerts.last'), [d.log.length ? log : el('p', { class: 'muted', text: T('alerts.log.empty') })])]));
    });
  }

  // ════════ 7) المواقع والتركيب ════════
  function vSites(view) {
    return DATA.setup().then(function (list) {
      clear(view);
      if (!list.length) view.appendChild(card(T('sites.none'), [el('p', { text: T('sites.none.text') })]));
      list.forEach(function (s) {
        var avg = s.delivery.length ? Math.round(s.delivery.reduce(function (a, b) { return a + b; }, 0) / s.delivery.length * 10) / 10 : null;
        var spark = el('div'); C.hbars(spark, s.delivery.map(function (v, i) { return { label: i === s.delivery.length - 1 ? T('sites.yesterday') : T('sites.ago', { n: LT.n(s.delivery.length - 1 - i, 'day') }), value: v, text: v + '%', cls: v >= 99.5 ? 'c-ok' : 'c-sus' }; }).reverse(), { max: 100, compact: true });
        var rows = [
          [T('sites.r.installed'), s.installed, s.installed ? (s.plugin ? T('sites.plugin', { v: s.plugin }) : T('sites.plugin.on')) + ' · ' + T('sites.last', { t: timeAr(s.last_event) }) : T(s.paired ? 'sites.paired_wait' : 'sites.not_paired')],
          [T('sites.r.delivery'), avg == null ? null : avg >= 99.5, avg == null ? T('sites.delivery.none') : T('sites.delivery', { p: avg })],
          adsRow(s),
          suffixRow(s),
          [T('sites.r.own'), s.own ? true : DATA.live ? null : true, s.own ? LT.n(s.own, 'device') : T('sites.own.soon')],
        ];
        var extra = [];
        if (DATA.tg) extra.push(tgBlock(s));
        if (DATA.pairCode && !s.paired) {
          var out = el('div', { class: 'hint' }), b = el('button', { class: 'btn ghost sm', type: 'button', text: T('sites.paircode') });
          b.addEventListener('click', function () { b.disabled = true; DATA.pairCode(s.id).then(function (r) { b.disabled = false; clear(out); out.appendChild(el('div', { class: 'code', text: r.code })); out.appendChild(document.createTextNode(T('sites.paircode.hint', { m: LT.n(r.valid_minutes, 'minute') }))); }, function (e) { b.disabled = false; clear(out); out.appendChild(document.createTextNode(T(e.message === 'role' ? 'sites.paircode.role' : 'sites.paircode.fail'))); }); });
          extra.push(b, out);
        }
        view.appendChild(card(s.name, [el('p', { class: 'acc-sub', text: s.domain }), el('ul', { class: 'checks' }, rows.map(function (r) { return el('li', { class: r[1] === null ? 'soon' : r[1] ? 'ok' : 'warn' }, [el('i', { class: 'ck', text: r[1] === null ? '…' : r[1] ? '✓' : '!' }), el('b', { text: r[0] }), el('span', { text: r[2] }), r[3] || null]); })),
          s.delivery.length ? el('details', { class: 'more-d pro-only' }, [el('summary', { text: T('sites.daily') }), spark]) : null].concat(extra)));
      });
      var add = el('button', { class: 'btn', type: 'button', text: T('sites.add') }); add.addEventListener('click', function () { toast(T('sites.add.hint')); });
      view.appendChild(add);
      // راجع من موافقة جوجل: اختيار حساب الإعلانات
      if (state.adsNonce && DATA.adsAccounts) { var n = state.adsNonce; state.adsNonce = null; openAdsPicker(state.site, n); }
    });
  }
  // تنبيهات تليجرام للموقع: الشاتات المربوطة + رابط ربط (لأكتر من شخص، 7 أيام) للمالك والمدير
  function tgBlock(s) {
    var box = el('div', { class: 'tg-block' }, [el('h3', { class: 'legend', text: T('tg.title') })]);
    var body = el('div'); box.appendChild(body);
    var load = function () {
      DATA.tg(s.id).then(function (d) {
        clear(body);
        if (d.chats.length) {
          body.appendChild(el('ul', { class: 'tg-chats' }, d.chats.map(function (c) {
            var rm = d.manage && c.id ? el('button', { class: 'linkish', type: 'button', text: T('tg.remove') }) : null;
            if (rm) rm.addEventListener('click', function () {
              if (rm.getAttribute('data-sure') !== '1') { rm.setAttribute('data-sure', '1'); rm.textContent = T('tg.remove.sure'); return; }
              DATA.tgRemove(s.id, c.id).then(function () { toast(T('tg.removed')); load(); }, function () { toast(T('err.save')); });
            });
            return el('li', {}, [el('span', { text: '💬 ' + (c.name || T('tg.noname')) }), el('small', { class: 'dim', text: ' · ' + T('tg.aud.' + (c.audience || 'owner')) + ' · ' + timeAr(c.at) + ' ' }), rm]);
          })));
        } else body.appendChild(el('p', { class: 'muted', text: T('tg.none') }));
        if (!d.manage) return;
        if (!d.ready) { body.appendChild(el('p', { class: 'muted', text: T('tg.not_ready') })); return; }
        // رابطين: صاحب الموقع والمديرين · الموظفين (لكل نوع شكل رسالة من لوحة الإدارة)
        ['owner', 'staff'].forEach(function (a) {
          var inv = (d.invites || {})[a] || null;
          var sub = el('div', { class: 'tg-aud' }, [el('b', { text: T('tg.aud.' + a) }), el('small', { class: 'dim', text: ' · ' + T('tg.aud.' + a + '.d') })]);
          if (inv) {
            var inp = el('input', { type: 'text', readonly: '', class: 'tg-link', dir: 'ltr', value: inv.link, 'aria-label': T('tg.link') + ' · ' + T('tg.aud.' + a) });
            var cp = el('button', { class: 'btn sm', type: 'button', text: T('tg.copy') });
            cp.addEventListener('click', function () { inp.select(); (navigator.clipboard ? navigator.clipboard.writeText(inv.link) : Promise.reject()).then(function () { toast(T('tg.copied')); }, function () { toast(T('tg.copy.manual')); }); });
            var rv = el('button', { class: 'linkish', type: 'button', text: T('tg.revoke') });
            rv.addEventListener('click', function () { DATA.tgInvite(s.id, true, a).then(function () { toast(T('tg.revoked')); load(); }, function () { toast(T('err.save')); }); });
            sub.appendChild(el('div', { class: 'tg-row' }, [inp, cp]));
            sub.appendChild(el('p', { class: 'hint' }, [el('span', { text: T('tg.valid', { d: new Date(inv.expires_at).toLocaleDateString(LT.locale), n: fmt(inv.uses) }) + ' ' }), rv]));
          } else {
            var mk = el('button', { class: 'btn sm' + (a === 'staff' ? ' ghost' : ''), type: 'button', text: T('tg.make.' + a) });
            mk.addEventListener('click', function () { mk.disabled = true; DATA.tgInvite(s.id, false, a).then(function () { load(); }, function () { mk.disabled = false; toast(T('err.save')); }); });
            sub.appendChild(el('div', {}, [mk]));
          }
          body.appendChild(sub);
        });
        body.appendChild(el('p', { class: 'hint', text: T('tg.hint') }));
      }, function () { clear(body); body.appendChild(el('p', { class: 'muted', text: T('tg.err') })); });
    };
    load();
    return box;
  }
  // صف «جوجل أدز» في المواقع والتثبيت: مربوط · انتهى الربط · اربط (المالك والمدير بس)
  function adsRow(s) {
    if (!DATA.live) return [T('sites.r.ads'), !!s.ads, s.ads ? T('sites.ads.on') + (s.account ? ' · \u2066' + s.account + '\u2069' : '') : T('sites.ads.link')];
    var st = s.ads_state || {}, manage = s.role === 'owner' || s.role === 'admin', btn = null;
    var go = function (b) { b.disabled = true; DATA.adsLink(s.id).then(function (url) { location.assign(url); }, function (e) { b.disabled = false; toast(T(e.message === 'role' ? 'ads.err.role' : e.message === 'not_configured' ? 'ads.err.config' : 'err.save')); }); };
    if (st.linked) {
      if (manage) { btn = el('button', { class: 'linkish', type: 'button', text: T('ads.unlink') }); btn.addEventListener('click', function () { if (btn.getAttribute('data-sure') !== '1') { btn.setAttribute('data-sure', '1'); btn.textContent = T('ads.unlink.sure'); return; } DATA.adsUnlink(s.id).then(function () { toast(T('ads.unlinked')); render(); }, function () { toast(T('err.save')); }); }); }
      return [T('sites.r.ads'), true, T('ads.linked', { a: '\u2066' + s.account + '\u2069' }) + (st.last_ok_day ? ' · ' + T('ads.last_day', { d: st.last_ok_day }) : ' · ' + T('ads.first_pull')), btn];
    }
    if (manage) { btn = el('button', { class: 'btn sm', type: 'button', text: T(st.reauth ? 'ads.relink' : 'ads.link') }); btn.addEventListener('click', function () { go(btn); }); }
    return [T('sites.r.ads'), st.reauth ? false : null, T(st.reauth ? 'ads.reauth' : manage ? 'ads.not_linked' : 'ads.ask_owner'), btn];
  }
  function fmtCid(id) { return String(id).replace(/^(\d{3})(\d{3})(\d+)$/, '$1-$2-$3'); }
  function openAdsPicker(site, n) {
    var body = clear($('d-body'));
    $('d-title').textContent = T('ads.pick.title'); $('d-sub').textContent = T('ads.pick.sub');
    var list = el('div', { class: 'opts' }, [el('p', {}, [el('span', { class: 'spinner' }), el('span', { text: T('ads.pick.loading') })])]);
    var ok = el('button', { class: 'btn', type: 'button', text: T('ads.pick.go'), disabled: '' });
    body.appendChild(list); body.appendChild(el('p', { class: 'hint', text: T('ads.pick.hint') }));
    setFoot(el('div', { class: 'd-foot-act' }, [ok]));
    openDrawer();
    var chosen = null;
    DATA.adsAccounts(site, n).then(function (accs) {
      clear(list);
      if (!accs.length) { list.appendChild(el('p', { class: 'muted', text: T('ads.pick.none') })); return; }
      // بحث بالاسم أو الرقم لما الحسابات كتير (حساب إداري فيه عشرات الحسابات)
      var rows = [];
      if (accs.length > 8) {
        var q = el('input', { type: 'search', class: 'pick-q', placeholder: T('ads.pick.search'), 'aria-label': T('ads.pick.search') });
        var none = el('p', { class: 'muted', text: T('ads.pick.nomatch'), hidden: '' });
        q.addEventListener('input', function () {
          var v = q.value.trim().toLowerCase(), d = v.replace(/\D/g, ''), shown = 0;
          rows.forEach(function (x) { var hit = !v || String(x.a.name || '').toLowerCase().indexOf(v) >= 0 || (d.length >= 3 && String(x.a.id).indexOf(d) >= 0); x.row.hidden = !hit; if (hit) shown++; });
          none.hidden = shown > 0;
        });
        list.appendChild(q); list.appendChild(none);
        list.appendChild(el('p', { class: 'hint', text: T('ads.pick.count', { n: accs.length }) }));
      }
      accs.forEach(function (a, i) {
        var r = el('input', { type: 'radio', name: 'ads-acc', value: a.id });
        r.addEventListener('change', function () { chosen = a.id; ok.disabled = false; });
        var off = a.status && a.status !== 'ENABLED';
        var row = el('label', { class: 'opt' + (off ? ' off' : '') }, [r, el('span', {}, [el('b', { text: a.name || fmtCid(a.id) }), el('small', { text: '\u2066' + fmtCid(a.id) + '\u2069' + (a.currency ? ' · ' + a.currency : '') + (a.via ? ' · ' + T('ads.pick.via', { m: '\u2066' + fmtCid(a.via) + '\u2069' }) : '') + (a.test ? ' · ' + T('ads.pick.test') : '') + (off ? ' · ' + T('ads.pick.off') : '') })])]);
        rows.push({ a: a, row: row }); list.appendChild(row);
        if (accs.length === 1 && i === 0) { r.checked = true; chosen = a.id; ok.disabled = false; }
      });
    }, function (e) { clear(list); list.appendChild(el('p', { class: 'muted', text: T(e.message === 'expired' ? 'ads.pick.expired' : 'ads.pick.fail') })); });
    ok.addEventListener('click', function () {
      if (!chosen) return; ok.disabled = true;
      DATA.adsChoose(site, n, chosen).then(function (r) { closeDrawer(); toast(T('ads.done', { a: r.name || fmtCid(r.customer_id) })); render(); }, function (e) { ok.disabled = false; toast(T(e.message === 'expired' ? 'ads.pick.expired' : 'err.save')); });
    });
  }

  // ════════ كل العملاء (الوكالات) ════════
  var COLS = [['name', T('cl.h.name')], ['bad_pct', T('cl.h.bad_pct')], ['saved', T('cl.h.saved')], ['won', T('cl.h.won')], ['cpl', T('cl.h.cpl')], ['billed', T('cl.h.billed')], ['delivery', T('cl.h.delivery')]];
  var COLS_LIVE = [['name', T('cl.h.name')], ['visits', T('cl.h.visits')], ['leads', T('cl.h.leads')], ['won', T('cl.h.won')], ['open', T('cl.h.open')], ['delivery', T('cl.h.delivery')]];
  state.sort = 'attention';
  function issues(c) {
    var x = [];
    if (!c.ads && !DATA.live) x.push([T('d.strip.ads.off'), 'bad']);
    if (DATA.live && c.open) x.push([T('cl.i.open', { n: LT.n(c.open, 'contact') }), 'info']);
    if (DATA.live && c.delivery == null) x.push([T('cl.i.plugin'), 'warn']);
    if (c.pending) x.push([T('cl.i.pending', { n: LT.n(c.pending, 'svisit') }), 'warn']);
    if (c.bad_pct > 18) x.push([T('cl.i.bad', { p: c.bad_pct }), 'warn']);
    if (c.delivery != null && c.delivery < 99.5) x.push([T('cl.i.delivery', { p: c.delivery }), 'warn']);
    if (c.template === false) x.push([T('cl.i.suffix'), 'warn']);
    return x;
  }
  function vClients(view) {
    return DATA.clients(state.range).then(function (list) {
      clear(view);
      var cur = list[0] ? list[0].currency : '';
      var tot = list.reduce(function (a, c) { a.saved += c.saved || 0; a.won += c.won; a.cost += c.cost || 0; a.bad += c.bad || 0; a.visits += c.visits; a.leads += c.leads; a.att += issues(c).length ? 1 : 0; return a; }, { saved: 0, won: 0, cost: 0, bad: 0, visits: 0, leads: 0, att: 0 });
      if (DATA.live) view.appendChild(el('div', { class: 'kpis' }, [
        kpi(T('cl.k.sites'), fmt(list.length), T('cl.k.sites.sub'), 'info'),
        kpi(T('cl.k.att'), fmt(tot.att), T('cl.k.att.sub'), tot.att ? 'warn' : 'mute'),
        kpi(T('cl.h.visits'), fmt(tot.visits), T('cl.k.all_sites'), 'info'),
        kpi(T('cl.h.leads'), fmt(tot.leads), T('cl.k.wa_call'), 'info'),
        kpi(T('cl.h.won'), fmt(tot.won), T('cl.k.won.sub'), 'ok'),
        kpi(T('nav.protection'), T('soon'), T('cl.k.prot.sub'), 'mute'),
      ]));
      else view.appendChild(el('div', { class: 'kpis' }, [
        kpi(T('cl.k.clients'), fmt(list.length), DATA.agency ? DATA.agency.name : '', 'info'),
        kpi(T('cl.k.att'), fmt(tot.att), T('cl.k.att.sub'), tot.att ? 'warn' : 'mute'),
        kpi(T('cl.k.saved'), money(tot.saved, cur), LT.n(tot.bad, 'sclick'), 'ok'),
        kpi(T('cl.k.bad_avg'), pct(tot.bad, tot.visits) + '%', T('cl.k.of_all'), 'warn'),
        kpi(T('cl.h.won'), fmt(tot.won), tot.won ? T('cl.k.cpl_avg', { m: money(tot.cost / tot.won, cur) }) : '', 'ok'),
        kpi(T('cl.k.spend'), money(tot.cost, cur), T('cl.k.all_acc'), 'info'),
      ]));
      var tbody = el('tbody'), head = el('tr');
      var sorted = function () {
        var l = list.slice();
        if (state.sort === 'attention') l.sort(function (a, b) { return issues(b).length - issues(a).length || b.bad_pct - a.bad_pct; });
        else l.sort(function (a, b) { var x = a[state.sort], y = b[state.sort]; if (typeof x === 'string') return x.localeCompare(y, LT.lang); return (y == null ? -1 : y) - (x == null ? -1 : x); });
        return l;
      };
      var draw = function () {
        clear(head); clear(tbody);
        (DATA.live ? COLS_LIVE : COLS).forEach(function (c) {
          var b = el('button', { type: 'button', class: 'th-sort' + (state.sort === c[0] ? ' on' : ''), text: c[1] });
          b.addEventListener('click', function () { state.sort = state.sort === c[0] ? 'attention' : c[0]; draw(); });
          head.appendChild(el('th', { 'aria-sort': state.sort === c[0] ? 'descending' : 'none' }, [b]));
        });
        head.appendChild(el('th', { text: T('cl.h.needs') }));
        sorted().forEach(function (c) {
          var tr = DATA.live ? el('tr', { tabindex: '0' }, [
            el('td', { class: 'first' }, [el('div', { class: 'acc-name', text: c.name }), el('span', { class: 'acc-sub', text: c.domain })]),
            el('td', { 'data-l': T('cl.h.visits'), class: 'num', text: fmt(c.visits) }),
            el('td', { 'data-l': T('cl.h.leads'), class: 'num', text: fmt(c.leads) }),
            el('td', { 'data-l': T('cl.h.won'), class: 'num', text: fmt(c.won) }),
            el('td', { 'data-l': T('cl.h.open'), class: 'num', text: fmt(c.open) }),
            el('td', { 'data-l': T('cl.h.delivery') }, [c.delivery == null ? pill(T('cl.not_yet'), '') : pill(c.delivery + '%', c.delivery >= 99.5 ? 'ok' : 'warn')]),
            el('td', { 'data-l': T('cl.h.needs'), class: 'issues' }, issues(c).length ? issues(c).map(function (i) { return pill(i[0], i[1]); }) : [pill(T('cl.all_ok'), 'ok')]),
          ]) : el('tr', { tabindex: '0' }, [
            el('td', { class: 'first' }, [el('div', { class: 'acc-name', text: c.name }), el('span', { class: 'acc-sub', text: c.domain })]),
            el('td', { 'data-l': T('cl.h.bad_pct') }, [el('b', { class: 'num', text: c.bad_pct + '%' }), el('span', { class: 'dim', text: (c.bad_pct > c.bad_pct_prev ? ' ▲' : ' ▼') })]),
            el('td', { 'data-l': T('cl.h.saved'), class: 'num', text: money(c.saved, c.currency) }),
            el('td', { 'data-l': T('cl.h.won'), class: 'num', text: T('cl.won_of', { a: fmt(c.won), b: fmt(c.leads) }) }),
            el('td', { 'data-l': T('cl.h.cpl'), class: 'num', text: c.cpl ? money(c.cpl, c.currency) : '—' }),
            el('td', { 'data-l': T('cl.h.billed'), class: 'num', text: fmt(c.billed) }),
            el('td', { 'data-l': T('cl.h.delivery') }, [pill(c.delivery + '%', c.delivery >= 99.5 ? 'ok' : 'warn')]),
            el('td', { 'data-l': T('cl.h.needs'), class: 'issues' }, issues(c).length ? issues(c).map(function (i) { return pill(i[0], i[1]); }) : [pill(T('cl.all_ok'), 'ok')]),
          ]);
          var open = function () { state.site = c.id; buildTop(); location.hash = '#/overview'; };
          tr.addEventListener('click', open);
          tr.addEventListener('keydown', function (e) { if (e.key === 'Enter') open(); });
          tbody.appendChild(tr);
        });
      };
      draw();
      var exp = el('button', { class: 'btn ghost sm', type: 'button', text: '⬇ CSV' });
      exp.addEventListener('click', function () { downloadCsv(list); });
      view.appendChild(card('', [el('div', { class: 'sec-head' }, [el('h2', { text: T('nav.clients') }), el('div', { class: 'tools' }, [el('span', { class: 'hint', text: T('cl.hint') }), exp])]),
        el('div', { class: 'tbl-wrap' }, [el('table', { class: 'tbl' }, [el('thead', {}, [head]), tbody])])]));
    });
  }
  function downloadCsv(list) {
    var z = function (v) { return v == null ? '' : v; };
    var rows = [[T('cl.h.name'), T('cl.h.domain'), T('cl.h.visits'), T('cl.h.bad_pct'), T('cl.h.saved'), T('cl.h.leads'), T('cl.h.won'), T('cl.h.cpl'), T('cl.h.billed'), T('st.spend'), T('cl.h.delivery_pct')]];
    list.forEach(function (c) { rows.push([c.name, c.domain, z(c.visits), z(c.bad_pct), z(c.saved), c.leads, c.won, z(c.cpl), z(c.billed), z(c.cost), z(c.delivery)]); });
    var csv = '\ufeff' + rows.map(function (r) { return r.map(function (v) { var x = String(v); return /[",\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; }).join(','); }).join('\n');
    var a = el('a', { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })), download: 'maestro-clients-' + String(state.range).replace('~', '_') + '.csv' });
    document.body.appendChild(a); a.click(); a.remove();
  }

  // ════════ التقارير (باسم الوكالة ولوجوها) ════════
  var rep = { site: null, range: 7, level: 'simple', name: '', logo: '', color: '#1a6fe8', white: true, email: '', every: 'weekly',
    parts: { answers: true, kpis: true, chart: true, statement: true, leads: true, todo: true } };
  var PARTS = [['answers', T('rp2.p.answers')], ['kpis', T('rp2.p.kpis')], ['chart', T('rp2.p.chart')], ['statement', T('rp2.p.statement')], ['leads', T('rp2.p.leads')], ['todo', T('rp2.p.todo')]];
  function vReports(view) {
    clear(view);
    if (!rep.site) rep.site = state.site;
    if (!rep.name) rep.name = DATA.agency ? DATA.agency.name : '';
    var form = el('div', { class: 'rep-form' }), prev = el('div', { class: 'rep-prev' });
    var field = function (label, node) { return el('label', { class: 'fld' }, [el('span', { text: label }), node]); };
    var sel = el('select', {}, state.sites.map(function (x) { return el('option', { value: x.id, text: x.name }); })); sel.value = rep.site;
    sel.addEventListener('change', function () { rep.site = sel.value; redraw(); });
    var segR = el('div', { class: 'seg' }), segL = el('div', { class: 'seg' });
    var drawSegs = function () {
      clear(segR); clear(segL);
      [[7, T('rp2.weekly')], [30, T('rp2.monthly')]].forEach(function (x) { var b = el('button', { type: 'button', 'aria-pressed': String(rep.range === x[0]), text: x[1] }); b.addEventListener('click', function () { rep.range = x[0]; drawSegs(); redraw(); }); segR.appendChild(b); });
      [['simple', T('rp2.simple')], ['detailed', T('level.detailed')]].forEach(function (x) { var b = el('button', { type: 'button', 'aria-pressed': String(rep.level === x[0]), text: x[1] }); b.addEventListener('click', function () { rep.level = x[0]; drawSegs(); redraw(); }); segL.appendChild(b); });
    };
    drawSegs();
    var name = el('input', { type: 'text', maxlength: '60' }); name.value = rep.name; name.addEventListener('input', function () { rep.name = name.value; redraw(); });
    var logo = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp' });
    var logoMsg = el('small', { class: 'hint', text: T('rp2.logo.hint') });
    logo.addEventListener('change', function () {
      var f = logo.files && logo.files[0]; if (!f) return;
      if (!/^image\/(png|jpeg|webp)$/.test(f.type) || f.size > 1024 * 1024) { logoMsg.textContent = T('rp2.logo.bad'); return; }
      var r = new FileReader(); r.onload = function () { if (/^data:image\/(png|jpeg|webp);base64,/.test(String(r.result))) { rep.logo = String(r.result); redraw(); } }; r.readAsDataURL(f);
    });
    var color = el('input', { type: 'color' }); color.value = rep.color; color.addEventListener('input', function () { rep.color = color.value; redraw(); });
    var white = el('input', { type: 'checkbox' }); white.checked = rep.white; white.addEventListener('change', function () { rep.white = white.checked; redraw(); });
    var parts = el('div', { class: 'checks-in' }, PARTS.map(function (x) { var c = el('input', { type: 'checkbox' }); c.checked = rep.parts[x[0]]; c.addEventListener('change', function () { rep.parts[x[0]] = c.checked; redraw(); }); return el('label', { class: 'ck-in' }, [c, el('span', { text: x[1] })]); }));
    var pdf = el('button', { class: 'btn', type: 'button', text: T('rp2.pdf') });
    pdf.addEventListener('click', function () { document.body.classList.add('print-report'); window.print(); });
    var email = el('input', { type: 'email', placeholder: T('rp2.email.ph'), dir: 'ltr' }); email.value = rep.email; email.addEventListener('input', function () { rep.email = email.value; });
    var every = el('select', {}, [el('option', { value: 'weekly', text: T('rp2.every.weekly') }), el('option', { value: 'monthly', text: T('rp2.every.monthly') })]);
    var sched = el('button', { class: 'btn ghost', type: 'button', text: T('rp2.auto') });
    sched.addEventListener('click', function () { if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(rep.email)) { toast(T('rp2.email.bad')); return; } demoAct(T(every.value === 'weekly' ? 'rp2.sched.weekly' : 'rp2.sched.monthly', { e: rep.email })); });
    form.appendChild(card(T('rp2.prepare'), [field(T('cl.h.name'), sel), field(T('rp2.period'), segR), field(T('rp2.level'), segL), field(T('rp2.agency'), name), field(T('rp2.logo'), el('div', {}, [logo, logoMsg])), field(T('rp2.color'), color),
      el('label', { class: 'ck-in' }, [white, el('span', { text: T('rp2.white') })]), el('div', { class: 'fld' }, [el('span', { text: T('rp2.parts') }), parts]), el('div', { class: 'row-btns' }, [pdf])]));
    form.appendChild(card(T('rp2.auto.title'), [field(T('rp2.email'), email), field(T('rp2.every'), every), sched]));
    view.appendChild(el('div', { class: 'rep-grid' }, [form, prev]));
    var redraw = function () {
      Promise.all([DATA.overview(rep.site, rep.range), DATA.statement(rep.site, rep.range), DATA.summary(rep.site, rep.range)]).then(function (r) { clear(prev); prev.appendChild(reportDoc(r[0], r[1], r[2])); });
    };
    redraw();
    return Promise.resolve();
  }
  function reportDoc(o, st, sm) {
    var k = o.kpi, cur = o.currency, detailed = rep.level === 'detailed';
    var doc = el('article', { class: 'report-doc', 'aria-label': T('rd.preview') });
    doc.style.setProperty('--rc', rep.color);
    var brand = el('div', { class: 'rd-brand' }, [rep.logo ? el('img', { src: rep.logo, alt: rep.name, class: 'rd-logo' }) : null, el('b', { text: rep.name || T('rp2.agency') })]);
    doc.appendChild(el('header', { class: 'rd-head' }, [brand, el('div', { class: 'rd-meta' }, [el('b', { text: sm.name }), el('span', { text: T(rep.range === 7 ? 'rd.weekly' : 'rd.monthly') + ' · ' + T('rd.until', { d: dateAr(new Date().toISOString()) }) })])]));
    if (rep.parts.answers) doc.appendChild(el('section', { class: 'rd-answers' }, [
      el('div', {}, [el('span', { text: T('ans.protected.q') }), el('b', { text: o.scoring === false ? T('rd.watching') : T(sm.ads ? 'rd.yes' : 'rd.partial') })]),
      o.scoring === false ? el('div', {}, [el('span', { text: T('cl.h.visits') }), el('b', { text: fmt(k.real) })]) : el('div', {}, [el('span', { text: T('rd.saved') }), el('b', { text: money(k.saved, cur) })]),
      el('div', {}, [el('span', { text: T('cl.h.won') }), el('b', { text: fmt(k.won) + (k.cpl ? ' · ' + T('rd.per_customer', { m: money(k.cpl, cur) }) : '') })]),
    ]));
    if (rep.parts.kpis) doc.appendChild(el('section', { class: 'rd-sec' }, [el('h3', { text: T('rp2.p.kpis') }), el('div', { class: 'rd-kpis' }, [
      [T('cl.h.billed'), nf(k.billed)], [T('st.spend'), money(k.cost, cur)], [T('d.k.real'), nf(k.real)], [T('kpi.suspicious'), nf(k.suspicious)], [T('d.k.blocked'), nf(k.blocked)], [T('cl.h.leads'), nf(k.leads)],
    ].filter(function (x) { return x[1] !== '—'; }).slice(0, detailed ? 6 : 3).map(function (x) { return el('div', {}, [el('span', { text: x[0] }), el('b', { text: x[1] })]); }))]));
    if (rep.parts.chart) { var ch = el('div'); C.stacked(ch, o.days, o.scoring === false ? [{ key: 'real', label: T('cl.h.visits'), cls: 'c-real' }] : [{ key: 'real', label: T('status.real'), cls: 'c-real' }, { key: 'suspicious', label: T('status.suspicious'), cls: 'c-sus' }, { key: 'blocked', label: T('status.blocked'), cls: 'c-blk' }], { label: T('rd.quality'), height: 170 }); doc.appendChild(el('section', { class: 'rd-sec' }, [el('h3', { text: T('chart.quality.title') }), ch])); }
    if (rep.parts.statement && !st.unavailable) {
      var t = st.total, fun = el('div');
      C.hbars(fun, [{ label: T('d.k.billed'), value: t.billed, cls: 'c-data' }, { label: T('rd.offsite'), value: t.offsite, cls: 'c-data' }, { label: T('st.h.reached'), value: t.reached, cls: 'c-real' }, { label: T('rd.bad'), value: t.bad, cls: 'c-sus' }, { label: T('rd.not_loaded'), value: t.not_loaded, cls: 'c-blk' }].slice(0, detailed ? 5 : 3), { max: t.billed, compact: true });
      doc.appendChild(el('section', { class: 'rd-sec' }, [el('h3', { text: T('rp2.p.statement') }), fun]));
    }
    if (rep.parts.leads) doc.appendChild(el('section', { class: 'rd-sec' }, [el('h3', { text: T('rp2.p.leads') }), el('p', { text: T('rd.leads', { l: LT.n(k.leads, 'person'), w: fmt(k.won) }) + (k.cpl ? T('rd.leads.cpl', { m: money(k.cpl, cur) }) : '') + '.' })]));
    if (rep.parts.todo) {
      var adv = [];
      if (!sm.ads && !DATA.live) adv.push(T('rd.adv.ads'));
      if (sm.open) adv.push(T('rd.adv.open', { n: LT.n(sm.open, 'contact') }));
      if (sm.pending) adv.push(T('rd.adv.pending', { n: LT.n(sm.pending, 'sdevice') }));
      if (sm.bad_pct > 18) adv.push(T('rd.adv.bad', { p: sm.bad_pct }));
      if (!sm.template) adv.push(T('rd.adv.suffix'));
      if (sm.delivery != null && sm.delivery < 99.5) adv.push(T('rd.adv.delivery', { p: sm.delivery }));
      adv.push(T(rep.range === 7 ? 'rd.adv.next.week' : 'rd.adv.next.month'));
      doc.appendChild(el('section', { class: 'rd-sec' }, [el('h3', { text: T('rp2.p.todo') }), el('ul', {}, adv.map(function (t2) { return el('li', { text: t2 }); }))]));
    }
    doc.appendChild(el('footer', { class: 'rd-foot', text: rep.white ? (rep.name || '') : (rep.name ? rep.name + ' · ' : '') + T('rd.by') }));
    return doc;
  }
  window.addEventListener('afterprint', function () { document.body.classList.remove('print-report'); });

  // ════════ شاشات البيانات الحقيقية (اللي بتختلف عن التجريبية) ════════
  function soonCard(title, lines) { return card(title, [el('ul', { class: 'soon-list' }, lines.map(function (t) { return el('li', { text: t }); })), el('p', { class: 'hint', text: T('soon.hint') })], 'soon'); }
  var LIVE_SERIES = [{ key: 'real', label: T('status.real'), cls: 'c-real' }, { key: 'suspicious', label: T('status.suspicious'), cls: 'c-sus' }, { key: 'high', label: T('status.high'), cls: 'c-blk' }];
  function liveAction(a, simple) {
    return a.kind === 'pending' ? ['protection', 'warn', T('act.pending', { n: LT.n(a.n, 'svisit') }), T(simple ? 'act.pending.sub.simple' : 'act.pending.sub'), T('act.pending.go')]
      : a.kind === 'outcome' ? ['leads', 'info', T(simple ? 'act.outcome.simple' : 'act.outcome', { n: LT.n(a.n, 'contact') }), T('act.outcome.sub'), T('act.outcome.go')]
      : a.kind === 'delivery' ? ['sites', 'warn', simple ? T('act.delivery.simple') : T('act.delivery', { p: a.pct }), T(simple ? 'act.delivery.sub.simple' : 'act.delivery.sub'), T('act.details')]
      // بعد ربط جوجل أدز (وفي اللوحة التجريبية): المنع في جوجل · طلب الاسترداد · لاحقة الرابط
      : a.kind === 'approve' ? ['protection', 'warn', T('d.act.approve', { n: LT.n(a.n, 'svisit') }), T('d.act.approve.sub'), T('d.act.approve.go')]
      : a.kind === 'refund' ? ['protection', 'ok', T('d.act.refund', { m: money(a.amount, a.currency || T('sar')) }), T('d.act.refund.sub'), T('d.act.refund.go')]
      : a.kind === 'template' ? ['sites', 'warn', T('d.act.suffix'), T('d.act.suffix.sub'), T('d.act.suffix.go')]
      : ['sites', 'info', T('act.ads'), T('act.ads.sub'), T('nav.sites')];
  }
  function actionsCard(list, simple) {
    var acts = el('div', { class: 'actions' });
    list.forEach(function (a) { var m = liveAction(a, simple); acts.appendChild(el('a', { class: 'act ' + m[1], href: '#/' + m[0] }, [el('b', { text: m[2] }), el('span', { text: m[3] }), el('em', { text: m[4] + ' ' + T('arrow') })])); });
    return card(T('act.title'), [acts]);
  }
  function lOverview(view) {
    return DATA.overview(state.site, state.range).then(function (d) {
      clear(view);
      var k = d.kpi, p = d.prev, sc = d.scoring, bad = (k.suspicious || 0) + (k.high || 0), dl = d.status.delivery, all = (k.real || 0) + bad;
      var clean = all ? Math.round(((k.real || 0) / all) * 100) : 100, current = !d.period || d.period.current;
      // ١) البطاقة الكبيرة: الحالة · أهم الأرقام · نظافة الزيارات
      var ringBox = el('div', { class: 'hero-ring' });
      C.ring(ringBox, clean, { cls: clean >= 90 ? '' : clean >= 75 ? 'warn' : 'bad', label: T('ov.clean') });
      ringBox.appendChild(el('div', {}, [el('b', { text: T('ov.clean') }), el('small', { text: T('ov.clean.sub') })]));
      var chip = function (n, label, cls) { return el('span', { class: 'hero-chip ' + (cls || '') }, [el('b', { text: fmt(n) }), document.createTextNode(label)]); };
      view.appendChild(el('section', { class: 'ov-hero', 'aria-label': T('ov.hero.aria') }, [
        el('div', {}, [
          el('h2', { text: T(!sc ? 'strip.prot.soon' : bad ? 'ov.hero.watch' : 'ov.hero.ok', { n: LT.n(bad, 'svisit') }) }),
          el('p', { class: 'sub', text: T('ov.hero.sub', { p: rangeLabel() }) }),
          el('div', { class: 'hero-chips' }, [chip(k.sessions, T('ov.c.visits')), sc ? chip(k.real, T('ov.c.real'), 'ok') : null, sc ? chip(bad, T('ov.c.bad'), bad ? 'warn' : '') : null, chip(k.contacts, T('ov.c.contacts'), 'ok'), chip(k.won, T('ov.c.won'), 'ok'), current ? el('a', { class: 'hero-chip', href: '#/visits' }, [el('i', { class: 'dot live' }), el('b', { text: fmt(d.live) }), document.createTextNode(T('ov.c.live'))]) : null]),
        ]),
        ringBox,
      ]));
      view.appendChild(el('div', { class: 'status-strip' }, [
        el('a', { class: 'st ' + (sc ? 'ok' : ''), href: '#/protection' }, [el('i', { class: 'dot' + (sc ? ' live' : '') }), document.createTextNode(T(sc ? 'strip.prot.on' : 'strip.prot.soon'))]),
        el('span', { class: 'st ' + (dl == null ? '' : dl >= 99.5 ? 'ok' : 'warn') }, [el('i', { class: 'dot' }), document.createTextNode(dl == null ? T('strip.delivery.none') : T('strip.delivery', { p: dl }))]),
        el('span', { class: 'st ' + (d.status.ads ? 'ok' : '') }, [el('i', { class: 'dot' }), document.createTextNode(T(d.status.ads ? 'strip.ads.on' : 'strip.ads.soon'))]),
      ]));
      // ٢) الأرقام بخط صغير لكل يوم في الفترة
      var col = function (key) { return d.days.map(function (x) { return key === 'bad' ? (x.suspicious || 0) + (x.high || 0) : (x[key] || 0); }); };
      var kpiS = function (label, value, sub, cls, dlt, key, sc2) { var c = kpi(label, value, sub, cls, dlt); C.spark(c, col(key), sc2); return c; };
      var money0 = k.billed != null;   // جوجل أدز مربوط وفيه أرقام: «نقرات احتسبها جوجل» أول حاجة، وجنبها «مبالغ حُميت» (التجريبي) أو «ماوصلتش موقعك» (حي)
      var reach = d.ads && d.ads.reach;
      var second = k.saved != null ? kpi(T('d.k.saved'), money(k.saved, d.currency), T('d.k.saved.sub'), 'ok')
        : kpi(T('ads.k.missing'), reach ? fmt(reach.missing) : '—', reach && reach.url_clicks ? T('ads.k.missing.sub', { p: pct(reach.missing, reach.url_clicks) }) : T('ads.k.missing.none'), reach && reach.missing ? 'warn' : 'mute');
      view.appendChild(el('div', { class: 'kpis pro' + (money0 ? ' eight' : '') }, sc ? (money0 ? [kpi(T('d.k.billed'), fmt(k.billed), T('d.k.spent', { m: money(k.cost, d.currency) }), 'info'), second] : []).concat([
        kpiS(T('kpi.visits'), fmt(k.sessions), T('kpi.pages_opened', { n: LT.n(k.pageviews, 'page') }), 'info', delta(k.sessions, p.sessions != null ? p.sessions : p.real, true), 'sessions', 'c-real'),
        kpiS(T('kpi.real'), fmt(k.real), T('kpi.of_visits', { p: pct(k.real, all) }), 'ok', null, 'real', 'c-ok'),
        kpiS(T('kpi.suspicious'), fmt(bad), T('kpi.high_of', { n: fmt(k.high) }) + (k.ad_sessions ? ' · ' + T('kpi.from_ads', { a: fmt(k.ad_bad), b: fmt(k.ad_sessions) }) : ''), bad ? 'warn' : 'mute', null, 'bad', 'c-sus'),
        kpiS(T('kpi.contacts'), fmt(k.contacts), T('kpi.wa_call') + (k.outside_leads ? ' · ' + T('kpi.outside_n', { n: fmt(k.outside_leads) }) : ''), 'ok', delta(k.contacts, p.contacts, true), 'contacts', 'c-ok'),
        kpi(T('kpi.won'), fmt(k.won), T('kpi.won.sub'), 'ok'),
        kpi(T('kpi.review'), fmt(k.pending + k.open), T('kpi.review.sub', { a: fmt(k.pending), b: fmt(k.open) }), k.pending + k.open ? 'warn' : 'mute'),
      ]) : [
        kpiS(T('kpi.visits'), fmt(k.real), T('kpi.pages_opened', { n: LT.n(k.pageviews, 'page') }), 'info', delta(k.real, p.real, true), 'sessions', 'c-real'),
        kpiS(T('kpi.contacts'), fmt(k.contacts), T('kpi.wa_call'), 'ok', delta(k.contacts, p.contacts, true), 'contacts', 'c-ok'),
        kpi(T('kpi.contact_rate'), pct(k.contacts, k.real) + '%', T('kpi.contact_rate.sub'), 'info'),
        kpi(T('kpi.won'), fmt(k.won), T('kpi.won.sub'), 'ok'),
        kpi(T('kpi.open'), fmt(k.open), T('kpi.open.sub'), k.open ? 'warn' : 'mute'),
        kpi(T('kpi.delivery'), dl == null ? T('kpi.delivery.none') : dl + '%', T('kpi.delivery.sub'), dl == null ? 'mute' : dl >= 99.5 ? 'ok' : 'warn'),
      ]));
      if (d.actions.length) view.appendChild(actionsCard(d.actions, false));
      // الأكثر اشتباهًا بانتظار حكمك (بالأسباب وزرارين)
      if (sc && d.suspicious.length && DATA.verdict) {
        var sl = el('div', { class: 'queue' });
        d.suspicious.slice(0, 3).forEach(function (v) { sl.appendChild(suspectItem(v, function () { lOverview(view); })); });
        view.appendChild(panel(T('ov.top_suspicious'), T('ov.top_suspicious.i'), [sl, el('a', { class: 'linkish', href: '#/protection', text: T('ov.all_suspicious') })]));
      }
      // ٣) حركة الزيارات (منحنى) + مصادرها (دائرة)
      var rows = d.days.map(function (x) { return { day: x.day, real: sc ? x.real || 0 : x.sessions || 0, bad: (x.suspicious || 0) + (x.high || 0), contacts: x.contacts || 0 }; });
      var ch = el('div');
      C.area(ch, rows, (sc ? [{ key: 'real', label: T('ov.real'), cls: 'c-real' }, { key: 'bad', label: T('ov.bad'), cls: 'c-sus' }] : [{ key: 'real', label: T('kpi.visits'), cls: 'c-real' }]).concat([{ key: 'contacts', label: T('ov.contacts'), cls: 'c-ok' }]), { label: T('ov.traffic') });
      var srcBox = el('div');
      var SRC_CLS = ['c-real', 'c-data', 'c-ok', 'c-sus', 'c-acc', 'c-blk', 'c-mute', 'c-mute'];
      var tree = d.source_tree || srcTree(d.sources);
      if (tree.length) { C.donut(srcBox, tree.map(function (x, i) { return { label: T('srcg.' + x.key), value: x.n, cls: SRC_CLS[i] || 'c-mute', g: x }; }), { caption: T('ov.donut.cap'), label: T('ov.sources'), item: srcItem }); srcBox.appendChild(el('p', { class: 'hint', text: T('ov.src.more') })); }
      else srcBox.appendChild(el('p', { class: 'muted', text: T('ov.no_visits') }));
      view.appendChild(el('div', { class: 'grid-ov' }, [panel(T('ov.traffic'), T('ov.traffic.i'), [ch]), panel(T('ov.sources'), T('ov.sources.i'), [srcBox])]));
      if ((d.sources_conv || []).length) view.appendChild(convPanel(d.sources_conv, sc));
      // ٤) آخر الزيارات (كروت بفحوصاتها) + أسباب الاشتباه
      var vc = el('div', { class: 'vcards' });
      (d.recent || []).forEach(function (v) { vc.appendChild(visitCard(v, function () { lOverview(view); })); });
      if (!(d.recent || []).length) vc.appendChild(el('p', { class: 'muted', text: T('ov.no_visits') }));
      var rs = el('div');
      if (sc && (d.reasons || []).length) C.hbars(rs, d.reasons.map(function (r) { return { label: r.name, value: r.n, cls: 'c-sus' }; }), { compact: true });
      else rs.appendChild(el('p', { class: 'muted', text: T(sc ? 'ov.reasons.none' : 'prot.soon.title') }));
      view.appendChild(el('div', { class: 'grid-ov' }, [panel(T('ov.recent'), T('ov.recent.i'), [vc, el('a', { class: 'linkish', href: '#/visits', text: T('d.all_visits') })]), panel(T('ov.reasons'), T('ov.reasons.i'), [rs, sc && bad ? el('a', { class: 'linkish', href: '#/protection', text: T('ov.all_suspicious') }) : null])]));
      // ٥) أوقات الزيارات (خريطة حرارية) + أول صفحة
      var land = el('div');
      if ((d.landing || []).length) C.hbars(land, d.landing.map(function (x) { return { label: x.name, value: x.n, cls: 'c-data' }; }), { compact: true });
      else land.appendChild(el('p', { class: 'muted', text: T('ov.no_visits') }));
      var hm = el('div');
      if (d.hours) {
        C.heat(hm, d.hours, { days: [0, 1, 2, 3, 4, 5, 6].map(function (i) { return T('dow.' + i); }), badLabel: T('ov.bad'), label: T('ov.hours') });
        hm.appendChild(el('div', { class: 'heat-legend' }, [el('span', {}, [el('i', { class: 'lo' }), document.createTextNode(T('ov.h.lo'))]), el('span', {}, [el('i', { class: 'hi' }), document.createTextNode(T('ov.h.hi'))]), sc ? el('span', {}, [el('i', { class: 'rk' }), document.createTextNode(T('ov.h.risky'))]) : null]));
      }
      view.appendChild(el('div', { class: 'grid-ov' }, [panel(T('ov.hours'), T('ov.hours.i'), [hm]), panel(T('ov.landing'), T('ov.landing.i'), [land])]));
      // ٦) خريطة الزيارات: أخضر جوه النطاق المستهدف وأحمر برّه، وجنبها الأرقام
      view.appendChild(mapPanel(d, sc));
      // ٧) الأجهزة
      var dev = el('div');
      if ((d.devices || []).length) C.donut(dev, d.devices.map(function (x, i) { return { label: x.name, value: x.n, cls: ['c-real', 'c-data', 'c-ok', 'c-mute'][i] }; }), { caption: T('ov.donut.cap'), label: T('ov.devices') });
      else dev.appendChild(el('p', { class: 'muted', text: T('ov.no_visits') }));
      view.appendChild(panel(T('ov.devices'), '', [dev]));
      if (d.ads && d.ads.linked) view.appendChild(adsPanel(d.ads, sc));
      else if (!d.status.ads) view.appendChild(soonCard(T('ov.soon.title'), [T('ov.soon.1'), T('ov.soon.2'), T('ov.soon.3')]));
    });
  }
  // لاحقة الرابط (15 نوفمبر): بنضبطها إحنا في حساب الإعلانات بضغطة واحدة من صاحب الموقع (بتاعة أي أداة تانية بتفضل زي ما هي)
  function suffixRow(s) {
    var linked = s.ads_state && s.ads_state.linked, st = linked ? s.ads_state.suffix : null;
    if (!linked || !DATA.suffixSet) return [T('sites.r.suffix'), null, T(s.ads ? 'sites.suffix.optional' : 'sites.suffix.after')];
    if (st === true) return [T('sites.r.suffix'), true, T('sites.suffix.auto_ok')];
    var manage = s.role === 'owner' || s.role === 'admin' || !s.role;
    var box = el('div', { class: 'sfx' });
    if (manage) {
      var b = el('button', { class: 'btn sm', type: 'button', text: T('sites.suffix.set') }), sure = false;
      b.addEventListener('click', function () {
        if (!sure) { sure = true; b.textContent = T('sites.suffix.sure'); return; }
        b.disabled = true;
        DATA.suffixSet(s.id).then(function (r) { toast(T('sites.suffix.done') + (r.kept ? ' ' + T('sites.suffix.kept') : '')); render(); }, function (e) { b.disabled = false; sure = false; b.textContent = T('sites.suffix.set'); toast(T('sites.suffix.err') + (e.detail ? ' (' + String(e.detail).slice(0, 80) + ')' : '')); });
      });
      box.appendChild(b);
    }
    return [T('sites.r.suffix'), st === false ? false : null, T(st === false ? 'sites.suffix.missing' : 'sites.suffix.unchecked'), box];
  }
  // الجداول الصغيرة على الموبايل بتتحول لكروت: كل خانة رقم جنبها اسمها (15 نوفمبر)
  function cardRows(table, head) {
    Array.prototype.forEach.call(table.querySelectorAll('tbody tr'), function (tr) { Array.prototype.forEach.call(tr.children, function (td, i) { if (i && head[i]) td.setAttribute('data-l', head[i]); }); });
    return table;
  }
  // المصادر والتحويل: لكل منصة الزيارات · تواصلوا · نسبة التحويل · تم الاتفاق · المشبوهة
  function convPanel(rows, sc) {
    var best = rows.filter(function (r) { return r.visits >= 3; }).sort(function (a, b) { return b.rate - a.rate; })[0];
    var maxRate = Math.max.apply(null, rows.map(function (r) { return r.rate; }).concat([1]));
    var head = [T('ov.conv.src'), T('ov.conv.visits'), T('ov.conv.contacted'), T('ov.conv.rate'), T('ov.conv.won')].concat(sc ? [T('ov.conv.bad')] : []);
    var tb = el('tbody');
    rows.forEach(function (r) {
      var bar = el('i'); bar.style.width = Math.round((r.rate / maxRate) * 60) + 'px';
      tb.appendChild(el('tr', { class: best && r === best && r.rate > 0 ? 'conv-best' : '' }, [
        el('td', {}, [el('b', { text: srcName(r.source) })]),
        el('td', { class: 'n', text: fmt(r.visits) }),
        el('td', { class: 'n', text: fmt(r.contacted) }),
        el('td', { class: 'n' }, [el('span', { class: 'rate' }, [bar, el('b', { text: r.rate + '%' })])]),
        el('td', { class: 'n', text: fmt(r.won) }),
        sc ? el('td', { class: 'n', text: pct(r.bad, r.visits) + '%' }) : null,
      ]));
    });
    var table = el('div', { class: 'conv' }, [cardRows(el('table', { class: 'mini cards-m' }, [el('thead', {}, [el('tr', {}, head.map(function (h, i) { return el('th', { class: i ? 'n' : '', text: h }); }))]), tb]), head)]);
    return panel(T('ov.conv'), T('ov.conv.i'), [best && best.rate > 0 ? el('p', { class: 'muted', text: T('ov.conv.best', { s: srcName(best.source), r: best.rate }) }) : null, table]);
  }
  // خريطة الزيارات وجنبها الأرقام (الدول والمدن، ولون كل صف بنفس لون الخريطة)
  function mapPanel(d, sc) {
    var countries = d.countries || [], cities = (d.cities || []).length ? d.cities : (d.places || []).map(function (x) { return { name: x.name, n: x.n, out: 0, bad: 0 }; }), targets = d.targets || [], hasT = targets.length > 0;
    var tone = function (x) { return !hasT ? 'g-vis' : x.out * 2 > x.n ? 'g-out' : 'g-in'; };
    var cTone = function (c) { return !hasT ? 'g-vis' : c.cc ? (targets.indexOf(String(c.cc).toUpperCase()) < 0 ? 'g-out' : 'g-in') : tone(c); };
    if (!countries.length && !cities.length) return panel(T('ov.map'), T('ov.map.i'), [el('p', { class: 'muted', text: T('ov.no_places') })]);
    var mapBox = el('div');
    if (window.LT_WORLD) C.geoMap(mapBox, countries, cities, { targets: targets, label: T('ov.map'), inLabel: T('ov.map.in'), outLabel: T('ov.map.out'), noTargetLabel: T('ov.map.none'), badLabel: sc ? T('ov.bad') : '' });
    var nums = el('div', { class: 'geo-nums' });
    var sub = function (x) { var p = []; if (hasT && x.out) p.push(T('ov.map.out_n', { n: fmt(x.out) })); if (sc && x.bad) p.push(T('ov.map.bad_n', { n: fmt(x.bad) })); return p.join(' · '); };
    if (countries.length) { nums.appendChild(el('h3', { class: 'legend', text: T('ov.countries') })); C.hbars(nums, countries.slice(0, 6).map(function (x) { return { label: x.name, sub: sub(x), value: x.n, cls: tone(x) }; }), { compact: true }); }
    if (cities.length) { nums.appendChild(el('h3', { class: 'legend', text: T('ov.cities') })); C.hbars(nums, cities.slice(0, 6).map(function (x) { return { label: x.name, sub: sub(x), value: x.n, cls: cTone(x) }; }), { compact: true }); }
    return panel(T('ov.map'), T('ov.map.i'), [el('div', { class: 'map-grid' }, [mapBox, nums])]);
  }
  // جوجل أدز في الرئيسية: الحملات · الكلمات ونتيجتنا (زيارة · تواصل · تم الاتفاق) · العبارات اللي اتكتبت فعلًا
  function adsPanel(a, sc) {
    var cur = a.currency === 'SAR' ? T('sar') : (a.currency || '');
    if (a.empty) return panel(T('ads.p.title'), T('ads.p.i'), [el('p', { class: 'muted', text: T('ads.p.first') })]);
    var t = a.totals;
    var strip = el('div', { class: 'ads-strip' }, [
      ['ads.s.impr', fmt(t.impressions)], ['ads.s.clicks', fmt(t.clicks)], ['ads.s.cost', money(t.cost, cur)], ['ads.s.cpc', money2(t.cpc, cur)], ['ads.s.invalid', fmt(t.invalid)], ['ads.s.conv', fmt(t.conversions)],
    ].map(function (x) { return el('div', {}, [el('span', { text: T(x[0]) }), el('b', { text: x[1] })]); }));
    var tbl = function (head, rows) { return el('div', { class: 'conv ads-tbl' }, [cardRows(el('table', { class: 'mini cards-m' }, [el('thead', {}, [el('tr', {}, head.map(function (h, i) { return el('th', { class: i ? 'n' : '', text: h }); }))]), el('tbody', {}, rows)]), head)]); };
    var camps = tbl([T('ads.h.campaign'), T('ads.s.clicks'), T('ads.s.cost'), T('ads.s.invalid'), T('ads.s.conv')], (a.campaigns || []).map(function (c) { return el('tr', {}, [el('td', {}, [el('b', { text: c.name })]), el('td', { class: 'n', text: fmt(c.clicks) }), el('td', { class: 'n', text: money(c.cost, cur) }), el('td', { class: 'n', text: fmt(c.invalid) }), el('td', { class: 'n', text: fmt(c.conversions) })]); }));
    var kws = tbl([T('ads.h.keyword'), T('ads.s.clicks'), T('ads.h.visits'), T('ads.h.contacts'), T('ads.h.won')].concat(sc ? [T('ads.h.bad')] : []).concat([T('ads.s.cost')]), (a.keywords || []).map(function (k) {
      return el('tr', { class: k.won ? 'conv-best' : '' }, [el('td', {}, [el('b', { text: k.keyword || T('ads.kw.none') }), /^(EXACT|PHRASE|BROAD)$/.test(k.match || '') ? el('small', { class: 'dim', text: ' · ' + T('ads.m.' + k.match.toLowerCase()) }) : null]), el('td', { class: 'n', text: fmt(k.clicks) }), el('td', { class: 'n', text: fmt(k.visits) }), el('td', { class: 'n', text: fmt(k.contacts) }), el('td', { class: 'n', text: fmt(k.won) })].concat(sc ? [el('td', { class: 'n', text: fmt(k.bad) })] : []).concat([el('td', { class: 'n', text: k.cost ? money(k.cost, cur) : '—' })]));
    }));
    var terms = tbl([T('ads.h.term'), T('ads.s.clicks'), T('ads.s.cost'), T('ads.s.conv')], (a.terms || []).map(function (x) { return el('tr', {}, [el('td', { text: x.term }), el('td', { class: 'n', text: fmt(x.clicks) }), el('td', { class: 'n', text: money(x.cost, cur) }), el('td', { class: 'n', text: fmt(x.conversions) })]); }));
    var sub = function (title, info, kids) { return el('div', { class: 'ads-sub' }, [el('h3', { class: 'legend', text: title }), info ? el('p', { class: 'hint', text: info }) : null].concat(kids)); };
    return panel(T('ads.p.title'), T('ads.p.i'), [
      el('p', { class: 'hint', text: T('ads.p.last', { d: a.last_day || '—' }) }), strip,
      sub(T('ads.p.keywords'), T('ads.p.keywords.i'), [(a.keywords || []).length ? kws : el('p', { class: 'muted', text: T('ads.p.none') })]),
      el('div', { class: 'grid-ov ads-two' }, [sub(T('ads.p.campaigns'), '', [(a.campaigns || []).length ? camps : el('p', { class: 'muted', text: T('ads.p.none') })]), sub(T('ads.p.terms'), T('ads.p.terms.i'), [(a.terms || []).length ? terms : el('p', { class: 'muted', text: T('ads.p.none') })])]),
    ]);
  }
  // مصادر الزيارات بالتفصيل (15 نوفمبر): المجموعة ← تحتها مين بالظبط (محرك · ذكاء اصطناعي · شبكة · موقع)
  var SRC_GROUP = { google_ads: 'google_ads', google_organic: 'google_organic', google: 'google_organic', google_maps: 'google_maps', maps: 'google_maps', search_other: 'search_other', bing: 'search_other', ai: 'ai',
    facebook: 'social', instagram: 'social', tiktok: 'social', snapchat: 'social', youtube: 'social', x: 'social', whatsapp: 'social', threads: 'social', linkedin: 'social', social_other: 'social', social: 'social',
    bing_ads: 'ads_other', tiktok_ads: 'ads_other', ads_other: 'ads_other', ads: 'ads_other', listening: 'listening', direct: 'direct' };
  function srcTree(sources) {
    var m = {}, out = [];
    (sources || []).forEach(function (x) { var k = SRC_GROUP[x.name] || 'other_site'; if (!m[k]) { m[k] = { key: k, n: 0, members: [] }; out.push(m[k]); } m[k].n += x.n; if (k === 'social' || k === 'ads_other') m[k].members.push({ key: x.name, label: null, n: x.n }); });
    return out.sort(function (a, b) { return b.n - a.n; });
  }
  function srcItem(x, pct) {
    var g = x.g || { members: [] }, mem = g.members || [];
    var head = [el('i', { class: 'sw ' + x.cls }), el('span', { text: x.label }), el('b', { text: pct + '%' })];
    if (!mem.length) return el('li', {}, head);
    var top = mem[0].n || 1;
    var list = el('ul', { class: 'src-m', hidden: '' }, mem.map(function (m) {
      var name = m.label || (m.key === 'unknown' ? T('srcg.unknown') : srcName(m.key));
      var fill = el('i', { class: x.cls }); fill.style.width = Math.max(4, Math.round(m.n / top * 100)) + '%';
      return el('li', {}, [el('span', { text: name }), el('i', { class: 'bar' }, [fill]), el('b', { text: fmt(m.n) })]);
    }));
    var btn = el('button', { type: 'button', class: 'src-g', 'aria-expanded': 'false' }, head.concat([el('em', { class: 'chev', 'aria-hidden': 'true' })]));
    btn.addEventListener('click', function () { var open = btn.getAttribute('aria-expanded') !== 'true'; btn.setAttribute('aria-expanded', open ? 'true' : 'false'); if (open) list.removeAttribute('hidden'); else list.setAttribute('hidden', ''); });
    return el('li', { class: 'has-m' }, [btn, list]);
  }
  function money2(n, cur) { return n == null || isNaN(n) ? '—' : (Math.round(n * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + (cur || ''); }
  // بطاقة بعنوان وعلامة ⓘ («اتحسب إزاي»)
  function panel(title, info, kids) {
    return el('section', { class: 'card' }, [el('div', { class: 'card-h' }, [el('h2', { text: title }), info ? el('button', { class: 'info', type: 'button', title: info, 'aria-label': info, text: 'i' }) : null])].concat(kids));
  }
  // كارت زيارة: الدرجة · المكان والوقت والمصدر · علامات الفحوصات · الحالة والتسجيل
  function visitCard(v, done) {
    var chips = el('div', { class: 'vchips' }, (v.checks || []).slice(0, 5).map(function (c) { return el('span', { class: 'vchip ' + (c.ok === true ? '' : c.ok === false ? 'bad' : 'na'), title: c.detail || '', text: (c.ok === true ? '✓ ' : c.ok === false ? '✗ ' : '— ') + c.label }); }));
    var card0 = el('div', { class: 'vcard', tabindex: '0', role: 'button', 'aria-label': placeOf(v) }, [
      v.score == null ? el('span', { class: 'score s-none' }, [el('b', { text: '—' })]) : scoreBadge(v),
      el('div', { class: 'vc-main' }, [el('b', { text: placeOf(v) || T('place.unknown') }), el('span', { class: 'vc-meta', text: timeAr(v.at) + ' · ' + srcName(v.src) + (v.kw ? ' «' + v.kw + '»' : '') + (v.dur != null ? ' · ' + LT.n(v.dur, 'second') : '') }), chips]),
      el('div', { class: 'vc-act' }, [v.live ? livePill(v) : pill(STATUS[v.status][0], STATUS[v.status][1]), v.replay ? replayLink(v) : null]),
    ]);
    var go = function () { if (v.live) openLiveVisit(v, done); else openVisit(v); };
    card0.addEventListener('click', function (e) { if (e.target.closest('a')) return; go(); });
    card0.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
    return card0;
  }
  // سطر زيارة مشبوهة: الدرجة + المكان + أول 3 أسباب + زرارين الحكم + الرحلة
  function suspectItem(v, done) {
    var real = el('button', { class: 'btn ghost sm', type: 'button', text: T('verdict.real') }), bad = el('button', { class: 'btn sm', type: 'button', text: T('verdict.fraud') }), open = el('button', { class: 'linkish', type: 'button', text: T('visit.journey_link') });
    real.addEventListener('click', function () { setVerdict(v, 'real', done); });
    bad.addEventListener('click', function () { setVerdict(v, 'fraud', done); });
    open.addEventListener('click', function () { openLiveVisit(v, done); });
    var why = v.reasons.filter(function (r) { return !/^(حكمك|Your review)/.test(r); });
    return el('div', { class: 'q-item' }, [
      el('div', { class: 'q-main' }, [el('div', {}, [el('b', { text: placeOf(v) }), el('span', { class: 'dim', text: ' · ' + timeAr(v.at) + ' · ' + srcName(v.src) + (v.dur != null ? ' · ' + LT.n(v.dur, 'second') : '') })]), el('ul', { class: 'why sm' }, why.slice(0, 3).map(function (r, i) { return el('li', { text: r, class: i ? 'pro-only' : '' }); }))]),
      el('div', { class: 'q-act' }, [scoreBadge(v), v.verdict ? livePill(v) : null, v.verdict ? null : real, v.verdict ? null : bad, v.replay ? replayLink(v) : null, open]),
    ]);
  }
  function lSimple(view) {
    return Promise.all([DATA.overview(state.site, 7), DATA.setup()]).then(function (res) {
      clear(view);
      var d = res[0], k = d.kpi, bad = (k.suspicious || 0) + (k.high || 0), site = res[1].filter(function (x) { return x.id === state.site; })[0] || res[1][0] || {};
      var ads = (d.sources.filter(function (x) { return x.name === 'google_ads'; })[0] || {}).n || 0;
      view.appendChild(el('div', { class: 'answers' }, [
        d.scoring ? el('div', { class: 'ans ' + (bad ? 'warn' : 'ok') }, [el('span', { class: 'q', text: T('ans.fraud.q') }), el('b', { class: 'a', text: bad ? LT.n(bad, 'svisit') : T('ans.fraud.none') }), el('span', { class: 's', text: bad ? T('ans.fraud.of', { n: LT.n(k.sessions, 'visit') }) + (k.pending ? ' ' + T('ans.fraud.pending', { n: fmt(k.pending) }) : '') + ' ' + T('ans.fraud.ads') : T('ans.fraud.watch') })])
          : el('div', { class: 'ans info' }, [el('span', { class: 'q', text: T('ans.protected.q') }), el('b', { class: 'a', text: T('ans.protected.a') }), el('span', { class: 's', text: T('ans.protected.s') })]),
        el('div', { class: 'ans ok' }, [el('span', { class: 'q', text: T('ans.visits.q') }), el('b', { class: 'a', text: LT.n(k.sessions, 'visit') }), el('span', { class: 's', text: ads ? T('ans.visits.ads', { n: fmt(ads) }) : T('ans.visits.all') })]),
        el('div', { class: 'ans info' }, [el('span', { class: 'q', text: T('ans.won.q') }), el('b', { class: 'a', text: LT.n(k.won, 'customer') }), el('span', { class: 's', text: T('ans.won.s', { n: fmt(k.contacts) }) + (k.open ? T('ans.won.open', { n: fmt(k.open) }) : '.') })]),
      ]));
      if (d.actions.length) view.appendChild(actionsCard(d.actions.slice(0, 3), true));
      var steps = [
        [T('steps.installed'), site.installed ? 'ok' : 'todo', 'sites'],
        [T('steps.plugin'), site.plugin ? 'ok' : 'todo', 'sites'],
        [T('steps.ads'), site.ads ? 'ok' : 'soon', 'sites'],
        [T('steps.watch'), d.scoring ? 'ok' : 'soon', 'protection'],
        [T('steps.block'), 'soon', 'protection'],
        [T('steps.app'), installed() ? 'ok' : 'todo', 'app'],
      ];
      var done = steps.filter(function (x) { return x[1] === 'ok'; }).length;
      var bar = el('i'); bar.style.width = Math.round((done / steps.length) * 100) + '%';
      var list = el('ul', { class: 'steps-check' });
      steps.forEach(function (x) {
        var li = el('li', { class: x[1] }, [el('i', { class: 'ck', text: x[1] === 'ok' ? '✓' : x[1] === 'soon' ? '…' : '' }), el('span', { text: x[0] })]);
        if (x[1] === 'soon') li.appendChild(pill(T('soon'), ''));
        else if (x[1] === 'todo') { var go = el(x[2] === 'app' ? 'button' : 'a', x[2] === 'app' ? { class: 'linkish', type: 'button', text: T('steps.how') } : { class: 'linkish', href: '#/' + x[2], text: T('steps.finish') }); if (x[2] === 'app') go.addEventListener('click', openInstall); li.appendChild(go); }
        list.appendChild(li);
      });
      view.appendChild(card(T('steps.title'), [el('div', { class: 'progress' }, [el('div', { class: 'p-bar' }, [bar]), el('b', { text: T('steps.of', { a: done, b: steps.length }) })]), list]));
      var story = T('story.base', { v: LT.n(k.sessions, 'visit'), ads: ads ? T('story.ads', { n: fmt(ads) }) : '', c: fmt(k.contacts), w: fmt(k.won) })
        + (d.scoring ? ' ' + (bad ? T('story.bad', { n: LT.n(bad, 'svisit') }) : T('story.clean')) : '')
        + (d.places[0] ? ' ' + T('story.place', { p: d.places[0].name }) : '');
      view.appendChild(card(T('story.title'), [el('p', { class: 'story', text: story }), el('button', { class: 'btn ghost sm', type: 'button', text: T('story.more') })]));
      view.querySelector('.story + .btn').addEventListener('click', function () { setLevel('detailed'); });
    });
  }
  function lStatement(view) {
    clear(view);
    view.appendChild(el('div', { class: 'callout' }, [el('b', { text: T('lst.title') }), el('span', { text: T('lst.text') })]));
    view.appendChild(soonCard(T('lst.soon'), [1, 2, 3, 4, 5].map(function (n) { return T('lst.' + n); })));
    return Promise.resolve();
  }
  function lProtection(view) {
    return DATA.protection(state.site, 7).then(function (p) {
      clear(view);
      if (p.soon || !p.stats) {
        view.appendChild(el('div', { class: 'callout' }, [el('b', { text: T('prot.soon.title') }), el('span', { text: T('prot.soon.text') })]));
        view.appendChild(soonCard(T('prot.soon.next'), [T('prot.soon.1'), T('prot.soon.2'), T('prot.soon.3')]));
        return;
      }
      var st = p.stats, bad = st.suspicious + st.high, np = p.pending.length;
      view.appendChild(el('p', { class: 'simple-only simple-line', text: T('prot.line', { all: LT.n(st.all, 'visit'), bad: fmt(bad) }) + ' ' + T(bad ? 'prot.line.bad' : 'prot.line.ok') + (np ? ' ' + T(np === 1 ? 'prot.line.ask1' : 'prot.line.ask') : '') }));
      view.appendChild(el('div', { class: 'callout pro-only' }, [el('b', { text: T('prot.mode.title') }), el('span', { text: T('prot.mode.text') })]));
      view.appendChild(el('div', { class: 'kpis four pro-only' }, [
        kpi(T('prot.k.reviewed'), fmt(st.all), T('prot.k.reviewed.sub'), 'info'),
        kpi(T('kpi.suspicious'), fmt(bad), T('kpi.high_of', { n: fmt(st.high) }), bad ? 'warn' : 'mute'),
        kpi(T('prot.k.ads'), fmt(st.ad_sessions), st.ad_sessions ? T('prot.k.ads.sub', { n: fmt(st.ad_bad), p: pct(st.ad_bad, st.ad_sessions) }) : T('prot.k.ads.none'), st.ad_bad ? 'warn' : 'ok'),
        kpi(T('kpi.review'), fmt(np), T(np ? 'prot.k.review.sub' : 'prot.k.review.none'), np ? 'warn' : 'ok'),
      ]));
      if (p.reasons.length) {
        var rc = el('div'); C.hbars(rc, p.reasons.map(function (r) { return { label: r.name, value: r.n, cls: 'c-sus' }; }), { compact: true });
        view.appendChild(card(T('prot.reasons'), [rc], 'pro-only'));
      }
      var redraw = function () { lProtection(view); };
      var q = el('div', { class: 'queue' });
      if (!np) q.appendChild(el('p', { class: 'muted', text: T('prot.queue.empty') }));
      // المبسّط: أهم 5 بس، والباقي بزرار
      var simple = state.level === 'simple', firstN = simple ? 5 : np;
      p.pending.slice(0, firstN).forEach(function (v) { q.appendChild(suspectItem(v, redraw)); });
      if (np > firstN) { var more = el('button', { class: 'btn ghost sm more-rows', type: 'button', text: T('prot.queue.more', { n: fmt(np - firstN) }) }); more.addEventListener('click', function () { more.remove(); p.pending.slice(firstN).forEach(function (v) { q.appendChild(suspectItem(v, redraw)); }); }); q.appendChild(more); }
      view.appendChild(card(T('kpi.review'), [el('p', { class: 'hint', text: T('prot.queue.hint') }), q]));
      if (p.decided.length) {
        var dq = el('div', { class: 'queue' });
        p.decided.forEach(function (v) {
          var back = el('button', { class: 'btn ghost sm', type: 'button', text: T('prot.undo') });
          back.addEventListener('click', function () { setVerdict(v, null, redraw); });
          dq.appendChild(el('div', { class: 'q-item' }, [el('div', { class: 'q-main' }, [el('b', { text: placeOf(v) }), el('span', { class: 'dim', text: ' · ' + timeAr(v.at) + ' · ' + srcName(v.src) })]), el('div', { class: 'q-act' }, [livePill(v), back])]));
        });
        view.appendChild(card(T('prot.decided'), [dq], 'pro-only'));
      }
      state.adsOn = !!p.ads;
      if (DATA.blocks) { var bx = el('div'); view.appendChild(bx); blocksCard(bx, redraw); }
    });
  }
  // الممنوعون في جوجل · أجهزتك المستثناة
  function blocksCard(box, redraw) {
    DATA.blocks(state.site).then(function (b) {
      clear(box);
      var rows = b.blocks.map(function (x) {
        var un = b.manage ? el('button', { class: 'linkish', type: 'button', text: T('bk.unblock') }) : null;
        if (un) un.addEventListener('click', function () { un.disabled = true; DATA.unblockIp(state.site, x.id).then(function () { toast(T('bk.unblocked')); redraw(); }, function () { un.disabled = false; toast(T('va.e.google')); }); });
        return el('li', {}, [el('span', { class: 'pill ' + (x.dc ? 'bad' : 'warn'), text: x.dc ? T('bk.dc') : T('bk.net') }), el('div', {}, [el('b', { class: 'ltr', text: x.ip }), el('small', { class: 'dim', text: (x.network ? x.network + ' · ' : '') + T('bk.until', { d: dateAr(x.expires_at) }) })]), un]);
      });
      var own = b.own.map(function (o) {
        var rm = el('button', { class: 'linkish', type: 'button', text: T('bk.own.remove') });
        rm.addEventListener('click', function () { DATA.ownDevice(state.site, null, o.id).then(function () { redraw(); }); });
        return el('li', {}, [el('span', { class: 'pill info', text: '📱' }), el('div', {}, [el('b', { text: o.label || T('bk.own.device') }), el('small', { class: 'dim', text: dateAr(o.created_at) })]), rm]);
      });
      box.appendChild(card(T('bk.title'), [el('p', { class: 'hint', text: T('bk.intro', { n: fmt(b.blocks.length), m: fmt(b.max) }) }),
        rows.length ? el('ul', { class: 'feed bk-list' }, rows) : el('p', { class: 'muted', text: state.adsOn === false ? T('bk.not_linked') : T('bk.none') }),
        el('h3', { class: 'legend', text: T('bk.own') }), own.length ? el('ul', { class: 'feed bk-list' }, own) : el('p', { class: 'muted', text: T('bk.own.none') })]));
    }, function () { clear(box); });
  }
  // ════════ تحليل الحملة وإصلاحها بضغطة (15 نوفمبر · المنهجية بند 10–12) ════════
  var AN_GO = { leads: 'leads', protection: 'protection', negatives: 'negatives', visits: 'visits' };
  // ── تحليل الحملة (إعادة تصميم 15 نوفمبر · محمود: «مهمة مش مفهومة · زوّد diagram · مع كل تشخيص اكتب الحل · صلّح الآن · ادخل ونفّذ ·
  //    خانة ملاحظات · ومراقبة نتيجة الإصلاح في التحويل مش الزيارات») ──
  // ١) الدرجة وأضعف حلقة · ٢) رسم القمع بالتحويل وأكبر تسريب · ٣) التشخيصات: المشكلة · ليه مهمة · الحل خطوة خطوة · صلّح الآن / ادخل ونفّذ /
  // نفّذته + ملاحظات · ٤) متابعة الإصلاحات: قبل وبعد لكل 100 زيارة · ٥) الأقسام بدرجاتها والسليم.
  function vAnalysis(view) {
    clear(view);
    if (!DATA.analysis) { view.appendChild(soonCard(T('nav.analysis'), [T('an.demo.1'), T('an.demo.2'), T('an.demo.3')])); return Promise.resolve(); }
    view.appendChild(el('div', { class: 'loading' }, [el('span', { class: 'spinner' }), document.createTextNode(T('an.running'))]));
    return DATA.analysis(state.site).then(function (d) { drawAnalysis(view, d); }, function () { clear(view); view.appendChild(el('p', { class: 'muted', text: T('an.err') })); });
  }
  function drawAnalysis(view, d) {
    clear(view);
    if (!d.linked) { view.appendChild(card(T('nav.analysis'), [el('p', {}, [el('span', { text: T('conv.not_linked') + ' ' }), el('a', { class: 'linkish', href: '#/sites', text: T('nav.sites') })])])); return; }
    var cur = d.currency === 'SAR' ? T('sar') : d.currency, fixes = d.fixes || [], fixedBy = {};
    fixes.forEach(function (f) { if (!fixedBy[f.key]) fixedBy[f.key] = f; });
    // ١) الدرجة
    var ring = el('div', { class: 'an-ring' }); C.ring(ring, d.score, { label: T('an.score'), text: String(d.score) });
    var weak = d.sections.filter(function (x) { return x.key === d.weakest; })[0];
    var again = el('button', { class: 'btn ghost sm', type: 'button', text: T('an.again') }); again.addEventListener('click', function () { vAnalysis(view); });
    view.appendChild(el('section', { class: 'panel-card an-hero' }, [ring, el('div', { class: 'an-hero-t' }, [
      el('h2', { text: T('an.title') }), el('p', { class: 'muted', text: T('an.sub2') }),
      weak ? el('p', { class: 'an-weak' }, [el('b', { text: T('an.weakest') + ' ' }), el('span', { text: T('an.s.' + weak.key) })]) : el('p', { class: 'an-weak ok', text: T('an.allgood') }),
      el('div', { class: 'an-meta' }, [el('small', { class: 'dim', text: T('an.at', { t: timeAr(d.at) }) }), again])])]));
    // ٢) القمع
    if (d.funnel) view.appendChild(funnelCard(d.funnel, d.leak, cur));
    // ٣) التشخيصات (المشاكل بس، بترتيب المنهجية، وأضعف قسم الأول)
    var probs = [];
    d.sections.forEach(function (sx, si) { sx.items.forEach(function (it) { if (it.status !== 'ok') probs.push({ it: it, sx: sx, si: si }); }); });
    var rank = { bad: 0, warn: 1, info: 2 };
    probs.sort(function (a, b) { return (a.sx.key === d.weakest ? -1 : 0) - (b.sx.key === d.weakest ? -1 : 0) || rank[a.it.status] - rank[b.it.status] || a.si - b.si; });
    var list = el('div', { class: 'an-dx-list' }, probs.map(function (p, i) { return dxCard(p.it, p.sx, i + 1, d, view, cur, fixedBy[p.it.key]); }));
    view.appendChild(el('section', { class: 'panel-card' }, [el('div', { class: 'sec-head' }, [el('h2', { text: T('an.dx.title', { n: probs.filter(function (p) { return p.it.status !== 'info'; }).length }) })]),
      el('p', { class: 'muted', text: T('an.dx.sub') }), probs.length ? list : el('p', { class: 'an-weak ok', text: T('an.allgood') })]));
    // ٤) متابعة الإصلاحات
    if (fixes.length) view.appendChild(fixesCard(fixes, cur));
    // ٥) الأقسام والسليم
    var oks = []; d.sections.forEach(function (sx) { sx.items.forEach(function (it) { if (it.status === 'ok') oks.push(it); }); });
    view.appendChild(el('section', { class: 'panel-card' }, [el('div', { class: 'sec-head' }, [el('h2', { text: T('an.secs') })]),
      el('ol', { class: 'an-bars' }, d.sections.map(function (sx) {
        var st = sx.items.some(function (x) { return x.status === 'bad'; }) ? 'bad' : sx.items.some(function (x) { return x.status === 'warn'; }) ? 'warn' : 'ok';
        var bar = el('i', { class: 'an-bar ' + st }, [el('i')]); bar.firstChild.style.width = Math.round(sx.score / sx.weight * 100) + '%';
        return el('li', { class: sx.key === d.weakest ? 'weakest' : '' }, [el('span', { text: T('an.s.' + sx.key) }), bar, el('b', { text: T('an.pts', { a: sx.score, b: sx.weight }) })]);
      })),
      oks.length ? el('details', { class: 'an-ok' }, [el('summary', { text: T('an.oks', { n: oks.length }) }), el('ul', {}, oks.map(function (it) { return el('li', { text: '✓ ' + T('an.i.' + it.code, anVars(it, cur)) }); }))]) : null]));
  }
  function anVars(it, cur) {
    var dd = it.data || {};
    return { n: fmt(dd.n), of: fmt(dd.of), p: dd.p, g: fmt(dd.g), won: fmt(dd.won), k: dd.k || '', w: dd.w || '', why: dd.why || '', blocks: fmt(dd.blocks), waste: money2(dd.waste, cur), off: dd.off, weak: fmt(dd.weak), disapproved: fmt(dd.disapproved),
      missing: (dd.missing || []).map(function (m) { return T('an.asset.' + m); }).join('، '), promise: dd.promise || '', fear: dd.fear || '', page: dd.page || '', visits: fmt(dd.visits), avg: dd.avg, score: dd.score, lcp: dd.lcp, campaign: dd.campaign || '', outside: fmt(dd.outside), done: fmt(dd.done), names: (dd.names || []).join('، ') };
  }
  // رسم القمع: كل خطوة بعددها ونسبتها من اللي قبلها · أكبر تسريب بالأحمر ومعاه القسم اللي بيصلحه
  function funnelCard(f, leak, cur) {
    var steps = [['visits', f.visits, null], ['real', f.real, 'visits'], ['contacts', f.contacts, 'real'], ['convos', f.convos, 'outcomes'], ['won', f.won, 'convos']];
    var max = Math.max(1, f.visits);
    var rows = steps.map(function (s) {
      var prev = s[2] ? f[s[2]] : null, rate = prev ? Math.round(s[1] / prev * 100) : null, isLeak = leak && leak.to === s[0];
      var bar = el('i', { class: 'fn-bar' }, [el('i')]); bar.firstChild.style.width = Math.max(2, Math.round(Math.sqrt(s[1] / max) * 100)) + '%';   // جذر: علشان «تم» الصغيرة تبان
      return el('li', { class: 'fn-step' + (isLeak ? ' leak' : '') }, [
        el('div', { class: 'fn-h' }, [el('span', { text: T('an.fn.' + s[0]) }), el('b', { text: fmt(s[1]) }), rate != null ? el('small', { class: 'dim', text: s[0] === 'convos' ? T('an.fn.of_out', { p: rate, n: fmt(f.outcomes) }) : T('an.fn.of', { p: rate }) }) : null,
          isLeak ? el('span', { class: 'pill bad', text: T('an.fn.leak') }) : null]),
        bar]);
    });
    var money = el('div', { class: 'fn-money' }, [
      el('div', {}, [el('span', { text: T('an.fn.cost') }), el('b', { text: money2(f.cost, cur) })]),
      el('div', {}, [el('span', { text: T('an.fn.cpc') }), el('b', { text: f.contacts ? money2(f.cost / f.contacts, cur) : '—' })]),
      el('div', {}, [el('span', { text: T('an.fn.cpw') }), el('b', { text: f.won ? money2(f.cost / f.won, cur) : '—' })])]);
    return el('section', { class: 'panel-card an-funnel' }, [el('div', { class: 'sec-head' }, [el('h2', { text: T('an.fn.title') })]), el('p', { class: 'muted', text: T('an.fn.sub') }),
      el('ol', { class: 'fn' }, rows), money,
      leak ? el('p', { class: 'fn-note bad' }, [el('b', { text: T('an.fn.leak') + ': ' }), el('span', { text: T('an.leak.' + leak.section, { p: leak.rate, b: leak.bench }) })]) : el('p', { class: 'fn-note ok', text: T('an.fn.noleak') }),
      f.outcomes < f.contacts / 2 ? el('p', { class: 'hint', text: T('an.fn.need_out', { n: fmt(f.contacts - f.outcomes) }) }) : null]);
  }
  // بطاقة تشخيص: المشكلة · ليه مهمة · الحل خطوة خطوة · التنفيذ (صلّح الآن في جوجل · ادخل ونفّذ · نفّذته) + ملاحظات
  function dxCard(it, sx, n, d, view, cur, done) {
    var v = anVars(it, cur), how = T('an.how.' + it.code), f = it.fix || {};
    var kids = [el('div', { class: 'dx-h' }, [el('span', { class: 'dx-n', text: String(n) }), el('span', { class: 'pill ' + (it.status === 'bad' ? 'bad' : it.status === 'warn' ? 'warn' : 'info'), text: T('an.st.' + it.status) }), el('small', { class: 'dim', text: T('an.s.' + sx.key) })]),
      el('p', { class: 'dx-what', text: T('an.i.' + it.code, v) })];
    if (T('an.f.' + it.code) !== 'an.f.' + it.code) kids.push(el('p', { class: 'dx-why' }, [el('b', { text: T('an.why') + ' ' }), el('span', { text: T('an.f.' + it.code, v) })]));
    if (how !== 'an.how.' + it.code) kids.push(el('div', { class: 'dx-how' }, [el('b', { text: T('an.how') }), el('ol', {}, T('an.how.' + it.code, v).split('|').map(function (x) { return el('li', { text: x }); }))]));
    if (done) {
      kids.push(el('p', { class: 'dx-done' }, [el('b', { text: T(done.mode === 'auto' ? 'an.done.auto' : 'an.done.manual', { d: dateAr(done.at) }) + ' ' }), el('span', { text: T('an.v.' + done.verdict) })]));
      return el('article', { class: 'dx ' + it.status + ' fixed' }, kids);
    }
    if (d.manage) {
      var acts = el('div', { class: 'dx-acts' }), noteBox = el('textarea', { class: 'dx-note', rows: '2', maxlength: '1000', placeholder: T('an.note.ph'), 'aria-label': T('an.note') }); noteBox.hidden = true;
      var addNote = el('button', { class: 'linkish', type: 'button', text: T('an.note.add') });
      addNote.addEventListener('click', function () { noteBox.hidden = !noteBox.hidden; if (!noteBox.hidden) noteBox.focus(); });
      if (f.action) {
        var b = el('button', { class: 'btn sm', type: 'button', text: T('an.fixnow') + ' · ' + T('an.do.' + f.action) }), sure = false;
        b.addEventListener('click', function () {
          if (!sure) { sure = true; b.textContent = T('an.do.sure'); return; }
          b.disabled = true;
          DATA.analysisFix(state.site, Object.assign({ key: it.key, note: noteBox.value.trim() }, f)).then(function () { toast(T('an.done.' + f.action) + ' ' + T('an.tracking')); vAnalysis(view); },
            function (e) { b.disabled = false; sure = false; b.textContent = T('an.fixnow') + ' · ' + T('an.do.' + f.action); toast(T('va.e.google') + (e.detail ? ' (' + String(e.detail).slice(0, 80) + ')' : '')); });
        });
        acts.appendChild(b);
      }
      if (f.go) acts.appendChild(el('a', { class: 'btn ghost sm', href: '#/' + (AN_GO[f.go] || 'overview'), text: T('an.goin', { p: T('an.go.' + f.go) }) }));
      if (it.status !== 'info' || f.go) {
        var mine = el('button', { class: 'btn ghost sm', type: 'button', text: T('an.mine') });
        mine.addEventListener('click', function () {
          mine.disabled = true;
          DATA.analysisDone(state.site, { code: it.code, key: it.key, note: noteBox.value.trim() }).then(function () { toast(T('an.mine.ok')); vAnalysis(view); }, function () { mine.disabled = false; toast(T('err.save')); });
        });
        acts.appendChild(mine);
      }
      acts.appendChild(addNote);
      kids.push(acts, noteBox);
    }
    return el('article', { class: 'dx ' + it.status }, kids);
  }
  // متابعة الإصلاحات: قبل (14 يوم) وبعد، لكل 100 زيارة · المقياس الأساسي «تم» ثم المحادثة ثم التواصل
  function fixesCard(fixes, cur) {
    var row = function (k, b, a, money, main) {
      var fmtv = function (x) { return x == null ? '—' : money ? money2(x, cur) : String(x); };
      var better = a != null && b != null && (money ? a < b : a > b), worse = a != null && b != null && (money ? a > b : a < b);
      return el('tr', { class: main ? 'main' : '' }, [el('th', { text: T('an.m.' + k) }), el('td', { text: fmtv(b) }), el('td', { class: better ? 'up' : worse ? 'down' : '', text: fmtv(a) })]);
    };
    return el('section', { class: 'panel-card an-fixes' }, [el('div', { class: 'sec-head' }, [el('h2', { text: T('an.fx.title') })]), el('p', { class: 'muted', text: T('an.fx.sub') }),
      el('div', { class: 'fx-list' }, fixes.map(function (f) {
        var tgt = f.target && (f.target.keyword || f.target.name) || (f.key.split(':')[1] || '');
        return el('article', { class: 'fx ' + f.verdict }, [
          el('div', { class: 'fx-h' }, [el('b', { text: T('an.c.' + f.code) !== 'an.c.' + f.code ? T('an.c.' + f.code) : f.code }), tgt ? el('span', { class: 'dim', text: '«' + tgt + '»' }) : null,
            el('span', { class: 'pill ' + (f.verdict === 'better' ? 'ok' : f.verdict === 'worse' ? 'bad' : f.verdict === 'same' ? 'info' : 'warn'), text: T('an.v.' + f.verdict) })]),
          el('small', { class: 'dim', text: T(f.mode === 'auto' ? 'an.done.auto' : 'an.done.manual', { d: dateAr(f.at) }) + (f.verdict === 'wait' ? ' · ' + T('an.v.wait.s', { n: f.days }) : ' · ' + T('an.v.days', { n: f.days })) }),
          f.note ? el('p', { class: 'fx-note', text: '📝 ' + f.note }) : null,
          el('div', { class: 'tbl-wrap' }, [el('table', { class: 'tbl fx-tbl' }, [el('thead', {}, [el('tr', {}, [el('th', { text: '' }), el('th', { text: T('an.fx.before') }), el('th', { text: T('an.fx.after') })])]), el('tbody', {}, [
            row('won_rate', f.before.won_rate, f.after.won_rate, false, f.metric === 'won_rate'), row('convo_rate', f.before.convo_rate, f.after.convo_rate, false, f.metric === 'convo_rate'),
            row('contact_rate', f.before.contact_rate, f.after.contact_rate, false, f.metric === 'contact_rate'), row('cost_contact', f.before.cost_contact, f.after.cost_contact, true), row('cost_won', f.before.cost_won, f.after.cost_won, true)])])]),
        ]);
      }))]);
  }
  // ════════ الفريق (G-29): مين يدخل حسابك وبيعمل إيه ════════
  var ROLE_AR = {}; ['owner', 'admin', 'staff', 'viewer'].forEach(function (r) { ROLE_AR[r] = [T('team.role.' + r), T('team.role.' + r + '.d')]; });
  // ── الاشتراك (الدفع، المرحلة 2 · 15 نوفمبر): حالتك · عرض المؤسسين · الباقات بعملة حسابك · التحويل بالإيصال · سجل المدفوعات ──
  var bill = { period: 'month', plan: null, method: null, receipt: null, units: {}, coupon: null };
  // اسم الباقة من البيانات (الأدمن بيكتبه) · الباقات القديمة ليها ترجمة احتياطية
  function planName(d, id) { var n = d && d.names && d.names[id], x = n && (LT.locale === 'en' ? n.en || n.ar : n.ar); if (x) return x; var k = 'bl.plan.' + id, t = T(k); return t === k ? id : t; }
  // سطور المزايا من الـ checklist: ✓ متاحة · ✗ مش في الباقة · الحدود برقمها أو «بلا حد»
  function legacyFeats(id) { var k = 'bl.f.' + id, t = T(k); return t === k ? [] : t.split('|').map(function (f) { return el('li', { text: f }); }); }
  function featLines(p) {
    var fs = p.features || [];
    if (!fs.length) return null;
    return fs.map(function (f) {
      var nm = LT.locale === 'en' ? f.name_en || f.name_ar : f.name_ar, txt = nm;
      if (f.kind === 'limit' && f.enabled) txt = T('bl.ff.lim', { n: nm, v: f.value == null ? T('bl.ff.unl') : fmt(f.value) + (f.unit_ar && LT.locale !== 'en' ? ' ' + f.unit_ar : f.unit_en ? ' ' + f.unit_en : '') });
      return el('li', { class: f.enabled ? 'yes' : 'no' }, [el('span', { class: 'sr', text: T(f.enabled ? 'bl.ff.yes' : 'bl.ff.no') }), el('span', { text: txt })]);
    });
  }
  function vBilling(view) {
    clear(view);
    if (!DATA.billing) { view.appendChild(soonCard(T('nav.billing'), [T('bl.demo.1'), T('bl.demo.2'), T('bl.demo.3')])); return Promise.resolve(); }
    var site = state.sites.filter(function (x) { return x.id === state.site; })[0];
    if (!site || !site.org_id) { view.appendChild(card(T('nav.billing'), [el('p', { class: 'muted', text: T('team.pick_site') })])); return Promise.resolve(); }
    return DATA.billing(site.org_id).then(function (d) { drawBilling(view, d, site.org_id); });
  }
  function curName(c) { var x = T('cur.' + c); return x === 'cur.' + c ? c : x; }
  function price2(n, c) { return (Math.round(n * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' ' + curName(c); }
  function drawBilling(view, d, org) {
    clear(view);
    var o = d.org, now = Date.now(), pend = (d.payments || []).filter(function (p) { return p.status === 'pending'; })[0];
    // ١) حالتك
    var st;
    if (o.status === 'active' && o.plan_period_end) {
      var left = Math.ceil((Date.parse(o.plan_period_end) - now) / 864e5);
      st = el('div', { class: 'bl-hero ok' }, [el('div', {}, [el('span', { class: 'bl-k', text: T('bl.now') }), el('b', { class: 'bl-v', text: planName(d, o.plan) }), el('span', { class: 'dim', text: T('bl.until', { d: dateAr(o.plan_period_end), n: LT.n(Math.max(0, left), 'day') }) })]), o.founder ? el('span', { class: 'bl-badge', text: T('bl.founder') }) : null]);
    } else {
      var tl = o.trial_ends_at ? Math.ceil((Date.parse(o.trial_ends_at) - now) / 864e5) : null, total = d.settings.trial_days || 7;
      var bar = el('i', { class: 'bl-bar' }, [el('i')]); bar.firstChild.style.width = (tl == null ? 100 : Math.max(0, Math.min(100, Math.round(((total - Math.max(0, tl)) / total) * 100)))) + '%';
      st = el('div', { class: 'bl-hero ' + (tl != null && tl <= 0 ? 'bad' : tl != null && tl <= 3 ? 'warn' : 'info') }, [el('div', {}, [el('span', { class: 'bl-k', text: T('bl.trial') }),
        el('b', { class: 'bl-v', text: tl == null ? T('bl.trial.on') : tl > 0 ? T('bl.trial.left', { n: LT.n(tl, 'day') }) : T('bl.trial.over') }), bar,
        el('span', { class: 'dim', text: tl != null && tl <= 0 ? T('bl.trial.over.s') : T('bl.trial.s') })])]);
    }
    view.appendChild(st);
    // ٢) عرض المؤسسين
    if (!o.founder && d.founders.left > 0 && d.founders.pct) {
      var used = d.founders.limit - d.founders.left, fb = el('i', { class: 'bl-bar' }, [el('i')]); fb.firstChild.style.width = Math.max(3, Math.round(used / d.founders.limit * 100)) + '%';
      view.appendChild(el('div', { class: 'bl-offer' }, [el('b', { text: T('bl.offer', { p: d.founders.pct }) }), el('span', { text: T('bl.offer.s', { m: LT.n(d.settings.founders_months, 'month'), a: d.settings.founders_after_pct }) }), fb, el('small', { text: T('bl.offer.left', { n: fmt(d.founders.left), l: fmt(d.founders.limit) }) })]));
    }
    // ٣) طلب مستني
    if (pend) view.appendChild(card(T('bl.pend.title'), [el('p', { class: 'bl-pend', text: T('bl.pend', { a: price2(pend.amount, pend.currency), p: planName(d, pend.plan) }) }), el('p', { class: 'hint', text: T('bl.pend.s') })]));
    // ٤) الباقات
    var seg = el('div', { class: 'seg bl-period', role: 'group' });
    [['month', T('bl.p.month')], ['year', T('bl.p.year', { n: LT.n(12 - d.settings.annual_months, 'month') })]].forEach(function (x) {
      var b = el('button', { type: 'button', 'aria-pressed': bill.period === x[0] ? 'true' : 'false', text: x[1] });
      b.addEventListener('click', function () { bill.period = x[0]; drawBilling(view, d, org); }); seg.appendChild(b);
    });
    var grid = el('div', { class: 'bl-plans' });
    d.plans.forEach(function (p) {
      var pr = p.price, yr = bill.period === 'year', now2 = yr ? pr.yearly_now : pr.monthly_now, was = yr ? pr.yearly : pr.monthly, proj = p.unit === 'project';
      var n = proj ? Math.max(p.min_units || 1, bill.units[p.id] || p.min_units || 1) : 1;
      var stepper = null;
      if (proj) {
        var minus = el('button', { type: 'button', class: 'st-b', 'aria-label': T('bl.units.less'), text: '−' }), plus = el('button', { type: 'button', class: 'st-b', 'aria-label': T('bl.units.more'), text: '+' });
        minus.disabled = n <= (p.min_units || 1);
        minus.addEventListener('click', function () { bill.units[p.id] = Math.max(p.min_units || 1, n - 1); drawBilling(view, d, org); });
        plus.addEventListener('click', function () { bill.units[p.id] = Math.min(500, n + 1); drawBilling(view, d, org); });
        stepper = el('div', { class: 'bl-units' }, [el('span', { text: T('bl.units') }), el('div', { class: 'st' }, [minus, el('b', { text: fmt(n) }), plus]), el('small', { class: 'dim', text: T('bl.units.total', { a: price2(now2 * n, pr.currency) }) })]);
      }
      var choose = el('button', { class: 'btn' + (bill.plan === p.id ? '' : ' ghost'), type: 'button', text: o.status === 'active' && o.plan === p.id ? T('bl.renew') : T('bl.choose') });
      choose.disabled = !!pend || !d.manage;
      choose.addEventListener('click', function () { bill.plan = p.id; bill.receipt = null; drawBilling(view, d, org); var c = document.getElementById('bl-checkout'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
      var best = p.badge || (p.badge === undefined && p.id === 'pro' ? T('bl.best') : null), fl = featLines(p);
      grid.appendChild(el('div', { class: 'bl-plan' + (best ? ' best' : '') + (bill.plan === p.id ? ' on' : '') }, [
        best ? el('span', { class: 'bl-tag', text: best }) : null,
        el('h3', { text: planName(d, p.id) }),
        el('div', { class: 'bl-price' }, [pr.discount ? el('s', { text: price2(was, pr.currency) }) : null, el('b', { text: price2(now2, pr.currency) }), el('span', { text: (proj ? T('bl.per.project') + ' ' : '') + (yr ? T('bl.per.year') : T('bl.per.month')) })]),
        pr.discount ? el('small', { class: 'bl-disc', text: p.discount_label ? T('bl.disc.l', { l: p.discount_label, p: pr.discount }) + (p.discount_ends_at ? ' · ' + T('bl.disc.ends', { d: dateAr(p.discount_ends_at) }) : '') : pr.source === 'founder' ? T('bl.disc.f', { p: pr.discount }) : T('bl.disc', { p: pr.discount }) }) : null,
        yr ? el('small', { class: 'dim', text: T('bl.year.eq', { m: price2(now2 / 12, pr.currency) }) }) : null,
        el('ul', { class: 'bl-feat' + (fl ? ' ck' : '') }, (proj ? [el('li', { text: T('bl.f.project', { c: LT.n(p.campaigns_per_unit || 2, 'campaign') }) }), el('li', { text: T('bl.f.min', { n: fmt(p.min_units || 1) }) })] : [])
          .concat(fl || (proj ? [] : [el('li', { text: T('bl.f.sites', { n: LT.n(p.sites, 'site') }) }), el('li', { text: T('bl.f.clicks', { n: fmt(p.clicks) }) })]).concat(legacyFeats(p.id)))),
        stepper,
        choose,
      ]));
    });
    var fxNote = d.pricing && d.pricing.mode === 'usd' && d.pricing.source ? el('p', { class: 'hint' }, [el('span', { text: T('bl.fx', { r: Number(d.pricing.rate).toLocaleString('en-US', { maximumFractionDigits: 2 }), c: curName(d.currency) }) + ' ' }), el('a', { href: d.pricing.source, target: '_blank', rel: 'noopener', text: 'Rates By Exchange Rate API' })]) : null;
    view.appendChild(card(T('bl.plans'), [el('p', { class: 'hint', text: T('bl.cur', { c: curName(d.currency) }) }), seg, grid, fxNote]));
    // ٥) الدفع
    if (bill.plan && !pend && d.manage) view.appendChild(checkout(view, d, org));
    if (!d.manage) view.appendChild(el('p', { class: 'muted', text: T('bl.owner_only') }));
    // ٦) السجل
    if ((d.payments || []).length) view.appendChild(card(T('bl.history'), [el('ul', { class: 'feed' }, d.payments.map(function (p) {
      return el('li', {}, [el('span', { class: 'pill ' + (p.status === 'approved' ? 'ok' : p.status === 'rejected' ? 'bad' : 'warn'), text: T('bl.s.' + p.status) }),
        el('div', {}, [el('span', { text: planName(d, p.plan) + (p.units > 1 ? ' · ' + LT.n(p.units, 'project') : '') + ' · ' + T(p.period === 'year' ? 'bl.p.year.short' : 'bl.p.month') + ' · ' + price2(p.amount, p.currency) }), p.reason ? el('small', { class: 'bad-text', text: T('bl.reason', { r: p.reason }) }) : null, p.period_end ? el('small', { class: 'dim', text: T('bl.until.short', { d: dateAr(p.period_end) }) }) : null]),
        el('time', { text: dateAr(p.at) })]);
    }))]));
  }
  function checkout(view, d, org) {
    var p = d.plans.filter(function (x) { return x.id === bill.plan; })[0], yr = bill.period === 'year';
    var units = p.unit === 'project' ? Math.max(p.min_units || 1, bill.units[p.id] || p.min_units || 1) : 1;
    var amount = Math.round((yr ? p.price.yearly_now : p.price.monthly_now) * units * 100) / 100;
    var ckey = p.id + '|' + bill.period + '|' + units, cp0 = bill.coupon && bill.coupon.key === ckey ? bill.coupon : null;
    if (bill.coupon && !cp0) bill.coupon = null;   // الكوبون بيتحسب تاني لو الباقة أو المدة أو العدد اتغيروا
    if (cp0 && cp0.better) amount = cp0.total;
    var box = el('section', { class: 'panel-card bl-pay', id: 'bl-checkout' }, [el('div', { class: 'sec-head' }, [el('h2', { text: T('bl.pay.title', { p: planName(d, p.id) }) + (units > 1 ? ' · ' + LT.n(units, 'project') : '') })])]);
    if (!d.methods.length) { box.appendChild(el('p', { class: 'muted', text: T('bl.no_methods') })); return box; }
    if (!bill.method || !d.methods.some(function (m) { return m.id === bill.method; })) bill.method = d.methods[0].id;
    var copy = function (txt) { return function () { (navigator.clipboard ? navigator.clipboard.writeText(String(txt)) : Promise.reject()).then(function () { toast(T('bl.copied')); }, function () { toast(T('tg.copy.manual')); }); }; };
    var cp = function (txt) { var b = el('button', { class: 'linkish', type: 'button', text: T('bl.copy') }); b.addEventListener('click', copy(txt)); return b; };
    // ① المبلغ بالظبط
    box.appendChild(el('div', { class: 'bl-step' }, [el('i', { class: 'bl-n', text: '1' }), el('div', {}, [el('b', { text: T('bl.s1') }), el('div', { class: 'bl-amount' }, [el('span', { text: price2(amount, p.price.currency) }), cp(amount)]), el('small', { class: 'dim', text: T('bl.s1.s') }), d.coupons ? couponRow(view, d, org, p, units, ckey, cp0) : null])]));
    // ② الوسيلة
    var opts = el('div', { class: 'bl-methods' });
    d.methods.forEach(function (m) {
      var on = bill.method === m.id, det = m.details || {}, lines = [];
      if (m.kind === 'instapay') lines.push(el('div', { class: 'bl-acc' }, [el('code', { text: det.handle || '' }), cp(det.handle || '')]));
      if (m.kind === 'vodafone_cash') (det.numbers || []).forEach(function (n) { lines.push(el('div', { class: 'bl-acc' }, [el('code', { text: n }), cp(n)])); });
      if (det.name) lines.push(el('small', { class: 'dim', text: T('bl.to', { n: det.name }) }));
      var r = el('input', { type: 'radio', name: 'bl-m', value: m.id }); r.checked = on;
      r.addEventListener('change', function () { bill.method = m.id; drawBilling(view, d, org); });
      opts.appendChild(el('label', { class: 'bl-m' + (on ? ' on' : '') }, [r, el('div', {}, [el('b', { text: m.label || T('bl.k.' + m.kind) })].concat(on ? lines : []))]));
    });
    box.appendChild(el('div', { class: 'bl-step' }, [el('i', { class: 'bl-n', text: '2' }), el('div', {}, [el('b', { text: T('bl.s2') }), opts])]));
    // ③ رقم العملية + ④ الإيصال
    var ref = el('input', { type: 'text', class: 'bl-ref', maxlength: '40', autocomplete: 'off', inputmode: 'text', placeholder: T('bl.ref.ph'), 'aria-label': T('bl.s3') });
    var file = el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', class: 'sr', id: 'bl-file' });
    var drop = el('label', { class: 'bl-drop', for: 'bl-file' }, [el('span', { text: T('bl.s4.pick') }), el('small', { class: 'dim', text: T('bl.s4.s') })]);
    var prev = el('img', { class: 'bl-prev', alt: T('bl.s4'), hidden: '' });
    file.addEventListener('change', function () {
      var f = file.files && file.files[0]; if (!f) return;
      if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { toast(T('bl.e.receipt')); return; }
      shrink(f).then(function (url) { bill.receipt = url; prev.src = url; prev.hidden = false; drop.firstChild.textContent = T('bl.s4.change'); }, function () { toast(T('bl.e.receipt')); });
    });
    box.appendChild(el('div', { class: 'bl-step' }, [el('i', { class: 'bl-n', text: '3' }), el('div', {}, [el('b', { text: T('bl.s3') }), ref, el('small', { class: 'dim', text: T('bl.s3.s') })])]));
    box.appendChild(el('div', { class: 'bl-step' }, [el('i', { class: 'bl-n', text: '4' }), el('div', {}, [el('b', { text: T('bl.s4') }), file, drop, prev])]));
    var send = el('button', { class: 'btn', type: 'button', text: T('bl.send', { a: price2(amount, p.price.currency) }) });
    send.addEventListener('click', function () {
      var r = ref.value.trim();
      if (!/^[A-Za-z0-9\-_.#/ ]{4,40}$/.test(r)) { toast(T('bl.e.ref')); ref.focus(); return; }
      if (!bill.receipt) { toast(T('bl.e.need')); return; }
      send.disabled = true; send.textContent = T('bl.sending');
      DATA.billingPay({ org: org, plan: p.id, period: bill.period, method_id: bill.method, ref: r, receipt: bill.receipt, units: units, coupon: cp0 && cp0.better ? cp0.code : undefined }).then(function () {
        bill.plan = null; bill.receipt = null; bill.coupon = null; toast(T('bl.sent')); render();
      }, function (e) { send.disabled = false; send.textContent = T('bl.send', { a: price2(amount, p.price.currency) }); var k = 'bl.e.' + e.message; toast(T(k) === k ? T('err.save') : T(k)); });
    });
    box.appendChild(el('div', { class: 'bl-go' }, [send, el('small', { class: 'dim', text: T('bl.go.s') })]));
    return box;
  }
  // كوبون الخصم: الخادم بيتحقق ويحسب · خصم واحد بس، الأحسن (لو الكوبون أقل من الخصم الحالي بنقول كده)
  function couponRow(view, d, org, p, units, ckey, cp0) {
    if (cp0) {
      var rm = el('button', { class: 'linkish', type: 'button', text: T('bl.cp.remove') });
      rm.addEventListener('click', function () { bill.coupon = null; drawBilling(view, d, org); });
      return el('div', { class: 'bl-cp ' + (cp0.better ? 'ok' : 'warn') }, [el('span', { text: cp0.better ? T('bl.cp.ok', { c: cp0.code, a: price2(cp0.off, p.price.currency) }) : T('bl.cp.notbetter', { c: cp0.code }) }), rm]);
    }
    var wrap = el('div', { class: 'bl-cp' }), open = el('button', { class: 'linkish', type: 'button', text: T('bl.cp.have') });
    open.addEventListener('click', function () {
      clear(wrap);
      var inp = el('input', { type: 'text', class: 'bl-ref', dir: 'ltr', maxlength: '30', autocomplete: 'off', placeholder: T('bl.cp.ph'), 'aria-label': T('bl.cp.ph') });
      var go = el('button', { class: 'btn ghost sm', type: 'button', text: T('bl.cp.apply') });
      var apply = function () {
        var code = inp.value.trim(); if (!code) { inp.focus(); return; }
        go.disabled = true;
        DATA.billingCoupon({ org: org, plan: p.id, period: bill.period, units: units, code: code }).then(function (q) {
          bill.coupon = { key: ckey, code: q.coupon.code, total: q.total, off: Math.round((q.base - q.total) * 100) / 100, better: q.source === 'coupon' };
          drawBilling(view, d, org);
        }, function (e) { go.disabled = false; var k = 'bl.cp.e.' + e.message; toast(T(k) === k ? T('bl.cp.e.coupon_invalid') : T(k)); inp.focus(); });
      };
      go.addEventListener('click', apply);
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') apply(); });
      wrap.appendChild(inp); wrap.appendChild(go); inp.focus();
    });
    wrap.appendChild(open);
    return wrap;
  }
  // تصغير صورة الإيصال في المتصفح قبل الرفع (أخف على باقة الجوال): أقصى ضلع 1600 · JPEG
  function shrink(f) {
    return new Promise(function (ok, no) {
      var rd = new FileReader();
      rd.onerror = no;
      rd.onload = function () {
        var img = new Image();
        img.onerror = no;
        img.onload = function () {
          var k = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement('canvas');
          c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          var out = c.toDataURL('image/jpeg', 0.85);
          ok(out.length < rd.result.length ? out : rd.result);
        };
        img.src = rd.result;
      };
      rd.readAsDataURL(f);
    });
  }
  function vTeam(view) {
    clear(view);
    if (!DATA.team) { view.appendChild(card(T('nav.team'), [el('p', { text: T('team.demo') })])); return Promise.resolve(); }
    var site = state.sites.filter(function (x) { return x.id === state.site; })[0];
    if (!site || !site.org_id) { view.appendChild(card(T('nav.team'), [el('p', { class: 'muted', text: T('team.pick_site') })])); return Promise.resolve(); }
    return DATA.team(site.org_id).then(function (t) {
      clear(view);
      if (t.forbidden) { view.appendChild(card(T('nav.team'), [el('p', { text: T('team.forbidden') })])); return; }
      var redraw = function () { vTeam(view); };
      var post = function (path, body, ok) { return DATA.teamPost(path, Object.assign({ org: t.org.id }, body)).then(function (r) { if (!r.ok) { toast(T(r.status === 403 ? 'team.err.role' : r.body.error === 'already_member' ? 'team.err.member' : r.body.error === 'email' ? 'team.err.email' : 'err.save')); return null; } if (ok) toast(ok); return r.body; }); };
      var sitesText = function (ids) { return !ids ? T('team.all_sites') : ids.map(function (id) { var c = t.sites.filter(function (x) { return x.id === id; })[0]; return c ? c.name : id; }).join(T('list.sep')); };
      view.appendChild(el('p', { class: 'simple-line', text: T('team.line', { o: t.org.name, n: LT.n(t.members.length, 'person') }) + (t.invites.length ? T('team.line.inv', { n: LT.n(t.invites.length, 'invite') }) : '.') }));
      // الأعضاء
      var tb = el('tbody');
      t.members.forEach(function (m) {
        var manage = m.role !== 'owner' && !(m.role === 'admin' && t.my_role !== 'owner');
        var roleCell = manage ? el('select', { 'aria-label': T('team.h.role') }, ['admin', 'staff', 'viewer'].filter(function (r) { return r !== 'admin' || t.my_role === 'owner'; }).map(function (r) { return el('option', { value: r, text: ROLE_AR[r][0] }); })) : pill(ROLE_AR[m.role][0], m.role === 'owner' ? 'ok' : '');
        if (manage) { roleCell.value = m.role; roleCell.addEventListener('change', function () { post('member', { user_id: m.user_id, role: roleCell.value }, T('team.role.changed')).then(redraw); }); }
        var rm = manage ? el('button', { class: 'btn ghost sm', type: 'button', text: T('team.remove') }) : null;
        if (rm) rm.addEventListener('click', function () { if (rm.getAttribute('data-sure') !== '1') { rm.setAttribute('data-sure', '1'); rm.textContent = T('team.sure'); return; } post('member', { user_id: m.user_id, remove: true }, T('team.removed')).then(redraw); });
        var sitesCell = el('td', { 'data-l': T('team.h.sites') }, [document.createTextNode(m.role === 'owner' ? T('team.all_sites') : sitesText(m.site_ids))]);
        if (manage && t.sites.length > 1) { var ed = el('button', { class: 'linkish', type: 'button', text: T('team.edit') }); ed.addEventListener('click', function () { var p = sitePicker(t.sites, m.site_ids), ok = el('button', { class: 'btn sm', type: 'button', text: T('save') }); ok.addEventListener('click', function () { var v = p.value(); if (v === false) { toast(T('team.pick_one')); return; } post('member', { user_id: m.user_id, site_ids: v }, T('saved')).then(redraw); }); clear(sitesCell).appendChild(el('div', {}, [p, ok])); }); sitesCell.appendChild(ed); }
        tb.appendChild(el('tr', {}, [el('td', { class: 'first' }, [el('b', { text: m.name || m.email }), el('div', { class: 'dim', dir: 'ltr', text: m.email + (m.you ? ' ' + T('team.you') : '') })]), el('td', { 'data-l': T('team.h.role') }, [roleCell]), sitesCell, el('td', { class: 'last' }, [rm])]));
      });
      view.appendChild(card(T('team.who'), [el('div', { class: 'tbl-wrap' }, [el('table', { class: 'tbl static' }, [el('thead', {}, [el('tr', {}, [T('team.h.person'), T('team.h.role'), T('team.h.sites'), ''].map(function (h) { return el('th', { text: h }); }))]), tb])])]));
      // دعوة
      var email = el('input', { type: 'email', dir: 'ltr', placeholder: 'name@gmail.com', autocomplete: 'off' });
      var roles = ['staff', 'viewer'].concat(t.my_role === 'owner' ? ['admin'] : []);
      var roleSel = el('div', { class: 'opts', role: 'radiogroup', 'aria-label': T('team.h.role') }), chosen = 'staff';
      roles.forEach(function (r) { var i = el('input', { type: 'radio', name: 'tm-role', value: r }); i.checked = r === chosen; i.addEventListener('change', function () { chosen = r; }); roleSel.appendChild(el('label', { class: 'opt' }, [i, el('span', {}, [el('b', { text: ROLE_AR[r][0] }), el('small', { text: ROLE_AR[r][1] })])])); });
      var picker = sitePicker(t.sites, null), send = el('button', { class: 'btn', type: 'button', text: T('team.invite.send') }), result = el('div', { class: 'invite-result', hidden: '' });
      send.addEventListener('click', function () {
        var v = picker.value();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value.trim())) { toast(T('team.err.email2')); return; }
        if (v === false) { toast(T('team.pick_one')); return; }
        send.disabled = true;
        post('invite', { email: email.value.trim(), role: chosen, site_ids: v }).then(function (b) {
          send.disabled = false; if (!b) return;
          if (b.added) { toast(T('team.added_now')); redraw(); return; }
          var msg = T('team.msg', { o: t.org.name, url: location.origin + '/login', e: email.value.trim() });
          clear(result); result.hidden = false;
          var cp = el('button', { class: 'btn ghost sm', type: 'button', text: T('team.copy') });
          cp.addEventListener('click', function () { if (navigator.clipboard) navigator.clipboard.writeText(msg).then(function () { toast(T('team.copied')); }); });
          result.appendChild(el('p', { text: T('team.send_it') })); result.appendChild(el('p', { class: 'msg-box', text: msg })); result.appendChild(cp);
          toast(T('team.invited')); email.value = '';
        });
      });
      view.appendChild(card(T('team.invite'), [el('label', { class: 'fld' }, [el('span', { text: T('team.email') }), email]), el('div', { class: 'fld' }, [el('span', { text: T('team.h.role') }), roleSel]), t.sites.length > 1 ? el('div', { class: 'fld' }, [el('span', { text: T('team.which_sites') }), picker]) : null, el('div', { class: 'row-btns' }, [send]), result,
        el('p', { class: 'hint', text: T('team.invite.hint') })]));
      // دعوات مستنية
      if (t.invites.length) {
        var ul = el('ul', { class: 'team-list' });
        t.invites.forEach(function (i) { var c = el('button', { class: 'btn ghost sm', type: 'button', text: T('cancel') }); c.addEventListener('click', function () { post('invite/cancel', { id: i.id }, T('team.inv_cancelled')).then(redraw); }); ul.appendChild(el('li', {}, [el('div', {}, [el('b', { dir: 'ltr', text: i.email }), el('span', { class: 'dim', text: ' · ' + ROLE_AR[i.role][0] + ' · ' + sitesText(i.site_ids) + (i.expired ? ' · ' + T('team.expired') : '') })]), c])); });
        view.appendChild(card(T('team.pending'), [ul]));
      }
    });
  }
  // كل المواقع ولا مواقع معيّنة. value(): null = كل المواقع · [ids] · false لو اختار «معيّنة» ومااختارش
  function sitePicker(sites, init) {
    var mode = init ? 'some' : 'all', picked = (init || []).slice(), list = el('div', { class: 'scope-list' }), nm = 'sp' + Math.random().toString(36).slice(2, 7);
    var modes = el('div', { class: 'scope-modes' }, [['all', T('team.all_sites')], ['some', T('team.some_sites')]].map(function (x) { var r = el('input', { type: 'radio', name: nm, value: x[0] }); r.checked = mode === x[0]; r.addEventListener('change', function () { mode = x[0]; draw(); }); return el('label', { class: 'ck-in' }, [r, el('span', { text: x[1] })]); }));
    function draw() { clear(list); list.hidden = mode === 'all'; sites.forEach(function (c) { var k = el('input', { type: 'checkbox', value: c.id }); k.checked = picked.indexOf(c.id) >= 0; k.addEventListener('change', function () { var i = picked.indexOf(c.id); if (k.checked && i < 0) picked.push(c.id); if (!k.checked && i >= 0) picked.splice(i, 1); }); list.appendChild(el('label', { class: 'ck-in' }, [k, el('span', { text: c.name + (c.domain ? ' · ' + c.domain : '') })])); }); }
    var box = el('div', { class: 'scope' }, [modes, list]); draw();
    box.value = function () { return mode === 'all' ? null : picked.length ? picked.slice() : false; };
    return box;
  }

  var LIVE_VIEWS = { overview: lOverview, statement: lStatement, protection: lProtection };

  var VIEWS = { overview: lOverview, clients: vClients, statement: vStatement, visits: vVisits, protection: vProtection, negatives: vNegatives, leads: vLeads, alerts: vAlerts, reports: vReports, sites: vSites, team: vTeam, billing: vBilling, analysis: vAnalysis };

  // ── الدرج ──
  var lastFocus = null;
  function setFoot(node) { var f = clear($('d-foot')); if (node) { f.appendChild(node); f.hidden = false; } else f.hidden = true; }
  function openDrawer() { lastFocus = document.activeElement; $('scrim').hidden = false; $('drawer').hidden = false; document.body.style.overflow = 'hidden'; $('d-close').focus(); }
  function closeDrawer() { $('scrim').hidden = true; $('drawer').hidden = true; document.body.style.overflow = ''; setFoot(null); if (lastFocus && lastFocus.focus) lastFocus.focus(); }

  function start() {
    $('d-close').addEventListener('click', closeDrawer);
    $('scrim').addEventListener('click', closeDrawer);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('drawer').hidden) closeDrawer(); });
    window.addEventListener('hashchange', function () { closeDrawer(); render(); });
    var boot = DATA.init ? DATA.init() : Promise.resolve(null);
    setTimeout(hideBoot, 8000);   // أمان: شاشة البداية ماتعلقش أبدًا
    boot.then(function (m) {
      if (DATA.init && !m) { location.replace('/login'); return; }
      if (m) {
        var stored = null; try { stored = sessionStorage.getItem('lt_level'); } catch (e) { /* عادي */ }
        if (!stored) state.level = (m.orgs || []).some(function (o) { return o.type === 'agency'; }) ? 'detailed' : 'simple';
        var who = $('who'); if (who) who.textContent = m.user.name || m.user.email || '';
        var out = $('out'); if (out) { out.hidden = false; out.addEventListener('click', function () { LT.logout().then(function () { location.replace('/login'); }); }); }
        var adm = $('admin-link'); if (adm && m.user.platform_admin) adm.hidden = false;
        state.admin = !!m.user.platform_admin;
      }
      return DATA.sites().then(function (s) {
        state.sites = s; state.site = s[0] && s[0].id;
        var want = null; try { want = new URLSearchParams(location.search).get('site'); } catch (e) { /* عادي */ }
        if (want && s.some(function (x) { return x.id === want; })) state.site = want;      // من «افتح لوحته» في لوحة الإدارة
        // راجع من موافقة جوجل أدز (خدمة الربط): ?site=…&ads=<رقم الطلب> ← اختيار الحساب في المواقع والتثبيت، والعنوان بيتنضف
        var adsN = null; try { adsN = new URLSearchParams(location.search).get('ads'); } catch (e) { /* عادي */ }
        if (adsN && /^[a-f0-9]{48}$/.test(adsN) && DATA.adsAccounts) { state.adsNonce = adsN; try { history.replaceState(null, '', location.pathname + '#/sites'); } catch (e) { /* عادي */ } location.hash = '#/sites'; }
        buildNav(); buildTop();
        if (!s.length && DATA.live) { location.hash = '#/sites'; }
        render(); hideBoot();
      });
    }).catch(function () { var v = clear($('view')); v.appendChild(card(T('frame.load_fail'), [el('p', { text: T('frame.load_fail_hint') })])); });
  }
  start();
})();
