// لوحة الإدارة ← «الفريق» و«سجل التغييرات» (G-29 · محمود 11 نوفمبر: «نفذ الأدوار»).
// الفريق للسوبر أدمن بس: أدوار بصلاحيات بعلامات · أعضاء بنطاق (كل الحسابات · حسابات معيّنة · مواقع معيّنة) · دعوة بإيميل جوجل.
// مفيش إيميل بيتبعت من عندنا: الدعوة بتتسجل، وانت بتبعت اللينك بنفسك. أول ما صاحب الإيميل يدخل بجوجل بياخد الدور.
(function () {
  'use strict';
  var LT = window.LT, el = LT.el, clear = LT.clear, T = LT.t;
  var $ = function (id) { return document.getElementById(id); };
  var APP_URL = location.origin + '/login';
  var KIND = {};   // أنواع سجل التغييرات: الاسم من ملف اللغة (adm.kind.<النوع>)
  ['platform_org_update', 'platform_tg_webhook', 'platform_role_create', 'platform_role_update', 'platform_role_delete', 'platform_invite', 'platform_invite_cancel', 'platform_member_add', 'platform_member_update', 'platform_member_remove', 'invite_accepted', 'team_invite', 'team_invite_cancel', 'team_member_update', 'team_member_remove', 'verdict_set', 'outcome_set', 'key_rotated', 'site_created', 'site_connected', 'plugin_paired', 'pair_code_created', 'platform_account_create', 'platform_account_owner'].forEach(function (k) { KIND[k] = T('adm.kind.' + k); });

  var team = null, toast = function () {};

  function when(iso) { try { return new Date(iso).toLocaleString(LT.locale, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); } catch (e) { return iso; } }
  function card(title, kids, sub) { return el('section', { class: 'panel-card' }, [el('div', { class: 'sec-head' }, [el('h2', { text: title })]), sub ? el('p', { class: 'muted', text: sub }) : null].concat(kids)); }
  function api(path, body) { return LT.api(path, body === undefined ? undefined : { method: 'POST', body: body }); }
  function permLabel(k) { var p = team.perms.filter(function (x) { return x.key === k; })[0]; return p ? p.label : k; }
  function roleName(id) { var r = team.roles.filter(function (x) { return x.id === id; })[0]; return r ? r.name : '—'; }
  function scopeText(orgs, sites) {
    if (!orgs && !sites) return T('adm.sc.all');
    var parts = [];
    if (orgs && orgs.length) parts.push(orgs.map(function (id) { var o = team.orgs.filter(function (x) { return x.id === id; })[0]; return o ? o.name : T('adm.account'); }).join('، '));
    if (sites && sites.length) { var all = []; team.orgs.forEach(function (o) { all = all.concat(o.sites); }); parts.push(sites.map(function (id) { var c = all.filter(function (x) { return x.id === id; })[0]; return c ? c.name : id; }).join('، ')); }
    return parts.join(' · ') || T('adm.none');
  }

  // محدد النطاق: كل الحسابات · حسابات معيّنة · مواقع معيّنة
  function scopePicker(initOrgs, initSites) {
    var mode = initSites && initSites.length ? 'sites' : initOrgs && initOrgs.length ? 'orgs' : 'all';
    var box = el('div', { class: 'scope' }), list = el('div', { class: 'scope-list' });
    var name = 'sc' + Math.random().toString(36).slice(2, 8);
    var radios = [['all', T('adm.sc.all')], ['orgs', T('adm.sc.orgs')], ['sites', T('adm.sc.sites')]].map(function (x) {
      var r = el('input', { type: 'radio', name: name, value: x[0] }); r.checked = mode === x[0];
      r.addEventListener('change', function () { mode = x[0]; draw(); });
      return el('label', { class: 'ck-in' }, [r, el('span', { text: x[1] })]);
    });
    var picked = { orgs: (initOrgs || []).slice(), sites: (initSites || []).slice() };
    function draw() {
      clear(list); list.hidden = mode === 'all';
      if (mode === 'orgs') team.orgs.forEach(function (o) { list.appendChild(check(o.id, o.name + ' (' + LT.n(o.sites.length, 'site') + ')', 'orgs')); });
      if (mode === 'sites') team.orgs.forEach(function (o) { if (!o.sites.length) return; list.appendChild(el('p', { class: 'scope-org', text: o.name })); o.sites.forEach(function (c) { list.appendChild(check(c.id, c.name, 'sites')); }); });
    }
    function check(id, label, kind) {
      var c = el('input', { type: 'checkbox', value: id }); c.checked = picked[kind].indexOf(id) >= 0;
      c.addEventListener('change', function () { var a = picked[kind], i = a.indexOf(id); if (c.checked && i < 0) a.push(id); if (!c.checked && i >= 0) a.splice(i, 1); });
      return el('label', { class: 'ck-in' }, [c, el('span', { text: label })]);
    }
    box.appendChild(el('div', { class: 'scope-modes' }, radios)); box.appendChild(list); draw();
    box.value = function () { return { scope_org_ids: mode === 'orgs' ? picked.orgs.slice() : null, scope_site_ids: mode === 'sites' ? picked.sites.slice() : null, empty: (mode === 'orgs' && !picked.orgs.length) || (mode === 'sites' && !picked.sites.length) }; };
    return box;
  }

  function roleEditor(role, onDone) {
    var name = el('input', { type: 'text', maxlength: '60', placeholder: T('adm.r.name.ph') }); name.value = role ? role.name : '';
    var chosen = role ? role.perms.slice() : ['orgs_view'];
    var checks = el('div', { class: 'perm-grid' }, team.perms.map(function (p) {
      var c = el('input', { type: 'checkbox', value: p.key }); c.checked = chosen.indexOf(p.key) >= 0;
      c.addEventListener('change', function () { var i = chosen.indexOf(p.key); if (c.checked && i < 0) chosen.push(p.key); if (!c.checked && i >= 0) chosen.splice(i, 1); });
      return el('label', { class: 'ck-in' }, [c, el('span', { text: p.label })]);
    }));
    var save = el('button', { class: 'btn sm', type: 'button', text: role ? T('adm.r.save') : T('adm.r.add') }), cancel = el('button', { class: 'btn ghost sm', type: 'button', text: T('cancel') });
    var wrap = el('div', { class: 'role-edit' }, [el('label', { class: 'fld' }, [el('span', { text: T('adm.r.name') }), name]), el('p', { class: 'legend', text: T('adm.r.can') }), checks, el('div', { class: 'row-btns' }, [save, cancel])]);
    save.addEventListener('click', function () {
      if (!name.value.trim()) { toast(T('adm.r.need_name'), true); return; }
      save.disabled = true;
      api('/v1/platform/roles', { id: role ? role.id : undefined, name: name.value.trim(), perms: chosen }).then(function (r) {
        save.disabled = false;
        if (!r.ok) { toast(r.body.error === 'name_taken' ? T('adm.r.taken') : T('adm.save.fail'), true); return; }
        toast(T('adm.r.saved')); onDone();
      });
    });
    cancel.addEventListener('click', onDone);
    return wrap;
  }

  function renderTeam(host) {
    clear(host);
    // السوبر أدمن
    host.appendChild(card(T('adm.owners'), [el('ul', { class: 'team-list' }, team.owners.map(function (u) {
      return el('li', {}, [el('div', {}, [el('b', { text: u.name || u.email }), el('span', { class: 'dim', text: ' · ' + u.email + (u.you ? ' ' + T('adm.you') : '') })]), el('span', { class: 'pill ok', text: T('adm.all_perms') })]);
    }))], T('adm.owners.sub')));

    // الأدوار
    var rolesBox = el('div');
    var drawRoles = function () {
      clear(rolesBox);
      if (!team.roles.length) rolesBox.appendChild(el('p', { class: 'muted', text: T('adm.r.empty') }));
      team.roles.forEach(function (r) {
        var used = team.members.filter(function (m) { return m.role_id === r.id; }).length;
        var edit = el('button', { class: 'btn ghost sm', type: 'button', text: T('adm.edit') }), del = el('button', { class: 'btn ghost sm danger-text', type: 'button', text: T('adm.delete') });
        var row = el('div', { class: 'role-row' }, [el('div', {}, [el('b', { text: r.name }), el('span', { class: 'dim', text: ' · ' + (used ? LT.n(used, 'member') : T('adm.r.no_members')) }), el('div', { class: 'chips' }, r.perms.map(function (k) { return el('span', { class: 'pill', text: permLabel(k) }); }))]), el('div', { class: 'row-btns' }, [edit, del])]);
        edit.addEventListener('click', function () { row.replaceWith(roleEditor(r, reload)); });
        del.addEventListener('click', function () {
          if (used) { toast(T('adm.r.in_use'), true); return; }
          api('/v1/platform/roles/delete', { id: r.id }).then(function (x) { if (!x.ok) { toast(T('adm.del.fail'), true); return; } toast(T('adm.r.deleted')); reload(); });
        });
        rolesBox.appendChild(row);
      });
      var add = el('button', { class: 'btn sm', type: 'button', text: T('adm.r.new') });
      add.addEventListener('click', function () { add.replaceWith(roleEditor(null, reload)); });
      rolesBox.appendChild(add);
    };
    drawRoles();
    host.appendChild(card(T('adm.roles'), [rolesBox], T('adm.roles.sub')));

    // الأعضاء
    var mbody = el('tbody');
    team.members.forEach(function (m) {
      var sel = el('select', { 'aria-label': T('adm.m.role') }, team.roles.map(function (r) { return el('option', { value: r.id, text: r.name }); })); sel.value = m.role_id;
      sel.addEventListener('change', function () { api('/v1/platform/members', { user_id: m.user_id, role_id: sel.value }).then(function (r) { toast(r.ok ? T('adm.m.role_changed') : T('adm.m.not_changed'), !r.ok); if (r.ok) reload(); }); });
      var scopeBtn = el('button', { class: 'linkish', type: 'button', text: scopeText(m.scope_org_ids, m.scope_site_ids) + ' ' + T('arrow') });
      var rm = el('button', { class: 'btn ghost sm danger-text', type: 'button', text: T('adm.m.remove') });
      rm.addEventListener('click', function () {
        if (rm.getAttribute('data-sure') !== '1') { rm.setAttribute('data-sure', '1'); rm.textContent = T('adm.m.sure'); return; }
        api('/v1/platform/members', { user_id: m.user_id, remove: true }).then(function (r) { toast(r.ok ? T('adm.m.removed') : T('adm.m.not_removed'), !r.ok); if (r.ok) reload(); });
      });
      var tr = el('tr', {}, [el('td', { class: 'first' }, [el('b', { text: (m.user && (m.user.name || m.user.email)) || '—' }), el('div', { class: 'dim', text: m.user ? m.user.email : '' })]), el('td', { 'data-l': T('adm.m.role') }, [sel]), el('td', { 'data-l': T('adm.m.sees') }, [scopeBtn]), el('td', { class: 'last' }, [rm])]);
      scopeBtn.addEventListener('click', function () {
        var pick = scopePicker(m.scope_org_ids, m.scope_site_ids), ok = el('button', { class: 'btn sm', type: 'button', text: T('adm.m.save_scope') });
        ok.addEventListener('click', function () { var v = pick.value(); if (v.empty) { toast(T('adm.m.pick'), true); return; } api('/v1/platform/members', { user_id: m.user_id, scope_org_ids: v.scope_org_ids, scope_site_ids: v.scope_site_ids }).then(function (r) { toast(T(r.ok ? 'saved' : 'adm.save.fail'), !r.ok); if (r.ok) reload(); }); });
        clear(scopeBtn.parentNode).appendChild(el('div', {}, [pick, ok]));
      });
      mbody.appendChild(tr);
    });
    if (!team.members.length) mbody.appendChild(el('tr', {}, [el('td', { colspan: '4', class: 'empty muted', text: T('adm.m.empty') })]));
    host.appendChild(card(T('adm.members'), [el('div', { class: 'tbl-wrap' }, [el('table', { class: 'tbl static' }, [el('thead', {}, [el('tr', {}, [T('adm.m.member'), T('adm.m.role'), T('adm.m.sees'), ''].map(function (h) { return el('th', { text: h }); }))]), mbody])])]));

    // دعوة
    if (team.roles.length) {
      var email = el('input', { type: 'email', dir: 'ltr', placeholder: 'name@gmail.com', autocomplete: 'off' });
      var role = el('select', { 'aria-label': T('adm.m.role') }, team.roles.map(function (r) { return el('option', { value: r.id, text: r.name }); }));
      var pick = scopePicker(null, null), send = el('button', { class: 'btn', type: 'button', text: T('adm.inv.send') }), result = el('div', { class: 'invite-result', hidden: '' });
      send.addEventListener('click', function () {
        var v = pick.value();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value.trim())) { toast(T('adm.inv.bad_email'), true); return; }
        if (v.empty) { toast(T('adm.m.pick'), true); return; }
        send.disabled = true;
        api('/v1/platform/invites', { email: email.value.trim(), role_id: role.value, scope_org_ids: v.scope_org_ids, scope_site_ids: v.scope_site_ids }).then(function (r) {
          send.disabled = false;
          if (!r.ok) { toast(r.body.error === 'already_owner' ? T('adm.inv.owner') : r.body.error === 'email' ? T('adm.inv.email') : T('adm.inv.fail'), true); return; }
          if (r.body.added) { toast(T('adm.inv.added')); reload(); return; }
          inviteResult(result, email.value.trim()); toast(T('adm.inv.saved')); email.value = ''; loadOnly();
        });
      });
      host.appendChild(card(T('adm.inv.title'), [el('label', { class: 'fld' }, [el('span', { text: T('adm.inv.email_label') }), email]), el('label', { class: 'fld' }, [el('span', { text: T('adm.m.role') }), role]), el('div', { class: 'fld' }, [el('span', { text: T('adm.inv.sees') }), pick]), el('div', { class: 'row-btns' }, [send]), result],
        T('adm.inv.sub')));
    }

    // الدعوات المستنية
    var inv = el('ul', { class: 'team-list' });
    team.invites.forEach(function (i) {
      var c = el('button', { class: 'btn ghost sm', type: 'button', text: T('cancel') });
      c.addEventListener('click', function () { api('/v1/platform/invites/cancel', { id: i.id }).then(function (r) { toast(r.ok ? T('adm.inv.cancelled') : T('adm.inv.not_cancelled'), !r.ok); if (r.ok) reload(); }); });
      inv.appendChild(el('li', {}, [el('div', {}, [el('b', { dir: 'ltr', text: i.email }), el('span', { class: 'dim', text: ' · ' + roleName(i.role_id) + ' · ' + scopeText(i.scope_org_ids, i.scope_site_ids) }), el('div', { class: 'dim', text: i.expired ? T('adm.inv.expired') : T('adm.inv.valid', { d: when(i.expires_at) }) })]), c]));
    });
    if (team.invites.length) host.appendChild(card(T('adm.inv.pending'), [inv]));
  }

  function inviteResult(box, email) {
    clear(box); box.hidden = false;
    var copy = el('button', { class: 'btn ghost sm', type: 'button', text: T('adm.inv.copy') });
    var msg = T('adm.inv.msg', { u: APP_URL, e: email });
    copy.addEventListener('click', function () { if (navigator.clipboard) navigator.clipboard.writeText(msg).then(function () { toast(T('adm.inv.copied')); }, function () { toast(T('adm.inv.copy_manual'), true); }); });
    box.appendChild(el('p', { text: T('adm.inv.send_msg') }));
    box.appendChild(el('p', { class: 'msg-box', text: msg }));
    box.appendChild(copy);
  }

  var host = null;
  function loadOnly() { return api('/v1/platform/team').then(function (r) { if (r.ok) { var keep = host.querySelector('.invite-result:not([hidden])'); team = r.body; renderTeam(host); if (keep) { var nb = host.querySelector('.invite-result'); if (nb) nb.replaceWith(keep); } } }); }
  function reload() { return api('/v1/platform/team').then(function (r) { if (!r.ok) { toast(T('adm.team.fail'), true); return; } team = r.body; renderTeam(host); }); }

  function renderAudit(box) {
    clear(box).appendChild(el('div', { class: 'loading' }, [el('span', { class: 'spinner' }), document.createTextNode(T('adm.audit.loading'))]));
    api('/v1/platform/audit').then(function (r) {
      clear(box);
      if (!r.ok) { box.appendChild(el('p', { class: 'muted', text: T('adm.audit.fail') })); return; }
      var tb = el('tbody');
      r.body.events.forEach(function (e) {
        tb.appendChild(el('tr', {}, [el('td', { class: 'first', text: when(e.at) }), el('td', { 'data-l': T('adm.a.who'), text: e.who || '—' }), el('td', { 'data-l': T('adm.a.what'), text: KIND[e.kind] || e.kind }), el('td', { 'data-l': T('adm.a.details'), class: 'dim', text: e.reason })]));
      });
      if (!r.body.events.length) tb.appendChild(el('tr', {}, [el('td', { colspan: '4', class: 'empty muted', text: T('adm.audit.empty') })]));
      box.appendChild(card(T('adm.audit.title'), [el('div', { class: 'tbl-wrap' }, [el('table', { class: 'tbl static' }, [el('thead', {}, [el('tr', {}, [T('adm.a.when'), T('adm.a.who'), T('adm.a.what'), T('adm.a.details')].map(function (h) { return el('th', { text: h }); }))]), tb])])], T('adm.audit.sub')));
    });
  }

  window.LTAdminTeam = {
    team: function (box, t) { host = box; toast = t; clear(box).appendChild(el('div', { class: 'loading' }, [el('span', { class: 'spinner' }), document.createTextNode(T('adm.team.loading'))])); return reload(); },
    audit: function (box, t) { toast = t; renderAudit(box); },
  };
})();
