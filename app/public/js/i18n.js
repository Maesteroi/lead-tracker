// لغات اللوحة (قرار محمود 12 نوفمبر: «عربي فصحى مبسّط… وفي الآخر بلغتين عربي وإنجليزي وممكن أكتر»).
// كل نص بيتكتب في js/lang/<اللغة>.js بمفتاح وقالب {x}، والشاشات بتنادي LT.t('مفتاح', {x: ...}).
// المرجع والقاموس: claude/briefs/2026-11-12-language-msa-i18n.md (نفس مصطلحات السيرفر server/src/i18n.js).
// اللغة: الكوكي lt_lang (اختيار المستخدم) ← العربي. لغة بتتفعّل لما ملفها يخلص (ENABLED).
(function () {
  'use strict';
  var LT = window.LT, D = window.LT_LANG || {};
  var ENABLED = ['ar'];
  var m = /(?:^|; )lt_lang=([a-z]{2})/.exec(document.cookie || '');
  var lang = m && ENABLED.indexOf(m[1]) >= 0 && D[m[1]] ? m[1] : 'ar';
  function t(key, v) {
    var s = (D[lang] || {})[key];
    if (s == null) s = (D.ar || {})[key];
    if (s == null) return key;
    if (typeof s === 'function') return s(v || {});
    return v ? String(s).replace(/\{(\w+)\}/g, function (x, k) { return v[k] != null ? String(v[k]) : x; }) : s;
  }
  // العدد مع المعدود (العربي: 1 زيارة واحدة · 2 زيارتين · 3–10 زيارات · 11+ زيارة). الوحدات في ملف اللغة: units.<اسم> = [1, 2, 3–10, 11+] أو [1, n] للإنجليزي
  function n(count, unit) {
    var c = Math.round(Number(count) || 0), u = t('units.' + unit);
    if (!Array.isArray(u)) return String(c);
    var fmt = function (x) { return Number(x).toLocaleString('en-US'); };
    if (u.length === 2) return fmt(c) + ' ' + (c === 1 ? u[0] : u[1]);
    if (c === 1) return u[0];
    if (c === 2) return u[1];
    var r = c % 100;
    return fmt(c) + ' ' + (r >= 3 && r <= 10 ? u[2] : u[3]);
  }
  // النصوص الثابتة في الصفحات: data-i18n (النص) · data-i18n-ph (placeholder) · data-i18n-title · data-i18n-aria
  function apply(root) {
    var r = root || document;
    Array.prototype.forEach.call(r.querySelectorAll('[data-i18n]'), function (e) { e.textContent = t(e.getAttribute('data-i18n')); });
    Array.prototype.forEach.call(r.querySelectorAll('[data-i18n-ph]'), function (e) { e.setAttribute('placeholder', t(e.getAttribute('data-i18n-ph'))); });
    Array.prototype.forEach.call(r.querySelectorAll('[data-i18n-title]'), function (e) { e.setAttribute('title', t(e.getAttribute('data-i18n-title'))); });
    Array.prototype.forEach.call(r.querySelectorAll('[data-i18n-aria]'), function (e) { e.setAttribute('aria-label', t(e.getAttribute('data-i18n-aria'))); });
  }
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  LT.t = t; LT.n = n; LT.lang = lang; LT.dir = document.documentElement.dir; LT.i18n = { apply: apply, enabled: ENABLED.slice() };
  apply();
})();
