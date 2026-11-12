<?php
/**
 * Plugin Name:       Lead Tracker Pro
 * Plugin URI:        https://leadtrackerpro.com
 * Description:       تتبع احترافي لكل زيارة ونقرة اتصال/واتساب + تكامل كامل مع WooCommerce (شراء · سلة · دفع). يحفظ في Google Sheet + إشعارات Telegram. بدون GA4 ولا اشتراكات.
 * Version:           2.13.1
 * Requires at least: 5.8
 * Requires PHP:      7.4
 * Update URI:        https://app.maestrolt.com/plugin/
 * Author:            Lead Tracker Pro
 * Author URI:        https://leadtrackerpro.com
 * License:           GPL v2 or later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       lead-tracker-pro
 * Domain Path:       /languages
 */

if (!defined('ABSPATH')) exit;

define('LTP_VERSION', '2.13.1');
define('LTP_FILE', __FILE__);
define('LTP_PATH', plugin_dir_path(__FILE__));
define('LTP_URL', plugin_dir_url(__FILE__));
define('LTP_BASENAME', plugin_basename(__FILE__));

// ═══════════════════════════════════════════════════════════
// تحميل الملفات
// ═══════════════════════════════════════════════════════════
require_once LTP_PATH . 'includes/class-ltp-core.php';
require_once LTP_PATH . 'includes/class-ltp-rest.php';
require_once LTP_PATH . 'includes/class-ltp-tracking.php';
require_once LTP_PATH . 'includes/class-ltp-settings.php';
require_once LTP_PATH . 'includes/class-ltp-consent.php';
require_once LTP_PATH . 'includes/class-ltp-pair.php';
require_once LTP_PATH . 'includes/class-ltp-numbers.php';
require_once LTP_PATH . 'includes/class-ltp-inventory.php';
require_once LTP_PATH . 'includes/class-ltp-roles.php';
require_once LTP_PATH . 'includes/class-ltp-telegram.php';
require_once LTP_PATH . 'includes/class-ltp-updater.php';   // 2.12.0
require_once LTP_PATH . 'includes/class-ltp-health.php';    // 2.12.2: تقرير التوصيل للسيرفر
require_once LTP_PATH . 'includes/class-ltp-replay.php';    // 2.13.0: تسجيل زيارات الإعلان كفيديو (rrweb)

// ─── التكاملات (جديدة في 2.4.0) ───
require_once LTP_PATH . 'includes/class-ltp-woocommerce.php';
require_once LTP_PATH . 'includes/class-ltp-universal.php';

// ═══════════════════════════════════════════════════════════
// التهيئة
// ═══════════════════════════════════════════════════════════
add_action('plugins_loaded', function () {
    LTP_Core::instance();
    LTP_Rest::instance();
    LTP_Tracking::instance();
    LTP_Settings::instance();
    LTP_Consent::instance();
    LTP_Pair::instance();
    LTP_Numbers::instance();
    LTP_Telegram::instance();
    LTP_Pair::maybe_upgrade();
    LTP_Updater::instance();          // 2.12.0: التحديث الأوتوماتيك الموقّع
    LTP_Updater::migrate_config();    // مرة واحدة: قيم config.json تتنسخ لقاعدة البيانات
    LTP_Health::init();               // 2.12.2: كل ساعة: أعداد الأحداث المحلية ← السيرفر (قياس التوصيل)
    LTP_Replay::init();               // 2.13.0: تسجيل زيارات الإعلان كفيديو

    // ─── التكاملات ───
    LTP_WooCommerce::instance();
    LTP_Universal::instance();
});

// ═══════════════════════════════════════════════════════════
// عند التفعيل
// ═══════════════════════════════════════════════════════════
register_activation_hook(__FILE__, function () {
    if (get_option('ltp_installed_at') === false) {
        update_option('ltp_installed_at', current_time('mysql'));
        update_option('ltp_version', LTP_VERSION);
        update_option('ltp_site_id', wp_generate_password(12, false, false));
        update_option('ltp_events', []);
        update_option('ltp_flush_rewrite', 1);
    }

    // تحديث رقم النسخة عند كل تفعيل
    update_option('ltp_version', LTP_VERSION);

    LTP_Pair::on_activate();
});

// ═══════════════════════════════════════════════════════════
// عند إلغاء التفعيل
// ═══════════════════════════════════════════════════════════
register_deactivation_hook(__FILE__, function () {
    wp_clear_scheduled_hook('ltp_daily_flush');
    LTP_Pair::on_deactivate();
    LTP_Health::unschedule();
});

// ═══════════════════════════════════════════════════════════
// رابط الإعدادات في قائمة الإضافات
// ═══════════════════════════════════════════════════════════
add_filter('plugin_action_links_' . LTP_BASENAME, function ($links) {
    $url = admin_url('admin.php?page=lead-tracker-settings');
    array_unshift($links, '<a href="' . esc_url($url) . '">الإعدادات</a>');
    return $links;
});