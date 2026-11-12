// «▶ شوف الزيارة»: تشغيل تسجيل الزيارة (rrweb-player · MIT) بصفحة موقع العميل الحقيقية، وجنبه الحكم و«ليه» واللحظات المهمة.
// الصفحة دي لوحدها سياسة أمانها بتسمح بالـ style المضمّن وصور الموقع (_headers)، علشان المشغّل بيعيد بناء صفحة الموقع جوه إطار مقفول
// (sandbox من غير سكريبتات). باقي اللوحة زي ما هي.
(function () {
  'use strict';
  var LT = window.LT, el = LT.el, clear = LT.clear;
  var $ = function (id) { return document.getElementById(id); };
  var qs = new URLSearchParams(location.search), site = qs.get('site') || '', sid = qs.get('sid') || '';
  var player = null, data = null;
  var SRC = { google_ads: 'إعلان جوجل', google_organic: 'بحث جوجل', google_maps: 'خرائط جوجل', direct: 'مباشر', facebook: 'فيسبوك', instagram: 'إنستجرام', tiktok: 'تيك توك', snapchat: 'سناب شات' };
  var STATUS = { real: ['حقيقي', 'ok'], suspicious: ['مشبوه', 'warn'], high: ['خطر عالي', 'bad'] };

  function toast(msg) { var t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(function () { t.hidden = true; }, 3000); }
  function mmss(ms) { var s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  function fail(msg) { var p = clear($('player')); p.appendChild(el('div', { class: 'callout' }, [el('b', { text: msg }), el('span', { text: 'لو الزيارة لسه بتحصل، التسجيل بيوصل كل كام ثانية. جرّب تاني بعد شوية.' })])); }

  // اللحظات المهمة من التسجيل نفسه: فتح صفحة (Meta) · ضغطة/لمسة (MouseInteraction: Click=2 · TouchEnd=9) · نزل في الصفحة
  function marks(events) {
    var t0 = events[0].timestamp, out = [], lastScroll = -1;
    events.forEach(function (e) {
      var at = e.timestamp - t0;
      if (e.type === 4 && e.data && e.data.href) { var p = ''; try { p = decodeURIComponent(new URL(e.data.href).pathname); } catch (x) { p = e.data.href; } out.push({ at: at, kind: 'page', text: 'فتح صفحة ' + (p === '/' ? 'الرئيسية' : '«' + p.slice(0, 50) + '»') }); }
      else if (e.type === 3 && e.data && e.data.source === 2 && (e.data.type === 2 || e.data.type === 9)) out.push({ at: at, kind: 'click', text: e.data.type === 9 ? 'لمس الشاشة' : 'ضغط' });
      else if (e.type === 3 && e.data && e.data.source === 3 && at - lastScroll > 8000) { lastScroll = at; out.push({ at: at, kind: 'scroll', text: 'بينزل في الصفحة' }); }
    });
    // ضغطات ورا بعض في نفس الثانية = لحظة واحدة
    return out.filter(function (m, i) { var prev = out[i - 1]; return !prev || prev.kind !== m.kind || m.at - prev.at > 1500; }).slice(0, 60);
  }

  function drawMarks(events) {
    var ol = clear($('rp-marks')), list = marks(events);
    if (!list.length) { ol.appendChild(el('li', { class: 'dim', text: 'الزائر ماتحركش.' })); return; }
    list.forEach(function (m) {
      var b = el('button', { type: 'button', class: 'rp-mark k-' + m.kind }, [el('time', { text: mmss(m.at) }), el('span', { text: m.text })]);
      b.addEventListener('click', function () { if (player) { player.goto(m.at, true); } });
      ol.appendChild(el('li', {}, [b]));
    });
  }

  function drawVerdict(v) {
    var box = clear($('rp-verdict'));
    if (!v) { box.appendChild(el('p', { class: 'muted', text: 'بيانات الزيارة مش متاحة.' })); return; }
    var st = v.verdict === 'fraud' ? 'high' : v.verdict === 'real' ? 'real' : v.status;
    var title = v.verdict === 'fraud' ? 'مشبوه أكيد' : v.verdict === 'real' ? 'زبون حقيقي' : (STATUS[st] || ['زيارة'])[0];
    box.appendChild(el('div', { class: 'verdict s-' + (STATUS[st] ? st : 'none') }, [
      el('div', { class: 'vd-score' }, [el('b', { text: v.score == null ? '—' : String(v.score) }), el('small', { text: 'من 100' })]),
      el('div', {}, [el('b', { text: title }), el('span', { text: v.verdict ? 'ده حكمك.' : v.status === 'real' ? 'مفيش حاجة غريبة كفاية نشك فيه.' : 'الأسباب تحت.' })]),
    ]));
    var why = (v.reasons || []).filter(function (r) { return r.indexOf('انت ') !== 0; });
    if (why.length) box.appendChild(el('ul', { class: 'why' }, why.map(function (r) { return el('li', { text: r }); })));
    if (v.outside) box.appendChild(el('p', { class: 'hint', text: 'الزيارة دي من بره البلد اللي موقعك مستهدفه.' }));
    var acts = el('div', { class: 'row-btns' });
    var set = function (val) {
      LT.api('/v1/dash/verdict', { method: 'POST', body: { site: site, sid: sid, verdict: val } }).then(function (r) {
        if (!r.ok) { toast(r.status === 403 ? 'صلاحيتك مشاهدة بس، مينفعش تحكم' : 'مااتسجلش. جرّب تاني.'); return; }
        v.verdict = val; if (val === 'real') v.status = 'real'; if (val === 'fraud') { v.status = 'high'; v.score = Math.max(v.score || 0, 90); }
        toast(val === 'real' ? 'اتسجل إنه زبون حقيقي' : val === 'fraud' ? 'اتسجل إنه مشبوه أكيد' : 'الحكم اترجع'); drawVerdict(v);
      });
    };
    if (v.verdict) { var u = el('button', { class: 'btn ghost sm', type: 'button', text: 'رجّع حكمي' }); u.addEventListener('click', function () { set(null); }); acts.appendChild(u); }
    else {
      var a = el('button', { class: 'btn ghost sm', type: 'button', text: 'ده زبون حقيقي' }), b = el('button', { class: 'btn sm', type: 'button', text: 'مشبوه أكيد' });
      a.addEventListener('click', function () { set('real'); }); b.addEventListener('click', function () { set('fraud'); });
      acts.appendChild(a); acts.appendChild(b);
    }
    box.appendChild(acts);
  }

  function drawFacts(v, d) {
    var dl = clear($('rp-facts')), rows = [];
    var dur = d.events.length > 1 ? d.events[d.events.length - 1].timestamp - d.events[0].timestamp : 0;
    if (v) rows.push(['المكان', [v.city, v.region, v.country].filter(Boolean).join(' · ') || '—'], ['المصدر', (SRC[v.source] || v.source || '—') + (v.detail ? ' · ' + v.detail : '')], ['الجهاز', [v.device, v.os, v.browser].filter(Boolean).join(' · ') || '—'], ['الشبكة', v.isp || '—']);
    rows.push(['مدة التسجيل', mmss(dur)]);
    if (v && v.contact) rows.push(['تواصل', (v.contact.indexOf('wa') >= 0 ? 'واتساب' : 'اتصال') + (v.code ? ' · #' + v.code : '')]);
    if (v && v.repeats > 1) rows.push(['نفس الجهاز من الإعلان', v.repeats + ' مرات']);
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
    if (!d.events || d.events.length < 2 || !d.events.some(function (e) { return e.type === 2; })) { fail('التسجيل ناقص ومينفعش يتشغّل'); return; }
    var P = window.rrwebPlayer && (window.rrwebPlayer.default || window.rrwebPlayer);
    if (typeof P !== 'function') { fail('المشغّل ماتحمّلش'); return; }
    var s = size(d.events);
    try {
      player = new P({ target: host, props: { events: d.events, width: s.w, height: s.h, autoPlay: false, skipInactive: true, speedOption: [1, 2, 4, 8], showController: true, mouseTail: { strokeStyle: '#d6336c', lineWidth: 3 } } });
    } catch (e) { fail('مقدرناش نشغّل التسجيل'); }
  }

  function start() {
    if (!/^[A-Za-z0-9]{6,20}$/.test(site) || !/^[A-Za-z0-9_-]{4,64}$/.test(sid)) { fail('رابط الزيارة مش مظبوط'); return; }
    $('back').setAttribute('href', '/?site=' + encodeURIComponent(site) + '#/visits');
    LT.me().then(function (m) {
      if (!m) { location.replace(LT.loginUrl(location.pathname + location.search)); return; }
      return LT.api('/v1/dash/replay?site=' + encodeURIComponent(site) + '&sid=' + encodeURIComponent(sid)).then(function (r) {
        if (r.status === 401) { location.replace(LT.loginUrl(location.pathname + location.search)); return; }
        if (r.status === 404) { fail(r.body && r.body.error === 'no_replay' ? 'مفيش تسجيل للزيارة دي' : 'الزيارة دي مش في حسابك'); return; }
        if (!r.ok) { fail('مقدرناش نحمّل التسجيل'); return; }
        data = r.body;
        var v = data.visit;
        $('rp-h').textContent = v ? ([v.city, v.region].filter(Boolean).join(' · ') || 'زيارة') : 'زيارة';
        $('rp-sub').textContent = (data.site ? data.site.name + ' · ' : '') + (function () { try { return new Date(data.started_at).toLocaleString('ar-EG-u-nu-latn', { weekday: 'short', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } })();
        drawVerdict(v); drawFacts(v, data); drawMarks(data.events); play(data);
      });
    }).catch(function () { fail('مقدرناش نحمّل التسجيل'); });
  }
  start();
})();
