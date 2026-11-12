(function () {
  'use strict';
  var T = LT.t;
  var ERR = {
    denied: T('login.e.denied'),
    state: T('login.e.state'),
    expired: T('login.e.expired'),
    google: T('login.e.google'),
    email: T('login.e.email')
  };
  var q = new URLSearchParams(location.search);
  var next = LT.safeNext(q.get('next'));
  var err = q.get('error');
  if (err) {
    var box = document.getElementById('err');
    box.textContent = ERR[err] || T('login.e.other');
    box.hidden = false;
  }
  document.getElementById('go').href = LT.loginUrl(next);
  // لو داخل بالفعل: كمّل على طول
  if (!err) LT.me().then(function (m) { if (m) location.replace(next); });
})();
