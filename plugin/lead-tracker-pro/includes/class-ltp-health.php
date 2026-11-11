<?php
if (!defined('ABSPATH')) exit;

/**
 * 2.12.2 — تقرير التوصيل (قرار محمود 11 نوفمبر: «قيس التقرير حالا ولو المشكله موجوده نشوف حل من الان»).
 *
 * المواقع اللي اتربطت بالسيرفر مابقتش بتبعت للشيت، فمقارنة الشيت بالسيرفر (بوابة S01) مابقتش تنفع.
 * البديل الأدق: البلجن بيعدّ كل حدث محلياً قبل ما يبعته (ltp_events: «اليوم|الحدث»)، وكل ساعة بيبعت العدد ده للسيرفر
 * (النهارده وامبارح، بتوقيت الموقع) ومعاه إحصائية الإرسال (فشل أول مرة · اتصلّح · في الطابور · اتسقط · اترفض).
 * السيرفر بيقارنه بالأحداث اللي وصلته فعلاً لنفس اليوم، وبيعرض النسبة في لوحة الإدارة وبيبعت تقرير الصبح على تليجرام.
 *
 * • بيتبعت بس لو الموقع مربوط وبيبعت للسيرفر (أساسي أو نسخة). مفيش أي بيانات عن الزوار: أعداد بس.
 * • طلب واحد في الساعة، في الكرون (مش وقت زيارة حد).
 */
class LTP_Health {

    const HOOK = 'ltp_health_report';

    public static function init() {
        add_action(self::HOOK, [__CLASS__, 'report']);
        add_action('init', [__CLASS__, 'schedule']);
    }

    public static function schedule() {
        if (!wp_next_scheduled(self::HOOK)) wp_schedule_event(time() + 120, 'hourly', self::HOOK);
    }

    public static function unschedule() { wp_clear_scheduled_hook(self::HOOK); }

    // عنوان السيرفر اللي الموقع بيبعت له (الأساسي لو هو السيرفر، وإلا النسخة لو متفعّلة)، أو فاضي
    public static function target() {
        if (!LTP_Pair::is_paired()) return '';
        $hook = (string) LTP_Core::get('webhook_url');
        if (LTP_Core::is_server_url($hook)) return $hook;
        if (LTP_Core::get('server_mirror')) {
            $u = trim((string) LTP_Core::get('server_url', LTP_Core::SERVER_URL));
            return strpos($u, 'https://') === 0 ? $u : '';
        }
        return '';
    }

    // أعداد يوم معيّن من العدّاد المحلي
    public static function counts($day) {
        $all = get_option('ltp_events', []);
        $out = [];
        if (is_array($all)) {
            foreach ($all as $k => $v) {
                $p = explode('|', (string) $k);
                if (count($p) === 2 && $p[0] === $day && preg_match('/^[a-z0-9_]{2,30}$/', $p[1])) $out[$p[1]] = (int) $v;
            }
        }
        return $out;
    }

    public static function payload($now = null) {
        $now = $now ?? time();
        $today = wp_date('Y-m-d', $now);
        $yday  = wp_date('Y-m-d', $now - DAY_IN_SECONDS);
        return [
            'secret'  => LTP_Core::get('webhook_secret'),
            'site_id' => LTP_Core::get('site_id'),
            'event'   => 'ltp_health',
            'time'    => wp_date('Y-m-d H:i:s', $now),
            'version' => LTP_VERSION,
            'days'    => [$today => self::counts($today), $yday => self::counts($yday)],
            'out'     => LTP_Core::out_status(),
        ];
    }

    public static function report() {
        $url = self::target();
        if ($url === '') return false;
        $res = wp_remote_post($url, [
            'timeout' => 10, 'redirection' => 0, 'blocking' => true,
            'headers' => ['Content-Type' => 'application/json'],
            'body'    => wp_json_encode(self::payload()),
        ]);
        $ok = !is_wp_error($res) && (int) wp_remote_retrieve_response_code($res) === 200;
        update_option('ltp_health_last', ['at' => gmdate('Y-m-d H:i:s'), 'ok' => $ok ? 1 : 0], false);
        return $ok;
    }
}
