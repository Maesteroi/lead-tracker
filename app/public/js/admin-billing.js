// لوحة الإدارة ← «الباقات والدفع» (15 نوفمبر): تحكم كامل في الباقات (إضافة/حذف · المزايا checklist · خصم · كوبونات) · التجربة والسنوي وعرض المؤسسين ·
// وسائل الدفع (إنستا باي · فودافون كاش) وتفعيلها وأرقامها · الأدمن التاني ليه وسائل خاصة ولا لأ (السوبر أدمن بس).
(function () {
  'use strict';
  var LT = window.LT, el = LT.el, clear = LT.clear, T = LT.t;
  var CURS = ['SAR', 'EGP', 'USD', 'AED'];
  var box = null, toast = function () {}, data = null;
  function api(path, body) { return LT.api(path, body === undefined ? undefined : { method: 'POST', body: body }); }
  function card(title, kids, sub) { return el('section', { class: 'panel-card' }, [el('div', { class: 'sec-head' }, [el('h2', { text: title })]), sub ? el('p', { class: 'muted', text: sub }) : null].concat(kids)); }
  function num(v, attrs) { return el('input', Object.assign({ type: 'number', min: '0', step: 'any', class: 'bl-num', value: v == null ? '' : String(v) }, attrs || {})); }
  function saveBtn(fn) { var b = el('button', { class: 'btn sm', type: 'button', text: T('adm.al.save') }); b.addEventListener('click', function () { b.disabled = true; fn().then(function (r) { b.disabled = false; if (r && r.ok) { toast(T('adm.bl.saved')); load(); } else if (!(r && r.quiet)) toast(T('err.save'), true); }); }); return b; }

  // اسم الباقة من البيانات (الأدمن بيكتبه) · الباقات القديمة ليها ترجمة احتياطية
  function pname(id) { var p = (data.plans || []).find(function (x) { return x.id === id; }); var n = p && (LT.locale === 'en' ? p.name_en || p.name_ar : p.name_ar); if (n) return n; var k = 'adm.plan.' + id, t = T(k); return t === k ? id : t; }
  function check(on, label) { var i = el('input', { type: 'checkbox' }); i.checked = !!on; return { box: i, row: el('label', { class: 'bl-check' }, [i, el('span', { text: label })]) }; }
  function sureBtn(text, fn) { var b = el('button', { class: 'linkish', type: 'button', text: text }); b.addEventListener('click', function () { if (b.getAttribute('data-sure') !== '1') { b.setAttribute('data-sure', '1'); b.textContent = T('adm.bl.del.sure'); return; } b.disabled = true; fn(); }); return b; }
  function errMsg(r) { var k = 'adm.bl.err.' + ((r.body && r.body.error) || 'x'), m = T(k); return m === k ? T('err.save') : m; }
  function post(path, body, done) { return api(path, body).then(function (r) { if (r.ok) { toast(T('adm.bl.saved')); load(); } else toast(errMsg(r), true); if (done) done(r); return r.body; }); }

  // الباقات (15 نوفمبر): تحكم كامل · إضافة وحذف · الاسم والشارة والظهور · السعر لكل عملة · خصم بمدة · المزايا checklist بحدودها
  var openPlan = null;
  function planBox(p, curs) {
    var f = {}, fld = function (k, input, label) { f[k] = input; return el('label', {}, [el('span', { text: label }), input]); };
    var nameAr = el('input', { type: 'text', class: 'bl-in', maxlength: '40', value: p.name_ar || pname(p.id) }), nameEn = el('input', { type: 'text', class: 'bl-in', maxlength: '40', dir: 'ltr', value: p.name_en || '' });
    var badge = el('input', { type: 'text', class: 'bl-in', maxlength: '30', value: p.badge || '', placeholder: T('adm.bl.badge.ph') });
    var unit = el('select', {}, [['account', T('adm.bl.unit.account')], ['project', T('adm.bl.unit.project')]].map(function (x) { return el('option', { value: x[0], text: x[1] }); })); unit.value = p.unit || 'account';
    var mu = num(p.min_units || 1, { class: 'bl-num sm' }), cpu = num(p.campaigns_per_unit || 2, { class: 'bl-num sm' }), sort = num(p.sort || 0, { class: 'bl-num sm' });
    var projBox = el('div', { class: 'bl-grid' }, [fld('min_units', mu, T('adm.bl.min_units')), fld('cpu', cpu, T('adm.bl.campaigns'))]);
    var syncUnit = function () { projBox.hidden = unit.value !== 'project'; }; unit.addEventListener('change', syncUnit); syncUnit();
    var vis = check(p.visible !== false && p.active !== false, T('adm.bl.visible'));
    var pr = curs.map(function (cu) { return num(p.prices[cu], { 'aria-label': cu }); });
    var dPct = num(p.discount_pct, { min: '1', max: '90', class: 'bl-num sm', placeholder: '%' }), dLab = el('input', { type: 'text', class: 'bl-in wide', maxlength: '40', value: p.discount_label || '', placeholder: T('adm.bl.disc.label') });
    var dEnd = el('input', { type: 'date', class: 'bl-in', value: p.discount_ends_at ? String(p.discount_ends_at).slice(0, 10) : '' });
    var dOff = el('button', { class: 'linkish', type: 'button', text: T('adm.bl.disc.off') }); dOff.hidden = !p.discount_pct;
    dOff.addEventListener('click', function () { post('/v1/platform/billing/plan', { id: p.id, discount_pct: null }); });
    // المزايا: كل ميزة في الكتالوج = سطر بعلامة صح · الحدود برقم أو «بلا حد»
    var feats = (p.features || []).map(function (ft) {
      var on = check(ft.enabled, (LT.locale === 'en' ? ft.name_en || ft.name_ar : ft.name_ar));
      var row = el('div', { class: 'bl-fitem' + (ft.builtin ? '' : ' custom') }, [on.row]), val = null, inf = null;
      if (ft.kind === 'limit') {
        val = num(ft.value, { class: 'bl-num sm', 'aria-label': ft.name_ar }); inf = check(ft.enabled && ft.value == null, T('adm.bl.unlimited'));
        var sync = function () { val.disabled = !on.box.checked || inf.box.checked; inf.box.disabled = !on.box.checked; };
        on.box.addEventListener('change', sync); inf.box.addEventListener('change', sync); sync();
        row.appendChild(el('span', { class: 'bl-lim' }, [val, el('small', { class: 'dim', text: ft.unit_ar || '' }), inf.row]));
      }
      return { key: ft.key, read: function () { return { enabled: on.box.checked, value: val && !inf.box.checked && val.value !== '' ? Number(val.value) : null }; }, row: row };
    });
    var save = saveBtn(function () {
      var prices = {}; curs.forEach(function (cu, i) { prices[cu] = pr[i].value === '' ? null : Number(pr[i].value); });
      var features = {}; feats.forEach(function (x) { features[x.key] = x.read(); });
      var body = { id: p.id, name_ar: nameAr.value, name_en: nameEn.value, badge: badge.value, sort: Number(sort.value) || 0, visible: vis.box.checked, active: vis.box.checked, unit: unit.value, prices: prices, features: features };
      if (unit.value === 'project') { body.min_units = Number(mu.value); body.campaigns_per_unit = Number(cpu.value); }
      if (dPct.value !== '') { body.discount_pct = Number(dPct.value); body.discount_label = dLab.value; body.discount_ends_at = dEnd.value ? dEnd.value + 'T23:59:59Z' : null; }
      return api('/v1/platform/billing/plan', body).then(function (r) { if (!r.ok) toast(errMsg(r), true); return r.ok ? r.body : { ok: false, quiet: true }; });
    });
    var del = sureBtn(T('adm.bl.plan.del'), function () { api('/v1/platform/billing/plan/delete', { id: p.id }).then(function (r) { if (r.ok) { toast(T(r.body.hidden ? 'adm.bl.plan.hidden' : 'adm.bl.plan.deleted')); load(); } else toast(errMsg(r), true); }); });
    var priceSum = curs.filter(function (c) { return p.prices[c] != null; }).map(function (c) { return p.prices[c].toLocaleString('en-US') + ' ' + c; }).join(' · ') || T('adm.bl.noprice');
    var d = el('details', { class: 'bl-planbox' + (p.visible === false || p.active === false ? ' off' : '') }, [
      el('summary', {}, [el('b', { text: pname(p.id) }), p.badge ? el('span', { class: 'pill info', text: p.badge }) : null, p.discount_pct ? el('span', { class: 'pill warn', text: '−' + p.discount_pct + '%' }) : null,
        p.visible === false || p.active === false ? el('span', { class: 'pill', text: T('adm.bl.hidden') }) : null, el('small', { class: 'dim', dir: 'ltr', text: priceSum })]),
      el('h3', { class: 'legend', text: T('adm.bl.sec.info') }),
      el('div', { class: 'bl-grid' }, [fld('name_ar', nameAr, T('adm.bl.name_ar')), fld('name_en', nameEn, T('adm.bl.name_en')), fld('badge', badge, T('adm.bl.badge')), fld('unit', unit, T('adm.bl.unit')), fld('sort', sort, T('adm.bl.sort'))]),
      projBox, vis.row,
      el('h3', { class: 'legend', text: T('adm.bl.sec.price') }),
      el('div', { class: 'bl-grid' }, curs.map(function (cu, i) { return el('label', {}, [el('span', { text: T('adm.bl.monthly', { c: cu }) }), pr[i]]); })),
      el('h3', { class: 'legend', text: T('adm.bl.sec.disc') }),
      el('div', { class: 'bl-add' }, [dPct, dLab, el('label', { class: 'bl-check' }, [el('span', { text: T('adm.bl.disc.ends') }), dEnd]), dOff]),
      el('p', { class: 'hint', text: T('adm.bl.disc.hint') }),
      el('h3', { class: 'legend', text: T('adm.bl.sec.feats') }),
      el('div', { class: 'bl-feats' }, feats.map(function (x) { return x.row; })),
      el('div', { class: 'bl-add bl-foot' }, [save, del]),
    ]);
    if (openPlan === p.id) d.open = true;
    d.addEventListener('toggle', function () { if (d.open) openPlan = p.id; });
    return d;
  }
  function plansCard() {
    var curs = CURS.slice(); data.plans.forEach(function (p) { Object.keys(p.prices).forEach(function (c) { if (curs.indexOf(c) < 0) curs.push(c); }); });
    var id = el('input', { type: 'text', class: 'bl-in wide', dir: 'ltr', maxlength: '31', placeholder: T('adm.bl.new.id') }), nm = el('input', { type: 'text', class: 'bl-in', maxlength: '40', placeholder: T('adm.bl.new.name') });
    var add = el('button', { class: 'btn sm', type: 'button', text: T('adm.bl.new.add') });
    add.addEventListener('click', function () {
      var slug = id.value.trim().toLowerCase(); add.disabled = true;
      post('/v1/platform/billing/plan', { create: true, id: slug, name_ar: nm.value.trim(), visible: false, sort: data.plans.length + 1 }, function (r) { add.disabled = false; if (r.ok) openPlan = slug; });
    });
    return card(T('adm.bl.plans'), [el('div', { class: 'bl-plans-admin' }, data.plans.map(function (p) { return planBox(p, curs); })),
      el('h3', { class: 'legend', text: T('adm.bl.new') }), el('div', { class: 'bl-add' }, [id, nm, add]), el('p', { class: 'hint', text: T('adm.bl.new.hint') })], T('adm.bl.plans.sub'));
  }

  // كتالوج المزايا: الأساسية ثابتة (الاسم بيتعدل) · ميزة جديدة بتظهر في كل باقة وتتفعل من الـ checklist
  function featuresCard() {
    var cat = data.catalog || [];
    var list = el('div', { class: 'al-fields' }, cat.map(function (ft) {
      var a = el('input', { type: 'text', class: 'bl-in', maxlength: '80', value: ft.name_ar }), e = el('input', { type: 'text', class: 'bl-in', maxlength: '80', dir: 'ltr', value: ft.name_en || '', placeholder: 'English' });
      var u = ft.kind === 'limit' ? el('input', { type: 'text', class: 'bl-in sm', maxlength: '20', value: ft.unit_ar || '', placeholder: T('adm.bl.f.unit') }) : null;
      var s = saveBtn(function () { return api('/v1/platform/billing/feature', { key: ft.key, name_ar: a.value, name_en: e.value, unit_ar: u ? u.value : null, kind: ft.kind }).then(function (r) { return r.body; }); });
      var del = ft.builtin ? null : sureBtn(T('adm.bl.del'), function () { post('/v1/platform/billing/feature', { key: ft.key, delete: true }); });
      return el('div', { class: 'bl-frow' }, [el('span', { class: 'pill' + (ft.kind === 'limit' ? ' info' : ''), text: T('adm.bl.f.' + ft.kind) }), a, e, u, s, del, ft.builtin ? el('small', { class: 'dim', text: T('adm.bl.f.builtin') }) : null]);
    }));
    var na = el('input', { type: 'text', class: 'bl-in', maxlength: '80', placeholder: T('adm.bl.f.name') }), ne = el('input', { type: 'text', class: 'bl-in', maxlength: '80', dir: 'ltr', placeholder: 'English' });
    var kind = el('select', {}, ['bool', 'limit'].map(function (k) { return el('option', { value: k, text: T('adm.bl.f.' + k) }); })), nu = el('input', { type: 'text', class: 'bl-in sm', maxlength: '20', placeholder: T('adm.bl.f.unit') });
    var add = el('button', { class: 'btn sm', type: 'button', text: T('adm.bl.f.add') });
    add.addEventListener('click', function () { add.disabled = true; post('/v1/platform/billing/feature', { name_ar: na.value.trim(), name_en: ne.value.trim(), kind: kind.value, unit_ar: nu.value.trim(), sort: cat.length + 1 }, function () { add.disabled = false; }); });
    return card(T('adm.bl.feats'), [list, el('h3', { class: 'legend', text: T('adm.bl.f.new') }), el('div', { class: 'bl-add' }, [na, ne, kind, nu, add])], T('adm.bl.feats.sub'));
  }

  // الكوبونات: نسبة أو مبلغ بعملته · لباقات/مدة معينة · عدد مرات · من/إلى · أول دفعة بس · خصم واحد بس (الأحسن للعميل)
  function couponText(c) {
    var v = c.kind === 'pct' ? c.value + '%' : Number(c.value).toLocaleString('en-US') + ' ' + c.currency, bits = [v];
    bits.push(c.plan_ids && c.plan_ids.length ? c.plan_ids.map(pname).join('، ') : T('adm.cp2.all'));
    if (c.periods && c.periods.length === 1) bits.push(T('adm.pay.' + c.periods[0]));
    bits.push(T('adm.cp2.used', { u: c.used || 0, m: c.max_uses || '∞' }));
    if (c.ends_at) bits.push(T('adm.cp2.until', { d: String(c.ends_at).slice(0, 10) }));
    if (c.first_only) bits.push(T('adm.cp2.first'));
    return bits.join(' · ');
  }
  function couponsCard() {
    var cs = data.coupons || [];
    var list = el('div', { class: 'al-fields' }, cs.length ? cs.map(function (c) {
      var sw = el('button', { class: 'switch', type: 'button', role: 'switch', 'aria-checked': String(!!c.active), 'aria-label': c.code });
      sw.addEventListener('click', function () { post('/v1/platform/billing/coupon', Object.assign({}, c, { active: !c.active })); });
      var del = sureBtn(T('adm.bl.del'), function () { post('/v1/platform/billing/coupon', { code: c.code, delete: true }); });
      return el('div', { class: 'al-row' }, [el('span', {}, [el('b', { dir: 'ltr', text: c.code }), el('small', { class: 'dim', text: ' ' + couponText(c) + (c.note ? ' · ' + c.note : '') + ' ' }), del]), sw]);
    }) : [el('p', { class: 'muted', text: T('adm.cp2.none') })]);
    var code = el('input', { type: 'text', class: 'bl-in', dir: 'ltr', maxlength: '30', placeholder: T('adm.cp2.code') });
    var kind = el('select', {}, [['pct', '%'], ['amount', T('adm.cp2.amount')]].map(function (x) { return el('option', { value: x[0], text: x[1] }); }));
    var val = num('', { class: 'bl-num sm', placeholder: T('adm.cp2.value') }), cur = el('select', {}, CURS.map(function (c) { return el('option', { value: c, text: c }); })); cur.hidden = true;
    kind.addEventListener('change', function () { cur.hidden = kind.value !== 'amount'; });
    var period = el('select', {}, [['', T('adm.cp2.anyperiod')], ['month', T('adm.pay.month')], ['year', T('adm.pay.year')]].map(function (x) { return el('option', { value: x[0], text: x[1] }); }));
    var max = num('', { class: 'bl-num sm', min: '1', placeholder: T('adm.cp2.max') }), from = el('input', { type: 'date', class: 'bl-in', 'aria-label': T('adm.cp2.from') }), to = el('input', { type: 'date', class: 'bl-in', 'aria-label': T('adm.cp2.to') });
    var first = check(false, T('adm.cp2.first')), note = el('input', { type: 'text', class: 'bl-in', maxlength: '120', placeholder: T('adm.cp2.note') });
    var plans = data.plans.map(function (p) { var c = check(false, pname(p.id)); c.id = p.id; return c; });
    var add = el('button', { class: 'btn sm', type: 'button', text: T('adm.cp2.add') });
    add.addEventListener('click', function () {
      add.disabled = true;
      post('/v1/platform/billing/coupon', { code: code.value.trim(), kind: kind.value, value: Number(val.value), currency: kind.value === 'amount' ? cur.value : null,
        plan_ids: plans.filter(function (c) { return c.box.checked; }).map(function (c) { return c.id; }), periods: period.value ? [period.value] : null,
        max_uses: max.value ? Number(max.value) : null, starts_at: from.value || null, ends_at: to.value ? to.value + 'T23:59:59Z' : null, first_only: first.box.checked, note: note.value }, function () { add.disabled = false; });
    });
    return card(T('adm.cp2.title'), [list, el('h3', { class: 'legend', text: T('adm.cp2.new') }),
      el('div', { class: 'bl-add' }, [code, kind, val, cur, period, max]),
      el('div', { class: 'bl-add' }, [el('small', { class: 'dim', text: T('adm.cp2.plans') })].concat(plans.map(function (c) { return c.row; }))),
      el('div', { class: 'bl-add' }, [el('label', { class: 'bl-check' }, [el('span', { text: T('adm.cp2.from') }), from]), el('label', { class: 'bl-check' }, [el('span', { text: T('adm.cp2.to') }), to]), first.row, note, add]),
      el('p', { class: 'hint', text: T('adm.cp2.hint') })], T('adm.cp2.sub'));
  }

  function settingsCard() {
    var st = data.settings, keys = ['trial_days', 'annual_months', 'founders_limit', 'founders_pct', 'founders_months', 'founders_after_pct'];
    var inputs = {}, grid = el('div', { class: 'bl-grid' }, keys.map(function (k) { inputs[k] = num(st[k]); return el('label', {}, [el('span', { text: T('adm.bl.s.' + k) }), inputs[k]]); }));
    return card(T('adm.bl.offer'), [el('p', { class: 'hint', text: T('adm.bl.founders', { u: data.founders.used, l: data.founders.limit }) }), grid, saveBtn(function () {
      var b = {}; keys.forEach(function (k) { b[k] = Number(inputs[k].value); }); return api('/v1/platform/billing/settings', b).then(function (r) { return r.body; });
    })]);
  }

  // العملة حسب البلد: لكل بلد عملته، و«ثابت» (السعر المكتوب لعملته فوق) أو «حسب الدولار» (سعر الدولار × سعر الصرف اليومي، مقرّب)
  var FLAG = function (cc) { return cc === '*' ? '🌍' : String.fromCodePoint.apply(null, cc.split('').map(function (c) { return 0x1f1a5 + c.charCodeAt(0); })); };
  function countryName(cc) { if (cc === '*') return T('adm.cp.rest'); try { return new Intl.DisplayNames([LT.locale || 'ar'], { type: 'region' }).of(cc); } catch (e) { return cc; } }
  function countriesCard() {
    var list = data.countries || [], usdMissing = data.plans.some(function (p) { return p.prices.USD == null; });
    var rows = list.map(function (c) {
      var cur = el('input', { type: 'text', class: 'bl-in cp-cur', maxlength: '3', value: c.currency, 'aria-label': T('adm.cp.currency') });
      var mode = el('div', { class: 'seg cp-mode', role: 'group' }), m = c.mode;
      var rnd = num(c.round_to, { 'aria-label': T('adm.cp.round'), class: 'bl-num cp-rnd' });
      var drawMode = function () { clear(mode); [['fixed', T('adm.cp.fixed')], ['usd', T('adm.cp.usd')]].forEach(function (x) { var b = el('button', { type: 'button', 'aria-pressed': m === x[0] ? 'true' : 'false', text: x[1] }); b.addEventListener('click', function () { m = x[0]; drawMode(); rnd.disabled = m !== 'usd'; }); mode.appendChild(b); }); };
      drawMode(); rnd.disabled = m !== 'usd';
      var prev = data.plans.map(function (p) { var v = c.preview && c.preview[p.id]; return pname(p.id) + ': ' + (v == null ? '—' : v.toLocaleString('en-US') + ' ' + c.currency); }).join(' · ');
      var del = c.country === '*' ? null : el('button', { class: 'linkish', type: 'button', text: T('adm.bl.del') });
      if (del) del.addEventListener('click', function () { if (del.getAttribute('data-sure') !== '1') { del.setAttribute('data-sure', '1'); del.textContent = T('adm.bl.del.sure'); return; } api('/v1/platform/billing/country', { country: c.country, delete: true }).then(function () { load(); }); });
      return el('div', { class: 'cp-row' }, [
        el('div', { class: 'cp-name' }, [el('span', { class: 'cp-flag', text: FLAG(c.country) }), el('b', { text: countryName(c.country) }), del]),
        el('label', {}, [el('span', { text: T('adm.cp.currency') }), cur]), mode, el('label', {}, [el('span', { text: T('adm.cp.round') }), rnd]),
        saveBtn(function () { return api('/v1/platform/billing/country', { country: c.country, currency: cur.value.trim().toUpperCase(), mode: m, round_to: Number(rnd.value) || 1 }).then(function (r) { return r.body; }); }),
        el('small', { class: 'dim cp-prev', text: (c.mode === 'usd' ? (c.rate ? T('adm.cp.rate', { r: Number(c.rate).toLocaleString('en-US', { maximumFractionDigits: 4 }), c: c.currency }) : T('adm.cp.norate')) + ' · ' : '') + prev }),
      ]);
    });
    var cc = el('input', { type: 'text', class: 'bl-in cp-cur', maxlength: '2', placeholder: 'AE', 'aria-label': T('adm.cp.country') }), ncur = el('input', { type: 'text', class: 'bl-in cp-cur', maxlength: '3', placeholder: 'AED', 'aria-label': T('adm.cp.currency') });
    var add = el('button', { class: 'btn sm', type: 'button', text: T('adm.bl.m.add') });
    add.addEventListener('click', function () { api('/v1/platform/billing/country', { country: cc.value.trim().toUpperCase(), currency: ncur.value.trim().toUpperCase(), mode: 'fixed' }).then(function (r) { if (r.ok) { toast(T('adm.bl.saved')); load(); } else toast(T('adm.cp.bad'), true); }); });
    return card(T('adm.cp.title'), [usdMissing ? el('p', { class: 'warn-text', text: T('adm.cp.usd_missing') }) : null, el('div', { class: 'cp-list' }, rows), el('h3', { class: 'legend', text: T('adm.cp.add') }), el('div', { class: 'bl-add cp-add' }, [cc, ncur, add]),
      el('p', { class: 'hint' }, [el('span', { text: T('adm.cp.hint') + ' ' }), data.fx_source ? el('a', { href: data.fx_source, target: '_blank', rel: 'noopener', text: 'Rates By Exchange Rate API' }) : null])], T('adm.cp.sub'));
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
    var lk = el('input', { type: 'url', class: 'bl-in wide', dir: 'ltr', placeholder: T('adm.bl.m.link') });
    kind.addEventListener('change', function () { a.placeholder = T(kind.value === 'instapay' ? 'adm.bl.m.handle' : 'adm.bl.m.numbers'); lk.hidden = kind.value !== 'instapay'; });
    var add = el('button', { class: 'btn sm', type: 'button', text: T('adm.bl.m.add') });
    add.addEventListener('click', function () {
      var details = kind.value === 'instapay' ? { handle: a.value, name: nm.value, link: lk.value.trim() } : { numbers: a.value.split(/[,،\s]+/).filter(Boolean), name: nm.value };
      add.disabled = true;
      api('/v1/platform/billing/method', { kind: kind.value, enabled: true, details: details, currencies: ['EGP'] }).then(function (r) { add.disabled = false; if (r.ok) { toast(T('adm.bl.saved')); load(); } else { var k = 'adm.bl.m.err.' + ((r.body && r.body.error) || 'x'), msg = T(k); toast(msg === k ? T('err.save') : msg, true); } });
    });
    return card(T('adm.bl.methods'), [list, el('h3', { class: 'legend', text: T('adm.bl.m.new') }), el('div', { class: 'bl-add m-add' }, [kind, a, nm, lk, add]), el('p', { class: 'hint', text: T('adm.bl.m.hint') })]);
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
        if (!sure) { sure = true; ok.textContent = T('adm.pay.approve.sure', { p: pname(p.plan), d: T(p.period === 'year' ? 'adm.pay.year' : 'adm.pay.month') }); return; }
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
        el('div', { class: 'pay-h' }, [el('b', { text: p.org.name || p.org.id }), el('span', { class: 'pill', text: pname(p.plan) + ' · ' + T(p.period === 'year' ? 'adm.pay.year' : 'adm.pay.month') }),
          p.founder ? el('span', { class: 'pill info', text: T('adm.pay.founder') }) : null, p.dup ? el('span', { class: 'pill bad', text: T('adm.pay.dup') }) : null, late ? el('span', { class: 'pill warn', text: T('adm.pay.late', { h: p.hours }) }) : null]),
        el('div', { class: 'pay-amt' }, [el('bdi', { dir: 'ltr', text: money(p.amount, p.currency) }), p.discount ? el('small', { class: 'dim', text: ' · ' + T('adm.pay.disc', { d: p.discount }) }) : null]),
        el('div', { class: 'dim', text: T('adm.bl.k.' + p.method.kind) + (p.method.label ? ' · ' + p.method.label : '') + ' · ' + T('adm.pay.ref') + ' ' + p.ref }),
        el('small', { class: 'dim', text: new Date(p.at).toLocaleString(LT.locale) + (p.reason ? ' · ' + T('adm.pay.why', { r: p.reason }) : '') + (p.period_end ? ' · ' + T('adm.pay.until', { d: String(p.period_end).slice(0, 10) }) : '') }),
        acts,
      ]),
      el('div', { class: 'pay-side' }, [img]),
    ]);
  }

  // المساعد الذكي (16 نوفمبر): مفتاح وميزانية لكل مزوّد (Anthropic · OpenAI · Gemini · DeepSeek) · لكل مرحلة سلسلة نماذج بالترتيب
  // (اسم النموذج بإيدك + السعر) · لو الأول فشل أو ميزانيته خلصت يكمل اللي بعده، وإنذار تليجرام قبل ما الرصيد يخلص · الحد اليومي · الدروس
  var aiDraft = null;
  function aiCard() {
    var wrap = card(T('adm.ai.title'), [el('p', {}, [el('span', { class: 'spinner' })])], T('adm.ai.sub'));
    api('/v1/platform/ai').then(function (r) {
      if (!r.ok) return;
      var d = r.body, body = wrap; while (body.childNodes.length > 2) body.removeChild(body.lastChild);
      var provs = Object.keys(d.providers);
      if (!aiDraft) { aiDraft = {}; d.tasks.forEach(function (t) { aiDraft[t] = d.chains[t].map(function (x) { return { provider: x.provider, model: x.model, price: (x.price || ['', '']).slice() }; }); }); }
      // المزوّدين
      var keyIn = {}, budIn = {};
      var ptab = el('div', { class: 'tbl-wrap' }, [el('table', { class: 'tbl static ai-prov' }, [el('thead', {}, [el('tr', {}, ['adm.ai.p', 'adm.ai.key', 'adm.ai.budget', 'adm.ai.spent'].map(function (h) { return el('th', { text: T(h) }); }))]),
        el('tbody', {}, provs.map(function (id) {
          var p = d.providers[id];
          keyIn[id] = el('input', { type: 'password', class: 'bl-in', dir: 'ltr', autocomplete: 'off', placeholder: p.last4 ? '•••• ' + p.last4 : p.from_env ? T('adm.ai.from_env') : T('adm.ai.key.ph'), 'aria-label': T('adm.ai.key') + ' ' + p.label });
          budIn[id] = num(p.budget || '', { class: 'bl-num sm', placeholder: '$', 'aria-label': T('adm.ai.budget') + ' ' + p.label });
          var pct = p.budget ? Math.round(p.spent_month / p.budget * 100) : null;
          return el('tr', {}, [el('th', { scope: 'row', text: p.label }), el('td', {}, [keyIn[id]]), el('td', {}, [budIn[id]]), el('td', { class: pct >= 80 ? 'warn-text' : '', text: '$' + p.spent_month + (pct != null ? ' (' + pct + '%)' : '') })]);
        }))])]);
      // سلسلة لكل مرحلة
      var dl = el('datalist', { id: 'ai-models' }, [].concat.apply([], provs.map(function (id) { return d.providers[id].suggest.map(function (m) { return el('option', { value: m }); }); })));
      var chainsBox = el('div', { class: 'ai-chains' });
      var drawChains = function () {
        clear(chainsBox);
        d.tasks.forEach(function (t) {
          var list = aiDraft[t];
          var rows = list.map(function (it, i) {
            var ps = el('select', { 'aria-label': T('adm.ai.p') }, provs.map(function (id) { return el('option', { value: id, text: d.providers[id].label }); })); ps.value = it.provider;
            var md = el('input', { type: 'text', class: 'bl-in', dir: 'ltr', list: 'ai-models', value: it.model, placeholder: T('adm.ai.model.ph'), 'aria-label': T('adm.ai.model') });
            var pi = num(it.price[0], { class: 'bl-num sm', placeholder: T('adm.ai.in'), 'aria-label': T('adm.ai.in') }), po = num(it.price[1], { class: 'bl-num sm', placeholder: T('adm.ai.out'), 'aria-label': T('adm.ai.out') });
            ps.addEventListener('change', function () { it.provider = ps.value; }); md.addEventListener('input', function () { it.model = md.value.trim(); });
            pi.addEventListener('input', function () { it.price[0] = pi.value; }); po.addEventListener('input', function () { it.price[1] = po.value; });
            var up = el('button', { class: 'linkish', type: 'button', 'aria-label': T('adm.ai.up'), text: '↑' }); up.disabled = i === 0;
            up.addEventListener('click', function () { list.splice(i - 1, 0, list.splice(i, 1)[0]); drawChains(); });
            var rm = el('button', { class: 'linkish', type: 'button', text: T('adm.bl.del') }); rm.hidden = list.length < 2;
            rm.addEventListener('click', function () { list.splice(i, 1); drawChains(); });
            var tst = el('button', { class: 'linkish', type: 'button', text: T('adm.ai.test') });
            tst.addEventListener('click', function () { tst.disabled = true; api('/v1/platform/ai/test', { provider: it.provider, model: it.model }).then(function (x) { tst.disabled = false; toast(x.ok ? T('adm.ai.test.ok', { m: x.body.provider + ' · ' + x.body.model, r: x.body.reply }) : T('adm.ai.e.' + ((x.body && x.body.error) || 'ai')), !x.ok); }); });
            return el('div', { class: 'ai-link' }, [el('span', { class: 'ai-n', text: String(i + 1) }), ps, md, pi, po, up, tst, rm]);
          });
          var add = el('button', { class: 'btn ghost sm', type: 'button', text: T('adm.ai.add') }); add.hidden = list.length >= 4;
          add.addEventListener('click', function () { list.push({ provider: 'anthropic', model: '', price: ['', ''] }); drawChains(); });
          chainsBox.appendChild(el('div', { class: 'ai-chain' }, [el('b', { text: T('adm.ai.t.' + t) })].concat(rows, [add])));
        });
      };
      drawChains();
      var lim = num(d.daily_limit, { class: 'bl-num sm', 'aria-label': T('adm.ai.limit') });
      var on = el('button', { class: 'switch', type: 'button', role: 'switch', 'aria-checked': String(!!d.enabled), 'aria-label': T('adm.ai.on') });
      on.addEventListener('click', function () { api('/v1/platform/ai', { enabled: !d.enabled }).then(function () { toast(T('adm.bl.saved')); load(); }); });
      var save = saveBtn(function () {
        var b = { keys: {}, budgets: {}, chains: {}, daily_limit: Number(lim.value) };
        provs.forEach(function (id) { if (keyIn[id].value.trim()) b.keys[id] = keyIn[id].value.trim(); if (budIn[id].value !== '') b.budgets[id] = Number(budIn[id].value); });
        d.tasks.forEach(function (t) { b.chains[t] = aiDraft[t].filter(function (x) { return x.model; }).map(function (x) { var o = { provider: x.provider, model: x.model }; if (x.price[0] !== '' && x.price[1] !== '') o.price = [Number(x.price[0]), Number(x.price[1])]; return o; }); });
        return api('/v1/platform/ai', b).then(function (x) { if (!x.ok) { var e = x.body || {}; toast(T('adm.ai.e.' + (e.error || 'x')) + (e.provider ? ' (' + e.provider + ')' : '') + (e.task ? ' (' + T('adm.ai.t.' + e.task) + ')' : ''), true); return { ok: false, quiet: true }; } aiDraft = null; return x.body; });
      });
      var lessons = el('div', { class: 'al-fields' }, (d.lessons || []).map(function (l) {
        var sw = el('button', { class: 'switch', type: 'button', role: 'switch', 'aria-checked': String(!!l.active), 'aria-label': l.text });
        sw.addEventListener('click', function () { api('/v1/platform/ai/lesson', { id: l.id, active: !l.active }).then(function () { load(); }); });
        return el('div', { class: 'al-row' }, [el('span', {}, [el('span', { text: l.text }), el('small', { class: 'dim', text: ' · ' + T(l.client_id ? 'adm.ai.l.site' : 'adm.ai.l.all') })]), sw]);
      }));
      var lt = el('input', { type: 'text', class: 'bl-in wide', maxlength: '500', placeholder: T('adm.ai.l.ph') }), la = el('button', { class: 'btn sm', type: 'button', text: T('adm.ai.l.add') });
      la.addEventListener('click', function () { api('/v1/platform/ai/lesson', { text: lt.value.trim() }).then(function (x) { if (x.ok) { toast(T('adm.bl.saved')); load(); } else toast(T('err.save'), true); }); });
      [el('div', { class: 'al-row' }, [el('span', { text: T(d.configured ? 'adm.ai.st.ok' : 'adm.ai.st.no') }), on]),
        el('h3', { class: 'legend', text: T('adm.ai.provs') }), ptab, el('p', { class: 'hint', text: T('adm.ai.key.i') }),
        el('h3', { class: 'legend', text: T('adm.ai.models') }), el('p', { class: 'hint', text: T('adm.ai.chain.i') }), dl, chainsBox,
        el('label', { class: 'bl-check' }, [el('span', { text: T('adm.ai.limit') }), lim]),
        el('div', { class: 'bl-add' }, [save]),
        el('p', { class: 'hint', text: T('adm.ai.usage', { n: d.usage.calls, f: d.usage.failed, c: d.usage.cost_usd }) }),
        el('h3', { class: 'legend', text: T('adm.ai.lessons') }), el('p', { class: 'hint', text: T('adm.ai.lessons.i') }), lessons, el('div', { class: 'bl-add' }, [lt, la])].forEach(function (n) { body.appendChild(n); });
    });
    return wrap;
  }

  function load() {
    api('/v1/platform/billing').then(function (r) {
      clear(box);
      if (!r.ok) { box.appendChild(el('p', { class: 'muted', text: T('adm.load.fail') })); return; }
      data = r.body;
      box.appendChild(paymentsCard());
      if (data.super) { box.appendChild(plansCard()); if (data.catalog) box.appendChild(featuresCard()); if (data.coupons) box.appendChild(couponsCard()); if (data.countries) box.appendChild(countriesCard()); box.appendChild(settingsCard()); box.appendChild(aiCard()); }
      box.appendChild(methodsCard());
      var mc = membersCard(); if (mc) box.appendChild(mc);
    });
  }
  function open(target, t) { box = target; toast = t || toast; clear(box); box.appendChild(el('p', {}, [el('span', { class: 'spinner' }), el('span', { text: T('adm.loading') })])); load(); }
  window.LTAdminBilling = { open: open };
})();
