<?php
if (!defined('ABSPATH')) exit;

/**
 * الربط الأوتوماتيك (2.3.0)
 * العميل يرفع البلجن ويفعّله وبس. البلجن يكلّم الاستقبال لوحده:
 *   1) البلجن ← الاستقبال: «أنا موقع كذا» + رقم مؤقت (n) محفوظ عندنا بس
 *   2) الاستقبال ← نفس الموقع (pair-confirm): يبعت المفتاح ومعاه نفس الرقم
 *      ⇒ لو حد ادّعى إنه موقع تاني، الموقع الحقيقي مش هيلاقي الرقم عنده فيرفض
 *   3) البلجن يحفظ المفتاح. لو التأكيد ماوصلش (حماية على الموقع): «مستني تأكيد» عند محمود
 * لو مااتربطش: بيحاول تاني لوحده كل ساعة.
 *
 * 2.10.0 (S03، الخيار ب): ربط بكود قصير على سيرفر Maestro LT نفسه (مش الشيت):
 *   1) العميل يكتب الكود (8 حروف) اللي طلع له في لوحة Maestro
 *   2) البلجن ← السيرفر: «الكود ده + الرقم المؤقت (n) + عنوان التأكيد بتاع موقعي»
 *   3) السيرفر يتأكد من الكود ومن إن العنوان تابع لدومين الموقع المسجّل، وبعدين يبعت المفتاح للموقع نفسه (pair-confirm)
 *      مع نفس الرقم المؤقت. المفتاح مابيرجعش في رد الطلب أبداً.
 *
 * 2.11.0 (S03): زرار «اربط بـ Maestro LT» (3 ضغطات، من غير نسخ ولصق):
 *   1) العميل يضغط الزرار ← البلجن يحفظ رقم مؤقت (n) ويفتح app.maestrolt.com/connect (البيانات في الجزء بعد # فمابتوصلش لأي سيرفر ولا لوج)
 *   2) العميل يسجّل دخول بجوجل (لو مش داخل) ويضغط «نعم، اربط» على كارت فيه دومين الموقع
 *   3) السيرفر يبعت المفتاح للموقع نفسه (pair-confirm) بنفس الرقم، ويرجّع العميل للوحة ووردبريس
 *   الدومين بييجي من عنوان التأكيد نفسه، فلازم الموقع نفسه يرد بالرقم علشان يتربط.
 */
class LTP_Pair {

    private static $instance = null;
    const NONCE_TTL = 900; // 15 دقيقة
    const SERVER_ORIGIN = 'https://api.maestrolt.com';
    const APP_ORIGIN = 'https://app.maestrolt.com';

    public static function instance() {
        if (self::$instance === null) self::$instance = new self();
        return self::$instance;
    }

    private function __construct() {
        add_action('rest_api_init', [$this, 'routes']);
        add_action('admin_init', [$this, 'maybe_pair_now']);
        add_action('ltp_autopair', [$this, 'cron_pair']);
        add_action('ltp_autopair_now', [$this, 'cron_pair']);
        add_action('admin_post_ltp_pair_now', [$this, 'pair_now_button']);
        add_action('admin_post_ltp_pair_code', [$this, 'pair_code_button']);
        add_action('admin_post_ltp_connect', [$this, 'connect_button']);
        add_action('admin_notices', [$this, 'notice']);
    }

    public static function is_paired() {
        return LTP_Core::webhook_ready() && LTP_Core::get('webhook_secret') !== '';
    }

    // بيتنده من التفعيل ومن التحديث: نحاول دلوقتي، ونجدول محاولة كل ساعة لحد ما يتربط
    public static function on_activate() {
        if (self::is_paired()) return;
        update_option('ltp_pair_due', 1, false);
        if (!wp_next_scheduled('ltp_autopair')) {
            wp_schedule_event(time() + 60, 'hourly', 'ltp_autopair');
        }
    }

    // 2.3.1: التحديث فوق نسخة قديمة مابيشغّلش «التفعيل» في ووردبريس ⇒ بنكتشف تغيّر الإصدار بنفسنا
    // (بيشتغل مع أي زيارة للموقع، مش لازم حد يفتح لوحة التحكم)
    public static function maybe_upgrade() {
        $old = (string) get_option('ltp_version', '');
        if ($old === LTP_VERSION) return;
        update_option('ltp_version', LTP_VERSION);
        // 2.3.2: قرار محمود — كل الزيارات بتتسجل بالتفصيل على كل المواقع
        if ($old === '' || version_compare($old, '2.3.2', '<')) update_option('ltp_track_all', 1);
        self::on_activate();
        if ($old !== '') LTP_Core::purge_page_cache();   // 2.13.3: الصفحات المتخزنة فيها سكريبت الإصدار القديم
    }

    // محاولة في الخلفية: بتتجدول دلوقتي وتشتغل في طلب منفصل (مابتأخّرش الصفحة ولا الزائر)
    public static function kick() {
        if (self::is_paired() || get_transient('ltp_pair_lock') || get_transient('ltp_pair_kick')) return;
        set_transient('ltp_pair_kick', 1, 300);
        if (!wp_next_scheduled('ltp_autopair_now')) wp_schedule_single_event(time(), 'ltp_autopair_now');
        if (function_exists('spawn_cron')) spawn_cron();
    }

    public static function on_deactivate() {
        wp_clear_scheduled_hook('ltp_autopair');
    }

    // ─── المسار اللي الاستقبال بيأكد عليه ───
    public function routes() {
        register_rest_route('lt/v1', '/pair-confirm', [
            'methods'             => 'POST',
            'callback'            => [$this, 'confirm'],
            'permission_callback' => '__return_true',
        ]);
    }

    public function confirm($r) {
        $p = $r->get_json_params();
        if (!is_array($p)) $p = [];
        $n      = (string) ($p['n'] ?? '');
        $stored = get_option('ltp_pair_nonce', []);
        $fresh  = is_array($stored) && !empty($stored['n']) && (time() - (int) ($stored['t'] ?? 0)) < self::NONCE_TTL;

        if (!$fresh || $n === '' || !hash_equals((string) $stored['n'], $n)) {
            return new WP_REST_Response(['ok' => false], 403);
        }
        $secret = preg_replace('/[^A-Za-z0-9]/', '', (string) ($p['secret'] ?? ''));
        if (strlen($secret) < 32) return new WP_REST_Response(['ok' => false], 400);

        // 2.10.0: لو التأكيد جاي من سيرفر Maestro، لازم يكون السيرفر المعروف للبلجن بالظبط (مش أي عنوان)
        $server = isset($p['server']) ? rtrim((string) $p['server'], '/') : '';
        if ($server !== '' && !hash_equals(self::server_origin(), $server)) {
            delete_option('ltp_pair_nonce');
            return new WP_REST_Response(['ok' => false], 403);
        }

        self::store($secret, $p, $server !== '');
        delete_option('ltp_pair_nonce');
        return new WP_REST_Response(['ok' => true, 'site_id' => LTP_Core::get('site_id')], 200);
    }

    // عنوان السيرفر المعروف. بيتغيّر بفلتر للتجربة بس، وبيتقبل https بس
    public static function server_origin() {
        $o = rtrim((string) apply_filters('ltp_server_origin', self::SERVER_ORIGIN), '/');
        return strpos($o, 'https://') === 0 ? $o : self::SERVER_ORIGIN;
    }

    // عنوان اللوحة (بيتغيّر بفلتر للتجربة بس، وبيتقبل https بس)
    public static function app_origin() {
        $o = rtrim((string) apply_filters('ltp_app_origin', self::APP_ORIGIN), '/');
        return strpos($o, 'https://') === 0 ? $o : self::APP_ORIGIN;
    }

    // رابط زرار الربط: بيحفظ الرقم المؤقت ويبني عنوان اللوحة. البيانات في الجزء بعد # (مابتتبعتش في أي طلب).
    public static function connect_url() {
        $n = wp_generate_password(40, false, false);
        update_option('ltp_pair_nonce', ['n' => $n, 't' => time()], false);
        LTP_Core::set('pair_tried_at', current_time('mysql'));
        set_transient('ltp_pair_lock', 1, self::NONCE_TTL);   // مايتجرّبش ربط الشيت القديم في الخلفية أثناء ما العميل بيربط (كان هيبدّل الرقم)
        $frag = http_build_query([
            'c' => rest_url('lt/v1/pair-confirm'),
            'n' => $n,
            'r' => admin_url('admin.php?page=lead-tracker-settings&connected=1'),
            's' => (string) get_bloginfo('name'),
            'v' => LTP_VERSION,
        ], '', '&', PHP_QUERY_RFC3986);
        return self::app_origin() . '/connect#' . $frag;
    }

    public function connect_button() {
        if (!current_user_can('manage_options')) wp_die('غير مسموح');
        check_admin_referer('ltp_connect');
        wp_redirect(self::connect_url());     // خارجي بالقصد: لوحة Maestro LT
        exit;
    }

    // 2.11.3: مربوط بس بالطريقة القديمة (الشيت)، مش بسيرفر Maestro
    public static function legacy_paired() {
        return self::is_paired() && (string) LTP_Core::get('pair_source', '') !== 'server';
    }

    public static function connect_link() {
        return wp_nonce_url(admin_url('admin-post.php?action=ltp_connect'), 'ltp_connect');
    }

    private static function store($secret, $p, $server_mode = false) {
        if ($server_mode) {
            // الموقع بقى بيبعت للسيرفر مباشرة (من غير الشيت): العنوان ودومينه، ومن غير نسخة تانية للسيرفر
            $o = self::server_origin();
            LTP_Core::set('server_host', (string) wp_parse_url($o, PHP_URL_HOST));
            LTP_Core::set('webhook_url', $o . '/v1/events');
            LTP_Core::set('server_mirror', 0);
            LTP_Core::set('pair_source', 'server');
        }
        LTP_Core::set('webhook_secret', $secret);
        $sid = preg_replace('/[^A-Za-z0-9_-]/', '', (string) ($p['site_id'] ?? ''));
        if ($sid !== '') LTP_Core::set('site_id', $sid);               // نفس الموقع اتركّب تاني ← يكمّل على بياناته القديمة
        $label = sanitize_text_field((string) ($p['label'] ?? ''));
        if ($label !== '' && get_option('ltp_site_label', '') === '') LTP_Core::set('site_label', $label);
        LTP_Core::set('paired_at', current_time('mysql'));
        LTP_Core::set('pair_state', 'paired');
        delete_option('ltp_pair_due');
        wp_clear_scheduled_hook('ltp_autopair');
    }

    // ─── المحاولة ───
    public static function attempt($from_admin = false) {
        if (self::is_paired()) return 'paired';
        $hub = (string) LTP_Core::get('webhook_url');
        if (!LTP_Core::webhook_ready($hub)) { LTP_Core::set('pair_state', 'no_hub'); return 'no_hub'; }

        $site_id = (string) LTP_Core::get('site_id');
        if ($site_id === '') {
            $site_id = wp_generate_password(12, false, false);
            LTP_Core::set('site_id', $site_id);
        }

        $n = wp_generate_password(40, false, false);
        update_option('ltp_pair_nonce', ['n' => $n, 't' => time()], false);
        LTP_Core::set('pair_tried_at', current_time('mysql'));

        // كلاود فلير بيتعرف من طلب المدير نفسه (في المحاولة اللي بتحصل لوحدها كل ساعة مفيش هيدرز)
        if ($from_admin && !empty($_SERVER['HTTP_CF_RAY']) && !empty($_SERVER['HTTP_CF_CONNECTING_IP'])) {
            LTP_Core::set('behind_cloudflare', 1);
        }

        // بلوكنج + بيتبع التحويل: جوجل بيرد بتحويل 302، و ووردبريس بيكمّله كـGET ويجيب الرد
        $res = wp_remote_post($hub, [
            'timeout'     => 30,
            'blocking'    => true,
            'redirection' => 5,
            'headers'     => ['Content-Type' => 'application/json'],
            'body'        => wp_json_encode([
                'event'      => 'pair',
                'n'          => $n,
                'site_id'    => $site_id,
                'home_url'   => home_url('/'),
                'confirm_url'=> rest_url('lt/v1/pair-confirm'),
                'site'       => get_bloginfo('name'),
                'version'    => LTP_VERSION,
            ]),
        ]);

        // التأكيد ممكن يكون وصل وحفظ المفتاح أثناء الطلب ده
        wp_cache_delete('ltp_webhook_secret', 'options');
        wp_cache_delete('alloptions', 'options');
        if (self::is_paired()) return 'paired';

        if (is_wp_error($res)) { LTP_Core::set('pair_state', 'network'); return 'network'; }
        $j = json_decode(wp_remote_retrieve_body($res), true);
        if (!is_array($j)) { LTP_Core::set('pair_state', 'bad_reply'); return 'bad_reply'; }

        // الحالة المستنية تأكيد محمود: بعد ما يوافق، الاستقبال بيرجّع المفتاح هنا مباشرة
        if (!empty($j['ok']) && !empty($j['secret'])) {
            $secret = preg_replace('/[^A-Za-z0-9]/', '', (string) $j['secret']);
            if (strlen($secret) >= 32) { self::store($secret, $j); return 'paired'; }
        }
        $state = preg_replace('/[^a-z_]/', '', (string) ($j['status'] ?? $j['error'] ?? 'server'));
        LTP_Core::set('pair_state', $state ?: 'server');
        if ($state === 'disabled') wp_clear_scheduled_hook('ltp_autopair');
        return $state;
    }

    // أي صفحة في لوحة التحكم: نعرف كلاود فلير من طلب المدير، والمحاولة نفسها في الخلفية (2.3.2: مابتأخّرش الصفحة)
    public function maybe_pair_now() {
        if (wp_doing_ajax() || wp_doing_cron() || self::is_paired()) return;
        if (!current_user_can('activate_plugins')) return;
        if (!empty($_SERVER['HTTP_CF_RAY']) && !empty($_SERVER['HTTP_CF_CONNECTING_IP'])) LTP_Core::set('behind_cloudflare', 1);
        self::kick();
    }

    public function cron_pair() {
        if (self::is_paired()) { wp_clear_scheduled_hook('ltp_autopair'); return; }
        if (get_transient('ltp_pair_lock')) return;
        set_transient('ltp_pair_lock', 1, 600);
        self::attempt(false);
    }

    public function pair_now_button() {
        if (!current_user_can('manage_options')) wp_die('غير مسموح');
        check_admin_referer('ltp_pair_now', '_ltp_pair_nonce');
        delete_transient('ltp_pair_lock');
        $s = self::attempt(true);
        wp_safe_redirect(admin_url('admin.php?page=lead-tracker-settings&pairtry=' . rawurlencode($s)));
        exit;
    }

    // ─── 2.10.0: ربط بكود من لوحة Maestro (السيرفر الجديد) ───
    // بيرجّع الحالة: paired · code · bad_code · domain_mismatch · site_unreachable · network · bad_reply
    public static function pair_with_code($code) {
        $code = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string) $code));
        if (strlen($code) !== 8) { LTP_Core::set('pair_state', 'bad_code'); return 'bad_code'; }

        $n = wp_generate_password(40, false, false);
        update_option('ltp_pair_nonce', ['n' => $n, 't' => time()], false);
        LTP_Core::set('pair_tried_at', current_time('mysql'));

        // بلوكنج: السيرفر بيكلّم الموقع نفسه (pair-confirm) أثناء الطلب ده، فالمفتاح بيتحفظ قبل ما الرد يرجع
        $res = wp_remote_post(self::server_origin() . '/v1/plugin/pair', [
            'timeout'     => 30,
            'blocking'    => true,
            'redirection' => 0,
            'headers'     => ['Content-Type' => 'application/json'],
            'body'        => wp_json_encode([
                'code'           => $code,
                'nonce'          => $n,
                'confirm_url'    => rest_url('lt/v1/pair-confirm'),
                'plugin_version' => LTP_VERSION,
            ]),
        ]);
        wp_cache_delete('ltp_webhook_secret', 'options');
        wp_cache_delete('alloptions', 'options');

        if (is_wp_error($res)) { delete_option('ltp_pair_nonce'); LTP_Core::set('pair_state', 'network'); return 'network'; }
        $status = (int) wp_remote_retrieve_response_code($res);
        $j = json_decode(wp_remote_retrieve_body($res), true);
        if ($status === 200 && is_array($j) && !empty($j['ok'])) {
            if (self::is_paired()) return 'paired';           // التأكيد وصل وحفظ المفتاح
            LTP_Core::set('pair_state', 'bad_reply');          // السيرفر قال تمام والموقع ماحفظش: حاجة غلط في الاتصال
            return 'bad_reply';
        }
        delete_option('ltp_pair_nonce');
        $err = is_array($j) ? preg_replace('/[^a-z_]/', '', (string) ($j['error'] ?? '')) : '';
        $state = ['code' => 'code', 'domain_mismatch' => 'domain_mismatch', 'site_unreachable' => 'site_unreachable', 'bad_request' => 'bad_code'][$err] ?? 'bad_reply';
        LTP_Core::set('pair_state', $state);
        return $state;
    }

    public function pair_code_button() {
        if (!current_user_can('manage_options')) wp_die('غير مسموح');
        check_admin_referer('ltp_pair_code', '_ltp_pc_nonce');
        $s = self::pair_with_code(sanitize_text_field(wp_unslash($_POST['pair_code'] ?? '')));
        wp_safe_redirect(admin_url('admin.php?page=lead-tracker-settings&pairtry=' . rawurlencode($s)));
        exit;
    }

    public static function state_text($s) {
        $map = [
            'paired'    => '✅ مربوط',
            'pending'   => '⏳ سُجّل، وينتظر تأكيدًا من مقدّم الخدمة (منعت حماية على الموقع التأكيد التلقائي).',
            'disabled'  => '⛔ هذا الموقع موقوف من مقدّم الخدمة.',
            'no_hub'    => '⚪ لم يُربط بعد. انقر «اربط بـ Maestro LT» (أو اكتب رمز الربط إذا كان لديك رمز).',
            'code'      => '❌ الرمز خاطئ أو منتهٍ أو مستخدَم. اطلب رمزًا جديدًا من لوحة Maestro LT (صالح لمدة 15 دقيقة)، أو انقر «اربط بـ Maestro LT».',
            'bad_code'  => '❌ الرمز مكتوب بشكل خاطئ: يجب أن يتكون من 8 حروف وأرقام (مثل K7M2-QX9P).',
            'domain_mismatch' => '❌ نطاق هذا الموقع لا يطابق النطاق المسجّل لموقعك في لوحة Maestro LT.',
            'site_unreachable' => '❌ تعذّر على خادم Maestro الوصول إلى موقعك لتأكيد الربط. غالبًا توجد إضافة أمان أو جدار حماية يمنع REST API (المسار /wp-json/lt/v1/pair-confirm). اسمح به وحاول مرة أخرى بالرمز نفسه (ما زال صالحًا).',
            'network'   => '🔄 تعذّر الوصول إلى الاستقبال — سنحاول تلقائيًا كل ساعة.',
            'bad_reply' => '🔄 رد الاستقبال غير مفهوم — سنحاول تلقائيًا كل ساعة.',
            'busy'      => '🔄 محاولات كثيرة في الوقت نفسه — سنحاول تلقائيًا كل ساعة.',
        ];
        return $map[$s] ?? '🔄 جارٍ الربط تلقائيًا — سنحاول كل ساعة.';
    }

    public function notice() {
        if (!current_user_can('manage_options') || self::is_paired()) return;
        $screen = function_exists('get_current_screen') ? get_current_screen() : null;
        if ($screen && strpos((string) $screen->id, 'lead-tracker') !== false) return;
        $s = (string) LTP_Core::get('pair_state', '');
        // 2.11.0: بعد التفعيل دايماً بنعرض الزرار (3 ضغطات للربط)، ومعاه سبب آخر فشل لو فيه
        echo '<div class="notice notice-info"><p><strong>Lead Tracker Pro:</strong> '
            . ($s !== '' && $s !== 'no_hub' ? esc_html(self::state_text($s)) . ' ' : 'بقيت خطوة واحدة: اربط الموقع بحسابك على Maestro LT. ')
            . '<a class="button button-primary" href="' . esc_url(self::connect_link()) . '">اربط بـ Maestro LT</a></p></div>';
    }

    // كارت الحالة في صفحة الإعدادات (مفيش حاجة تتكتب)
    public static function box() {
        $paired = self::is_paired();
        $s = $paired ? 'paired' : (string) LTP_Core::get('pair_state', '');
        ?>
        <div class="ltp-card" style="border-right:4px solid <?php echo $paired ? '#00a32a' : '#dba617'; ?>;">
            <h3>🔗 الربط</h3>
            <p><?php echo esc_html(self::state_text($s)); ?>
                <?php if ($paired && LTP_Core::get('paired_at') !== '') echo ' · منذ ' . esc_html(LTP_Core::get('paired_at')); ?>
            </p>
            <?php if (!$paired): ?>
                <?php // 2.11.0: الطريق الأساسي: زرار واحد ?>
                <p style="margin:14px 0;"><a class="button button-primary button-hero" href="<?php echo esc_url(self::connect_link()); ?>">🔗 اربط بـ Maestro LT</a></p>
                <p class="description">ستسجّل الدخول بحساب جوجل (إذا لم تكن مسجّلًا) ثم تنقر «نعم، اربط». دون نسخ أو لصق.</p>
            <?php elseif (self::legacy_paired()): ?>
                <?php // 2.11.3: موقع مربوط بالشيت القديم: نفس الزرار ينقله للسيرفر ?>
                <p style="margin:14px 0;"><a class="button button-primary" href="<?php echo esc_url(self::connect_link()); ?>">🔗 انقل الربط إلى Maestro LT</a></p>
                <p class="description">⚠️ بعد النقل تذهب الأحداث إلى خادم Maestro LT فقط، ويتوقف الجدول القديم لهذا الموقع.</p>
            <?php elseif (isset($_GET['connected'])): ?>
                <p style="color:#00a32a;"><strong>✅ رُبط الموقع بحسابك على Maestro LT.</strong></p>
            <?php endif; ?>
            <?php $o = LTP_Core::out_status(); if ($paired && ($o['failed_first'] || $o['queued'] || $o['rejected'] || $o['dropped'])): ?>
                <p class="description">📡 الإرسال إلى الخادم: فشل في المحاولة الأولى <?php echo (int) $o['failed_first']; ?> · نجح بإعادة المحاولة <?php echo (int) $o['recovered']; ?> · في قائمة الانتظار <?php echo (int) $o['queued']; ?> · مُسقَط <?php echo (int) $o['dropped']; ?> · مرفوض <?php echo (int) $o['rejected']; ?><?php if ($o['last_error'] !== '') echo ' · آخر خطأ: ' . esc_html($o['last_error']) . ' (' . esc_html($o['last_error_at']) . ' UTC)'; ?></p>
            <?php endif; ?>
            <?php // 2.10.0: الربط بكود من لوحة Maestro LT (بديل لو الزرار ماينفعش) ?>
            <details><summary><?php echo $paired ? 'ربط برمز جديد من لوحة Maestro LT' : 'لديّ رمز ربط بدل الزر'; ?></summary>
            <?php if ($paired): ?><p class="description">⚠️ إذا كان الموقع مربوطًا بالجدول، فالربط بالرمز يجعل الأحداث تذهب إلى الخادم الجديد فقط.</p><?php endif; ?>
            <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" style="margin:10px 0;">
                <input type="hidden" name="action" value="ltp_pair_code">
                <?php wp_nonce_field('ltp_pair_code', '_ltp_pc_nonce'); ?>
                <label for="ltp_pair_code"><strong>رمز الربط من لوحة Maestro LT</strong></label><br>
                <input type="text" name="pair_code" id="ltp_pair_code" class="regular-text" dir="ltr" maxlength="9" placeholder="K7M2-QX9P" autocomplete="off" style="font-family:monospace;letter-spacing:2px;">
                <button type="submit" class="button">اربط</button>
                <p class="description">الرمز صالح لمدة 15 دقيقة ولمرة واحدة. من اللوحة: المواقع والتثبيت ← الموقع ← «رمز الربط».</p>
            </form>
            </details>
            <?php if (!$paired): ?>
                <?php $t = LTP_Core::get('pair_tried_at'); if ($t !== '') echo '<p class="description">آخر محاولة: ' . esc_html($t) . '</p>'; ?>
                <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
                    <input type="hidden" name="action" value="ltp_pair_now">
                    <?php wp_nonce_field('ltp_pair_now', '_ltp_pair_nonce'); ?>
                    <button type="submit" class="button">🔄 حاول الآن</button>
                    <span class="description">(اختياري — تحاول الإضافة تلقائيًا)</span>
                </form>
            <?php endif; ?>
        </div>
        <?php
    }
}
