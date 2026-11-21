// لوحة الإدارة ← «ربط المواقع» (19 نوفمبر، السوبر أدمن بس): زر المساعدة بالواتساب في نافذة «أضف موقعًا» عند العميل.
// تشغيل/إيقاف · أرقام (واحد مفعّل على الأقل يظهر) · نص الرسالة الجاهزة. الرقم بيتخزن في إعدادات المنصة، مش في الكود.
(function () {
  'use strict';
  var LT = window.LT, el = LT.el, clear = LT.clear, T = LT.t;
  var box = null, toast = function () {}, data = null, rows = [];

  function api(path, body) { return LT.api(path, body === undefined ? undefined : { method: 'POST', body: body }); }
  function field(label, input, hint) { return el('label', { class: 'cn-f' }, [el('span', { text: label }), input, hint ? el('small', { class: 'muted', text: hint }) : null]); }

  function draw() {
    clear(box);
    var on = el('input', { type: 'checkbox', id: 'cn-on' }); on.checked = data.enabled !== false;
    var list = el('div', { class: 'cn-nums' });
    function drawRows() {
      clear(list);
      rows.forEach(function (r, i) {
        var lab = el('input', { type: 'text', class: 'bl-in', maxlength: '40', value: r.label || '', placeholder: T('adm.cn.label'), 'aria-label': T('adm.cn.label') });
        var num = el('input', { type: 'tel', class: 'bl-in', dir: 'ltr', value: r.number || '', placeholder: '+000 000 000 0000', 'aria-label': T('adm.cn.number'), inputmode: 'tel' });
        var act = el('input', { type: 'checkbox', 'aria-label': T('adm.cn.active') }); act.checked = !!r.on;
        var del = el('button', { class: 'linkish', type: 'button', text: T('adm.cn.del') });
        lab.addEventListener('input', function () { r.label = lab.value; }); num.addEventListener('input', function () { r.number = num.value; }); act.addEventListener('change', function () { r.on = act.checked; });
        del.addEventListener('click', function () { rows.splice(i, 1); drawRows(); });
        list.appendChild(el('div', { class: 'cn-row' }, [lab, num, el('label', { class: 'cn-act' }, [act, el('span', { text: T('adm.cn.active') })]), del]));
      });
      if (!rows.length) list.appendChild(el('p', { class: 'muted', text: T('adm.cn.none') }));
    }
    drawRows();
    var add = el('button', { class: 'btn ghost sm', type: 'button', text: T('adm.cn.add') });
    add.addEventListener('click', function () { if (rows.length >= 5) { toast(T('adm.cn.max'), true); return; } rows.push({ label: '', number: '', on: !rows.some(function (x) { return x.on; }) }); drawRows(); });
    var msg = el('textarea', { class: 'bl-in', rows: '2', maxlength: '200', id: 'cn-msg' }); msg.value = data.message || '';
    var save = el('button', { class: 'btn', type: 'button', text: T('adm.al.save') });
    save.addEventListener('click', function () {
      save.disabled = true;
      api('/v1/platform/connect-help', { enabled: on.checked, message: msg.value, numbers: rows }).then(function (r) {
        save.disabled = false;
        if (r.ok) { data = r.body; rows = (data.numbers || []).map(function (n) { return { label: n.label, number: '+' + n.number, on: n.on }; }); toast(T('adm.cn.saved')); draw(); }
        else toast(r.body && r.body.error === 'number' ? T('adm.cn.bad') : T('err.save'), true);
      });
    });
    box.appendChild(el('section', { class: 'panel-card' }, [
      el('div', { class: 'sec-head' }, [el('h2', { text: T('adm.cn.title') })]),
      el('p', { class: 'muted', text: T('adm.cn.sub') }),
      el('label', { class: 'bl-check' }, [on, el('span', { text: T('adm.cn.on') })]),
      el('h3', { class: 'legend', text: T('adm.cn.numbers') }), el('p', { class: 'hint', text: T('adm.cn.numbers.d') }), list, el('div', {}, [add]),
      field(T('adm.cn.msg'), msg, T('adm.cn.msg.d')),
      el('div', { class: 'd-foot-act' }, [save])]));
  }

  function open(container, t) {
    box = container; toast = t || toast;
    clear(box); box.appendChild(el('p', { class: 'muted', text: T('adm.loading') }));
    api('/v1/platform/connect-help').then(function (r) {
      if (!r.ok) { clear(box); box.appendChild(el('p', { class: 'muted', text: T('err.save') })); return; }
      data = r.body; rows = (data.numbers || []).map(function (n) { return { label: n.label, number: '+' + n.number, on: n.on }; });
      draw();
    });
  }
  window.LTAdminConnect = { open: open };
})();
