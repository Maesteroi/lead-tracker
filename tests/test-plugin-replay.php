<?php
// البلجن 2.13.0 — تسجيل زيارات الإعلان كفيديو: تذكرة الجلسة (نفس توقيع السيرفر بالظبط) · بيشتغل بس على سيرفر Maestro · إعدادات المتصفح.
// التشغيل: php tests/test-plugin-replay.php
error_reporting(E_ALL);
define('ABSPATH', __DIR__ . '/');
define('LTP_VERSION', '2.13.0');
define('LTP_URL', 'https://shado.example/wp-content/plugins/lead-tracker-pro/');
define('LTP_PATH', sys_get_temp_dir() . '/ltp-test-empty-rp/');
@mkdir(LTP_PATH); @unlink(LTP_PATH . 'config.json');

$GLOBALS['opts'] = []; $GLOBALS['routes'] = []; $GLOBALS['nocache'] = 0;
function add_action($tag, $cb, $pri = 10) { if ($tag === 'rest_api_init') call_user_func($cb); }
function get_option($k, $d = false) { return array_key_exists($k, $GLOBALS['opts']) ? $GLOBALS['opts'][$k] : $d; }
function update_option($k, $v, $a = null) { $GLOBALS['opts'][$k] = $v; return true; }
function get_transient($k) { return false; }
function set_transient($k, $v, $t = 0) { return true; }
function wp_parse_url($u, $c = -1) { return parse_url($u, $c); }
function rest_url($p) { return 'https://shado.example/wp-json/' . $p; }
function esc_url_raw($u) { return $u; }
function nocache_headers() { $GLOBALS['nocache']++; }
function register_rest_route($ns, $r, $a) { $GLOBALS['routes'][$ns . $r] = $a; }
class WP_REST_Response { public $data; public $status; function __construct($d, $s = 200) { $this->data = $d; $this->status = $s; } }
class Req { private $b; function __construct($b) { $this->b = $b; } function get_json_params() { return $this->b; } }

require __DIR__ . '/../plugin/lead-tracker-pro/includes/class-ltp-core.php';
require __DIR__ . '/../plugin/lead-tracker-pro/includes/class-ltp-replay.php';

$ok = 0; $bad = 0;
function t($n, $c) { global $ok, $bad; if ($c) { $ok++; echo "✓ $n\n"; } else { $bad++; echo "✗ $n\n"; } }
function setup($over = []) {
  $GLOBALS['opts'] = ['ltp_webhook_secret' => 'ltk-secret-example', 'ltp_site_id' => 'RAgH4vV49gjd', 'ltp_server_host' => 'api.maestrolt.com', 'ltp_webhook_url' => 'https://api.maestrolt.com/v1/events'];
  foreach ($over as $k => $v) $GLOBALS['opts'][$k] = $v;
}

// ① نفس توقيع السيرفر (server/src/replay.js: replayToken) بالظبط — المثال ده اتحسب من كود السيرفر نفسه
setup();
t('the ticket is signed exactly like the server checks it (shared test vector)', LTP_Replay::sign('RAgH4vV49gjd', 'ABCDEFGHJK', 1763000000) === 'RAgH4vV49gjd.ABCDEFGHJK.1763000000.c33c14e308fa4bcaa135e8a47a3dde5d8991f516d07fbadf63a2b5ddbc26f683');
t('the site key itself never appears in the ticket', strpos(LTP_Replay::sign('RAgH4vV49gjd', 'ABCDEFGHJK', 1763000000), 'ltk-secret-example') === false);

// ② المسار والتذكرة
LTP_Replay::init();
t('the REST route lt/v1/replay-token is registered (POST, public)', isset($GLOBALS['routes']['lt/v1/replay-token']) && $GLOBALS['routes']['lt/v1/replay-token']['methods'] === 'POST');
$r = LTP_Replay::token(new Req(['sid' => 'ABCDEFGHJK']));
$parts = explode('.', $r->data['t'] ?? '');
t('a ticket for this session only, valid about 2 hours, pointing at the server', $r->status === 200 && $r->data['ok'] === true && count($parts) === 4 && $parts[0] === 'RAgH4vV49gjd' && $parts[1] === 'ABCDEFGHJK' && abs((int) $parts[2] - (time() + 7200)) < 5 && $r->data['u'] === 'https://api.maestrolt.com/v1/replay');
t('the ticket response is never cached', $GLOBALS['nocache'] >= 1);
t('a bad session id is refused', LTP_Replay::token(new Req(['sid' => '../x']))->status === 400 && LTP_Replay::token(new Req([]))->status === 400 && LTP_Replay::token(new Req(['sid' => str_repeat('a', 65)]))->status === 400);

// ③ بيشتغل بس على سيرفر Maestro، ومعاه مفتاح، ومش مقفول
t('browser config when the site is on the Maestro server', is_array(LTP_Replay::cfg()) && LTP_Replay::cfg()['tk'] === 'https://shado.example/wp-json/lt/v1/replay-token' && strpos(LTP_Replay::cfg()['js'], 'assets/rrweb-record.min.js') !== false);
setup(['ltp_webhook_url' => 'https://script.google.com/macros/s/AKfyc/exec']);
t('site still on the Google sheet: no recording at all', LTP_Replay::cfg() === null && LTP_Replay::token(new Req(['sid' => 'ABCDEFGHJK']))->data['ok'] === false);
setup(['ltp_webhook_secret' => '']);
t('no site key: no recording', LTP_Replay::cfg() === null);
setup(['ltp_site_id' => '']);
t('no site id: no recording', LTP_Replay::cfg() === null);
setup(['ltp_replay_off' => 1]);
t('turned off for this site in the settings: no recording', LTP_Replay::cfg() === null && LTP_Replay::token(new Req(['sid' => 'ABCDEFGHJK']))->data['ok'] === false);

// ④ الملفات: مكتبة rrweb موجودة بترخيصها، والبلجن بيحمّل الكلاس
$asset = file_get_contents(__DIR__ . '/../plugin/lead-tracker-pro/assets/rrweb-record.min.js');
t('rrweb record script shipped (always sets window.rrwebRecord, no source map line)', strpos($asset, 'g["rrwebRecord"] = f();') !== false && strpos($asset, 'define("rrwebRecord"') === false && strpos($asset, 'sourceMappingURL=record') === false && strlen($asset) < 90000);
t('rrweb MIT license shipped with it', strpos(file_get_contents(__DIR__ . '/../plugin/lead-tracker-pro/assets/rrweb.LICENSE.txt'), 'MIT License') !== false);
$main = file_get_contents(__DIR__ . '/../plugin/lead-tracker-pro/lead-tracker-pro.php');
t('the plugin loads and starts the replay class', strpos($main, "class-ltp-replay.php") !== false && strpos($main, 'LTP_Replay::init();') !== false);
$trk = file_get_contents(__DIR__ . '/../plugin/lead-tracker-pro/assets/tracker.js');
t('tracker: ad visits only, all typed input masked, checkout/cart/account never recorded', strpos($trk, "!isAd") !== false && strpos($trk, 'maskAllInputs: true') !== false && preg_match("~checkout.*cart.*account~", $trk) === 1);

echo "\n$ok passed, $bad failed\n";
exit($bad ? 1 : 0);
