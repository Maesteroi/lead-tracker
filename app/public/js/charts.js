// رسوم اللوحة (SVG من غير مكتبات، علشان الـCSP). على قواعد claude/design-system.md ومهارة الرسوم:
// خطوط رفيعة · فاصل 2px بين الأجزاء · طرف دايري 4px · مفتاح ألوان دايماً · تلميح عند الوقوف · «عرض كجدول» · المحور الزمني من اليمين للشمال (عربي).
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var el = window.LT.el;
  var T = function (k, v) { return window.LT.t ? window.LT.t(k, v) : k; };
  function s(tag, attrs) { var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }
  var fmt = function (n) { return Number(n || 0).toLocaleString('en-US'); };
  function niceMax(v) { if (v <= 5) return 5; var p = Math.pow(10, Math.floor(Math.log10(v))); var m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; }
  function dayLabel(d) { var p = d.split('-'); return Number(p[2]) + '/' + Number(p[1]); }

  // أعمدة مكدّسة لكل يوم. series: [{ key, label, cls }] (cls = لون من التصميم)
  function stacked(box, rows, series, opts) {
    opts = opts || {};
    var wrap = el('div', { class: 'chart' });
    var legend = el('div', { class: 'chart-legend', role: 'list' });
    series.forEach(function (sr) { legend.appendChild(el('span', { class: 'lg', role: 'listitem' }, [el('i', { class: 'sw ' + sr.cls }), document.createTextNode(sr.label)])); });
    var tbtn = el('button', { class: 'linkish', type: 'button', text: T('ch.as_table') });
    var head = el('div', { class: 'chart-head' }, [legend, tbtn]);
    var W = 720, H = opts.height || 220, padT = 10, padB = 26, padS = 36;
    var max = niceMax(Math.max.apply(null, rows.map(function (r) { return series.reduce(function (a, sr) { return a + (r[sr.key] || 0); }, 0); }).concat([1])));
    var svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'svg', role: 'img', 'aria-label': opts.label || '' });
    var plotW = W - padS - 8, plotH = H - padT - padB;
    // العربي: أقدم يوم يمين والمحور يمين · الإنجليزي (LTR): نفس الرسم معكوس
    var LTR = window.LT.dir === 'ltr', X = function (x) { return LTR ? W - x : x; };
    for (var g = 0; g <= 3; g++) {
      var y = padT + plotH - (plotH * g) / 3;
      svg.appendChild(s('line', { x1: X(8), x2: X(W - padS), y1: y, y2: y, class: g ? 'grid' : 'axis' }));
      var t = s('text', { x: X(W - padS + 6), y: y + 4, class: 'tick', 'text-anchor': LTR ? 'end' : 'start' }); t.textContent = fmt(Math.round((max * g) / 3)); svg.appendChild(t);
    }
    var n = rows.length, slot = plotW / n, bw = Math.max(3, Math.min(22, slot * 0.62));
    var tip = el('div', { class: 'tip', hidden: '' });
    rows.forEach(function (r, i) {
      // RTL: أقدم يوم يمين، وأحدث يوم شمال
      var cx = X(W - padS - slot * (i + 0.5)), yb = padT + plotH, total = 0;
      var segs = series.filter(function (sr) { return (r[sr.key] || 0) > 0; });
      segs.forEach(function (sr, j) {
        var v = r[sr.key], h = (plotH * v) / max, gap = j < segs.length - 1 ? 2 : 0;
        var top = yb - h, last = j === segs.length - 1;
        var hh = Math.max(0, h - gap);
        if (last && hh > 4) {
          var x0 = cx - bw / 2, rr = Math.min(4, bw / 2);
          svg.appendChild(s('path', { class: 'mk ' + sr.cls, d: 'M' + x0 + ',' + (top + hh + gap) + 'V' + (top + rr) + 'Q' + x0 + ',' + top + ' ' + (x0 + rr) + ',' + top + 'H' + (x0 + bw - rr) + 'Q' + (x0 + bw) + ',' + top + ' ' + (x0 + bw) + ',' + (top + rr) + 'V' + (top + hh + gap) + 'Z' }));
        } else svg.appendChild(s('rect', { class: 'mk ' + sr.cls, x: cx - bw / 2, y: top + gap, width: bw, height: hh }));
        yb = top; total += v;
      });
      if (i % Math.ceil(n / 7) === 0 || i === n - 1) { var xl = s('text', { x: cx, y: H - 8, class: 'tick', 'text-anchor': 'middle' }); xl.textContent = dayLabel(r.day); svg.appendChild(xl); }
      var hit = s('rect', { x: cx - slot / 2, y: padT, width: slot, height: plotH, class: 'hit', tabindex: '0', 'aria-label': r.day });
      var show = function () {
        LT.clear(tip);
        tip.appendChild(el('b', { text: r.day }));
        series.forEach(function (sr) { tip.appendChild(el('div', { class: 'tr' }, [el('i', { class: 'sw ' + sr.cls }), el('span', { text: sr.label }), el('b', { text: fmt(r[sr.key]) })])); });
        tip.hidden = false;
        var rect = svg.getBoundingClientRect(), px = (cx / W) * rect.width;
        tip.style.left = Math.min(rect.width - 170, Math.max(0, px - 85)) + 'px';
        hit.setAttribute('class', 'hit on');
      };
      var hide = function () { tip.hidden = true; hit.setAttribute('class', 'hit'); };
      hit.addEventListener('mouseenter', show); hit.addEventListener('focus', show);
      hit.addEventListener('mouseleave', hide); hit.addEventListener('blur', hide);
      svg.appendChild(hit);
    });
    var plot = el('div', { class: 'plot' }, [svg, tip]);
    var table = tableView(rows, [{ key: 'day', label: T('ch.day') }].concat(series));
    table.hidden = true;
    tbtn.addEventListener('click', function () { var on = table.hidden; table.hidden = !on; plot.hidden = on; tbtn.textContent = on ? T('ch.as_chart') : T('ch.as_table'); });
    wrap.appendChild(head); wrap.appendChild(plot); wrap.appendChild(table);
    box.appendChild(wrap);
    return wrap;
  }

  function tableView(rows, cols) {
    var tb = el('tbody');
    rows.slice().reverse().forEach(function (r) { tb.appendChild(el('tr', {}, cols.map(function (c) { return el('td', { text: c.key === 'day' ? r.day : fmt(r[c.key]) }); }))); });
    return el('div', { class: 'tview' }, [el('table', { class: 'mini' }, [el('thead', {}, [el('tr', {}, cols.map(function (c) { return el('th', { text: c.label }); }))]), tb])]);
  }

  // أعمدة أفقية: rows [{ label, value, sub, cls }]. بتكبر من اليمين.
  function hbars(box, rows, opts) {
    opts = opts || {};
    var max = opts.max || Math.max.apply(null, rows.map(function (r) { return r.value; }).concat([1]));
    var list = el('div', { class: 'hbars' + (opts.compact ? ' compact' : '') });
    rows.forEach(function (r) {
      var fill = el('i', { class: 'f ' + (r.cls || 'c-data') });
      fill.style.width = Math.max(r.value ? 1.5 : 0, (r.value / max) * 100) + '%';
      list.appendChild(el('div', { class: 'hb' }, [
        el('div', { class: 'hb-l' }, [el('span', { text: r.label }), r.sub ? el('small', { text: r.sub }) : null]),
        el('div', { class: 'hb-t' }, [fill]),
        el('b', { class: 'hb-v', text: r.text || fmt(r.value) }),
      ]));
    });
    box.appendChild(list);
    return list;
  }

  // ═══════ مكتبة الرسوم الاحترافية (12 نوفمبر): منحنى بتدرّج · دائرة · حلقة · خط صغير · خريطة أوقات ═══════
  var uid = 0;
  var LTR = function () { return window.LT.dir === 'ltr'; };
  // منحنى ناعم من غير ما يعدّي القيم (monotone cubic: Fritsch–Carlson)
  function smooth(pts) {
    if (pts.length < 2) return pts.length ? 'M' + pts[0][0] + ',' + pts[0][1] : '';
    var n = pts.length, d = [], m = [];
    for (var i = 0; i < n - 1; i++) d.push((pts[i + 1][1] - pts[i][1]) / ((pts[i + 1][0] - pts[i][0]) || 1));
    m[0] = d[0]; m[n - 1] = d[n - 2];
    for (i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (i = 0; i < n - 1; i++) { if (!d[i]) { m[i] = 0; m[i + 1] = 0; continue; } var a = m[i] / d[i], b = m[i + 1] / d[i], h = a * a + b * b; if (h > 9) { var t = 3 / Math.sqrt(h); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; } }
    var out = 'M' + pts[0][0].toFixed(1) + ',' + pts[0][1].toFixed(1);
    for (i = 0; i < n - 1; i++) { var dx = (pts[i + 1][0] - pts[i][0]) / 3; out += 'C' + (pts[i][0] + dx).toFixed(1) + ',' + (pts[i][1] + m[i] * dx).toFixed(1) + ' ' + (pts[i + 1][0] - dx).toFixed(1) + ',' + (pts[i + 1][1] - m[i + 1] * dx).toFixed(1) + ' ' + pts[i + 1][0].toFixed(1) + ',' + pts[i + 1][1].toFixed(1); }
    return out;
  }
  function gradient(defs, id, cls) {
    var g = s('linearGradient', { id: id, x1: '0', y1: '0', x2: '0', y2: '1', class: 'grad ' + cls });
    g.appendChild(s('stop', { offset: '0%', class: 'g0' })); g.appendChild(s('stop', { offset: '100%', class: 'g1' }));
    defs.appendChild(g);
  }
  // منحنى المساحة: rows [{day, …}] · series [{key, label, cls}] (متراكبين مش فوق بعض)
  function area(box, rows, series, opts) {
    opts = opts || {};
    var W = 720, H = opts.height || 250, padT = 14, padB = 28, padS = 40, ltr = LTR(), X = function (x) { return ltr ? W - x : x; };
    var max = niceMax(Math.max.apply(null, [1].concat(rows.map(function (r) { return Math.max.apply(null, series.map(function (sr) { return r[sr.key] || 0; })); }))));
    var svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'svg area-chart', role: 'img', 'aria-label': opts.label || '' });
    var defs = s('defs', {}); svg.appendChild(defs);
    var plotW = W - padS - 10, plotH = H - padT - padB, n = rows.length;
    var xAt = function (i) { return X(W - padS - (n === 1 ? plotW / 2 : (plotW * i) / (n - 1))); };
    var yAt = function (v) { return padT + plotH - (plotH * v) / max; };
    for (var g = 0; g <= 4; g++) {
      var y = padT + plotH - (plotH * g) / 4;
      svg.appendChild(s('line', { x1: X(10), x2: X(W - padS), y1: y, y2: y, class: g ? 'grid' : 'axis' }));
      var t = s('text', { x: X(W - padS + 8), y: y + 4, class: 'tick', 'text-anchor': ltr ? 'end' : 'start' }); t.textContent = fmt(Math.round((max * g) / 4)); svg.appendChild(t);
    }
    var step = Math.max(1, Math.ceil(n / 7));
    rows.forEach(function (r, i) { if (i % step === 0 || i === n - 1) { var xl = s('text', { x: xAt(i), y: H - 8, class: 'tick', 'text-anchor': 'middle' }); xl.textContent = dayLabel(r.day); svg.appendChild(xl); } });
    series.forEach(function (sr, si) {
      var id = 'g' + (++uid); gradient(defs, id, sr.cls);
      var pts = rows.map(function (r, i) { return [xAt(i), yAt(r[sr.key] || 0)]; });
      var line = smooth(pts);
      var fillD = line + 'L' + pts[pts.length - 1][0].toFixed(1) + ',' + (padT + plotH) + 'L' + pts[0][0].toFixed(1) + ',' + (padT + plotH) + 'Z';
      svg.appendChild(s('path', { d: fillD, fill: 'url(#' + id + ')', class: 'a-fill a-in' }));
      svg.appendChild(s('path', { d: line, class: 'a-line draw ' + sr.cls, pathLength: '1' }));
    });
    // التفاعل: خط رأسي + نقط + بطاقة
    var guide = s('line', { y1: padT, y2: padT + plotH, class: 'guide', visibility: 'hidden' }); svg.appendChild(guide);
    var dots = series.map(function (sr) { var c = s('circle', { r: 4.5, class: 'a-dot ' + sr.cls, visibility: 'hidden' }); svg.appendChild(c); return c; });
    var tip = el('div', { class: 'tip', hidden: '' });
    var slot = n > 1 ? plotW / (n - 1) : plotW;
    rows.forEach(function (r, i) {
      var cx = xAt(i);
      var hit = s('rect', { x: cx - slot / 2, y: padT, width: slot, height: plotH, class: 'hit', tabindex: '0', 'aria-label': r.day });
      var show = function () {
        guide.setAttribute('x1', cx); guide.setAttribute('x2', cx); guide.setAttribute('visibility', 'visible');
        series.forEach(function (sr, k) { dots[k].setAttribute('cx', cx); dots[k].setAttribute('cy', yAt(r[sr.key] || 0)); dots[k].setAttribute('visibility', 'visible'); });
        LT.clear(tip); tip.appendChild(el('b', { text: r.day }));
        series.forEach(function (sr) { tip.appendChild(el('div', { class: 'tr' }, [el('i', { class: 'sw ' + sr.cls }), el('span', { text: sr.label }), el('b', { text: fmt(r[sr.key]) })])); });
        tip.hidden = false;
        var rect = svg.getBoundingClientRect(), px = (cx / W) * rect.width;
        tip.style.left = Math.min(rect.width - 170, Math.max(0, px - 85)) + 'px';
      };
      var hide = function () { tip.hidden = true; guide.setAttribute('visibility', 'hidden'); dots.forEach(function (d) { d.setAttribute('visibility', 'hidden'); }); };
      hit.addEventListener('mouseenter', show); hit.addEventListener('focus', show); hit.addEventListener('mouseleave', hide); hit.addEventListener('blur', hide);
      svg.appendChild(hit);
    });
    var legend = el('div', { class: 'chart-legend', role: 'list' }, series.map(function (sr) { return el('span', { class: 'lg', role: 'listitem' }, [el('i', { class: 'sw ' + sr.cls }), document.createTextNode(sr.label)]); }));
    var tbtn = el('button', { class: 'linkish', type: 'button', text: T('ch.as_table') });
    var plot = el('div', { class: 'plot' }, [svg, tip]);
    var table = tableView(rows, [{ key: 'day', label: T('ch.day') }].concat(series)); table.hidden = true;
    tbtn.addEventListener('click', function () { var on = table.hidden; table.hidden = !on; plot.hidden = on; tbtn.textContent = on ? T('ch.as_chart') : T('ch.as_table'); });
    var wrap = el('div', { class: 'chart' }, [el('div', { class: 'chart-head' }, [legend, tbtn]), plot, table]);
    box.appendChild(wrap);
    return wrap;
  }
  // دايرة النِّسب: items [{label, value, cls}] · في النص: المجموع وكلمة تحته
  function donut(box, items, opts) {
    opts = opts || {};
    var total = items.reduce(function (a, x) { return a + (x.value || 0); }, 0);
    var R = 52, C = 2 * Math.PI * R, off = 0;
    var svg = s('svg', { viewBox: '0 0 140 140', class: 'donut', role: 'img', 'aria-label': opts.label || '' });
    svg.appendChild(s('circle', { cx: 70, cy: 70, r: R, class: 'd-track' }));
    items.forEach(function (x, i) {
      if (!x.value) return;
      var len = (x.value / (total || 1)) * C, gap = items.length > 1 ? Math.min(3, len / 3) : 0;
      var c = s('circle', { cx: 70, cy: 70, r: R, class: 'd-seg ' + (x.cls || 'c-data'), 'stroke-dasharray': Math.max(0, len - gap).toFixed(2) + ' ' + C.toFixed(2), 'stroke-dashoffset': (-off).toFixed(2), transform: 'rotate(-90 70 70)' });
      c.style.animationDelay = (i * 0.08) + 's';
      var t = s('title', {}); t.textContent = x.label + ': ' + fmt(x.value); c.appendChild(t);
      svg.appendChild(c); off += len;
    });
    var tv = s('text', { x: 70, y: 70, class: 'd-val', 'text-anchor': 'middle' }); tv.textContent = opts.center != null ? opts.center : fmt(total); svg.appendChild(tv);
    var tl = s('text', { x: 70, y: 90, class: 'd-cap', 'text-anchor': 'middle' }); tl.textContent = opts.caption || ''; svg.appendChild(tl);
    var leg = el('ul', { class: 'd-legend' }, items.map(function (x) { return el('li', {}, [el('i', { class: 'sw ' + (x.cls || 'c-data') }), el('span', { text: x.label }), el('b', { text: (total ? Math.round((x.value / total) * 100) : 0) + '%' })]); }));
    var wrap = el('div', { class: 'donut-wrap' }, [svg, leg]);
    box.appendChild(wrap);
    return wrap;
  }
  // حلقة نسبة (0–100) بقيمة في النص
  function ring(box, pct, opts) {
    opts = opts || {};
    var R = 46, C = 2 * Math.PI * R, v = Math.max(0, Math.min(100, pct || 0));
    var svg = s('svg', { viewBox: '0 0 120 120', class: 'ring ' + (opts.cls || ''), role: 'img', 'aria-label': (opts.label || '') + ' ' + Math.round(v) + '%' });
    svg.appendChild(s('circle', { cx: 60, cy: 60, r: R, class: 'r-track' }));
    svg.appendChild(s('circle', { cx: 60, cy: 60, r: R, class: 'r-bar', pathLength: '100', 'stroke-dasharray': v.toFixed(1) + ' 100', transform: 'rotate(-90 60 60)' }));
    var t = s('text', { x: 60, y: 66, class: 'r-val', 'text-anchor': 'middle' }); t.textContent = (opts.text != null ? opts.text : Math.round(v) + '%'); svg.appendChild(t);
    box.appendChild(svg);
    return svg;
  }
  // خط صغير تحت الرقم (آخر الأيام)
  function spark(box, values, cls) {
    var W = 120, H = 30, n = values.length; if (n < 2) return null;
    var max = Math.max.apply(null, values.concat([1])), ltr = LTR();
    var pts = values.map(function (v, i) { var x = (W * i) / (n - 1); return [ltr ? x : W - x, H - 3 - ((H - 6) * v) / max]; });
    // اللون على مجموعة جوه الرسم (مش على الرسم نفسه: كلاسات الألوان القديمة بتلوّن الخلفية)
    var svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'spark', 'aria-hidden': 'true', preserveAspectRatio: 'none' });
    var grp = s('g', { class: cls || 'c-data' }); svg.appendChild(grp);
    var defs = s('defs', {}); grp.appendChild(defs); var id = 'g' + (++uid); gradient(defs, id, cls || 'c-data');
    var line = smooth(pts);
    grp.appendChild(s('path', { d: line + 'L' + pts[n - 1][0] + ',' + H + 'L' + pts[0][0] + ',' + H + 'Z', fill: 'url(#' + id + ')', class: 'a-fill' }));
    grp.appendChild(s('path', { d: line, class: 'a-line' }));
    box.appendChild(svg);
    return svg;
  }
  // خريطة الأوقات: grid[7][24] = {n, bad} · الأيام من السبت · كل خلية لونها بعدد الزيارات، والمشبوه بلون الخطر
  function heat(box, grid, opts) {
    opts = opts || {};
    var max = 1; grid.forEach(function (row) { row.forEach(function (c) { if (c.n > max) max = c.n; }); });
    var days = opts.days || ['', '', '', '', '', '', ''];
    var tbl = el('div', { class: 'heat', role: 'img', 'aria-label': opts.label || '' });
    tbl.appendChild(el('span', { class: 'h-corner' }));
    for (var h = 0; h < 24; h++) tbl.appendChild(el('span', { class: 'h-hour', text: h % 3 === 0 ? String(h) : '' }));
    grid.forEach(function (row, d) {
      tbl.appendChild(el('span', { class: 'h-day', text: days[d] }));
      row.forEach(function (c, hh) {
        var lvl = c.n ? Math.min(5, Math.ceil((c.n / max) * 5)) : 0, risky = c.bad && c.bad / c.n >= 0.34;
        var cell = el('span', { class: 'h-cell l' + lvl + (risky ? ' risky' : ''), title: days[d] + ' ' + hh + ':00 · ' + fmt(c.n) + (c.bad ? ' · ' + (opts.badLabel || '') + ' ' + fmt(c.bad) : '') });
        cell.style.animationDelay = ((d * 24 + hh) * 4) + 'ms';
        tbl.appendChild(cell);
      });
    });
    box.appendChild(tbl);
    return tbl;
  }

  window.LTCharts = { stacked: stacked, hbars: hbars, fmt: fmt, area: area, donut: donut, ring: ring, spark: spark, heat: heat };
})();
