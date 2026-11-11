<?php
if (!defined('ABSPATH')) exit;

/**
 * 2.12.0 — تحديث البلجن أوتوماتيك من خادم Maestro LT (قرار محمود 10 نوفمبر)
 *
 * • الخادم: ملفين ثابتين على app.maestrolt.com/plugin/ : info.json (الإصدار · الرابط · البصمة · التوقيع) والـZIP.
 * • ووردبريس بيسأل الخادم مرتين في اليوم (الهيدر «Update URI» + فلتر update_plugins_app.maestrolt.com)،
 *   ولو فيه إصدار أحدث بيعرضه، وبيحدّث لوحده في الخلفية (افتراضي مفعّل، والعميل يقدر يقفله من الإعدادات).
 * • التوقيع إلزامي: كل إصدار متوقّع بمفتاح Ed25519 خاص مع محمود بس (مش في المستودع). البلجن فيه المفتاح العام،
 *   و«مابيعرضش» تحديث توقيعه غلط، و«مابيركّبش» ملف بصمته (sha256) مش هي اللي اتوقّعت. من غير مفتاح عام = مفيش تحديثات أصلاً.
 * • القنوات: early (مواقع محمود: بتاخد الإصدار أول ما يطلع) · stable (العملاء: بعد stable_delay_days من الإصدار).
 * • مفتاح إيقاف: "stop": true في info.json بيوقف أي تحديث لكل المواقع.
 * • الخادم مابيعرفش أي حاجة عن الموقع: البلجن هو اللي بيسأل (طلب GET لملف ثابت، من غير أي بيانات).
 */
class LTP_Updater {

    private static $instance = null;

    const HOST       = 'app.maestrolt.com';
    const FEED       = 'https://app.maestrolt.com/plugin/info.json';
    const PKG_PREFIX = 'https://app.maestrolt.com/plugin/';
    const SLUG       = 'lead-tracker-pro';
    // المفتاح العام (Ed25519، 32 بايت base64). فاضي = التحديث الأوتوماتيك مقفول.
    const PUBKEY     = 'TdVe07WSQ+3wQ+u/6XettsWN46sz2Uyfh+ENKYrtnpg=';   // من محمود 11 نوفمبر (المفتاح الخاص في Cloudflare: PLUGIN_SIGNING_KEY)
    const FEED_TTL   = 21600;   // 6 ساعات
    const FAIL_TTL   = 1800;    // لو الخادم ماردش: نحاول تاني بعد نص ساعة

    public static function instance() {
        if (self::$instance === null) self::$instance = new self();
        return self::$instance;
    }

    private function __construct() {
        add_filter('update_plugins_' . self::HOST, [$this, 'offer'], 10, 4);
        add_filter('upgrader_pre_download', [$this, 'verify_download'], 10, 4);
        add_filter('auto_update_plugin', [$this, 'auto'], 10, 2);
    }

    public static function pubkey() {
        $k = defined('LTP_UPDATE_PUBKEY') ? (string) LTP_UPDATE_PUBKEY : self::PUBKEY;
        $raw = base64_decode($k, true);
        return ($raw !== false && strlen($raw) === 32) ? $raw : '';
    }

    public static function enabled() { return self::pubkey() !== ''; }

    public static function channel() {
        $c = (string) LTP_Core::get('update_channel', 'stable');
        return $c === 'early' ? 'early' : 'stable';
    }

    public static function message($version, $sha256) {
        return self::SLUG . '|' . $version . '|' . strtolower($sha256);
    }

    // التوقيع صح بالمفتاح العام اللي جوه البلجن؟
    public static function signature_ok($version, $sha256, $sig_b64) {
        $pk = self::pubkey();
        if ($pk === '') return false;
        $sig = base64_decode((string) $sig_b64, true);
        if ($sig === false || strlen($sig) !== 64) return false;
        try {
            return (bool) sodium_crypto_sign_verify_detached($sig, self::message($version, $sha256), $pk);
        } catch (\Throwable $e) {
            return false;
        }
    }

    // info.json (من الكاش 6 ساعات)
    public static function feed($fresh = false) {
        if (!$fresh) {
            $c = get_transient('ltp_upd_feed');
            if (is_array($c)) return $c;
        }
        $res = wp_remote_get(self::FEED, ['timeout' => 8, 'redirection' => 0, 'headers' => ['Accept' => 'application/json']]);
        $j = (!is_wp_error($res) && (int) wp_remote_retrieve_response_code($res) === 200) ? json_decode(wp_remote_retrieve_body($res), true) : null;
        if (!is_array($j)) {
            self::note('error', is_wp_error($res) ? 'feed: ' . substr($res->get_error_message(), 0, 80) : 'feed: bad reply');
            set_transient('ltp_upd_feed', ['_failed' => 1], self::FAIL_TTL);
            return ['_failed' => 1];
        }
        set_transient('ltp_upd_feed', $j, self::FEED_TTL);
        self::note('checked', gmdate('Y-m-d H:i:s'));
        return $j;
    }

    // الإصدار المتاح للموقع ده، أو null. كل الشروط لازم تتحقق (ولو شرط واحد فشل: مفيش تحديث).
    public static function pick($feed, $now = null) {
        if (!self::enabled() || !is_array($feed) || !empty($feed['_failed'])) return null;
        if (!empty($feed['stop'])) return null;
        $e = $feed['latest'] ?? null;
        if (!is_array($e)) return null;
        $v   = (string) ($e['version'] ?? '');
        $pkg = (string) ($e['package'] ?? '');
        $sha = strtolower((string) ($e['sha256'] ?? ''));
        if (!preg_match('/^\d+\.\d+\.\d+$/', $v) || !version_compare($v, LTP_VERSION, '>')) return null;
        if (strpos($pkg, self::PKG_PREFIX) !== 0 || !preg_match('/^[a-f0-9]{64}$/', $sha)) return null;
        if (self::channel() === 'stable') {
            $rel = strtotime((string) ($e['released_at'] ?? ''));
            $delay = max(0, (int) ($feed['stable_delay_days'] ?? 3)) * DAY_IN_SECONDS;
            if (!$rel || ($now ?? time()) < $rel + $delay) return null;
        }
        if (!self::signature_ok($v, $sha, $e['sig'] ?? '')) { self::note('error', 'bad signature for ' . $v); return null; }
        return ['version' => $v, 'package' => $pkg, 'sha256' => $sha, 'sig' => (string) $e['sig'],
                'requires' => (string) ($e['requires'] ?? ''), 'requires_php' => (string) ($e['requires_php'] ?? ''), 'tested' => (string) ($e['tested'] ?? ''),
                'notes' => (string) ($e['notes'] ?? '')];
    }

    // ووردبريس بيسأل: فيه تحديث؟
    public function offer($update, $plugin_data, $plugin_file, $locales) {
        if ($plugin_file !== LTP_BASENAME) return $update;
        $e = self::pick(self::feed());
        if (!$e) return $update;
        self::note('available', $e['version']);
        return [
            'slug'         => self::SLUG,
            'version'      => $e['version'],
            'url'          => 'https://' . self::HOST,
            'package'      => $e['package'],
            'requires'     => $e['requires'],
            'requires_php' => $e['requires_php'],
            'tested'       => $e['tested'],
        ];
    }

    // قبل التركيب: نحمّل الملف بنفسنا ونتأكد من بصمته وتوقيعه. لو أي حاجة غلط: التركيب بيتلغى.
    public function verify_download($reply, $package, $upgrader = null, $hook_extra = []) {
        if ($reply !== false || !is_string($package) || strpos($package, self::PKG_PREFIX) !== 0) return $reply;
        $e = self::pick(self::feed());
        if (!$e || $e['package'] !== $package) {
            self::note('error', 'package not in a valid signed feed');
            return new WP_Error('ltp_update_unverified', 'Lead Tracker Pro: التحديث ده مش متوقّع من Maestro LT، فاتلغى.');
        }
        $tmp = download_url($package, 120);
        if (is_wp_error($tmp)) return $tmp;
        $hash = strtolower((string) hash_file('sha256', $tmp));
        if (!hash_equals($e['sha256'], $hash) || !self::signature_ok($e['version'], $hash, $e['sig'])) {
            @unlink($tmp);
            self::note('error', 'checksum/signature mismatch for ' . $e['version']);
            return new WP_Error('ltp_update_bad_package', 'Lead Tracker Pro: ملف التحديث مش مطابق للتوقيع، فاتلغى ومااتركّبش.');
        }
        self::note('verified', $e['version']);
        return $tmp;
    }

    // التحديث التلقائي في الخلفية (افتراضي مفعّل)
    public function auto($update, $item) {
        if (!is_object($item) || ($item->plugin ?? '') !== LTP_BASENAME) return $update;
        if (!self::enabled()) return $update;
        return (string) LTP_Core::get('auto_update', '1') === '0' ? false : true;
    }

    private static function note($k, $v) {
        $s = get_option('ltp_upd_status', []);
        if (!is_array($s)) $s = [];
        $s[$k] = substr((string) $v, 0, 120);
        if ($k === 'error') $s['error_at'] = gmdate('Y-m-d H:i:s');
        update_option('ltp_upd_status', $s, false);
    }

    public static function status() {
        $s = get_option('ltp_upd_status', []);
        return is_array($s) ? $s : [];
    }

    // 2.12.0: مرة واحدة بعد التحديث: القيم اللي جاية من config.json تتنسخ لقاعدة البيانات
    // (علشان التحديثات الجاية — اللي config.json بتاعها فاضي — ماتقطعش ربط المواقع اللي كانت معتمدة عليه)،
    // ونسخة الشغل بتاعتنا (اللي فيها رابط الشيت) بتاخد قناة early.
    public static function migrate_config() {
        if (get_option('ltp_cfg_migrated')) return;
        $cfg = LTP_Core::load_config();
        foreach (['webhook_url', 'webhook_secret', 'site_label', 'server_host'] as $k) {
            $db = get_option('ltp_' . $k, null);
            if (($db === null || $db === '') && !empty($cfg[$k])) update_option('ltp_' . $k, $cfg[$k]);
        }
        if (get_option('ltp_update_channel', null) === null && !empty($cfg['webhook_url'])) update_option('ltp_update_channel', 'early');
        update_option('ltp_cfg_migrated', LTP_VERSION, false);
    }
}
