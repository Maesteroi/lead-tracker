<?php
// البلجن 2.12.2 — تقرير التوصيل: كل ساعة أعداد الأحداث المحلية (النهارده وامبارح) + إحصائية الإرسال ← السيرفر.
// التشغيل: php tests/test-plugin-health.php
error_reporting(E_ALL);
define('ABSPATH', __DIR__ . '/');
define('DAY_IN_SECONDS', 86400);
define('LTP_VERSION', '2.12.2');
define('LTP_PATH', sys_get_temp_dir() . '/ltp-test-empty-h/');
@mkdir(LTP_PATH); @unlink(LTP_PATH . 'config.json');

$GLOBALS['opts'] = []; $GLOBALS['actions'] = []; $GLOBALS['sched'] = []; $GLOBALS['http'] = []; $GLOBALS['code'] = 200; $GLOBALS['paired'] = true;
function add_action($tag, $cb, $pri = 10) { $GLOBALS['actions'][] = [$tag, $cb]; }
function get_option($k, $d = false) { return array_key_exists($k, $GLOBALS['opts']) ? $GLOBALS['opts'][$k] : $d; }
function update_option($k, $v, $a = null) { $GLOBALS['opts'][$k] = $v; return true; }
function delete_option($k) { unset($GLOBALS['opts'][$k]); return true; }
function get_transient($k) { return false; }
function set_transient($k, $v, $t = 0) { return true; }
function wp_next_scheduled($h) { return $GLOBALS['sched'][$h] ?? false; }
function wp_schedule_event($t, $r, $h) { $GLOBALS['sched'][$h] = [$t, $r]; return true; }
function wp_schedule_single_event($t, $h) { $GLOBALS['sched'][$h] = $t; return true; }
function wp_clear_scheduled_hook($h) { unset($GLOBALS['sched'][$h]); }
function wp_parse_url($u, $c = -1) { return parse_url($u, $c); }
function wp_json_encode($v, $f = 0) { return json_encode($v, $f); }
function wp_date($f, $ts = null) { return gmdate($f, ($ts ?? time()) + 3 * 3600); }   // توقيت الموقع: الرياض
class WP_Error { function get_error_message() { return 'x'; } }
function is_wp_error($x) { return $x instanceof WP_Error; }
function wp_remote_retrieve_response_code($r) { return $r['code'] ?? 0; }
function wp_remote_post($url, $args) { $GLOBALS['http'][] = ['url' => $url, 'args' => $args]; return $GLOBALS['code'] === 0 ? new WP_Error() : ['code' => $GLOBALS['code']]; }
class LTP_Pair { static function is_paired() { return $GLOBALS['paired']; } }

require __DIR__ . '/../plugin/lead-tracker-pro/includes/class-ltp-core.php';
require __DIR__ . '/../plugin/lead-tracker-pro/includes/class-ltp-health.php';

$ok = 0; $bad = 0;
function t($n, $c) { global $ok, $bad; if ($c) { $ok++; echo "✓ $n\n"; } else { $bad++; echo "✗ $n\n"; } }
function setup($over = []) {
  $GLOBALS['opts'] = ['ltp_webhook_secret' => 'ltk' . str_repeat('b2', 24), 'ltp_site_id' => 'RAgH4vV49gjd', 'ltp_server_host' => 'api.maestrolt.com', 'ltp_webhook_url' => 'https://api.maestrolt.com/v1/events',
    'ltp_events' => ['2026-11-12|page_view' => 40, '2026-11-12|click' => 6, '2026-11-11|page_view' => 81, '2026-11-11|click' => 23, '2026-11-01|page_view' => 9, 'junk' => 3, '2026-11-12|<b>' => 1],
    'ltp_out_stats' => ['failed_first' => 3, 'recovered' => 2, 'rejected' => 1]];
  foreach ($over as $k => $v) $GLOBALS['opts'][$k] = $v;
  $GLOBALS['http'] = []; $GLOBALS['sched'] = []; $GLOBALS['code'] = 200; $GLOBALS['paired'] = true;
}
$NOW = gmmktime(10, 0, 0, 11, 12, 2026);   // 13:00 بتوقيت الرياض يوم 12

setup();
LTP_Health::init();
t('init hooks the hourly report and the scheduler', count(array_filter($GLOBALS['actions'], fn($a) => $a[0] === 'ltp_health_report')) === 1 && count(array_filter($GLOBALS['actions'], fn($a) => $a[0] === 'init')) === 1);
LTP_Health::schedule();
t('scheduled hourly, first run in ~2 minutes; scheduling twice keeps one', ($GLOBALS['sched']['ltp_health_report'][1] ?? '') === 'hourly' && $GLOBALS['sched']['ltp_health_report'][0] > time() + 60);

$p = LTP_Health::payload($NOW);
t('payload: event ltp_health with the site id and the current key', $p['event'] === 'ltp_health' && $p['site_id'] === 'RAgH4vV49gjd' && $p['secret'] === get_option('ltp_webhook_secret'));
t('payload: today and yesterday in the SITE timezone, only clean event names', array_keys($p['days']) === ['2026-11-12', '2026-11-11'] && $p['days']['2026-11-12'] === ['page_view' => 40, 'click' => 6] && $p['days']['2026-11-11'] === ['page_view' => 81, 'click' => 23]);
t('payload: delivery stats and the plugin version, and nothing about visitors', $p['out']['failed_first'] === 3 && $p['out']['rejected'] === 1 && $p['version'] === '2.12.2' && !isset($p['ip']) && !isset($p['visitor_id']));

setup();
t('server-primary site: reported to the webhook (the server) and marked ok', LTP_Health::report() === true && $GLOBALS['http'][0]['url'] === 'https://api.maestrolt.com/v1/events' && get_option('ltp_health_last')['ok'] === 1);
t('the request is blocking with a timeout and no redirects', $GLOBALS['http'][0]['args']['blocking'] === true && $GLOBALS['http'][0]['args']['redirection'] === 0 && $GLOBALS['http'][0]['args']['timeout'] >= 5);
setup(['ltp_webhook_url' => 'https://script.google.com/macros/s/X/exec', 'ltp_server_mirror' => 1]);
t('sheet-primary site with the server copy on: reported to the server copy URL', LTP_Health::report() === true && $GLOBALS['http'][0]['url'] === LTP_Core::SERVER_URL);
setup(['ltp_webhook_url' => 'https://script.google.com/macros/s/X/exec']);
t('sheet-only site: nothing is sent', LTP_Health::report() === false && $GLOBALS['http'] === []);
setup(); $GLOBALS['paired'] = false;
t('not paired: nothing is sent', LTP_Health::report() === false && $GLOBALS['http'] === []);
setup(); $GLOBALS['code'] = 0;
t('a failure is recorded, nothing thrown', LTP_Health::report() === false && get_option('ltp_health_last')['ok'] === 0);
setup(); LTP_Health::schedule(); LTP_Health::unschedule();
t('unschedule clears the cron', !isset($GLOBALS['sched']['ltp_health_report']));

echo "\n$ok passed, $bad failed\n";
exit($bad ? 1 : 0);
