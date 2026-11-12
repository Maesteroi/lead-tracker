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
    for (var g = 0; g <= 3; g++) {
      var y = padT + plotH - (plotH * g) / 3;
      svg.appendChild(s('line', { x1: 8, x2: W - padS, y1: y, y2: y, class: g ? 'grid' : 'axis' }));
      var t = s('text', { x: W - padS + 6, y: y + 4, class: 'tick', 'text-anchor': 'start' }); t.textContent = fmt(Math.round((max * g) / 3)); svg.appendChild(t);
    }
    var n = rows.length, slot = plotW / n, bw = Math.max(3, Math.min(22, slot * 0.62));
    var tip = el('div', { class: 'tip', hidden: '' });
    rows.forEach(function (r, i) {
      // RTL: أقدم يوم يمين، وأحدث يوم شمال
      var cx = W - padS - slot * (i + 0.5), yb = padT + plotH, total = 0;
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

  window.LTCharts = { stacked: stacked, hbars: hbars, fmt: fmt };
})();
