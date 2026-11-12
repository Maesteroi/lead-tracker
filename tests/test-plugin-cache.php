<?php
// البلجن 2.13.3 — بعد أي تحديث بنمسح كاش الصفحات (اتلقى في الإنجاز 12 نوفمبر: LiteSpeed كان بيقدّم صفحات 2.12.0 بعد التحديث،
// فتسجيل الزيارات ماشتغلش). التشغيل: php tests/test-plugin-cache.php
error_reporting(E_ALL);
define('ABSPATH', __DIR__ . '/');
define('LTP_VERSION', '2.13.3');
define('LTP_PATH', sys_get_temp_dir() . '/ltp-test-empty-c/');
@mkdir(LTP_PATH); @unlink(LTP_PATH . 'config.json');
$GLOBALS['opts'] = []; $GLOBALS['fired'] = []; $GLOBALS['hooked'] = []; $GLOBALS['calls'] = [];
function add_action($tag, $cb, $pri = 10) { $GLOBALS['hooked'][$tag] = true; }
function has_action($tag) { return !empty($GLOBALS['hooked'][$tag]); }
function do_action($tag, ...$a) { $GLOBALS['fired'][] = $tag; }
function get_option($k, $d = false) { return array_key_exists($k, $GLOBALS['opts']) ? $GLOBALS['opts'][$k] : $d; }
function update_option($k, $v, $a = null) { $GLOBALS['opts'][$k] = $v; return true; }
function wp_cache_flush() { $GLOBALS['calls'][] = 'object-cache'; return true; }
function rocket_clean_domain() { $GLOBALS['calls'][] = 'rocket'; }
require __DIR__ . '/../plugin/lead-tracker-pro/includes/class-ltp-core.php';

$ok = 0; $bad = 0;
function t($n, $c) { global $ok, $bad; if ($c) { $ok++; echo "✓ $n\n"; } else { $bad++; echo "✗ $n\n"; } }

// موقع عليه LiteSpeed Cache (بيسجّل الأكشن litespeed_purge_all) + WP Rocket
$GLOBALS['hooked']['litespeed_purge_all'] = true;
$done = LTP_Core::purge_page_cache();
t('LiteSpeed: the official purge-all action is fired', in_array('litespeed_purge_all', $GLOBALS['fired'], true) && in_array('litespeed', $done, true));
t('WP Rocket: rocket_clean_domain() is called', in_array('rocket', $GLOBALS['calls'], true) && in_array('wp-rocket', $done, true));
t('the object cache is flushed too', in_array('object-cache', $GLOBALS['calls'], true));
t('the purge is recorded with the version (for support)', get_option('ltp_cache_purged')['version'] === '2.13.3' && get_option('ltp_cache_purged')['by'] === $done);

// موقع من غير أي إضافة كاش: مفيش حاجة بتتنده غلط
$GLOBALS['hooked'] = []; $GLOBALS['fired'] = [];
$done2 = array_values(array_diff(LTP_Core::purge_page_cache(), ['wp-rocket']));
t('no cache plugin: nothing else is fired, and nothing breaks', $done2 === [] && $GLOBALS['fired'] === []);

// maybe_upgrade: بيمسح بعد تحديث (إصدار قديم موجود)، ومابيمسحش في أول تركيب ولا لو الإصدار زي ما هو
$src = file_get_contents(__DIR__ . '/../plugin/lead-tracker-pro/includes/class-ltp-pair.php');
t('maybe_upgrade purges only after an update (not on a first install, not when the version is unchanged)', strpos($src, "if (\$old !== '') LTP_Core::purge_page_cache();") !== false && strpos($src, "if (\$old === LTP_VERSION) return;") !== false);

echo "\n$ok passed, $bad failed\n";
exit($bad ? 1 : 0);
