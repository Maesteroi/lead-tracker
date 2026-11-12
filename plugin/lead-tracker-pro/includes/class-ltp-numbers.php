<?php
if (!defined('ABSPATH')) exit;

/**
 * 2.6.0 — أرقام الواتساب والاتصال: بتتلقط لوحدها من جرد الصفحات، والبلجن بيميّز رقم الموقع من الرقم الخارجي (زي المطوّر).
 * - الموقع ممكن يبقى فيه أرقام كتير: كلها «رقم الموقع» طالما مش في سطر حقوق الملكية.
 * - الفوتر نفسه مش دليل: الخارجي = اللي ظاهر في سطر الحقوق بس (©، «جميع الحقوق»، «تصميم وتطوير»، Powered by).
 * - تغيير الأرقام: رقم جديد ظهر / رقم قديم اختفى = تنبيه في لوحة البلجن.
 * المفتاح = آخر 8 أرقام (عشان المحلي والدولي يبقوا نفس الرقم: الكويت 8 أرقام، السعودية 9، مصر 10).
 */
class LTP_Numbers {

    const OPT     = 'ltp_numbers';
    const OVR     = 'ltp_number_overrides';
    const SINCE   = 'ltp_numbers_since';
    const MAX     = 50;
    const NEW_DAYS  = 7;
    const GONE_DAYS = 14;

    private static $instance = null;

    public static function instance() {
        if (self::$instance === null) self::$instance = new self();
        return self::$instance;
    }

    private function __construct() {
        add_action('admin_post_ltp_numbers_save', [$this, 'save_overrides']);
        add_action('admin_notices', [$this, 'notice']);
    }

    public static function key($n) {
        $d = preg_replace('/\D/', '', (string) $n);
        return strlen($d) >= 7 ? substr($d, -8) : '';
    }

    // ─── التجميع من الجرد ───
    public static function ingest($path, $items, $ver = '') {
        $all = get_option(self::OPT, []);
        if (!is_array($all)) $all = [];
        // 2.6.1: المفتاح بقى 8 أرقام — بيانات 2.6.0 (ساعات) بتتبني من جديد
        if ($all && strlen((string) array_key_first($all)) !== 8) { $all = []; delete_option(self::OVR); }
        if (!get_option(self::SINCE)) update_option(self::SINCE, time(), false);
        $now = time();
        $changed = false;

        foreach ((array) $items as $it) {
            if (!in_array($it['t'] ?? '', ['wa', 'call'], true)) continue;
            $k = self::key($it['n'] ?? '');
            if ($k === '') continue;
            if (!isset($all[$k])) {
                if (count($all) >= self::MAX) continue;
                $all[$k] = ['num' => '', 'wa' => 0, 'call' => 0, 'pos' => [], 'pages' => [], 'credit' => 0, 'normal' => 0, 'text' => 0, 'clicks' => 0, 'first' => $now, 'last' => $now];
            }
            $r = &$all[$k];
            // 2.6.6: نسخة جديدة من كود الكشف ← عدّادات «خارجي/عادي» بتتبني من جديد (عشان غلطة قديمة ماتفضلش لازقة)
            if ($ver !== '' && version_compare($ver, (string) ($r['ver'] ?? '0'), '>')) { $r['credit'] = 0; $r['normal'] = 0; $r['ver'] = $ver; }
            elseif ($ver !== '' && version_compare($ver, (string) ($r['ver'] ?? '0'), '<')) continue;   // صفحة متخزنة بكود قديم: مانعتمدش تصنيفها
            $num = preg_replace('/\D/', '', (string) $it['n']);
            if (strlen($num) > strlen($r['num'])) $r['num'] = $num;   // الصيغة الأطول (بمفتاح الدولة)
            if (($it['v'] ?? '') === 'text') $r['text']++;
            elseif ($it['t'] === 'wa') $r['wa'] = 1;
            else $r['call'] = 1;
            if (!empty($it['cr'])) $r['credit']++; else $r['normal']++;
            $p = (string) ($it['p'] ?? '');
            if ($p !== '') $r['pos'][$p] = ($r['pos'][$p] ?? 0) + 1;
            if (count($r['pages']) < 30) $r['pages'][$path] = 1;
            if (!empty($it['h'])) $r['bad'] = (string) $it['h'];
            $r['last'] = $now;
            unset($r);
            $changed = true;
        }
        if ($changed) update_option(self::OPT, $all, false);
    }

    // ─── ضغطة على رقم (من حدث الضغطة) ───
    public static function click($tnum) {
        $k = self::key($tnum);
        if ($k === '') return;
        $all = get_option(self::OPT, []);
        if (!is_array($all) || !isset($all[$k])) return;
        $all[$k]['clicks'] = (int) ($all[$k]['clicks'] ?? 0) + 1;
        update_option(self::OPT, $all, false);
    }

    // ─── أرقام مكتوبة في إعدادات إضافات الواتساب = أرقام الموقع أكيد ───
    public static function plugin_keys() {
        $out = [];
        $jc = get_option('joinchat');
        if (is_array($jc) && !empty($jc['telephone'])) $out[self::key($jc['telephone'])] = 'Joinchat';
        $ctc = get_option('ht_ctc_chat_options');
        if (is_array($ctc) && !empty($ctc['number'])) $out[self::key($ctc['number'])] = 'Click to Chat';
        unset($out['']);
        return $out;
    }

    // biz = رقم الموقع · ext = خارجي · unsure = مش متأكد
    public static function auto_status($r, $k, $plugins) {
        if (isset($plugins[$k])) return 'biz';
        if (($r['normal'] ?? 0) > 0) return 'biz';
        if (($r['credit'] ?? 0) > 0) return 'ext';
        return 'unsure';
    }

    // 2.7.0: «ext» = دوره «رقم المطوّر» أو «تجاهل» (من LTP_Roles)
    public static function status($k, $r = null, $plugins = null, $ovr = null) {
        if ($r === null) { $all = get_option(self::OPT, []); $r = $all[$k] ?? []; }
        if ($plugins === null) $plugins = self::plugin_keys();
        [$role] = LTP_Roles::number_role((string) $k, (array) $r, $plugins);
        return in_array($role, ['dev', 'ignore'], true) ? 'ext' : 'biz';
    }

    // الأرقام اللي مايتحطش فيها كود ومابتتحسبش تواصل للنشاط
    public static function skip_keys() {
        $all = get_option(self::OPT, []);
        if (!is_array($all)) return [];
        $plugins = self::plugin_keys();
        $out = [];
        foreach ($all as $k => $r) {
            if (self::status((string) $k, $r, $plugins) === 'ext') $out[] = (string) $k;
        }
        // أرقام اتعلّمت «مطوّر / تجاهل» حتى لو لسه مااتلقطتش في الجرد
        foreach (LTP_Roles::load()['n'] as $k => $role) if (in_array($role, ['dev', 'ignore'], true) && !in_array((string) $k, $out, true)) $out[] = (string) $k;
        return $out;
    }

    // ─── التغييرات: رقم جديد ظهر · رقم اختفى ───
    public static function changes() {
        $all = get_option(self::OPT, []);
        if (!is_array($all) || !$all) return ['new' => [], 'gone' => []];
        $since = (int) get_option(self::SINCE, time());
        $now = time();
        $plugins = self::plugin_keys();
        $new = $gone = [];
        foreach ($all as $k => $r) {
            if (self::status((string) $k, $r, $plugins) === 'ext') continue;
            $first = (int) ($r['first'] ?? $now);
            $last  = (int) ($r['last'] ?? $now);
            // «جديد» بس لو الجرد شغال من قبله بأسبوع (عشان أول تركيب مايطلعش كله جديد)
            if ($first - $since > DAY_IN_SECONDS * self::NEW_DAYS && $now - $first < DAY_IN_SECONDS * self::NEW_DAYS) $new[] = ($r['num'] ?? '') ?: $k;
            if ($now - $last > DAY_IN_SECONDS * self::GONE_DAYS) $gone[] = ($r['num'] ?? '') ?: $k;
        }
        return ['new' => $new, 'gone' => $gone];
    }

    public function notice() {
        if (!current_user_can('manage_options')) return;
        $screen = function_exists('get_current_screen') ? get_current_screen() : null;
        if (!$screen || strpos((string) $screen->id, 'lead-tracker') === false) return;
        $c = self::changes();
        if (!$c['new'] && !$c['gone']) return;
        echo '<div class="notice notice-warning"><p><strong>📞 تغيير في أرقام التواصل:</strong> ';
        if ($c['new'])  echo 'ظهر رقم جديد في الموقع: <code dir="ltr">' . esc_html(implode('، ', $c['new'])) . '</code>. ';
        if ($c['gone']) echo 'رقم لم يعد ظاهرًا منذ أكثر من ' . (int) self::GONE_DAYS . ' يومًا: <code dir="ltr">' . esc_html(implode('، ', $c['gone'])) . '</code>. ';
        echo 'راجع جدول «الأرقام الملتقطة».</p></div>';
    }

    // ─── لوحة التحكم ───
    public static function card() {
        $all = get_option(self::OPT, []);
        $plugins = self::plugin_keys();
        $roles = LTP_Roles::load();
        ?>
        <div class="ltp-card">
            <h3>📞 الأرقام الملتقطة</h3>
            <p class="description">تُلتقط تلقائيًا من صفحات الموقع. «تلقائي» يتبع طبيعة نشاطك (<strong><?php echo esc_html(LTP_Roles::JOURNEYS[LTP_Roles::journey()]); ?></strong> — تُغيَّر من الإعدادات)، والرقم الموجود في سطر حقوق الملكية فقط = رقم المطوّر. إذا كان شيء خاطئًا، فغيّره من «اختيارك».</p>
            <?php echo LTP_Roles::legend(); // phpcs:ignore ?>
            <?php if (!is_array($all) || !$all): ?>
                <p>لا توجد أرقام بعد. ستظهر بعد أولى زيارات الموقع بعد التحديث.</p>
            <?php else: ?>
            <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
                <input type="hidden" name="action" value="ltp_numbers_save">
                <?php wp_nonce_field('ltp_numbers_save', '_ltp_num_nonce'); ?>
                <table class="ltp-table widefat striped">
                    <thead><tr><th>الرقم</th><th>النوع</th><th>المكان</th><th>صفحات</th><th>نقرات</th><th>آخر ظهور</th><th>تلقائي</th><th>اختيارك</th></tr></thead>
                    <tbody>
                    <?php
                    uasort($all, function ($a, $b) { return ($b['clicks'] ?? 0) <=> ($a['clicks'] ?? 0) ?: (($b['normal'] ?? 0) <=> ($a['normal'] ?? 0)); });
                    foreach ($all as $k => $r):
                        $k = (string) $k;
                        $types = [];
                        if (!empty($r['wa'])) $types[] = '💬 واتساب';
                        if (!empty($r['call'])) $types[] = '📞 اتصال';
                        if (!$types && !empty($r['text'])) $types[] = '📝 نص دون رابط';
                        elseif (!empty($r['text'])) $types[] = '+ نص';
                        $pos = (array) ($r['pos'] ?? []); arsort($pos);
                        $cur = $roles['n'][$k] ?? '';
                        $plain = LTP_Roles::number_role($k, $r, $plugins, true);   // التلقائي = من غير اختيارك
                    ?>
                        <tr>
                            <td dir="ltr"><code><?php echo esc_html($r['num'] ?: $k); ?></code><?php if (!empty($r['bad'])): ?><br><span style="color:#b32d2e;" dir="rtl">🔴 <?php echo esc_html($r['bad']); ?></span><?php endif; ?></td>
                            <td><?php echo esc_html(implode(' ', $types)); ?></td>
                            <td><?php echo esc_html(implode('، ', array_slice(array_keys($pos), 0, 3))); ?></td>
                            <td><?php echo (int) count((array) ($r['pages'] ?? [])); ?></td>
                            <td><?php echo (int) ($r['clicks'] ?? 0); ?></td>
                            <td><?php echo esc_html(wp_date('Y-m-d', (int) ($r['last'] ?? time()))); ?></td>
                            <td><?php echo esc_html(LTP_Roles::label($plain[0])); ?><br><small style="color:#666;"><?php echo esc_html($plain[1]); ?></small></td>
                            <td><?php echo LTP_Roles::select('role_n[' . $k . ']', $cur, $plain[0]); // phpcs:ignore ?></td>
                        </tr>
                    <?php endforeach; ?>
                    </tbody>
                </table>
                <p><button type="submit" class="button">💾 حفظ الاختيارات</button></p>
            </form>
            <?php endif; ?>
        </div>
        <?php
    }

    public function save_overrides() {
        if (!current_user_can('manage_options')) wp_die('غير مسموح');
        check_admin_referer('ltp_numbers_save', '_ltp_num_nonce');
        $n = isset($_POST['role_n']) && is_array($_POST['role_n']) ? wp_unslash($_POST['role_n']) : [];
        $e = isset($_POST['role_e']) && is_array($_POST['role_e']) ? wp_unslash($_POST['role_e']) : [];
        LTP_Roles::save($n, $e);
        wp_safe_redirect(admin_url('admin.php?page=lead-tracker-pro&numsaved=1'));
        exit;
    }
}
