<?php
if (!defined('ABSPATH')) exit;

/**
 * Lead Tracker Pro — أهمية كل إجراء (2.7.0)
 *
 * لكل رقم ولكل زرار ولكل فورم «دور» بيحدد هو Lead ولا لأ، يتبعت لجوجل ولا لأ، وبيجيب تنبيه ولا لأ.
 * الافتراضي ماشي على «طبيعة النشاط» (رحلة العميل بتخلص فين)، وصاحب الموقع يغيّره من «اختيارك».
 */
class LTP_Roles {

    const OPT = 'ltp_roles';

    const ROLES = [
        'primary'   => ['🎯 أساسي',              'Lead أساسي · بيتبعت لجوجل كتحويل · تنبيه فوري'],
        'important' => ['⭐ مهم',                 'Lead · بيتبعت لجوجل بقيمة أقل · تنبيه'],
        'normal'    => ['▫️ عادي',                'إشارة اهتمام بس · مش Lead · من غير تنبيه'],
        'support'   => ['🛟 خدمة عملاء / شكاوى',   'بيتسجل لوحده (عدد الشكاوى = جودة العملاء) · مش Lead'],
        'dev'       => ['👨‍💻 رقم المطوّر',          'مابيتسجلش ومابيتحطش فيه كود'],
        'ignore'    => ['🚫 تجاهل',               'مابيتسجلش خالص'],
    ];

    const JOURNEYS = [
        'services' => 'خدمات — البيع بيتقفل على الواتساب أو المكالمة',
        'store'    => 'متجر — البيع بيكمل أونلاين (شراء / دفع)',
        'hybrid'   => 'مختلط — شراء أونلاين + طلبات واتساب أو دفع عند الاستلام',
        'b2b'      => 'شركات (B2B) — الصفقة بتبدأ بطلب عرض سعر',
    ];

    // [الدور, السبب] لكل نوع حسب طبيعة النشاط
    const AUTO = [
        'services' => [
            'wa'    => ['primary',   'البيع بيتقفل على الواتساب'],
            'call'  => ['primary',   'البيع بيتقفل على المكالمة'],
            'form'  => ['important', 'طلب تواصل — محتاج متابعة'],
            'sms'   => ['important', 'رسالة مباشرة للنشاط'],
            'email' => ['normal',    'نادراً بيبقى أول تواصل في الخدمات'],
            'msg'   => ['normal',    'تليجرام / ماسنجر — اهتمام'],
        ],
        'store' => [
            'wa'    => ['important', 'استفسار قبل الشراء — البيع الأساسي في الدفع'],
            'call'  => ['important', 'استفسار قبل الشراء'],
            'form'  => ['important', 'طلب تواصل'],
            'sms'   => ['normal',    'اهتمام'],
            'email' => ['normal',    'اهتمام'],
            'msg'   => ['normal',    'اهتمام'],
        ],
        'hybrid' => [
            'wa'    => ['primary',   'جزء كبير من الطلبات بيتقفل على الواتساب'],
            'call'  => ['primary',   'طلبات بالتليفون'],
            'form'  => ['important', 'طلب تواصل'],
            'sms'   => ['normal',    'اهتمام'],
            'email' => ['normal',    'اهتمام'],
            'msg'   => ['normal',    'اهتمام'],
        ],
        'b2b' => [
            'form'  => ['primary',   'طلب عرض السعر = بداية الصفقة'],
            'call'  => ['primary',   'تواصل مباشر مع صاحب قرار'],
            'wa'    => ['important', 'استفسار'],
            'email' => ['important', 'الشركات بتتواصل بالإيميل'],
            'sms'   => ['normal',    'اهتمام'],
            'msg'   => ['normal',    'اهتمام'],
        ],
    ];

    public static function journey() {
        $j = (string) LTP_Core::get('journey', '');
        if (isset(self::JOURNEYS[$j])) return $j;
        return class_exists('WooCommerce') ? 'hybrid' : 'services';
    }

    public static function label($role) { return self::ROLES[$role][0] ?? $role; }
    public static function hint($role)  { return self::ROLES[$role][1] ?? ''; }

    public static function auto($type) {
        $m = self::AUTO[self::journey()];
        return $m[$type] ?? ['normal', 'إشارة اهتمام'];
    }

    public static function load() {
        $o = get_option(self::OPT, null);
        if (!is_array($o)) {
            // ترحيل من 2.6: biz = تلقائي · ext = المطوّر
            $o = ['n' => [], 'e' => []];
            $old = get_option('ltp_number_overrides', []);
            if (is_array($old)) foreach ($old as $k => $v) if ($v === 'ext') $o['n'][(string) $k] = 'dev';
            update_option(self::OPT, $o, false);
        }
        $o += ['n' => [], 'e' => []];
        // 2.7.2: اختيارات العناصر بالشكل القديم (النوع|العنصر) بتتشال — كانت بتلمس عناصر مش مقصودة
        $old = array_filter(array_keys((array) $o['e']), function ($k) { return substr_count((string) $k, '|') < 2; });
        if ($old) { foreach ($old as $k) unset($o['e'][$k]); update_option(self::OPT, $o, false); }
        return $o;
    }

    // دور الرقم: اختيارك ← (سطر الحقوق = المطوّر) ← حسب النوع وطبيعة النشاط
    public static function number_role($k, $r, $plugins = [], $auto_only = false) {
        $o = self::load();
        if (!$auto_only && !empty($o['n'][$k])) return [$o['n'][$k], 'اختيارك'];
        if (!isset($plugins[$k]) && empty($r['normal']) && !empty($r['credit'])) return ['dev', 'ظاهر في سطر حقوق الملكية بس'];
        [$role, $why] = self::auto(!empty($r['wa']) ? 'wa' : 'call');
        return [$role, $why . (isset($plugins[$k]) ? ' · مكتوب في ' . $plugins[$k] : '')];
    }

    // 2.7.2: مفتاح العنصر = النوع | العنصر | الرقم (أو النص). «a» لوحدها ممكن تبقى كل روابط الصفحة —
    // في 2.7.0 اختيار «المطوّر» لرابط المطوّر (a) قفل كل روابط الواتساب العادية (a) في الإنجاز.
    public static function elem_key($t, $d, $n = '', $x = '') {
        $third = LTP_Numbers::key($n);
        if ($third === '') $third = mb_substr(trim(preg_replace('/\s+/u', ' ', (string) $x)), 0, 30);
        $generic = !preg_match('/[#.]/', (string) $d);   // tag بس من غير id ولا class
        if ($generic && LTP_Numbers::key($n) === '') return '';   // عام زيادة عن اللزوم: يتظبط من جدول الأرقام أو قاعدة يدوية
        if ($third === '' && $generic) return '';
        return $t . '|' . $d . '|' . $third;
    }

    public static function element_role($t, $d, $auto_only = false, $key = '') {
        $o = self::load();
        $k = $key !== '' ? $key : $t . '|' . $d;
        if (!$auto_only && !empty($o['e'][$k])) return [$o['e'][$k], 'اختيارك'];
        return self::auto($t);
    }

    // للمتصفح: الافتراضي حسب طبيعة النشاط + اختياراتك
    public static function cfg() {
        $o = self::load();
        $auto = [];
        foreach (self::AUTO[self::journey()] as $t => $v) $auto[$t] = $v[0];
        return ['auto' => $auto, 'n' => (object) $o['n'], 'e' => (object) $o['e']];
    }

    public static function select($name, $cur, $auto_role) {
        $h = '<select name="' . esc_attr($name) . '" style="max-width:190px;">';
        $h .= '<option value="">تلقائي (' . esc_html(self::label($auto_role)) . ')</option>';
        foreach (self::ROLES as $k => $v) $h .= '<option value="' . esc_attr($k) . '" title="' . esc_attr($v[1]) . '"' . selected($cur, $k, false) . '>' . esc_html($v[0]) . '</option>';
        return $h . '</select>';
    }

    public static function legend() {
        $h = '<p class="description" style="line-height:2;">';
        foreach (self::ROLES as $v) $h .= '<span style="white-space:nowrap;margin-left:14px;"><strong>' . esc_html($v[0]) . '</strong>: ' . esc_html($v[1]) . '</span> ';
        return $h . '</p>';
    }

    // حفظ الاختيارات (من جدول الأرقام أو من الجرد)
    public static function save($numbers, $elements) {
        $o = self::load();
        foreach ((array) $numbers as $k => $v) {
            $k = preg_replace('/\D/', '', (string) $k);
            if ($k === '') continue;
            if (isset(self::ROLES[$v])) $o['n'][$k] = $v; else unset($o['n'][$k]);
        }
        foreach ((array) $elements as $k => $v) {
            $k = mb_substr(sanitize_text_field((string) $k), 0, 120);
            if ($k === '' || substr_count($k, '|') < 2) continue;
            if (isset(self::ROLES[$v])) $o['e'][$k] = $v; else unset($o['e'][$k]);
        }
        if (count($o['e']) > 200) $o['e'] = array_slice($o['e'], -200, null, true);
        update_option(self::OPT, $o, false);
    }
}
