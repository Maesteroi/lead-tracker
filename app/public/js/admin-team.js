// لوحة الإدارة ← «الفريق» و«سجل التغييرات» (G-29 · محمود 11 نوفمبر: «نفذ الأدوار»).
// الفريق للسوبر أدمن بس: أدوار بصلاحيات بعلامات · أعضاء بنطاق (كل الحسابات · حسابات معيّنة · مواقع معيّنة) · دعوة بإيميل جوجل.
// مفيش إيميل بيتبعت من عندنا: الدعوة بتتسجل، وانت بتبعت اللينك بنفسك. أول ما صاحب الإيميل يدخل بجوجل بياخد الدور.
(function () {
  'use strict';
  var LT = window.LT, el = LT.el, clear = LT.clear;
  var $ = function (id) { return document.getElementById(id); };
  var APP_URL = location.origin + '/login';
  var KIND = {
    platform_org_update: 'تعديل حساب', platform_tg_webhook: 'تحويل بوت تليجرام', platform_role_create: 'دور جديد', platform_role_update: 'تعديل دور', platform_role_delete: 'مسح دور',
    platform_invite: 'دعوة لفريق المنصة', platform_invite_cancel: 'إلغاء دعوة', platform_member_add: 'عضو جديد في فريق المنصة', platform_member_update: 'تعديل عضو', platform_member_remove: 'شيل عضو',
    invite_accepted: 'دعوة اتقبلت', team_invite: 'دعوة لفريق عميل', team_invite_cancel: 'إلغاء دعوة عميل', team_member_update: 'تعديل عضو عند عميل', team_member_remove: 'شيل عضو عند عميل',
    verdict_set: 'حكم على زيارة', outcome_set: 'نتيجة تواصل', key_rotated: 'تغيير مفتاح موقع', site_created: 'موقع جديد', site_connected: 'ربط موقع', plugin_paired: 'ربط بالبلجن', pair_code_created: 'كود ربط',
  };
  var team = null, toast = function () {};

  function when(iso) { try { return new Date(iso).toLocaleString('ar-EG-u-nu-latn', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); } catch (e) { return iso; } }
  function card(title, kids, sub) { return el('section', { class: 'panel-card' }, [el('div', { class: 'sec-head' }, [el('h2', { text: title })]), sub ? el('p', { class: 'muted', text: sub }) : null].concat(kids)); }
  function api(path, body) { return LT.api(path, body === undefined ? undefined : { method: 'POST', body: body }); }
  function permLabel(k) { var p = team.perms.filter(function (x) { return x.key === k; })[0]; return p ? p.label : k; }
  function roleName(id) { var r = team.roles.filter(function (x) { return x.id === id; })[0]; return r ? r.name : '—'; }
  function scopeText(orgs, sites) {
    if (!orgs && !sites) return 'كل الحسابات';
    var parts = [];
    if (orgs && orgs.length) parts.push(orgs.map(function (id) { var o = team.orgs.filter(function (x) { return x.id === id; })[0]; return o ? o.name : 'حساب'; }).join('، '));
    if (sites && sites.length) { var all = []; team.orgs.forEach(function (o) { all = all.concat(o.sites); }); parts.push(sites.map(function (id) { var c = all.filter(function (x) { return x.id === id; })[0]; return c ? c.name : id; }).join('، ')); }
    return parts.join(' · ') || 'مفيش';
  }

  // محدد النطاق: كل الحسابات · حسابات معيّنة · مواقع معيّنة
  function scopePicker(initOrgs, initSites) {
    var mode = initSites && initSites.length ? 'sites' : initOrgs && initOrgs.length ? 'orgs' : 'all';
    var box = el('div', { class: 'scope' }), list = el('div', { class: 'scope-list' });
    var name = 'sc' + Math.random().toString(36).slice(2, 8);
    var radios = [['all', 'كل الحسابات'], ['orgs', 'حسابات معيّنة'], ['sites', 'مواقع معيّنة']].map(function (x) {
      var r = el('input', { type: 'radio', name: name, value: x[0] }); r.checked = mode === x[0];
      r.addEventListener('change', function () { mode = x[0]; draw(); });
      return el('label', { class: 'ck-in' }, [r, el('span', { text: x[1] })]);
    });
    var picked = { orgs: (initOrgs || []).slice(), sites: (initSites || []).slice() };
    function draw() {
      clear(list); list.hidden = mode === 'all';
      if (mode === 'orgs') team.orgs.forEach(function (o) { list.appendChild(check(o.id, o.name + ' (' + o.sites.length + ' موقع)', 'orgs')); });
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
    var name = el('input', { type: 'text', maxlength: '60', placeholder: 'اسم الدور (مثلاً: دعم فني)' }); name.value = role ? role.name : '';
    var chosen = role ? role.perms.slice() : ['orgs_view'];
    var checks = el('div', { class: 'perm-grid' }, team.perms.map(function (p) {
      var c = el('input', { type: 'checkbox', value: p.key }); c.checked = chosen.indexOf(p.key) >= 0;
      c.addEventListener('change', function () { var i = chosen.indexOf(p.key); if (c.checked && i < 0) chosen.push(p.key); if (!c.checked && i >= 0) chosen.splice(i, 1); });
      return el('label', { class: 'ck-in' }, [c, el('span', { text: p.label })]);
    }));
    var save = el('button', { class: 'btn sm', type: 'button', text: role ? 'حفظ الدور' : 'أضف الدور' }), cancel = el('button', { class: 'btn ghost sm', type: 'button', text: 'إلغاء' });
    var wrap = el('div', { class: 'role-edit' }, [el('label', { class: 'fld' }, [el('span', { text: 'الاسم' }), name]), el('p', { class: 'legend', text: 'يقدر يعمل إيه' }), checks, el('div', { class: 'row-btns' }, [save, cancel])]);
    save.addEventListener('click', function () {
      if (!name.value.trim()) { toast('اكتب اسم الدور', true); return; }
      save.disabled = true;
      api('/v1/platform/roles', { id: role ? role.id : undefined, name: name.value.trim(), perms: chosen }).then(function (r) {
        save.disabled = false;
        if (!r.ok) { toast(r.body.error === 'name_taken' ? 'فيه دور بنفس الاسم' : 'مااتحفظش', true); return; }
        toast('اتحفظ الدور ✓'); onDone();
      });
    });
    cancel.addEventListener('click', onDone);
    return wrap;
  }

  function renderTeam(host) {
    clear(host);
    // السوبر أدمن
    host.appendChild(card('السوبر أدمن', [el('ul', { class: 'team-list' }, team.owners.map(function (u) {
      return el('li', {}, [el('div', {}, [el('b', { text: u.name || u.email }), el('span', { class: 'dim', text: ' · ' + u.email + (u.you ? ' (انت)' : '') })]), el('span', { class: 'pill ok', text: 'كل الصلاحيات' })]);
    }))], 'بيشوفوا ويديروا كل حاجة، وهما بس اللي بيديروا الفريق. بيتضافوا من قاعدة البيانات بس.'));

    // الأدوار
    var rolesBox = el('div');
    var drawRoles = function () {
      clear(rolesBox);
      if (!team.roles.length) rolesBox.appendChild(el('p', { class: 'muted', text: 'لسه مفيش أدوار. اعمل دور، وبعدين ادعي حد عليه.' }));
      team.roles.forEach(function (r) {
        var used = team.members.filter(function (m) { return m.role_id === r.id; }).length;
        var edit = el('button', { class: 'btn ghost sm', type: 'button', text: 'تعديل' }), del = el('button', { class: 'btn ghost sm danger-text', type: 'button', text: 'مسح' });
        var row = el('div', { class: 'role-row' }, [el('div', {}, [el('b', { text: r.name }), el('span', { class: 'dim', text: ' · ' + (used ? used + ' عضو' : 'مفيش أعضاء') }), el('div', { class: 'chips' }, r.perms.map(function (k) { return el('span', { class: 'pill', text: permLabel(k) }); }))]), el('div', { class: 'row-btns' }, [edit, del])]);
        edit.addEventListener('click', function () { row.replaceWith(roleEditor(r, reload)); });
        del.addEventListener('click', function () {
          if (used) { toast('الدور عليه أعضاء. غيّر دورهم الأول.', true); return; }
          api('/v1/platform/roles/delete', { id: r.id }).then(function (x) { if (!x.ok) { toast('مااتمسحش', true); return; } toast('الدور اتمسح'); reload(); });
        });
        rolesBox.appendChild(row);
      });
      var add = el('button', { class: 'btn sm', type: 'button', text: '+ دور جديد' });
      add.addEventListener('click', function () { add.replaceWith(roleEditor(null, reload)); });
      rolesBox.appendChild(add);
    };
    drawRoles();
    host.appendChild(card('الأدوار', [rolesBox], 'كل دور = اسم + الحاجات اللي يقدر يعملها. السيرفر بيتأكد منها في كل طلب، مش اللوحة بس.'));

    // الأعضاء
    var mbody = el('tbody');
    team.members.forEach(function (m) {
      var sel = el('select', { 'aria-label': 'الدور' }, team.roles.map(function (r) { return el('option', { value: r.id, text: r.name }); })); sel.value = m.role_id;
      sel.addEventListener('change', function () { api('/v1/platform/members', { user_id: m.user_id, role_id: sel.value }).then(function (r) { toast(r.ok ? 'اتغيّر الدور ✓' : 'مااتغيّرش', !r.ok); if (r.ok) reload(); }); });
      var scopeBtn = el('button', { class: 'linkish', type: 'button', text: scopeText(m.scope_org_ids, m.scope_site_ids) + ' ‹' });
      var rm = el('button', { class: 'btn ghost sm danger-text', type: 'button', text: 'شيل' });
      rm.addEventListener('click', function () {
        if (rm.getAttribute('data-sure') !== '1') { rm.setAttribute('data-sure', '1'); rm.textContent = 'متأكد؟ هيخرج من كل الأجهزة'; return; }
        api('/v1/platform/members', { user_id: m.user_id, remove: true }).then(function (r) { toast(r.ok ? 'اتشال من الفريق' : 'مااتشالش', !r.ok); if (r.ok) reload(); });
      });
      var tr = el('tr', {}, [el('td', { class: 'first' }, [el('b', { text: (m.user && (m.user.name || m.user.email)) || '—' }), el('div', { class: 'dim', text: m.user ? m.user.email : '' })]), el('td', { 'data-l': 'الدور' }, [sel]), el('td', { 'data-l': 'يشوف' }, [scopeBtn]), el('td', { class: 'last' }, [rm])]);
      scopeBtn.addEventListener('click', function () {
        var pick = scopePicker(m.scope_org_ids, m.scope_site_ids), ok = el('button', { class: 'btn sm', type: 'button', text: 'حفظ النطاق' });
        ok.addEventListener('click', function () { var v = pick.value(); if (v.empty) { toast('اختار حساب أو موقع واحد على الأقل', true); return; } api('/v1/platform/members', { user_id: m.user_id, scope_org_ids: v.scope_org_ids, scope_site_ids: v.scope_site_ids }).then(function (r) { toast(r.ok ? 'اتحفظ ✓' : 'مااتحفظش', !r.ok); if (r.ok) reload(); }); });
        clear(scopeBtn.parentNode).appendChild(el('div', {}, [pick, ok]));
      });
      mbody.appendChild(tr);
    });
    if (!team.members.length) mbody.appendChild(el('tr', {}, [el('td', { colspan: '4', class: 'empty muted', text: 'لسه مفيش أعضاء غير السوبر أدمن.' })]));
    host.appendChild(card('الأعضاء', [el('div', { class: 'tbl-wrap' }, [el('table', { class: 'tbl static' }, [el('thead', {}, [el('tr', {}, ['العضو', 'الدور', 'يشوف', ''].map(function (h) { return el('th', { text: h }); }))]), mbody])])]));

    // دعوة
    if (team.roles.length) {
      var email = el('input', { type: 'email', dir: 'ltr', placeholder: 'name@gmail.com', autocomplete: 'off' });
      var role = el('select', { 'aria-label': 'الدور' }, team.roles.map(function (r) { return el('option', { value: r.id, text: r.name }); }));
      var pick = scopePicker(null, null), send = el('button', { class: 'btn', type: 'button', text: 'ادعيه' }), result = el('div', { class: 'invite-result', hidden: '' });
      send.addEventListener('click', function () {
        var v = pick.value();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value.trim())) { toast('اكتب إيميل جوجل صح', true); return; }
        if (v.empty) { toast('اختار حساب أو موقع واحد على الأقل', true); return; }
        send.disabled = true;
        api('/v1/platform/invites', { email: email.value.trim(), role_id: role.value, scope_org_ids: v.scope_org_ids, scope_site_ids: v.scope_site_ids }).then(function (r) {
          send.disabled = false;
          if (!r.ok) { toast(r.body.error === 'already_owner' ? 'ده سوبر أدمن أصلاً' : r.body.error === 'email' ? 'الإيميل مش مظبوط' : 'مااتبعتتش', true); return; }
          if (r.body.added) { toast('اتضاف للفريق على طول (عنده حساب عندنا) ✓'); reload(); return; }
          inviteResult(result, email.value.trim()); toast('الدعوة اتسجلت ✓'); email.value = ''; loadOnly();
        });
      });
      host.appendChild(card('ادعي عضو', [el('label', { class: 'fld' }, [el('span', { text: 'إيميل جوجل' }), email]), el('label', { class: 'fld' }, [el('span', { text: 'الدور' }), role]), el('div', { class: 'fld' }, [el('span', { text: 'يشوف إيه' }), pick]), el('div', { class: 'row-btns' }, [send]), result],
        'لازم يدخل بنفس إيميل جوجل ده. الدعوة صالحة 7 أيام ومرة واحدة.'));
    }

    // الدعوات المستنية
    var inv = el('ul', { class: 'team-list' });
    team.invites.forEach(function (i) {
      var c = el('button', { class: 'btn ghost sm', type: 'button', text: 'إلغاء' });
      c.addEventListener('click', function () { api('/v1/platform/invites/cancel', { id: i.id }).then(function (r) { toast(r.ok ? 'الدعوة اتلغت' : 'مااتلغتش', !r.ok); if (r.ok) reload(); }); });
      inv.appendChild(el('li', {}, [el('div', {}, [el('b', { dir: 'ltr', text: i.email }), el('span', { class: 'dim', text: ' · ' + roleName(i.role_id) + ' · ' + scopeText(i.scope_org_ids, i.scope_site_ids) }), el('div', { class: 'dim', text: i.expired ? 'انتهت' : 'صالحة لحد ' + when(i.expires_at) })]), c]));
    });
    if (team.invites.length) host.appendChild(card('دعوات مستنية', [inv]));
  }

  function inviteResult(box, email) {
    clear(box); box.hidden = false;
    var copy = el('button', { class: 'btn ghost sm', type: 'button', text: 'انسخ الرسالة' });
    var msg = 'اتضفت لفريق Maestro LT. افتح ' + APP_URL + ' وادخل بحساب جوجل ' + email + ' (الدعوة صالحة 7 أيام).';
    copy.addEventListener('click', function () { if (navigator.clipboard) navigator.clipboard.writeText(msg).then(function () { toast('الرسالة اتنسخت، ابعتها له'); }, function () { toast('انسخها بإيدك', true); }); });
    box.appendChild(el('p', { text: 'ابعتله الرسالة دي (مابنبعتش إيميلات من عندنا):' }));
    box.appendChild(el('p', { class: 'msg-box', text: msg }));
    box.appendChild(copy);
  }

  var host = null;
  function loadOnly() { return api('/v1/platform/team').then(function (r) { if (r.ok) { var keep = host.querySelector('.invite-result:not([hidden])'); team = r.body; renderTeam(host); if (keep) { var nb = host.querySelector('.invite-result'); if (nb) nb.replaceWith(keep); } } }); }
  function reload() { return api('/v1/platform/team').then(function (r) { if (!r.ok) { toast('مقدرناش نحمّل الفريق', true); return; } team = r.body; renderTeam(host); }); }

  function renderAudit(box) {
    clear(box).appendChild(el('div', { class: 'loading' }, [el('span', { class: 'spinner' }), document.createTextNode('بنحمّل السجل…')]));
    api('/v1/platform/audit').then(function (r) {
      clear(box);
      if (!r.ok) { box.appendChild(el('p', { class: 'muted', text: 'مقدرناش نحمّل السجل.' })); return; }
      var tb = el('tbody');
      r.body.events.forEach(function (e) {
        tb.appendChild(el('tr', {}, [el('td', { class: 'first', text: when(e.at) }), el('td', { 'data-l': 'مين', text: e.who || '—' }), el('td', { 'data-l': 'إيه', text: KIND[e.kind] || e.kind }), el('td', { 'data-l': 'التفاصيل', class: 'dim', text: e.reason })]));
      });
      if (!r.body.events.length) tb.appendChild(el('tr', {}, [el('td', { colspan: '4', class: 'empty muted', text: 'لسه مفيش تغييرات.' })]));
      box.appendChild(card('سجل التغييرات (آخر 200)', [el('div', { class: 'tbl-wrap' }, [el('table', { class: 'tbl static' }, [el('thead', {}, [el('tr', {}, ['إمتى', 'مين', 'إيه', 'التفاصيل'].map(function (h) { return el('th', { text: h }); }))]), tb])])], 'كل تغيير على الحسابات والفريق والأحكام بيتسجل بمين عمله وإمتى.'));
    });
  }

  window.LTAdminTeam = {
    team: function (box, t) { host = box; toast = t; clear(box).appendChild(el('div', { class: 'loading' }, [el('span', { class: 'spinner' }), document.createTextNode('بنحمّل الفريق…')])); return reload(); },
    audit: function (box, t) { toast = t; renderAudit(box); },
  };
})();
