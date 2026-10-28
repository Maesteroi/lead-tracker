<?php
if (!defined('ABSPATH')) exit;

class LTP_Core {

    private static $instance = null;
    private static $config_cache = null;

    const SOURCES = ['maps','google','bing','ai','social','ads','listening','direct','other'];
    const EVENTS  = ['page_view','scroll_50','scroll_90','click','exit','consent','view_item','fp_update'];

    public static function instance() {
        if (self::$instance === null) self::$instance = new self();
        return self::$instance;
    }

    private function __construct() {
        add_action('init', [$this, 'load_textdomain']);
        add_action('wp_ajax_ltp_test_webhook', [$this, 'ajax_test_webhook']);
        add_action('admin_notices', [$this, 'config_notice']);
    }

    public function load_textdomain() {
        load_plugin_textdomain('lead-tracker-pro', false, dirname(LTP_BASENAME) . '/languages');
    }

    // ═══════════════════════════════════════════════════════
    // قراءة config.json
    // ═══════════════════════════════════════════════════════
    public static function load_config() {
        if (self::$config_cache !== null) return self::$config_cache;

        $file = LTP_PATH . 'config.json';
        if (!file_exists($file) || !is_readable($file)) {
            self::$config_cache = [];
            return self::$config_cache;
        }

        $content = file_get_contents($file);
        if ($content === false) {
            self::$config_cache = [];
            return self::$config_cache;
        }

        $data = json_decode($content, true);
        if (!is_array($data)) {
            self::$config_cache = [];
            return self::$config_cache;
        }

        self::$config_cache = $data;
        return self::$config_cache;
    }

    public static function has_config_file() {
        return file_exists(LTP_PATH . 'config.json');
    }

    // ═══════════════════════════════════════════════════════
    // get — ترتيب الأولوية:
    // 1. database (من صفحة الإعدادات) — لو القيمة موجودة ومش فاضية
    // 2. config.json
    // 3. الـ default
    // ═══════════════════════════════════════════════════════
    // 2.9.0 (م.١أ): نسخة من كل حدث للسيرفر الجديد، جنب الشيت (تشغيل موازي). مقفول لحد ما السيرفر يشتغل.
    const SERVER_URL = 'https://api.maestrolt.com/v1/events';
    public static function mirror(array $payload) {
        if (!self::get('server_mirror')) return;
        $url = trim((string) self::get('server_url', self::SERVER_URL));
        if (strpos($url, 'https://') !== 0) return;
        wp_remote_post($url, [
            'blocking'    => false,
            'timeout'     => 3,
            'redirection' => 0,
            'headers'     => ['Content-Type' => 'application/json'],
            'body'        => wp_json_encode($payload, JSON_UNESCAPED_UNICODE),
        ]);
    }

    public static function get($key, $default = '') {
        // 1. جرّب الـ database
        $db_val = get_option('ltp_' . $key, null);
        if ($db_val !== null && $db_val !== '') {
            return $db_val;
        }

        // 2. جرّب الـ config.json
        $config = self::load_config();
        if (isset($config[$key]) && $config[$key] !== '' && $config[$key] !== null) {
            return $config[$key];
        }

        // 3. الـ default
        return $default;
    }

    public static function set($key, $value) {
        update_option('ltp_' . $key, $value);
    }

    // ═══════════════════════════════════════════════════════
    // إشعار للمدير — يوضّح إن الإعدادات من config.json
    // ═══════════════════════════════════════════════════════
    public function config_notice() {
        if (!current_user_can('manage_options')) return;

        $screen = get_current_screen();
        if (!$screen || strpos($screen->id, 'lead-tracker') === false) return;

        // 2.3.4: صاحب الموقع وهو داخل بحسابه مابيتسجلش (عشان ماينحسبش زبون) — نقوله بوضوح عشان مايتلخبطش وهو بيجرّب
        if ((int) self::get('exclude_admin', 0) === 1) {
            echo '<div class="notice notice-info"><p><strong>👤 إنت داخل كمدير:</strong> زياراتك وضغطاتك من المتصفح ده <strong>مش بتتسجّل</strong> (عشان ماتتحسبش زبون). '
               . 'عشان تجرّب: افتح الموقع من <strong>نافذة متخفّية</strong> (Ctrl + Shift + N) أو من الموبايل وإنت مش داخل بحسابك.</p></div>';
        }

        if (!self::has_config_file()) return;
        $config = self::load_config();
        if (empty($config)) return;
        $secret_in_file = !empty($config['webhook_secret']);
        ?>
        <?php if ($secret_in_file): ?>
        <div class="notice notice-warning">
            <p>
                <strong>⚠️ كلمة السر مكتوبة جوه config.json.</strong>
                الأفضل تكتبها من صفحة الإعدادات (بتتحفظ في قاعدة البيانات) وتسيب خانتها فاضية في الملف.
            </p>
        </div>
        <?php endif; ?>
        <?php
    }

    // ═══════════════════════════════════════════════════════
    // هل الموقع وراء كلاود فلير (أو وسيط موثوق)؟ من الإعدادات
    // ═══════════════════════════════════════════════════════
    public static function behind_proxy() {
        return (int) self::get('behind_cloudflare', 0) === 1;
    }

    // ═══════════════════════════════════════════════════════
    // اكتشاف IP
    // الهيدرز (CF / X-Real-IP / X-Forwarded-For) بتتصدّق في حالتين بس:
    //   1) الإعداد "الموقع وراء كلاود فلير" مفعّل
    //   2) عنوان الاتصال المباشر نفسه داخلي/محجوز (يعني فيه وسيط على نفس السيرفر)
    // غير كده أي زائر يقدر يكتب هيدر مزيّف ويتهرب من حدود الاستخدام.
    // ═══════════════════════════════════════════════════════
    public static function ip() {
        $remote = isset($_SERVER['REMOTE_ADDR']) ? trim((string) $_SERVER['REMOTE_ADDR']) : '';
        if (!filter_var($remote, FILTER_VALIDATE_IP)) $remote = '';

        $is_public = $remote !== '' && filter_var(
            $remote, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE
        ) !== false;

        $trust = self::behind_proxy() || !$is_public;
        if ($trust) {
            $keys = self::behind_proxy()
                ? ['HTTP_CF_CONNECTING_IP', 'HTTP_X_REAL_IP', 'HTTP_X_FORWARDED_FOR']
                : ['HTTP_X_REAL_IP', 'HTTP_X_FORWARDED_FOR'];
            foreach ($keys as $k) {
                if (!empty($_SERVER[$k])) {
                    $ip = trim(explode(',', (string) $_SERVER[$k])[0]);
                    if (filter_var($ip, FILTER_VALIDATE_IP)) return $ip;
                }
            }
        }
        return $remote;
    }

    public static function hdr($h) {
        $k = 'HTTP_' . strtoupper(str_replace('-', '_', $h));
        return isset($_SERVER[$k]) ? sanitize_text_field(rawurldecode($_SERVER[$k])) : '';
    }

    // هيدرز كلاود فلير (الدولة/المدينة) مأمونة فقط لو الموقع فعلاً وراءه
    public static function cf_hdr($h) {
        return self::behind_proxy() ? self::hdr($h) : '';
    }

    // ═══════════════════════════════════════════════════════
    // هل رابط الـ Webhook حقيقي؟ (https + جوجل سكريبت + مش قيمة وهمية)
    // ═══════════════════════════════════════════════════════
    public static function webhook_ready($url = null) {
        if ($url === null) $url = self::get('webhook_url');
        $url = is_string($url) ? trim($url) : '';
        if ($url === '' || strpos($url, 'https://') !== 0) return false;
        if (preg_match('/[^\x20-\x7E]/', $url)) return false;            // أي حرف عربي = قيمة وهمية
        $srv = self::server_host();
        if ($srv !== '' && strtolower((string) wp_parse_url($url, PHP_URL_HOST)) === $srv) return true;
        if (!preg_match('~^https://script\.google(usercontent)?\.com/macros/s/[A-Za-z0-9_\-]+/exec/?$~', $url)
            && !has_filter('ltp_allowed_webhook_hosts')) return false;
        $host = strtolower((string) wp_parse_url($url, PHP_URL_HOST));
        $allowed = apply_filters('ltp_allowed_webhook_hosts', ['script.google.com', 'script.googleusercontent.com']);
        return in_array($host, $allowed, true);
    }

    // سيرفرنا (لما نكبر وننقل من جوجل شيت): دومين واحد بيتكتب في الإعدادات «دومين السيرفر»
    public static function server_host() {
        $h = strtolower(trim((string) self::get('server_host', '')));
        $h = preg_replace('~^https?://~', '', $h);
        $h = rtrim(explode('/', $h)[0], '.');
        return preg_match('/^[a-z0-9.-]+\.[a-z]{2,}$/', $h) ? $h : '';
    }

    public static function ua_info($ua) {
        $device = preg_match('/iPad|Tablet/i', $ua) ? 'تابلت'
                : (preg_match('/Mobi|Android|iPhone/i', $ua) ? 'موبايل' : 'كمبيوتر');

        $os = 'أخرى';
        foreach (['iPhone|iPad|iOS'=>'iOS','Android'=>'Android','Windows'=>'Windows','Mac OS'=>'Mac','Linux'=>'Linux'] as $re => $n) {
            if (preg_match("~$re~i", $ua)) { $os = $n; break; }
        }

        $browser = 'أخرى';
        foreach ([
            'Instagram'                 => 'Instagram (داخل التطبيق)',
            'FBAN|FBAV|FB_IAB'          => 'Facebook (داخل التطبيق)',
            'TikTok|BytedanceWebview'   => 'TikTok (داخل التطبيق)',
            'Snapchat'                  => 'Snapchat (داخل التطبيق)',
            'SamsungBrowser'            => 'Samsung Internet',
            'Edg/'                      => 'Edge',
            'OPR/|Opera'                => 'Opera',
            'CriOS|Chrome'              => 'Chrome',
            'FxiOS|Firefox'             => 'Firefox',
            'Safari'                    => 'Safari',
        ] as $re => $n) {
            if (preg_match("~$re~i", $ua)) { $browser = $n; break; }
        }

        return [$device, $os, $browser];
    }

    // زواحف معروفة (محركات بحث · فحص سرعة · معاينة روابط): بتتشال، مالهاش علاقة بالإعلان
    public static function is_bot($ua) {
        if ($ua === '') return true;
        return (bool) preg_match('/bot|crawl|spider|slurp|lighthouse|pagespeed|preview|monitoring|uptime/i', $ua);
    }

    // متصفح آلي (برنامج بيقلّد زائر): مابيتشالش لو جاي من إعلان — ده دليل في طلب الاسترداد
    public static function is_automation($ua) {
        if ($ua === '') return true;
        return (bool) preg_match('/headless|python|curl|wget|phantom|selenium|puppeteer|playwright|scrapy|go-http|okhttp|java\//i', $ua);
    }

    public static function source_ar($s) {
        $map = [
            'maps'      => 'خرائط جوجل',
            'google'    => 'جوجل',
            'bing'      => 'بينج/محرك آخر',
            'ai'        => 'ذكاء اصطناعي',
            'social'    => 'سوشيال ميديا',
            'ads'       => 'إعلان مدفوع',
            'listening' => 'رصد اجتماعي',
            'direct'    => 'مباشر',
            'other'     => 'موقع آخر',
        ];
        return $map[$s] ?? $s;
    }

    public function ajax_test_webhook() {
        check_ajax_referer('ltp_test', 'nonce');
        if (!current_user_can('manage_options')) wp_send_json_error(['msg' => 'ممنوع']);

        $url    = self::get('webhook_url');
        $secret = self::get('webhook_secret');
        $site   = self::get('site_label', get_bloginfo('name'));

        if (!$url) wp_send_json_error(['msg' => '❌ Webhook URL فارغ']);
        if (!self::webhook_ready($url)) {
            wp_send_json_error(['msg' => '❌ الرابط مش صحيح — لازم يبدأ بـ https://script.google.com/ وينتهي بـ /exec (مش القيمة المؤقتة)']);
        }

        $payload = [
            'secret'  => $secret,
            'site'    => $site,
            'site_id' => self::get('site_id'),
            'event'   => 'test',
            'time'    => current_time('mysql'),
            'title'   => 'اختبار من لوحة التحكم',
            'url'     => home_url('/'),
        ];

        // 2.3.4: جوجل بيشغّل الكود وبعدين يحوّل لصفحة النتيجة (302). ووردبريس لو اتبع التحويل بنفسه
        // بيبعت طلب غلط فجوجل يرد 400 مع إن الاختبار نجح. فبنقف عند التحويل ونقرا النتيجة بطلب عادي.
        $res = wp_remote_post($url, [
            'timeout'     => 20,
            'redirection' => 0,
            'blocking'    => true,
            'headers'     => ['Content-Type' => 'application/json'],
            'body'        => wp_json_encode($payload),
        ]);

        if (is_wp_error($res)) {
            wp_send_json_error(['msg' => '❌ مش قادر يوصل للشيت: ' . $res->get_error_message()]);
        }

        $code = (int) wp_remote_retrieve_response_code($res);
        $body = trim((string) wp_remote_retrieve_body($res));

        if (in_array($code, [301, 302, 303, 307, 308], true)) {
            $loc  = (string) wp_remote_retrieve_header($res, 'location');
            $body = '';
            if ($loc !== '' && preg_match('~^https://script\.google(usercontent)?\.com/~', $loc)) {
                $r2 = wp_remote_get($loc, ['timeout' => 15, 'redirection' => 3]);
                if (!is_wp_error($r2)) $body = trim((string) wp_remote_retrieve_body($r2));
            }
            $code = 200;
        }

        if ($code === 200 && stripos($body, 'forbidden') !== false) {
            wp_send_json_error(['msg' => '❌ الشيت رفض الاختبار: الموقع مش مربوط، أو اتوقف من الشيت الرئيسي']);
        }
        if ($code === 200) {
            wp_send_json_success(['msg' => '✅ نجح — الشيت استلم الاختبار، ولو تيليجرام متظبّط هيوصلك «اختبار ناجح»']);
        }
        wp_send_json_error(['msg' => '❌ الشيت رد بخطأ (رقم ' . $code . ')']);
    }
}