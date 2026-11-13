// لوحة الإدارة ← «شكل التنبيهات» (13 نوفمبر، موافقة محمود): لكل نوع مستلم، كل جزء في رسالة تليجرام يظهر أو لا،
// مع معاينة حية لزيارة نموذجية. الأنواع: إدارة المنصة · صاحب الموقع والمديرين · الموظف.
(function () {
  'use strict';
  var LT = window.LT, el = LT.el, clear = LT.clear, T = LT.t;
  var AUD = ['owner', 'staff', 'platform'];
  var state = null, aud = 'owner', toast = function () {}, timer = null, box = null;

  function api(path, body) { return LT.api(path, body === undefined ? undefined : { method: 'POST', body: body }); }

  // نص تليجرام (فيه <b> و<code> بس) ← عناصر، من غير أي HTML من البيانات
  function tgNodes(text) {
    var frag = el('div', { class: 'tg-msg' }), stack = [frag];
    String(text).split(/(<\/?(?:b|code)>)/).forEach(function (part) {
      var m = /^<(\/?)(b|code)>$/.exec(part);
      if (m) { if (m[1]) { if (stack.length > 1) stack.pop(); } else { var n = el(m[2] === 'b' ? 'b' : 'code'); stack[stack.length - 1].appendChild(n); stack.push(n); } return; }
      var txt = part.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
      txt.split('\n').forEach(function (line, i) { if (i) stack[stack.length - 1].appendChild(el('br')); if (line) stack[stack.length - 1].appendChild(document.createTextNode(line)); });
    });
    return frag;
  }

  function preview() {
    var pv = document.getElementById('al-preview');
    if (!pv) return;
    clearTimeout(timer);
    timer = setTimeout(function () {
      api('/v1/platform/tg-templates/preview', { fields: state.audiences[aud] }).then(function (r) {
        clear(pv);
        if (!r.ok) { pv.appendChild(el('p', { class: 'muted', text: T('adm.al.pv.fail') })); return; }
        pv.appendChild(tgNodes(r.body.text));
        if (r.body.buttons) pv.appendChild(el('div', { class: 'tg-btns' }, ['✅ تم الاتفاق', '🤔 يفكّر', '❌ ألغى', '🚫 غير جادّ', '📭 لم تصل رسالة'].map(function (x) { return el('span', { text: x }); })));
      });
    }, 250);
  }

  function draw() {
    clear(box);
    var seg = el('div', { class: 'seg', role: 'tablist', 'aria-label': T('adm.al.who') }, AUD.map(function (a) {
      var b = el('button', { type: 'button', role: 'tab', 'aria-selected': String(a === aud), text: T('adm.al.a.' + a) });
      b.addEventListener('click', function () { aud = a; draw(); });
      return b;
    }));
    var list = el('div', { class: 'al-fields' });
    state.fields.forEach(function (f) {
      var on = state.audiences[aud][f.key] !== false;
      var sw = el('button', { class: 'switch', type: 'button', role: 'switch', 'aria-checked': String(on), 'aria-label': f.label });
      sw.addEventListener('click', function () { var v = state.audiences[aud][f.key] === false; state.audiences[aud][f.key] = v; sw.setAttribute('aria-checked', String(v)); dirty(true); preview(); });
      list.appendChild(el('div', { class: 'al-row' }, [el('span', { text: f.label }), sw]));
    });
    var save = el('button', { class: 'btn', type: 'button', id: 'al-save', text: T('adm.al.save'), disabled: '' });
    var reset = el('button', { class: 'btn ghost', type: 'button', text: T('adm.al.reset') });
    save.addEventListener('click', function () {
      save.disabled = true;
      api('/v1/platform/tg-templates', { audience: aud, fields: state.audiences[aud] }).then(function (r) {
        if (!r.ok) { save.disabled = false; toast(T('err.save'), true); return; }
        state.audiences[aud] = r.body.fields; dirty(false); toast(T('adm.al.saved', { a: T('adm.al.a.' + aud) }));
      });
    });
    reset.addEventListener('click', function () { state.audiences[aud] = Object.assign({}, state.defaults[aud]); dirty(true); draw(); });
    box.appendChild(el('section', { class: 'panel-card' }, [
      el('div', { class: 'sec-head' }, [el('h2', { text: T('adm.alerts') })]),
      el('p', { class: 'muted', text: T('adm.al.intro') }),
      seg,
      el('p', { class: 'hint', text: T('adm.al.h.' + aud) }),
      el('div', { class: 'al-grid' }, [
        el('div', {}, [list, el('div', { class: 'al-acts' }, [save, reset])]),
        el('div', {}, [el('h3', { class: 'legend', text: T('adm.al.preview') }), el('div', { class: 'al-preview', id: 'al-preview' })]),
      ]),
    ]));
    preview();
  }
  function dirty(on) { var s = document.getElementById('al-save'); if (s) s.disabled = !on; }

  function open(target, t) {
    box = target; toast = t || toast;
    if (state) { draw(); return; }
    clear(box); box.appendChild(el('p', {}, [el('span', { class: 'spinner' }), el('span', { text: T('adm.loading') })]));
    api('/v1/platform/tg-templates').then(function (r) {
      if (!r.ok) { clear(box); box.appendChild(el('p', { class: 'muted', text: T('adm.load.fail') })); return; }
      state = r.body; draw();
    });
  }
  window.LTAdminAlerts = { open: open };
})();
