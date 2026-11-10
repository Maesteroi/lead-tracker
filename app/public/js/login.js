(function () {
  'use strict';
  var ERR = {
    denied: 'ما أكملتش الدخول من جوجل. تقدر تحاول تاني.',
    state: 'محاولة الدخول ما اتكملتش صح. جرّب تاني من الأول.',
    expired: 'محاولة الدخول خدت وقت أطول من اللازم (10 دقايق). جرّب تاني.',
    google: 'جوجل ما قدرتش تكمّل الدخول. جرّب تاني بعد شوية.',
    email: 'إيميل حساب جوجل ده مش متأكد. استخدم حساب تاني أو أكّد الإيميل عند جوجل.'
  };
  var q = new URLSearchParams(location.search);
  var next = LT.safeNext(q.get('next'));
  var err = q.get('error');
  if (err) {
    var box = document.getElementById('err');
    box.textContent = ERR[err] || 'حصلت مشكلة في الدخول. جرّب تاني.';
    box.hidden = false;
  }
  document.getElementById('go').href = LT.loginUrl(next);
  // لو داخل بالفعل: كمّل على طول
  if (!err) LT.me().then(function (m) { if (m) location.replace(next); });
})();
