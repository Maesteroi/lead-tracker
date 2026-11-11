// لوحة إدارة المنصة: الحسابات (حالة · تجربة · حد المواقع · خطة · سياسة الأحداث وقت التوقف · ملاحظات) + بوت تليجرام.
// كل النصوص بتتكتب كنص (textContent)، مفيش HTML من السيرفر.
(function () {
  'use strict';
  var LT = window.LT, el = LT.el, clear = LT.clear;
  var $ = function (id) { return document.getElementById(id); };
  var data = null, filter = 'all', query = '', current = null, draft = null, lastFocus = null, confirming = false;

  var STATUS = {
    trial: { t: 'تجربة', c: 'info' }, active: { t: 'مفعّل', c: 'ok' },
    past_due: { t: 'متأخر في الدفع', c: 'warn' }, off: { t: 'موقوف', c: 'bad' }
  };
  var PLAN = { trial: 'تجربة', basic: 'أساسية', pro: 'احترافية', agency: 'وكالة', internal: 'داخلي' };
  var FILTERS = [['all', 'الكل'], ['active', 'مفعّل'], ['trial', 'تجربة'], ['attention', 'محتاج انتباه']];

  // ── أدوات ──
  var fmt = function (n) { return Number(n || 0).toLocaleString('en-US'); };
  function dateAr(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleDateString('ar-EG-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return iso.slice(0, 10); }
  }
  function ago(iso) {
    if (!iso) return 'مفيش نشاط في آخر 7 أيام';
    var s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
    if (s < 90) return 'دلوقتي';
    var m = Math.round(s / 60); if (m < 60) return 'من ' + m + ' دقيقة';
    var h = Math.round(m / 60); if (h < 24) return h === 1 ? 'من ساعة' : h === 2 ? 'من ساعتين' : 'من ' + h + ' ساعات';
    var d = Math.round(h / 24); return d === 1 ? 'من يوم' : d === 2 ? 'من يومين' : 'من ' + d + ' أيام';
  }
  function daysLeft(iso) { return iso ? Math.ceil((Date.parse(iso) - Date.now()) / 864e5) : null; }
  function statusOf(o) { return o.trial_expired ? { t: 'التجربة خلصت', c: 'warn' } : (STATUS[o.status] || { t: o.status, c: '' }); }
  function limitOf(o) { return o.max_sites != null ? o.max_sites : (o.status === 'trial' ? data.defaults.trial_max_sites : null); }
  function attention(o) { return o.status === 'past_due' || o.status === 'off' || o.trial_expired; }
  function bar(pct, full) { var i = el('i'); i.style.width = pct + '%'; return el('div', { class: 'bar' + (full ? ' full' : '') }, [i]); }   // CSSOM (الـCSP بيمنع style="")
  function pill(s) { return el('span', { class: 'pill ' + s.c, text: s.t }); }
  function toast(msg, bad) {
    var t = $('toast'); t.textContent = msg; t.className = 'toast' + (bad ? ' bad' : ''); t.hidden = false;
    clearTimeout(toast.h); toast.h = setTimeout(function () { t.hidden = true; }, 3200);
  }

  // ── التحميل ──
  function load() {
    $('refresh').disabled = true;
    return Promise.all([LT.api('/v1/platform/overview'), LT.api('/v1/platform/telegram')]).then(function (r) {
      $('refresh').disabled = false;
      if (r[0].status === 404) return showDenied();
      if (!r[0].ok) { toast('مقدرناش نحمّل البيانات. جرّب تاني.', true); return; }
      data = r[0].body;
      $('loading').hidden = true; $('app').hidden = false;
      $('updated').textContent = 'آخر تحديث ' + new Date().toLocaleTimeString('ar-EG-u-nu-latn', { hour: 'numeric', minute: '2-digit' });
      renderKpis(); renderFilter(); renderRows(); renderTg(r[1].ok ? r[1].body : null);
      if (current) { var o = find(current.id); if (o) { current = o; renderDrawerInfo(); } }
    });
  }
  function find(id) { for (var i = 0; i < data.orgs.length; i++) if (data.orgs[i].id === id) return data.orgs[i]; return null; }
  function showDenied() { $('loading').hidden = true; $('app').hidden = true; $('denied').hidden = false; }

  // ── الأرقام ──
  function renderKpis() {
    var t = data.totals, box = clear($('kpis'));
    [['الحسابات', t.orgs, '', 'info'], ['مفعّل', t.active, 'بيدفع أو داخلي', 'ok'], ['في التجربة', t.trial, 'لسه شغالة', 'info'],
     ['محتاج انتباه', t.attention, 'موقوف · متأخر · تجربة خلصت', t.attention ? 'warn' : 'mute'], ['المواقع', t.sites, 'متربطة بحسابات', 'info'],
     ['أحداث آخر 24 ساعة', t.ev_24h, fmt(t.ev_7d) + ' في 7 أيام', 'ok']].forEach(function (k) {
      box.appendChild(el('div', { class: 'kpi ' + k[3] }, [el('div', { class: 'k-label', text: k[0] }), el('div', { class: 'k-val', text: fmt(k[1]) }), k[2] ? el('div', { class: 'k-sub', text: k[2] }) : null]));
    });
  }

  // ── التصفية ──
  function count(f) { return data.orgs.filter(function (o) { return match(o, f); }).length; }
  function match(o, f) {
    if (f === 'all') return true;
    if (f === 'attention') return attention(o);
    if (f === 'trial') return o.status === 'trial' && !o.trial_expired;
    return o.status === f;
  }
  function renderFilter() {
    var box = clear($('filter'));
    FILTERS.forEach(function (f) {
      var b = el('button', { type: 'button', 'aria-pressed': String(filter === f[0]) }, [document.createTextNode(f[1]), el('span', { class: 'n', text: String(count(f[0])) })]);
      b.addEventListener('click', function () { filter = f[0]; renderFilter(); renderRows(); });
      box.appendChild(b);
    });
  }

  // ── الجدول ──
  function renderRows() {
    var q = query.trim().toLowerCase(), body = clear($('rows'));
    var list = data.orgs.filter(function (o) {
      if (!match(o, filter)) return false;
      if (!q) return true;
      var hay = [o.name, o.owner && o.owner.email, o.owner && o.owner.name].concat(o.sites.map(function (s) { return s.domains.join(' ') + ' ' + s.name; })).join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
    list.sort(function (a, b) { return (attention(b) - attention(a)) || (b.ev_7d - a.ev_7d); });
    $('empty').hidden = list.length > 0;
    list.forEach(function (o) {
      var lim = limitOf(o), pct = lim ? Math.min(100, Math.round(o.site_count / lim * 100)) : 0;
      var trial = o.status === 'trial' && o.trial_ends_at ? (daysLeft(o.trial_ends_at) > 0 ? 'فاضل ' + daysLeft(o.trial_ends_at) + ' يوم' : 'خلصت ' + dateAr(o.trial_ends_at)) : '';
      var tr = el('tr', { tabindex: '0', 'aria-label': 'إدارة ' + o.name }, [
        el('td', { class: 'first' }, [el('div', { class: 'acc-name', text: o.name }), el('span', { class: 'acc-sub', text: o.owner ? (o.owner.email || '') : 'من غير مالك' })]),
        el('td', { 'data-l': 'الحالة' }, [pill(statusOf(o))]),
        el('td', { 'data-l': 'المواقع' }, [el('div', {}, [el('span', { class: 'num', text: String(o.site_count) }), el('span', { class: 'dim', text: lim == null ? ' · من غير حد' : ' من ' + lim })]),
          lim ? bar(pct, o.site_count >= lim) : null]),
        el('td', { 'data-l': 'الأحداث' }, [el('div', {}, [el('span', { class: 'num', text: fmt(o.ev_24h) }), el('span', { class: 'dim', text: ' اليوم · ' + fmt(o.ev_7d) + ' أسبوع' })])]),
        el('td', { 'data-l': 'آخر نشاط', class: 'dim', text: ago(o.last_at) }),
        el('td', { 'data-l': 'التجربة / الخطة' }, [el('div', { text: o.plan ? PLAN[o.plan] || o.plan : '—' }), trial ? el('div', { class: 'dim', text: trial }) : null]),
        el('td', { class: 'last' }, [el('span', { class: 'go', text: 'إدارة ‹' })])
      ]);
      var open = function () { openDrawer(o, tr); };
      tr.addEventListener('click', open);
      tr.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
      body.appendChild(tr);
    });
  }

  // ── تليجرام ──
  function renderTg(t) {
    var p = $('tg-pill'), d = $('tg-desc'), m = $('tg-meta'), bs = $('tg-server'), bh = $('tg-sheet');
    bs.hidden = bh.hidden = true; m.textContent = '';
    if (!t || !t.configured) { p.className = 'pill'; p.textContent = 'مش متظبط'; d.textContent = 'توكن البوت مش موجود على السيرفر.'; return; }
    if (t.error) { p.className = 'pill warn'; p.textContent = 'مش واضح'; d.textContent = 'تليجرام ماردش دلوقتي. جرّب «تحديث».'; return; }
    var MODES = {
      server: ['ok', 'على السيرفر', 'الزراير والأوامر بتوصل للسيرفر. اللي يخص الشيت (مواقع الشيت · /start · زراير الإعلانات) السيرفر بيعدّيه للشيت زي ما هو.'],
      sheet: ['info', 'على الشيت', 'البوت لسه بيكلّم الشيت. زراير النتيجة على رسايل السيرفر مش هتشتغل غير لما تحوّله للسيرفر.'],
      none: ['warn', 'مش متوصل', 'البوت مش متوصل بأي عنوان، فالزراير والأوامر مش بتوصل لحد.'],
      other: ['warn', 'عنوان تاني', 'البوت متوصل بعنوان مش السيرفر ولا الشيت.']
    };
    var md = MODES[t.mode] || MODES.other;
    p.className = 'pill ' + md[0]; p.textContent = md[1]; d.textContent = md[2];
    var meta = [];
    if (t.pending) meta.push(fmt(t.pending) + ' تحديث مستني');
    if (t.last_error) meta.push('آخر خطأ: ' + t.last_error + (t.last_error_at ? ' (' + ago(t.last_error_at) + ')' : ''));
    m.textContent = meta.join(' · ');
    bs.hidden = t.mode === 'server';
    bh.hidden = t.mode === 'sheet' || !t.sheet_ready;
  }
  function switchTg(target, btn) {
    btn.disabled = true;
    LT.api('/v1/platform/telegram', { method: 'POST', body: { target: target } }).then(function (r) {
      btn.disabled = false;
      if (!r.ok) { toast('تليجرام رفض التحويل' + (r.body.detail ? ': ' + r.body.detail : ''), true); return; }
      renderTg(r.body); toast(target === 'server' ? 'البوت بقى على السيرفر ✓' : 'البوت رجع للشيت ✓');
    });
  }

  // ── الدرج: إدارة حساب ──
  function openDrawer(o, from) {
    current = o; lastFocus = from || document.activeElement; confirming = false;
    draft = { status: o.status, extend: 0, limMode: o.max_sites == null ? 'plan' : 'custom', max: o.max_sites != null ? o.max_sites : Math.max(o.site_count, limitOf(o) || 3),
      plan: o.plan || '', policy: o.events_policy || 'grace', grace: o.grace_days != null ? o.grace_days : 7, notes: o.notes || '' };
    renderDrawerInfo(); renderDrawerForm();
    $('scrim').hidden = false; $('drawer').hidden = false; document.body.style.overflow = 'hidden';
    $('d-close').focus();
  }
  function closeDrawer() {
    $('scrim').hidden = true; $('drawer').hidden = true; document.body.style.overflow = '';
    current = null; draft = null;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function renderDrawerInfo() {
    var o = current;
    $('d-name').textContent = o.name;
    $('d-owner').textContent = o.owner ? ((o.owner.name ? o.owner.name + ' · ' : '') + (o.owner.email || '')) : 'من غير مالك';
    $('d-since').textContent = 'من ' + dateAr(o.created_at) + (o.owner && o.owner.last_login_at ? ' · آخر دخول ' + ago(o.owner.last_login_at).replace('مفيش نشاط في آخر 7 أيام', '—') : '');
    var st = clear($('d-state')), ev = o.events || {};
    var line = ev.state === 'rejecting' ? ['bad', 'أحداث مواقعه مرفوضة دلوقتي (السيرفر مش بيسجّلها).']
      : ev.state === 'grace' ? ['warn', 'فترة سماح: الأحداث بتتسجل لحد ' + dateAr(ev.until) + '، وبعدها هتترفض.']
      : ['ok', 'أحداث مواقعه بتتسجل عادي.'];
    st.appendChild(el('div', { class: 'notice ' + line[0], text: line[1] }));
    var ul = clear($('d-sites'));
    if (!o.sites.length) ul.appendChild(el('li', {}, [el('span', { class: 'dim', text: 'لسه مفيش مواقع.' })]));
    o.sites.forEach(function (s) {
      ul.appendChild(el('li', {}, [
        el('div', {}, [el('span', { class: 's-name', text: s.name }), el('span', { class: 's-dom', text: s.domains.join(' · ') })]),
        el('div', { class: 's-num' }, [el('b', { text: fmt(s.ev_24h) }), document.createTextNode(' اليوم · '), el('b', { text: fmt(s.ev_7d) }), document.createTextNode(' أسبوع'), el('div', { text: s.paired ? ago(s.last_at) : 'مااتربطش لسه' })])
      ]));
    });
  }
  function renderDrawerForm() {
    var o = current, seg = clear($('d-status'));
    ['trial', 'active', 'past_due', 'off'].forEach(function (k) {
      var b = el('button', { type: 'button', role: 'radio', 'data-v': k, 'aria-checked': String(draft.status === k), text: STATUS[k].t });
      b.addEventListener('click', function () { draft.status = k; confirming = false; renderDrawerForm(); });
      seg.appendChild(b);
    });
    $('d-status-hint').textContent = draft.status !== o.status ? 'هتتغيّر من «' + STATUS[o.status].t + '» لـ«' + STATUS[draft.status].t + '» بعد الحفظ.' : '';
    // التجربة
    var end = o.trial_ends_at ? Date.parse(o.trial_ends_at) : null;
    var base = Math.max(Date.now(), end || 0), newEnd = draft.extend ? new Date(base + draft.extend * 864e5).toISOString() : null;
    $('d-trial').textContent = newEnd ? 'هتخلص ' + dateAr(newEnd) + ' (بعد الحفظ)' : end ? (end > Date.now() ? 'بتخلص ' + dateAr(o.trial_ends_at) + ' · فاضل ' + daysLeft(o.trial_ends_at) + ' يوم' : 'خلصت ' + dateAr(o.trial_ends_at)) : 'مفيش تاريخ نهاية';
    Array.prototype.forEach.call(document.querySelectorAll('[data-extend]'), function (c) { c.classList.toggle('on', Number(c.getAttribute('data-extend')) === draft.extend); });
    // حد المواقع
    $('d-lim-plan').textContent = draft.status === 'trial' ? 'التجربة: ' + data.defaults.trial_max_sites + ' مواقع' : 'من غير حد';
    setRadio('lim', draft.limMode); $('d-max').value = draft.max; $('d-max').disabled = draft.limMode !== 'custom';
    $('lim-minus').disabled = $('lim-plus').disabled = draft.limMode !== 'custom';
    $('d-plan').value = draft.plan;
    setRadio('pol', draft.policy); $('d-grace').value = draft.grace;
    $('d-notes').value = draft.notes;
    renderConfirm();
  }
  function setRadio(name, v) { Array.prototype.forEach.call(document.getElementsByName(name), function (r) { r.checked = r.value === v; }); }
  function renderConfirm() {
    var c = $('d-confirm'), save = $('d-save');
    var risky = draft.status !== current.status && (draft.status === 'off' || draft.status === 'past_due');
    if (confirming && risky) {
      var p = draft.policy === 'keep' ? 'أحداث مواقعه هتفضل تتسجل.' : draft.policy === 'reject' ? 'أحداث مواقعه هتترفض من دلوقتي.' : 'أحداث مواقعه هتتسجل ' + draft.grace + ' يوم وبعدين هتترفض.';
      c.textContent = 'متأكد؟ الحساب هيبقى «' + STATUS[draft.status].t + '»: مش هيقدر يضيف مواقع، و' + p;
      c.hidden = false; save.textContent = 'أيوه، ' + (draft.status === 'off' ? 'أوقف الحساب' : 'سجّله متأخر'); save.className = 'btn danger';
    } else { c.hidden = true; save.textContent = 'حفظ التغييرات'; save.className = 'btn'; }
  }
  function changes() {
    var o = current, b = {};
    if (draft.status !== o.status) b.status = draft.status;
    if (draft.extend) b.extend_trial_days = draft.extend;
    var max = draft.limMode === 'custom' ? Math.max(0, Math.min(1000, parseInt(draft.max, 10) || 0)) : null;
    if (max !== (o.max_sites == null ? null : o.max_sites)) b.max_sites = max;
    if ((draft.plan || null) !== (o.plan || null)) b.plan = draft.plan || null;
    if (draft.policy !== (o.events_policy || 'grace')) b.events_policy = draft.policy;
    var g = Math.max(0, Math.min(90, parseInt(draft.grace, 10) || 0));
    if (g !== (o.grace_days != null ? o.grace_days : 7)) b.grace_days = g;
    if ((draft.notes.trim() || null) !== (o.notes || null)) b.notes = draft.notes.trim();
    return b;
  }
  function save() {
    var b = changes();
    if (!Object.keys(b).length) { closeDrawer(); return; }
    if ((b.status === 'off' || b.status === 'past_due') && !confirming) { confirming = true; renderConfirm(); return; }
    var btn = $('d-save'); btn.disabled = true;
    LT.api('/v1/platform/orgs/' + current.id, { method: 'POST', body: b }).then(function (r) {
      btn.disabled = false;
      if (!r.ok) { toast(r.body.error && r.body.error.indexOf('bad_') === 0 ? 'قيمة مش مظبوطة. راجع الخانات.' : 'مااتحفظش. جرّب تاني.', true); return; }
      toast('اتحفظ ✓ «' + current.name + '»');
      closeDrawer(); load();
    });
  }

  // ── الربط ──
  function wire() {
    $('refresh').addEventListener('click', load);
    $('q').addEventListener('input', function (e) { query = e.target.value; renderRows(); });
    $('tg-server').addEventListener('click', function (e) { switchTg('server', e.currentTarget); });
    $('tg-sheet').addEventListener('click', function (e) { switchTg('sheet', e.currentTarget); });
    $('d-close').addEventListener('click', closeDrawer);
    $('d-cancel').addEventListener('click', closeDrawer);
    $('scrim').addEventListener('click', closeDrawer);
    $('d-save').addEventListener('click', save);
    Array.prototype.forEach.call(document.querySelectorAll('[data-extend]'), function (c) {
      c.addEventListener('click', function () { var d = Number(c.getAttribute('data-extend')); draft.extend = draft.extend === d ? 0 : d; renderDrawerForm(); });
    });
    Array.prototype.forEach.call(document.getElementsByName('lim'), function (r) { r.addEventListener('change', function () { draft.limMode = r.value; renderDrawerForm(); }); });
    Array.prototype.forEach.call(document.getElementsByName('pol'), function (r) { r.addEventListener('change', function () { draft.policy = r.value; confirming = false; renderDrawerForm(); }); });
    $('d-max').addEventListener('input', function (e) { draft.max = e.target.value; });
    $('lim-minus').addEventListener('click', function () { draft.max = Math.max(0, (parseInt(draft.max, 10) || 0) - 1); renderDrawerForm(); });
    $('lim-plus').addEventListener('click', function () { draft.max = Math.min(1000, (parseInt(draft.max, 10) || 0) + 1); renderDrawerForm(); });
    $('d-plan').addEventListener('change', function (e) { draft.plan = e.target.value; });
    $('d-grace').addEventListener('input', function (e) { draft.grace = e.target.value; });
    $('d-grace').addEventListener('focus', function () { if (draft.policy !== 'grace') { draft.policy = 'grace'; setRadio('pol', 'grace'); } });
    $('d-notes').addEventListener('input', function (e) { draft.notes = e.target.value; });
    document.addEventListener('keydown', function (e) {
      if ($('drawer').hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); closeDrawer(); return; }
      if (e.key === 'Tab') {                       // التركيز يفضل جوه الدرج
        var f = $('drawer').querySelectorAll('button:not([disabled]), input:not([disabled]), select, textarea');
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    $('out').addEventListener('click', function () { LT.logout().then(function () { location.assign('/login'); }); });
  }

  LT.me().then(function (m) {
    if (!m) { location.replace('/login?next=' + encodeURIComponent('/admin')); return; }
    $('who').textContent = m.user.name || m.user.email || '';
    $('out').hidden = false;
    if (!m.user.platform_admin) { showDenied(); return; }
    wire(); load();
  });
})();
