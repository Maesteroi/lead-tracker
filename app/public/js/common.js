// أدوات مشتركة للوحة: الاتصال بالسيرفر (بكوكي الجلسة + توكن CSRF)، وبناء عناصر آمنة (بنكتب النص كنص عادي، مش كـHTML).
(function () {
  'use strict';
  var API = 'https://api.maestrolt.com';
  var csrf = '';

  function api(path, opts) {
    opts = opts || {};
    var headers = { Accept: 'application/json' };
    var init = { method: opts.method || 'GET', credentials: 'include', headers: headers };
    if (init.method !== 'GET') { headers['Content-Type'] = 'application/json'; headers['X-CSRF-Token'] = csrf; init.body = JSON.stringify(opts.body || {}); }
    return fetch(API + path, init).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) { return { status: res.status, ok: res.ok, body: body || {} }; });
    }, function () { return { status: 0, ok: false, body: { error: 'network' } }; });
  }

  // تنزيل ملف من السيرفر بكوكي الجلسة (CSV): الاسم من رأس content-disposition
  function download(path) {
    return fetch(API + path, { credentials: 'include' }).then(function (res) {
      if (!res.ok) throw new Error('http');
      var m = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') || ''), name = m ? m[1] : 'maestro.csv';
      return res.blob().then(function (b) { var u = URL.createObjectURL(b), a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 4000); return name; });
    });
  }

  // يرجّع { user, orgs, csrf } أو null لو مش داخل
  function me() {
    return api('/v1/me').then(function (r) {
      if (r.status === 200 && r.body.ok) { csrf = r.body.csrf || ''; return r.body; }
      return null;
    });
  }

  // مسار جوه اللوحة بس (نفس قاعدة السيرفر): بيبدأ بـ / ومش // ولا \
  function safeNext(n) {
    n = String(n || '');
    return (n.charAt(0) === '/' && n.charAt(1) !== '/' && n.charAt(1) !== '\\' && !/[\r\n\\]/.test(n) && n.length <= 200) ? n : '/';
  }
  function loginUrl(next) { return API + '/v1/auth/google/start?next=' + encodeURIComponent(safeNext(next)); }

  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') e.textContent = attrs[k]; else if (k === 'class') e.className = attrs[k]; else e.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }
  function logout() { return api('/v1/auth/logout', { method: 'POST' }); }

  window.LT = { API: API, api: api, download: download, me: me, safeNext: safeNext, loginUrl: loginUrl, el: el, clear: clear, logout: logout };
})();
