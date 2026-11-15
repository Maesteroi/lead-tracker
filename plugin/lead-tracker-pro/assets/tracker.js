/* Lead Tracker Pro — Frontend Tracker v3.0 (plugin 2.5.0) — يمسك أي طريق للتواصل (روابط · أزرار · أزرار عائمة · فتح بسكريبت · فورمز) + جرد الصفحة + استبعاد أجهزتنا */
(function () {
  'use strict';
  try {
    // الإعدادات: من وسم السكربت نفسه (مابتتأخرش مع أدوات التسريع)، وإلا من LTP_CFG
    var CFG = window.LTP_CFG || {};
    if (!CFG.endpoint) {
      try {
        var tag = document.currentScript || document.querySelector('script[data-ltp-cfg]');
        var raw = tag && tag.getAttribute && tag.getAttribute('data-ltp-cfg');
        if (raw) CFG = JSON.parse(raw);
      } catch (e) {}
    }
    if (!CFG.endpoint) return;
    // 2.5.0: أجهزتنا مابتتسجلش — افتح الموقع مرة بـ ?ltp_internal=1 (وللرجوع ?ltp_internal=0)
    try {
      var qi = location.search.match(/[?&]ltp_internal=([01])/);
      if (qi) { if (qi[1] === '1') localStorage.setItem('ltp_internal', '1'); else localStorage.removeItem('ltp_internal'); }
      // 2.6.4: نفس العلامة في كوكي عشان السيرفر كمان يعرف (طلبات أجهزتنا = «🧪 اختبار» مش شراء)
      var sec_ = location.protocol === 'https:' ? '; Secure' : '';
      if (localStorage.getItem('ltp_internal') === '1') document.cookie = 'ltp_internal=1; max-age=31536000; path=/; SameSite=Lax' + sec_;
      else if (/(^|; )ltp_internal=/.test(document.cookie)) document.cookie = 'ltp_internal=; max-age=0; path=/; SameSite=Lax' + sec_;
      if (localStorage.getItem('ltp_internal') === '1') { if (window.console) console.log('[LTP] جهاز داخلي — التتبع مقفول على الجهاز ده'); return; }
    } catch (e) {}
    // 2.8.0: وضع التجربة — ?ltp_test=1: التتبع شغال عادي بس كل حاجة بتتعلّم 🧪 ومابتتحسبش (وللرجوع ?ltp_test=0)
    var TEST = false;
    try {
      var qt = location.search.match(/[?&]ltp_test=([01])/);
      var secT = location.protocol === 'https:' ? '; Secure' : '';
      if (qt) {
        if (qt[1] === '1') { localStorage.setItem('ltp_test', '1'); document.cookie = 'ltp_test=1; max-age=86400; path=/; SameSite=Lax' + secT; }
        else { localStorage.removeItem('ltp_test'); document.cookie = 'ltp_test=; max-age=0; path=/; SameSite=Lax' + secT; }
      }
      TEST = localStorage.getItem('ltp_test') === '1' || /(^|; )ltp_test=1/.test(document.cookie);
      if (TEST && window.console) console.log('[LTP] 🧪 وضع التجربة — التتبع شغال وكل حاجة متعلّمة تجربة');
    } catch (e) {}
    // نسخة واحدة بس من السنيبت في الصفحة
    if (window.__LTP_LOADED__) return;
    window.__LTP_LOADED__ = true;

    var U = CFG.endpoint;
    var PID = CFG.pid || 0;
    var GREET = CFG.greet || 'هلا، أبي أستفسر عن: ';
    var CONSENT_REQUIRED = parseInt(CFG.consentRequired, 10) === 1;
    // 0 = زائر الإعلان بالتفصيل + ضغطات التواصل من أي مصدر (الافتراضي) · 1 = كل الزيارات بالتفصيل
    var TRACK_ALL = parseInt(CFG.trackAll, 10) === 1;
    var FIRST_TTL = 90 * 864e5; // أول مصدر بيتفتكر 90 يوم
    var CK_TTL = 90; // مدة كوكيز السيرفر بالأيام

    var SS = window.sessionStorage, LS = window.localStorage;
    var now = Date.now(), q = location.search;

    function sg(o, k) { try { return o.getItem(k); } catch (e) { return null; } }
    function st(o, k, v) { try { o.setItem(k, v); } catch (e) {} }
    function rm(o, k) { try { o.removeItem(k); } catch (e) {} }
    function dec(v) { try { return decodeURIComponent(v); } catch (e) { return v; } }
    function rnd(n) {
      var c = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', r = '';
      for (var i = 0; i < n; i++) r += c[Math.floor(Math.random() * c.length)];
      return r;
    }
    function qp(name) {
      var m = q.match(new RegExp('[?&]' + name + '=([^&#]*)'));
      return m ? dec(m[1]) : '';
    }

    // ═══════════════════════════════════════════════════════
    // 🍪 Cookies — للسيرفر (WooCommerce) — جديد v2.9
    // ═══════════════════════════════════════════════════════
    function setCookie(name, value, days) {
      if (value === null || value === undefined || value === '') return;
      try {
        var exp = '';
        if (days) {
          var d = new Date();
          d.setTime(d.getTime() + (days * 24 * 60 * 60 * 1000));
          exp = '; expires=' + d.toUTCString();
        }
        var secure = location.protocol === 'https:' ? '; Secure' : '';
        document.cookie = name + '=' + encodeURIComponent(String(value).slice(0, 500)) + exp + '; path=/; SameSite=Lax' + secure;
      } catch (e) {}
    }

    function getCookie(name) {
      try {
        var m = document.cookie.match(new RegExp('(^|; )' + name + '=([^;]*)'));
        return m ? dec(m[2]) : '';
      } catch (e) { return ''; }
    }

    function rmCookie(name) {
      try { document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax'; } catch (e) {}
    }

    function send(data) {
      if (data && data.event === 'click') {
        var lv = roleOf_(data);
        if (lv === 'dev' || lv === 'ignore') return;   // رقم المطوّر / تجاهل = مابيتسجلش
        if (lv) data.lv = lv;
        if ((data.ct === 'wa' || data.ct === 'call') && !/:ext/.test(data.via || '')) armReturn_(data.ct, data.mc);
      }
      if (data) { delete data._d; delete data._x; if (TEST) data.test = 1; }
      try { if (data && data.event === 'click') { data.bh = behavior_(); ga4_(data); } } catch (e) {}
      if (data && FP2) data.fp2 = FP2;
      if (data && FP3) data.fp3 = FP3;
      if (data && FP4) data.fp4 = FP4;
      var j = JSON.stringify(data);
      try {
        if (navigator.sendBeacon && navigator.sendBeacon(U, new Blob([j], { type: 'application/json' }))) return;
      } catch (e) {}
      try {
        fetch(U, { method: 'POST', body: j, headers: { 'Content-Type': 'application/json' }, keepalive: true });
      } catch (e) {}
    }

    // ───────────── 2.13.1: قوة التواصل (تقديري) ─────────────
    // بعد ضغطة واتساب أو اتصال: الصفحة استخبت (التطبيق اتفتح)؟ والزائر رجع بعد قد إيه؟ رجوع في ثواني = غالباً ضغطة بالغلط،
    // وغياب دقيقة أو أكتر = كلّمك فعلاً غالباً. ده تقدير (الوقت بره الصفحة مش مدة المكالمة نفسها)، والقياس الحقيقي من تطبيق الموبايل.
    // 2.13.5 (تجريبي، 13 نوفمبر): «الشاشة كانت شغالة؟» وقت الغياب. نبضة كل ثانية والصفحة في الخلفية: على أندرويد بتقف
    // لما الشاشة تتقفل (تجربة محمود: محادثة 60 نبضة في الدقيقة الأولى، شاشة مقفولة 23). ومعاها نسبة الصحيان
    // (ساعة الشغل performance.now مقابل الوقت الحقيقي). بيتسجلوا بس، وبيظهروا لإدارة المنصة لحد ما الأرقام الحقيقية تثبتهم.
    var RET = null;
    function saveRet_() { st(SS, 'ltp_ret', JSON.stringify({ ct: RET.ct, mc: RET.mc, t: RET.t, hid: RET.hid, sent: RET.sent })); }
    function armReturn_(ct, mc) {
      if (RET && RET.bt) clearInterval(RET.bt);
      RET = { ct: ct, mc: mc || '', t: Date.now(), hid: 0, sent: false };
      saveRet_();
      setTimeout(function () { if (RET && !RET.hid && !RET.sent && document.visibilityState === 'visible') sendReturn_(0, 0); }, 8000);
    }
    function clock_() {
      if (!RET || !RET.hid || RET.mh == null || !RET.b) return null;
      var now = Date.now(), wall = now - RET.hid, mono = (window.performance ? performance.now() : 0) - RET.mh;
      var b60 = 0, gap = 0, prev = RET.hid;
      for (var i = 0; i < RET.b.length; i++) { if (RET.b[i] - RET.hid <= 60000) b60++; gap = Math.max(gap, RET.b[i] - prev); prev = RET.b[i]; }
      gap = Math.max(gap, now - prev);
      return { wake: wall > 0 ? Math.max(0, Math.min(100, Math.round((mono / wall) * 100))) : null, bt: RET.b.length, bt60: b60, gap: Math.round(gap / 1000) };
    }
    function sendReturn_(away, opened, ex) {
      if (!RET || RET.sent) return;
      RET.sent = true; rm(SS, 'ltp_ret');
      if (RET.bt) { clearInterval(RET.bt); RET.bt = 0; }
      var b = base('contact_return');
      b.ct = RET.ct; b.mc = RET.mc; b.away = Math.max(0, Math.min(86400, Math.round(away))); b.opened = opened ? 1 : 0;
      if (ex) { if (ex.wake != null) b.wake = ex.wake; b.bt = ex.bt; b.bt60 = ex.bt60; b.gap = ex.gap; }
      send(b);
    }
    document.addEventListener('visibilitychange', function () {
      if (!RET || RET.sent) return;
      if (document.visibilityState === 'hidden') {
        if (!RET.hid && Date.now() - RET.t < 15000) {
          RET.hid = Date.now(); RET.mh = window.performance ? performance.now() : null; RET.b = [];
          RET.bt = setInterval(function () { if (RET && !RET.sent && RET.b.length < 7200) RET.b.push(Date.now()); }, 1000);
          saveRet_();
        }
      }
      else if (RET.hid) sendReturn_((Date.now() - RET.hid) / 1000, 1, clock_());
    });
    // المتصفح فتح الصفحة من الأول وهو راجع (بدل ما يكمّل): نحسب من وقت ما ساب
    setTimeout(function () {
      try { var pr = JSON.parse(sg(SS, 'ltp_ret') || 'null'); if (pr && !pr.sent && pr.hid && Date.now() - pr.hid < 2 * 3600e3) { RET = pr; sendReturn_((Date.now() - pr.hid) / 1000, 1); } } catch (e) {}
    }, 0);

    // ───────────── الموافقة ─────────────
    // full    = موافقة (أو الموقع مش محتاج بانر): كل البيانات
    // minimal = لسه ما اختارش أو رفض: بدون بيانات الجهاز ولا البصمة ولا معرّف دائم
    function readConsent() {
      try {
        var r = sg(LS, 'ltp_consent_v2');
        if (!r) return null;
        var d = JSON.parse(r);
        return d && d.version === '2.0' ? d : null;
      } catch (e) { return null; }
    }
    function level() {
      if (!CONSENT_REQUIRED) return 'full';
      var c = readConsent();
      if (!c) return 'minimal';
      if (c.status === 'accepted') return 'full';
      if (c.status === 'custom') return (c.preferences && c.preferences.analytics) ? 'full' : 'minimal';
      return 'minimal';
    }
    function consentLabel() {
      if (!CONSENT_REQUIRED) return 'not_required';
      var c = readConsent();
      return c ? c.status : 'pending';
    }

    // ───────────── الجلسة والمعرّفات ─────────────
    var sid = sg(SS, 'ltp_sid');
    if (!sid) { sid = rnd(10); st(SS, 'ltp_sid', sid); }
    setCookie('ltp_sid', sid, 1); // جلسة يوم واحد

    function visitorId() {
      if (level() === 'full') {
        var v = sg(LS, 'ltp_vid');
        if (!v) {
          // 2.8.0: التخزين اتمسح (سفاري بيمسحه بعد أيام) بس كوكي السيرفر لسه موجود ← نفس الزائر
          var cv = getCookie('ltp_vid');
          if (/^[A-Za-z0-9]{4,20}$/.test(cv) && cv.charAt(0) !== 'S') {
            v = cv;
            st(LS, 'ltp_vid', v);
            st(LS, 'ltp_vis', String(parseInt(getCookie('ltp_vis') || '0', 10) || 0));
            if (getCookie('ltp_first')) st(LS, 'ltp_first', getCookie('ltp_first'));
          } else {
            v = rnd(8);
            st(LS, 'ltp_vid', v);
            st(LS, 'ltp_first', new Date().toISOString().slice(0, 10));
            st(LS, 'ltp_vis', '0');
          }
        }
        setCookie('ltp_first', sg(LS, 'ltp_first') || '', 365);
        setCookie('ltp_vid', v, 365);
        return v;
      }
      setCookie('ltp_vid', 'S' + sid, 1); // مؤقت — جلسة بس
      return 'S' + sid; // معرّف للجلسة بس، مش دائم
    }

    var visCounted = false;
    function visitNo() {
      if (level() !== 'full') return 0;
      visitorId();
      if (!visCounted) {
        visCounted = true;
        st(LS, 'ltp_vis', '' + ((parseInt(sg(LS, 'ltp_vis') || '0', 10) || 0) + 1));
      }
      var n = parseInt(sg(LS, 'ltp_vis') || '1', 10) || 1;
      setCookie('ltp_vis', '' + n, 365);
      return n;
    }

    // ───────────── مصدر الزيارة ومعرّفات الإعلان ─────────────
    var IDS = ['gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid', 'ttclid'];
    var urlIds = {}, urlHasId = false, urlKey = '', storedKey = '';
    IDS.forEach(function (k) {
      urlIds[k] = qp(k);
      if (urlIds[k]) urlHasId = true;
      urlKey += urlIds[k] + '|';
      storedKey += (sg(SS, 'ltp_' + k) || '') + '|';
    });
    // ضغطة إعلان جديدة في نفس الجلسة = بداية جديدة
    var newArrival = urlHasId && urlKey !== storedKey;

    // المصدر بنوعين: s = المجموعة (ads · google · maps · social · …) و s2 = بالتفصيل (instagram · tiktok · google_ads · …)
    // ملحوظة: fbclid بيتحط على أي رابط طالع من فيسبوك/إنستجرام (مش إعلان بالضرورة) ⇒ سوشيال مش إعلان.
    function classify_(u, rh, rp) {
      var z = u + ' ' + rh;
      var net = '';
      if (/instagram|(^|[^a-z])ig([^a-z]|$)/.test(z)) net = 'instagram';
      else if (/facebook|fb\.me|fb\.com|(^|[^a-z])fb([^a-z]|$)/.test(z)) net = 'facebook';
      else if (/tiktok/.test(z)) net = 'tiktok';
      else if (/snapchat|(^|[^a-z])snap([^a-z]|$)/.test(z)) net = 'snapchat';
      else if (/youtube|youtu\.be/.test(z)) net = 'youtube';
      else if (/(^|[^a-z])(t\.co|twitter|x\.com)([^a-z]|$)|^x$/.test(z) || u === 'x') net = 'x';
      else if (/whatsapp|wa\.me/.test(z)) net = 'whatsapp';
      else if (/threads/.test(z)) net = 'threads';
      else if (/linkedin|lnkd\.in/.test(z)) net = 'linkedin';
      else if (/metricool|linktr\.ee|linktree/.test(z)) net = 'social_other';

      if (urlIds.gclid || urlIds.gbraid || urlIds.wbraid || /^(google_ads|google-ads|adwords|cpc|ppc)$/.test(u)) return ['ads', 'google_ads'];
      if (urlIds.msclkid) return ['ads', 'bing_ads'];
      if (urlIds.ttclid) return ['ads', 'tiktok_ads'];
      if (/^(ads|paid)$/.test(u)) return ['ads', 'ads_other'];
      if (/listening/.test(u)) return ['listening', 'listening'];
      if (/^(google[_-]?)?(maps|gmb|gbp|business[_-]?profile)/.test(u) || /(^|\.)maps\.google\./.test(rh) || (/(^|\.)google\./.test(rh) && /^\/maps/.test(rp))) return ['maps', 'google_maps'];
      if (net) return ['social', net];
      if (urlIds.fbclid) return ['social', 'facebook'];
      if (/chatgpt|openai|perplexity|copilot|gemini|claude\.ai|deepseek|you\.com/.test(z)) return ['ai', 'ai'];
      if (/(^|\.)google\./.test(rh)) return ['google', 'google_organic'];
      if (/bing\.|duckduckgo|yahoo|yandex|ecosia|brave/.test(rh)) return ['bing', 'search_other'];
      if (u) return ['other', 'other_site'];
      if (!rh || rh === location.hostname) return ['direct', 'direct'];
      return ['other', 'other_site'];
    }

    var s = sg(SS, 'ltp_s');
    if (!s || newArrival) {
      var u = '', rh = '', rp = '';
      var m = q.match(/[?&]utm_source=([^&#]+)/);
      if (m) u = dec(m[1]).toLowerCase();
      try {
        var uu = new URL(document.referrer);
        rh = uu.hostname;
        rp = uu.pathname + uu.search;
      } catch (e) {}

      var cl = classify_(u, rh, rp);
      s = cl[0];
      var camp = qp('utm_campaign');
      // 2.13.6: لاحقة الرابط اللي Maestro LT بيضبطها في حساب الإعلانات (lt_kw={keyword}…) ← الكلمة تبقى التفصيل لحظة الزيارة
      var ltkw = cl[1] === 'google_ads' ? qp('lt_kw') : '';
      var detail = ltkw ? ltkw : camp ? ('campaign=' + camp) : (rh && rh !== location.hostname ? rh : '');

      var um = [];
      q.replace(/[?&]((?:utm|lt)_[a-z]+)=([^&#]*)/g, function (_, k, v) {
        if (k === 'lt_kw' || !dec(v)) return;
        um.push((k.indexOf('utm_') === 0 ? k.slice(4) : k) + '=' + dec(v));
      });

      st(SS, 'ltp_s', s);
      st(SS, 'ltp_s2', cl[1]);
      st(SS, 'ltp_sd', detail.slice(0, 150));
      st(SS, 'ltp_utm', um.join(' · '));
      st(SS, 'ltp_rh', rh);
      st(SS, 'ltp_rp', rp);
      st(SS, 'ltp_lp', location.pathname);
      st(SS, 'ltp_t0', '' + now);
      st(SS, 'ltp_pv', '0');
      st(SS, 'ltp_ref', rnd(4));
      IDS.forEach(function (k) { st(SS, 'ltp_' + k, urlIds[k]); });

      // ─── ✨ اكتب في Cookies للسيرفر ───
      setCookie('ltp_s', s, CK_TTL);
      setCookie('ltp_s2', cl[1], CK_TTL);
      setCookie('ltp_sd', detail.slice(0, 150), CK_TTL);
      setCookie('ltp_utm', um.join(' · '), CK_TTL);
      setCookie('ltp_rh', rh, CK_TTL);
      setCookie('ltp_rp', rp, CK_TTL);
      setCookie('ltp_lp', location.pathname, CK_TTL);
      IDS.forEach(function (k) {
        if (urlIds[k]) setCookie('ltp_' + k, urlIds[k], CK_TTL);
      });
    }
    var s2 = sg(SS, 'ltp_s2') || s;
    var sd = sg(SS, 'ltp_sd') || '';
    // زائر إعلان جوجل (أو أي إعلان مدفوع) = تتبع بالتفصيل. الباقي: ضغطات التواصل بس (إلا لو TRACK_ALL).
    var isAd = s === 'ads';
    var detailed = isAd || TRACK_ALL;
    var utm = sg(SS, 'ltp_utm') || '';
    var rh2 = sg(SS, 'ltp_rh') || '';
    var rp2 = sg(SS, 'ltp_rp') || '';
    var ids = {};
    IDS.forEach(function (k) { ids[k] = sg(SS, 'ltp_' + k) || ''; });
    st(SS, 'ltp_pv', '' + ((parseInt(sg(SS, 'ltp_pv') || '0', 10) || 0) + 1));

    // ───────────── رحلة الزائر (2.3.4) ─────────────
    // كل صفحة في الزيارة: اسمها · قعد فيها كام ثانية · نزل لحد فين. بتتبعت مع الضغطة عشان نعرف عمل إيه قبلها.
    var pageT0 = Date.now(), maxScroll = 0, JR_MAX = 15;
    function pageName_() {
      var t = (document.title || '').split(/\s[|\-–—]\s/)[0].trim();
      return (t || location.pathname || '/').slice(0, 40);
    }
    function readJr_() {
      try { var a = JSON.parse(sg(SS, 'ltp_jr') || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; }
    }
    var jr = readJr_();
    jr.push({ n: pageName_(), s: 0, c: 0 });
    if (jr.length > JR_MAX) jr = jr.slice(-JR_MAX);
    var jrIdx = jr.length - 1;
    st(SS, 'ltp_jr', JSON.stringify(jr));
    // نسخة مختصرة في كوكي (آخر 5 صفحات بس — عشان الحجم)
    setCookie('ltp_jr', jr.slice(-5).map(function(x){ return x.n; }).join(' ← ').slice(0, 400), 1);

    function pageSec_() { return Math.round((Date.now() - pageT0) / 1000); }
    function saveJr_() {
      var a = readJr_();
      var i = Math.min(jrIdx, a.length - 1);
      if (i < 0) return a;
      a[i].s = Math.max(a[i].s || 0, pageSec_());
      a[i].c = Math.max(a[i].c || 0, maxScroll);
      st(SS, 'ltp_jr', JSON.stringify(a));
      setCookie('ltp_jr', a.slice(-5).map(function(x){ return x.n; }).join(' ← ').slice(0, 400), 1);
      return a;
    }
    function jrText_() {
      var a = saveJr_();
      return a.map(function (x) { return x.n + ' (' + (x.s || 0) + 'ث · ' + (x.c || 0) + '%)'; }).join(' ← ').slice(0, 1000);
    }

    // ───────────── بيانات الجهاز (للموافقين بس) ─────────────
    var DV = null, FP = '', ttfb = 0, plms = 0;

    function devInfo() {
      var d = {
        scr: screen.width + 'x' + screen.height,
        vp: window.innerWidth + 'x' + window.innerHeight,
        dpr: String(window.devicePixelRatio || 1),
        lang: navigator.language || '',
        tz: '', plat: navigator.platform || '',
        cores: navigator.hardwareConcurrency || 0,
        mem: navigator.deviceMemory || 0,
        conn: '', bat: '',
        touch: ('ontouchstart' in window) ? 1 : 0,
        gpu: '', ck: navigator.cookieEnabled ? 1 : 0,
        dnt: (navigator.doNotTrack === '1' || navigator.doNotTrack === 'yes') ? 1 : 0
      };
      try { d.tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
      if (navigator.connection) d.conn = navigator.connection.effectiveType || '';
      try {
        var gl = document.createElement('canvas').getContext('webgl');
        if (gl) {
          var dbg = gl.getExtension('WEBGL_debug_renderer_info');
          if (dbg) d.gpu = (gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '').slice(0, 100);
        }
      } catch (e) {}
      return d;
    }

    function fingerprint(dv) {
      try {
        var c = document.createElement('canvas');
        c.width = 200; c.height = 40;
        var ctx = c.getContext('2d');
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillStyle = '#f60'; ctx.fillRect(0, 0, 100, 20);
        ctx.fillStyle = '#069'; ctx.fillText('LTP-2026', 2, 2);
        ctx.fillStyle = 'rgba(102,204,0,0.7)'; ctx.fillText('LTP-2026', 4, 4);
        var hash = c.toDataURL().slice(-50) + '|' + screen.width + 'x' + screen.height + '|' + navigator.language + '|' + (dv.tz || '');
        var h = 0;
        for (var i = 0; i < hash.length; i++) { h = ((h << 5) - h) + hash.charCodeAt(i); h = h & h; }
        return Math.abs(h).toString(36).slice(0, 12);
      } catch (e) { return 'na'; }
    }

    function loadDevice() {
      if (DV) return;
      DV = devInfo();
      FP = fingerprint(DV);
      try {
        var nav = performance.getEntriesByType('navigation')[0];
        if (nav) {
          ttfb = Math.round(nav.responseStart - nav.requestStart);
          plms = Math.round(nav.loadEventEnd - nav.fetchStart);
        }
      } catch (e) {}
    }

    // أول مصدر للجهاز (للموافقين أو لو مفيش بانر): بيتحفظ 90 يوم ومابيتغيّرش بزيارات جاية
    function firstSource_() {
      var at = parseInt(sg(LS, 'ltp_fs_t') || '0', 10) || 0;
      if (!sg(LS, 'ltp_fs') || (Date.now() - at) > FIRST_TTL) {
        st(LS, 'ltp_fs', s2);
        st(LS, 'ltp_fsd', sd);
        st(LS, 'ltp_fs_t', '' + Date.now());
        at = Date.now();
      }
      var fsVal = sg(LS, 'ltp_fs') || s2;
      var fsdVal = sg(LS, 'ltp_fsd') || '';
      var fsatVal = new Date(at).toISOString().slice(0, 10);
      // ─── ✨ اكتب في Cookies ───
      setCookie('ltp_fs', fsVal, CK_TTL);
      setCookie('ltp_fsd', fsdVal, CK_TTL);
      setCookie('ltp_fsat', fsatVal, CK_TTL);
      return [fsVal, fsdVal, fsatVal];
    }

    // التفاعل: عدد اللمسات والضغطات والكتابة (العدد بس، مش اللي اتكتب) — الماوس لوحده دايماً صفر على الموبايل
    var ia = 0;
    document.addEventListener('pointerdown', function () { ia++; }, { passive: true, capture: true });
    document.addEventListener('keydown', function () { ia++; }, { passive: true, capture: true });

    // ───────────── 2.8.0: بصمة تانية (ThumbmarkJS — مجانية، من غير أي اتصال بسيرفرهم) ─────────────
    var FP2 = sg(SS, 'ltp_fp2') || '', FP4 = sg(SS, 'ltp_fp4') || '';
    function fp2Start_(isAdVisit) {
      if (level() !== 'full') return;
      // 2.8.2: ThumbmarkJS API (اختياري بمفتاح) — نفس نطاق Fingerprint Pro (زوار الإعلانات بس أو الكل)
      var useApi = !!CFG.tmk && (CFG.fps === 'all' || isAdVisit) && !FP4;
      if (FP2 && !useApi) return;
      var tries = 0, started = false;
      function run() {
        if (started) return;
        if (window.ThumbmarkJS && window.ThumbmarkJS.Thumbmark) {
          started = true;
          try {
            var o = { logging: false, collect_beacon: false, timeout: 3000 };
            if (useApi) o.api_key = CFG.tmk;
            new window.ThumbmarkJS.Thumbmark(o).get().then(function (r) {
              if (r && r.thumbmark) { FP2 = String(r.thumbmark).slice(0, 16); st(SS, 'ltp_fp2', FP2); }
              if (r && r.visitorId) { FP4 = String(r.visitorId).slice(0, 40); st(SS, 'ltp_fp4', FP4); }
              fpPush_();
            })['catch'](function () {});
          } catch (e) {}
          return;
        }
        if (++tries < 40) setTimeout(run, 250);
      }
      run();
      // لو أداة تسريع أجّلت السكريبت لحد ما الزائر يلمس الصفحة: نجرب تاني ساعتها
      ['touchstart', 'scroll', 'mousemove', 'keydown'].forEach(function (ev) {
        window.addEventListener(ev, function () { tries = 0; setTimeout(run, 400); }, { once: true, passive: true });
      });
    }

    // ───────────── 2.8.1: Fingerprint Pro (اختياري — بمفتاح عام من الإعدادات، للمقارنة) ─────────────
    var FP3 = sg(SS, 'ltp_fp3') || '';
    function fp3Start_(isAdVisit) {
      if (FP3 || !CFG.fpk || level() !== 'full') return;
      if (CFG.fps !== 'all' && !isAdVisit) return;
      try {
        // import() جوه Function عشان المتصفحات القديمة ماتوقفش التراكر كله
        var imp = new Function('u', 'return import(u)');
        imp('https://fpjscdn.net/v4/' + encodeURIComponent(CFG.fpk)).then(function (F) {
          var opt = CFG.fpr && CFG.fpr !== 'us' ? { region: CFG.fpr } : {};
          return (F.start ? F.start(opt) : F.load(opt));
        }).then(function (fp) { return fp.get(); }).then(function (r) {
          var id = r && (r.visitor_id || r.visitorId);
          if (!id) return;
          var sc = r.confidence && r.confidence.score;
          FP3 = String(id).slice(0, 32) + (sc ? '|' + Number(sc).toFixed(2) : '');
          st(SS, 'ltp_fp3', FP3);
          fpPush_();
        })['catch'](function () {});
      } catch (e) {}
    }

    // ───────────── 2.8.3: البصمات بتوصل حتى لو الزيارة ثانيتين ─────────────
    // «زيارة صفحة» بتتبعت فوراً (عشان مانخسرهاش)، والبصمات بتاخد من جزء من الثانية لثانيتين.
    // أول ما تجهز بتتبعت ورا الزيارة وتتكتب في نفس الصف — ولو الزائر قفل قبلها، بيتبعت اللي جهز ساعة الخروج.
    var FPS = null, fpT = 0;
    function fpSame_() { return FPS && FP2 === FPS[0] && FP3 === FPS[1] && FP4 === FPS[2]; }
    function fpPush_(now) {
      if (!FPS || fpSame_()) return;
      clearTimeout(fpT);
      var go = function () {
        if (fpSame_()) return;
        FPS = [FP2, FP3, FP4];
        try { send(base('fp_update')); } catch (e) {}
      };
      if (now) go(); else fpT = setTimeout(go, 1200);
    }
    window.addEventListener('pagehide', function () { fpPush_(true); });
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') fpPush_(true); });

    // ───────────── 2.8.0: إشارات السلوك (للنيّة ودرجة الجدية — مش للتعرّف على الشخص) ─────────────
    var BH = { act: 0, last: Date.now(), vis: document.visibilityState !== 'hidden', away: 0, copy: 0, copyNum: 0, hoverT: 0, hoverEl: null };
    function bhTick_() {
      var t = Date.now();
      if (BH.vis && t - BH.last < 30000) BH.act += t - BH.last;   // وقت فعلي: الصفحة ظاهرة وفيه تفاعل خلال 30 ثانية
      BH.last = t;
    }
    ['scroll', 'mousemove', 'touchstart', 'keydown', 'click'].forEach(function (ev) {
      document.addEventListener(ev, function () { bhTick_(); }, { passive: true, capture: true });
    });
    document.addEventListener('visibilitychange', function () {
      bhTick_();
      BH.vis = document.visibilityState !== 'hidden';
      if (!BH.vis) BH.away++;
    });
    document.addEventListener('copy', function () {
      BH.copy++;
      try { var sel = String(window.getSelection ? window.getSelection() : '').replace(/[^0-9٠-٩]/g, ''); if (sel.length >= 8) BH.copyNum++; } catch (e) {}
    }, true);
    document.addEventListener('mouseover', function (e) {
      try { var c = e.target.closest && e.target.closest('a,button,[role=button]'); if (c && c !== BH.hoverEl) { BH.hoverEl = c; BH.hoverT = Date.now(); } } catch (x) {}
    }, { passive: true, capture: true });
    function behavior_() {
      bhTick_();
      var parts = ['فعلي ' + Math.round(BH.act / 1000) + 'ث'];
      if (BH.away) parts.push('غادر وعاد ' + BH.away);
      if (BH.copy) parts.push('نسخ ' + BH.copy + (BH.copyNum ? ' (رقم)' : ''));
      if (BH.hoverEl && BH.hoverT) { var h = (Date.now() - BH.hoverT) / 1000; if (h > 0.3 && h < 120) parts.push('تردد ' + h.toFixed(1) + 'ث'); }
      return parts.join(' · ').slice(0, 120);
    }

    // ───────────── 2.8.0: GA4 — لو الموقع عليه gtag (Site Kit أو غيره) نبعتله التواصل بأهميته ─────────────
    function ga4_(b) {
      if (TEST || typeof window.gtag !== 'function' || !b || !b.lv || b.lv === 'normal') return;
      var ev = { wa: 'contact_whatsapp', call: 'contact_call', form: 'generate_lead', email: 'contact_email', sms: 'contact_sms', msg: 'contact_message' }[b.ct];
      if (!ev) return;
      window.gtag('event', ev, { lead_level: b.lv, match_code: b.mc || '', link_position: b.btn || '', ltp: 1 });
      if (b.lv === 'primary' && ev !== 'generate_lead') window.gtag('event', 'generate_lead', { lead_level: b.lv, method: b.ct, ltp: 1 });
    }

    function base(ev) {
      var full = level() === 'full';
      var b = {
        event: ev,
        sid: sid, vid: visitorId(),
        pid: PID,
        title: (document.title || '').split(/\s[|\-–—]\s/)[0].trim(),
        url: location.href.split('#')[0],
        path: location.pathname,
        s: s, utm: utm, rh: rh2, rp: rp2,
        lp: sg(SS, 'ltp_lp') || '',
        gclid: ids.gclid, gbraid: ids.gbraid, wbraid: ids.wbraid,
        fbclid: ids.fbclid, msclkid: ids.msclkid, ttclid: ids.ttclid,
        pv: parseInt(sg(SS, 'ltp_pv') || '1', 10),
        sec: Math.round((Date.now() - (parseInt(sg(SS, 'ltp_t0') || now, 10) || now)) / 1000),
        consent: consentLabel()
      };
      b.s2 = s2; b.sd = sd;
      b.wd = navigator.webdriver ? 1 : 0;
      b.ia = ia;
      b.psec = pageSec_();
      if (full) {
        var fs = firstSource_();
        b.fs = fs[0]; b.fsd = fs[1]; b.fsat = fs[2];
        loadDevice();
        b.vis = visitNo();
        b.first = sg(LS, 'ltp_first') || '';
        b.scr = DV.scr; b.vp = DV.vp; b.dpr = DV.dpr;
        b.lang = DV.lang; b.tz = DV.tz; b.plat = DV.plat;
        b.cores = DV.cores; b.mem = DV.mem;
        b.conn = DV.conn; b.bat = DV.bat;
        b.touch = DV.touch; b.gpu = DV.gpu;
        b.ck = DV.ck; b.dnt = DV.dnt;
        b.fp = FP; b.plms = plms; b.ttfb = ttfb;
      }
      return b;
    }

    if (detailed) { send(base('page_view')); FPS = [FP2, FP3, FP4]; }
    fp2Start_(isAd);
    fp3Start_(isAd);

    // ───────────── 2.13.0: تسجيل زيارة الإعلان كفيديو (rrweb · MIT) ─────────────
    // زوار الإعلان بس · بعد ما الصفحة تفتح خالص · كل الكتابة متخبية · صفحات الدفع والسلة والحساب لأ · بعد الموافقة لو مطلوبة.
    // بيتبعت لسيرفر Maestro على طول بتذكرة من الموقع (الجلسة دي بس، ساعتين). أي مشكلة = بيقف بهدوء، والتتبع العادي مابيتأثرش.
    (function replay_() {
      var RP = CFG.rp;
      if (!RP || !RP.tk || !RP.js || !isAd || level() !== 'full') return;
      if (!window.fetch || !window.JSON || !window.MutationObserver) return;
      if (CFG.pt === 'checkout' || CFG.pt === 'cart' || CFG.pt === 'account' || /\/(checkout|cart|my-account)(\/|$)/.test(location.pathname)) return;
      var T = null, URL_ = '', seq = parseInt(sg(SS, 'ltp_rp_seq') || '0', 10) || 0, buf = [], bytes = 0, sent = 0, stopRec = null, done = false, t0 = Date.now();
      var MAX = 8 * 1024 * 1024, CHUNK = 900 * 1024, MIN = 15, Z = false;
      function post(body, keep) {
        return fetch(URL_, { method: 'POST', body: body, headers: { 'Content-Type': 'text/plain' }, keepalive: !!keep && body.length < 60000, credentials: 'omit' })
          .then(function (r) { return r.json(); }).catch(function () { return null; });
      }
      function gz(text) { return new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer(); }
      function postZ(bin, s, keep) {
        return fetch(URL_ + '?z=1&seq=' + s + '&t=' + encodeURIComponent(T), { method: 'POST', body: bin, headers: { 'Content-Type': 'text/plain' }, keepalive: !!keep, credentials: 'omit' })
          .then(function (r) { return r.json(); }).catch(function () { return null; });
      }
      function stop() { done = true; buf = []; try { if (stopRec) stopRec(); } catch (e) {} }
      function flush(keep) {
        if (!buf.length || !T) return;
        if (seq > 199) { stop(); return; }
        var ev = buf, b = bytes, s0 = seq; buf = []; bytes = 0;
        seq++; st(SS, 'ltp_rp_seq', '' + seq); sent += b;
        // 2.13.4: مضغوط (gzip) لو المتصفح والسيرفر بيدعموا — أول لقطة للصفحة ممكن تبقى 2 ميجا وأكتر (اتلقى في روضة 12 نوفمبر)
        var p = (Z && window.CompressionStream && window.Blob && window.Response)
          ? gz(JSON.stringify(ev)).then(function (bin) { return postZ(bin, s0, keep && bin.byteLength < 60000); }, function () { return null; })
          : post(JSON.stringify({ t: T, seq: s0, ev: ev }), keep);
        if (p && p.then) p.then(function (r) { if (r && r.ok === false) stop(); });
        if (sent > MAX || Date.now() - t0 > MIN * 60e3) stop();
      }
      function start() {
        var R = window.rrwebRecord;
        if (!R || typeof R.record !== 'function' || done) return;
        try {
          stopRec = R.record({
            emit: function (e) {
              if (done) return;
              buf.push(e);
              var n = 0; try { n = e.type === 2 ? JSON.stringify(e).length : 200; } catch (x) { n = 200; }
              bytes += n;
              if (bytes > CHUNK) flush(false);
            },
            maskAllInputs: true,
            blockClass: 'ltp-no-rec',
            maskTextClass: 'ltp-mask',
            recordCanvas: false, collectFonts: false, inlineImages: false,
            slimDOMOptions: 'all',
            sampling: { mousemove: 80, scroll: 150, media: 800, input: 'last' }
          });
        } catch (e) { stop(); return; }
        setInterval(function () { if (!done) flush(false); }, 5000);
        document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(true); });
        window.addEventListener('pagehide', function () { flush(true); });
      }
      function ticket() {
        // التذكرة بتتخزن للجلسة (لحد ما يفضل عليها 10 دقايق) علشان مانطلبهاش من الموقع مع كل صفحة
        try { var c = JSON.parse(sg(SS, 'ltp_rp_t') || 'null'); if (c && c.t && c.u && c.t.split('.')[1] === sid && (+c.t.split('.')[2]) * 1000 > Date.now() + 600e3) return Promise.resolve({ ok: true, t: c.t, u: c.u }); } catch (e) {}
        return fetch(RP.tk, { method: 'POST', body: JSON.stringify({ sid: sid }), headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin' })
          .then(function (r) { return r.json(); })
          .then(function (j) { if (j && j.ok && j.t) st(SS, 'ltp_rp_t', JSON.stringify({ t: j.t, u: j.u })); return j; });
      }
      function go() {
        ticket()
          .then(function (j) {
            if (!j || !j.ok || !j.t || !/^https:\/\//.test(j.u || '')) return null;
            T = j.t; URL_ = j.u;
            return post(JSON.stringify({ t: T, start: 1 }));
          })
          .then(function (s) {
            if (!s || !s.rec) return;
            if (s.max_kb) MAX = s.max_kb * 1024;
            if (s.chunk_kb) CHUNK = Math.min(CHUNK, s.chunk_kb * 1024 - 4096);
            if (s.max_min) MIN = s.max_min;
            if (s.z) Z = true;   // السيرفر بيقبل القطع مضغوطة
            if (window.rrwebRecord) { start(); return; }
            var sc = document.createElement('script');
            sc.src = RP.js; sc.async = true;
            sc.setAttribute('data-no-optimize', '1'); sc.setAttribute('data-cfasync', 'false');
            sc.onload = start;
            (document.head || document.documentElement).appendChild(sc);
          })
          .catch(function () {});
      }
      function later() { var idle = window.requestIdleCallback || function (f) { setTimeout(f, 1500); }; setTimeout(function () { idle(go, { timeout: 3000 }); }, 800); }
      if (document.readyState === 'complete') later(); else window.addEventListener('load', later);
    })();

    // 2.6.4: مشاهدة منتج — من المتصفح (بتتسجل حتى لو الصفحة متخزنة في الكاش)، مرة لكل منتج في الزيارة
    if (detailed && CFG.prod && CFG.prod.id) {
      try {
        var vk = 'ltp_vi_' + CFG.prod.id;
        if (!sg(SS, vk)) {
          st(SS, vk, '1');
          var vb = base('view_item');
          vb.pn = CFG.prod.name || ''; vb.pp = CFG.prod.price || 0; vb.pc = CFG.prod.cat || ''; vb.cur = CFG.prod.cur || '';
          send(vb);
        }
      } catch (e) {}
    }

    var mm = 0;
    document.addEventListener('mousemove', function () { mm++; }, { passive: true });

    var s50 = false, s90 = false;
    function scrollPct() {
      var h = document.documentElement.scrollHeight - window.innerHeight;
      if (h <= 0) return 0;
      return Math.min(100, Math.round((window.scrollY || document.documentElement.scrollTop) / h * 100));
    }
    window.addEventListener('scroll', function () {
      var p = scrollPct();
      if (p > maxScroll) maxScroll = p;
      if (!detailed) return;
      if (!s50 && p >= 50) { s50 = true; var b = base('scroll_50'); b.scroll = p; b.mm = mm; send(b); }
      if (!s90 && p >= 90) { s90 = true; var b2 = base('scroll_90'); b2.scroll = p; b2.mm = mm; send(b2); }
    }, { passive: true });

    // ───────────── تحديد نوع الضغطة ─────────────
    function hostOf(u) {
      try { return new URL(u, location.href).hostname.toLowerCase(); } catch (e) { return ''; }
    }
    function isWaHost(h) { return h === 'wa.me' || /(^|\.)whatsapp\.com$/.test(h); }

    // الرابط الحقيقي هو الأساس. النص والكلاس بيتفحصوا بس للأزرار اللي من غير رابط حقيقي (# أو javascript).
    function detectType_(a) {
      var raw = (a.getAttribute('href') || '').trim();
      var pm = raw.match(/^([a-z][a-z0-9+.\-]*):/i);
      var proto = pm ? pm[1].toLowerCase() : '';

      if (proto === 'tel') return 'call';
      if (proto === 'whatsapp') return 'wa';

      var isJsButton = raw === '' || raw.charAt(0) === '#' || proto === 'javascript';
      var txt = (a.textContent || a.value || '').trim().toLowerCase();
      var meta = (String(a.className && a.className.baseVal !== undefined ? a.className.baseVal : a.className || '') + ' ' + String(a.id || '')).toLowerCase();

      if (a.tagName === 'A' && !isJsButton) {
        if (proto === 'sms') return 'sms';
        if (proto === 'mailto') return 'email';
        var h = hostOf(a.href);
        if (isWaHost(h)) return 'wa';
        if (/(^|\.)(t\.me|telegram\.me|m\.me|messenger\.com)$/.test(h)) return 'msg';
        if (/(^|\.)(maps\.google\.|goo\.gl|maps\.app\.goo\.gl)/.test(h) || /google\.[a-z.]+\/maps/.test(a.href)) return 'map';
        if (/(^|\.)(instagram|facebook|fb|tiktok|snapchat|youtube|youtu|x|twitter|linkedin|threads)\.(com|net|be)$/.test(h)) return 'social';
      }
      if (/whatsapp|fa-whatsapp|wa-icon/.test(meta) || /whatsapp|واتساب|واتس\s?اب/.test(txt)) return 'wa';
      if (/(^|[\s_-])(call-now|click-to-call|phone-call|btn-call|fa-phone)($|[\s_-])/.test(meta)) return 'call';
      if (txt.length <= 30 && /^(اتصل|اتصال)/.test(txt)) return 'call';

      // باقي الأزرار (أي نوع): زرار حقيقي، أو رابط شكله زرار
      var isBtn = a.tagName === 'BUTTON' || (a.tagName === 'INPUT' && /^(submit|button)$/i.test(a.type || '')) ||
                  (a.getAttribute && a.getAttribute('role') === 'button') ||
                  /(^|[\s_-])(btn|button|elementor-button|wp-block-button__link|cta|add_to_cart_button|single_add_to_cart_button|checkout-button)($|[\s_-])/.test(meta);
      if (!isBtn) return null;
      if (/add_to_cart|single_add_to_cart|أضف إلى السلة|اضف للسلة|add to cart/.test(meta + ' ' + txt)) return 'cart';
      if (/checkout|إتمام الطلب|اتمام الطلب|ادفع/.test(meta + ' ' + txt)) return 'checkout';
      if (a.form || (a.type && /^submit$/i.test(a.type))) return 'form';
      return 'button';
    }

    function numberOf_(a, ct) {
      try {
        if (ct === 'wa') {
          var u = new URL(a.href, location.href);
          var p = u.searchParams.get('phone');
          if (p) return p.replace(/\D/g, '').slice(0, 15);
          var mt = u.pathname.match(/\/(\+?\d{6,15})/);
          return mt ? mt[1].replace(/\D/g, '') : '';
        }
        if (ct === 'call') {
          return dec((a.getAttribute('href') || '').replace(/^tel:/i, '')).replace(/\D/g, '').slice(0, 15);
        }
      } catch (e) {}
      return '';
    }

    // ═══════════════════════════════════════════════════════
    // 2.5.0 — التعرّف على أي طريق للتواصل (روابط · أزرار · أزرار عائمة · فتح بسكريبت · فورمز)
    // ═══════════════════════════════════════════════════════
    var RULES = Array.isArray(CFG.rules) ? CFG.rules : [];          // [{sel:'.x', ct:'wa'}] من صفحة الإعدادات
    // 2.6.0: أرقام خارجية (زي رقم المطوّر) — السيرفر بيحددها من الجرد + اختيارات المدير. مفتاح الرقم = آخر 9 أرقام
    var SKIP = Array.isArray(CFG.skipNums) ? CFG.skipNums.map(String) : [];
    // 2.7.0: أهمية كل إجراء — اختيارك للعنصر ← اختيارك للرقم ← المطوّر ← الافتراضي حسب طبيعة النشاط
    var ROLES = CFG.roles || {}, R_E = ROLES.e || {}, R_N = ROLES.n || {}, R_A = ROLES.auto || {};
    function roleOf_(b) {
      if (!b || b.event !== 'click') return '';
      var nk = key9_(b.tnum);
      var ek = elKey_(b.ct, b._d || '', nk, b._x || '');
      if (ek && R_E[ek]) return R_E[ek];
      if (nk && R_N[nk]) return R_N[nk];
      if ((nk && SKIP.indexOf(nk) >= 0) || /:ext/.test(b.via || '')) return 'dev';
      if (/\+menu/.test(b.via || '')) return '';
      return R_A[b.ct] || '';
    }
    // 2.7.2: نفس مفتاح السيرفر: النوع|العنصر|الرقم (أو النص) — والعنصر العام («a» من غير رقم) مالوش مفتاح
    function elKey_(t, d, nk, x) {
      var third = nk || String(x || '').replace(/\s+/g, ' ').trim().slice(0, 30);
      var generic = !/[#.]/.test(d);
      if (generic && !nk) return '';
      if (!third) return '';
      return t + '|' + d + '|' + third;
    }
    function elRole_(t, el, url) { try { var k = elKey_(t, desc_(el), key9_(waNumber_(url || '')), label_(el).slice(0, 30)); return (k && R_E[k]) || ''; } catch (e) { return ''; } }
    // سطر حقوق الملكية / المطوّر (مش الفوتر كله: الفوتر ممكن يبقى فيه أرقام الموقع نفسه)
    // 2.6.6: «Designed and SEO by …» / «Developed & hosted by …» / «تصميم وتطوير …» / «بواسطة …»
    var CREDIT_TX = /©|copyright|all rights|حقوق|جميع الحقوق|\b(powered|designed|developed|made|built|created|crafted|seo|hosted|maintained|marketing)\b[\w\s&+,\/]{0,25}\bby\b|تصميم|تطوير|برمجة|تنفيذ\s|بواسطة|صمم/i;
    var CREDIT_CLS = /copyright|site-info|credit|below-footer|footer-bottom|bottom-bar|bottom-footer|small-footer|footer-copy|copy-right/i;
    var CONTACT = { wa: 1, call: 1, sms: 1, email: 1, msg: 1 };
    var KW_WA = /whatsapp|whats\s?app|واتساب|واتس\s?اب|joinchat|ht-ctc|ctc[_-]?chat|qlwapp|wa[-_](btn|button|icon|float|link|chat|me)|fa-whatsapp|icon-whatsapp/i;
    var KW_CALL = /(^|[\s_\-:#.])(call|phone|callnow|call-now|click-to-call|phone-call|btn-call|fa-phone|icon-phone)([\s_\-:#.]|$)|اتصل|اتصال/i;
    var KW_NEG = /(^|[\s_\-])(close|dismiss|minimi[sz]e|toggle|hide)([\s_\-]|$)|إغلاق|اغلاق/i;
    var CAND = 'a[href],button,input[type=submit],input[type=button],[role=button],[onclick],[data-href],[data-url],[data-link],summary';

    function ref_() { var r = sg(SS, 'ltp_ref'); if (!r) { r = rnd(4); st(SS, 'ltp_ref', r); } return r; }
    function pageTitle_() { return (document.title || '').split(/\s[|\-–—]\s/)[0].trim(); }
    function clsOf_(e) { var c = e && e.className; return typeof c === 'string' ? c : (c && c.baseVal) || ''; }
    function attrsOf_(e) {
      if (!e || e.nodeType !== 1 || !e.getAttribute) return '';
      var s = ' ' + clsOf_(e) + ' ' + (e.id || '');
      ['aria-label', 'title', 'alt', 'name', 'data-action', 'data-type', 'data-href', 'data-url', 'data-link', 'data-phone', 'data-number', 'href', 'xlink:href', 'src'].forEach(function (k) {
        var v = e.getAttribute(k); if (v) s += ' ' + v;
      });
      return s;
    }
    function ownSig_(el) {
      var s = attrsOf_(el);
      try { var d = el.querySelectorAll('*'); for (var i = 0; i < d.length && i < 15; i++) s += attrsOf_(d[i]); } catch (e) {}
      return s.toLowerCase();
    }
    function ancSig_(el) {
      var s = '', p = el.parentElement;
      for (var j = 0; j < 3 && p && p !== document.body; j++, p = p.parentElement) s += ' ' + clsOf_(p) + ' ' + (p.id || '');
      return s.toLowerCase();
    }
    function label_(el) {
      var t = (el.textContent || el.value || '').replace(/\s+/g, ' ').trim();
      if (!t) t = el.getAttribute('aria-label') || el.getAttribute('title') || '';
      if (!t) { var im = el.querySelector && el.querySelector('img[alt],[aria-label]'); if (im) t = im.getAttribute('alt') || im.getAttribute('aria-label') || ''; }
      return t.replace(/\s+/g, ' ').trim();
    }
    function desc_(el) {
      var s = el.tagName.toLowerCase();
      if (el.id) s += '#' + el.id;
      var c = clsOf_(el).trim().split(/\s+/).filter(Boolean).slice(0, 3);
      if (c.length) s += '.' + c.join('.');
      var r = el.getAttribute('role'); if (r) s += '[' + r + ']';
      return s.slice(0, 70);
    }

    // نوع التواصل من الرابط نفسه
    function contactFromUrl_(u) {
      if (!u) return null;
      u = String(u).trim();
      var pm = u.match(/^([a-z][a-z0-9+.\-]*):/i), proto = pm ? pm[1].toLowerCase() : '';
      if (proto === 'tel') return 'call';
      if (proto === 'whatsapp') return 'wa';
      if (proto === 'sms') return 'sms';
      if (proto === 'mailto') return 'email';
      if (proto === 'javascript') return null;
      var h = hostOf(u);
      if (!h) return null;
      if (isWaHost(h)) return 'wa';
      if (/(^|\.)(t\.me|telegram\.me)$/.test(h) && /^\/(\+|joinchat|s\/)/i.test((function () { try { return new URL(u, location.href).pathname; } catch (e) { return ''; } })())) return 'social'; // قناة/جروب تليجرام = سوشيال مش تواصل
      if (/(^|\.)(t\.me|telegram\.me|m\.me|messenger\.com)$/.test(h)) return 'msg';
      return null;
    }
    // رابط واتساب أو اتصال مكتوب جوه onclick أو data-*
    function attrUrl_(el) {
      var s = (el.getAttribute('onclick') || '') + ' ' + (el.getAttribute('data-href') || '') + ' ' + (el.getAttribute('data-url') || '') + ' ' + (el.getAttribute('data-link') || '');
      var m = s.match(/(?:https?:\/\/)?(?:wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)\/[^\s'"<>)]*/i);
      if (m) return { ct: 'wa', url: /^https?:/i.test(m[0]) ? m[0] : 'https://' + m[0] };
      var t = s.match(/tel:[+\d\s\-()]{5,}/i);
      if (t) return { ct: 'call', url: t[0].replace(/[\s()\-]/g, '') };
      return null;
    }
    function ruleFor_(el) {
      for (var i = 0; i < RULES.length; i++) {
        try { if (RULES[i].sel && el.closest(RULES[i].sel)) return RULES[i].ct; } catch (e) {}
      }
      return null;
    }
    function waNumber_(u) {
      try {
        var w = new URL(u, location.href);
        var p = w.searchParams.get('phone');
        if (p) return p.replace(/\D/g, '').slice(0, 15);
        var seg = dec(w.pathname.split('/')[1] || '').replace(/\D/g, '');   // wa.me/+966-055… = 966055…
        return seg.length >= 6 ? seg.slice(0, 15) : '';
      } catch (e) { return ''; }
    }
    // 2.6.2: فحص صحة رابط التواصل — رقم غلط = الزائر بيضغط ومابيوصلش
    var CC = ['966', '965', '971', '974', '973', '968', '20', '962', '964', '212', '216', '213', '249', '967', '961', '963', '970', '218'];
    function numHealth_(ct, u) {
      try {
        if (ct === 'wa') {
          var w = new URL(u, location.href);
          var raw = w.searchParams.get('phone') || dec(w.pathname.split('/')[1] || '');
          if (!raw) return isWaHost(w.hostname.toLowerCase()) && !/send|channel|catalog|message|qr|c$/i.test(w.pathname) ? 'رابط واتساب دون رقم' : '';
          if (/[^\d]/.test(raw)) return 'رموز زائدة في الرقم (+ أو - أو مسافة)';
          for (var i = 0; i < CC.length; i++) if (raw.indexOf(CC[i] + '0') === 0 && raw.length > CC[i].length + 9) return 'صفر زائد بعد مفتاح الدولة';
          if (raw.charAt(0) === '0') return 'الرقم دون مفتاح الدولة';
          if (raw.length < 10) return 'الرقم ناقص';
          if (/^web\.whatsapp\.com$/i.test(w.hostname)) return 'رابط واتساب ويب (يفتح على الحاسوب فقط)';
        }
        if (ct === 'call') {
          var d = dec(String(u).replace(/^tel:/i, '')).replace(/[\s\-()]/g, '');
          if (d.replace(/\D/g, '').length < 7) return 'رقم اتصال ناقص';
        }
      } catch (e) {}
      return '';
    }
    function numFromUrl_(ct, u) {
      if (ct === 'wa') return waNumber_(u);
      if (ct === 'call') return dec(String(u || '').replace(/^tel:/i, '')).replace(/\D/g, '').slice(0, 15);
      return '';
    }
    // مفتاح الرقم = آخر 8 أرقام (عشان المحلي والدولي يبقوا نفس الرقم: الكويت 8 أرقام، السعودية 9، مصر 10)
    function key9_(n) { n = String(n || '').replace(/\D/g, ''); return n.length >= 7 ? n.slice(-8) : ''; }
    // الرابط جوه سطر حقوق الملكية؟ (أقرب كتلة صغيرة فيها © أو «تصميم وتطوير» أو كلاس copyright)
    // أقرب «سطر» (عنصر بلوك) حوالين الرابط — مش الفوتر كله
    function blockOf_(el) {
      for (var n = el.parentElement; n && n !== document.body; n = n.parentElement) {
        var dsp = '';
        try { dsp = getComputedStyle(n).display || ''; } catch (e) {}
        if (dsp && dsp.indexOf('inline') !== 0 && dsp !== 'contents') return n;
      }
      return null;
    }
    function creditCtx_(el) {
      var own = (el.textContent || '').replace(/\s+/g, ' ').trim();
      for (var i = 0, bl = blockOf_(el); i < 2 && bl; i++, bl = blockOf_(bl)) {
        var tx = (bl.textContent || '').replace(/\s+/g, ' ').trim();
        if (tx.length > 300) return false;   // كتلة كبيرة = مش سطر الحقوق
        if (CREDIT_TX.test(tx) || CREDIT_CLS.test(clsOf_(bl) + ' ' + (bl.id || ''))) return true;
        if (tx !== own) return false;        // السطر فيه كلام تاني ومفيهوش حقوق = سطر عادي (زي تواصل الفوتر)
      }
      return false;
    }
    // 2.13.1: رقم الموقع نفسه؟ لو نفس الرقم موجود في رابط تاني على الصفحة بره سطر الحقوق، يبقى رقم النشاط (مش المطوّر).
    // شادو ديزاين (12 نوفمبر): زرار «تواصل مع المصمم» برقم الشركة كان بيتحسب «سطر المطوّر» بسبب كلمة «المصمم»، والضغطة ماكانتش بتتسجل.
    function siteNum_(n) {
      var k = key9_(n); if (!k) return false;
      try {
        var ls = document.querySelectorAll('a[href^="tel:"],a[href*="wa.me"],a[href*="whatsapp"]');
        for (var i = 0; i < ls.length; i++) {
          var h = ls[i].getAttribute('href') || '';
          var kk = key9_(/^tel:/i.test(h) ? h.replace(/^tel:/i, '') : waNumber_(h));
          if (kk === k && !creditCtx_(ls[i])) return true;
        }
      } catch (e) {}
      return false;
    }
    // رقم الموقع؟ (= مش خارجي)
    function waAllowed_(u, el) {
      var k = key9_(waNumber_(u));
      if (!k) return false; // رابط من غير رقم = مشاركة، مانحطش فيه كود
      if (SKIP.indexOf(k) >= 0) return false;
      if (el) { var er = elRole_('wa', el, u); if (er === 'dev' || er === 'ignore') return false; }
      if (el && creditCtx_(el) && !siteNum_(waNumber_(u))) return false;
      return true;
    }
    // يحط كود المطابقة في رسالة الواتساب (ومايكررهوش)
    function tagWa_(u, el) {
      if (!CFG.matchOn || !u) return u;
      try {
        var w = new URL(u, location.href);
        if (!(isWaHost(w.hostname.toLowerCase()) || w.protocol === 'whatsapp:')) return u;
        if (!waAllowed_(u, el)) return u;
        var ref = ref_();
        var tx = w.searchParams.get('text') || (GREET + pageTitle_());
        if (tx.indexOf('#' + ref) < 0) {
          tx = tx.replace(/\s*—\s*كود\s*#[A-Z0-9]{4}/g, '') + ' — كود #' + ref;
          w.searchParams.set('text', tx);
          w.search = w.search.replace(/\+/g, '%20');
        }
        return w.toString();
      } catch (e) { return u; }
    }
    function codeIn_(u) {
      var ref = sg(SS, 'ltp_ref');
      if (!ref || !u) return '';
      var s = String(u);
      try { s = decodeURIComponent(s); } catch (e) {}
      return s.indexOf('#' + ref) >= 0 ? ref : '';
    }
    function isFixed_(el) {
      for (var i = 0, n = el; i < 6 && n && n !== document.body; i++, n = n.parentElement) {
        try { var p = getComputedStyle(n).position; if (p === 'fixed' || p === 'sticky') return true; } catch (e) { return false; }
      }
      return false;
    }
    function pos_(el) {
      if (el.closest('[class*="float"],[class*="fab"],[id*="float"],[class*="sticky"],[class*="joinchat"],[class*="chaty"],[class*="ctc"]') || isFixed_(el)) return 'عائم';
      if (el.closest('.cta-final')) return 'ختامي';
      if (el.closest('article,.entry-content,main')) return 'داخل المحتوى';
      if (el.closest('header')) return 'الهيدر';
      if (el.closest('footer')) return 'الفوتر';
      return 'أخرى';
    }

    // ⬅️ إيه العنصر اللي اتضغط فعلاً (حتى لو الضغطة جت على أيقونة جوه زرار)
    function candidate_(e) {
      var path = e.composedPath ? e.composedPath() : [];
      if (!path.length) { var n0 = e.target; while (n0) { path.push(n0); n0 = n0.parentNode; } }
      var ptr = null;
      for (var i = 0; i < path.length && i < 12; i++) {
        var n = path[i];
        if (!n || n.nodeType !== 1) continue;
        if (n === document.body || n === document.documentElement) break;
        if ((n.matches && n.matches(CAND)) || ruleFor_(n)) return n;
        if (!ptr && i < 6) { try { if (getComputedStyle(n).cursor === 'pointer') ptr = n; } catch (x) {} }
      }
      return ptr;
    }

    // ⬅️ نوع العنصر: رابط حقيقي ← قاعدة من الإعدادات ← رابط مكتوب في الكود ← الكلمات (العنصر وجواه) ← الأنواع القديمة ← الأب
    function detect_(el, target) {
      var r = ruleFor_(el);
      if (r) return { ct: r, url: (el.tagName === 'A' ? el.href : ''), via: 'rule' };
      if (el.tagName === 'A') {
        var raw = (el.getAttribute('href') || '').trim();
        if (raw && raw.charAt(0) !== '#' && !/^javascript:/i.test(raw)) {
          var c = contactFromUrl_(el.href);
          if (c === 'wa' && !waNumber_(el.href)) return { ct: 'social', url: el.href, via: 'share' }; // «شارك على واتساب» (من غير رقم) = مشاركة مش تواصل
          if (c) return { ct: c, url: el.href, via: 'href' };
        }
      }
      var au = attrUrl_(el);
      if (au) return { ct: au.ct, url: au.url, via: 'attr' };
      var own = ownSig_(el), tx = label_(el).toLowerCase().slice(0, 60);
      // أزرار المشاركة (شارك المنتج على واتساب/فيسبوك) مش تواصل مع النشاط
      if (/(^|[\s_\-])(share|sharer|sharing)([\s_\-]|$)|مشارك/.test(own + ' ' + ancSig_(el) + ' ' + tx)) return { ct: 'social', url: '', via: 'share' };
      // «إغلاق/إخفاء» بيتفحص على العنصر نفسه واللي اتضغط بس (مش اللي جواه): زرار واتساب جواه أيقونة إغلاق يفضل واتساب
      var neg = KW_NEG.test(attrsOf_(el).toLowerCase()) || (target && target !== el && KW_NEG.test(attrsOf_(target).toLowerCase()));
      if (!neg) {
        if (KW_WA.test(own) || /whatsapp|واتساب|واتس\s?اب/.test(tx)) return { ct: 'wa', url: '', via: 'kw' };
        if (KW_CALL.test(own) || (tx.length <= 30 && /^(اتصل|اتصال|call)/.test(tx))) return { ct: 'call', url: '', via: 'kw' };
      }
      // ضغطة على «إغلاق» جوه ويدجت: مش فعل تواصل
      if (target && target !== el && KW_NEG.test(attrsOf_(target).toLowerCase())) return null;
      var old = detectType_(el);
      // زرار «إرسال» جوه فورم: الفورم نفسه بيتسجّل (محاولة/نجاح) — مانكررش
      if (old === 'form' && (el.type === 'submit' || (el.tagName === 'BUTTON' && !el.getAttribute('type')))) return null;
      if (old && old !== 'button' && !CONTACT[old]) return { ct: old, url: el.href || '', via: 'type' };
      if (!neg && KW_WA.test(ancSig_(el))) return { ct: 'wa', url: '', via: 'kw-parent' };
      return { ct: 'button', url: '', via: old ? 'generic' : 'pointer' };
    }

    function fill_(b, ct, url, via, el) {
      b.ct = ct;
      b.via = via;
      if (el && !b._d) { b._d = desc_(el); b._x = label_(el).slice(0, 30); }
      if (url) {
        b.href = String(url).slice(0, 500);
        b.tnum = numFromUrl_(ct, url);
        b.mc = ct === 'wa' ? codeIn_(url) : '';  // مانسجلش كود إلا لو اتحط فعلاً في الرسالة
        // رقم خارجي (سطر الحقوق / المطوّر): بيتسجل بعلامة ext عشان مايتحسبش تواصل للنشاط
        var ext = (ct === 'wa' || ct === 'call') && ((key9_(b.tnum) && SKIP.indexOf(key9_(b.tnum)) >= 0) || (el && creditCtx_(el) && !siteNum_(b.tnum)));
        if (ext) b.via = via + ':ext';
        // 2.11.1: ضغطة الاتصال ليها كود خاص بيها (4 حروف عشوائية، مش كود جلسة الواتساب): الاتصال مافيهوش رسالة نحط فيها كود،
        // وبدون كود تنبيه تليجرام ماكانش بيظهر عليه أزرار النتيجة (والنتيجة ماكانش ليها صف تتسجّل فيه). نفس الكود لو الدالة اتنادت تاني على نفس الضغطة.
        if (ct === 'call' && !ext && CFG.matchOn) b.mc = b.mc || rnd(4);
        var hz = numHealth_(ct, url); if (hz) b.via = (b.via + ':bad').slice(0, 30);
      }
    }
    function clickCookies_(ct, label) {
      setCookie('ltp_last_click', ct + '|' + String(label || '').slice(0, 60) + '|' + Math.floor(Date.now() / 1000), 1);
      if (ct === 'cart') setCookie('ltp_last_action', 'add_to_cart', 1);
      if (ct === 'checkout') setCookie('ltp_last_action', 'begin_checkout', 1);
      if (ct === 'wa') setCookie('ltp_last_action', 'whatsapp', 1);
      if (ct === 'call') setCookie('ltp_last_action', 'call', 1);
    }

    // ضغطة من غير رابط حقيقي: بنستنى ثانية — لو السكريبت فتح واتساب أو اتصال، بنسجّل الرابط الحقيقي والكود
    var pend = null, lastSent = null, lastEl = null, lastElT = 0, genericN = 0;
    function flushPend_(fromTimer) {
      if (!pend) return;
      clearTimeout(pend.timer);
      var p = pend; pend = null;
      // الزرار فتح قايمة أرقام واتساب (زي «مبيعات ١، ٢، ٣») ومافتحش واتساب: ده «فتح قايمة» مش تواصل — التواصل بيتسجل لما يختار رقم
      if (CONTACT[p.b.ct] && !p.b.href && visWa_() > p.wa) { p.b.ct = 'button'; p.b.via += '+menu'; p.b.bt = ('📋 فتح قايمة التواصل ' + (p.b.bt || '')).slice(0, 80); }
      // زرار تواصل اتضغط ومافتحش أي حاجة والصفحة لسه ظاهرة = زرار بايظ (زي رابط «#») — الزائر ضاع
      else if (fromTimer === true && CONTACT[p.b.ct] && !p.b.href && document.visibilityState === 'visible') { p.b.via += '+noop'; p.b.bt = ('⚠️ مافتحش حاجة: ' + (p.b.bt || '')).slice(0, 80); }
      send(p.b);
      clickCookies_(p.b.ct, p.b.bt);
    }
    // عدد روابط الواتساب والاتصال الظاهرة دلوقتي في الصفحة
    function visWa_() {
      var n = 0;
      try {
        var l = document.querySelectorAll('a[href*="wa.me"],a[href*="whatsapp.com"],a[href^="whatsapp:"],a[href^="tel:"]');
        for (var i = 0; i < l.length; i++) if (l[i].offsetWidth || l[i].offsetHeight) n++;
      } catch (e) {}
      return n;
    }
    function onNav_(ct, url, via) {
      var t = Date.now();
      if (pend && t - pend.t < 1500) {
        var b = pend.b, pel = pend.el; clearTimeout(pend.timer); pend = null;
        fill_(b, ct, url, b.via + '+' + via, pel);
        send(b); clickCookies_(ct, b.bt);
        lastSent = { ct: ct, t: t };
        return;
      }
      if (lastSent && lastSent.ct === ct && t - lastSent.t < 1500) return; // اتسجلت خلاص من الضغطة نفسها
      var b2 = base('click');
      b2.btn = 'برمجي';
      b2.bt = '(اتفتح من سكريبت في الصفحة)';
      fill_(b2, ct, url, via);
      b2.scroll = Math.max(maxScroll, scrollPct()); b2.mm = mm; b2.jr = jrText_();
      send(b2); clickCookies_(ct, '');
      lastSent = { ct: ct, t: t };
    }

    // 1) الكود يتحط في كل روابط الواتساب من أول ما الصفحة تحمل (حتى اللي بتظهر متأخر)
    function tagLinks_() {
      if (!CFG.matchOn) return;
      try {
        var list = document.querySelectorAll('a[href*="wa.me"],a[href*="whatsapp.com"],a[href^="whatsapp:"]');
        for (var i = 0; i < list.length; i++) {
          var a = list[i], nh = tagWa_(a.href, a);
          if (nh && nh !== a.href) a.setAttribute('href', nh);
        }
      } catch (e) {}
    }
    var tagT = 0;
    function tagSoon_() { clearTimeout(tagT); tagT = setTimeout(tagLinks_, 250); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tagLinks_); else tagLinks_();
    try { new MutationObserver(tagSoon_).observe(document.documentElement, { childList: true, subtree: true }); } catch (e) {}

    // 2) أي سكريبت بيفتح واتساب أو اتصال (زي Joinchat): بنحط الكود ونسجّل
    try {
      var _open = window.open;
      window.open = function (u) {
        try {
          var url = u && u.href ? u.href : String(u || '');
          var ct = contactFromUrl_(url);
          if (ct) {
            if (ct === 'wa') { url = tagWa_(url); arguments[0] = url; }
            onNav_(ct, url, 'open');
          }
        } catch (e) {}
        return _open.apply(this, arguments);
      };
    } catch (e) {}
    try {
      var _aclick = HTMLElement.prototype.click;
      HTMLElement.prototype.click = function () {
        try {
          if (this.tagName === 'A' && !this.isConnected) {
            var ct = contactFromUrl_(this.href);
            if (ct) { if (ct === 'wa') this.href = tagWa_(this.href); onNav_(ct, this.href, 'aclick'); }
          }
        } catch (e) {}
        return _aclick.apply(this, arguments);
      };
    } catch (e) {}
    try {
      if (window.navigation && window.navigation.addEventListener) {
        window.navigation.addEventListener('navigate', function (ev) {
          try { var u = ev.destination && ev.destination.url; var ct = contactFromUrl_(u); if (ct) onNav_(ct, u, 'nav'); } catch (e) {}
        });
      }
    } catch (e) {}

    // 3) الضغطة نفسها
    document.addEventListener('click', function (e) {
      var el = candidate_(e);
      if (!el) return;
      var t = Date.now();
      if (lastEl === el && t - lastElT < 1500) return; // ضغطتين ورا بعض على نفس العنصر = ضغطة واحدة
      lastEl = el; lastElT = t;

      var d = detect_(el, e.target);
      if (!d) return;
      if (d.via === 'pointer' && ++genericN > 15) return; // سقف للضغطات العامة في الصفحة

      if (d.ct === 'wa' && d.url && el.tagName === 'A') {
        var nh = tagWa_(el.href, el);
        if (nh !== el.href) el.setAttribute('href', nh);
        d.url = el.href;
      }

      var b = base('click');
      var lb = label_(el);
      b.btn = pos_(el);
      b.bt = (CONTACT[d.ct] || d.ct === 'button') && (!lb || d.via !== 'href')
        ? ((lb ? lb.slice(0, 40) + ' ' : '') + '⟨' + desc_(el) + '⟩').slice(0, 80)
        : lb.slice(0, 80);
      maxScroll = Math.max(maxScroll, scrollPct());
      b.scroll = maxScroll;
      b.mm = mm;
      b.jr = jrText_();
      fill_(b, d.ct, d.url, d.via, el);

      // رابط حقيقي (href) = نسجّل فوراً. رابط من الكود أو بالكلمات = نستنى السكريبت يفتحه (عشان الرابط الفعلي والكود)
      if ((d.url && d.via === 'href') || !(CONTACT[d.ct] || d.ct === 'button')) {
        send(b); clickCookies_(d.ct, lb);
        if (CONTACT[d.ct]) lastSent = { ct: d.ct, t: t };
        return;
      }
      // مفيش رابط حقيقي لسه: نستنى ثانية يمكن سكريبت يفتح واتساب/اتصال
      if (pend) flushPend_();
      pend = { b: b, t: t, el: el, wa: visWa_(), timer: setTimeout(function () { flushPend_(true); }, 1200) };
    }, true);

    // 4) الفورمز: نسجّل الإرسال الناجح (والمحاولة لو مش متأكدين). مانسجلش أي قيمة اتكتبت.
    var formSent = {}, formWait = [];
    function formName_(f) {
      var btn = f.querySelector('[type=submit],button');
      return String(f.getAttribute('aria-label') || f.getAttribute('name') || (btn && (btn.textContent || btn.value)) || f.id || 'فورم').replace(/\s+/g, ' ').trim().slice(0, 40);
    }
    function formKind_(f) {
      var c = clsOf_(f) + ' ' + (f.id || '') + ' ' + (f.parentElement ? clsOf_(f.parentElement) : '');
      if (/wpcf7/.test(c)) return 'cf7';
      if (/elementor-form/.test(c)) return 'elementor';
      if (/wpforms/.test(c)) return 'wpforms';
      if (/gform/.test(c)) return 'gravity';
      if (/forminator/.test(c)) return 'forminator';
      return 'generic';
    }
    var FILTER_FORM = /woocommerce-ordering|orderby|(^|[\s_\-])(filter|filters|facet|facets|sort|sorting|sf-panel)([\s_\-]|$)|woof|wpf-|yith-wcan|price_slider|wc-block-product-filter/i;
    function skipForm_(f) {
      if (f.querySelector('input[type=password]')) return true;
      if (f.getAttribute('role') === 'search' || f.querySelector('input[type=search],input[name="s"]')) return true;
      if (/(^|\s)(checkout|woocommerce-cart-form|cart|searchform)(\s|$)/.test(clsOf_(f))) return true;
      if (f.closest('#wpadminbar')) return true;
      if (f.id === 'commentform' || /comment-form/.test(clsOf_(f))) return true; // تعليقات = مش تواصل
      // 2.7.1: فورمز الترتيب والفلترة في المتجر (ترتيب المنتجات · فلتر السعر/القسم) = مش تواصل
      if (FILTER_FORM.test(clsOf_(f) + ' ' + (f.id || '') + ' ' + (f.getAttribute('name') || ''))) return true;
      // فورم تواصل لازم يبقى فيه خانة يكتب فيها الزائر (اسم/موبايل/إيميل/رسالة) — اللي فيه قوايم واختيارات بس = فلتر
      if (!f.querySelector('textarea,input[type=text],input[type=email],input[type=tel],input[type=number],input:not([type])')) return true;
      return false;
    }
    function sendForm_(f, ok, kind) {
      var name = formName_(f), key = name + '|' + (ok ? 1 : 0);
      if (formSent[key] && Date.now() - formSent[key] < 5000) return;
      formSent[key] = Date.now();
      var b = base('click');
      b.ct = 'form';
      b.via = 'form:' + kind;
      b._d = desc_(f); b._x = formName_(f).slice(0, 30);
      b.btn = pos_(f);
      b.bt = (ok ? '✅ اتبعت: ' : '📝 محاولة إرسال: ') + name;
      b.scroll = Math.max(maxScroll, scrollPct()); b.mm = mm; b.jr = jrText_();
      send(b);
      setCookie('ltp_last_action', ok ? 'form_sent' : 'form_try', 1);
    }
    function formOk_(f, kind) {
      if (!f || !f.tagName) return;
      if (f.tagName !== 'FORM') f = f.querySelector ? (f.querySelector('form') || f) : f;
      for (var i = formWait.length - 1; i >= 0; i--) if (formWait[i].f === f) { clearTimeout(formWait[i].t); formWait.splice(i, 1); }
      sendForm_(f, true, kind);
    }
    document.addEventListener('submit', function (e) {
      var f = e.target;
      if (!f || f.tagName !== 'FORM' || skipForm_(f)) return;
      var k = formKind_(f);
      if (k === 'generic') { sendForm_(f, false, k); return; }
      var w = { f: f, t: setTimeout(function () { sendForm_(f, false, k); }, 8000) };
      formWait.push(w);
    }, true);
    document.addEventListener('wpcf7mailsent', function (e) { formOk_(e.target, 'cf7'); }, true);
    document.addEventListener('forminator:form:submit:success', function (e) { formOk_(e.target, 'forminator'); }, true);
    window.addEventListener('load', function () {
      var jq = window.jQuery;
      if (!jq) return;
      try {
        jq(document).on('submit_success', function (e) { formOk_(e.target, 'elementor'); });
        jq(document).on('wpformsAjaxSubmitSuccess', function (e) { formOk_(e.target, 'wpforms'); });
        jq(document).on('forminator:form:submit:success', function (e) { formOk_(e.target, 'forminator'); });
        jq(document).on('gform_confirmation_loaded', function (e, id) {
          var f = document.getElementById('gform_' + id) || document.createElement('form');
          if (!f.id) f.id = 'gform_' + id;
          formOk_(f, 'gravity');
        });
      } catch (e) {}
    });

    // 5) جرد عناصر التواصل (مرة في اليوم لكل مجموعة صفحات ولكل نوع جهاز) — بيوصل لصفحة إعدادات البلجن
    //    2.6.5: الصفحات اللي بنفس الشكل (منتجات · أقسام · مقالات · رحلات…) = مجموعة واحدة، والمميزة (الرئيسية · اتصل بنا…) كل واحدة لوحدها
    function inventory_() {
      if (!CFG.inv) return;
      try {
        var dev = (window.matchMedia && matchMedia('(pointer:coarse)').matches) || window.innerWidth < 768 ? 'm' : 'd';
        var PT = (CFG.pt && CFG.pt.t) || 'other', PL = (CFG.pt && CFG.pt.l) || '';
        var AGG = { product: 1, shop: 1, post: 1, archive: 1, cart: 1, checkout: 1, account: 1, cpt: 1 };
        var k = 'ltp_inv2_' + dev + '_' + (AGG[PT] ? 't_' + PT + '_' + PL : location.pathname);
        var today = new Date().toISOString().slice(0, 10);
        if (sg(LS, k) === today) return;
        var items = [], seen = {};
        function add(it) {
          var key = it.t + '|' + it.d + '|' + it.u;
          if (seen[key] || items.length >= 60) return;
          seen[key] = 1; items.push(it);
        }
        function cleanUrl(u) { try { var w = new URL(u, location.href); w.searchParams.delete('text'); return w.toString().slice(0, 200); } catch (e) { return String(u).slice(0, 200); } }
        var els = document.querySelectorAll(CAND);
        for (var i = 0; i < els.length; i++) {
          var el = els[i];
          if (el.closest('#wpadminbar')) continue;
          var d = detect_(el);
          if (!d || !(CONTACT[d.ct] || d.via === 'rule')) continue;
          var vis = !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
          var cr = creditCtx_(el) && !(d.url && siteNum_(numFromUrl_(d.ct, d.url))) ? 1 : 0;   // 2.13.1: رقم النشاط نفسه مش سطر حقوق
          var ready = (d.ct !== 'wa' || d.via !== 'href') ? 1 : (codeIn_(d.url) || !waAllowed_(d.url, el) ? 1 : 0); // من غير رابط حقيقي: الكود بيتحط وقت الفتح
          add({ t: d.ct, v: d.via, d: desc_(el), x: label_(el).slice(0, 30), u: d.url ? cleanUrl(d.url) : '', c: ready, s: vis ? 1 : 0, p: pos_(el), n: d.url ? numFromUrl_(d.ct, d.url) : '', cr: cr, h: d.url ? numHealth_(d.ct, d.url) : '', e: (el.tagName === 'A' && /^(#.*|javascript:.*|)$/i.test((el.getAttribute('href') || '').trim()) && !d.url && !el.getAttribute('onclick')) ? 1 : 0 });
        }
        var fs = document.querySelectorAll('form');
        for (var j = 0; j < fs.length; j++) {
          if (skipForm_(fs[j])) continue;
          add({ t: 'form', v: formKind_(fs[j]), d: desc_(fs[j]), x: formName_(fs[j]), u: '', c: 1, s: fs[j].offsetWidth ? 1 : 0, p: pos_(fs[j]) });
        }
        // أرقام مكتوبة كنص من غير رابط (الزائر مايقدرش يضغط عليها) — ملاحظة تحسين تحويل
        try {
          var linked = {};
          items.forEach(function (it) { var kk = key9_(it.n); if (kk) linked[kk] = 1; });
          var AR = '٠١٢٣٤٥٦٧٨٩', FA = '۰۱۲۳۴۵۶۷۸۹';
          var tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null), tn, textN = 0;
          while ((tn = tw.nextNode()) && textN < 10) {
            var pe = tn.parentElement;
            if (!pe || pe.closest('a,script,style,noscript,textarea,input,select,#wpadminbar')) continue;
            var raw = String(tn.nodeValue || '').replace(/[٠-٩]/g, function (c) { return AR.indexOf(c); }).replace(/[۰-۹]/g, function (c) { return FA.indexOf(c); });
            var mm2 = raw.match(/(?:\+|00)?\d[\d\s\-]{7,16}\d/g);
            if (!mm2) continue;
            for (var q2 = 0; q2 < mm2.length; q2++) {
              var dg = mm2[q2].replace(/\D/g, '');
              if (dg.length < 9 || dg.length > 14 || /^(19|20)\d{2}$/.test(dg)) continue;
              var kk2 = key9_(dg);
              if (!kk2 || linked[kk2]) continue;
              linked[kk2] = 1; textN++;
              add({ t: 'call', v: 'text', d: desc_(pe), x: mm2[q2].trim().slice(0, 30), u: '', c: 1, s: pe.offsetWidth ? 1 : 0, p: pos_(pe), n: dg, cr: creditCtx_(tn) ? 1 : 0 });
            }
          }
        } catch (e) {}
        st(LS, k, today);
        var body = JSON.stringify({ sid: sid, path: location.pathname.slice(0, 200), title: pageTitle_().slice(0, 80), dev: dev, ver: CFG.version || '', pt: PT, pl: PL, items: items });
        try {
          if (navigator.sendBeacon && navigator.sendBeacon(CFG.inv, new Blob([body], { type: 'application/json' }))) return;
        } catch (e) {}
        try { fetch(CFG.inv, { method: 'POST', body: body, headers: { 'Content-Type': 'application/json' }, keepalive: true }); } catch (e) {}
      } catch (e) {}
    }
    window.addEventListener('load', function () { setTimeout(inventory_, 6000); });

    // الخروج: على الموبايل المتصفح غالباً مابيبعتش pagehide لما الزائر يروح لتطبيق واتساب،
    // فبنبعت كمان لما الصفحة تستخبى (visibilitychange). كل إرسال بيحدّث نفس صف الزيارة بأكبر قيمة.
    var lastExit = 0;
    function onExit() {
      try { flushPend_(); } catch (e) {} // ضغطة مستنية: تتبعت قبل ما الصفحة تستخبى (الزائر راح لواتساب)
      try { maxScroll = Math.max(maxScroll, scrollPct()); saveJr_(); } catch (e) {}
      if (!detailed) return;
      var t = Date.now();
      if (t - lastExit < 2000) return;
      lastExit = t;
      maxScroll = Math.max(maxScroll, scrollPct());
      saveJr_();
      var b = base('exit');
      b.scroll = maxScroll;
      b.mm = mm;
      send(b);
    }
    window.addEventListener('pagehide', onExit);
    window.addEventListener('beforeunload', onExit);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') onExit();
    });

    // ───────────── بانر الموافقة ─────────────
    (function () {
      var K = 'ltp_consent_v2', V = '2.0';
      var b = document.getElementById('ltp-cookie-banner');
      if (!b) return;
      var m = document.getElementById('ltp-cb-modal');

      function saveConsent(status, prefs) {
        var data = {
          status: status,
          version: V,
          timestamp: new Date().toISOString(),
          preferences: prefs || {
            essential: true,
            analytics: status === 'accepted',
            ads: status === 'accepted'
          }
        };
        st(LS, K, JSON.stringify(data));
        // ─── ✨ اكتب الموافقة في كوكي للسيرفر ───
        setCookie('ltp_consent_v2', status, 365);

        // الرفض (أو رفض التحليلية) = مسح أي معرّف دائم اتحفظ قبل كده
        if (level() !== 'full') {
          rm(LS, 'ltp_vid'); rm(LS, 'ltp_first'); rm(LS, 'ltp_vis');
          rm(LS, 'ltp_fs'); rm(LS, 'ltp_fsd'); rm(LS, 'ltp_fs_t');
          // امسح الكوكيز كمان
          rmCookie('ltp_vid'); rmCookie('ltp_vis');
          rmCookie('ltp_fs'); rmCookie('ltp_fsd'); rmCookie('ltp_fsat');
        }

        send({
          event: 'consent', consent: status, sid: sid, vid: visitorId(),
          url: location.href.split('#')[0], path: location.pathname
        });

        b.style.display = 'none';
        if (m) m.style.display = 'none';
        if (level() === 'full') window.dispatchEvent(new Event('ltp:consent:accepted'));
      }

      var btnAccept = document.getElementById('ltp-cb-accept');
      var btnReject = document.getElementById('ltp-cb-reject');
      var btnSettings = document.getElementById('ltp-cb-settings');
      var btnSave = document.getElementById('ltp-cb-save');

      if (btnAccept) btnAccept.onclick = function () { saveConsent('accepted'); };
      if (btnReject) btnReject.onclick = function () { saveConsent('rejected'); };
      if (btnSettings) btnSettings.onclick = function () { if (m) m.style.display = 'flex'; };
      if (btnSave) btnSave.onclick = function () {
        var elA = document.getElementById('ltp-cb-analytics');
        var elAds = document.getElementById('ltp-cb-ads');
        saveConsent('custom', {
          essential: true,
          analytics: !!(elA && elA.checked),
          ads: !!(elAds && elAds.checked)
        });
      };

      if (!readConsent()) {
        setTimeout(function () { b.style.display = 'flex'; }, 800);
      }
    })();

    console.log('[LTP] v3.0 loaded ✅ (plugin 2.5.0)');

  } catch (e) {
    if (window.console) console.error('LTP fatal:', e);
  }
})();