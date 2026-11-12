<?php
if (!defined('ABSPATH')) exit;

/**
 * Lead Tracker Pro — إشعارات تليجرام لصاحب الموقع (2.7.0)
 *
 * لينك دعوة بكود مؤقت: بيشتغل مرة واحدة ولمدة 7 أيام (لو اتبعت لحد غلط بعد ما اتستخدم، مايقدرش يربط نفسه).
 * الموقع يقدر يتربط بأكتر من شات (صاحب الشغل + المبيعات)، وكل شات ليه زرار «فصل».
 * الكود بيتسجل عند الاستقبال (كود الشيت) قبل ما اللينك يظهر — مفيش كود بيتولّد في المتصفح.
 */
class LTP_Telegram {

    const OPT     = 'ltp_tg_invite';
    const BOT     = 'LeadTrackerpro_Bot';
    const TTL     = 7 * DAY_IN_SECONDS;

    private static $instance = null;

    public static function instance() {
        if (self::$instance === null) self::$instance = new self();
        return self::$instance;
    }

    private function __construct() {
        add_action('admin_post_ltp_tg_invite', [$this, 'invite']);
        add_action('admin_post_ltp_tg_remove', [$this, 'remove']);
    }

    private static function call($event, $extra = []) {
        $url = LTP_Core::get('webhook_url');
        if (!$url || !LTP_Pair::is_paired()) return ['ok' => false, 'error' => 'الموقع غير مربوط بالجدول بعد'];
        $r = wp_remote_post($url, [
            'timeout' => 15, 'redirection' => 3,
            'headers' => ['Content-Type' => 'application/json'],
            'body'    => wp_json_encode(array_merge([
                'event'    => $event,
                'secret'   => LTP_Core::get('webhook_secret'),
                'site_id'  => LTP_Core::get('site_id'),
                'site'     => LTP_Core::get('site_label', get_bloginfo('name')),
                'home_url' => home_url('/'),
            ], $extra)),
        ]);
        if (is_wp_error($r)) return ['ok' => false, 'error' => $r->get_error_message()];
        $j = json_decode((string) wp_remote_retrieve_body($r), true);
        if (!is_array($j)) return ['ok' => false, 'error' => 'شيفرة الجدول تحتاج إلى تحديث (v3.3) — الرد: ' . mb_substr(trim((string) wp_remote_retrieve_body($r)), 0, 40)];
        return $j;
    }

    public function invite() {
        if (!current_user_can('manage_options')) wp_die('غير مسموح');
        check_admin_referer('ltp_tg_invite');
        $token = strtolower(wp_generate_password(10, false, false));
        $exp   = time() + self::TTL;
        $res   = self::call('tg_invite', ['token' => $token, 'exp' => $exp]);
        if (!empty($res['ok'])) {
            update_option(self::OPT, ['link' => 'https://t.me/' . self::BOT . '?start=' . LTP_Core::get('site_id') . '_' . $token, 'exp' => $exp], false);
            $q = 'tg=ok';
        } else {
            $q = 'tg=err&tgm=' . rawurlencode(mb_substr((string) ($res['error'] ?? 'خطأ'), 0, 120));
        }
        delete_transient('ltp_tg_list');
        wp_safe_redirect(admin_url('admin.php?page=lead-tracker-pro&' . $q . '#ltp-tg'));
        exit;
    }

    public function remove() {
        if (!current_user_can('manage_options')) wp_die('غير مسموح');
        check_admin_referer('ltp_tg_remove');
        $chat = preg_replace('/[^0-9\-]/', '', (string) ($_POST['chat'] ?? ''));
        $res  = $chat !== '' ? self::call('tg_remove', ['chat' => $chat]) : ['ok' => false];
        delete_transient('ltp_tg_list');
        wp_safe_redirect(admin_url('admin.php?page=lead-tracker-pro&tg=' . (!empty($res['ok']) ? 'removed' : 'err') . '#ltp-tg'));
        exit;
    }

    public static function card() {
        $inv   = get_option(self::OPT, []);
        $valid = is_array($inv) && !empty($inv['link']) && (int) $inv['exp'] > time();
        $list  = get_transient('ltp_tg_list');
        if (!is_array($list)) {
            $list = LTP_Pair::is_paired() ? self::call('tg_list') : ['ok' => false];
            // 2.7.2: الفشل كمان يتخزن ساعة — كود الشيت القديم (قبل v3.3) كان بيكتب «tg_list» صف في الشيت مع كل فتحة للوحة
            set_transient('ltp_tg_list', $list, !empty($list['ok']) ? 5 * MINUTE_IN_SECONDS : HOUR_IN_SECONDS);
        }
        $chats = !empty($list['ok']) && is_array($list['chats'] ?? null) ? $list['chats'] : null;
        ?>
        <div class="ltp-card" id="ltp-tg">
            <h3>🔔 إشعارات تيليجرام</h3>
            <?php if (isset($_GET['tg'])): $t = sanitize_key($_GET['tg']); ?>
                <div class="notice <?php echo $t === 'err' ? 'notice-error' : 'notice-success'; ?> inline"><p>
                    <?php echo $t === 'ok' ? '✅ أُنشئ رابط جديد' : ($t === 'removed' ? '✅ فُصلت المحادثة' : '❌ ' . esc_html(sanitize_text_field(wp_unslash($_GET['tgm'] ?? 'تعذّر الوصول إلى شيفرة الجدول')))); ?>
                </p></div>
            <?php endif; ?>
            <p class="description">أرسل الرابط إلى صاحب الموقع (أو موظف المبيعات): يفتحه وينقر «Start» في البوت، وبعدها تصله تنبيهات هذا الموقع فقط. يعمل الرابط <strong>مرة واحدة</strong> ولمدة <strong>7 أيام</strong> — لكل شخص رابط.</p>

            <?php if ($valid): ?>
                <p>
                    <input type="text" readonly class="large-text code" dir="ltr" id="ltp-tg-link" value="<?php echo esc_attr($inv['link']); ?>" onclick="this.select();">
                </p>
                <p>
                    <button type="button" class="button" onclick="var i=document.getElementById('ltp-tg-link');i.select();try{navigator.clipboard.writeText(i.value);}catch(e){document.execCommand('copy');}this.textContent='✅ نُسخ';">📋 نسخ اللينك</button>
                    <span class="description">ينتهي <?php echo esc_html(wp_date('Y-m-d H:i', (int) $inv['exp'])); ?></span>
                </p>
            <?php endif; ?>

            <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" style="margin:8px 0 14px;">
                <input type="hidden" name="action" value="ltp_tg_invite">
                <?php wp_nonce_field('ltp_tg_invite'); ?>
                <button type="submit" class="button button-primary">🔗 <?php echo $valid ? 'رابط جديد لشخص آخر' : 'أنشئ رابط إشعارات'; ?></button>
            </form>

            <h4 style="margin:10px 0 6px;">المحادثات المربوطة</h4>
            <?php if ($chats === null): ?>
                <p class="description">⚠️ تعذّرت قراءة القائمة<?php echo !empty($list['error']) ? ': ' . esc_html($list['error']) : ''; ?>.</p>
            <?php elseif (!$chats): ?>
                <p class="description">لا يوجد أحد مربوط بعد.</p>
            <?php else: ?>
                <table class="ltp-table widefat striped">
                    <thead><tr><th>الاسم</th><th>Chat ID</th><th>تاريخ الربط</th><th></th></tr></thead>
                    <tbody>
                    <?php foreach ($chats as $c): ?>
                        <tr>
                            <td><?php echo esc_html($c['name'] ?? '—'); ?></td>
                            <td dir="ltr"><code><?php echo esc_html($c['id'] ?? ''); ?></code></td>
                            <td><?php echo esc_html($c['at'] ?? '—'); ?></td>
                            <td>
                                <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" onsubmit="return confirm('فصل هذه المحادثة عن إشعارات الموقع؟');">
                                    <input type="hidden" name="action" value="ltp_tg_remove">
                                    <input type="hidden" name="chat" value="<?php echo esc_attr($c['id'] ?? ''); ?>">
                                    <?php wp_nonce_field('ltp_tg_remove'); ?>
                                    <button type="submit" class="button-link-delete">فصل</button>
                                </form>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                    </tbody>
                </table>
            <?php endif; ?>
        </div>
        <?php
    }
}
