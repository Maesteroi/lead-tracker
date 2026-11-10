<?php
// البلجن 2.10.0 — الربط بكود من لوحة Maestro: pair-confirm (وضع السيرفر) و LTP_Pair::pair_with_code.
// بيحمّل كلاسات البلجن الحقيقية (LTP_Core و LTP_Pair) فوق دوال ووردبريس المحاكية، من غير ووردبريس ولا إنترنت.
// التشغيل: php tests/test-plugin-pair.php
error_reporting(E_ALL);
define('ABSPATH', __DIR__ . '/');
define('LTP_VERSION', '2.10.0');
define('LTP_PATH', sys_get_temp_dir() . '/ltp-test-empty/');       // من غير config.json: مفيش هب قديم جوه الاختبار
@mkdir(LTP_PATH);
@unlink(LTP_PATH . 'config.json');

$GLOBALS['opts'] = []; $GLOBALS['http'] = []; $GLOBALS['http_handler'] = null; $GLOBALS['filters'] = [];
function add_action(...$a) {}
function wp_clear_scheduled_hook(...$a) {}
function get_option($k, $d = false) { return array_key_exists($k, $GLOBALS['opts']) ? $GLOBALS['opts'][$k] : $d; }
function update_option($k, $v, $autoload = null) { $GLOBALS['opts'][$k] = $v; return true; }
function delete_option($k) { unset($GLOBALS['opts'][$k]); return true; }
function wp_parse_url($u, $c = -1) { return parse_url($u, $c); }
function apply_filters($tag, $v, ...$r) { return isset($GLOBALS['filters'][$tag]) ? $GLOBALS['filters'][$tag]($v) : $v; }
function has_filter($tag) { return isset($GLOBALS['filters'][$tag]); }
function wp_json_encode($v, $f = 0) { return json_encode($v, $f); }
function wp_generate_password($len = 12, $s = true, $e = false) { return substr(bin2hex(random_bytes($len)), 0, $len); }
function wp_cache_delete(...$a) {}
function rest_url($p = '') { return 'https://rawda.site/wp-json/' . ltrim($p, '/'); }
function current_time($t) { return '2026-11-10 12:00:00'; }
function sanitize_text_field($s) { return trim(strip_tags((string) $s)); }
function wp_unslash($s) { return $s; }
function is_wp_error($x) { return $x instanceof WP_Error; }
function wp_remote_retrieve_response_code($r) { return $r['response']['code'] ?? 0; }
function wp_remote_retrieve_body($r) { return $r['body'] ?? ''; }
function wp_remote_post($url, $args) { $GLOBALS['http'][] = ['url' => $url, 'args' => $args]; return ($GLOBALS['http_handler'])($url, $args); }
class WP_Error {}
class WP_REST_Response { public $data; public $status; function __construct($d = null, $s = 200) { $this->data = $d; $this->status = $s; } }
class FakeReq { private $p; function __construct($p) { $this->p = $p; } function get_json_params() { return $this->p; } }

require __DIR__ . '/../plugin/lead-tracker-pro/includes/class-ltp-core.php';
require __DIR__ . '/../plugin/lead-tracker-pro/includes/class-ltp-pair.php';

$ok = 0; $bad = 0;
function t($name, $cond) { global $ok, $bad; if ($cond) { $ok++; echo "✓ $name\n"; } else { $bad++; echo "✗ $name\n"; } }
function reset_state() { $GLOBALS['opts'] = []; $GLOBALS['http'] = []; $GLOBALS['http_handler'] = null; $GLOBALS['filters'] = []; }
function opt($k) { return get_option('ltp_' . $k, null); }

$pair = LTP_Pair::instance();
$KEY = 'ltk' . str_repeat('ab12', 12);                  // 51 حرف/رقم (نفس شكل مفتاح السيرفر)
$NONCE = 'n0nce-from-the-wordpress-site-0001';
$arm = function ($age = 0) use ($NONCE) { update_option('ltp_pair_nonce', ['n' => $NONCE, 't' => time() - $age], false); };

// ── التأكيد من السيرفر (pair-confirm) ──
reset_state(); $arm();
$r = $pair->confirm(new FakeReq(['n' => $NONCE, 'secret' => $KEY, 'site_id' => 'AbC123xyzQ9k', 'server' => 'https://api.maestrolt.com']));
t('confirm from the server: accepted', $r->status === 200 && $r->data['ok'] === true);
t('confirm stores the key EXACTLY (no character lost) and the site id', opt('webhook_secret') === $KEY && opt('site_id') === 'AbC123xyzQ9k');
t('confirm points the plugin at the server and turns the sheet mirror off', opt('webhook_url') === 'https://api.maestrolt.com/v1/events' && opt('server_host') === 'api.maestrolt.com' && (int) opt('server_mirror') === 0 && opt('pair_source') === 'server');
t('the plugin now counts as paired (core accepts the server host)', LTP_Pair::is_paired() === true && LTP_Core::webhook_ready() === true);
t('the one-time number is gone after use', get_option('ltp_pair_nonce', null) === null);
$r = $pair->confirm(new FakeReq(['n' => $NONCE, 'secret' => $KEY, 'site_id' => 'x', 'server' => 'https://api.maestrolt.com']));
t('replaying the same confirm is refused', $r->status === 403);

reset_state(); $arm();
$r = $pair->confirm(new FakeReq(['n' => 'attacker-guess-attacker-guess-1234', 'secret' => $KEY, 'site_id' => 'AbC123xyzQ9k', 'server' => 'https://api.maestrolt.com']));
t('wrong number: refused and nothing stored', $r->status === 403 && opt('webhook_secret') === null && opt('site_id') === null && opt('webhook_url') === null);
reset_state(); $arm(1000);
$r = $pair->confirm(new FakeReq(['n' => $NONCE, 'secret' => $KEY, 'site_id' => 'AbC123xyzQ9k', 'server' => 'https://api.maestrolt.com']));
t('number older than 15 minutes: refused', $r->status === 403 && opt('webhook_secret') === null);
reset_state();
$r = $pair->confirm(new FakeReq(['n' => $NONCE, 'secret' => $KEY, 'site_id' => 'AbC123xyzQ9k', 'server' => 'https://api.maestrolt.com']));
t('no number was ever issued by this site: refused', $r->status === 403 && opt('webhook_secret') === null);
reset_state(); $arm();
$r = $pair->confirm(new FakeReq(['n' => $NONCE, 'secret' => 'short', 'site_id' => 'AbC123xyzQ9k', 'server' => 'https://api.maestrolt.com']));
t('short key: refused', $r->status === 400 && opt('webhook_secret') === null);
reset_state(); $arm();
$r = $pair->confirm(new FakeReq(['n' => $NONCE, 'secret' => $KEY, 'site_id' => 'AbC123xyzQ9k', 'server' => 'https://evil.example']));
t('confirm claiming to come from another server: refused, nothing stored, number burned', $r->status === 403 && opt('webhook_secret') === null && opt('webhook_url') === null && get_option('ltp_pair_nonce', null) === null);
reset_state(); $arm();
$r = $pair->confirm(new FakeReq(['n' => $NONCE, 'secret' => $KEY, 'site_id' => "bad id<script>", 'server' => 'https://api.maestrolt.com/']));
t('site id is cleaned; a trailing slash on the server is fine', $r->status === 200 && opt('site_id') === 'badidscript');
reset_state(); $arm();
$r = $pair->confirm(new FakeReq(['n' => $NONCE, 'secret' => str_repeat('A', 40), 'site_id' => 'AbC123xyzQ9k']));
t('old sheet-based confirm (no server field) still works and does NOT touch the server settings', $r->status === 200 && opt('webhook_secret') === str_repeat('A', 40) && opt('webhook_url') === null && opt('pair_source') === null);

// ── طلب الربط من البلجن ──
$server_says = function ($status, $body, $confirm = null) use ($pair, $KEY, $arm) {
  $GLOBALS['http_handler'] = function ($url, $args) use ($status, $body, $confirm, $pair, $KEY) {
    $sent = json_decode($args['body'], true);
    if ($confirm) $pair->confirm(new FakeReq(['n' => $sent['nonce'], 'secret' => $KEY, 'site_id' => 'AbC123xyzQ9k', 'server' => 'https://api.maestrolt.com']));
    return ['response' => ['code' => $status], 'body' => json_encode($body)];
  };
};

reset_state(); $server_says(200, ['ok' => true], true);
$s = LTP_Pair::pair_with_code('k7m2-qx9p');
$h = $GLOBALS['http'][0];
$sent = json_decode($h['args']['body'], true);
t('code pairing succeeds when the server confirms through the site', $s === 'paired' && LTP_Pair::is_paired() && opt('pair_state') === 'paired');
t('request goes to the server pair endpoint, blocking, no redirects', $h['url'] === 'https://api.maestrolt.com/v1/plugin/pair' && $h['args']['blocking'] === true && $h['args']['redirection'] === 0);
t('code is sent clean and upper-case, with the number and this site\'s confirm address', $sent['code'] === 'K7M2QX9P' && $sent['confirm_url'] === 'https://rawda.site/wp-json/lt/v1/pair-confirm' && strlen($sent['nonce']) === 40 && $sent['plugin_version'] === '2.10.0');
t('nothing secret is sent to the server, and no key came back in the reply', !isset($sent['secret']) && !isset($sent['key']) && strpos($h['args']['body'], 'ltk') === false);

foreach ([['', 'bad_code'], ['ABC', 'bad_code'], ['K7M2QX9PX', 'bad_code']] as [$in, $want]) {
  reset_state(); $server_says(200, ['ok' => true], true);
  $s = LTP_Pair::pair_with_code($in);
  t("malformed code «{$in}» is refused locally without any request", $s === $want && count($GLOBALS['http']) === 0 && opt('pair_state') === 'bad_code');
}
foreach ([[404, ['ok' => false, 'error' => 'code'], 'code'], [409, ['ok' => false, 'error' => 'domain_mismatch'], 'domain_mismatch'], [502, ['ok' => false, 'error' => 'site_unreachable'], 'site_unreachable'],
          [400, ['ok' => false, 'error' => 'bad_request'], 'bad_code'], [500, ['x' => 1], 'bad_reply']] as [$st, $body, $want]) {
  reset_state(); $server_says($st, $body, false);
  $s = LTP_Pair::pair_with_code('K7M2-QX9P');
  t("server answer $st → state «{$want}», not paired, number discarded", $s === $want && opt('pair_state') === $want && !LTP_Pair::is_paired() && get_option('ltp_pair_nonce', null) === null);
}
reset_state(); $GLOBALS['http_handler'] = function () { return new WP_Error(); };
$s = LTP_Pair::pair_with_code('K7M2-QX9P');
t('network failure → «network»', $s === 'network' && !LTP_Pair::is_paired());
reset_state(); $server_says(200, ['ok' => true], false);
$s = LTP_Pair::pair_with_code('K7M2-QX9P');
t('server says OK but the confirm never reached this site → «bad_reply», not paired', $s === 'bad_reply' && !LTP_Pair::is_paired());
reset_state(); $GLOBALS['filters']['ltp_server_origin'] = function ($o) { return 'http://insecure.example'; }; $server_says(200, ['ok' => true], true);
LTP_Pair::pair_with_code('K7M2-QX9P');
t('an insecure (http) server override is ignored', strpos($GLOBALS['http'][0]['url'], 'https://api.maestrolt.com/') === 0);
reset_state(); $GLOBALS['filters']['ltp_server_origin'] = function ($o) { return 'https://staging.maestrolt.com/'; }; $server_says(200, ['ok' => true], true);
$pair->confirm(new FakeReq(['n' => 'x', 'secret' => $KEY, 'server' => 'https://api.maestrolt.com']));
t('a staging override is only for the filter and the confirm must then come from it', LTP_Pair::server_origin() === 'https://staging.maestrolt.com');

// ── الرسائل ──
foreach (['code', 'bad_code', 'domain_mismatch', 'site_unreachable', 'no_hub'] as $st) t("message for «{$st}» is specific", strlen(LTP_Pair::state_text($st)) > 30 && strpos(LTP_Pair::state_text($st), 'بيتربط أوتوماتيك') === false);

echo "\n$ok passed, $bad failed\n";
exit($bad ? 1 : 0);
