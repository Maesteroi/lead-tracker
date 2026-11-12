<?php
if (!defined('ABSPATH')) exit;

/**
 * 2.13.0 — تسجيل الزيارة كفيديو (rrweb · MIT). محمود 11 نوفمبر: «اعمل rrweb… مش عايز نسخة بالظبط من ClickBan عايز أفضل».
 *
 * • زوار الإعلان بس، وبعد ما الصفحة تفتح خالص (مابيأثرش على سرعة الموقع). السكريبت (~24KB مضغوط) بيتحمّل بس للزيارات دي.
 * • الخصوصية: كل خانات الكتابة متخبية (maskAllInputs) · أي عنصر عليه class="ltp-no-rec" مابيتسجلش ·
 *   صفحات الدفع والسلة والحساب مابتتسجلش · لو الموافقة على الكوكيز مطلوبة، مابيسجّلش غير بعد الموافقة.
 * • المتصفح بيبعت التسجيل لسيرفر Maestro على طول (مش لووردبريس)، فمفيش أي حِمل على الموقع.
 *   الإذن: الموقع بيدّي المتصفح تذكرة للجلسة دي بس، صالحة ساعتين، موقّعة بـ HMAC-SHA256 بمفتاح = sha256(مفتاح الموقع).
 *   المفتاح نفسه مابيطلعش من ووردبريس، والسيرفر عنده نفس البصمة (key_hash) فبيتحقق.
 * • بيشتغل بس لو الموقع مربوط بسيرفر Maestro. السيرفر بيقرر في أول طلب (الحساب مقفول له · حد اليوم · الإيقاف العام).
 * • خيار ltp_replay_off (مخفي، من قاعدة البيانات) = مقفول على الموقع ده. التشغيل والإيقاف الأساسي لكل حساب من لوحة إدارة Maestro.
 */
class LTP_Replay {

    const TTL = 7200;   // ساعتين

    public static function init() {
        add_action('rest_api_init', [__CLASS__, 'routes']);
    }

    public static function routes() {
        register_rest_route('lt/v1', '/replay-token', [
            'methods'             => 'POST',
            'permission_callback' => '__return_true',
            'callback'            => [__CLASS__, 'token'],
        ]);
    }

    // مربوط بالسيرفر ومعاه مفتاح؟ (التسجيل بيروح للسيرفر بس، مش للشيت)
    public static function ready() {
        if (LTP_Core::get('replay_off')) return false;
        if (!LTP_Core::is_server_url((string) LTP_Core::get('webhook_url'))) return false;
        return self::site() !== '' && (string) LTP_Core::get('webhook_secret') !== '';
    }

    private static function site() { return preg_replace('/[^A-Za-z0-9]/', '', (string) LTP_Core::get('site_id')); }

    // إعدادات المتصفح (بتتضاف لـ LTP_CFG) — أو null
    public static function cfg() {
        if (!self::ready()) return null;
        return [
            'tk' => esc_url_raw(rest_url('lt/v1/replay-token')),
            'js' => LTP_URL . 'assets/rrweb-record.min.js?ver=2.2.2',
        ];
    }

    // نفس اللي السيرفر بيتحقق منه (server/src/replay.js: replayToken)
    public static function sign($site, $sid, $exp) {
        $key = hash('sha256', (string) LTP_Core::get('webhook_secret'));
        return $site . '.' . $sid . '.' . $exp . '.' . hash_hmac('sha256', 'replay|' . $site . '|' . $sid . '|' . $exp, $key);
    }

    public static function token($req) {
        if (function_exists('nocache_headers')) nocache_headers();
        if (!self::ready()) return new WP_REST_Response(['ok' => false], 200);
        $p = $req->get_json_params();
        $sid = is_array($p) ? (string) ($p['sid'] ?? '') : '';
        if (!preg_match('/^[A-Za-z0-9_-]{4,64}$/', $sid)) return new WP_REST_Response(['ok' => false, 'error' => 'sid'], 400);
        $exp = time() + self::TTL;
        return new WP_REST_Response([
            'ok' => true,
            't'  => self::sign(self::site(), $sid, $exp),
            'u'  => 'https://' . LTP_Core::server_host() . '/v1/replay',
        ], 200);
    }
}
