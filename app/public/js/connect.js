// صفحة «اربط موقعك»: بتتفتح من زرار البلجن. البيانات جاية في الجزء بعد # (مابتتبعتش لأي سيرفر)،
// بتتحفظ في sessionStorage لحد ما يخلّص الدخول، وبعدين كارت تأكيد فيه الدومين، وضغطة واحدة تبعت الطلب.
(function () {
  'use strict';
  var KEY = 'lt_connect', TTL_MS = 15 * 60 * 1000;
  var NONCE_RE = /^[A-Za-z0-9_-]{16,64}$/;
  var view = document.getElementById('view');
  var lastOrg = '';
  var el = LT.el, clear = LT.clear;

  function show(nodes) { clear(view); nodes.forEach(function (n) { if (n) view.appendChild(n); }); }
  function h1(t) { return el('h1', { text: t }); }
  function p(t, cls) { return el('p', { text: t, class: cls || '' }); }
  function notice(t, cls) { return el('div', { class: 'notice ' + cls, role: cls === 'bad' ? 'alert' : 'status', text: t }); }
  function btn(t, cls, fn, tag) { var b = el(tag || 'button', { class: 'btn ' + (cls || ''), type: 'button', text: t }); if (fn) b.addEventListener('click', fn); return b; }

  // ── البيانات اللي جاية من البلجن ──
  function parseFragment() {
    var f = new URLSearchParams(String(location.hash || '').replace(/^#/, ''));
    var c = f.get('c') || '', n = f.get('n') || '';
    var u; try { u = new URL(c); } catch (e) { return null; }
    if (u.protocol !== 'https:' || !u.hostname || !NONCE_RE.test(n)) return null;
    return { c: c, n: n, r: f.get('r') || '', s: (f.get('s') || '').slice(0, 120), t: Date.now() };
  }
  function load() {
    var fromHash = null;
    try { fromHash = location.hash.length > 1 ? parseFragment() : null; } catch (e) { fromHash = null; }
    if (location.hash.length > 1) { history.replaceState(null, '', '/connect'); }   // نشيل البيانات من شريط العنوان
    if (fromHash) { try { sessionStorage.setItem(KEY, JSON.stringify(fromHash)); } catch (e) { /* بدون تخزين: بيشتغل لو مفيش تحويل للدخول */ } return fromHash; }
    try { var raw = sessionStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  function forget() { try { sessionStorage.removeItem(KEY); } catch (e) { /* ولا حاجة */ } }
  function hostOf(c) { try { return new URL(c).hostname.replace(/^www\./, ''); } catch (e) { return ''; } }

  // ── الشاشات ──
  function noLink() {
    show([h1('افتح الصفحة دي من ووردبريس'),
      p('صفحة الربط بتتفتح من زرار «اربط بـ Maestro LT» جوه لوحة ووردبريس، علشان نعرف أنهي موقع هتربطه.'),
      el('ol', { class: 'steps' }, [
        el('li', { text: 'نزّل بلجن Lead Tracker Pro وفعّله على موقعك.' }),
        el('li', { text: 'اضغط «اربط بـ Maestro LT» اللي هيظهر لك فوق.' }),
        el('li', { text: 'هترجع هنا وتأكد.' })])]);
  }
  function expired() {
    forget();
    show([h1('الرابط انتهى'), p('رابط الربط صالح 15 دقيقة. ارجع لووردبريس واضغط «اربط بـ Maestro LT» تاني.', 'muted')]);
  }
  function signin(d) {
    show([h1('هتربط موقعك'), el('span', { class: 'domain', text: hostOf(d.c) }),
      p('سجّل دخولك بحساب جوجل علشان نكمل. أول دخول بيفتح لك حساب جديد بتجربة مجانية 14 يوم.', 'muted'),
      btn('الدخول بحساب جوجل', 'block', function () { location.assign(LT.loginUrl('/connect')); })]);
  }
  function confirmCard(d, m) {
    var manage = (m.orgs || []).filter(function (o) { return o.role === 'owner' || o.role === 'admin'; });
    if (!manage.length) {
      show([h1('مفيش صلاحية'), notice('حسابك مش «مالك» ولا «مدير» في أي حساب، فمقدرش تربط مواقع. اطلب من مالك الحساب.', 'warn'),
        btn('تسجيل خروج', 'ghost', function () { LT.logout().then(function () { location.reload(); }); })]);
      return;
    }
    var select = null, orgBox = null;
    if (manage.length > 1) {
      select = el('select', { id: 'org' }, manage.map(function (o) { return el('option', { value: o.id, text: o.name }); }));
      orgBox = el('div', {}, [el('label', { for: 'org', text: 'على أنهي حساب؟' }), select]);
    }
    var go = btn('نعم، اربط', 'block', function () { send(d, select ? select.value : manage[0].id, go); });
    var who = (m.user && (m.user.email || m.user.name)) || '';
    show([h1('تربط الموقع ده بحسابك؟'), el('span', { class: 'domain', text: hostOf(d.c) }),
      p('هنفعّل التتبع على الموقع ده ونبعت له مفتاح الربط. تأكد إن الدومين فوق هو موقعك فعلاً.', 'muted'),
      orgBox, el('div', { class: 'row' }, [go, btn('إلغاء', 'ghost', function () { forget(); show([h1('تم الإلغاء'), p('ما اتربطش أي حاجة. تقدر ترجع لووردبريس.', 'muted')]); })]),
      who ? p('داخل بحساب: ' + who, 'hint') : null]);
  }
  function working() { show([h1('بنربط موقعك…'), p('ثواني. بنأكد مع موقعك إن الربط تمام.', 'muted'), el('p', {}, [el('span', { class: 'spinner' })])]); }

  var FAIL = {
    400: ['الرابط ناقص أو قديم', 'ارجع لووردبريس واضغط «اربط بـ Maestro LT» تاني.'],
    402: ['التجربة المجانية انتهت', 'فعّل الاشتراك علشان تضيف مواقع جديدة.'],
    403: ['مفيش صلاحية', 'حسابك مش «مالك» ولا «مدير». اطلب من مالك الحساب.'],
    409: ['وصلت الحد الأقصى', 'التجربة المجانية فيها لحد 3 مواقع.'],
    429: ['محاولات كتير', 'استنى ساعة وحاول تاني، أو اتواصل معانا.'],
    502: ['مقدرناش نوصل لموقعك', 'السيرفر حاول يأكد الربط مع موقعك وما قدرش. غالباً بلجن أمان أو جدار حماية بيقفل REST API. اسمح بالمسار /wp-json/lt/v1/pair-confirm وحاول تاني، أو استخدم «كود الربط» من البلجن.']
  };
  var FAIL_BY_ERR = {
    domain_exists: ['الدومين ده مربوط بحساب تاني', 'لو ده موقعك، تواصل معانا علشان ننقله.'],
    site_off: ['الموقع ده موقوف', 'فعّله من اللوحة وبعدين اربطه.'],
    plan_inactive: FAIL[402], site_limit: FAIL[409], too_many: FAIL[429], site_unreachable: FAIL[502]
  };
  function failed(d, r, goBtn) {
    var f = FAIL_BY_ERR[r.body.error] || FAIL[r.status] || ['حصلت مشكلة', 'جرّب تاني بعد شوية.'];
    var retry = (r.status === 502 || r.status === 0 || r.status >= 500) ? btn('حاول تاني', 'block', function () { send(d, lastOrg, {}); }) : null;
    show([h1(f[0]), notice(f[1], 'bad'), retry]);
  }

  function send(d, orgId, goBtn) {
    if (Date.now() - Number(d.t || 0) > TTL_MS) return expired();
    lastOrg = orgId; goBtn.disabled = true; working();
    LT.api('/v1/connect', { method: 'POST', body: { org_id: orgId, confirm_url: d.c, nonce: d.n, name: d.s, return_url: d.r } }).then(function (r) {
      if (r.status === 401) return signin(d);
      if (r.status === 200 && r.body.ok) return done(r.body);
      failed(d, r, goBtn);
    });
  }
  function done(b) {
    forget();
    var back = b.return_url && /^https:\/\//.test(b.return_url) ? b.return_url : '';
    show([el('div', { class: 'notice ok', role: 'status', text: '✅ اتربط' }), h1(b.created ? 'الموقع اتضاف واتربط' : 'الموقع اتربط تاني'),
      el('span', { class: 'domain', text: (b.site && b.site.domains && b.site.domains[0]) || '' }),
      p('بدأ التتبع. أول زيارة هتظهر في اللوحة خلال دقايق.', 'muted'),
      back ? btn('ارجع لووردبريس', 'block', function () { location.assign(back); }, 'button') : p('ارجع لوحة ووردبريس وحدّث الصفحة.', 'hint'),
      el('p', {}, [el('a', { href: '/' , text: 'افتح لوحة Maestro' })])]);
    if (back) setTimeout(function () { location.assign(back); }, 2500);
  }

  function start(d) {
    if (Date.now() - Number(d.t || 0) > TTL_MS) return expired();
    LT.me().then(function (m) { if (m) confirmCard(d, m); else signin(d); });
  }

  var data = load();
  if (!data) return noLink();
  if (Date.now() - Number(data.t || 0) > TTL_MS) return expired();
  start(data);
})();
