<?php
if (!defined('ABSPATH')) exit;

/**
 * Lead Tracker Pro — WooCommerce (2.6.4)
 *
 * الدقة أولاً:
 *  • الطلب بيتسجل مرة واحدة بس لكل رقم طلب، أول ما يبقى طلب حقيقي (مش «في انتظار الدفع»)،
 *    حتى لو العميل مارجعش لصفحة «شكراً» — وريفريش «شكراً» مابيكررش.
 *  • مصدر الطلب بيتحفظ مع الطلب لحظة إنشائه من متصفح العميل نفسه (كوكيز التتبع، أو بيانات
 *    «مصدر الطلب» الرسمية في ووكومرس). مفيش تخمين من الـIP — المجهول بيتكتب «غير معروف».
 *  • طلبات أجهزتنا (?ltp_internal=1) والأدمن ومدير المتجر بتتسجل «test_order» (🧪 طلب تجريبي) مش شراء.
 *  • أي تغيير في حالة الطلب (اتسلّم، اتلغى، مرتجع…) بيتسجل — الإيراد الحقيقي = اللي اتسلّم.
 *  • «أول طلب؟» من تاريخ العميل الحقيقي (بالموبايل أو الإيميل أو الحساب).
 *  • «بدء الدفع» و«فتح السلة» مرة واحدة لكل زيارة. «مشاهدة منتج» اتنقلت للمتصفح (tracker.js).
 *  • الإرسال بعد ما الصفحة تخلص (مابيأخّرش العميل)، ولو فشل بيتعاد لوحده.
 */
class LTP_WooCommerce {

    private static $instance = null;
    private $queue = [];

    const PAID   = ['processing', 'completed', 'on-hold'];   // طلب حقيقي
    const RETRY  = 'ltp_wc_retry';
    const STATUS_AR = [
        'pending'    => 'في انتظار الدفع',
        'processing' => 'جاري التجهيز',
        'on-hold'    => 'معلّق',
        'completed'  => 'اتسلّم / مكتمل',
        'cancelled'  => 'اتلغى',
        'refunded'   => 'مرتجع',
        'failed'     => 'فشل الدفع',
        'checkout-draft' => 'مسودة',
    ];

    public static function instance() {
        if (self::$instance === null) self::$instance = new self();
        return self::$instance;
    }

    private function __construct() {
        if (!class_exists('WooCommerce')) return;
        // الطلبات اللي قبل التحديث ده اتسجلت بالطريقة القديمة — مانسجلهاش شراء تاني
        if (!get_option('ltp_wc_since')) update_option('ltp_wc_since', time(), false);

        // السلة والدفع
        add_action('woocommerce_add_to_cart', [$this, 'on_add_to_cart'], 10, 6);
        add_action('woocommerce_cart_item_removed', [$this, 'on_remove_from_cart'], 10, 2);
        add_action('template_redirect', [$this, 'on_page'], 20);

        // الطلب: نحفظ المصدر وقت الإنشاء (متصفح العميل)، ونبعت لما يبقى طلب حقيقي
        add_action('woocommerce_checkout_order_processed', [$this, 'on_order_created'], 5, 3);
        add_action('woocommerce_store_api_checkout_update_order_from_request', [$this, 'on_order_created_blocks'], 20, 2);
        add_action('woocommerce_store_api_checkout_order_processed', [$this, 'on_order_created_blocks'], 5, 1);
        add_action('woocommerce_order_status_changed', [$this, 'on_status_changed'], 20, 4);
        add_action('woocommerce_payment_complete', [$this, 'on_payment_complete'], 20, 1);
        add_action('woocommerce_thankyou', [$this, 'on_thankyou'], 5, 1);

        // 2.8.0: حساب جديد (في متجر الجملة = تاجر جديد) — من أي فورم تسجيل
        add_action('user_register', [$this, 'on_user_register'], 20, 1);

        // تعليم طلب كتجربة من صفحة الطلب في لوحة التحكم
        add_filter('woocommerce_order_actions', [$this, 'order_actions'], 20, 1);
        add_action('woocommerce_order_action_ltp_mark_test', [$this, 'mark_test']);

        // الإرسال بعد الصفحة + إعادة المحاولة
        add_action('shutdown', [$this, 'flush'], 1);
        add_action('ltp_wc_retry', [$this, 'retry']);
    }

    // ═══════════════════════════════════════════════════════
    // جهاز داخلي / أدمن / مدير متجر = تجربة
    // ═══════════════════════════════════════════════════════
    // 2.8.0: وضع التجربة (?ltp_test=1): الأحداث بتتسجل بس متعلّمة تجربة
    public static function is_test() {
        return isset($_COOKIE['ltp_test']) && $_COOKIE['ltp_test'] === '1';
    }

    public static function is_internal() {
        if (isset($_COOKIE['ltp_internal']) && $_COOKIE['ltp_internal'] === '1') return 'جهاز داخلي';
        if (self::is_test()) return 'وضع التجربة';
        if (is_user_logged_in() && (current_user_can('manage_woocommerce') || current_user_can('edit_shop_orders'))) return 'أدمن / مدير المتجر';
        return '';
    }

    private function cookie($name, $max = 300) {
        if (!isset($_COOKIE[$name])) return '';
        return mb_substr(sanitize_text_field(wp_unslash($_COOKIE[$name])), 0, $max);
    }

    // مصدر الزيارة من كوكيز tracker.js (نفس الأسماء اللي بيكتبها)
    private function cookie_attr() {
        $a = [
            'source'        => $this->cookie('ltp_s', 20),
            'source_fine'   => $this->cookie('ltp_s2', 30),
            'source_detail' => $this->cookie('ltp_sd', 150),
            'utm'           => $this->cookie('ltp_utm', 300),
            'landing'       => $this->cookie('ltp_lp', 300),
            'referrer'      => $this->cookie('ltp_rh', 200),
            'referrer_path' => $this->cookie('ltp_rp', 500),
            'first_source'        => $this->cookie('ltp_fs', 30),
            'first_source_detail' => $this->cookie('ltp_fsd', 150),
            'first_source_at'     => $this->cookie('ltp_fsat', 20),
            'session_id'    => $this->cookie('ltp_sid', 20),
            'visitor_id'    => $this->cookie('ltp_vid', 20),
            'visit_no'      => $this->cookie('ltp_vis', 10),
        ];
        foreach (['gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid', 'ttclid'] as $k) $a[$k] = $this->cookie('ltp_' . $k, 200);
        return $a;
    }

    private static function has_attr($a) {
        return !empty($a['source']) || !empty($a['gclid']) || !empty($a['gbraid']) || !empty($a['wbraid']) || !empty($a['session_id']);
    }

    // احتياطي رسمي: «مصدر الطلب» اللي ووكومرس نفسه بيحفظه مع الطلب (من متصفح العميل) — مش تخمين
    private function wc_attr($order) {
        $type = (string) $order->get_meta('_wc_order_attribution_source_type');
        if ($type === '') return [];
        $src  = strtolower((string) $order->get_meta('_wc_order_attribution_utm_source'));
        $med  = strtolower((string) $order->get_meta('_wc_order_attribution_utm_medium'));
        $ref  = (string) $order->get_meta('_wc_order_attribution_referrer');
        $s = 'other';
        if ($type === 'typein') $s = 'direct';
        elseif ($type === 'admin') $s = '';
        elseif ($type === 'utm' && preg_match('/^(cpc|ppc|paid|paidsearch|paid_social|ads?)$/', $med)) $s = 'ads';
        elseif ($type === 'organic') $s = (strpos($src, 'google') !== false) ? 'google' : 'bing';
        elseif (preg_match('/facebook|instagram|tiktok|snapchat|twitter|x\.com|linkedin|youtube|t\.co/', $src . ' ' . $ref)) $s = 'social';
        elseif (preg_match('/chatgpt|openai|perplexity|gemini|copilot|claude/', $src . ' ' . $ref)) $s = 'ai';
        return [
            'source'        => $s,
            'source_detail' => trim('ووكومرس: ' . $type . ($src !== '' ? ' / ' . $src : '') . ($med !== '' ? ' / ' . $med : '')),
            'referrer'      => (string) wp_parse_url($ref, PHP_URL_HOST),
            'landing'       => (string) wp_parse_url((string) $order->get_meta('_wc_order_attribution_session_entry'), PHP_URL_PATH),
            'utm'           => $src !== '' ? 'source=' . $src . ($med !== '' ? ' · medium=' . $med : '') : '',
        ];
    }

    // ═══════════════════════════════════════════════════════
    // إنشاء الطلب: نحفظ المصدر والتجربة مع الطلب نفسه
    // ═══════════════════════════════════════════════════════
    public function on_order_created($order_id, $posted = null, $order = null) {
        $order = $order instanceof WC_Order ? $order : wc_get_order($order_id);
        if ($order) $this->capture($order);
    }

    public function on_order_created_blocks($order, $request = null) {
        if ($order instanceof WC_Order) $this->capture($order);
    }

    private function capture($order, $save = true) {
        if ($order->get_meta('_ltp_attr') !== '') return;
        $attr = $this->cookie_attr();
        $attr['via'] = 'cookies';
        if (!self::has_attr($attr)) {
            $wc = $this->wc_attr($order);
            $attr = $wc ? array_merge($attr, $wc, ['via' => 'woocommerce']) : array_merge($attr, ['via' => 'none']);
        }
        $attr['ip']     = LTP_Core::ip();
        $attr['ua']     = isset($_SERVER['HTTP_USER_AGENT']) ? substr((string) $_SERVER['HTTP_USER_AGENT'], 0, 500) : '';
        $attr['client'] = $this->cookie('ltp_vid', 20) !== '' ? 1 : 0;
        $order->update_meta_data('_ltp_attr', wp_json_encode($attr, JSON_UNESCAPED_UNICODE));
        $why = self::is_internal();
        if ($why !== '' && $order->get_meta('_ltp_test') === '') $order->update_meta_data('_ltp_test', $why);
        if ($save) $order->save_meta_data();
    }

    private function attr_of($order) {
        $a = json_decode((string) $order->get_meta('_ltp_attr'), true);
        return is_array($a) ? $a : [];
    }

    // ═══════════════════════════════════════════════════════
    // الطلب بقى حقيقي → يتسجل مرة واحدة
    // ═══════════════════════════════════════════════════════
    public function on_status_changed($order_id, $from, $to, $order = null) {
        $order = $order instanceof WC_Order ? $order : wc_get_order($order_id);
        if (!$order) return;
        if (!$order->get_meta('_ltp_sent') && self::is_legacy($order)) {
            // طلب قديم (قبل 2.6.4) اتسجل بالطريقة القديمة: نبعت الحالة بس، من غير شراء تاني
            $order->update_meta_data('_ltp_sent', 'legacy');
            $order->save_meta_data();
        }
        if (!$order->get_meta('_ltp_sent')) {
            if (in_array($to, self::PAID, true)) $this->send_purchase($order, 'status:' . $to);
            return; // قبل ما يبقى طلب حقيقي مفيش حالة نبعتها
        }
        if ($from === $to) return;
        $this->send_status($order, $from, $to);
    }

    private static function is_legacy($order) {
        $since = (int) get_option('ltp_wc_since', 0);
        $d = $order->get_date_created();
        return $since && $d && $d->getTimestamp() < $since;
    }

    public function on_payment_complete($order_id) {
        $order = wc_get_order($order_id);
        if ($order && !$order->get_meta('_ltp_sent') && !self::is_legacy($order)) $this->send_purchase($order, 'payment');
    }

    // احتياطي: لو الحالة اتغيرت من غير الهوكات العادية
    public function on_thankyou($order_id) {
        $order = wc_get_order($order_id);
        if (!$order || $order->get_meta('_ltp_sent') || self::is_legacy($order)) return;
        if ($order->get_meta('_ltp_attr') === '') $this->capture($order);
        if (in_array($order->get_status(), self::PAID, true)) $this->send_purchase($order, 'thankyou');
    }

    private function send_purchase($order, $via) {
        // علامة «اتبعت» قبل الإرسال عشان مايتكررش لو حدثين جم ورا بعض
        $order->update_meta_data('_ltp_sent', current_time('mysql'));
        if ($order->get_meta('_ltp_attr') === '') {
            // طلب اتعمل من لوحة التحكم أو من الـ API (مثلاً طلب واتساب دخّله موظف): مالوش متصفح عميل
            $cv = (string) $order->get_created_via();
            $attr = in_array($cv, ['checkout', 'store-api'], true) ? $this->wc_attr($order) : [];
            $attr = $attr ?: ['source' => '', 'source_detail' => ($cv === 'admin' ? 'طلب يدوي من لوحة التحكم' : ($cv !== '' ? 'طلب من ' . $cv : ''))];
            $attr['via'] = $attr['via'] ?? ('created_via:' . $cv);
            $order->update_meta_data('_ltp_attr', wp_json_encode($attr, JSON_UNESCAPED_UNICODE));
        }
        $order->save_meta_data();

        $attr  = $this->attr_of($order);
        $test  = (string) $order->get_meta('_ltp_test');
        $items = [];
        foreach ($order->get_items() as $item) {
            $p = $item->get_product();
            $q = max(1, (int) $item->get_quantity());
            $items[] = [
                'name'     => $item->get_name(),
                'quantity' => $q,
                'price'    => round((float) $item->get_subtotal() / $q, 2),
                'subtotal' => (float) $item->get_subtotal(),
                'sku'      => $p ? $p->get_sku() : '',
            ];
        }
        $hist = $this->history($order);

        $data = array_merge($this->attr_fields($attr), [
            'order_id'         => $order->get_id(),
            'order_total'      => (float) $order->get_total(),
            'order_subtotal'   => (float) $order->get_subtotal(),
            'order_tax'        => (float) $order->get_total_tax(),
            'order_shipping'   => (float) $order->get_shipping_total(),
            'order_discount'   => (float) $order->get_discount_total(),
            'currency'         => $order->get_currency(),
            'order_status'     => self::status_ar($order->get_status()),
            'payment_method'   => $order->get_payment_method_title(),
            'coupons'          => implode(', ', $order->get_coupon_codes()),
            'is_first_order'   => $hist['n'] === 0 ? 'نعم' : 'لا — طلب رقم ' . ($hist['n'] + 1),
            'customer_orders'  => $hist['n'] + 1,
            'customer_spent'   => round($hist['spent'] + (float) $order->get_total(), 2),

            // بيانات العميل مفتوحة في الشيت (لإعادة الاستهداف والعروض). التشفير بيحصل بس وقت الرفع لجوجل
            'customer_name'    => trim($order->get_billing_first_name() . ' ' . $order->get_billing_last_name()),
            'customer_phone'   => $order->get_billing_phone(),
            'customer_email'   => $order->get_billing_email(),
            'customer_city'    => $order->get_billing_city(),
            'customer_country' => $order->get_billing_country(),
            'customer_id'      => $order->get_customer_id(),

            'items_count'      => count($items),
            'quantity'         => array_sum(array_column($items, 'quantity')),
            'items_list'       => wp_json_encode($items, JSON_UNESCAPED_UNICODE),
            'items_summary'    => implode('، ', array_map(function ($i) { return $i['name'] . ' (' . $i['quantity'] . '×)'; }, $items)),
            'path'             => '/order/' . $order->get_id(),
            'title'            => 'طلب #' . $order->get_order_number(),
            'detect_via'       => 'wc:' . $via . ' · ' . ($attr['via'] ?? ''),
            'lead_level'       => 'primary',
            'warning'          => trim(($test !== '' ? '🧪 طلب تجريبي (' . $test . ')' : '')
                                  . (($attr['via'] ?? '') === 'created_via:admin' ? ' · ✍️ طلب يدوي من لوحة التحكم (واتساب أو تليفون؟)' : '')
                                  . (empty($attr['source']) && ($attr['via'] ?? '') !== 'cookies' ? ' · المصدر غير معروف' : ''), ' ·'),
        ]);
        $this->queue_event($test !== '' ? 'test_order' : 'purchase', $data);
    }

    private function send_status($order, $from, $to) {
        $attr = $this->attr_of($order);
        $test = (string) $order->get_meta('_ltp_test');
        $this->queue_event($test !== '' ? 'test_order' : 'order_status', array_merge($this->attr_fields($attr), [
            'order_id'       => $order->get_id(),
            'order_total'    => (float) $order->get_total(),
            'currency'       => $order->get_currency(),
            'order_status'   => self::status_ar($to),
            'customer_name'  => trim($order->get_billing_first_name() . ' ' . $order->get_billing_last_name()),
            'customer_phone' => $order->get_billing_phone(),
            'path'           => '/order/' . $order->get_id(),
            'title'          => 'طلب #' . $order->get_order_number(),
            'btn_text'       => '📦 ' . self::status_ar($from) . ' ← ' . self::status_ar($to),
            'detect_via'     => 'wc:status',
            'warning'        => ($test !== '' ? '🧪 تجربة · ' : '') . '📦 الطلب #' . $order->get_order_number() . ': ' . self::status_ar($to),
        ]));
    }

    private static function status_ar($s) {
        $s = (string) $s;
        return self::STATUS_AR[$s] ?? $s;
    }

    private function attr_fields($a) {
        $keys = ['source', 'source_fine', 'source_detail', 'utm', 'landing', 'referrer', 'referrer_path', 'first_source', 'first_source_detail', 'first_source_at',
                 'session_id', 'visitor_id', 'visit_no', 'gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid', 'ttclid', 'ip', 'ua'];
        $out = [];
        foreach ($keys as $k) $out[$k] = isset($a[$k]) ? (string) $a[$k] : '';
        if ($out['source'] === '') $out['source'] = 'غير معروف';
        return $out;
    }

    // طلبات العميل اللي قبل الطلب ده (بالحساب أو الموبايل أو الإيميل) — من غير الملغي والفاشل والتجريبي
    private function history($order) {
        $ids = [];
        $base = ['limit' => 200, 'return' => 'ids', 'status' => ['wc-processing', 'wc-completed', 'wc-on-hold'], 'exclude' => [$order->get_id()]];
        if ($order->get_date_created()) $base['date_created'] = '<' . $order->get_date_created()->getTimestamp();
        if ($order->get_customer_id()) $ids = array_merge($ids, wc_get_orders($base + ['customer_id' => $order->get_customer_id()]));
        $phone = preg_replace('/\D/', '', (string) $order->get_billing_phone());
        if ($phone !== '') $ids = array_merge($ids, wc_get_orders($base + ['billing_phone' => $order->get_billing_phone()]));
        if ($order->get_billing_email() !== '') $ids = array_merge($ids, wc_get_orders($base + ['billing_email' => $order->get_billing_email()]));
        $n = 0; $spent = 0.0;
        foreach (array_unique(array_map('intval', $ids)) as $id) {
            $o = wc_get_order($id);
            if (!$o || $o->get_meta('_ltp_test') !== '') continue;
            $n++; $spent += (float) $o->get_total();
        }
        return ['n' => $n, 'spent' => $spent];
    }

    // ═══════════════════════════════════════════════════════
    // 2.8.0: تسجيل حساب جديد (تاجر جديد في متجر الجملة) — من غير ما نلمس الباسورد
    // ═══════════════════════════════════════════════════════
    private $new_users = [];

    public function on_user_register($user_id) {
        // حساب بيعمله الأدمن من لوحة التحكم مش تسجيل من الموقع
        if (is_admin() && !wp_doing_ajax() && current_user_can('create_users')) return;
        $this->new_users[] = (int) $user_id;
        // البيانات الإضافية (الموبايل…) بتتحفظ بعد الهوك ده — نبعت في آخر الطلب
        if (!has_action('shutdown', [$this, 'flush_signups'])) add_action('shutdown', [$this, 'flush_signups'], 0);
    }

    public function flush_signups() {
        foreach (array_unique($this->new_users) as $uid) {
            $u = get_userdata($uid);
            if (!$u) continue;
            $phone = '';
            foreach (['billing_phone', 'phone', 'mobile', 'user_phone', 'phone_number'] as $mk) { $phone = (string) get_user_meta($uid, $mk, true); if ($phone !== '') break; }
            if ($phone === '') foreach (['billing_phone', 'phone', 'mobile', 'tel'] as $pk) if (!empty($_POST[$pk]) && is_string($_POST[$pk])) { $phone = sanitize_text_field(wp_unslash($_POST[$pk])); break; }
            $name = trim((string) get_user_meta($uid, 'first_name', true) . ' ' . (string) get_user_meta($uid, 'last_name', true));
            if ($name === '') $name = (string) $u->display_name;
            $why = self::is_internal();
            $this->queue_event($why !== '' ? 'test_order' : 'sign_up', $this->cookie_attr() + [
                'customer_name'  => mb_substr($name, 0, 80),
                'customer_phone' => mb_substr($phone, 0, 30),
                'customer_email' => (string) $u->user_email,
                'customer_id'    => $uid,
                'lead_level'     => 'primary',
                'btn_text'       => '📝 حساب جديد اتسجل',
                'detect_via'     => 'wp:user_register',
                'warning'        => $why !== '' ? '🧪 تسجيل تجريبي (' . $why . ')' : '',
                'ip'             => LTP_Core::ip(),
            ]);
        }
        $this->new_users = [];
        $this->flush();
    }

    // ═══════════════════════════════════════════════════════
    // تعليم طلب كتجربة يدوياً (صفحة الطلب ← الإجراءات)
    // ═══════════════════════════════════════════════════════
    public function order_actions($actions) {
        $actions['ltp_mark_test'] = 'Lead Tracker: ده طلب تجريبي';
        return $actions;
    }

    public function mark_test($order) {
        if (!$order instanceof WC_Order || $order->get_meta('_ltp_test') !== '') return;
        $order->update_meta_data('_ltp_test', 'اتعلّم يدوياً');
        $order->save_meta_data();
        $order->add_order_note('Lead Tracker: اتعلّم طلب تجريبي — مش هيدخل في الأرقام.');
        $this->queue_event('test_order', array_merge($this->attr_fields($this->attr_of($order)), [
            'order_id'    => $order->get_id(),
            'order_total' => (float) $order->get_total(),
            'currency'    => $order->get_currency(),
            'path'        => '/order/' . $order->get_id(),
            'title'       => 'طلب #' . $order->get_order_number(),
            'btn_text'    => '🧪 اتعلّم تجريبي',
            'warning'     => '🧪 الطلب #' . $order->get_order_number() . ' اتعلّم تجريبي يدوياً — مايتحسبش',
        ]));
    }

    // ═══════════════════════════════════════════════════════
    // السلة والدفع (مرة واحدة لكل زيارة)
    // ═══════════════════════════════════════════════════════
    private function once($key) {
        if (!function_exists('WC') || !WC()->session) return true;
        $sid = $this->cookie('ltp_sid', 20) ?: 'x';
        $k = 'ltp_' . $key;
        if (WC()->session->get($k) === $sid) return false;
        WC()->session->set($k, $sid);
        return true;
    }

    public function on_page() {
        if (is_admin() || wp_doing_ajax() || (self::is_internal() !== '' && !self::is_test())) return;
        if (!function_exists('WC') || !WC()->cart || WC()->cart->is_empty()) return;
        if (function_exists('is_checkout') && is_checkout() && !is_wc_endpoint_url()) {
            if (!$this->once('bc')) return;
            $this->queue_event('begin_checkout', [
                'cart_items_count' => WC()->cart->get_cart_contents_count(),
                'cart_total'       => (float) WC()->cart->get_cart_contents_total(),
                'order_total'      => (float) WC()->cart->get_cart_contents_total(),
                'currency'         => get_woocommerce_currency(),
            ] + $this->cookie_attr());
        } elseif (function_exists('is_cart') && is_cart()) {
            if (!$this->once('vc')) return;
            $this->queue_event('view_cart', [
                'cart_items_count' => WC()->cart->get_cart_contents_count(),
                'cart_total'       => (float) WC()->cart->get_cart_contents_total(),
                'currency'         => get_woocommerce_currency(),
            ] + $this->cookie_attr());
        }
    }

    public function on_add_to_cart($cart_item_key, $product_id, $quantity, $variation_id, $variation, $cart_item_data) {
        if (self::is_internal() !== '' && !self::is_test()) return;
        $product = wc_get_product($variation_id ?: $product_id);
        if (!$product) return;
        $this->queue_event('add_to_cart', [
            'product_id'    => $product_id,
            'product_name'  => $product->get_name(),
            'product_sku'   => $product->get_sku(),
            'product_price' => (float) $product->get_price(),
            'quantity'      => (int) $quantity,
            'line_total'    => (float) $product->get_price() * (int) $quantity,
            'product_value' => (float) $product->get_price() * (int) $quantity,
            'cart_total'    => WC()->cart ? (float) WC()->cart->get_cart_contents_total() : 0,
            'currency'      => get_woocommerce_currency(),
            'category'      => self::main_category($product_id),
        ] + $this->cookie_attr());
    }

    public function on_remove_from_cart($cart_item_key, $cart) {
        if (self::is_internal() !== '' && !self::is_test()) return;
        $this->queue_event('remove_from_cart', [
            'cart_items_count' => WC()->cart ? WC()->cart->get_cart_contents_count() : 0,
            'cart_total'       => WC()->cart ? (float) WC()->cart->get_cart_contents_total() : 0,
        ] + $this->cookie_attr());
    }

    public static function main_category($product_id) {
        $terms = wp_get_post_terms($product_id, 'product_cat');
        return (is_wp_error($terms) || empty($terms)) ? '' : $terms[0]->name;
    }

    // ═══════════════════════════════════════════════════════
    // الإرسال: بعد ما الصفحة تخلص، ولو فشل يتعاد
    // ═══════════════════════════════════════════════════════
    private function queue_event($event, $data) {
        $webhook = LTP_Core::get('webhook_url');
        if (!$webhook || strpos($webhook, 'https://') !== 0) return;
        $order_ev = isset($data['order_id']) && in_array($event, ['purchase', 'order_status', 'test_order'], true);
        // أحداث الطلب: الجهاز والـIP بتوع العميل وقت الطلب (المحفوظين معاه) — مش بتوع الأدمن اللي غيّر الحالة
        $ua = $order_ev ? (string) ($data['ua'] ?? '') : (isset($_SERVER['HTTP_USER_AGENT']) ? substr((string) $_SERVER['HTTP_USER_AGENT'], 0, 500) : '');
        // الأحداث اللي بتيجي من متصفح الزائر: البوتات بتتشال. الطلبات نفسها بتتسجل دايماً (ممكن تيجي من بوابة الدفع)
        if (!$order_ev && LTP_Core::is_bot($ua)) return;
        [$dev, $os, $br] = $ua !== '' ? LTP_Core::ua_info($ua) : ['', '', ''];
        $payload = array_merge([
            'site'     => LTP_Core::get('site_label', get_bloginfo('name')),
            'site_id'  => LTP_Core::get('site_id'),
            'home_url' => home_url('/'),
            'event'    => $event,
            'time'     => current_time('mysql'),
            'title'    => wp_get_document_title(),
            'url'      => home_url(add_query_arg(null, null)),
            'path'     => isset($_SERVER['REQUEST_URI']) ? (string) wp_parse_url((string) $_SERVER['REQUEST_URI'], PHP_URL_PATH) : '',
            'device'   => $dev,
            'os'       => $os,
            'browser'  => $br,
            'lang'     => isset($_SERVER['HTTP_ACCEPT_LANGUAGE']) ? substr((string) $_SERVER['HTTP_ACCEPT_LANGUAGE'], 0, 40) : '',
            'ip'       => $order_ev ? '' : LTP_Core::ip(),
            'ua'       => $ua,
        ], array_filter($data, function ($v) { return $v !== null; }));
        if (self::is_test() && !$order_ev) $payload['is_test'] = 1;
        $payload['_must'] = ($order_ev || $event === 'sign_up') ? 1 : 0;
        $this->queue[] = $payload;
        self::count($event, $payload);
    }

    // 2.7.1: عدّاد محلي لأحداث المتجر (بيظهر في كارت «تتبع المتجر» في لوحة البلجن)
    private static function count($event, $p) {
        $d   = wp_date('Y-m-d');
        $all = get_option('ltp_events', []);
        if (!is_array($all)) $all = [];
        $all["$d|wc_$event"] = ($all["$d|wc_$event"] ?? 0) + 1;
        update_option('ltp_events', $all, false);
        $last = get_option('ltp_wc_last', []);
        if (!is_array($last)) $last = [];
        $last[$event] = ['at' => current_time('mysql'), 'v' => isset($p['order_total']) ? (float) $p['order_total'] : (isset($p['product_name']) ? (string) $p['product_name'] : ''), 'o' => (string) ($p['order_id'] ?? '')];
        update_option('ltp_wc_last', $last, false);
    }

    // كارت لوحة التحكم: إيه اللي بيتتبع في المتجر، وكام مرة آخر 7 أيام
    public static function card() {
        if (!class_exists('WooCommerce')) return;
        $events = get_option('ltp_events', []);
        $last   = get_option('ltp_wc_last', []);
        $rows = [
            'view_item'        => ['🛍️ مشاهدة منتج', 'من المتصفح · مرة لكل منتج في الزيارة', 'view_item'],
            'add_to_cart'      => ['🛒 إضافة للسلة', 'من السيرفر · من صفحة المنتج أو المنتجات المقترحة', 'wc_add_to_cart'],
            'remove_from_cart' => ['❌ حذف من السلة', 'من السيرفر', 'wc_remove_from_cart'],
            'view_cart'        => ['👀 فتح السلة', 'من السيرفر · مرة لكل زيارة', 'wc_view_cart'],
            'begin_checkout'   => ['💳 بدء الدفع', 'من السيرفر · مرة لكل زيارة', 'wc_begin_checkout'],
            'purchase'         => ['💰 طلب حقيقي', 'من السيرفر · مرة لكل رقم طلب، أول ما يبقى طلب حقيقي', 'wc_purchase'],
            'order_status'     => ['📦 تغيير حالة الطلب', 'اتسلّم · اتلغى · مرتجع', 'wc_order_status'],
            'test_order'       => ['🧪 طلب تجريبي', 'أجهزتنا والأدمن — مابيتحسبش', 'wc_test_order'],
        ];
        $sum = [];
        for ($i = 0; $i < 7; $i++) {
            $d = wp_date('Y-m-d', strtotime("-{$i} days"));
            foreach ($rows as $k => $r) $sum[$k] = ($sum[$k] ?? 0) + (int) ($events[$d . '|' . $r[2]] ?? 0);
        }
        ?>
        <div class="ltp-card">
            <h3>🛒 تتبع المتجر (ووكومرس)</h3>
            <p class="description">خطوات الشراء بتتسجل لوحدها من ووكومرس نفسه — مش محتاجة جرد ولا إعداد، ومابتظهرش في «جرد عناصر التواصل» (الجرد للواتساب والاتصال والفورمز). الطلب بيتبعت لجوجل كتحويل أساسي.</p>
            <table class="ltp-table widefat striped">
                <thead><tr><th>الخطوة</th><th>بتتسجل إزاي</th><th>آخر 7 أيام</th><th>آخر مرة</th></tr></thead>
                <tbody>
                <?php foreach ($rows as $k => $r): $l = $last[$k] ?? null; ?>
                    <tr>
                        <td><?php echo esc_html($r[0]); ?></td>
                        <td><?php echo esc_html($r[1]); ?></td>
                        <td><strong><?php echo (int) $sum[$k]; ?></strong></td>
                        <td><?php echo $l ? esc_html($l['at'] . ($l['o'] !== '' ? ' · طلب #' . $l['o'] : '') . (is_string($l['v']) && $l['v'] !== '' ? ' · ' . $l['v'] : (is_float($l['v']) && $l['v'] > 0 ? ' · ' . $l['v'] : ''))) : '—'; ?></td>
                    </tr>
                <?php endforeach; ?>
                </tbody>
            </table>
            <p class="description">«آخر مرة» بتبدأ تتملى من بعد تحديث 2.7.1. الأرقام الكاملة في الشيت.</p>
        </div>
        <?php
    }

    public function flush() {
        if (!$this->queue) return;
        $q = $this->queue; $this->queue = [];
        // نخلّص الصفحة للعميل الأول، وبعدين نبعت
        $done = false;
        if (function_exists('fastcgi_finish_request')) { $done = @fastcgi_finish_request(); }
        elseif (function_exists('litespeed_finish_request')) { $done = @litespeed_finish_request(); }
        foreach ($q as $p) {
            $must = !empty($p['_must']); unset($p['_must']);
            if ($done || $must) { if (!self::post($p)) self::later($p); }   // الطلبات: لازم توصل (بنستنى الرد ونعيد لو فشل)
            else self::post($p, false);                                     // السلة: من غير ما نأخّر الزائر
        }
    }

    private static function post($p, $blocking = true) {
        $p['secret'] = LTP_Core::get('webhook_secret');   // المفتاح بيتضاف وقت الإرسال بس (مابيتخزنش في قايمة الإعادة)
        $r = wp_remote_post(LTP_Core::get('webhook_url'), [
            'blocking'    => $blocking,
            'timeout'     => $blocking ? 10 : 3,
            'redirection' => $blocking ? 3 : 0,
            'headers'     => ['Content-Type' => 'application/json'],
            'body'        => wp_json_encode($p, JSON_UNESCAPED_UNICODE),
        ]);
        if (!$blocking) return true;
        if (is_wp_error($r)) return false;
        $code = (int) wp_remote_retrieve_response_code($r);
        $body = trim((string) wp_remote_retrieve_body($r));
        if ($code < 200 || $code >= 400) return false;
        // ok = اتسجل · busy/error = نعيد · forbidden/bad json = مشكلة إعداد (الإعادة مش هتفيد)
        return !preg_match('/^(busy|error)/i', $body);
    }

    private static function later($p) {
        $q = get_option(self::RETRY, []);
        if (!is_array($q)) $q = [];
        $p['_tries'] = (int) ($p['_tries'] ?? 0) + 1;
        if ($p['_tries'] > 6) return;            // 6 محاولات وبعدين بنسيبه (بيظهر في عدّاد الفشل)
        $q[] = $p;
        if (count($q) > 300) $q = array_slice($q, -300);
        update_option(self::RETRY, $q, false);
        if (!wp_next_scheduled('ltp_wc_retry')) wp_schedule_single_event(time() + 300, 'ltp_wc_retry');
    }

    public function retry() {
        $q = get_option(self::RETRY, []);
        if (!is_array($q) || !$q) return;
        update_option(self::RETRY, [], false);
        foreach ($q as $p) {
            $tries = (int) ($p['_tries'] ?? 1);
            unset($p['_tries']);
            if (!self::post($p)) { $p['_tries'] = $tries; self::later($p); }
        }
    }
}

add_action('plugins_loaded', function () {
    LTP_WooCommerce::instance();
}, 20);
