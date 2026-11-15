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

  // المدفوعات (المرحلة 2): الإيصالات المستنية فوق، بالصورة ورقم العملية وتحذير التكرار · «موافقة» أو «رفض بسبب»
  var payTab = 'pending';
  function money(v, c) { return (Math.round(Number(v) * 100) / 100).toLocaleString('en-US') + ' ' + c; }
  function paymentsCard() {
    var wrap = el('section', { class: 'panel-card pay-card' }), seg = el('div', { class: 'seg', role: 'tablist' }), list = el('div', { class: 'pay-list' });
    ['pending', 'approved', 'rejected'].forEach(function (k) {
      var b = el('button', { type: 'button', role: 'tab', 'aria-selected': payTab === k ? 'true' : 'false', text: T('adm.pay.t.' + k) });
      b.addEventListener('click', function () { payTab = k; load(); }); seg.appendChild(b);
    });
    wrap.appendChild(el('div', { class: 'sec-head' }, [el('h2', { text: T('adm.pay.title') }), seg]));
    wrap.appendChild(list);
    list.appendChild(el('p', {}, [el('span', { class: 'spinner' }), el('span', { text: T('adm.loading') })]));
    LT.api('/v1/platform/payments?status=' + payTab).then(function (r) {
      clear(list);
      if (!r.ok) { list.appendChild(el('p', { class: 'muted', text: T('adm.load.fail') })); return; }
      var ps = r.body.payments || [];
      if (!ps.length) { list.appendChild(el('p', { class: 'muted', text: T('adm.pay.none.' + payTab) })); return; }
      ps.forEach(function (p) { list.appendChild(payItem(p)); });
    });
    return wrap;
  }
  function payItem(p) {
    var img = el('button', { class: 'pay-img', type: 'button', text: T('adm.pay.show') });
    img.addEventListener('click', function () {
      img.disabled = true;
      LT.api('/v1/platform/payments/receipt?id=' + encodeURIComponent(p.id)).then(function (r) {
        if (!r.ok) { img.disabled = false; toast(T('adm.load.fail'), true); return; }
        var pic = el('img', { src: r.body.src, alt: T('adm.pay.receipt'), class: 'pay-pic' });
        pic.addEventListener('click', function () { pic.classList.toggle('big'); });
        img.parentNode.replaceChild(pic, img);
      });
    });
    var acts = el('div', { class: 'pay-acts' });
    if (p.status === 'pending') {
      var ok = el('button', { class: 'btn sm', type: 'button', text: T('adm.pay.approve') }), no = el('button', { class: 'btn ghost sm', type: 'button', text: T('adm.pay.reject') });
      var why = el('input', { type: 'text', class: 'bl-in', maxlength: '300', placeholder: T('adm.pay.reason'), hidden: '' }), sure = false;
      ok.addEventListener('click', function () {
        if (!sure) { sure = true; ok.textContent = T('adm.pay.approve.sure', { p: T('adm.plan.' + p.plan), d: T(p.period === 'year' ? 'adm.pay.year' : 'adm.pay.month') }); return; }
        ok.disabled = no.disabled = true;
        api('/v1/platform/payments/review', { id: p.id, decision: 'approve' }).then(function (r) { if (r.ok) { toast(T('adm.pay.approved') + (r.body.founder_no ? ' ' + T('adm.pay.seat', { n: r.body.founder_no }) : '')); load(); } else { ok.disabled = no.disabled = false; toast(T('err.save'), true); } });
      });
      no.addEventListener('click', function () {
        if (why.hidden) { why.hidden = false; why.focus(); no.textContent = T('adm.pay.reject.send'); return; }
        if (why.value.trim().length < 3) { toast(T('adm.pay.reason.need'), true); why.focus(); return; }
        ok.disabled = no.disabled = true;
        api('/v1/platform/payments/review', { id: p.id, decision: 'reject', reason: why.value.trim() }).then(function (r) { if (r.ok) { toast(T('adm.pay.rejected')); load(); } else { ok.disabled = no.disabled = false; toast(T('err.save'), true); } });
      });
      acts.appendChild(ok); acts.appendChild(no); acts.appendChild(why);
    }
    var late = p.status === 'pending' && p.hours >= 20;
    return el('div', { class: 'pay-item' + (late ? ' late' : '') }, [
      el('div', { class: 'pay-main' }, [
        el('div', { class: 'pay-h' }, [el('b', { text: p.org.name || p.org.id }), el('span', { class: 'pill', text: T('adm.plan.' + p.plan) + ' · ' + T(p.period === 'year' ? 'adm.pay.year' : 'adm.pay.month') }),
          p.founder ? el('span', { class: 'pill info', text: T('adm.pay.founder') }) : null, p.dup ? el('span', { class: 'pill bad', text: T('adm.pay.dup') }) : null, late ? el('span', { class: 'pill warn', text: T('adm.pay.late', { h: p.hours }) }) : null]),
        el('div', { class: 'pay-amt' }, [el('bdi', { dir: 'ltr', text: money(p.amount, p.currency) }), p.discount ? el('small', { class: 'dim', text: ' · ' + T('adm.pay.disc', { d: p.discount }) }) : null]),
        el('div', { class: 'dim', text: T('adm.bl.k.' + p.method.kind) + (p.method.label ? ' · ' + p.method.label : '') + ' · ' + T('adm.pay.ref') + ' ' + p.ref }),
        el('small', { class: 'dim', text: new Date(p.at).toLocaleString(LT.locale) + (p.reason ? ' · ' + T('adm.pay.why', { r: p.reason }) : '') + (p.period_end ? ' · ' + T('adm.pay.until', { d: String(p.period_end).slice(0, 10) }) : '') }),
        acts,
      ]),
      el('div', { class: 'pay-side' }, [img]),
    ]);
  }

  function load() {
    api('/v1/platform/billing').then(function (r) {
      clear(box);
      if (!r.ok) { box.appendChild(el('p', { class: 'muted', text: T('adm.load.fail') })); return; }
      data = r.body;
      box.appendChild(paymentsCard());
      if (data.super) { box.appendChild(plansCard()); box.appendChild(settingsCard()); }
      box.appendChild(methodsCard());
      var mc = membersCard(); if (mc) box.appendChild(mc);
    });
  }
  function open(target, t) { box = target; toast = t || toast; clear(box); box.appendChild(el('p', {}, [el('span', { class: 'spinner' }), el('span', { text: T('adm.loading') })])); load(); }
  window.LTAdminBilling = { open: open };
})();
