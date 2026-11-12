<?php
if (!defined('ABSPATH')) exit;

class LTP_Tracking {

    private static $instance = null;

    public static function instance() {
        if (self::$instance === null) self::$instance = new self();
        return self::$instance;
    }

    private function __construct() {
        add_action('wp_enqueue_scripts', [$this, 'enqueue']);
        add_filter('script_loader_tag', [$this, 'no_optimize'], 10, 2);
        // 2.3.3: أدوات التسريع (LiteSpeed وغيرها) كانت بتأخّر سطر الإعدادات فالتتبع يقف
        add_filter('wp_inline_script_attributes', [$this, 'inline_attrs'], 10, 2);
        add_filter('litespeed_optimize_js_excludes', [$this, 'ls_excludes']);
        add_filter('litespeed_optm_js_defer_exc', [$this, 'ls_excludes']);
        add_filter('litespeed_optm_gm_js_exc', [$this, 'ls_excludes']);
    }

    private $cfg = null;

    public function enqueue() {
        if (is_admin()) return;
        if (is_user_logged_in() && current_user_can('manage_options') && LTP_Core::get('exclude_admin', 0)) return;

        // 2.8.0: بصمة تانية للمقارنة (ThumbmarkJS · MIT · من غير أي اتصال بسيرفرهم)
        wp_enqueue_script('ltp-thumbmark', LTP_URL . 'assets/thumbmark.umd.js', [], '1.12.0', true);
        wp_enqueue_script(
            'ltp-tracker',
            LTP_URL . 'assets/tracker.js',
            [],
            LTP_VERSION,
            true
        );

        $this->cfg = [
            'endpoint' => esc_url_raw(rest_url('lt/v1/event')),
            'pid'      => (int) get_queried_object_id(),
            'greet'    => LTP_Core::get('wa_greeting', 'هلا، أبي أستفسر عن: '),
            'matchOn'  => (int) LTP_Core::get('match_code', 1),
            'consentRequired' => LTP_Consent::required() ? 1 : 0,
            'trackAll' => (int) LTP_Core::get('track_all', 1),
            'version'  => LTP_VERSION,
            // 2.5.0
            'rules'    => self::click_rules(),
            'skipNums' => LTP_Numbers::skip_keys(),   // 2.6.0: أرقام خارجية (زي المطوّر)
            'inv'      => esc_url_raw(rest_url('lt/v1/inventory')),
            // 2.6.4: بيانات المنتج لمشاهدة المنتج من المتصفح
            'prod'     => self::product_info(),
            // 2.6.5: نوع الصفحة (الجرد بيتبعت مرة لكل مجموعة صفحات مش لكل صفحة)
            'pt'       => LTP_Inventory::page_type(),
            // 2.7.0: أهمية كل إجراء (الافتراضي حسب طبيعة النشاط + اختياراتك)
            'roles'    => LTP_Roles::cfg(),
            // 2.8.1: Fingerprint Pro (اختياري، للمقارنة)
            'fpk'      => (string) LTP_Core::get('fpjs_key', ''),
            'fpr'      => (string) LTP_Core::get('fpjs_region', 'us'),
            'fps'      => (string) LTP_Core::get('fpjs_scope', 'ads'),
            // 2.8.2: ThumbmarkJS API (اختياري، للمقارنة)
            'tmk'      => (string) LTP_Core::get('tm_key', ''),
            // 2.13.0: تسجيل زيارات الإعلان كفيديو (rrweb) — null لو الموقع مش على سيرفر Maestro أو مقفول
            'rp'       => class_exists('LTP_Replay') ? LTP_Replay::cfg() : null,
        ];
        // نسخة احتياطية بالطريقة القديمة، والأساس إن الإعدادات ماشية على وسم التتبع نفسه (تحت)
        wp_localize_script('ltp-tracker', 'LTP_CFG', $this->cfg);
    }

    // 2.5.0: قواعد يدوية لعناصر التواصل اللي مااتعرفتش لوحدها — كل سطر: «المحدد = النوع»
    // مثال:  .my-float-btn = wa   ·   #call-box = call
    const RULE_TYPES = ['wa', 'call', 'sms', 'email', 'msg', 'form', 'button', 'cart', 'checkout', 'map', 'social'];

    public static function product_info() {
        if (!function_exists('is_product') || !is_product()) return null;
        $p = wc_get_product(get_queried_object_id());
        if (!$p) return null;
        return [
            'id'    => $p->get_id(),
            'name'  => mb_substr($p->get_name(), 0, 150),
            'price' => (float) $p->get_price(),
            'cat'   => class_exists('LTP_WooCommerce') ? LTP_WooCommerce::main_category($p->get_id()) : '',
            'cur'   => get_woocommerce_currency(),
        ];
    }

    public static function click_rules() {
        $raw = (string) LTP_Core::get('click_rules', '');
        $out = [];
        foreach (preg_split('/\r\n|\r|\n/', $raw) as $line) {
            $line = trim($line);
            if ($line === '' || strpos($line, '=') === false) continue;
            $pos = strrpos($line, '=');
            $sel = trim(substr($line, 0, $pos));
            $ct  = strtolower(trim(substr($line, $pos + 1)));
            if ($sel === '' || strlen($sel) > 200 || !in_array($ct, self::RULE_TYPES, true)) continue;
            $out[] = ['sel' => $sel, 'ct' => $ct];
            if (count($out) >= 30) break;
        }
        return $out;
    }

    public function inline_attrs($attrs, $js) {
        if (isset($attrs['id']) && strpos((string) $attrs['id'], 'ltp-tracker-js') === 0) {
            $attrs['data-no-optimize'] = '1';
            $attrs['data-no-defer']    = '1';
            $attrs['data-cfasync']     = 'false';
        }
        return $attrs;
    }

    // بيرجّع نفس النوع اللي جاله (قايمة أو نص) عشان مايبوّظش إعدادات LiteSpeed
    public function ls_excludes($list) {
        $add = ['lead-tracker-pro/assets/tracker.js', 'lead-tracker-pro/assets/thumbmark.umd.js', 'lead-tracker-pro/assets/rrweb-record.min.js', 'LTP_CFG'];
        if (is_array($list)) return array_merge($list, $add);
        if (is_string($list)) return trim($list . "\n" . implode("\n", $add));
        return $list;
    }

    // LiteSpeed وغيره بيأجّل أو يدمج السكربت فيكسر التتبع: وسوم المنع
    public function no_optimize($tag, $handle) {
        // 2.8.2: البصمة التانية كمان مايتأخرش تحميلها (LiteSpeed كان بيدمجها ويأجلها لحد ما الزائر يلمس الصفحة)
        if ($handle === 'ltp-thumbmark') return str_replace('<script ', '<script data-no-optimize="1" data-no-defer="1" data-no-minify="1" data-cfasync="false" ', $tag);
        if ($handle !== 'ltp-tracker') return $tag;
        $cfg = $this->cfg ? " data-ltp-cfg='" . esc_attr(wp_json_encode($this->cfg)) . "'" : '';
        return str_replace('<script ', '<script data-no-optimize="1" data-no-defer="1" data-no-minify="1" data-cfasync="false"' . $cfg . ' ', $tag);
    }
}