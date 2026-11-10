// الصفحة الرئيسية (بسيطة): مواقعي + حالة التركيب + كود ربط بديل. الباقي (الإحصائيات والتنبيهات) في خطوات S03 اللي بعد كده.
(function () {
  'use strict';
  var el = LT.el, clear = LT.clear;
  var box = document.getElementById('sites');

  function badge(text, cls) { return el('span', { class: 'badge ' + (cls || ''), text: text }); }

  function codeButton(site, row) {
    var out = el('div', { class: 'hint' });
    var b = el('button', { class: 'btn ghost', type: 'button', text: 'كود ربط (بديل)' });
    b.addEventListener('click', function () {
      b.disabled = true;
      LT.api('/v1/sites/' + encodeURIComponent(site.id) + '/pair-code', { method: 'POST' }).then(function (r) {
        b.disabled = false; clear(out);
        if (r.status === 201 && r.body.code) {
          out.appendChild(el('div', { class: 'code', text: r.body.code }));
          out.appendChild(document.createTextNode('اكتبه في البلجن (إعدادات Lead Tracker ← عندي كود ربط). صالح ' + r.body.valid_minutes + ' دقيقة ومرة واحدة.'));
        } else out.appendChild(document.createTextNode(r.status === 403 ? 'محتاج صلاحية مالك أو مدير.' : 'ما قدرناش نطلّع كود. جرّب تاني.'));
      });
    });
    row.appendChild(b); row.appendChild(out);
  }

  function render(m, sites, status) {
    clear(box);
    box.appendChild(el('h2', { text: 'مواقعي' }));
    if (!sites.length) {
      box.appendChild(el('p', { class: 'muted', text: 'لسه مفيش مواقع. افتح موقعك على ووردبريس، فعّل بلجن Lead Tracker Pro، واضغط «اربط بـ Maestro LT».' }));
      return;
    }
    sites.forEach(function (s) {
      var st = status[s.id] || {};
      var right = el('div', {}, [st.status === 'connected' ? badge('✅ وصلت أحداث', 'ok') : badge(st.paired ? '⏳ مربوط ومستني أول زيارة' : '⏳ مستني الربط', 'warn')]);
      var row = el('div', { class: 'site' }, [el('div', {}, [el('div', { class: 'name', text: s.name }), el('div', { class: 'dom', text: (s.domains || []).join(' · ') })]), right]);
      box.appendChild(row);
      if (!st.paired) { var extra = el('div', { class: 'site sub' }); box.appendChild(extra); codeButton(s, extra); }
    });
  }

  LT.me().then(function (m) {
    if (!m) { location.replace('/login'); return; }
    document.getElementById('who').textContent = m.user.email || m.user.name || '';
    var out = document.getElementById('out'); out.hidden = false;
    out.addEventListener('click', function () { LT.logout().then(function () { location.replace('/login'); }); });
    LT.api('/v1/sites').then(function (r) {
      var sites = (r.body && r.body.sites) || [];
      var status = {};
      return Promise.all(sites.map(function (s) {
        return LT.api('/v1/sites/' + encodeURIComponent(s.id) + '/install-status').then(function (x) { status[s.id] = x.body || {}; });
      })).then(function () { render(m, sites, status); });
    });
  });
})();
