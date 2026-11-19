// «أضف موقعًا» (19 نوفمبر · محمود): يسأل هل موقعك ووردبريس؟ ← نعم: نافذة الخطوات (الربط السريع بكود WPCode) مع عدّاد المواقع وزر الواتساب
// لا: نوع الموقع من قايمة (باقي الأنواع قيد التجهيز) · لا أعرف: رابط الموقع ونكتشف نوعه. لو مواقع الباقة خلصت: شاشة الحد.
// الاستخدام: LT.addSite.open({ data: DATA, org: orgId, done: function () {} })
// DATA.connectInfo(org, domain) · DATA.detectSite(url) · DATA.siteInterest(kind)  (live-data.js)
(function () {
  'use strict';
  var LT = window.LT, el = LT.el, T = LT.t;
  var layer = null, ctx = null, info = null, toastT = null;

  function close(finished) {
    if (layer) { layer.remove(); layer = null; document.removeEventListener('keydown', onKey, true); }
    if (finished && ctx && ctx.done) ctx.done();
  }
  function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); close(false); } }
  function show(card) {
    var first = !layer;
    if (first) {
      layer = el('div', { class: 'cf-scrim' });
      layer.addEventListener('click', function (e) { if (e.target === layer) close(false); });
      document.body.appendChild(layer);
      document.addEventListener('keydown', onKey, true);
    }
    LT.clear(layer); layer.appendChild(card);
    var f = card.querySelector('[data-first]') || card.querySelector('button, input, select');
    if (f) try { f.focus({ preventScroll: true }); } catch (e) { /* عادي */ }
  }
  function toast(msg) {
    var old = layer && layer.querySelector('.cf-toast'); if (old) old.remove();
    if (!layer) return;
    var t = el('div', { class: 'cf-toast', role: 'status', text: msg }); layer.appendChild(t);
    clearTimeout(toastT); toastT = setTimeout(function () { t.remove(); }, 2400);
  }
  function closeBtn() { var b = el('button', { class: 'cf-x', type: 'button', 'aria-label': T('cf.close'), text: '×' }); b.addEventListener('click', function () { close(false); }); return b; }
  function back(to) { var b = el('button', { class: 'cf-back', type: 'button', text: T('cf.back') }); b.addEventListener('click', to); return b; }
  function waButton(extra) {
    if (!info || !info.wa_url) return null;
    return el('a', { class: 'btn cf-wa' + (extra ? ' ' + extra : ''), href: info.wa_url, target: '_blank', rel: 'noopener noreferrer' }, [el('span', { 'aria-hidden': 'true', text: '💬' }), el('span', { text: T('cf.wa.btn') })]);
  }
  function waBox() {
    if (!info || !info.wa_url) return null;
    return el('div', { class: 'cf-wabox' }, [el('b', { text: T('cf.wa.t') }), el('p', { text: T('cf.wa.d') }), waButton()]);
  }

  // ── عدّاد المواقع: المسموح · المسجّل · المتبقي ──
  function quotaBlock(foot) {
    var q = info.quota, unl = q.total === null;
    var nums = el('div', { class: 'cf-qn' }, [
      el('div', {}, [el('b', { text: unl ? '∞' : String(q.total) }), el('span', { text: T('cf.q.total') })]),
      el('div', {}, [el('b', { text: String(q.used) }), el('span', { text: T('cf.q.used') })]),
      el('div', { class: 'left' }, [el('b', { text: unl ? '∞' : String(q.left) }), el('span', { text: T('cf.q.left') })])]);
    var kids = [nums];
    if (!unl && q.total <= 12) {
      var slots = el('div', { class: 'cf-slots', 'aria-hidden': 'true' });
      for (var i = 0; i < q.total; i++) slots.appendChild(el('i', { class: i < q.used ? 'used' : 'free' }));
      kids.push(slots);
    }
    if (foot) kids.push(el('p', { class: 'cf-qf', text: unl ? T('cf.q.foot.unl') : T('cf.q.foot', { n: q.left }) }));
    return el('div', { class: 'cf-quota' }, kids);
  }

  // ── شاشة الحد ──
  function limit() {
    var q = info.quota, pct = q.total ? Math.min(100, Math.round(q.used / q.total * 100)) : 100;
    var ring = el('div', { class: 'cf-ring', role: 'img', 'aria-label': q.used + ' / ' + q.total }, [el('div', {}, [el('b', { text: String(q.used) }), el('span', { text: '/ ' + q.total })])]);
    ring.style.setProperty('--p', String(pct)); // CSSOM (الـCSP يمنع سمة style المكتوبة)
    var up = el('button', { class: 'btn primary', type: 'button', 'data-first': '', text: T('cf.lim.up') });
    up.addEventListener('click', function () { close(false); location.hash = '#/billing'; });
    var later = el('button', { class: 'btn ghost', type: 'button', text: T('cf.lim.later') }); later.addEventListener('click', function () { close(false); });
    show(el('div', { class: 'cf-card cf-lim', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'cf-h' }, [closeBtn(),
      el('div', { class: 'cf-lim-top' }, [ring, el('h3', { id: 'cf-h', text: T('cf.lim.title') }), el('p', { text: T('cf.lim.sub', { n: q.total }) })]),
      el('div', { class: 'cf-body' }, [quotaBlock(false), el('p', { class: 'cf-note', text: T('cf.lim.d') }), el('div', { class: 'cf-row' }, [up, later]), waBox()])]));
  }

  // ── السؤال الأول ──
  function ask() {
    function opt(ic, key, fn) {
      var b = el('button', { class: 'cf-opt', type: 'button' }, [el('span', { class: 'cf-ic', 'aria-hidden': 'true', text: ic }), el('span', {}, [el('b', { text: T('cf.opt.' + key) }), el('small', { text: T('cf.opt.' + key + '.d') })])]);
      b.addEventListener('click', fn); return b;
    }
    var first = opt('✅', 'wp', function () { wp(''); }); first.setAttribute('data-first', '');
    show(el('div', { class: 'cf-card cf-ask', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'cf-h' }, [closeBtn(),
      el('div', { class: 'cf-body' }, [el('h3', { id: 'cf-h', text: T('cf.ask.title') }), el('p', { class: 'cf-sub', text: T('cf.ask.sub') }),
        el('div', { class: 'cf-opts' }, [first, opt('🧩', 'no', kinds), opt('❓', 'unk', unknown)])])]));
  }

  // ── لا: نوع الموقع ──
  var KINDS = ['salla', 'zid', 'shopify', 'wix', 'woocommerce', 'custom', 'other'];
  function kinds(preset) {
    var res = el('div', { class: 'cf-res' });
    var pk = LT.pick({ value: typeof preset === 'string' && preset ? preset : '', aria: T('cf.kind.l'),
      items: [{ v: '', label: T('cf.kind.ph') }].concat(KINDS.map(function (k) { return { v: k, label: T('cf.k.' + k) }; })), search: T('cf.kind.search'), empty: T('pk.none') });
    pk.addEventListener('change', function () { pick(pk.value, res); });
    show(el('div', { class: 'cf-card cf-ask', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'cf-h' }, [closeBtn(),
      el('div', { class: 'cf-body' }, [back(ask), el('h3', { id: 'cf-h', text: T('cf.kind.title') }), el('p', { class: 'cf-sub', text: T('cf.kind.sub') }),
        el('label', { class: 'cf-l', text: T('cf.kind.l') }), pk, res])]));
    if (typeof preset === 'string' && preset) pick(preset, res);
  }
  function pick(k, res) {
    LT.clear(res);
    if (!k) return;
    if (k === 'woocommerce') { wp(''); return; }
    soon(res, k, null);
  }
  // نوع غير ووردبريس: الطريقة قيد التجهيز ← تسجيل اهتمام + مساعدة واتساب
  function soon(res, k, host) {
    var name = T('cf.k.' + k);
    var kids = [el('div', { class: 'cf-result no' }, [el('b', { text: T('cf.soon.t', { k: name }) }), el('p', { text: T('cf.soon.d') })])];
    var reg = el('button', { class: 'btn primary', type: 'button', text: T('cf.soon.btn') });
    reg.addEventListener('click', function () { reg.disabled = true; (ctx.data.siteInterest ? ctx.data.siteInterest(k) : Promise.resolve()).then(function () { toast(T('cf.soon.done')); }, function () { reg.disabled = false; toast(T('cf.w.err')); }); });
    kids.push(el('div', { class: 'cf-row' }, [reg, waButton()]));
    kids.forEach(function (n) { if (n) res.appendChild(n); });
  }

  // ── لا أعرف: رابط الموقع ──
  function unknown() {
    var inp = el('input', { class: 'cf-in', type: 'text', inputmode: 'url', dir: 'ltr', placeholder: 'example.com', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', id: 'cf-url', 'data-first': '' });
    var go = el('button', { class: 'btn primary', type: 'button', text: T('cf.url.go') });
    var res = el('div', { class: 'cf-res', 'aria-live': 'polite' });
    function run() {
      var v = inp.value.trim();
      if (!/^(https?:\/\/)?[^\s\/]+\.[^\s\/]{2,}/i.test(v)) { LT.clear(res); res.appendChild(el('div', { class: 'cf-result no', text: T('cf.url.bad') })); return; }
      go.disabled = true; LT.clear(res); res.appendChild(el('div', { class: 'cf-result', text: T('cf.url.checking') }));
      ctx.data.detectSite(v).then(function (r) {
        go.disabled = false; LT.clear(res);
        if (r.type === 'wordpress' || r.type === 'woocommerce') {
          res.appendChild(el('div', { class: 'cf-result' }, [el('b', { text: T('cf.url.wp') }), el('p', { text: T('cf.url.wp.d') })]));
          setTimeout(function () { if (layer) wp(r.host); }, 900);
        } else if (r.type === 'unreachable') {
          res.appendChild(el('div', { class: 'cf-result no' }, [el('b', { text: T('cf.url.fail') })]));
          var w = waButton(); if (w) res.appendChild(el('div', { class: 'cf-row' }, [w]));
        } else if (r.type === 'unknown') {
          res.appendChild(el('div', { class: 'cf-result no' }, [el('b', { text: T('cf.url.unk') }), el('p', { text: T('cf.url.unk.d') })]));
          var pb = el('button', { class: 'btn', type: 'button', text: T('cf.url.pickkind') }); pb.addEventListener('click', function () { kinds(''); });
          res.appendChild(el('div', { class: 'cf-row' }, [pb, waButton()]));
        } else {
          res.appendChild(el('div', { class: 'cf-result no' }, [el('b', { text: T('cf.url.found', { k: T('cf.k.' + r.type) }) })]));
          soon(res, r.type, r.host);
        }
      }, function (e) { go.disabled = false; LT.clear(res); res.appendChild(el('div', { class: 'cf-result no', text: T(e && e.message === 'too_many' ? 'cf.url.toomany' : 'cf.url.bad') })); });
    }
    go.addEventListener('click', run);
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); run(); } });
    show(el('div', { class: 'cf-card cf-ask', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'cf-h' }, [closeBtn(),
      el('div', { class: 'cf-body' }, [back(ask), el('h3', { id: 'cf-h', text: T('cf.url.title') }), el('p', { class: 'cf-sub', text: T('cf.url.sub') }),
        el('label', { class: 'cf-l', for: 'cf-url', text: T('cf.url.l') }), inp, el('div', { class: 'cf-row' }, [go]), res])]));
  }

  // ── نعم: النافذة الكاملة للووردبريس ──
  function step(title, desc, extra) {
    return el('li', {}, [el('div', {}, [el('b', { text: title }), el('p', { text: desc }), extra || null])]);
  }
  function copyText(text, okMsg) {
    var fail = function () { toast(T('cf.copy.fail')); };
    try { navigator.clipboard.writeText(text).then(function () { toast(okMsg); }, fail); } catch (e) { fail(); }
  }
  function wp(host) {
    var body = el('div', { class: 'cf-mbody' });
    var fast = el('button', { class: 'cf-chip', type: 'button', role: 'tab', 'aria-selected': 'true', text: T('cf.m.fast') });
    var plug = el('button', { class: 'cf-chip', type: 'button', role: 'tab', 'aria-selected': 'false' }, [el('span', { text: T('cf.m.plugin') }), el('small', { text: ' · ' + T('cf.m.soon') })]);
    function draw(m) {
      fast.setAttribute('aria-selected', String(m === 'fast')); plug.setAttribute('aria-selected', String(m === 'plugin'));
      LT.clear(body);
      if (m === 'plugin') { body.appendChild(el('div', { class: 'cf-result no' }, [el('b', { text: T('cf.plugin.t') }), el('p', { text: T('cf.plugin.d') })])); return; }
      var code = el('pre', { class: 'cf-code', tabindex: '0', dir: 'ltr', 'aria-label': T('cf.code') }, [el('code', { text: info.snippet })]);
      var cp = el('button', { class: 'btn primary sm', type: 'button', text: T('cf.copy') }); cp.addEventListener('click', function () { copyText(info.snippet, T('cf.copied')); });
      body.appendChild(el('ol', { class: 'cf-steps' }, [step(T('cf.s1'), T('cf.s1.d')), step(T('cf.s2'), T('cf.s2.d')), step(T('cf.s3'), T('cf.s3.d'), el('div', {}, [code, el('div', { class: 'cf-row' }, [cp])])), step(T('cf.s4'), T('cf.s4.d'))]));
    }
    fast.addEventListener('click', function () { draw('fast'); }); plug.addEventListener('click', function () { draw('plugin'); });
    var done = el('button', { class: 'btn ghost', type: 'button', text: T('cf.w.done') }); done.addEventListener('click', function () { close(true); });
    show(el('div', { class: 'cf-card cf-wp', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'cf-h' }, [closeBtn(),
      el('div', { class: 'cf-mh' }, [el('h3', { id: 'cf-h', text: T('cf.wp.title') }), el('p', { text: host ? T('cf.wp.sub.h', { h: host }) : T('cf.wp.sub') })]),
      quotaBlock(true),
      el('div', { class: 'cf-body' }, [el('div', { class: 'cf-method', role: 'tablist', 'aria-label': T('cf.m.l') }, [fast, plug]), body, waBox(), el('div', { class: 'cf-row end' }, [done])])]));
    draw('fast');
  }

  function open(o) {
    ctx = o; info = null;
    show(el('div', { class: 'cf-card cf-ask', role: 'dialog', 'aria-modal': 'true', 'aria-busy': 'true' }, [el('div', { class: 'cf-body cf-load' }, [el('span', { class: 'spinner' }), el('span', { text: T('cf.w.loading') })])]));
    ctx.data.connectInfo(o.org || '', '').then(function (i) {
      info = i;
      if (i.quota.total !== null && i.quota.left <= 0) limit(); else ask();
    }, function (e) {
      close(false);
      if (o.toast) o.toast(T(e && e.message === 'role' ? 'cf.err.role' : 'cf.w.err'));
    });
  }
  LT.addSite = { open: open };
})();
