// لوحة الإدارة ← «الباقات والدفع» (15 نوفمبر): أسعار كل باقة لكل عملة وحدودها · التجربة والسنوي وعرض المؤسسين ·
// وسائل الدفع (إنستا باي · فودافون كاش) وتفعيلها وأرقامها · الأدمن التاني ليه وسائل خاصة ولا لأ (السوبر أدمن بس).
(function () {
  'use strict';
  var LT = window.LT, el = LT.el, clear = LT.clear, T = LT.t;
  var CURS = ['SAR', 'EGP', 'AED'];
  var box = null, toast = function () {}, data = null;
  function api(path, body) { return LT.api(path, body === undefined ? undefined : { method: 'POST', body: body }); }
  function card(title, kids, sub) { return el('section', { class: 'panel-card' }, [el('div', { class: 'sec-head' }, [el('h2', { text: title })]), sub ? el('p', { class: 'muted', text: sub }) : null].concat(kids)); }
  function num(v, attrs) { return el('input', Object.assign({ type: 'number', min: '0', step: 'any', class: 'bl-num', value: v == null ? '' : String(v) }, attrs || {})); }
  function saveBtn(fn) { var b = el('button', { class: 'btn sm', type: 'button', text: T('adm.al.save') }); b.addEventListener('click', function () { b.disabled = true; fn().then(function (r) { b.disabled = false; if (r && r.ok) { toast(T('adm.bl.saved')); load(); } else toast(T('err.save'), true); }); }); return b; }

  function plansCard() {
    var curs = CURS.slice(); data.plans.forEach(function (p) { Object.keys(p.prices).forEach(function (c) { if (curs.indexOf(c) < 0) curs.push(c); }); });
    var head = el('tr', {}, [T('adm.bl.plan'), T('adm.bl.sites'), T('adm.bl.clicks')].concat(curs.map(function (c) { return T('adm.bl.monthly', { c: c }); })).concat(['']).map(function (h) { return el('th', { text: h }); }));
    var rows = data.plans.map(function (p) {
      var s = num(p.sites, { 'aria-label': T('adm.bl.sites') }), c = num(p.clicks, { 'aria-label': T('adm.bl.clicks') });
      var pr = curs.map(function (cu) { return num(p.prices[cu], { 'aria-label': cu }); });
      return el('tr', {}, [el('td', {}, [el('b', { text: T('adm.bl.p.' + p.id) })]), el('td', {}, [s]), el('td', {}, [c])].concat(pr.map(function (i) { return el('td', {}, [i]); })).concat([el('td', {}, [saveBtn(function () {
        var prices = {}; curs.forEach(function (cu, i) { if (pr[i].value !== '') prices[cu] = Number(pr[i].value); });
        return api('/v1/platform/billing/plan', { id: p.id, sites: Number(s.value), clicks: Number(c.value), prices: prices }).then(function (r) { return r.body; });
      })])]));
    });
    return card(T('adm.bl.plans'), [el('div', { class: 'tbl-wrap' }, [el('table', { class: 'tbl bl-tbl' }, [el('thead', {}, [head]), el('tbody', {}, rows)])])], T('adm.bl.plans.sub'));
  }

  function settingsCard() {
    var st = data.settings, keys = ['trial_days', 'annual_months', 'founders_limit', 'founders_pct', 'founders_months', 'founders_after_pct'];
    var inputs = {}, grid = el('div', { class: 'bl-grid' }, keys.map(function (k) { inputs[k] = num(st[k]); return el('label', {}, [el('span', { text: T('adm.bl.s.' + k) }), inputs[k]]); }));
    return card(T('adm.bl.offer'), [el('p', { class: 'hint', text: T('adm.bl.founders', { u: data.founders.used, l: data.founders.limit }) }), grid, saveBtn(function () {
      var b = {}; keys.forEach(function (k) { b[k] = Number(inputs[k].value); }); return api('/v1/platform/billing/settings', b).then(function (r) { return r.body; });
    })]);
  }

  function methodRow(m) {
    var sum = m.kind === 'instapay' ? (m.details.handle || '') + (m.details.name ? ' · ' + m.details.name : '') : m.kind === 'vodafone_cash' ? (m.details.numbers || []).join('، ') + (m.details.name ? ' · ' + m.details.name : '') : '';
    var sw = el('button', { class: 'switch', type: 'button', role: 'switch', 'aria-checked': String(!!m.enabled), 'aria-label': T('adm.bl.k.' + m.kind) });
    sw.addEventListener('click', function () { api('/v1/platform/billing/method', { id: m.id, kind: m.kind, enabled: !m.enabled, label: m.label, details: m.details, currencies: m.currencies }).then(function (r) { if (r.ok) { toast(T('adm.bl.saved')); load(); } else toast(T('err.save'), true); }); });
    var del = el('button', { class: 'linkish', type: 'button', text: T('adm.bl.del') });
    del.addEventListener('click', function () { if (del.getAttribute('data-sure') !== '1') { del.setAttribute('data-sure', '1'); del.textContent = T('adm.bl.del.sure'); return; } api('/v1/platform/billing/method', { id: m.id, delete: true }).then(function () { load(); }); });
    var who = m.owner_id ? T('adm.bl.owner.admin') : T('adm.bl.owner.platform');
    return el('div', { class: 'al-row' }, [el('span', {}, [el('b', { text: T('adm.bl.k.' + m.kind) + (m.label ? ' · ' + m.label : '') }), el('small', { class: 'dim', text: ' ' + sum + ' · ' + (m.currencies || []).join('، ') + ' · ' + who + ' ' }), del]), sw]);
  }

  function methodsCard() {
    var list = el('div', { class: 'al-fields' }, data.methods.length ? data.methods.map(methodRow) : [el('p', { class: 'muted', text: T('adm.bl.m.none') })]);
    var kind = el('select', { 'aria-label': T('adm.bl.m.kind') }, ['instapay', 'vodafone_cash'].map(function (k) { return el('option', { value: k, text: T('adm.bl.k.' + k) }); }));
    var a = el('input', { type: 'text', class: 'bl-in', placeholder: T('adm.bl.m.handle') }), nm = el('input', { type: 'text', class: 'bl-in', placeholder: T('adm.bl.m.name') });
    kind.addEventListener('change', function () { a.placeholder = T(kind.value === 'instapay' ? 'adm.bl.m.handle' : 'adm.bl.m.numbers'); });
    var add = el('button', { class: 'btn sm', type: 'button', text: T('adm.bl.m.add') });
    add.addEventListener('click', function () {
      var details = kind.value === 'instapay' ? { handle: a.value, name: nm.value } : { numbers: a.value.split(/[,،\s]+/).filter(Boolean), name: nm.value };
      add.disabled = true;
      api('/v1/platform/billing/method', { kind: kind.value, enabled: true, details: details, currencies: ['EGP'] }).then(function (r) { add.disabled = false; if (r.ok) { toast(T('adm.bl.saved')); load(); } else { var k = 'adm.bl.m.err.' + ((r.body && r.body.error) || 'x'), msg = T(k); toast(msg === k ? T('err.save') : msg, true); } });
    });
    return card(T('adm.bl.methods'), [list, el('h3', { class: 'legend', text: T('adm.bl.m.new') }), el('div', { class: 'bl-add' }, [kind, a, nm, add]), el('p', { class: 'hint', text: T('adm.bl.m.hint') })]);
  }

  function membersCard() {
    if (!data.members || !data.members.length) return null;
    return card(T('adm.bl.own'), [el('div', { class: 'al-fields' }, data.members.map(function (m) {
      var sw = el('button', { class: 'switch', type: 'button', role: 'switch', 'aria-checked': String(m.own_payments), 'aria-label': m.email });
      sw.addEventListener('click', function () { api('/v1/platform/billing/own', { user_id: m.user_id, own_payments: !m.own_payments }).then(function (r) { if (r.ok) { toast(T('adm.bl.saved')); load(); } else toast(T('err.save'), true); }); });
      return el('div', { class: 'al-row' }, [el('span', { text: (m.name || m.email) + (m.name ? ' · ' + m.email : '') }), sw]);
    }))], T('adm.bl.own.sub'));
  }

  function load() {
    api('/v1/platform/billing').then(function (r) {
      clear(box);
      if (!r.ok) { box.appendChild(el('p', { class: 'muted', text: T('adm.load.fail') })); return; }
      data = r.body;
      if (data.super) { box.appendChild(plansCard()); box.appendChild(settingsCard()); }
      box.appendChild(methodsCard());
      var mc = membersCard(); if (mc) box.appendChild(mc);
    });
  }
  function open(target, t) { box = target; toast = t || toast; clear(box); box.appendChild(el('p', {}, [el('span', { class: 'spinner' }), el('span', { text: T('adm.loading') })])); load(); }
  window.LTAdminBilling = { open: open };
})();
