<?php
// البلجن 2.12.0 — التحديث الأوتوماتيك الموقّع (LTP_Updater) مع الخادم الحقيقي اللي بيبنيه app/build-plugin.mjs.
// بيولّد مفتاح تجربة، ويبني info.json + ZIP بالسكريبت الحقيقي (node)، وبعدين يجرّب البلجن عليه فوق دوال ووردبريس المحاكية.
// التشغيل: php tests/test-plugin-updater.php   (محتاج node و ext-sodium)
error_reporting(E_ALL);
define('ABSPATH', __DIR__ . '/');
define('DAY_IN_SECONDS', 86400);
define('LTP_VERSION', '2.11.3');                       // الموقع لسه على الإصدار اللي قبله
define('LTP_BASENAME', 'lead-tracker-pro/lead-tracker-pro.php');
$TMP = sys_get_temp_dir() . '/ltp-upd-' . getmypid() . '/';
@mkdir($TMP); @mkdir($TMP . 'plugin/');
define('LTP_PATH', $TMP . 'plugin/');

// ── مفتاح تجربة + خادم حقيقي من السكريبت ──
$kp = json_decode(shell_exec('node -e ' . escapeshellarg('const c=require("crypto");const k=c.generateKeyPairSync("ed25519");console.log(JSON.stringify({priv:k.privateKey.export({format:"der",type:"pkcs8"}).toString("base64"),pub:k.publicKey.export({format:"der",type:"spki"}).subarray(12).toString("base64")}))')), true);
if (!$kp) { echo "node missing\n"; exit(1); }
define('LTP_UPDATE_PUBKEY', $kp['pub']);
$OUT = $TMP . 'feed/';
$rel = $TMP . 'release.json';
$ver = null; preg_match("/define\\('LTP_VERSION', '([^']+)'\\)/", file_get_contents(__DIR__ . '/../plugin/lead-tracker-pro/lead-tracker-pro.php'), $m); $ver = $m[1];
file_put_contents($rel, json_encode(['version' => $ver, 'released_at' => gmdate('Y-m-d\TH:i:s\Z', time() - 3600), 'stable_delay_days' => 3, 'notes' => 'test']));
shell_exec('PLUGIN_SIGNING_KEY=' . escapeshellarg($kp['priv']) . ' PLUGIN_EXPECT_PUBKEY=' . escapeshellarg($kp['pub']) . ' node ' . escapeshellarg(__DIR__ . '/../app/build-plugin.mjs') . ' --release ' . escapeshellarg($rel) . ' --out ' . escapeshellarg($OUT));
$FEED = json_decode(file_get_contents($OUT . 'info.json'), true);
$ZIP = $OUT . 'lead-tracker-pro-' . $ver . '.zip';
// مفتاح sodium من نفس المفتاح الخاص (علشان نعمل خوادم مزوّرة/معدّلة في الاختبار)
$der = base64_decode($kp['priv']); $SK = sodium_crypto_sign_secretkey(sodium_crypto_sign_seed_keypair(substr($der, -32)));
$resign = function ($f) use ($SK) { $f['latest']['sig'] = base64_encode(sodium_crypto_sign_detached('lead-tracker-pro|' . $f['latest']['version'] . '|' . $f['latest']['sha256'], $SK)); return $f; };

// ── ووردبريس المحاكي ──
$GLOBALS['opts'] = []; $GLOBALS['tr'] = []; $GLOBALS['filters'] = []; $GLOBALS['remote'] = null; $GLOBALS['gets'] = 0; $GLOBALS['dl'] = null;
function add_filter($t, $cb, $p = 10, $a = 1) { $GLOBALS['filters'][$t] = $cb; }
function add_action(...$a) {}
function get_option($k, $d = false) { return array_key_exists($k, $GLOBALS['opts']) ? $GLOBALS['opts'][$k] : $d; }
function update_option($k, $v, $a = null) { $GLOBALS['opts'][$k] = $v; return true; }
function delete_option($k) { unset($GLOBALS['opts'][$k]); }
function get_transient($k) { return $GLOBALS['tr'][$k] ?? false; }
function set_transient($k, $v, $t = 0) { $GLOBALS['tr'][$k] = $v; return true; }
class WP_Error { public $code; function __construct($c = '', $m = '') { $this->code = $c; } function get_error_message() { return 'err'; } }
function is_wp_error($x) { return $x instanceof WP_Error; }
function wp_remote_get($u, $a) { $GLOBALS['gets']++; $GLOBALS['last_get'] = [$u, $a]; return ($GLOBALS['remote'])($u); }
function wp_remote_retrieve_response_code($r) { return $r['code'] ?? 0; }
function wp_remote_retrieve_body($r) { return $r['body'] ?? ''; }
function download_url($u, $t = 300) { return ($GLOBALS['dl'])($u); }
function wp_parse_url($u, $c = -1) { return parse_url($u, $c); }
function wp_json_encode($v, $f = 0) { return json_encode($v, $f); }

require __DIR__ . '/../plugin/lead-tracker-pro/includes/class-ltp-core.php';
require __DIR__ . '/../plugin/lead-tracker-pro/includes/class-ltp-updater.php';
$U = LTP_Updater::instance();

$ok = 0; $bad = 0;
function t($n, $c) { global $ok, $bad; if ($c) { $ok++; echo "✓ $n\n"; } else { $bad++; echo "✗ $n\n"; } }
function serve($feed) { $GLOBALS['tr'] = []; $GLOBALS['remote'] = function ($u) use ($feed) { return ['code' => 200, 'body' => json_encode($feed)]; }; }
function fresh() { $GLOBALS['opts'] = []; $GLOBALS['tr'] = []; $GLOBALS['gets'] = 0; }
$PLUG = LTP_BASENAME;

// ── 1) الخادم الحقيقي اتبنى وموقّع ──
t('the real build script produced a signed feed for version ' . $ver, empty($FEED['stop']) && is_file($ZIP) && strlen(base64_decode($FEED['latest']['sig'])) === 64);
t('the plugin accepts its signature (same algorithm on both sides: node signs, PHP sodium verifies)', LTP_Updater::signature_ok($FEED['latest']['version'], $FEED['latest']['sha256'], $FEED['latest']['sig']));

// ── 2) العرض على ووردبريس ──
fresh(); update_option('ltp_update_channel', 'early'); serve($FEED);
$r = $U->offer(false, [], $PLUG, []);
t('early channel: the new version is offered with the package from app.maestrolt.com', is_array($r) && $r['version'] === $ver && $r['package'] === $FEED['latest']['package'] && $r['slug'] === 'lead-tracker-pro');
t('the feed is fetched over https, no redirects, short timeout', $GLOBALS['last_get'][0] === 'https://app.maestrolt.com/plugin/info.json' && $GLOBALS['last_get'][1]['redirection'] === 0 && $GLOBALS['last_get'][1]['timeout'] <= 10);
$U->offer(false, [], $PLUG, []); $U->offer(false, [], $PLUG, []);
t('the feed is cached (one request for repeated checks)', $GLOBALS['gets'] === 1);
t('another plugin is never touched', $U->offer('keep', [], 'other/other.php', []) === 'keep');
fresh(); serve($FEED);
t('stable channel (customers, the default): not offered before the delay (3 days)', $U->offer(false, [], $PLUG, []) === false);
t('stable channel: offered after the delay', is_array(LTP_Updater::pick($FEED, time() + 4 * DAY_IN_SECONDS)));

// ── 3) رفض أي حاجة مش موقّعة صح ──
update_option('ltp_update_channel', 'early');
$cases = [
  'a tampered signature' => function ($f) { $s = base64_decode($f['latest']['sig']); $s[5] = chr(ord($s[5]) ^ 1); $f['latest']['sig'] = base64_encode($s); return $f; },
  'a signature for another version' => function ($f) { $f['latest']['version'] = '9.9.9'; return $f; },
  'a different checksum than the signed one' => function ($f) { $f['latest']['sha256'] = str_repeat('a', 64); return $f; },
  'no signature' => function ($f) { unset($f['latest']['sig']); return $f; },
  'the stop switch' => function ($f) { $f['stop'] = true; return $f; },
];
foreach ($cases as $name => $fn) { fresh(); update_option('ltp_update_channel', 'early'); serve($fn($FEED)); t("not offered: $name", $U->offer(false, [], $PLUG, []) === false); }
fresh(); update_option('ltp_update_channel', 'early'); $f = $FEED; $f['latest']['package'] = 'https://evil.example/lead-tracker-pro.zip'; serve($resign($f));
t('not offered: a correctly signed entry pointing outside app.maestrolt.com/plugin/', $U->offer(false, [], $PLUG, []) === false);
fresh(); update_option('ltp_update_channel', 'early'); $f = $FEED; $f['latest']['version'] = '2.0.0'; serve($resign($f));
t('not offered: an older (or same) version, even if signed', $U->offer(false, [], $PLUG, []) === false);
fresh(); update_option('ltp_update_channel', 'early'); $GLOBALS['remote'] = function () { return new WP_Error('http'); };
t('server down: nothing offered, failure cached for half an hour, error noted', $U->offer(false, [], $PLUG, []) === false && !empty($GLOBALS['tr']['ltp_upd_feed']['_failed']) && !empty(LTP_Updater::status()['error']));
fresh(); update_option('ltp_update_channel', 'early'); $GLOBALS['remote'] = function () { return ['code' => 200, 'body' => '<html>hijacked</html>']; };
t('a garbage reply: nothing offered', $U->offer(false, [], $PLUG, []) === false);

// ── 4) قبل التركيب: الملف نفسه لازم يطابق البصمة الموقّعة ──
fresh(); update_option('ltp_update_channel', 'early'); serve($FEED);
$GLOBALS['dl'] = function ($u) use ($ZIP) { $p = tempnam(sys_get_temp_dir(), 'ltpdl'); copy($ZIP, $p); return $p; };
$res = $U->verify_download(false, $FEED['latest']['package']);
t('the genuine package is accepted (its file path is handed to WordPress)', is_string($res) && is_file($res) && hash_file('sha256', $res) === $FEED['latest']['sha256']);
$GLOBALS['dl'] = function ($u) use ($ZIP) { $p = tempnam(sys_get_temp_dir(), 'ltpdl'); $b = file_get_contents($ZIP); $b[200] = chr(ord($b[200]) ^ 1); file_put_contents($p, $b); $GLOBALS['last_dl'] = $p; return $p; };
$res = $U->verify_download(false, $FEED['latest']['package']);
t('a package changed on the way (one byte) is refused and deleted — nothing installed', is_wp_error($res) && $res->code === 'ltp_update_bad_package' && !file_exists($GLOBALS['last_dl']));
$res = $U->verify_download(false, 'https://app.maestrolt.com/plugin/lead-tracker-pro-6.6.6.zip');
t('a package from our host that is not the signed one is refused', is_wp_error($res) && $res->code === 'ltp_update_unverified');
t('other plugins\' downloads are left alone', $U->verify_download(false, 'https://downloads.wordpress.org/plugin/x.zip') === false);
t('an earlier filter\'s answer is respected', $U->verify_download('already', $FEED['latest']['package']) === 'already');

// ── 5) التحديث التلقائي في الخلفية ──
fresh();
t('auto-update is ON by default for this plugin', $U->auto(null, (object) ['plugin' => $PLUG]) === true);
update_option('ltp_auto_update', '0');
t('the customer can switch it off from the settings', $U->auto(null, (object) ['plugin' => $PLUG]) === false);
t('auto-update decisions for other plugins are not touched', $U->auto('x', (object) ['plugin' => 'other/other.php']) === 'x');

// ── 6) نقل config.json لقاعدة البيانات (مرة واحدة) ──
$r = new ReflectionProperty('LTP_Core', 'config_cache'); $r->setAccessible(true);
file_put_contents(LTP_PATH . 'config.json', json_encode(['webhook_url' => 'https://script.google.com/macros/s/AKfyc/exec', 'site_label' => 'روضة', 'server_host' => 'api.maestrolt.com']));
fresh(); $r->setValue(null, null); update_option('ltp_site_label', 'اسم متغيّر يدوياً');
LTP_Updater::migrate_config();
t('config.json values are copied to the database (so a later build without them keeps the site connected)', get_option('ltp_webhook_url') === 'https://script.google.com/macros/s/AKfyc/exec' && get_option('ltp_server_host') === 'api.maestrolt.com');
t('values already set in the database are not overwritten', get_option('ltp_site_label') === 'اسم متغيّر يدوياً');
t('our own build (has the sheet link) goes to the early channel', get_option('ltp_update_channel') === 'early');
update_option('ltp_webhook_url', 'changed-later'); LTP_Updater::migrate_config();
t('it runs only once', get_option('ltp_webhook_url') === 'changed-later');
file_put_contents(LTP_PATH . 'config.json', json_encode(['webhook_url' => '', 'server_host' => 'api.maestrolt.com']));
fresh(); $r->setValue(null, null); LTP_Updater::migrate_config();
t('a customer build stays on the stable channel', get_option('ltp_update_channel', null) === null && LTP_Updater::channel() === 'stable');

// ── 7) المفتاح الحقيقي اللي جوه البلجن ──
t('the plugin ships the real public key (32 bytes)', strlen(base64_decode(LTP_Updater::PUBKEY, true)) === 32);

echo "\n$ok passed, $bad failed\n";
exit($bad ? 1 : 0);
