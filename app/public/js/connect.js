// صفحة «اربط موقعك»: بتتفتح من زرار البلجن. البيانات جاية في الجزء بعد # (مابتتبعتش لأي سيرفر)،
// بتتحفظ في sessionStorage لحد ما يخلّص الدخول، وبعدين كارت تأكيد فيه الدومين، وضغطة واحدة تبعت الطلب.
(function () {
  'use strict';
  var KEY = 'lt_connect', TTL_MS = 15 * 60 * 1000;
  var NONCE_RE = /^[A-Za-z0-9_-]{16,64}$/;
  var view = document.getElementById('view');
  var lastOrg = '';
  var el = LT.el, clear = LT.clear, T = LT.t;

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
    show([h1(T('cn.nolink')),
      p(T('cn.nolink.p')),
      el('ol', { class: 'steps' }, [
        el('li', { text: T('cn.step1') }),
        el('li', { text: T('cn.step2') }),
        el('li', { text: T('cn.step3') })])]);
  }
  function expired() {
    forget();
    show([h1(T('cn.expired')), p(T('cn.expired.p'), 'muted')]);
  }
  function signin(d) {
    show([h1(T('cn.signin')), el('span', { class: 'domain', text: hostOf(d.c) }),
      p(T('cn.signin.p'), 'muted'),
      btn(T('login.google'), 'block', function () { location.assign(LT.loginUrl('/connect')); })]);
  }
  function confirmCard(d, m) {
    var manage = (m.orgs || []).filter(function (o) { return o.role === 'owner' || o.role === 'admin'; });
    if (!manage.length) {
      show([h1(T('cn.norole')), notice(T('cn.norole.p'), 'warn'),
        btn(T('cn.logout'), 'ghost', function () { LT.logout().then(function () { location.reload(); }); })]);
      return;
    }
    var select = null, orgBox = null;
    if (manage.length > 1) {
      select = el('select', { id: 'org' }, manage.map(function (o) { return el('option', { value: o.id, text: o.name }); }));
      orgBox = el('div', {}, [el('label', { for: 'org', text: T('cn.which') }), select]);
    }
    var go = btn(T('cn.yes'), 'block', function () { send(d, select ? select.value : manage[0].id, go); });
    var who = (m.user && (m.user.email || m.user.name)) || '';
    show([h1(T('cn.confirm')), el('span', { class: 'domain', text: hostOf(d.c) }),
      p(T('cn.confirm.p'), 'muted'),
      orgBox, el('div', { class: 'row' }, [go, btn(T('cancel'), 'ghost', function () { forget(); show([h1(T('cn.cancelled')), p(T('cn.cancelled.p'), 'muted')]); })]),
      who ? p(T('cn.who', { w: who }), 'hint') : null]);
  }
  function working() { show([h1(T('cn.working')), p(T('cn.working.p'), 'muted'), el('p', {}, [el('span', { class: 'spinner' })])]); }

  var FAIL = {
    400: [T('cn.e400'), T('cn.e400.p')],
    402: [T('cn.e402'), T('cn.e402.p')],
    403: [T('cn.norole'), T('cn.e403.p')],
    409: [T('cn.e409'), T('cn.e409.p')],
    429: [T('cn.e429'), T('cn.e429.p')],
    502: [T('cn.e502'), T('cn.e502.p')]
  };
  var FAIL_BY_ERR = {
    domain_exists: [T('cn.taken'), T('cn.taken.p')],
    site_off: [T('cn.off'), T('cn.off.p')],
    plan_inactive: FAIL[402], site_limit: FAIL[409], too_many: FAIL[429], site_unreachable: FAIL[502]
  };
  function failed(d, r, goBtn) {
    var f = FAIL_BY_ERR[r.body.error] || FAIL[r.status] || [T('cn.err'), T('cn.err.p')];
    var retry = (r.status === 502 || r.status === 0 || r.status >= 500) ? btn(T('cn.retry'), 'block', function () { send(d, lastOrg, {}); }) : null;
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
    show([el('div', { class: 'notice ok', role: 'status', text: T('cn.ok') }), h1(b.created ? T('cn.ok.new') : T('cn.ok.again')),
      el('span', { class: 'domain', text: (b.site && b.site.domains && b.site.domains[0]) || '' }),
      p(T('cn.ok.p'), 'muted'),
      back ? btn(T('cn.back'), 'block', function () { location.assign(back); }, 'button') : p(T('cn.back.p'), 'hint'),
      el('p', {}, [el('a', { href: '/' , text: T('cn.open') })])]);
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
