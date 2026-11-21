// بيانات نافذة «أضف موقعًا» (لوحة العميل ولوحة الإدارة بيستخدموا نفس الدوال):
// معلومات الحصة والواتساب · فحص نوع الموقع · تسجيل اهتمام · تسجيل موقع على البوابة.
(function () {
  'use strict';
  var LT = window.LT;
  function post(path, body) { return LT.api(path, { method: 'POST', body: body }); }
  LT.connectData = {
    connectInfo: function (org, domain) { return LT.api('/v1/dash/connect-info?org=' + encodeURIComponent(org || '') + '&d=' + encodeURIComponent(domain || '')).then(function (r) { if (!r.ok) throw new Error(r.status === 403 ? 'role' : 'http'); return r.body; }); },
    detectSite: function (url) { return post('/v1/dash/detect-site', { url: url }).then(function (r) { if (!r.ok) throw new Error(r.status === 429 ? 'too_many' : 'bad'); return r.body; }); },
    siteInterest: function (kind) { return post('/v1/dash/site-interest', { kind: kind }).then(function (r) { if (!r.ok) throw new Error('http'); return r.body; }); },
    connectSite: function (org, domain) { return post('/v1/dash/connect-site', { org: org, domain: domain }).then(function (r) { if (!r.ok) throw new Error((r.body && r.body.error) || 'http'); return r.body; }); }
  };
})();
