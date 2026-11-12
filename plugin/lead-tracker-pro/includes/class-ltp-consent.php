<?php
if (!defined('ABSPATH')) exit;

class LTP_Consent {

    private static $instance = null;

    public static function instance() {
        if (self::$instance === null) self::$instance = new self();
        return self::$instance;
    }

    private function __construct() {
        add_action('wp_enqueue_scripts', [$this, 'assets']);
        add_action('wp_footer', [$this, 'banner'], 100);
    }

    public function assets() {
        if (is_admin()) return;
        if (LTP_Core::get('consent_enabled', 0) == 0) return;

        wp_enqueue_style(
            'ltp-consent',
            LTP_URL . 'assets/consent.css',
            [],
            LTP_VERSION
        );
    }

    // هل الموقع محتاج بانر موافقة؟ (لو مش مفعّل، الموقع بيتصرف في الموافقة بطريقته)
    public static function required() {
        return (int) LTP_Core::get('consent_enabled', 0) === 1;
    }

    public function banner() {
        if (is_admin()) return;
        if (LTP_Core::get('consent_enabled', 0) == 0) return;
        ?>
<div id="ltp-cookie-banner" role="dialog" aria-label="إشعار الكوكيز" style="display:none">
    <div class="ltp-cb-text">
        نقيس زيارات الموقع وأداء إعلاناتنا لنحسّن خدمتنا. إذا وافقت نسجّل بيانات جهازك العامة،
        وإذا رفضت نسجّل الزيارة فقط دون بيانات جهازك. يُحفظ اختيارك ويمكنك تغييره في أي وقت. اقرأ
        <a href="<?php echo esc_url(get_privacy_policy_url() ?: home_url('/privacy-policy')); ?>" target="_blank">سياسة الخصوصية</a>.
    </div>
    <div class="ltp-cb-buttons">
        <button type="button" id="ltp-cb-settings">إعدادات</button>
        <button type="button" id="ltp-cb-reject">رفض</button>
        <button type="button" id="ltp-cb-accept">موافق</button>
    </div>
</div>

<div id="ltp-cb-modal" style="display:none">
    <div class="ltp-cb-modal-content">
        <h3>تفضيلات الكوكيز</h3>
        <label><span>أساسية (إلزامية)</span><input type="checkbox" checked disabled></label>
        <label><span>تحليلية (إحصاءات)</span><input type="checkbox" id="ltp-cb-analytics"></label>
        <label><span>إعلانية (تتبع الحملات)</span><input type="checkbox" id="ltp-cb-ads"></label>
        <button type="button" id="ltp-cb-save">حفظ التفضيلات</button>
    </div>
</div>
        <?php
    }
}