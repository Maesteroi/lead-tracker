// لوحة إدارة المنصة: الحسابات (حالة · تجربة · حد المواقع · خطة · سياسة الأحداث وقت التوقف · ملاحظات) + بوت تليجرام.
// كل النصوص بتتكتب كنص (textContent)، مفيش HTML من السيرفر.
(function () {
  'use strict';
  var LT = window.LT, el = LT.el, clear = LT.clear, T = LT.t;
  var $ = function (id) { return document.getElementById(id); };
  var data = null, filter = 'all', query = '', current = null, draft = null, lastFocus = null, confirming = false, ME = null;
  // صلاحيات صاحب الجلسة (G-29): السوبر أدمن = كل حاجة
  function can(p) { return !!ME && (ME.owner || (ME.perms || []).indexOf(p) >= 0); }

  var STATUS = {
    trial: { t: T('adm.st.trial'), c: 'info' }, active: { t: T('adm.st.active'), c: 'ok' },
    past_due: { t: T('adm.st.past_due'), c: 'warn' }, off: { t: T('adm.st.off'), c: 'bad' }
  };
  var PLAN = { trial: T('adm.plan.trial'), basic: T('adm.plan.basic'), pro: T('adm.plan.pro'), agency: T('adm.plan.agency'), internal: T('adm.plan.internal_s') };
  var FILTERS = [['all', T('adm.f.all')], ['active', T('adm.st.active')], ['trial', T('adm.st.trial')], ['attention', T('adm.f.attention')]];

  // ── أدوات ──
  var fmt = function (n) { return Number(n || 0).toLocaleString('en-US'); };
  function dateAr(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleDateString(LT.locale, { day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return iso.slice(0, 10); }
  }
  function ago(iso) {
    if (!iso) return T('adm.ago.none');
    var s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
    if (s < 90) return T('adm.ago.now');
    var m = Math.round(s / 60); if (m < 60) return T('adm.ago', { t: LT.n(m, 'minute') });
    var h = Math.round(m / 60); if (h < 24) return T('adm.ago', { t: LT.n(h, 'hour') });
    return T('adm.ago', { t: LT.n(Math.round(h / 24), 'day') });
  }
  function daysLeft(iso) { return iso ? Math.ceil((Date.parse(iso) - Date.now()) / 864e5) : null; }
  function statusOf(o) { return o.trial_expired ? { t: T('adm.st.trial_over'), c: 'warn' } : (STATUS[o.status] || { t: o.status, c: '' }); }
  function limitOf(o) { return o.max_sites != null ? o.max_sites : (o.status === 'trial' ? data.defaults.trial_max_sites : null); }
  function attention(o) { return o.status === 'past_due' || o.status === 'off' || o.trial_expired; }
  function bar(pct, full) { var i = el('i'); i.style.width = pct + '%'; return el('div', { class: 'bar' + (full ? ' full' : '') }, [i]); }   // CSSOM (الـCSP بيمنع style="")
  // قياس التوصيل (بلجن 2.12.2): آخر يوم بلّغ عنه كل موقع، وأسوأ موقع للحساب
  function lastDelivery(site) { return site.delivery && site.delivery.length ? site.delivery[0] : null; }
  function orgDelivery(o) {
    var rows = o.sites.map(lastDelivery).filter(Boolean);
    if (!rows.length) return null;
    rows.sort(function (a, b) { return (a.ok - b.ok) || (a.pv_pct - b.pv_pct); });
    return rows[0];
  }
  function deliveryPill(d) {
    if (!d) return el('span', { class: 'dim', text: T('adm.del.none') });
    return el('span', { class: 'pill ' + (d.ok ? 'ok' : 'warn'), title: d.day + ' · ' + T('adm.del.counts', { a: d.server_pv + '/' + d.local_pv, b: d.server_click + '/' + d.local_click }), text: d.pv_pct + '%' + (d.server_click < d.local_click ? ' · ' + T('adm.del.missing') : '') });
  }
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
      if (!r[0].ok) { toast(T('adm.load.fail'), true); return; }
      data = r[0].body;
      ME = data.me || { owner: true, perms: ['*'] };
      $('loading').hidden = true; $('app').hidden = false;
      $('updated').textContent = T('adm.updated') + ' ' + new Date().toLocaleTimeString(LT.locale, { hour: 'numeric', minute: '2-digit' });
      $('new-acc').hidden = !can('orgs_create');
      renderKpis(); renderFilter(); renderRows(); renderCfg(data.config); $('tg').hidden = r[1].status === 404; if (r[1].status !== 404) renderTg(r[1].ok ? r[1].body : null);
      $('role-eyebrow').textContent = ME.owner ? T('adm.role') : T('adm.role.team') + ' · ' + (ME.role || '') + (ME.scoped ? ' ' + T('adm.role.scoped') : '');
      $('tab-btn-team').hidden = !ME.owner; $('tab-btn-audit').hidden = !(ME.owner || can('audit')); $('tab-btn-alerts').hidden = !(ME.owner || can('telegram')); $('tab-btn-lab').hidden = !ME.owner; $('tab-btn-billing').hidden = !(ME.owner || can('billing'));
      if (current) { var o = find(current.id); if (o) { current = o; renderDrawerInfo(); } }
    });
  }
  // إعداد جوجل أدز (للمدير العام): أسماء الناقص بس، من غير قيم
  function renderCfg(c) {
    var box = $('cfg'); if (!c) { box.hidden = true; return; }
    box.hidden = false;
    var miss = (c.ads_missing || []).map(function (m) { var p = m.split(':'); return p[1] === 'length' ? T('adm.cfg.short', { n: p[0] }) : p[0]; });
    $('cfg-text').textContent = miss.length ? T('adm.cfg.missing', { list: miss.join(' · ') }) : T(c.ads_pull ? 'adm.cfg.ok' : 'adm.cfg.ok_nopull');
    $('cfg-text').className = miss.length ? 'notice warn' : 'muted';
  }
  function find(id) { for (var i = 0; i < data.orgs.length; i++) if (data.orgs[i].id === id) return data.orgs[i]; return null; }
  function showDenied() { $('loading').hidden = true; $('app').hidden = true; $('denied').hidden = false; }

  // ── الأرقام ──
  function renderKpis() {
    var t = data.totals, box = clear($('kpis'));
    [[T('adm.accounts'), t.orgs, '', 'info'], [T('adm.st.active'), t.active, T('adm.k.active'), 'ok'], [T('adm.k.trial'), t.trial, T('adm.k.trial.sub'), 'info'],
     [T('adm.f.attention'), t.attention, T('adm.k.att.sub'), t.attention ? 'warn' : 'mute'], [T('adm.h.sites'), t.sites, T('adm.k.sites.sub'), 'info'],
     [T('adm.k.ev'), t.ev_24h, T('adm.k.ev.sub', { n: fmt(t.ev_7d) }), 'ok']].forEach(function (k) {
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
      var trial = o.status === 'trial' && o.trial_ends_at ? (daysLeft(o.trial_ends_at) > 0 ? T('adm.trial.left', { n: LT.n(daysLeft(o.trial_ends_at), 'day') }) : T('adm.trial.ended', { d: dateAr(o.trial_ends_at) })) : '';
      var tr = el('tr', { tabindex: '0', 'aria-label': T('adm.h.manage') + ' ' + o.name }, [
        el('td', { class: 'first' }, [el('div', { class: 'acc-name', text: o.name }), el('span', { class: 'acc-sub', text: o.owner ? (o.owner.email || '') : T('adm.no_owner') })]),
        el('td', { 'data-l': T('adm.h.status') }, [pill(statusOf(o))]),
        el('td', { 'data-l': T('adm.h.sites') }, [el('div', {}, [el('span', { class: 'num', text: String(o.site_count) }), el('span', { class: 'dim', text: lim == null ? ' · ' + T('adm.no_limit') : ' ' + T('adm.of', { n: lim }) })]),
          lim ? bar(pct, o.site_count >= lim) : null]),
        el('td', { 'data-l': T('adm.h.events') }, [el('div', {}, [el('span', { class: 'num', text: fmt(o.ev_24h) }), el('span', { class: 'dim', text: ' ' + T('adm.ev.line', { w: fmt(o.ev_7d) }) })])]),
        el('td', { 'data-l': T('adm.h.delivery') }, [deliveryPill(orgDelivery(o))]),
        el('td', { 'data-l': T('adm.h.last'), class: 'dim', text: ago(o.last_at) }),
        el('td', { 'data-l': T('adm.h.plan') }, [el('div', { text: o.plan ? PLAN[o.plan] || o.plan : '—' }), trial ? el('div', { class: 'dim', text: trial }) : null]),
        el('td', { class: 'last' }, [el('span', { class: 'go', text: T('adm.h.manage') + ' ' + T('arrow') })])
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
    if (!t || !t.configured) { p.className = 'pill'; p.textContent = T('adm.tg.unset'); d.textContent = T('adm.tg.unset.d'); return; }
    if (t.error) { p.className = 'pill warn'; p.textContent = T('adm.tg.unknown'); d.textContent = T('adm.tg.unknown.d'); return; }
    var MODES = {
      server: ['ok', T('adm.tg.on_server'), T('adm.tg.on_server.d')],
      sheet: ['info', T('adm.tg.on_sheet'), T('adm.tg.on_sheet.d')],
      none: ['warn', T('adm.tg.none'), T('adm.tg.none.d')],
      other: ['warn', T('adm.tg.other'), T('adm.tg.other.d')]
    };
    var md = MODES[t.mode] || MODES.other;
    p.className = 'pill ' + md[0]; p.textContent = md[1]; d.textContent = md[2];
    var meta = [];
    if (t.pending) meta.push(T('adm.tg.pending', { n: fmt(t.pending) }));
    if (t.last_error) meta.push(T('adm.tg.last_err') + ' ' + t.last_error + (t.last_error_at ? ' (' + ago(t.last_error_at) + ')' : ''));
    m.textContent = meta.join(' · ');
    bs.hidden = t.mode === 'server';
    bh.hidden = t.mode === 'sheet' || !t.sheet_ready;
  }
  function switchTg(target, btn) {
    btn.disabled = true;
    LT.api('/v1/platform/telegram', { method: 'POST', body: { target: target } }).then(function (r) {
      btn.disabled = false;
      if (!r.ok) { toast(T('adm.tg.refused') + (r.body.detail ? ': ' + r.body.detail : ''), true); return; }
      renderTg(r.body); toast(T(target === 'server' ? 'adm.tg.moved_server' : 'adm.tg.moved_sheet'));
    });
  }

  // ── الدرج: إدارة حساب ──
  function openDrawer(o, from) {
    current = o; lastFocus = from || document.activeElement; confirming = false;
    draft = { status: o.status, extend: 0, limMode: o.max_sites == null ? 'plan' : 'custom', max: o.max_sites != null ? o.max_sites : Math.max(o.site_count, limitOf(o) || 3),
      plan: o.plan || '', policy: o.events_policy || 'grace', grace: o.grace_days != null ? o.grace_days : 7, notes: o.notes || '', replay: o.replay !== false };
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
    $('d-owner').textContent = o.owner ? ((o.owner.name ? o.owner.name + ' · ' : '') + (o.owner.email || '')) : T('adm.no_owner');
    $('d-since').textContent = T('adm.since', { d: dateAr(o.created_at) }) + (o.owner && o.owner.last_login_at ? ' · ' + T('adm.last_login', { t: ago(o.owner.last_login_at) }) : '');
    var st = clear($('d-state')), ev = o.events || {};
    var line = ev.state === 'rejecting' ? ['bad', T('adm.ev.rejecting')]
      : ev.state === 'grace' ? ['warn', T('adm.ev.grace', { d: dateAr(ev.until) })]
      : ['ok', T('adm.ev.ok')];
    st.appendChild(el('div', { class: 'notice ' + line[0], text: line[1] }));
    var ul = clear($('d-sites'));
    if (!o.sites.length) ul.appendChild(el('li', {}, [el('span', { class: 'dim', text: T('adm.no_sites') })]));
    o.sites.forEach(function (s) {
      ul.appendChild(el('li', {}, [
        el('div', {}, [el('span', { class: 's-name', text: s.name }), el('span', { class: 's-dom', text: s.domains.join(' · ') }), el('a', { class: 'open-dash', href: '/?site=' + encodeURIComponent(s.id) + '#/overview', text: T('adm.open_dash') })]),
        el('div', { class: 's-num' }, [el('b', { text: fmt(s.ev_24h) }), document.createTextNode(' ' + T('adm.today') + ' · '), el('b', { text: fmt(s.ev_7d) }), document.createTextNode(' ' + T('adm.week')), el('div', { text: s.paired ? ago(s.last_at) : T('adm.not_paired') })])
      ]));
      (s.delivery || []).forEach(function (d) {
        var o2 = d.out || {}, bits = [];
        if (o2.failed_first) bits.push(T('adm.d.failed_first', { n: o2.failed_first }));
        if (o2.queued) bits.push(T('adm.d.queued', { n: o2.queued }));
        if (o2.rejected) bits.push(T('adm.d.rejected', { n: o2.rejected }));
        ul.appendChild(el('li', { class: 'dl' }, [
          el('div', {}, [el('span', { class: 'dim', text: T('adm.h.delivery') + ' ' + d.day }), bits.length ? el('span', { class: 's-dom', text: bits.join(' · ') }) : null]),
          el('div', { class: 's-num' }, [deliveryPill(d), el('div', { text: T('adm.del.counts', { a: d.server_pv + '/' + d.local_pv, b: d.server_click + '/' + d.local_click }) })])
        ]));
      });
    });
  }
  function renderDrawerForm() {
    var o = current, seg = clear($('d-status'));
    // كل جزء بيظهر بس لو عندك صلاحيته، والحساب كله في نطاقك (السيرفر بيتأكد كمان)
    var editable = o.can_edit !== false, any = false;
    Array.prototype.forEach.call(document.querySelectorAll('#drawer [data-perm]'), function (f) { var ok = editable && can(f.getAttribute('data-perm')); f.hidden = !ok; if (ok && !f.hasAttribute('data-act')) any = true; });
    $('d-save').hidden = !any;
    ['trial', 'active', 'past_due', 'off'].filter(function (k) { return k === o.status || can('orgs_suspend') || (k !== 'off' && k !== 'past_due'); }).forEach(function (k) {
      var b = el('button', { type: 'button', role: 'radio', 'data-v': k, 'aria-checked': String(draft.status === k), text: STATUS[k].t });
      b.addEventListener('click', function () { draft.status = k; confirming = false; renderDrawerForm(); });
      seg.appendChild(b);
    });
    $('d-status-hint').textContent = draft.status !== o.status ? T('adm.d.st_change', { a: STATUS[o.status].t, b: STATUS[draft.status].t }) : '';
    // التجربة
    var end = o.trial_ends_at ? Date.parse(o.trial_ends_at) : null;
    var base = Math.max(Date.now(), end || 0), newEnd = draft.extend ? new Date(base + draft.extend * 864e5).toISOString() : null;
    $('d-trial').textContent = newEnd ? T('adm.trial.will_end', { d: dateAr(newEnd) }) : end ? (end > Date.now() ? T('adm.trial.ends', { d: dateAr(o.trial_ends_at) }) + ' · ' + T('adm.trial.left', { n: LT.n(daysLeft(o.trial_ends_at), 'day') }) : T('adm.trial.ended', { d: dateAr(o.trial_ends_at) })) : T('adm.trial.no_end');
    Array.prototype.forEach.call(document.querySelectorAll('[data-extend]'), function (c) { c.classList.toggle('on', Number(c.getAttribute('data-extend')) === draft.extend); });
    // حد المواقع
    $('d-lim-plan').textContent = draft.status === 'trial' ? T('adm.lim.trial', { n: LT.n(data.defaults.trial_max_sites, 'site') }) : T('adm.no_limit');
    setRadio('lim', draft.limMode); $('d-max').value = draft.max; $('d-max').disabled = draft.limMode !== 'custom';
    $('lim-minus').disabled = $('lim-plus').disabled = draft.limMode !== 'custom';
    $('d-plan').value = draft.plan;
    setRadio('pol', draft.policy); $('d-grace').value = draft.grace;
    setRadio('rep', draft.replay ? 'on' : 'off');
    $('d-notes').value = draft.notes;
    renderConfirm();
  }
  function setRadio(name, v) { Array.prototype.forEach.call(document.getElementsByName(name), function (r) { r.checked = r.value === v; }); }
  function renderConfirm() {
    var c = $('d-confirm'), save = $('d-save');
    var risky = draft.status !== current.status && (draft.status === 'off' || draft.status === 'past_due');
    if (confirming && risky) {
      var p = draft.policy === 'keep' ? T('adm.c.keep') : draft.policy === 'reject' ? T('adm.c.reject') : T('adm.c.grace', { n: LT.n(draft.grace, 'day') });
      c.textContent = T('adm.c.sure', { s: STATUS[draft.status].t }) + ' ' + p;
      c.hidden = false; save.textContent = T(draft.status === 'off' ? 'adm.c.yes_off' : 'adm.c.yes_late'); save.className = 'btn danger';
    } else { c.hidden = true; save.textContent = T('adm.save'); save.className = 'btn'; }
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
    if (draft.replay !== (o.replay !== false)) b.replay = draft.replay;
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
      if (!r.ok) { toast(r.body.error && r.body.error.indexOf('bad_') === 0 ? T('adm.save.bad') : T('adm.save.fail'), true); return; }
      toast(T('adm.saved', { n: current.name }));
      closeDrawer(); load();
    });
  }

  // ── الأقسام: الحسابات · الفريق · السجل ──
  function showTab(t) {
    ['accounts', 'team', 'audit', 'alerts', 'lab', 'billing'].forEach(function (k) { $('tab-' + k).hidden = k !== t; $('tab-btn-' + k).setAttribute('aria-selected', String(k === t)); });
    // الموبايل: قايمة بزرار (☰) بدل الأزرار الملخبطة (16 نوفمبر)
    $('tabs-current').textContent = $('tab-btn-' + t).textContent; menuOpen(false);
    if (t === 'team') window.LTAdminTeam.team($('tab-team'), toast);
    if (t === 'audit') window.LTAdminTeam.audit($('tab-audit'), toast);
    if (t === 'alerts') window.LTAdminAlerts.open($('tab-alerts'), toast);
    if (t === 'lab') window.LTAdminAlerts.lab($('tab-lab'));
    if (t === 'billing') window.LTAdminBilling.open($('tab-billing'), toast);
  }
  function menuOpen(on) { $('tabs').classList.toggle('open', on); $('tabs-toggle').setAttribute('aria-expanded', String(on)); }
  function wireTabs() {
    $('tabs-toggle').addEventListener('click', function () { menuOpen(!$('tabs').classList.contains('open')); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') menuOpen(false); });
    Array.prototype.forEach.call(document.querySelectorAll('#tabs [data-tab]'), function (b) { b.addEventListener('click', function () { showTab(b.getAttribute('data-tab')); }); });
  }

  // ── الربط ──
  function wire() {
    // حساب عميل جديد · أضف موقعًا · تغيير بريد العميل (admin-accounts.js)
  $('new-acc').addEventListener('click', function () { window.LTAdminAccounts.newAccount({ reload: load, toast: toast }); });
  $('d-add-site').addEventListener('click', function () { if (current) window.LTAdminAccounts.addSite(current, { reload: load, toast: toast }); });
  $('d-owner-btn').addEventListener('click', function () { if (current) window.LTAdminAccounts.setOwner(current, { reload: load, toast: toast }); });
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
    Array.prototype.forEach.call(document.getElementsByName('rep'), function (r) { r.addEventListener('change', function () { draft.replay = r.value === 'on'; }); });
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
    if (!m.user.platform_admin && !m.platform) { showDenied(); return; }
    wire(); wireTabs(); load();
  });
})();
