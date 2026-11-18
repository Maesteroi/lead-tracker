// قايمة اختيار فيها بحث (18 نوفمبر · محمود: «قايمة الدولة ما بتفتحش على الموبايل»).
// القايمة الأصلية للمتصفح بتتصرف بشكل مختلف من موبايل للتاني وبعضها مابيفتحهاش، وفيها 230 دولة من غير بحث.
// دي قايمة بنرسمها احنا: زرار بيفتح لوحة فيها خانة بحث وقايمة، وعلى الموبايل بتطلع من تحت الشاشة.
// الاستخدام: var p = LT.pick({ value, items:[{ v, label, sub, hay }], btn: function (item) { return text }, aria, search, empty, disabled })
//   p.value (قراية وكتابة) · p.disabled · وبيطلّع حدث 'change' عند الاختيار، زي أي select.
(function () {
  'use strict';
  var LT = window.LT, el = LT.el, uid = 0;

  // توحيد النص للبحث: حروف صغيرة، من غير تشكيل، وهمزات وتاء مربوطة وألف مقصورة، وأرقام عربية ← لاتينية، من غير +
  function norm(s) {
    return String(s == null ? '' : s).toLowerCase()
      .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 1632); })
      .replace(/[ً-ٰٟـ]/g, '')
      .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
      .replace(/[+\s]+/g, ' ').trim();
  }

  function pick(o) {
    var items = o.items || [], cur = o.value, disabled = !!o.disabled;
    var root = el('div', { class: 'pk' });
    var bt = el('span', { class: 'pk-bt' });
    var btn = el('button', { type: 'button', class: 'bl-in pk-btn', 'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-label': o.aria || '' }, [bt, el('i', { class: 'pk-chev', 'aria-hidden': 'true', text: '⌄' })]);
    var back = el('div', { class: 'pk-back' });
    var q = el('input', { type: 'search', class: 'pk-q', placeholder: o.search || '', 'aria-label': o.search || '', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'search' });
    var list = el('ul', { class: 'pk-list', role: 'listbox', 'aria-label': o.aria || '' });
    var none = el('p', { class: 'pk-none', text: o.empty || '' }); none.hidden = true;
    var pop = el('div', { class: 'pk-pop' }, [back, el('div', { class: 'pk-panel' }, [q, list, none])]); pop.hidden = true;
    root.appendChild(btn); root.appendChild(pop);

    function find(v) { for (var i = 0; i < items.length; i++) if (items[i].v === v) return items[i]; return null; }
    function paint() {
      var it = find(cur);
      bt.textContent = it ? (o.btn ? o.btn(it) : it.label) : '';
      Array.prototype.forEach.call(list.children, function (li) { li.setAttribute('aria-selected', li.getAttribute('data-v') === cur ? 'true' : 'false'); });
    }
    function visible() { return Array.prototype.filter.call(list.children, function (li) { return !li.hidden; }); }
    function filter(t) {
      var n = norm(t), shown = 0;
      Array.prototype.forEach.call(list.children, function (li) { var ok = !n || li._hay.indexOf(n) >= 0; li.hidden = !ok; if (ok) shown++; });
      none.hidden = shown > 0;
    }
    function open() {
      if (disabled || !pop.hidden) return;
      q.value = ''; filter('');
      pop.hidden = false; btn.setAttribute('aria-expanded', 'true'); paint();
      var s = list.querySelector('[aria-selected="true"]');
      if (s) list.scrollTop = Math.max(0, s.offsetTop - list.clientHeight / 2 + s.offsetHeight / 2);
      // على الكمبيوتر نكتب على طول. على الموبايل مانفتحش الكيبورد من نفسنا عشان مايغطيش القايمة
      try { if (window.matchMedia && window.matchMedia('(pointer: fine)').matches) q.focus(); } catch (e) { /* عادي */ }
    }
    function close(back2btn) { if (pop.hidden) return; pop.hidden = true; btn.setAttribute('aria-expanded', 'false'); if (back2btn) btn.focus(); }
    function choose(v) {
      var changed = v !== cur; cur = v; paint(); close(true);
      if (changed) root.dispatchEvent(new Event('change', { bubbles: true }));
    }

    items.forEach(function (it) {
      var li = el('li', { role: 'option', 'data-v': it.v, tabindex: '-1' }, [el('span', { class: 'pk-n', text: it.label }), it.sub ? el('span', { class: 'pk-s', dir: 'ltr', text: it.sub }) : null]);
      li._hay = norm((it.hay || '') + ' ' + it.label + ' ' + (it.sub || ''));
      li.addEventListener('click', function () { choose(it.v); });
      li.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(it.v); return; }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault(); var v = visible(), i = v.indexOf(li) + (e.key === 'ArrowDown' ? 1 : -1);
          if (i < 0) q.focus(); else if (v[i]) v[i].focus();
        }
      });
      list.appendChild(li);
    });

    btn.addEventListener('click', function () { if (pop.hidden) open(); else close(true); });
    back.addEventListener('click', function () { close(false); });
    q.addEventListener('input', function () { filter(q.value); });
    q.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { var v = visible(); if (v[0]) { e.preventDefault(); v[0].focus(); } }
      if (e.key === 'Enter') { e.preventDefault(); var w = visible(); if (w.length) choose(w[0].getAttribute('data-v')); }
    });
    root.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !pop.hidden) { e.preventDefault(); close(true); } });

    Object.defineProperty(root, 'value', { get: function () { return cur; }, set: function (v) { if (find(v)) { cur = v; paint(); } } });
    Object.defineProperty(root, 'disabled', { get: function () { return disabled; }, set: function (b) { disabled = !!b; btn.disabled = disabled; if (disabled) close(false); } });
    btn.disabled = disabled;
    paint();
    return root;
  }

  // ── قوايم الدول: اسم الدولة وعلمها (مصر والدول العربية الأول) · { dial: true } = العلم والمفتاح (لرقم الواتساب) ──
  function flagOf(iso) {
    var a = String(iso || '').toUpperCase();
    return /^[A-Z]{2}$/.test(a) ? String.fromCharCode(0xD83C, 0xDDE6 + a.charCodeAt(0) - 65, 0xD83C, 0xDDE6 + a.charCodeAt(1) - 65) : '';
  }
  var enNames = null;
  function countryItems(withDial) {
    if (!enNames) { enNames = {}; window.LTPhone.list('en').forEach(function (c) { enNames[c.iso] = c.name; }); }
    return window.LTPhone.list(LT.locale || 'ar').map(function (c) {
      return { v: c.iso, label: flagOf(c.iso) + ' ' + c.name, dial: c.dial, sub: withDial ? '+' + c.dial : '', hay: c.name + ' ' + (enNames[c.iso] || '') + ' ' + c.iso + ' ' + c.dial };
    });
  }
  function countryLabel(iso) { var it = countryItems(false).filter(function (x) { return x.v === iso; })[0]; return it ? it.label : ''; }
  // نفس القايمة في الإعدادات وصفحة الاشتراك وصفحة الإدارة. قايمة بنرسمها احنا بدل select المتصفح لأنه ما كانش بيفتح على بعض الموبايلات.
  function countryPick(v, o) {
    var dial = !!(o && o.dial), T = LT.t;
    return pick({ value: v, items: countryItems(dial), aria: T(dial ? 'set.wa.cc' : 'set.country.l'), search: T('pk.search'), empty: T('pk.none'), disabled: !!(o && o.disabled),
      btn: function (it) { return dial ? flagOf(it.v) + ' +' + it.dial : it.label; } });
  }

  LT.pick = pick; LT.pickNorm = norm; LT.flagOf = flagOf; LT.countryPick = countryPick; LT.countryLabel = countryLabel;
})();
