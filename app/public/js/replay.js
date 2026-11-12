// «▶ شوف الزيارة»: تشغيل تسجيل الزيارة (rrweb-player · MIT) بصفحة موقع العميل الحقيقية، وجنبه الحكم و«ليه» واللحظات المهمة.
// الصفحة دي لوحدها سياسة أمانها بتسمح بالـ style المضمّن وصور الموقع (_headers)، علشان المشغّل بيعيد بناء صفحة الموقع جوه إطار مقفول
// (sandbox من غير سكريبتات). باقي اللوحة زي ما هي.
(function () {
  'use strict';
  var LT = window.LT, el = LT.el, clear = LT.clear;
  var $ = function (id) { return document.getElementById(id); };
  var qs = new URLSearchParams(location.search), site = qs.get('site') || '', sid = qs.get('sid') || '';
  var player = null, data = null;
  var T = LT.t;
  var srcName = function (k) { var x = T('src.' + k); return x === 'src.' + k ? (k || T('src.direct')) : x; };
  var STATUS = { real: [T('status.real'), 'ok'], suspicious: [T('status.suspicious'), 'warn'], high: [T('status.high'), 'bad'] };

  function toast(msg) { var t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(function () { t.hidden = true; }, 3000); }
  function mmss(ms) { var s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  function fail(msg) { var p = clear($('player')); p.appendChild(el('div', { class: 'callout' }, [el('b', { text: msg }), el('span', { text: T('rp.fail.hint') })])); }

  // اللحظات المهمة من التسجيل نفسه: فتح صفحة (Meta) · ضغطة/لمسة (MouseInteraction: Click=2 · TouchEnd=9) · نزل في الصفحة
  function marks(events) {
    var t0 = events[0].timestamp, out = [], lastScroll = -1;
    events.forEach(function (e) {
      var at = e.timestamp - t0;
      if (e.type === 4 && e.data && e.data.href) { var p = ''; try { p = decodeURIComponent(new URL(e.data.href).pathname); } catch (x) { p = e.data.href; } out.push({ at: at, kind: 'page', text: T('rp.m.page', { p: p === '/' ? T('rp.home') : '«' + p.slice(0, 50) + '»' }) }); }
      else if (e.type === 3 && e.data && e.data.source === 2 && (e.data.type === 2 || e.data.type === 9)) out.push({ at: at, kind: 'click', text: T(e.data.type === 9 ? 'rp.m.touch' : 'rp.m.click') });
      else if (e.type === 3 && e.data && e.data.source === 3 && at - lastScroll > 8000) { lastScroll = at; out.push({ at: at, kind: 'scroll', text: T('rp.m.scroll') }); }
    });
    // ضغطات ورا بعض في نفس الثانية = لحظة واحدة
    return out.filter(function (m, i) { var prev = out[i - 1]; return !prev || prev.kind !== m.kind || m.at - prev.at > 1500; }).slice(0, 60);
  }

  function drawMarks(events) {
    var ol = clear($('rp-marks')), list = marks(events);
    if (!list.length) { ol.appendChild(el('li', { class: 'dim', text: T('rp.m.none') })); return; }
    list.forEach(function (m) {
      var b = el('button', { type: 'button', class: 'rp-mark k-' + m.kind }, [el('time', { text: mmss(m.at) }), el('span', { text: m.text })]);
      b.addEventListener('click', function () { if (player) { player.goto(m.at, true); } });
      ol.appendChild(el('li', {}, [b]));
    });
  }

  function drawVerdict(v) {
    var box = clear($('rp-verdict'));
    if (!v) { box.appendChild(el('p', { class: 'muted', text: T('rp.novisit') })); return; }
    var st = v.verdict === 'fraud' ? 'high' : v.verdict === 'real' ? 'real' : v.status;
    var title = v.verdict === 'fraud' ? T('verdict.fraud') : v.verdict === 'real' ? T('verdict.real') : (STATUS[st] || [T('visit.one')])[0];
    box.appendChild(el('div', { class: 'verdict s-' + (STATUS[st] ? st : 'none') }, [
      el('div', { class: 'vd-score' }, [el('b', { text: v.score == null ? '—' : String(v.score) }), el('small', { text: T('visit.of100') })]),
      el('div', {}, [el('b', { text: title }), el('span', { text: T(v.verdict ? 'rp.yours' : v.status === 'real' ? 'rp.nothing' : 'rp.below') })]),
    ]));
    if (v.checks && v.checks.length) box.appendChild(el('ul', { class: 'checks vchecks' }, v.checks.map(function (c) {
      var cls = c.ok === true ? 'ok' : c.ok === false ? 'bad' : 'soon';
      return el('li', { class: cls }, [el('i', { class: 'ck', text: c.ok === true ? '✓' : c.ok === false ? '✗' : '—' }), el('b', { text: c.label }), el('span', { text: c.detail })]);
    })));
    var why = (v.reasons || []).filter(function (r) { return !/^(حكمك|Your review)/.test(r); });
    if (why.length) box.appendChild(el('ul', { class: 'why' }, why.map(function (r) { return el('li', { text: r }); })));
    if (v.outside) box.appendChild(el('p', { class: 'hint', text: T('rp.outside') }));
    var acts = el('div', { class: 'row-btns' });
    var set = function (val) {
      LT.api('/v1/dash/verdict', { method: 'POST', body: { site: site, sid: sid, verdict: val } }).then(function (r) {
        if (!r.ok) { toast(T(r.status === 403 ? 'verdict.err.role' : 'err.save')); return; }
        v.verdict = val; if (val === 'real') v.status = 'real'; if (val === 'fraud') { v.status = 'high'; v.score = Math.max(v.score || 0, 90); }
        toast(T(val === 'real' ? 'rp.saved.real' : val === 'fraud' ? 'rp.saved.fraud' : 'verdict.saved.undo')); drawVerdict(v);
      });
    };
    if (v.verdict) { var u = el('button', { class: 'btn ghost sm', type: 'button', text: T('verdict.undo') }); u.addEventListener('click', function () { set(null); }); acts.appendChild(u); }
    else {
      var a = el('button', { class: 'btn ghost sm', type: 'button', text: T('verdict.real') }), b = el('button', { class: 'btn sm', type: 'button', text: T('verdict.fraud') });
      a.addEventListener('click', function () { set('real'); }); b.addEventListener('click', function () { set('fraud'); });
      acts.appendChild(a); acts.appendChild(b);
    }
    box.appendChild(acts);
  }

  function drawFacts(v, d) {
    var dl = clear($('rp-facts')), rows = [];
    var dur = d.events.length > 1 ? d.events[d.events.length - 1].timestamp - d.events[0].timestamp : 0;
    if (v) rows.push([T('f.place'), [v.city, v.region, v.country].filter(Boolean).join(' · ') || '—'], [T('f.source'), (srcName(v.source) || '—') + (v.detail ? ' · ' + v.detail : '')], [T('f.device'), [v.device, v.os, v.browser].filter(Boolean).join(' · ') || '—'], [T('f.network'), v.isp || '—']);
    rows.push([T('rp.f.length'), mmss(dur)]);
    if (v && v.contact) rows.push([T('kpi.contacts'), T(v.contact.indexOf('wa') >= 0 ? 'wa' : 'call') + (v.code ? ' · #' + v.code : '')]);
    if (v && v.repeats > 1) rows.push([T('f.repeats'), LT.n(v.repeats, 'time')]);
    rows.forEach(function (r) { dl.appendChild(el('dt', { text: r[0] })); dl.appendChild(el('dd', { text: r[1] })); });
  }

  function size(events) {
    var meta = events.filter(function (e) { return e.type === 4 && e.data && e.data.width; })[0];
    var box = $('player').getBoundingClientRect();
    var w = Math.max(280, Math.floor(box.width || 600)), ratio = meta ? meta.data.height / meta.data.width : 0.62;
    var h = Math.min(Math.round(w * ratio), Math.round(window.innerHeight * 0.68));
    return { w: w, h: Math.max(220, h) };
  }

  function play(d) {
    var host = clear($('player'));
    if (!d.events || d.events.length < 2 || !d.events.some(function (e) { return e.type === 2; })) { fail(T('rp.fail.incomplete')); return; }
    var P = window.rrwebPlayer && (window.rrwebPlayer.default || window.rrwebPlayer);
    if (typeof P !== 'function') { fail(T('rp.fail.player')); return; }
    var s = size(d.events);
    try {
      player = new P({ target: host, props: { events: d.events, width: s.w, height: s.h, autoPlay: false, skipInactive: true, speedOption: [1, 2, 4, 8], showController: true, mouseTail: { strokeStyle: '#d6336c', lineWidth: 3 } } });
    } catch (e) { fail(T('rp.fail.play')); }
  }

  // مبسّط / احترافي: نفس اختيار اللوحة (sessionStorage، نفس المفتاح)
  var level = 'simple';
  try { var lv = sessionStorage.getItem('lt_level'); if (lv === 'simple' || lv === 'detailed') level = lv; } catch (e) { /* عادي */ }
  function applyLevel() {
    document.body.classList.toggle('level-simple', level === 'simple');
    document.body.classList.toggle('level-detailed', level !== 'simple');
    var seg = clear($('level'));
    [['simple', T('level.simple')], ['detailed', T('level.detailed')]].forEach(function (x) {
      var b = el('button', { type: 'button', 'aria-pressed': String(level === x[0]), text: x[1] });
      b.addEventListener('click', function () { level = x[0]; try { sessionStorage.setItem('lt_level', level); } catch (e) { /* عادي */ } applyLevel(); });
      seg.appendChild(b);
    });
  }
  // الحكاية في سطر (للمبسّط)
  function story(v, d) {
    var dur = d.events.length > 1 ? Math.round((d.events[d.events.length - 1].timestamp - d.events[0].timestamp) / 1000) : 0;
    var who = v && v.city ? T('rp.s.who', { c: v.city }) : T('rp.s.who0');
    var from = v ? T('rp.s.from', { s: srcName(v.source) }) + (v.detail ? T('rp.s.kw', { k: v.detail }) : '') : '';
    var clicks = d.events.filter(function (e) { return e.type === 3 && e.data && e.data.source === 2 && (e.data.type === 2 || e.data.type === 9); }).length;
    var txt = who + from + T('rp.s.stayed', { t: dur < 60 ? LT.n(dur, 'second') : LT.n(Math.round(dur / 60), 'minute') }) + (clicks ? T('rp.s.clicked', { n: LT.n(clicks, 'time') }) : T('rp.s.noclick')) + (v && v.contact ? T(v.contact.indexOf('wa') >= 0 ? 'rp.s.wa' : 'rp.s.call') : T('rp.s.nocontact'));
    $('rp-story').textContent = txt;
  }

  function start() {
    applyLevel();
    if (!/^[A-Za-z0-9]{6,20}$/.test(site) || !/^[A-Za-z0-9_-]{4,64}$/.test(sid)) { fail(T('rp.fail.link')); return; }
    $('back').setAttribute('href', '/?site=' + encodeURIComponent(site) + '#/visits');
    LT.me().then(function (m) {
      if (!m) { location.replace(LT.loginUrl(location.pathname + location.search)); return; }
      var stored = null; try { stored = sessionStorage.getItem('lt_level'); } catch (e) { /* عادي */ }
      if (!stored) { level = (m.orgs || []).some(function (o) { return o.type === 'agency'; }) ? 'detailed' : 'simple'; applyLevel(); }
      return LT.api('/v1/dash/replay?site=' + encodeURIComponent(site) + '&sid=' + encodeURIComponent(sid)).then(function (r) {
        if (r.status === 401) { location.replace(LT.loginUrl(location.pathname + location.search)); return; }
        if (r.status === 404) { fail(T(r.body && r.body.error === 'no_replay' ? 'rp.fail.none' : 'rp.fail.notyours')); return; }
        if (!r.ok) { fail(T('rp.fail.load')); return; }
        data = r.body;
        var v = data.visit;
        $('rp-h').textContent = v ? ([v.city, v.region].filter(Boolean).join(' · ') || T('visit.one')) : T('visit.one');
        $('rp-sub').textContent = (data.site ? data.site.name + ' · ' : '') + (function () { try { return new Date(data.started_at).toLocaleString('ar-EG-u-nu-latn', { weekday: 'short', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } })();
        drawVerdict(v); drawFacts(v, data); drawMarks(data.events); story(v, data); play(data);
      });
    }).catch(function () { fail(T('rp.fail.load')); });
  }
  start();
})();
