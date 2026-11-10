<?php
// البلجن 2.11.2 — إرسال موثوق للسيرفر: صندوق إرسال بعد الطلب + طابور إعادة محاولة (S01: 10 نوفمبر ضاعت زيارتين من 247 بسبب blocking:false من غير تأكيد).
// بيحمّل LTP_Core الحقيقي فوق دوال ووردبريس المحاكية. التشغيل: php tests/test-plugin-delivery.php
error_reporting(E_ALL);
define('ABSPATH', __DIR__ . '/');
define('DAY_IN_SECONDS', 86400);
define('LTP_PATH', sys_get_temp_dir() . '/ltp-test-empty-d/');
@mkdir(LTP_PATH); @unlink(LTP_PATH . 'config.json');

$GLOBALS['opts'] = []; $GLOBALS['tr'] = []; $GLOBALS['actions'] = []; $GLOBALS['sched'] = []; $GLOBALS['http'] = []; $GLOBALS['handler'] = null;
function add_action($tag, $cb, $pri = 10) { $GLOBALS['actions'][] = [$tag, $cb]; }
function get_option($k, $d = false) { return array_key_exists($k, $GLOBALS['opts']) ? $GLOBALS['opts'][$k] : $d; }
function update_option($k, $v, $a = null) { $GLOBALS['opts'][$k] = $v; return true; }
function delete_option($k) { unset($GLOBALS['opts'][$k]); return true; }
function get_transient($k) { return $GLOBALS['tr'][$k] ?? false; }
function set_transient($k, $v, $t = 0) { $GLOBALS['tr'][$k] = $v; return true; }
function delete_transient($k) { unset($GLOBALS['tr'][$k]); return true; }
function wp_next_scheduled($h) { return $GLOBALS['sched'][$h] ?? false; }
function wp_schedule_single_event($t, $h) { $GLOBALS['sched'][$h] = $t; return true; }
function wp_cache_delete(...$a) {}
function wp_parse_url($u, $c = -1) { return parse_url($u, $c); }
function wp_json_encode($v, $f = 0) { return json_encode($v, $f); }
class WP_Error { private $m; function __construct($m = 'x') { $this->m = $m; } function get_error_message() { return $this->m; } }
function is_wp_error($x) { return $x instanceof WP_Error; }
function wp_remote_retrieve_response_code($r) { return $r['code'] ?? 0; }
function wp_remote_post($url, $args) { $GLOBALS['http'][] = ['url' => $url, 'args' => $args]; return ($GLOBALS['handler'])($url, $args); }

require __DIR__ . '/../plugin/lead-tracker-pro/includes/class-ltp-core.php';

$ok = 0; $bad = 0;
function t($n, $c) { global $ok, $bad; if ($c) { $ok++; echo "✓ $n\n"; } else { $bad++; echo "✗ $n\n"; } }
function reset_all() { $GLOBALS['opts'] = []; $GLOBALS['tr'] = []; $GLOBALS['sched'] = []; $GLOBALS['http'] = []; $GLOBALS['handler'] = null; $GLOBALS['actions'] = []; $r = new ReflectionClass('LTP_Core'); foreach (['outbox' => [], 'outbox_hooked' => false] as $p => $v) { $x = $r->getProperty($p); $x->setAccessible(true); $x->setValue(null, $v); } }
function setup($over = []) { reset_all(); $GLOBALS['opts']['ltp_webhook_secret'] = 'ltk' . str_repeat('a1', 24); $GLOBALS['opts']['ltp_server_host'] = 'api.maestrolt.com'; foreach ($over as $k => $v) $GLOBALS['opts']['ltp_' . $k] = $v; }
function q() { return get_option('ltp_out_q', []); }
function st() { return LTP_Core::out_status(); }
$SRV = 'https://api.maestrolt.com/v1/events';
$EV = ['secret' => 'whatever-old', 'event' => 'page_view', 'time' => '2026-11-10 13:08:27', 'visitor_id' => 'XT246RF2', 'site_id' => 'abc', 'title' => 'روضة'];
$ok200 = function () { return ['code' => 200]; };

// ── 1) الإرسال بعد الطلب مش أثناءه ──
setup(); $GLOBALS['handler'] = $ok200;
LTP_Core::send_reliable($SRV, $EV);
t('nothing is sent while the request is running (queued in the outbox, hooked on shutdown)', count($GLOBALS['http']) === 0 && count(array_filter($GLOBALS['actions'], fn($a) => $a[0] === 'shutdown')) === 1);
LTP_Core::send_reliable($SRV, $EV);
t('the shutdown hook is registered only once per request', count(array_filter($GLOBALS['actions'], fn($a) => $a[0] === 'shutdown')) === 1);
LTP_Core::flush_outbox();
$h = $GLOBALS['http'][0];
t('on flush: blocking, https only, no redirects, a real timeout, and every queued event was sent', count($GLOBALS['http']) === 2 && $h['args']['blocking'] === true && $h['args']['redirection'] === 0 && $h['args']['timeout'] >= 5 && $h['url'] === $SRV);
$b = json_decode($h['args']['body'], true);
t('the body carries the CURRENT site key first, then the payload', array_key_first($b) === 'secret' && $b['secret'] === get_option('ltp_webhook_secret') && $b['event'] === 'page_view' && $b['time'] === '2026-11-10 13:08:27');
t('success leaves nothing behind (no queue, no failure stats, no cron)', q() === [] && st()['failed_first'] === 0 && $GLOBALS['sched'] === []);

// ── 2) فشل لحظي ← طابور ← يتعاد ويتشال ──
foreach ([['network error', function () { return new WP_Error('cURL error 28: timeout'); }], ['500', function () { return ['code' => 500]; }], ['502', function () { return ['code' => 502]; }], ['429', function () { return ['code' => 429]; }], ['408', function () { return ['code' => 408]; }]] as [$name, $fail]) {
  setup(); $GLOBALS['handler'] = $fail;
  LTP_Core::send_reliable($SRV, $EV); LTP_Core::flush_outbox();
  t("failure ($name): the event goes to the retry queue, first failure counted, a cron retry scheduled", count(q()) === 1 && q()[0]['n'] === 1 && st()['failed_first'] === 1 && st()['queued'] === 1 && isset($GLOBALS['sched']['ltp_out_retry']));
}
setup(); $GLOBALS['handler'] = function () { return new WP_Error('cURL error 28: timeout'); };
LTP_Core::send_reliable($SRV, $EV); LTP_Core::flush_outbox();
$first = json_decode($GLOBALS['http'][0]['args']['body'], true);
t('the site key is NOT stored in the retry queue (only added when sending)', strpos(json_encode(get_option('ltp_out_q')), 'ltk') === false && strpos(json_encode(get_option('ltp_out_q')), 'secret') === false);
t('the last error is recorded for the settings page', strpos(st()['last_error'], 'timeout') !== false && st()['last_error_at'] !== '');
$GLOBALS['http'] = []; $GLOBALS['handler'] = $ok200; LTP_Core::retry_queue();
$re = json_decode($GLOBALS['http'][0]['args']['body'], true);
t('retry succeeds: the event is removed from the queue and counted as recovered', q() === [] && st()['recovered'] === 1 && st()['queued'] === 0);
t('the retried body is identical to the first one (same fields, same order) — so the server de-duplicates it', json_encode($re) === json_encode($first));

// ── 3) أخطاء مش بتتعاد ──
foreach ([400, 401, 403, 404, 422] as $code) {
  setup(); $GLOBALS['handler'] = function () use ($code) { return ['code' => $code]; };
  LTP_Core::send_reliable($SRV, $EV); LTP_Core::flush_outbox();
  t("HTTP $code is dropped and counted as rejected (never retried forever)", q() === [] && st()['rejected'] === 1 && !isset($GLOBALS['sched']['ltp_out_retry']) && strpos(st()['last_error'], (string) $code) !== false);
}

// ── 4) حد المحاولات والعمر ──
setup(); $GLOBALS['handler'] = function () { return ['code' => 503]; };
LTP_Core::send_reliable($SRV, $EV); LTP_Core::flush_outbox();
for ($i = 0; $i < 12 && q(); $i++) { LTP_Core::retry_queue(); }
t('after 8 tries a still-failing event is dropped and counted', q() === [] && st()['dropped'] === 1);
setup(); $GLOBALS['handler'] = function () { return ['code' => 503]; };
LTP_Core::send_reliable($SRV, $EV); LTP_Core::flush_outbox();
$qq = q(); $qq[0]['t'] = time() - DAY_IN_SECONDS - 5; update_option('ltp_out_q', $qq);
LTP_Core::retry_queue();
t('an event older than a day is dropped even before 8 tries', q() === [] && st()['dropped'] === 1);

// ── 5) سقف الطابور ──
setup(); $GLOBALS['handler'] = function () { return ['code' => 503]; };
for ($i = 0; $i < 305; $i++) { LTP_Core::send_reliable($SRV, $EV + ['n' => $i]); }
LTP_Core::flush_outbox();
t('the queue never grows past 300 (oldest dropped and counted)', count(q()) === 300 && st()['dropped'] === 5 && q()[0]['p']['n'] === 5);

// ── 6) الكرون: دفعة 25، قفل، وحاجة اتضافت أثناء الشغل ──
setup(); $GLOBALS['handler'] = function () { return ['code' => 503]; };
for ($i = 0; $i < 40; $i++) { LTP_Core::send_reliable($SRV, $EV + ['n' => $i]); } LTP_Core::flush_outbox();
$GLOBALS['http'] = []; $GLOBALS['handler'] = $ok200; LTP_Core::retry_queue();
t('a retry run handles at most 15 events and keeps the rest', count($GLOBALS['http']) === 15 && count(q()) === 25 && st()['recovered'] === 15);
setup(); $GLOBALS['handler'] = function () { return ['code' => 503]; };
LTP_Core::send_reliable($SRV, $EV); LTP_Core::flush_outbox();
set_transient('ltp_out_lock', 1); $GLOBALS['http'] = []; $GLOBALS['handler'] = $ok200; LTP_Core::retry_queue();
t('a second retry run while one is active does nothing (lock)', count($GLOBALS['http']) === 0 && count(q()) === 1);
setup(); $GLOBALS['handler'] = function () { return ['code' => 503]; };
LTP_Core::send_reliable($SRV, $EV); LTP_Core::flush_outbox();
$GLOBALS['handler'] = function () { $GLOBALS['opts']['ltp_out_q'][] = ['u' => 'https://api.maestrolt.com/v1/events', 'p' => ['event' => 'late'], 'n' => 1, 't' => time()]; return ['code' => 503]; };
unset($GLOBALS['sched']['ltp_out_retry']);   // الكرون اتنفّذ فاتشال من الجدول
LTP_Core::retry_queue();
t('an event added to the queue while the retry was running is not lost', count(array_filter(q(), fn($x) => ($x['p']['event'] ?? '') === 'late')) === 1 && count(q()) === 2);
t('the retry cron backs off: after a second failure not sooner than 2 minutes', ($GLOBALS['sched']['ltp_out_retry'] ?? 0) >= time() + 119 && ($GLOBALS['sched']['ltp_out_retry'] ?? 0) <= time() + 125);

// ── 7) mirror والعنوان ──
setup(['server_mirror' => 1, 'webhook_url' => 'https://script.google.com/macros/s/AKfycbxabc/exec']); $GLOBALS['handler'] = $ok200;
LTP_Core::mirror($EV); LTP_Core::flush_outbox();
t('mirror (sheet is the main webhook): the copy goes to the server through the reliable path', count($GLOBALS['http']) === 1 && $GLOBALS['http'][0]['url'] === $SRV);
setup(['server_mirror' => 0, 'webhook_url' => 'https://script.google.com/macros/s/AKfycbxabc/exec']); $GLOBALS['handler'] = $ok200;
LTP_Core::mirror($EV); LTP_Core::flush_outbox();
t('mirror switched off: nothing is sent', count($GLOBALS['http']) === 0);
setup(['server_mirror' => 1, 'server_url' => 'http://insecure.example/e', 'webhook_url' => 'https://script.google.com/macros/s/AKfycbxabc/exec']); $GLOBALS['handler'] = $ok200;
LTP_Core::mirror($EV); LTP_Core::flush_outbox();
t('mirror to a non-https address is refused', count($GLOBALS['http']) === 0);
setup(['server_mirror' => 1, 'webhook_url' => $SRV]); $GLOBALS['handler'] = $ok200;
LTP_Core::mirror($EV); LTP_Core::flush_outbox();
t('when the main webhook already IS the server, the mirror does not send a duplicate', count($GLOBALS['http']) === 0);
setup();
t('is_server_url: only the configured server host (not look-alikes or empty host)', LTP_Core::is_server_url($SRV) && !LTP_Core::is_server_url('https://api.maestrolt.com.evil.example/e') && !LTP_Core::is_server_url('https://evilapi.maestrolt.com/e') && !LTP_Core::is_server_url('') && !LTP_Core::is_server_url('https://script.google.com/macros/s/x/exec'));
setup(['server_host' => '']);
t('with no server host configured nothing counts as the server', !LTP_Core::is_server_url($SRV));

// ── 8) شكل الحالة لصفحة الإعدادات ──
setup(); $GLOBALS['handler'] = function () { return ['code' => 503]; };
LTP_Core::send_reliable($SRV, $EV); LTP_Core::flush_outbox();
$s = st();
t('status for the settings page has all counters', isset($s['failed_first'], $s['recovered'], $s['rejected'], $s['dropped'], $s['queued'], $s['last_error']) && $s['queued'] === 1);

echo "\n$ok passed, $bad failed\n";
exit($bad ? 1 : 0);
