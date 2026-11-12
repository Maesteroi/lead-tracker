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
    leads: 'M16 19v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1M9.5 10a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM17 11l2 2 4-4',
    alerts: 'M18 16V11a6 6 0 10-12 0v5l-2 2h16l-2-2zM10 20a2 2 0 004 0',
    sites: 'M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
    more: 'M5 12h.01M12 12h.01M19 12h.01',
    clients: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
    reports: 'M7 3h7l5 5v13H7zM14 3v5h5M10 17v-3M13 17v-6M16 17v-2',
    team: 'M9 11a4 4 0 100-8 4 4 0 000 8zM2 21v-1a6 6 0 0112 0v1M16 3.5a4 4 0 010 7.5M22 21v-1a6 6 0 00-4-5.6',
  };
  function icon(name) {
    var svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('class', 'ic'); svg.setAttribute('aria-hidden', 'true');
    var p = document.createElementNS(NS, 'path'); p.setAttribute('d', ICONS[name]); svg.appendChild(p); return svg;
  }

  var T = LT.t;   // النصوص من ملف اللغة (js/lang/*.js)
  var ROUTES = ['overview', 'clients', 'statement', 'visits', 'protection', 'leads', 'alerts', 'reports', 'sites', 'team'].map(function (k) { return [k, T('nav.' + k)]; });
  var NAV = { simple: ['overview', 'leads', 'protection', 'alerts', 'sites', 'team'], detailed: ROUTES.map(function (r) { return r[0]; }) };
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
  function demoAct(msg) { toast(DATA.demo ? msg + ' (في اللوحة التجريبية مابيتنفذش فعلاً)' : msg); }
  function scoreBadge(v) { return el('span', { class: 'score s-' + v.status, title: 'درجة الخطر من 100' }, [el('b', { text: String(v.score) })]); }

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
  }
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
    var seg = clear($('range'));
    [1, 7, 30].map(function (d) { return [d, T('range.' + d)]; }).forEach(function (r) {
      var b = el('button', { type: 'button', 'aria-pressed': String(state.range === r[0]), text: r[1] });
      b.addEventListener('click', function () { state.range = r[0]; buildTop(); render(); });
      seg.appendChild(b);
    });
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
    $('range').hidden = r === 'protection' || r === 'alerts' || r === 'sites' || r === 'reports' || r === 'team' || (r === 'overview' && state.level === 'simple');
    $('site').parentNode.hidden = r === 'clients';
    if (r === 'overview' && state.level === 'simple') $('page-title').textContent = T('nav.overview.simple');
    if (state.level === 'simple' && NAV.simple.indexOf(r) < 0) { /* شاشة تفصيلية من رابط: بتتفتح عادي */ }
    view.appendChild(el('div', { class: 'loading' }, [el('span', { class: 'spinner' }), document.createTextNode(T('frame.loading'))]));
    (r === 'overview' && state.level === 'simple' ? (DATA.live ? lSimple : vSimple) : (DATA.live && LIVE_VIEWS[r]) || VIEWS[r])(view).then(function () { var l = view.querySelector('.loading'); if (l) l.remove(); window.scrollTo(0, 0); });
  }

  // ════════ 1) الرئيسية ════════
  function vOverview(view) {
    return DATA.overview(state.site, state.range).then(function (d) {
      clear(view);
      var k = d.kpi, p = d.prev, cur = d.currency;
      // شريط الحالة
      view.appendChild(el('div', { class: 'status-strip' }, [
        el('span', { class: 'st ok' }, [el('i', { class: 'dot live' }), document.createTextNode('الحماية شغالة')]),
        el('span', { class: 'st ' + (d.status.delivery >= 99.5 ? 'ok' : 'warn') }, [el('i', { class: 'dot' }), document.createTextNode('التتبع: وصل ' + d.status.delivery + '% من الأحداث')]),
        el('span', { class: 'st ' + (d.status.ads ? 'ok' : 'warn') }, [el('i', { class: 'dot' }), document.createTextNode(d.status.ads ? 'جوجل أدز متربط' : 'جوجل أدز مش متربط')]),
        el('a', { class: 'st live-now', href: '#/visits' }, [el('i', { class: 'dot live' }), document.createTextNode(d.live + ' زوار دلوقتي')]),
      ]));
      // الأرقام
      view.appendChild(el('div', { class: 'kpis' }, [
        kpi('ضغطات جوجل حاسبها', fmt(k.billed), money(k.cost, cur) + ' صرف', 'info', delta(k.billed, p.billed, true)),
        kpi('زوار حقيقيين', fmt(k.real), pct(k.real, k.real + k.suspicious + k.blocked) + '% من الزيارات', 'ok', delta(k.real, p.real, true)),
        kpi('مشبوه', fmt(k.suspicious), 'تحت المراقبة', 'warn', delta(k.suspicious, p.suspicious, false)),
        kpi('اتحظر', fmt(k.blocked), 'على الموقع وجوجل', 'bad', delta(k.blocked, p.blocked, false)),
        kpi('فلوس اتحمت', money(k.saved, cur), 'ضغطات مشبوهة ماكملتش', 'ok', delta(k.saved, p.saved, null)),
        kpi('عملاء حقيقيين', fmt(k.won), k.cpl ? 'العميل بـ' + money(k.cpl, cur) : 'من ' + k.leads + ' تواصل', 'ok'),
      ]));
      // تعمل إيه دلوقتي
      var acts = el('div', { class: 'actions' });
      d.actions.forEach(function (a) {
        var m = a.kind === 'approve' ? ['protection', 'warn', a.n + ' مشبوهين مستنيين موافقتك', 'اعتمدهم لجوجل علشان مايظهرلهمش إعلانك تاني', 'راجعهم']
          : a.kind === 'outcome' ? ['leads', 'info', a.n + ' تواصل من غير نتيجة', 'سجّل اتفقت ولا لأ علشان نحسب تكلفة العميل الحقيقي', 'سجّل']
          : a.kind === 'refund' ? ['protection', 'ok', 'ملف استرداد جاهز (~' + money(a.amount, cur) + ')', 'الأدلة جاهزة تتبعت لجوجل', 'افتح الملف']
          : ['sites', 'warn', 'لاحقة التتبع ناقصة في حساب الإعلانات', 'من غيرها مش هنعرف الكلمة اللي جابت كل ضغطة', 'صلّحها'];
        acts.appendChild(el('a', { class: 'act ' + m[1], href: '#/' + m[0] }, [el('b', { text: m[2] }), el('span', { text: m[3] }), el('em', { text: m[4] + ' ‹' })]));
      });
      if (d.actions.length) view.appendChild(card('تعمل إيه دلوقتي', [acts]));
      // جودة الزيارات
      var ch = el('div');
      C.stacked(ch, d.days, [{ key: 'real', label: 'حقيقي', cls: 'c-real' }, { key: 'suspicious', label: 'مشبوه', cls: 'c-sus' }, { key: 'blocked', label: 'اتحظر', cls: 'c-blk' }], { label: 'جودة الزيارات كل يوم' });
      var grid = el('div', { class: 'grid-2' }, [
        card('جودة الزيارات كل يوم', [el('p', { class: 'hint', text: 'العمود العالي فجأة = هجوم. شوف الأيام اللي المشبوه زاد فيها والحماية وقفته.' }), ch], 'span-2'),
      ]);
      view.appendChild(grid);
      // آخر المشبوهين + أكتر أماكن
      var sus = el('ul', { class: 'feed' });
      d.suspicious.forEach(function (v) {
        var li = el('li', { tabindex: '0' }, [scoreBadge(v), el('div', {}, [el('b', { text: v.city + ' · ' + v.district + ' — ' + srcName(v.src) }), el('span', { text: v.reasons[0] || '' })]), el('time', { text: timeAr(v.at) })]);
        li.addEventListener('click', function () { openVisit(v); });
        li.addEventListener('keydown', function (e) { if (e.key === 'Enter') openVisit(v); });
        sus.appendChild(li);
      });
      var pl = el('div');
      C.hbars(pl, d.places.map(function (x) { return { label: x.name, value: x.n, cls: 'c-sus' }; }), { compact: true });
      view.appendChild(el('div', { class: 'grid-2' }, [card('آخر المشبوهين', [sus, el('a', { class: 'linkish', href: '#/visits', text: 'كل الزيارات ‹' })]), card('منين بتيجي الضغطات المشبوهة (مدينة · حي)', [pl])]));
    });
  }

  // ════════ الخلاصة (المستوى البسيط لصاحب البزنس) ════════
  // 3 إجابات كبيرة · «تعمل إيه دلوقتي» (3 بالكتير) · «حمايتك كاملة؟» · ملخص الأسبوع بالكلام. من غير جداول.
  function installed() { try { return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; } catch (e) { return false; } }
  function vSimple(view) {
    return Promise.all([DATA.overview(state.site, 7), DATA.setup(), DATA.protection(state.site)]).then(function (res) {
      clear(view);
      var d = res[0], k = d.kpi, cur = d.currency, site = res[1].filter(function (x) { return x.id === state.site; })[0] || res[1][0], prot = res[2];
      var pend = prot.pending.length;
      var safe = !d.status.ads || !site.installed ? 'bad' : (pend || !d.status.tracking_template || d.status.delivery < 99.5) ? 'warn' : 'ok';
      var safeText = safe === 'ok' ? 'أيوه، إعلانك محمي' : safe === 'warn' ? 'محمي، بس محتاج منك حاجة' : 'لأ، الحماية مش كاملة';
      var safeSub = safe === 'ok' ? 'بنفحص كل ضغطة وبنحظر المحتالين لوحدنا.' : pend ? pend + ' مشبوهين مستنيين موافقتك علشان نمنعهم من جوجل.' : !d.status.tracking_template ? 'ناقص خطوة في حساب الإعلانات (لاحقة التتبع).' : 'اربط جوجل أدز وركّب الكود علشان الحماية تشتغل.';
      view.appendChild(el('div', { class: 'answers' }, [
        el('div', { class: 'ans ' + safe }, [el('span', { class: 'q', text: 'إعلانك محمي؟' }), el('b', { class: 'a', text: safeText }), el('span', { class: 's', text: safeSub })]),
        el('div', { class: 'ans ok' }, [el('span', { class: 'q', text: 'اتحمى من فلوسك كام؟ (آخر 7 أيام)' }), el('b', { class: 'a', text: money(k.saved, cur) }), el('span', { class: 's', text: 'وقفنا ' + fmt(k.suspicious + k.blocked) + ' ضغطة مشبوهة قبل ما تكمّل.' })]),
        el('div', { class: 'ans info' }, [el('span', { class: 'q', text: 'جالك كام عميل حقيقي؟' }), el('b', { class: 'a', text: fmt(k.won) + ' عميل' }), el('span', { class: 's', text: k.cpl ? 'العميل الواحد كلّفك ' + money(k.cpl, cur) + ' من الإعلانات.' : fmt(k.leads) + ' تواصل، مستنيين نتيجتهم.' })]),
      ]));
      // تعمل إيه دلوقتي (3 بالكتير)
      var acts = el('div', { class: 'actions' });
      d.actions.slice(0, 3).forEach(function (a) {
        var m = a.kind === 'approve' ? ['protection', 'warn', 'وافق على ' + a.n + ' مشبوهين', 'ضغطة واحدة لكل واحد، ومش هيشوفوا إعلانك تاني', 'وافق']
          : a.kind === 'outcome' ? ['leads', 'info', 'قولنا ' + a.n + ' عملاء اتفقوا ولا لأ', 'علشان نقولك العميل الحقيقي بكام بالظبط', 'سجّل']
          : a.kind === 'refund' ? ['protection', 'ok', 'اطلب فلوسك من جوجل (~' + money(a.amount, cur) + ')', 'الملف جاهز بالأدلة', 'افتح']
          : ['sites', 'warn', 'خطوة ناقصة في حساب الإعلانات', 'من غيرها مش هنعرف أنهي كلمة جابت كل زبون', 'إزاي'];
        acts.appendChild(el('a', { class: 'act ' + m[1], href: '#/' + m[0] }, [el('b', { text: m[2] }), el('span', { text: m[3] }), el('em', { text: m[4] + ' ‹' })]));
      });
      if (d.actions.length) view.appendChild(card('تعمل إيه دلوقتي', [acts]));
      // حمايتك كاملة؟
      var steps = [
        ['كود Maestro متركب على موقعك', site.installed, 'sites'],
        ['حساب جوجل أدز متربط', site.ads, 'sites'],
        ['لاحقة التتبع في حساب الإعلانات', site.template, 'sites'],
        ['أجهزتك معفية (ضغطاتك مابتتحسبش)', site.own > 0, 'protection'],
        ['تنبيهات تليجرام شغالة', true, 'alerts'],
        ['التطبيق على موبايلك', installed(), 'app'],
      ];
      var done = steps.filter(function (x) { return x[1]; }).length;
      var bar = el('i'); bar.style.width = Math.round((done / steps.length) * 100) + '%';
      var list = el('ul', { class: 'steps-check' });
      steps.forEach(function (x) {
        var li = el('li', { class: x[1] ? 'ok' : 'todo' }, [el('i', { class: 'ck', text: x[1] ? '✓' : '' }), el('span', { text: x[0] })]);
        if (!x[1]) {
          var go = el(x[2] === 'app' ? 'button' : 'a', x[2] === 'app' ? { class: 'linkish', type: 'button', text: 'إزاي؟' } : { class: 'linkish', href: '#/' + x[2], text: 'كمّلها ‹' });
          if (x[2] === 'app') go.addEventListener('click', openInstall);
          li.appendChild(go);
        }
        list.appendChild(li);
      });
      view.appendChild(card('حمايتك كاملة؟', [el('div', { class: 'progress' }, [el('div', { class: 'p-bar' }, [bar]), el('b', { text: done + ' من ' + steps.length })]), list]));
      // ملخص الأسبوع بالكلام
      var p = d.prev, better = k.suspicious + k.blocked <= (p.suspicious + p.blocked);
      view.appendChild(card('الأسبوع ده باختصار', [el('p', { class: 'story', text:
        'جالك ' + fmt(k.real) + ' زائر حقيقي من إعلاناتك ومن جوجل، ' + fmt(k.leads) + ' منهم كلّموك واتساب أو اتصال، و' + fmt(k.won) + ' اتفقوا معاك' + (k.cpl ? ' (العميل الواحد بـ' + money(k.cpl, cur) + ')' : '') + '. ' +
        'وقفنا ' + fmt(k.suspicious + k.blocked) + ' ضغطة مشبوهة ' + (better ? 'أقل من الأسبوع اللي فات' : 'أكتر من الأسبوع اللي فات، وده معناه إن فيه حد بيحاول، والحماية شغالة') + '، ووفّرنا حوالي ' + money(k.saved, cur) + '.' }),
        el('button', { class: 'btn ghost sm', type: 'button', text: 'اعرض كل التفاصيل' }),
      ]));
      view.querySelector('.story + .btn').addEventListener('click', function () { setLevel('detailed'); });
    });
  }
  function openInstall() {
    var body = clear($('d-body'));
    $('d-title').textContent = 'ثبّت Maestro على موبايلك'; $('d-sub').textContent = 'بيفتح زي أي تطبيق، من غير متجر.';
    body.appendChild(el('section', { class: 'd-sec' }, [el('h3', { class: 'legend', text: 'آيفون (سفاري)' }), el('ol', { class: 'how' }, [el('li', { text: 'افتح app.maestrolt.com من سفاري' }), el('li', { text: 'دوس على زرار المشاركة (المربع اللي فيه سهم)' }), el('li', { text: 'اختار «إضافة إلى الشاشة الرئيسية»' })])]));
    body.appendChild(el('section', { class: 'd-sec' }, [el('h3', { class: 'legend', text: 'أندرويد (كروم)' }), el('ol', { class: 'how' }, [el('li', { text: 'افتح app.maestrolt.com من كروم' }), el('li', { text: 'دوس على النقط التلاتة فوق' }), el('li', { text: 'اختار «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية»' })])]));
    openDrawer();
  }

  // ════════ 2) كشف الحساب ════════
  function vStatement(view) {
    return DATA.statement(state.site, state.range).then(function (d) {
      clear(view); var t = d.total, cur = d.currency;
      view.appendChild(el('div', { class: 'callout' }, [el('b', { text: 'جوجل حاسبك على ' + fmt(t.billed) + ' ضغطة (' + money(t.cost, cur) + '). دي راحت فين؟' }), el('span', { text: 'كشف كامل لكل ضغطة، مش بس اللي وصلت موقعك.' })]));
      var fun = el('div');
      C.hbars(fun, [
        { label: 'ضغطات جوجل حاسبها', value: t.billed, cls: 'c-data' },
        { label: 'اتصال أو واتساب أو اتجاهات من الإعلان نفسه', sub: 'ماوصلتش الموقع، وده طبيعي', value: t.offsite, cls: 'c-data' },
        { label: 'وصلت موقعك', value: t.reached, cls: 'c-real' },
        { label: 'منهم مشبوهة أو اتحظرت', value: t.bad, cls: 'c-sus' },
        { label: 'الصفحة مافتحتش (ضغط وقفل قبل ما تحمّل)', value: t.not_loaded, cls: 'c-blk' },
        { label: 'جوجل رجّعها لوحده (غير صالحة)', value: t.refunded, cls: 'c-ok' },
      ], { max: t.billed });
      view.appendChild(el('div', { class: 'grid-2' }, [
        card('الضغطة راحت فين', [fun]),
        card('الفلوس', [el('div', { class: 'kpis two' }, [
          kpi('الصرف', money(t.cost, cur), fmt(t.billed) + ' ضغطة', 'info'),
          kpi('على ضغطات مشبوهة', money(t.invalid_cost, cur), pct(t.invalid_cost, t.cost) + '% من الصرف', 'warn'),
          kpi('جوجل رجّع', fmt(t.refunded) + ' ضغطة', 'من غير ما تطلب', 'ok'),
          kpi('تقدر تطالب بـ', money(t.invalid_cost * 0.6, cur), 'بملف الاسترداد', 'ok'),
        ]), el('button', { class: 'btn sm', type: 'button', text: '⬇ نزّل الكشف PDF' })]),
      ]));
      view.querySelector('.btn.sm').addEventListener('click', function () { window.print(); });
      // حسب
      var seg = el('div', { class: 'seg', role: 'tablist' });
      var body = el('div');
      var TABS = [['campaign', 'الحملة'], ['kw', 'الكلمة'], ['city', 'المدينة'], ['district', 'الحي']];
      var draw = function () {
        clear(seg); clear(body);
        TABS.forEach(function (tb) { var b = el('button', { type: 'button', 'aria-pressed': String(state.tab === tb[0]), text: tb[1] }); b.addEventListener('click', function () { state.tab = tb[0]; draw(); }); seg.appendChild(b); });
        var rows = d.by[state.tab].slice(0, 10);
        var tbody = el('tbody');
        rows.forEach(function (r) { tbody.appendChild(el('tr', {}, [el('td', { class: 'first', text: r.name }), el('td', { 'data-l': 'وصلت الموقع', class: 'num', text: fmt(r.reached) }), el('td', { 'data-l': 'مشبوهة', class: 'num', text: fmt(r.bad) }), el('td', { 'data-l': 'النسبة' }, [pill(pct(r.bad, r.reached) + '%', pct(r.bad, r.reached) > 15 ? 'warn' : 'ok')])])); });
        body.appendChild(el('div', { class: 'tbl-wrap' }, [el('table', { class: 'tbl static' }, [el('thead', {}, [el('tr', {}, [el('th', { text: TABS.filter(function (x) { return x[0] === state.tab; })[0][1] }), el('th', { text: 'وصلت الموقع' }), el('th', { text: 'مشبوهة' }), el('th', { text: 'نسبة المشبوه' })])]), tbody])]));
      };
      draw();
      view.appendChild(card('حسب الحملة والكلمة والمكان', [seg, body]));
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
    body.appendChild(el('div', { class: 'verdict s-' + v.status }, [el('div', { class: 'vd-score' }, [el('b', { text: String(v.score) }), el('small', { text: 'من 100' })]), el('div', {}, [el('b', { text: STATUS[v.status][0] }), el('span', { text: v.status === 'real' ? 'زيارة طبيعية: اتحرك في الصفحة وقعد وقت كويس.' : 'ليه؟ الأسباب تحت بالترتيب.' })])]));
    if (v.reasons.length) body.appendChild(el('section', { class: 'd-sec' }, [el('h3', { class: 'legend', text: 'ليه' }), el('ul', { class: 'why' }, v.reasons.map(function (r) { return el('li', { text: r }); }))]));
    body.appendChild(el('section', { class: 'd-sec' }, [el('h3', { class: 'legend', text: 'رحلة الزائر بالثانية' }), el('ol', { class: 'timeline' }, v.journey.map(function (e) { return el('li', { class: 'k-' + e.kind }, [el('time', { text: clock(e.at) }), el('span', { text: e.text })]); }))]));
    body.appendChild(el('section', { class: 'd-sec' }, [el('h3', { class: 'legend', text: 'التفاصيل' }), el('dl', { class: 'facts' }, [
      ['الجهاز', v.device + ' · ' + v.os], ['الشبكة', NET[v.net]], ['العنوان', '\u2066' + v.ip + '\u2069'], ['الحملة', v.campaign || '—'], ['زيارة رقم', String(v.visit_no)], ['التمرير', v.scroll + '%'],
    ].reduce(function (a, f) { a.push(el('dt', { text: f[0] })); a.push(el('dd', { text: f[1] })); return a; }, []))]));
    var acts = el('div', { class: 'd-foot-act' });
    if (v.status !== 'blocked') { var b1 = el('button', { class: 'btn', type: 'button', text: 'احظره واعتمده لجوجل' }); b1.addEventListener('click', function () { demoAct('اتحظر واتبعت لجوجل'); closeDrawer(); }); acts.appendChild(b1); }
    else { var b2 = el('button', { class: 'btn ghost', type: 'button', text: 'رجّع الحظر' }); b2.addEventListener('click', function () { demoAct('الحظر اترجع'); closeDrawer(); }); acts.appendChild(b2); }
    var b3 = el('button', { class: 'btn ghost', type: 'button', text: 'ده جهازي (اعفيه)' }); b3.addEventListener('click', function () { demoAct('الجهاز اتضاف للأجهزة المعفية'); closeDrawer(); }); acts.appendChild(b3);
    setFoot(acts);
    openDrawer();
  }

  // زيارة حقيقية (من السيرفر): الدرجة والأسباب من الحماية، والمسار بيتحمّل لما تفتح الزيارة
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
      var modeSeg = el('div', { class: 'seg wide3', role: 'radiogroup', 'aria-label': 'وضع الحماية' });
      var MODES = [['test', 'تجربة 48 ساعة', 'بنراقب ونتعلم شكل زوارك، ومابنحظرش حد.'], ['monitor', 'مراقبة بس', 'بنعرض المشبوهين وبنستنى موافقتك على كل حظر.'], ['active', 'شغالة', 'الواضحين بيتحظروا لوحدهم، والباقي بيستنى موافقتك.']];
      var modeHint = el('p', { class: 'hint' });
      var drawModes = function () { clear(modeSeg); MODES.forEach(function (m) { var b = el('button', { type: 'button', role: 'radio', 'aria-checked': String(p.mode === m[0]), text: m[1] }); b.addEventListener('click', function () { p.mode = m[0]; drawModes(); demoAct('وضع الحماية: ' + m[1]); }); modeSeg.appendChild(b); if (p.mode === m[0]) modeHint.textContent = m[2]; }); };
      drawModes();
      var strictSeg = el('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'درجة الحزم' });
      var drawStrict = function () { clear(strictSeg); [['calm', 'هادية'], ['balanced', 'متوازنة'], ['strict', 'صارمة']].forEach(function (m) { var b = el('button', { type: 'button', role: 'radio', 'aria-checked': String(p.strict === m[0]), text: m[1] }); b.addEventListener('click', function () { p.strict = m[0]; drawStrict(); demoAct('درجة الحزم: ' + m[1]); }); strictSeg.appendChild(b); }); };
      drawStrict();
      view.appendChild(card('وضع الحماية', [modeSeg, modeHint, el('div', { class: 'row-l' }, [el('span', { class: 'legend', text: 'درجة الحزم' }), strictSeg]), el('p', { class: 'hint', text: 'الصارمة بتحظر أسرع بس ممكن تمسك زبون حقيقي نادراً. المتوازنة مناسبة لأغلب المواقع.' })]));
      // طابور الموافقة
      var q = el('div', { class: 'queue' });
      var drawQ = function () {
        clear(q);
        if (!p.pending.length) { q.appendChild(el('p', { class: 'muted', text: 'مفيش حاجة مستنية موافقتك. ✓' })); return; }
        p.pending.forEach(function (x, i) {
          var ok = el('button', { class: 'btn sm', type: 'button', text: 'اعتمد لجوجل' }), no = el('button', { class: 'btn ghost sm', type: 'button', text: 'ده زبون حقيقي' });
          ok.addEventListener('click', function () { p.pending.splice(i, 1); drawQ(); demoAct('اتبعت لجوجل: الإعلان مش هيظهر للجهاز ده تاني'); });
          no.addEventListener('click', function () { p.pending.splice(i, 1); drawQ(); demoAct('اتسجل إنه زبون حقيقي، والنظام هيتعلم منه'); });
          q.appendChild(el('div', { class: 'q-item' }, [
            el('div', { class: 'q-main' }, [el('div', {}, [el('b', {}, [document.createTextNode(x.kind + ' '), el('span', { class: 'ltr', text: x.value })]), el('span', { class: 'dim', text: ' · ' + x.city + ' · ' + x.clicks + ' ضغطات · ' + x.cost + ' ر.س' })]), el('ul', { class: 'why sm' }, x.reasons.map(function (r) { return el('li', { text: r }); }))]),
            el('div', { class: 'q-act' }, [el('span', { class: 'score s-suspicious' }, [el('b', { text: String(x.score) })]), ok, no]),
          ]));
        });
      };
      drawQ();
      view.appendChild(card('مستنيين موافقتك', [el('p', { class: 'hint', text: 'كل واحد معاه الدليل. لو اعتمدته، الإعلان مش هيظهر له تاني في جوجل.' }), q]));
      // المحظورين
      var tb = el('tbody');
      p.blocked.forEach(function (b) {
        var back = el('button', { class: 'btn ghost sm', type: 'button', text: 'رجّع' }); back.addEventListener('click', function () { demoAct('الحظر اترجع'); });
        tb.appendChild(el('tr', {}, [el('td', { class: 'first' }, [el('b', {}, [document.createTextNode(b.kind + ' '), el('span', { class: 'ltr', text: b.value })]), el('div', { class: 'dim', text: b.reasons[0] || '' })]), el('td', { 'data-l': 'فين', text: b.where }), el('td', { 'data-l': 'من', text: dateAr(b.at) }), el('td', { 'data-l': 'بينتهي', text: 'بعد ' + b.expires_days + ' يوم' }), el('td', { class: 'last' }, [back])]));
      });
      view.appendChild(card('المحظورين', [el('div', { class: 'tbl-wrap' }, [el('table', { class: 'tbl static' }, [el('thead', {}, [el('tr', {}, ['المحظور', 'فين', 'من', 'بينتهي', ''].map(function (h) { return el('th', { text: h }); }))]), tb])])]));
      // أجهزتي + الاسترداد
      var own = el('ul', { class: 'd-sites' }, p.own.map(function (o) { return el('li', {}, [el('span', { class: 's-name', text: o.label }), el('span', { class: 'dim', text: 'من ' + dateAr(o.at) })]); }));
      var add = el('button', { class: 'btn ghost sm', type: 'button', text: '+ اعفي جهاز (لينك يتفتح من الجهاز)' }); add.addEventListener('click', function () { demoAct('اللينك اتنسخ: افتحه من الموبايل اللي عايز تعفيه'); });
      var ref = el('button', { class: 'btn sm', type: 'button', text: '⬇ ملف الاسترداد (آخر 30 يوم)' }); ref.addEventListener('click', function () { demoAct('ملف الاسترداد بيتجهز'); });
      view.appendChild(el('div', { class: 'grid-2' }, [
        card('أجهزتك (ضغطاتها مابتتحسبش)', [own, add]),
        card('ملف الاسترداد من جوجل', [el('p', { text: 'كل الضغطات المشبوهة بأدلتها (الوقت · الشبكة · السلوك) في ملف واحد، بالشكل اللي جوجل بيطلبه في نموذج طلب فحص الضغطات.' }), el('p', { class: 'hint', text: 'جوجل هو اللي بيقرر يرجّع ولا لأ.' }), ref]),
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
          el('td', { class: 'first' }, [el('b', { text: (l.type === 'wa' ? '💬 ' + T('wa') : '📞 ' + T('call')) + ' · ' + T('leads.code', { c: l.code }) }), el('div', { class: 'dim', text: timeAr(l.at) }), l.strength ? el('div', { class: 'strength' }, [pill(T('leads.strength', { s: l.strength.label }), l.strength.key === 'strong' ? 'ok' : l.strength.key === 'normal' ? 'info' : 'warn'), el('small', { class: 'dim', text: ' ' + l.strength.detail + ' · ' + T('estimate') })]) : null]),
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

  // ════════ 6) التنبيهات ════════
  function vAlerts(view) {
    return DATA.alerts(state.site).then(function (d) {
      clear(view);
      var CH = { tg: T('alerts.ch.tg'), push: T('alerts.ch.push'), email: T('alerts.ch.email') };
      var list = el('div', { class: 'rules' });
      d.rules.forEach(function (r) {
        var sw = r.soon ? pill(T('soon'), '') : el('button', { class: 'switch', type: 'button', role: 'switch', 'aria-checked': String(r.on), 'aria-label': r.name });
        if (!r.soon) sw.addEventListener('click', function () { if (DATA.live) { toast(T('alerts.soon_toggle')); return; } r.on = !r.on; sw.setAttribute('aria-checked', String(r.on)); demoAct(T(r.on ? 'alerts.on' : 'alerts.off', { n: r.name })); });
        var chips = el('div', { class: 'chips' }, Object.keys(CH).map(function (c) {
          var b = el('button', { class: 'chip' + (r.ch.indexOf(c) >= 0 ? ' on' : ''), type: 'button', 'aria-pressed': String(r.ch.indexOf(c) >= 0), text: CH[c] });
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
          [T('sites.r.ads'), s.ads ? true : DATA.live ? null : false, s.ads ? T('sites.ads.on') + (s.account ? ' · \u2066' + s.account + '\u2069' : '') : T(DATA.live ? 'sites.ads.soon' : 'sites.ads.link')],
          [T('sites.r.suffix'), s.template == null ? null : s.template, s.template == null ? T('sites.suffix.after') : T(s.template ? 'sites.suffix.ok' : 'sites.suffix.missing')],
          [T('sites.r.own'), s.own ? true : DATA.live ? null : true, s.own ? LT.n(s.own, 'device') : T('sites.own.soon')],
        ];
        var extra = [];
        if (DATA.pairCode && !s.paired) {
          var out = el('div', { class: 'hint' }), b = el('button', { class: 'btn ghost sm', type: 'button', text: T('sites.paircode') });
          b.addEventListener('click', function () { b.disabled = true; DATA.pairCode(s.id).then(function (r) { b.disabled = false; clear(out); out.appendChild(el('div', { class: 'code', text: r.code })); out.appendChild(document.createTextNode(T('sites.paircode.hint', { m: LT.n(r.valid_minutes, 'minute') }))); }, function (e) { b.disabled = false; clear(out); out.appendChild(document.createTextNode(T(e.message === 'role' ? 'sites.paircode.role' : 'sites.paircode.fail'))); }); });
          extra.push(b, out);
        }
        view.appendChild(card(s.name, [el('p', { class: 'acc-sub', text: s.domain }), el('ul', { class: 'checks' }, rows.map(function (r) { return el('li', { class: r[1] === null ? 'soon' : r[1] ? 'ok' : 'warn' }, [el('i', { class: 'ck', text: r[1] === null ? '…' : r[1] ? '✓' : '!' }), el('b', { text: r[0] }), el('span', { text: r[2] })]); })),
          s.delivery.length ? el('details', { class: 'more-d pro-only' }, [el('summary', { text: T('sites.daily') }), spark]) : null].concat(extra)));
      });
      var add = el('button', { class: 'btn', type: 'button', text: T('sites.add') }); add.addEventListener('click', function () { toast(T('sites.add.hint')); });
      view.appendChild(add);
    });
  }

  // ════════ كل العملاء (الوكالات) ════════
  var COLS = [['name', 'العميل'], ['bad_pct', 'المشبوه %'], ['saved', 'اتحمى'], ['won', 'عملاء حقيقيين'], ['cpl', 'تكلفة العميل'], ['billed', 'ضغطات جوجل'], ['delivery', 'التوصيل']];
  var COLS_LIVE = [['name', 'العميل'], ['visits', 'زيارات'], ['leads', 'تواصل'], ['won', 'عملاء حقيقيين'], ['open', 'من غير نتيجة'], ['delivery', 'التوصيل']];
  state.sort = 'attention';
  function issues(c) {
    var x = [];
    if (!c.ads && !DATA.live) x.push(['جوجل أدز مش متربط', 'bad']);
    if (DATA.live && c.open) x.push([c.open + ' تواصل من غير نتيجة', 'info']);
    if (DATA.live && c.delivery == null) x.push(['البلجن محتاج تحديث (2.12.2)', 'warn']);
    if (c.pending) x.push([c.pending === 1 ? 'واحد مستني موافقة' : c.pending + ' مستنيين موافقة', 'warn']);
    if (c.bad_pct > 18) x.push(['مشبوه عالي (' + c.bad_pct + '%)', 'warn']);
    if (c.delivery != null && c.delivery < 99.5) x.push(['التوصيل ' + c.delivery + '%', 'warn']);
    if (c.template === false) x.push(['لاحقة التتبع ناقصة', 'warn']);
    return x;
  }
  function vClients(view) {
    return DATA.clients(state.range).then(function (list) {
      clear(view);
      var cur = list[0] ? list[0].currency : '';
      var tot = list.reduce(function (a, c) { a.saved += c.saved || 0; a.won += c.won; a.cost += c.cost || 0; a.bad += c.bad || 0; a.visits += c.visits; a.leads += c.leads; a.att += issues(c).length ? 1 : 0; return a; }, { saved: 0, won: 0, cost: 0, bad: 0, visits: 0, leads: 0, att: 0 });
      if (DATA.live) view.appendChild(el('div', { class: 'kpis' }, [
        kpi('المواقع', fmt(list.length), 'في حسابك', 'info'),
        kpi('محتاجين انتباه', fmt(tot.att), 'فيهم حاجة لازم تتعمل', tot.att ? 'warn' : 'mute'),
        kpi('زيارات', fmt(tot.visits), 'كل المواقع', 'info'),
        kpi('تواصل', fmt(tot.leads), 'واتساب واتصال', 'info'),
        kpi('عملاء حقيقيين', fmt(tot.won), 'اتفقوا (من زراير تليجرام واللوحة)', 'ok'),
        kpi('الحماية', 'قريباً', 'المشبوه والتوفير قبل 22 نوفمبر', 'mute'),
      ]));
      else view.appendChild(el('div', { class: 'kpis' }, [
        kpi('العملاء', fmt(list.length), DATA.agency ? DATA.agency.name : '', 'info'),
        kpi('محتاجين انتباه', fmt(tot.att), 'فيهم حاجة لازم تتعمل', tot.att ? 'warn' : 'mute'),
        kpi('اتحمى لكل العملاء', money(tot.saved, cur), fmt(tot.bad) + ' ضغطة مشبوهة', 'ok'),
        kpi('متوسط المشبوه', pct(tot.bad, tot.visits) + '%', 'من كل الزيارات', 'warn'),
        kpi('عملاء حقيقيين', fmt(tot.won), tot.won ? 'العميل بـ' + money(tot.cost / tot.won, cur) + ' في المتوسط' : '', 'ok'),
        kpi('صرف الإعلانات', money(tot.cost, cur), 'كل الحسابات', 'info'),
      ]));
      var tbody = el('tbody'), head = el('tr');
      var sorted = function () {
        var l = list.slice();
        if (state.sort === 'attention') l.sort(function (a, b) { return issues(b).length - issues(a).length || b.bad_pct - a.bad_pct; });
        else l.sort(function (a, b) { var x = a[state.sort], y = b[state.sort]; if (typeof x === 'string') return x.localeCompare(y, 'ar'); return (y == null ? -1 : y) - (x == null ? -1 : x); });
        return l;
      };
      var draw = function () {
        clear(head); clear(tbody);
        (DATA.live ? COLS_LIVE : COLS).forEach(function (c) {
          var b = el('button', { type: 'button', class: 'th-sort' + (state.sort === c[0] ? ' on' : ''), text: c[1] });
          b.addEventListener('click', function () { state.sort = state.sort === c[0] ? 'attention' : c[0]; draw(); });
          head.appendChild(el('th', { 'aria-sort': state.sort === c[0] ? 'descending' : 'none' }, [b]));
        });
        head.appendChild(el('th', { text: 'محتاج' }));
        sorted().forEach(function (c) {
          var tr = DATA.live ? el('tr', { tabindex: '0' }, [
            el('td', { class: 'first' }, [el('div', { class: 'acc-name', text: c.name }), el('span', { class: 'acc-sub', text: c.domain })]),
            el('td', { 'data-l': 'زيارات', class: 'num', text: fmt(c.visits) }),
            el('td', { 'data-l': 'تواصل', class: 'num', text: fmt(c.leads) }),
            el('td', { 'data-l': 'عملاء حقيقيين', class: 'num', text: fmt(c.won) }),
            el('td', { 'data-l': 'من غير نتيجة', class: 'num', text: fmt(c.open) }),
            el('td', { 'data-l': 'التوصيل' }, [c.delivery == null ? pill('لسه', '') : pill(c.delivery + '%', c.delivery >= 99.5 ? 'ok' : 'warn')]),
            el('td', { 'data-l': 'محتاج', class: 'issues' }, issues(c).length ? issues(c).map(function (i) { return pill(i[0], i[1]); }) : [pill('كله تمام', 'ok')]),
          ]) : el('tr', { tabindex: '0' }, [
            el('td', { class: 'first' }, [el('div', { class: 'acc-name', text: c.name }), el('span', { class: 'acc-sub', text: c.domain })]),
            el('td', { 'data-l': 'المشبوه %' }, [el('b', { class: 'num', text: c.bad_pct + '%' }), el('span', { class: 'dim', text: (c.bad_pct > c.bad_pct_prev ? ' ▲' : ' ▼') })]),
            el('td', { 'data-l': 'اتحمى', class: 'num', text: money(c.saved, c.currency) }),
            el('td', { 'data-l': 'عملاء حقيقيين', class: 'num', text: fmt(c.won) + ' من ' + fmt(c.leads) }),
            el('td', { 'data-l': 'تكلفة العميل', class: 'num', text: c.cpl ? money(c.cpl, c.currency) : '—' }),
            el('td', { 'data-l': 'ضغطات جوجل', class: 'num', text: fmt(c.billed) }),
            el('td', { 'data-l': 'التوصيل' }, [pill(c.delivery + '%', c.delivery >= 99.5 ? 'ok' : 'warn')]),
            el('td', { 'data-l': 'محتاج', class: 'issues' }, issues(c).length ? issues(c).map(function (i) { return pill(i[0], i[1]); }) : [pill('كله تمام', 'ok')]),
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
      view.appendChild(card('', [el('div', { class: 'sec-head' }, [el('h2', { text: 'كل العملاء' }), el('div', { class: 'tools' }, [el('span', { class: 'hint', text: 'رتّب بأي عمود · دوس على عميل تفتح لوحته' }), exp])]),
        el('div', { class: 'tbl-wrap' }, [el('table', { class: 'tbl' }, [el('thead', {}, [head]), tbody])])]));
    });
  }
  function downloadCsv(list) {
    var z = function (v) { return v == null ? '' : v; };
    var rows = [['العميل', 'الدومين', 'زيارات', 'المشبوه %', 'اتحمى', 'تواصل', 'عملاء حقيقيين', 'تكلفة العميل', 'ضغطات جوجل', 'الصرف', 'التوصيل %']];
    list.forEach(function (c) { rows.push([c.name, c.domain, z(c.visits), z(c.bad_pct), z(c.saved), c.leads, c.won, z(c.cpl), z(c.billed), z(c.cost), z(c.delivery)]); });
    var csv = '\ufeff' + rows.map(function (r) { return r.map(function (v) { var x = String(v); return /[",\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; }).join(','); }).join('\n');
    var a = el('a', { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })), download: 'maestro-clients-' + state.range + 'd.csv' });
    document.body.appendChild(a); a.click(); a.remove();
  }

  // ════════ التقارير (باسم الوكالة ولوجوها) ════════
  var rep = { site: null, range: 7, level: 'simple', name: '', logo: '', color: '#1a6fe8', white: true, email: '', every: 'weekly',
    parts: { answers: true, kpis: true, chart: true, statement: true, leads: true, todo: true } };
  var PARTS = [['answers', 'الخلاصة (3 إجابات)'], ['kpis', 'الأرقام'], ['chart', 'جودة الزيارات (رسم)'], ['statement', 'كشف الحساب'], ['leads', 'العملاء الحقيقيين'], ['todo', 'التوصيات']];
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
      [[7, 'أسبوعي'], [30, 'شهري']].forEach(function (x) { var b = el('button', { type: 'button', 'aria-pressed': String(rep.range === x[0]), text: x[1] }); b.addEventListener('click', function () { rep.range = x[0]; drawSegs(); redraw(); }); segR.appendChild(b); });
      [['simple', 'مبسّط (لصاحب البزنس)'], ['detailed', 'احترافي']].forEach(function (x) { var b = el('button', { type: 'button', 'aria-pressed': String(rep.level === x[0]), text: x[1] }); b.addEventListener('click', function () { rep.level = x[0]; drawSegs(); redraw(); }); segL.appendChild(b); });
    };
    drawSegs();
    var name = el('input', { type: 'text', maxlength: '60' }); name.value = rep.name; name.addEventListener('input', function () { rep.name = name.value; redraw(); });
    var logo = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp' });
    var logoMsg = el('small', { class: 'hint', text: 'PNG أو JPG، أقل من 1 ميجا. بيفضل على جهازك.' });
    logo.addEventListener('change', function () {
      var f = logo.files && logo.files[0]; if (!f) return;
      if (!/^image\/(png|jpeg|webp)$/.test(f.type) || f.size > 1024 * 1024) { logoMsg.textContent = 'الصورة لازم تكون PNG أو JPG أو WEBP وأقل من 1 ميجا.'; return; }
      var r = new FileReader(); r.onload = function () { if (/^data:image\/(png|jpeg|webp);base64,/.test(String(r.result))) { rep.logo = String(r.result); redraw(); } }; r.readAsDataURL(f);
    });
    var color = el('input', { type: 'color' }); color.value = rep.color; color.addEventListener('input', function () { rep.color = color.value; redraw(); });
    var white = el('input', { type: 'checkbox' }); white.checked = rep.white; white.addEventListener('change', function () { rep.white = white.checked; redraw(); });
    var parts = el('div', { class: 'checks-in' }, PARTS.map(function (x) { var c = el('input', { type: 'checkbox' }); c.checked = rep.parts[x[0]]; c.addEventListener('change', function () { rep.parts[x[0]] = c.checked; redraw(); }); return el('label', { class: 'ck-in' }, [c, el('span', { text: x[1] })]); }));
    var pdf = el('button', { class: 'btn', type: 'button', text: '⬇ نزّل PDF' });
    pdf.addEventListener('click', function () { document.body.classList.add('print-report'); window.print(); });
    var email = el('input', { type: 'email', placeholder: 'إيميل العميل', dir: 'ltr' }); email.value = rep.email; email.addEventListener('input', function () { rep.email = email.value; });
    var every = el('select', {}, [el('option', { value: 'weekly', text: 'كل أسبوع (السبت الصبح)' }), el('option', { value: 'monthly', text: 'أول كل شهر' })]);
    var sched = el('button', { class: 'btn ghost', type: 'button', text: 'ابعته أوتوماتيك' });
    sched.addEventListener('click', function () { if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(rep.email)) { toast('اكتب إيميل العميل صح'); return; } demoAct('التقرير هيتبعت ' + (every.value === 'weekly' ? 'كل أسبوع' : 'كل شهر') + ' لـ ' + rep.email); });
    form.appendChild(card('جهّز التقرير', [field('العميل', sel), field('الفترة', segR), field('المستوى', segL), field('اسم الوكالة', name), field('لوجو الوكالة', el('div', {}, [logo, logoMsg])), field('لون التقرير', color),
      el('label', { class: 'ck-in' }, [white, el('span', { text: 'باسم الوكالة بس (من غير اسم Maestro)' })]), el('div', { class: 'fld' }, [el('span', { text: 'الأقسام' }), parts]), el('div', { class: 'row-btns' }, [pdf])]));
    form.appendChild(card('ابعته للعميل أوتوماتيك', [field('الإيميل', email), field('كل قد إيه', every), sched]));
    view.appendChild(el('div', { class: 'rep-grid' }, [form, prev]));
    var redraw = function () {
      Promise.all([DATA.overview(rep.site, rep.range), DATA.statement(rep.site, rep.range), DATA.summary(rep.site, rep.range)]).then(function (r) { clear(prev); prev.appendChild(reportDoc(r[0], r[1], r[2])); });
    };
    redraw();
    return Promise.resolve();
  }
  function reportDoc(o, st, sm) {
    var k = o.kpi, cur = o.currency, detailed = rep.level === 'detailed';
    var doc = el('article', { class: 'report-doc', 'aria-label': 'معاينة التقرير' });
    doc.style.setProperty('--rc', rep.color);
    var brand = el('div', { class: 'rd-brand' }, [rep.logo ? el('img', { src: rep.logo, alt: rep.name, class: 'rd-logo' }) : null, el('b', { text: rep.name || 'اسم الوكالة' })]);
    doc.appendChild(el('header', { class: 'rd-head' }, [brand, el('div', { class: 'rd-meta' }, [el('b', { text: sm.name }), el('span', { text: (rep.range === 7 ? 'تقرير أسبوعي' : 'تقرير شهري') + ' · لحد ' + dateAr(new Date().toISOString()) })])]));
    if (rep.parts.answers) doc.appendChild(el('section', { class: 'rd-answers' }, [
      el('div', {}, [el('span', { text: 'إعلانك محمي؟' }), el('b', { text: o.scoring === false ? 'بنراقب كل زيارة' : sm.ads ? 'أيوه' : 'مش كامل' })]),
      o.scoring === false ? el('div', {}, [el('span', { text: 'زيارات' }), el('b', { text: fmt(k.real) })]) : el('div', {}, [el('span', { text: 'اتحمى من فلوسك' }), el('b', { text: money(k.saved, cur) })]),
      el('div', {}, [el('span', { text: 'عملاء حقيقيين' }), el('b', { text: fmt(k.won) + (k.cpl ? ' · ' + money(k.cpl, cur) + ' للعميل' : '') })]),
    ]));
    if (rep.parts.kpis) doc.appendChild(el('section', { class: 'rd-sec' }, [el('h3', { text: 'الأرقام' }), el('div', { class: 'rd-kpis' }, [
      ['ضغطات جوجل', nf(k.billed)], ['الصرف', money(k.cost, cur)], ['زوار حقيقيين', nf(k.real)], ['مشبوه', nf(k.suspicious)], ['اتحظر', nf(k.blocked)], ['تواصل', nf(k.leads)],
    ].filter(function (x) { return x[1] !== '—'; }).slice(0, detailed ? 6 : 3).map(function (x) { return el('div', {}, [el('span', { text: x[0] }), el('b', { text: x[1] })]); }))]));
    if (rep.parts.chart) { var ch = el('div'); C.stacked(ch, o.days, o.scoring === false ? [{ key: 'real', label: 'زيارات', cls: 'c-real' }] : [{ key: 'real', label: 'حقيقي', cls: 'c-real' }, { key: 'suspicious', label: 'مشبوه', cls: 'c-sus' }, { key: 'blocked', label: 'اتحظر', cls: 'c-blk' }], { label: 'جودة الزيارات', height: 170 }); doc.appendChild(el('section', { class: 'rd-sec' }, [el('h3', { text: 'جودة الزيارات كل يوم' }), ch])); }
    if (rep.parts.statement && !st.unavailable) {
      var t = st.total, fun = el('div');
      C.hbars(fun, [{ label: 'ضغطات جوجل حاسبها', value: t.billed, cls: 'c-data' }, { label: 'من الإعلان نفسه (اتصال · واتساب)', value: t.offsite, cls: 'c-data' }, { label: 'وصلت الموقع', value: t.reached, cls: 'c-real' }, { label: 'مشبوهة أو اتحظرت', value: t.bad, cls: 'c-sus' }, { label: 'الصفحة مافتحتش', value: t.not_loaded, cls: 'c-blk' }].slice(0, detailed ? 5 : 3), { max: t.billed, compact: true });
      doc.appendChild(el('section', { class: 'rd-sec' }, [el('h3', { text: 'كشف الحساب' }), fun]));
    }
    if (rep.parts.leads) doc.appendChild(el('section', { class: 'rd-sec' }, [el('h3', { text: 'العملاء الحقيقيين' }), el('p', { text: 'كلّمك ' + fmt(k.leads) + ' (واتساب واتصال)، و' + fmt(k.won) + ' اتفقوا' + (k.cpl ? '، العميل الواحد كلّف ' + money(k.cpl, cur) + ' من الإعلانات' : '') + '.' })]));
    if (rep.parts.todo) {
      var adv = [];
      if (!sm.ads && !DATA.live) adv.push('نربط حساب جوجل أدز علشان الحظر يتنفذ جوه جوجل نفسه، مش على الموقع بس.');
      if (sm.open) adv.push('فيه ' + sm.open + ' تواصل مستني تسجيل نتيجته (اتفق ولا لأ) علشان نحسب العميل الحقيقي بكام.');
      if (sm.pending) adv.push(sm.pending === 1 ? 'فيه جهاز مشبوه مستني موافقتك علشان نمنعه من جوجل.' : 'فيه ' + sm.pending + ' أجهزة مشبوهة مستنية موافقتك علشان نمنعها من جوجل.');
      if (sm.bad_pct > 18) adv.push('نسبة المشبوه ' + sm.bad_pct + '% أعلى من الطبيعي: هنراجع الكلمات والأماكن اللي جاي منها.');
      if (!sm.template) adv.push('نضيف لاحقة التتبع في حساب الإعلانات علشان نعرف الكلمة اللي جابت كل عميل.');
      if (sm.delivery != null && sm.delivery < 99.5) adv.push('بنتابع توصيل البيانات من الموقع (' + sm.delivery + '%) لحد ما يرجع 100%.');
      adv.push('نكمّل الحماية بنفس الإعدادات، ونبعتلك التقرير الجاي ' + (rep.range === 7 ? 'الأسبوع الجاي' : 'الشهر الجاي') + '.');
      doc.appendChild(el('section', { class: 'rd-sec' }, [el('h3', { text: 'التوصيات' }), el('ul', {}, adv.map(function (t2) { return el('li', { text: t2 }); }))]));
    }
    doc.appendChild(el('footer', { class: 'rd-foot', text: rep.white ? (rep.name || '') : (rep.name ? rep.name + ' · ' : '') + 'بأدوات Maestro LT' }));
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
      : ['sites', 'info', T('act.ads'), T('act.ads.sub'), T('nav.sites')];
  }
  function actionsCard(list, simple) {
    var acts = el('div', { class: 'actions' });
    list.forEach(function (a) { var m = liveAction(a, simple); acts.appendChild(el('a', { class: 'act ' + m[1], href: '#/' + m[0] }, [el('b', { text: m[2] }), el('span', { text: m[3] }), el('em', { text: m[4] + ' ‹' })])); });
    return card(T('act.title'), [acts]);
  }
  function lOverview(view) {
    return DATA.overview(state.site, state.range).then(function (d) {
      clear(view);
      var k = d.kpi, p = d.prev, sc = d.scoring, bad = (k.suspicious || 0) + (k.high || 0), dl = d.status.delivery;
      view.appendChild(el('div', { class: 'status-strip' }, [
        el('a', { class: 'st ' + (sc ? 'ok' : ''), href: '#/protection' }, [el('i', { class: 'dot' + (sc ? ' live' : '') }), document.createTextNode(T(sc ? 'strip.prot.on' : 'strip.prot.soon'))]),
        el('span', { class: 'st ' + (dl == null ? '' : dl >= 99.5 ? 'ok' : 'warn') }, [el('i', { class: 'dot' }), document.createTextNode(dl == null ? T('strip.delivery.none') : T('strip.delivery', { p: dl }))]),
        el('span', { class: 'st ' + (d.status.ads ? 'ok' : '') }, [el('i', { class: 'dot' }), document.createTextNode(T(d.status.ads ? 'strip.ads.on' : 'strip.ads.soon'))]),
        el('a', { class: 'st live-now', href: '#/visits' }, [el('i', { class: 'dot live' }), document.createTextNode(T('strip.live', { n: LT.n(d.live, 'visitor') }))]),
      ]));
      view.appendChild(el('div', { class: 'kpis' }, sc ? [
        kpi(T('kpi.visits'), fmt(k.sessions), T('kpi.pages_opened', { n: LT.n(k.pageviews, 'page') }), 'info', delta(k.sessions, p.real, true)),
        kpi(T('kpi.real'), fmt(k.real), T('kpi.of_visits', { p: pct(k.real, k.real + bad) }), 'ok'),
        kpi(T('kpi.suspicious'), fmt(bad), T('kpi.high_of', { n: fmt(k.high) }) + (k.ad_sessions ? ' · ' + T('kpi.from_ads', { a: fmt(k.ad_bad), b: fmt(k.ad_sessions) }) : ''), bad ? 'warn' : 'mute'),
        kpi(T('kpi.contacts'), fmt(k.contacts), T('kpi.wa_call') + (k.outside_leads ? ' · ' + T('kpi.outside_n', { n: fmt(k.outside_leads) }) : ''), 'ok', delta(k.contacts, p.contacts, true)),
        kpi(T('kpi.won'), fmt(k.won), T('kpi.won.sub'), 'ok'),
        kpi(T('kpi.review'), fmt(k.pending + k.open), T('kpi.review.sub', { a: fmt(k.pending), b: fmt(k.open) }), k.pending + k.open ? 'warn' : 'mute'),
      ] : [
        kpi(T('kpi.visits'), fmt(k.real), T('kpi.pages_opened', { n: LT.n(k.pageviews, 'page') }), 'info', delta(k.real, p.real, true)),
        kpi(T('kpi.contacts'), fmt(k.contacts), T('kpi.wa_call'), 'ok', delta(k.contacts, p.contacts, true)),
        kpi(T('kpi.contact_rate'), pct(k.contacts, k.real) + '%', T('kpi.contact_rate.sub'), 'info'),
        kpi(T('kpi.won'), fmt(k.won), T('kpi.won.sub'), 'ok'),
        kpi(T('kpi.open'), fmt(k.open), T('kpi.open.sub'), k.open ? 'warn' : 'mute'),
        kpi(T('kpi.delivery'), dl == null ? T('kpi.delivery.none') : dl + '%', T('kpi.delivery.sub'), dl == null ? 'mute' : dl >= 99.5 ? 'ok' : 'warn'),
      ]));
      if (d.actions.length) view.appendChild(actionsCard(d.actions, false));
      var ch = el('div');
      C.stacked(ch, d.days, sc ? LIVE_SERIES : [{ key: 'real', label: T('kpi.visits'), cls: 'c-real' }], { label: T(sc ? 'chart.quality' : 'chart.daily') });
      view.appendChild(card(T(sc ? 'chart.quality.title' : 'chart.daily'), [el('p', { class: 'hint', text: T(sc ? 'chart.quality.hint' : 'chart.daily.hint') }), ch]));
      if (sc && d.suspicious.length) {
        var sl = el('div', { class: 'queue' });
        d.suspicious.forEach(function (v) { sl.appendChild(suspectItem(v, function () { lOverview(view); })); });
        view.appendChild(card(T('ov.top_suspicious'), [sl, el('a', { class: 'linkish', href: '#/protection', text: T('ov.all_suspicious') })]));
      }
      var src = el('div'); C.hbars(src, d.sources.map(function (x) { return { label: srcName(x.name), value: x.n, cls: x.name === 'google_ads' ? 'c-real' : 'c-data' }; }), { compact: true });
      var pl = el('div'); C.hbars(pl, d.places.map(function (x) { return { label: x.name, value: x.n, cls: 'c-data' }; }), { compact: true });
      view.appendChild(el('div', { class: 'grid-2' }, [card(T('ov.sources'), [d.sources.length ? src : el('p', { class: 'muted', text: T('ov.no_visits') })]), card(T('ov.places'), [d.places.length ? pl : el('p', { class: 'muted', text: T('ov.no_places') })])]));
      view.appendChild(soonCard(T('ov.soon.title'), [T('ov.soon.1'), T('ov.soon.2'), T('ov.soon.3')]));
    });
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
    view.appendChild(el('div', { class: 'callout' }, [el('b', { text: 'كشف الحساب بيشتغل أول ما تربط جوجل أدز' }), el('span', { text: 'هنقولك جوجل حاسبك على كام ضغطة، ودي راحت فين بالظبط.' })]));
    view.appendChild(soonCard('اللي هتشوفه هنا', ['ضغطات جوجل اللي حاسبك عليها والصرف', 'اتصال وواتساب من الإعلان نفسه (من غير ما يدخل الموقع)', 'اللي وصل موقعك، واللي الصفحة مافتحتش له', 'اللي جوجل رجّعه لوحده، واللي تقدر تطالب بيه', 'حسب الحملة والكلمة والمدينة']));
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
      var sc = soonCard(T('ov.soon.title'), [T('prot.ads.1'), T('prot.ads.2'), T('ov.soon.3')]); sc.classList.add('pro-only'); view.appendChild(sc);
    });
  }
  // ════════ الفريق (G-29): مين يدخل حسابك وبيعمل إيه ════════
  var ROLE_AR = {}; ['owner', 'admin', 'staff', 'viewer'].forEach(function (r) { ROLE_AR[r] = [T('team.role.' + r), T('team.role.' + r + '.d')]; });
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

  var VIEWS = { overview: vOverview, clients: vClients, statement: vStatement, visits: vVisits, protection: vProtection, leads: vLeads, alerts: vAlerts, reports: vReports, sites: vSites, team: vTeam };

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
    boot.then(function (m) {
      if (DATA.init && !m) { location.replace('/login'); return; }
      if (m) {
        var stored = null; try { stored = sessionStorage.getItem('lt_level'); } catch (e) { /* عادي */ }
        if (!stored) state.level = (m.orgs || []).some(function (o) { return o.type === 'agency'; }) ? 'detailed' : 'simple';
        var who = $('who'); if (who) who.textContent = m.user.name || m.user.email || '';
        var out = $('out'); if (out) { out.hidden = false; out.addEventListener('click', function () { LT.logout().then(function () { location.replace('/login'); }); }); }
        var adm = $('admin-link'); if (adm && m.user.platform_admin) adm.hidden = false;
      }
      return DATA.sites().then(function (s) {
        state.sites = s; state.site = s[0] && s[0].id;
        var want = null; try { want = new URLSearchParams(location.search).get('site'); } catch (e) { /* عادي */ }
        if (want && s.some(function (x) { return x.id === want; })) state.site = want;      // من «افتح لوحته» في لوحة الإدارة
        buildNav(); buildTop();
        if (!s.length && DATA.live) { location.hash = '#/sites'; }
        render();
      });
    }).catch(function () { var v = clear($('view')); v.appendChild(card(T('frame.load_fail'), [el('p', { text: T('frame.load_fail_hint') })])); });
  }
  start();
})();
