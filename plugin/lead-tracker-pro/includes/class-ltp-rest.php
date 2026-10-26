<?php
if (!defined('ABSPATH')) exit;

class LTP_Rest {

    private static $instance = null;

    // حدود الاستخدام (في الساعة). الـIP عالي عشان شبكات الجوال بتشارك عنوان واحد بين ناس كتير.
    const LIMIT_IP      = 1000;
    const LIMIT_SESSION = 200;
    const LIMIT_CLICKS  = 60;   // ضغطات (أي زرار) لكل جلسة
    const LIMIT_GLOBAL  = 6000; // الموقع كله (يتعدّل بالفلتر ltp_global_hourly_cap)

    public static function instance() {
        if (self::$instance === null) self::$instance = new self();
        return self::$instance;
    }

    private function __construct() {
        add_action('rest_api_init', [$this, 'routes']);
    }

    public function routes() {
        register_rest_route('lt/v1', '/event', [
            'methods'             => 'POST',
            'permission_callback' => '__return_true',
            'callback'            => [$this, 'handle_event'],
        ]);

        // 2.5.0: جرد عناصر التواصل في كل صفحة (بيتخزن في الموقع ويظهر في صفحة الإعدادات)
        register_rest_route('lt/v1', '/inventory', [
            'methods'             => 'POST',
            'permission_callback' => '__return_true',
            'callback'            => [$this, 'handle_inventory'],
        ]);

        register_rest_route('lt/v1', '/stats', [
            'methods'             => 'GET',
            'permission_callback' => function () {
                return current_user_can('manage_options');
            },
            'callback'            => [$this, 'stats'],
        ]);
    }

    // عدّاد بسيط بساعة: يرجّع false لو عدّى الحد
    private function hit($key, $max, $ttl = HOUR_IN_SECONDS) {
        $n = (int) get_transient($key);
        if ($n >= $max) return false;
        set_transient($key, $n + 1, $ttl);
        return true;
    }

    // الطلب جاي من نفس الموقع؟ (بيمنع الرش من مواقع تانية؛ مش بيمنع سكريبت متعمّد، ده دور الحدود)
    private function same_origin() {
        $site = $this->host(home_url());
        foreach (['HTTP_ORIGIN', 'HTTP_REFERER'] as $h) {
            if (!empty($_SERVER[$h])) {
                return $this->host((string) $_SERVER[$h]) === $site;
            }
        }
        return true; // مفيش Origin ولا Referer (متصفحات بتحجبهم): نقبل، والحدود بتحمي
    }

    private function host($url) {
        $h = strtolower((string) wp_parse_url($url, PHP_URL_HOST));
        return preg_replace('/^www\./', '', $h);
    }

    // ═══════════════════════════════════════════════════
    // استقبال الأحداث (page_view / click / scroll / exit / consent)
    // ═══════════════════════════════════════════════════
    public function handle_event($r) {
        $ok = new WP_REST_Response('ok', 200);

        $event = $r->get_param('event');
        if (!is_string($event) || !in_array($event, LTP_Core::EVENTS, true)) {
            return new WP_REST_Response('bad event', 400);
        }

        if (!$this->same_origin()) return $ok;

        $ua = isset($_SERVER['HTTP_USER_AGENT']) ? substr($_SERVER['HTTP_USER_AGENT'], 0, 500) : '';
        if (LTP_Core::is_bot($ua)) return $ok;

        // المتصفح الآلي: بيتسجل بعلامة لو جاي من إعلان جوجل (دليل للاسترداد)، وإلا بيتشال
        $has_ad = $this->str($r, 'gclid', 200) !== '' || $this->str($r, 'gbraid', 200) !== '' || $this->str($r, 'wbraid', 200) !== '';
        $auto = LTP_Core::is_automation($ua) ? 1 : 0;
        if ($auto && !$has_ad) return $ok;

        // شكل المعرّفات لازم يكون سليم
        $sid = $this->str($r, 'sid', 20);
        $vid = $this->str($r, 'vid', 20);
        if (!preg_match('/^[A-Za-z0-9]{6,20}$/', $sid)) return $ok;
        if ($vid !== '' && !preg_match('/^[A-Za-z0-9]{4,20}$/', $vid)) return $ok;

        // نوع الضغطة (2.3.2: أي زرار — واتساب · اتصال · إيميل · رسالة · سوشيال · خريطة · سلة · دفع · فورم · زرار)
        $ct = $this->str($r, 'ct', 10);
        if ($event === 'click' && !in_array($ct, ['wa', 'call', 'sms', 'email', 'msg', 'social', 'map', 'cart', 'checkout', 'form', 'button'], true)) return $ok;

        $ip   = LTP_Core::ip();
        $salt = wp_salt('auth');

        // حدود الاستخدام: IP · جلسة · الموقع كله
        if (!$this->hit('ltp_rl_' . substr(md5($ip . $salt), 0, 12), self::LIMIT_IP)) return $ok;
        if (!$this->hit('ltp_rs_' . substr(md5($sid . $salt), 0, 12), self::LIMIT_SESSION)) return $ok;
        $cap = (int) apply_filters('ltp_global_hourly_cap', self::LIMIT_GLOBAL);
        if (!$this->hit('ltp_rg_' . gmdate('YmdH'), $cap)) return $ok;
        if ($event === 'click' && !$this->hit('ltp_rc_' . substr(md5($sid . $salt), 0, 12), self::LIMIT_CLICKS)) return $ok;

        // منع التكرار: نفس الحدث من نفس الجلسة خلال 3 ثواني (الضغطات بتتفرق بالنوع والرقم)
        $dk = 'ltp_dedup_' . md5($sid . $event . $ip . $ct . $this->str($r, 'tnum', 30) . $this->str($r, 'btn', 40) . $this->str($r, 'bt', 80));
        if (get_transient($dk)) return $ok;
        set_transient($dk, 1, 3);

        // عدّاد محلي
        $d   = wp_date('Y-m-d');
        $all = get_option('ltp_events', []);
        if (!is_array($all)) $all = [];
        $key = "$d|$event";
        $all[$key] = ($all[$key] ?? 0) + 1;
        if (count($all) > 5000) {
            $cut = wp_date('Y-m-d', strtotime('-120 days'));
            foreach ($all as $k => $v) {
                if (substr($k, 0, 10) < $cut) unset($all[$k]);
            }
        }
        update_option('ltp_events', $all, false);
        if ($event === 'click' && in_array($ct, ['wa', 'call'], true)) LTP_Numbers::click($this->str($r, 'tnum', 30));
        // 2.8.0: معرّف الزائر بيتجدد ككوكي من السيرفر (سفاري بيمسح كوكيز السكريبت بعد 7 أيام، والسيرفر لأ)
        if ($vid !== '' && $vid[0] !== 'S' && !headers_sent()) {
            $opt = ['expires' => time() + 365 * DAY_IN_SECONDS, 'path' => '/', 'secure' => is_ssl(), 'httponly' => false, 'samesite' => 'Lax'];
            setcookie('ltp_vid', $vid, $opt);
            $vis = absint($r->get_param('vis'));
            if ($vis) setcookie('ltp_vis', (string) $vis, $opt);
            $first = $this->str($r, 'first', 10);
            if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $first)) setcookie('ltp_first', $first, $opt);
        }
        // 2.6.5: زرار اتضغط ومافتحش حاجة ← يتأكد في الجرد كمشكلة (مش مجرد رابط «#» ممكن يكون شغال بسكريبت)
        if ($event === 'click' && strpos($this->str($r, 'via', 30), 'noop') !== false && preg_match('/⟨([^⟩]{1,80})⟩/u', $this->str($r, 'bt', 80), $mm)) LTP_Inventory::noop($mm[1]);

        // إرسال للـ Webhook
        if (!LTP_Pair::is_paired()) LTP_Pair::kick();   // لسه مش مربوط: نحاول في الخلفية (من غير ما نأخّر الزائر)
        if (LTP_Pair::is_paired()) { // مابيبعتش قبل ما الموقع يتربط
            $webhook = LTP_Core::get('webhook_url');
            [$dev, $os, $br] = LTP_Core::ua_info($ua);

            $payload = [
                'secret'  => LTP_Core::get('webhook_secret'),
                'site'    => LTP_Core::get('site_label', get_bloginfo('name')),
                'site_id' => LTP_Core::get('site_id'),
                'home_url'=> home_url('/'),
                'event'   => $event,
                'time'    => current_time('mysql'),
                'session_id'  => $sid,
                'visitor_id'  => $vid,

                // الصفحة
                'title'   => self::cell($this->str($r, 'title', 200)),
                'url'     => esc_url_raw($this->str($r, 'url', 500)),
                'path'    => $this->str($r, 'path', 300),
                'page_id' => absint($r->get_param('pid')),

                // الزر (للـ click فقط)
                'click_type' => $ct,
                'btn_pos'    => $this->str($r, 'btn', 40),
                'btn_text'   => self::cell($this->str($r, 'bt', 80)),   // 2.7.2: نص بيبدأ بـ + أو = كان بيطلع #ERROR! في الشيت
                'href'       => esc_url_raw(mb_substr(is_scalar($r->get_param('href')) ? (string) $r->get_param('href') : '', 0, 500)), // 2.3.3: من غير ما الرابط يتقص
                'target_num' => $this->str($r, 'tnum', 30),
                'match_code' => $this->str($r, 'mc', 20),
                'detect_via' => $this->str($r, 'via', 30),   // 2.5.0: اتعرف إزاي (href · attr · kw · open · rule · form…)
                // 2.8.0
                'is_test'    => absint($r->get_param('test')) ? 1 : 0,
                'fp4'        => preg_replace('/[^A-Za-z0-9_\-]/', '', $this->str($r, 'fp4', 48)),
                'fp3'        => preg_replace('/[^A-Za-z0-9|.]/', '', $this->str($r, 'fp3', 48)),
                'fp2'        => preg_replace('/[^a-f0-9]/', '', strtolower($this->str($r, 'fp2', 16))),
                'behavior'   => self::cell($this->str($r, 'bh', 120)),
                'target_geo' => LTP_Core::get('target_countries', '') . '|' . LTP_Core::get('target_cities', ''),   // 2.8.3: استهداف الإعلانات
                'lead_level' => in_array($this->str($r, 'lv', 10), ['primary', 'important', 'normal', 'support'], true) ? $this->str($r, 'lv', 10) : '',   // 2.7.0

                // 2.6.4: مشاهدة منتج (من المتصفح)
                'product_id'    => $event === 'view_item' ? absint($r->get_param('pid')) : 0,
                'product_name'  => $event === 'view_item' ? $this->str($r, 'pn', 150) : '',
                'product_price' => $event === 'view_item' ? (float) $r->get_param('pp') : 0,
                'category'      => $event === 'view_item' ? $this->str($r, 'pc', 100) : '',
                'currency'      => $event === 'view_item' ? $this->str($r, 'cur', 5) : '',

                // المصدر
                'source'        => $this->str($r, 's', 20),
                'source_fine'   => $this->str($r, 's2', 30),
                'source_detail' => $this->str($r, 'sd', 150),
                'first_source'        => $this->str($r, 'fs', 30),
                'first_source_detail' => $this->str($r, 'fsd', 150),
                'first_source_at'     => $this->str($r, 'fsat', 20),
                'referrer'      => $this->str($r, 'rh', 200),
                'referrer_path' => $this->str($r, 'rp', 500),
                'utm'           => $this->str($r, 'utm', 300),
                'gclid'         => $this->str($r, 'gclid', 200),
                'gbraid'        => $this->str($r, 'gbraid', 200),
                'wbraid'        => $this->str($r, 'wbraid', 200),
                'fbclid'        => $this->str($r, 'fbclid', 200),
                'msclkid'       => $this->str($r, 'msclkid', 200),
                'ttclid'        => $this->str($r, 'ttclid', 200),
                'landing'       => $this->str($r, 'lp', 300),

                // السلوك
                'pages_count'  => absint($r->get_param('pv')),
                'seconds'      => absint($r->get_param('sec')),
                'page_seconds' => absint($r->get_param('psec')),            // 2.3.4: ثواني الصفحة دي بس
                'journey'      => $this->str($r, 'jr', 1000),               // 2.3.4: الصفحات اللي زارها قبل الضغطة
                'scroll_depth' => absint($r->get_param('scroll')),
                'mouse_moves'  => absint($r->get_param('mm')),
                'interactions' => absint($r->get_param('ia')),
                'webdriver'    => absint($r->get_param('wd')) ? 1 : 0,
                'automation'   => $auto,
                'page_load_ms' => absint($r->get_param('plms')),
                'ttfb_ms'      => absint($r->get_param('ttfb')),

                // الزيارة
                'visit_no'    => absint($r->get_param('vis')),
                'first_visit' => $this->str($r, 'first', 20),

                // الجهاز (فاضي لو الزائر ما وافقش)
                'device'     => $dev,
                'os'         => $os,
                'browser'    => $br,
                'screen'     => $this->str($r, 'scr', 20),
                'viewport'   => $this->str($r, 'vp', 20),
                'dpr'        => $this->str($r, 'dpr', 10),
                'lang'       => $this->str($r, 'lang', 40),
                'timezone'   => $this->str($r, 'tz', 50),
                'platform'   => $this->str($r, 'plat', 40),
                'cores'      => absint($r->get_param('cores')),
                'memory'     => absint($r->get_param('mem')),
                'connection' => $this->str($r, 'conn', 20),
                'battery'    => $this->str($r, 'bat', 10),
                'touch'      => absint($r->get_param('touch')),
                'gpu'        => $this->str($r, 'gpu', 100),
                'cookies_on' => absint($r->get_param('ck')),
                'dnt'        => absint($r->get_param('dnt')),

                // بصمة + موافقة
                'fingerprint' => $this->str($r, 'fp', 32),
                'consent'     => $this->str($r, 'consent', 20),

                // شبكة
                'country' => LTP_Core::cf_hdr('cf-ipcountry'),
                'city'    => trim(LTP_Core::cf_hdr('cf-ipcity') . ' ' . LTP_Core::cf_hdr('cf-region')),
                'ip'      => $ip,
                'ua'      => $ua,
            ];

            wp_remote_post($webhook, [
                'blocking'    => false,
                'timeout'     => 3,
                'redirection' => 0,
                'headers'     => ['Content-Type' => 'application/json'],
                'body'        => wp_json_encode($payload),
            ]);
        }

        return $ok;
    }

    // ═══════════════════════════════════════════════════
    // 2.5.0 — جرد عناصر التواصل
    // ═══════════════════════════════════════════════════
    const INV_TYPES = ['wa', 'call', 'sms', 'email', 'msg', 'form', 'button', 'cart', 'checkout', 'map', 'social'];

    public function handle_inventory($r) {
        $ok = new WP_REST_Response('ok', 200);
        if (!$this->same_origin()) return $ok;
        $ua = isset($_SERVER['HTTP_USER_AGENT']) ? substr($_SERVER['HTTP_USER_AGENT'], 0, 500) : '';
        if (LTP_Core::is_bot($ua) || LTP_Core::is_automation($ua)) return $ok;
        $salt = wp_salt('auth');
        if (!$this->hit('ltp_ri_' . substr(md5(LTP_Core::ip() . $salt), 0, 12), 30)) return $ok;
        if (!$this->hit('ltp_rig_' . gmdate('YmdH'), 300)) return $ok;

        $path  = $this->str($r, 'path', 200);
        $dev   = $this->str($r, 'dev', 1) === 'm' ? 'm' : 'd';
        $items = $r->get_param('items');
        if ($path === '' || !is_array($items)) return $ok;

        $clean = [];
        foreach (array_slice($items, 0, 60) as $it) {
            if (!is_array($it)) continue;
            $t = isset($it['t']) ? sanitize_key($it['t']) : '';
            if (!in_array($t, self::INV_TYPES, true)) continue;
            $clean[] = [
                't' => $t,
                'v' => mb_substr(sanitize_text_field((string) ($it['v'] ?? '')), 0, 20),
                'd' => mb_substr(sanitize_text_field((string) ($it['d'] ?? '')), 0, 80),
                'x' => mb_substr(sanitize_text_field((string) ($it['x'] ?? '')), 0, 40),
                'u' => esc_url_raw(mb_substr((string) ($it['u'] ?? ''), 0, 200), ['http', 'https', 'tel', 'mailto', 'sms', 'whatsapp']),
                'c' => empty($it['c']) ? 0 : 1,
                's' => empty($it['s']) ? 0 : 1,
                'p' => mb_substr(sanitize_text_field((string) ($it['p'] ?? '')), 0, 20),
                'n' => substr(preg_replace('/\D/', '', (string) ($it['n'] ?? '')), 0, 15),
                'cr' => empty($it['cr']) ? 0 : 1,
                'e'  => empty($it['e']) ? 0 : 1,
                'h'  => mb_substr(sanitize_text_field((string) ($it['h'] ?? '')), 0, 60),
            ];
        }

        // 2.6.5: الجرد بيتجمّع حسب العنصر ومجموعة الصفحات (مش صفحة صفحة)
        $ptype = sanitize_key($this->str($r, 'pt', 12));
        if (!in_array($ptype, ['home', 'product', 'shop', 'post', 'archive', 'cart', 'checkout', 'account', 'page', 'cpt', 'other'], true)) $ptype = 'other';
        LTP_Inventory::ingest($path, $ptype, $this->str($r, 'pl', 40), $this->str($r, 'title', 80), $dev, $this->str($r, 'ver', 10), $clean);
        LTP_Numbers::ingest($path, $clean, $this->str($r, 'ver', 10));   // 2.6.0: تجميع الأرقام وتصنيفها
        return $ok;
    }

    // ═══════════════════════════════════════════════════
    // إحصائيات
    // ═══════════════════════════════════════════════════
    public function stats($r) {
        $days = max(1, min(120, absint($r->get_param('days') ?: 28)));
        $cut  = wp_date('Y-m-d', strtotime("-" . ($days - 1) . " days"));
        $all  = get_option('ltp_events', []);

        $tot = [];
        foreach ((array) $all as $k => $c) {
            $parts = explode('|', $k);
            if (count($parts) !== 2) continue;
            if ($parts[0] < $cut) continue;
            $tot[$parts[1]] = ($tot[$parts[1]] ?? 0) + $c;
        }

        $out = [
            'version'   => LTP_VERSION,
            'days'      => $days,
            'webhook'   => LTP_Core::webhook_ready() ? 'sheet on' : 'sheet OFF',
            'site'      => LTP_Core::get('site_label'),
            'site_id'   => LTP_Core::get('site_id'),
            'paired'    => LTP_Pair::is_paired(),
            'pair_state'=> LTP_Core::get('pair_state', ''),
            'pair_tried'=> LTP_Core::get('pair_tried_at', ''),
            'events'    => $tot,
            'installed' => get_option('ltp_installed_at'),
        ];

        $res = new WP_REST_Response($out, 200);
        $res->header('Cache-Control', 'no-store, no-cache, max-age=0');
        return $res;
    }

    // ─── Helper ───
    // الشيت بيعتبر أي نص بيبدأ بـ = + - @ معادلة
    private static function cell($s) {
        return preg_match('/^[=+\-@]/u', (string) $s) ? '’' . $s : $s;
    }

    private function str($r, $k, $max = 200) {
        $v = $r->get_param($k);
        if (!is_scalar($v)) return '';
        return mb_substr(sanitize_text_field((string) $v), 0, $max);
    }
}
