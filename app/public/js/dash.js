// لوحة العميل: الشاشات السبعة (موافقة محمود 11 نوفمبر). نفس الكود للوحة التجريبية (بيانات LTDemo) والحقيقية (LTData لما تجهز).
// المرجع: claude/briefs/2026-11-11-app-screens-vs-competitors.md · claude/design-system.md
(function () {
  'use strict';
  var LT = window.LT, el = LT.el, clear = LT.clear, C = window.LTCharts, fmt = C.fmt;
  var DATA = window.LTData || window.LTDemo;
  var $ = function (id) { return document.getElementById(id); };
  var state = { site: null, range: 7, sites: [], filter: 'all', q: '', tab: 'campaign' };
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
  };
  function icon(name) {
    var svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('class', 'ic'); svg.setAttribute('aria-hidden', 'true');
    var p = document.createElementNS(NS, 'path'); p.setAttribute('d', ICONS[name]); svg.appendChild(p); return svg;
  }

  var ROUTES = [
    ['overview', 'الرئيسية'], ['statement', 'كشف الحساب'], ['visits', 'الزيارات'], ['protection', 'الحماية'],
    ['leads', 'العملاء الحقيقيين'], ['alerts', 'التنبيهات'], ['sites', 'المواقع والتركيب'],
  ];
  var BOTTOM = ['overview', 'statement', 'visits', 'protection'];
  var STATUS = { real: ['حقيقي', 'ok'], suspicious: ['مشبوه', 'warn'], blocked: ['محظور', 'bad'] };
  var SRC = { google_ads: 'إعلان جوجل', google_organic: 'بحث جوجل', google_maps: 'خرائط جوجل', direct: 'مباشر', social: 'سوشيال' };
  var NET = { mobile: 'داتا موبايل', home: 'إنترنت منزلي', vpn: 'VPN', dc: 'شبكة سيرفرات' };
  var OUT = { 'تم': 'ok', 'بيفكر': 'info', 'لغى': 'bad', 'مش جاد': 'warn', 'ماوصلش رسالة': '' };

  // ── أدوات ──
  function money(n, cur) { return fmt(Math.round(n)) + ' ' + (cur || ''); }
  function pct(a, b) { return b ? Math.round((a / b) * 1000) / 10 : 0; }
  function delta(cur, prev, goodUp) {
    if (!prev) return null;
    var d = Math.round(((cur - prev) / prev) * 100);
    if (!d) return el('span', { class: 'dl', text: 'زي الفترة اللي فاتت' });
    var good = goodUp === null ? null : goodUp ? d > 0 : d < 0;
    var full = (d > 0 ? 'زيادة ' : 'نقص ') + Math.abs(d) + '% عن الفترة اللي فاتت';
    return el('span', { class: 'dl ' + (good === null ? '' : good ? 'up' : 'down'), title: full, 'aria-label': full }, [document.createTextNode((d > 0 ? '▲ ' : '▼ ') + Math.abs(d) + '%'), el('small', { text: ' عن اللي فاتت' })]);
  }
  function timeAr(iso) { try { return new Date(iso).toLocaleString('ar-EG-u-nu-latn', { weekday: 'short', hour: 'numeric', minute: '2-digit' }); } catch (e) { return iso; } }
  function clock(iso) { try { return new Date(iso).toLocaleTimeString('ar-EG-u-nu-latn', { hour: 'numeric', minute: '2-digit', second: '2-digit' }); } catch (e) { return iso; } }
  function dateAr(iso) { try { return new Date(iso).toLocaleDateString('ar-EG-u-nu-latn', { day: 'numeric', month: 'long' }); } catch (e) { return iso; } }
  function pill(t, c) { return el('span', { class: 'pill ' + (c || ''), text: t }); }
  function card(title, children, extra) { return el('section', { class: 'panel-card' + (extra ? ' ' + extra : '') }, [title ? el('div', { class: 'sec-head' }, [el('h2', { text: title })]) : null].concat(children)); }
  function kpi(label, value, sub, cls, d) { return el('div', { class: 'kpi ' + (cls || 'info') }, [el('div', { class: 'k-label', text: label }), el('div', { class: 'k-val', text: value }), sub ? el('div', { class: 'k-sub', text: sub }) : null, d || null]); }
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(function () { t.hidden = true; }, 3000); }
  function demoAct(msg) { toast(DATA.demo ? msg + ' (في اللوحة التجريبية مابيتنفذش فعلاً)' : msg); }
  function scoreBadge(v) { return el('span', { class: 'score s-' + v.status, title: 'درجة الخطر من 100' }, [el('b', { text: String(v.score) })]); }

  // ── الإطار ──
  function buildNav() {
    var side = clear($('side-nav')), bottom = clear($('bottom-nav'));
    ROUTES.forEach(function (r) {
      side.appendChild(el('a', { href: '#/' + r[0], 'data-r': r[0] }, [icon(r[0]), el('span', { text: r[1] })]));
    });
    BOTTOM.forEach(function (k) { var r = ROUTES.filter(function (x) { return x[0] === k; })[0]; bottom.appendChild(el('a', { href: '#/' + k, 'data-r': k }, [icon(k), el('span', { text: k === 'statement' ? 'الكشف' : r[1] })])); });
    var more = el('button', { type: 'button', class: 'more', 'aria-haspopup': 'true' }, [icon('more'), el('span', { text: 'المزيد' })]);
    more.addEventListener('click', openMore);
    bottom.appendChild(more);
  }
  function openMore() {
    var body = clear($('d-body'));
    $('d-title').textContent = 'المزيد'; $('d-sub').textContent = '';
    ROUTES.filter(function (r) { return BOTTOM.indexOf(r[0]) < 0; }).forEach(function (r) {
      var a = el('a', { class: 'more-link', href: '#/' + r[0] }, [icon(r[0]), el('span', { text: r[1] })]);
      a.addEventListener('click', closeDrawer);
      body.appendChild(a);
    });
    openDrawer();
  }
  function buildTop() {
    var sel = clear($('site'));
    state.sites.forEach(function (s) { sel.appendChild(el('option', { value: s.id, text: s.name })); });
    sel.value = state.site;
    sel.onchange = function () { state.site = sel.value; render(); };
    var seg = clear($('range'));
    [[1, 'النهارده'], [7, '7 أيام'], [30, '30 يوم']].forEach(function (r) {
      var b = el('button', { type: 'button', 'aria-pressed': String(state.range === r[0]), text: r[1] });
      b.addEventListener('click', function () { state.range = r[0]; buildTop(); render(); });
      seg.appendChild(b);
    });
  }
  function route() { var h = (location.hash || '').replace(/^#\//, ''); return ROUTES.some(function (r) { return r[0] === h; }) ? h : 'overview'; }
  function render() {
    var r = route(), view = clear($('view'));
    Array.prototype.forEach.call(document.querySelectorAll('[data-r]'), function (a) { if (a.getAttribute('data-r') === r) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    var title = ROUTES.filter(function (x) { return x[0] === r; })[0][1];
    $('page-title').textContent = title;
    document.title = title + ' · Maestro LT' + (DATA.demo ? ' (تجريبية)' : '');
    $('range').hidden = r === 'protection' || r === 'alerts' || r === 'sites';
    view.appendChild(el('div', { class: 'loading' }, [el('span', { class: 'spinner' }), document.createTextNode('بنحمّل…')]));
    VIEWS[r](view).then(function () { var l = view.querySelector('.loading'); if (l) l.remove(); window.scrollTo(0, 0); });
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
        var li = el('li', { tabindex: '0' }, [scoreBadge(v), el('div', {}, [el('b', { text: v.city + ' · ' + v.district + ' — ' + (SRC[v.src] || v.src) }), el('span', { text: v.reasons[0] || '' })]), el('time', { text: timeAr(v.at) })]);
        li.addEventListener('click', function () { openVisit(v); });
        li.addEventListener('keydown', function (e) { if (e.key === 'Enter') openVisit(v); });
        sus.appendChild(li);
      });
      var pl = el('div');
      C.hbars(pl, d.places.map(function (x) { return { label: x.name, value: x.n, cls: 'c-sus' }; }), { compact: true });
      view.appendChild(el('div', { class: 'grid-2' }, [card('آخر المشبوهين', [sus, el('a', { class: 'linkish', href: '#/visits', text: 'كل الزيارات ‹' })]), card('منين بتيجي الضغطات المشبوهة (مدينة · حي)', [pl])]));
    });
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
      var search = el('input', { type: 'search', placeholder: 'ابحث بالمدينة أو الحي أو الكلمة', 'aria-label': 'بحث' });
      search.value = state.q;
      var seg = el('div', { class: 'seg' });
      var count = function (f) { return list.filter(function (v) { return f === 'all' || v.status === f; }).length; };
      [['all', 'الكل'], ['real', 'حقيقي'], ['suspicious', 'مشبوه'], ['blocked', 'محظور']].forEach(function (f) {
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
        var all = list.filter(function (v) { return (state.filter === 'all' || v.status === state.filter) && (!q || (v.city + v.district + v.kw + (SRC[v.src] || '')).indexOf(q) >= 0); });
        var rows = all.slice(0, shown);
        moreBtn.hidden = all.length <= shown;
        moreBtn.textContent = 'اعرض كمان (' + fmt(all.length - shown) + ' زيارة باقية)';
        rows.forEach(function (v) {
          var tr = el('tr', { tabindex: '0' }, [
            el('td', { class: 'first' }, [el('div', { class: 'acc-name', text: v.city + ' · ' + v.district }), el('span', { class: 'dim', text: timeAr(v.at) })]),
            el('td', { 'data-l': 'المصدر' }, [el('div', { text: SRC[v.src] || v.src }), v.kw ? el('span', { class: 'dim', text: '«' + v.kw + '»' }) : null]),
            el('td', { 'data-l': 'الجهاز', text: v.device + ' · ' + v.os }),
            el('td', { 'data-l': 'الشبكة', text: NET[v.net] }),
            el('td', { 'data-l': 'التفاعل', text: v.pages + ' صفحة · ' + (v.dur < 60 ? v.dur + 'ث' : Math.round(v.dur / 60) + 'د') + (v.contact ? ' · ' + (v.contact === 'wa' ? '💬' : '📞') : '') }),
            el('td', { 'data-l': 'الدرجة' }, [scoreBadge(v)]),
            el('td', { 'data-l': 'الحالة' }, [pill(STATUS[v.status][0], STATUS[v.status][1])]),
          ]);
          tr.addEventListener('click', function () { openVisit(v); });
          tr.addEventListener('keydown', function (e) { if (e.key === 'Enter') openVisit(v); });
          tbody.appendChild(tr);
        });
        if (!rows.length) tbody.appendChild(el('tr', {}, [el('td', { colspan: '7', class: 'empty', text: 'مفيش زيارات بالشكل ده.' })]));
      };
      search.addEventListener('input', function () { state.q = search.value; shown = 25; draw(); });
      draw();
      view.appendChild(el('div', { class: 'status-strip' }, [el('span', { class: 'st live-now' }, [el('i', { class: 'dot live' }), document.createTextNode(live + ' زيارة في آخر 10 دقايق')]), el('span', { class: 'hint', text: 'دوس على أي زيارة تشوف رحلتها بالثانية، وليه اتحكم عليها كده.' })]));
      view.appendChild(card('', [el('div', { class: 'sec-head' }, [el('h2', { text: 'كل زيارة' }), tools]),
        el('div', { class: 'tbl-wrap' }, [el('table', { class: 'tbl' }, [el('thead', {}, [el('tr', {}, ['المكان والوقت', 'المصدر', 'الجهاز', 'الشبكة', 'التفاعل', 'الدرجة', 'الحالة'].map(function (h) { return el('th', { text: h }); }))]), tbody])]), moreBtn]));
    });
  }
  function openVisit(v) {
    var body = clear($('d-body'));
    $('d-title').textContent = v.city + ' · ' + v.district;
    $('d-sub').textContent = timeAr(v.at) + ' · ' + (SRC[v.src] || v.src) + (v.kw ? ' «' + v.kw + '»' : '');
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
  function vLeads(view) {
    return DATA.leads(state.site, state.range).then(function (d) {
      clear(view);
      var L = d.list, won = L.filter(function (l) { return l.outcome === 'تم'; }).length, open = L.filter(function (l) { return !l.outcome; }).length;
      view.appendChild(el('div', { class: 'kpis four' }, [
        kpi('تواصل', fmt(L.length), fmt(L.filter(function (l) { return l.type === 'wa'; }).length) + ' واتساب · ' + fmt(L.filter(function (l) { return l.type === 'call'; }).length) + ' اتصال', 'info'),
        kpi('اتفقوا', fmt(won), pct(won, L.length) + '% من التواصل', 'ok'),
        kpi('تكلفة العميل الحقيقي', won ? money(d.cost / won, d.currency) : '—', 'الصرف ÷ اللي اتفقوا', 'ok'),
        kpi('من غير نتيجة', fmt(open), 'سجّلها من تليجرام أو من هنا', open ? 'warn' : 'mute'),
      ]));
      var dist = {}; L.forEach(function (l) { var k = l.outcome || 'لسه'; dist[k] = (dist[k] || 0) + 1; });
      var ch = el('div');
      C.hbars(ch, ['تم', 'بيفكر', 'لغى', 'مش جاد', 'ماوصلش رسالة', 'لسه'].filter(function (k) { return dist[k]; }).map(function (k) { return { label: k, value: dist[k], cls: k === 'تم' ? 'c-ok' : k === 'لسه' ? 'c-mute' : 'c-data' }; }), { compact: true });
      var tb = el('tbody'), shownL = 25;
      var moreL = el('button', { class: 'btn ghost sm more-rows', type: 'button' });
      var drawL = function () {
      clear(tb);
      moreL.hidden = L.length <= shownL; moreL.textContent = 'اعرض كمان (' + fmt(L.length - shownL) + ' تواصل باقي)';
      L.slice(0, shownL).forEach(function (l) {
        var sel = el('select', { 'aria-label': 'النتيجة' }, ['', 'تم', 'بيفكر', 'لغى', 'مش جاد', 'ماوصلش رسالة'].map(function (o) { return el('option', { value: o, text: o || '— لسه —' }); }));
        sel.value = l.outcome;
        sel.addEventListener('change', function () { l.outcome = sel.value; demoAct('النتيجة اتسجلت: ' + (sel.value || 'لسه')); });
        tb.appendChild(el('tr', {}, [
          el('td', { class: 'first' }, [el('b', { text: (l.type === 'wa' ? '💬 واتساب' : '📞 اتصال') + ' · كود #' + l.code }), el('div', { class: 'dim', text: timeAr(l.at) })]),
          el('td', { 'data-l': 'المصدر' }, [el('div', { text: SRC[l.src] || l.src }), l.kw ? el('span', { class: 'dim', text: '«' + l.kw + '»' }) : null]),
          el('td', { 'data-l': 'المكان', text: l.city + ' · ' + l.district }),
          el('td', { 'data-l': 'النتيجة' }, [sel]),
        ]));
      });
      };
      moreL.addEventListener('click', function () { shownL += 25; drawL(); });
      drawL();
      view.appendChild(el('div', { class: 'grid-2' }, [
        card('النتايج', [ch, el('p', { class: 'hint', text: 'النتيجة بتتسجل بضغطة من رسالة تليجرام اللي بتوصلك مع كل تواصل.' })]),
        card('ليه ده مهم', [el('p', { text: 'المنافسين بيعدّوا الضغطات. إحنا بنعدّ العملاء اللي اتفقوا فعلاً، فتعرف كل كلمة جابتلك كام عميل حقيقي، وبكام.' })]),
      ]));
      view.appendChild(card('كل تواصل', [el('div', { class: 'tbl-wrap' }, [el('table', { class: 'tbl static' }, [el('thead', {}, [el('tr', {}, ['التواصل', 'المصدر', 'المكان', 'النتيجة'].map(function (h) { return el('th', { text: h }); }))]), tb])]), moreL]));
    });
  }

  // ════════ 6) التنبيهات ════════
  function vAlerts(view) {
    return DATA.alerts(state.site).then(function (d) {
      clear(view);
      var CH = { tg: 'تليجرام', push: 'إشعار الموبايل', email: 'إيميل' };
      var list = el('div', { class: 'rules' });
      d.rules.forEach(function (r) {
        var sw = el('button', { class: 'switch', type: 'button', role: 'switch', 'aria-checked': String(r.on), 'aria-label': r.name });
        sw.addEventListener('click', function () { r.on = !r.on; sw.setAttribute('aria-checked', String(r.on)); demoAct((r.on ? 'اتفعّل: ' : 'اتقفل: ') + r.name); });
        var chips = el('div', { class: 'chips' }, Object.keys(CH).map(function (c) {
          var b = el('button', { class: 'chip' + (r.ch.indexOf(c) >= 0 ? ' on' : ''), type: 'button', 'aria-pressed': String(r.ch.indexOf(c) >= 0), text: CH[c] });
          b.addEventListener('click', function () { var i = r.ch.indexOf(c); if (i >= 0) r.ch.splice(i, 1); else r.ch.push(c); b.classList.toggle('on'); b.setAttribute('aria-pressed', String(i < 0)); });
          return b;
        }));
        list.appendChild(el('div', { class: 'rule' }, [el('div', { class: 'r-main' }, [el('b', { text: r.name }), el('span', { class: 'dim', text: r.desc }), chips]), sw]));
      });
      var log = el('ul', { class: 'feed' }, d.log.map(function (x) { return el('li', {}, [el('span', { class: 'pill ' + x.level, text: x.rule }), el('div', {}, [el('span', { text: x.text })]), el('time', { text: timeAr(x.at) })]); }));
      view.appendChild(el('div', { class: 'grid-2' }, [card('التنبيهات', [list]), card('آخر التنبيهات', [log])]));
    });
  }

  // ════════ 7) المواقع والتركيب ════════
  function vSites(view) {
    return DATA.setup().then(function (list) {
      clear(view);
      list.forEach(function (s) {
        var avg = Math.round(s.delivery.reduce(function (a, b) { return a + b; }, 0) / s.delivery.length * 10) / 10;
        var spark = el('div'); C.hbars(spark, s.delivery.map(function (v, i) { return { label: i === s.delivery.length - 1 ? 'امبارح' : 'قبل ' + (s.delivery.length - 1 - i) + ' يوم', value: v, text: v + '%', cls: v >= 99.5 ? 'c-ok' : 'c-sus' }; }).reverse(), { max: 100, compact: true });
        var rows = [
          ['الكود متركب', s.installed, s.installed ? 'بلجن ' + s.plugin + ' · آخر حدث ' + timeAr(s.last_event) : 'لسه'],
          ['التوصيل (آخر 7 أيام)', avg >= 99.5, avg + '% من الأحداث وصلت'],
          ['جوجل أدز', s.ads, s.ads ? 'متربط · \u2066' + s.account + '\u2069' : 'اربط حسابك'],
          ['لاحقة التتبع', s.template, s.template ? 'موجودة' : 'ناقصة: من غيرها مش هنعرف كلمة كل ضغطة'],
          ['أجهزتك المعفية', true, s.own + ' أجهزة'],
        ];
        view.appendChild(card(s.name, [el('p', { class: 'acc-sub', text: s.domain }), el('ul', { class: 'checks' }, rows.map(function (r) { return el('li', { class: r[1] ? 'ok' : 'warn' }, [el('i', { class: 'ck', text: r[1] ? '✓' : '!' }), el('b', { text: r[0] }), el('span', { text: r[2] })]); })), el('details', { class: 'more-d' }, [el('summary', { text: 'التوصيل يوم بيوم' }), spark])]));
      });
      var add = el('button', { class: 'btn', type: 'button', text: '+ أضف موقع' }); add.addEventListener('click', function () { demoAct('افتح البلجن على موقعك واضغط «اربط بـ Maestro LT»'); });
      view.appendChild(add);
    });
  }

  var VIEWS = { overview: vOverview, statement: vStatement, visits: vVisits, protection: vProtection, leads: vLeads, alerts: vAlerts, sites: vSites };

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
    DATA.sites().then(function (s) {
      state.sites = s; state.site = s[0] && s[0].id;
      buildNav(); buildTop(); render();
    });
  }
  start();
})();
