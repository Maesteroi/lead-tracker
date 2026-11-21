// لوحة الإدارة ← حساب عميل جديد · أضف موقعًا (نافذة اكتشاف النوع) · تغيير بريد العميل (18 نوفمبر · محمود: «أعمل أكونت للعميل وأضيف موقعه وهو يدخل بإيميله جاهز»).
// العميل بيدخل بجوجل بالبريد اللي بتكتبه هنا: لو أول مرة، الحساب بتاعه بيكون جاهز بمواقعه. مفيش إيميل بيتبعت من عندنا:
// بنطلّع رسالة جاهزة تنسخها وتبعتها بنفسك (واتساب مثلًا).
(function () {
  'use strict';
  var LT = window.LT, el = LT.el, clear = LT.clear, T = LT.t;
  var APP_HOST = 'app.maestrolt.com';

  function api(path, body) { return LT.api(path, { method: 'POST', body: body }); }
  function fld(label, input, hint) { return el('label', { class: 'fld' }, [el('span', { text: label }), input, hint ? el('small', { class: 'hint', text: hint }) : null]); }
  function err(code, extra) {
    var k = 'adm.acc.e.' + code, m = T(k);
    return (m === k ? T('adm.acc.e.generic') : m) + (extra && extra.domain ? ' (' + extra.domain + ')' : '');
  }

  // نافذة بسيطة فوق الصفحة: عنوان + محتوى + إغلاق بـ Esc أو الضغط بره
  function modal(title, body, onClose) {
    var prev = document.activeElement;
    var scrim = el('div', { class: 'scrim' }), box = el('div', { class: 'adm-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, [
      el('header', { class: 'adm-modal-h' }, [el('h2', { text: title }), el('button', { class: 'icon-btn', type: 'button', 'aria-label': T('close'), text: '×' })]), body]);
    function close() { scrim.remove(); box.remove(); document.removeEventListener('keydown', key); if (prev && prev.focus) prev.focus(); if (onClose) onClose(); }
    function key(e) { if (e.key === 'Escape') { if (document.querySelector('.pk-panel') && Array.prototype.some.call(document.querySelectorAll('.pk-pop'), function (p) { return !p.hidden; })) return; close(); } }
    scrim.addEventListener('click', close); box.querySelector('.icon-btn').addEventListener('click', close);
    document.addEventListener('keydown', key);
    document.body.appendChild(scrim); document.body.appendChild(box);
    var f = box.querySelector('input'); if (f) f.focus();
    return { close: close, box: box };
  }

  // ── حساب جديد ──
  function newAccount(o) {
    var name = el('input', { type: 'text', maxlength: '80', autocomplete: 'off' }), email = el('input', { type: 'email', maxlength: '200', dir: 'ltr', autocomplete: 'off', inputmode: 'email' });
    var country = LT.countryPick((window.LTPhone && window.LTPhone.DEFAULT) || 'EG');
    var status = 'trial';
    var seg = el('div', { class: 'seg', role: 'radiogroup' }), segBtns = {};
    [['trial', T('adm.st.trial')], ['active', T('adm.st.active')]].forEach(function (x) {
      var b = el('button', { type: 'button', role: 'radio', 'aria-checked': x[0] === status ? 'true' : 'false', text: x[1] });
      b.addEventListener('click', function () { status = x[0]; Object.keys(segBtns).forEach(function (k) { segBtns[k].setAttribute('aria-checked', String(k === status)); }); trialBox.hidden = status !== 'trial'; activeBox.hidden = status !== 'active'; });
      segBtns[x[0]] = b; seg.appendChild(b);
    });
    var trialDays = el('input', { type: 'number', min: '0', max: '90', inputmode: 'numeric', dir: 'ltr' });
    var trialBox = fld(T('adm.acc.trial_days'), trialDays, T('adm.acc.trial_days.h'));
    var plan = el('select', {}, [el('option', { value: '', text: T('adm.acc.plan.none') })]);
    var end = el('input', { type: 'date', dir: 'ltr' });
    var activeBox = el('div', {}, [fld(T('adm.acc.plan'), plan), fld(T('adm.acc.end'), end, T('adm.acc.end.h'))]); activeBox.hidden = true;
    // الباقات بتتحمّل لو معاك صلاحية الباقات (غير كده الخانة بتفضل «بدون باقة»)
    LT.api('/v1/platform/billing').then(function (r) { if (r.ok && r.body && r.body.plans) r.body.plans.forEach(function (p) { plan.appendChild(el('option', { value: p.id, text: p.name_ar || p.id })); }); }).catch(function () {});

    var rows = el('div', { class: 'acc-sites' }), list = [];
    function addRow() {
      var n = el('input', { type: 'text', maxlength: '120', placeholder: T('adm.acc.site.name'), 'aria-label': T('adm.acc.site.name') }), d = el('input', { type: 'text', maxlength: '200', dir: 'ltr', placeholder: T('adm.acc.site.domain'), 'aria-label': T('adm.acc.site.domain'), autocomplete: 'off' });
      var rm = el('button', { class: 'btn ghost sm', type: 'button', text: T('adm.acc.site.rm') }), row = el('div', { class: 'acc-site' }, [n, d, rm]), rec = { n: n, d: d };
      rm.addEventListener('click', function () { list.splice(list.indexOf(rec), 1); row.remove(); });
      list.push(rec); rows.appendChild(row);
    }
    addRow();
    var more = el('button', { class: 'btn ghost sm', type: 'button', text: T('adm.acc.site.add') });
    more.addEventListener('click', function () { if (list.length < 20) addRow(); });
    var msg = el('p', { class: 'notice bad', role: 'alert' }); msg.hidden = true;
    var go = el('button', { class: 'btn', type: 'button', text: T('adm.acc.create') });
    var body = el('div', { class: 'adm-modal-b' }, [el('p', { class: 'muted', text: T('adm.acc.sub') }),
      fld(T('adm.acc.name'), name), fld(T('adm.acc.email'), email, T('adm.acc.email.h')), el('div', { class: 'fld' }, [el('span', { text: T('adm.acc.country') }), country]),
      el('div', { class: 'fld' }, [el('span', { text: T('adm.acc.status') }), seg]), trialBox, activeBox,
      el('div', { class: 'fld' }, [el('span', { text: T('adm.acc.sites') }), rows, more]), msg, el('div', { class: 'adm-modal-f' }, [go])]);
    var m = modal(T('adm.acc.title'), body);
    go.addEventListener('click', function () {
      msg.hidden = true; go.disabled = true;
      var sites = list.map(function (r) { return { name: r.n.value, domain: r.d.value }; }).filter(function (s) { return s.name.trim() || s.domain.trim(); });
      var b = { name: name.value, email: email.value, country: country.value, status: status, sites: sites };
      if (status === 'trial' && trialDays.value !== '') b.trial_days = Number(trialDays.value);
      if (status === 'active') { if (plan.value) b.plan = plan.value; if (end.value) b.plan_period_end = end.value + 'T23:59:59Z'; }
      api('/v1/platform/accounts', b).then(function (r) {
        go.disabled = false;
        if (!r.ok) { msg.textContent = err(r.body && r.body.error, r.body); msg.hidden = false; return; }
        o.reload(); done(m, r.body);
      }).catch(function () { go.disabled = false; msg.textContent = err('generic'); msg.hidden = false; });
    });
  }

  // بعد الإنشاء: الحالة + رسالة جاهزة للعميل
  function done(m, r) {
    var e = r.owner.email, sites = r.sites.map(function (s) { return s.domain; });
    var text = T('adm.acc.msg', { e: e, h: APP_HOST }) + (sites.length ? '\n' + T('adm.acc.msg.sites', { s: sites.join('، ') }) : '') + '\n' + T('adm.acc.msg.plugin');
    var ta = el('textarea', { rows: '7', readonly: 'readonly', dir: 'rtl' }); ta.value = text;
    var cp = el('button', { class: 'btn', type: 'button', text: T('adm.acc.copy') });
    cp.addEventListener('click', function () {
      var ok = function () { cp.textContent = T('adm.acc.copied'); };
      try { navigator.clipboard.writeText(text).then(ok, function () { ta.select(); document.execCommand('copy'); ok(); }); } catch (x) { ta.select(); try { document.execCommand('copy'); ok(); } catch (y) { /* بيتنسخ يدوي */ } }
    });
    var close = el('button', { class: 'btn ghost', type: 'button', text: T('adm.acc.close') });
    close.addEventListener('click', m.close);
    var b = m.box.querySelector('.adm-modal-b'); b.replaceWith(el('div', { class: 'adm-modal-b' }, [
      el('p', { class: 'notice ok', text: T('adm.acc.done') + ' · ' + r.org.name }),
      el('p', { text: r.owner.attached ? T('adm.acc.done.attached') : T('adm.acc.done.invited', { e: e }) }),
      sites.length ? el('p', { class: 'muted', text: T('adm.acc.done.sites', { n: LT.n(sites.length, 'site') }) }) : null,
      el('h3', { class: 'legend', text: T('adm.acc.msg.title') }), ta, el('div', { class: 'adm-modal-f' }, [cp, close])]));
  }

  // ── أضف موقعًا لحساب موجود ──
  // نفس نافذة العميل (connect-flow.js): نكتب رابط موقع العميل، نكتشف نوعه، ونوجّهه حسب النوع. من غير حساب محدد: نختاره الأول.
  function startFlow(org, o) {
    if (!window.LT.addSite) { o.toast(T('adm.acc.e.generic'), true); return; }
    window.LT.addSite.open({ data: LT.connectData, org: org.id, toast: o.toast, done: function () { o.reload(); } });
  }
  function addSite(org, o) {
    if (org) { startFlow(org, o); return; }
    var orgs = (o.orgs && o.orgs()) || [];
    var pk = LT.pick({ value: '', aria: T('adm.site.pick.l'), items: [{ v: '', label: T('adm.site.pick.ph') }].concat(orgs.map(function (x) { return { v: x.id, label: x.name, sub: (x.owner && x.owner.email) || '' }; })), search: T('adm.site.pick.search'), empty: T('pk.none') });
    var go = el('button', { class: 'btn', type: 'button', text: T('adm.site.pick.go') });
    var m = modal(T('adm.site.pick.title'), el('div', { class: 'adm-modal-b' }, [el('div', { class: 'fld' }, [el('span', { text: T('adm.site.pick.l') }), pk]), el('div', { class: 'adm-modal-f' }, [go])]));
    go.addEventListener('click', function () {
      var x = orgs.filter(function (y) { return y.id === pk.value; })[0];
      if (!x) return;
      m.close(); startFlow(x, o);
    });
  }

  // ── تغيير بريد العميل ──
  function setOwner(org, o) {
    var email = el('input', { type: 'email', maxlength: '200', dir: 'ltr', autocomplete: 'off', inputmode: 'email' });
    var msg = el('p', { class: 'notice bad', role: 'alert' }); msg.hidden = true;
    var go = el('button', { class: 'btn', type: 'button', text: T('adm.owner.save') });
    var m = modal(T('adm.owner.title', { n: org.name }), el('div', { class: 'adm-modal-b' }, [el('p', { class: 'muted', text: T('adm.owner.h') }), fld(T('adm.acc.email'), email, T('adm.acc.email.h')), msg, el('div', { class: 'adm-modal-f' }, [go])]));
    go.addEventListener('click', function () {
      msg.hidden = true; go.disabled = true;
      api('/v1/platform/accounts/owner', { org_id: org.id, email: email.value }).then(function (r) {
        go.disabled = false;
        if (!r.ok) { msg.textContent = err(r.body && r.body.error, r.body); msg.hidden = false; return; }
        o.toast(r.body.owner.attached ? T('adm.owner.attached', { e: r.body.owner.email }) : T('adm.owner.invited', { e: r.body.owner.email })); m.close(); o.reload();
      }).catch(function () { go.disabled = false; msg.textContent = err('generic'); msg.hidden = false; });
    });
  }

  window.LTAdminAccounts = { newAccount: newAccount, addSite: addSite, setOwner: setOwner };
})();
