<?php
if (!defined('ABSPATH')) exit;

class LTP_Settings {

    // 2.8.3: دول الاستهداف (الكود = اللي جوجل وCloudflare بيستخدموه)
    const TARGET_COUNTRIES = ['SA' => 'السعودية', 'EG' => 'مصر', 'KW' => 'الكويت', 'AE' => 'الإمارات', 'QA' => 'قطر', 'BH' => 'البحرين', 'OM' => 'عُمان', 'JO' => 'الأردن'];

    private static $instance = null;

    public static function instance() {
        if (self::$instance === null) self::$instance = new self();
        return self::$instance;
    }

    private function __construct() {
        add_action('admin_menu', [$this, 'menu']);
        add_action('admin_enqueue_scripts', [$this, 'assets']);
        add_action('admin_post_ltp_save', [$this, 'save']);
        add_action('admin_post_ltp_reset_db', [$this, 'reset_db']);
    }

    public function menu() {
        add_menu_page(
            'Lead Tracker Pro',
            'Lead Tracker',
            'manage_options',
            'lead-tracker-pro',
            [$this, 'page_dashboard'],
            'dashicons-chart-line',
            58
        );

        add_submenu_page(
            'lead-tracker-pro',
            'لوحة التحكم',
            'لوحة التحكم',
            'manage_options',
            'lead-tracker-pro',
            [$this, 'page_dashboard']
        );

        add_submenu_page(
            'lead-tracker-pro',
            'الإعدادات',
            'الإعدادات',
            'manage_options',
            'lead-tracker-settings',
            [$this, 'page_settings']
        );
    }

    public function assets($hook) {
        if (strpos($hook, 'lead-tracker') === false) return;
        wp_enqueue_style('ltp-admin', LTP_URL . 'assets/admin.css', [], LTP_VERSION);
        wp_enqueue_script('ltp-admin', LTP_URL . 'assets/admin.js', ['jquery'], LTP_VERSION, true);
        wp_localize_script('ltp-admin', 'LTP_ADMIN', [
            'ajax'  => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce('ltp_test'),
        ]);
    }

    // ═══════════════════════════════════════════════════════
    // هل القيمة دي جاية من config.json؟
    // ═══════════════════════════════════════════════════════
    private function from_config($key) {
        $db_val = get_option('ltp_' . $key, null);
        if ($db_val !== null && $db_val !== '') return false;

        $config = LTP_Core::load_config();
        return isset($config[$key]) && $config[$key] !== '' && $config[$key] !== null;
    }

    private function field_label($key, $label) {
        $icon = $this->from_config($key)
            ? ' <span style="color:#2271b1;" title="من config.json">📄</span>'
            : '';
        return $label . $icon;
    }

    // ═══════════════════════════════════════════════════════
    // لوحة التحكم
    // ═══════════════════════════════════════════════════════
    public function page_dashboard() {
        $events = get_option('ltp_events', []);
        $last7  = [];
        $total  = ['page_view' => 0, 'click' => 0, 'scroll_50' => 0, 'scroll_90' => 0, 'exit' => 0];

        for ($i = 6; $i >= 0; $i--) {
            $d = wp_date('Y-m-d', strtotime("-{$i} days"));
            $last7[$d] = ['page_view' => 0, 'click' => 0];
            foreach ($events as $k => $c) {
                if (strpos($k, $d . '|') === 0) {
                    $e = substr($k, 11);
                    if (isset($last7[$d][$e])) $last7[$d][$e] = $c;
                    if (isset($total[$e])) $total[$e] += $c;
                }
            }
        }

        $webhook = LTP_Pair::is_paired();
        $site_id = LTP_Core::get('site_id');
        $source  = $this->from_config('webhook_url') ? '📄 config.json' : '💾 Database';
        ?>
        <div class="wrap ltp-wrap">
            <h1>📊 Lead Tracker Pro</h1>

            <div class="ltp-status-grid">
                <div class="ltp-card">
                    <h3>الحالة</h3>
                    <p>
                        <?php if ($webhook): ?>
                            <span class="ltp-badge ltp-on">✅ متصل بـ Google Sheet</span>
                        <?php else: ?>
                            <span class="ltp-badge ltp-off"><?php echo esc_html(LTP_Pair::state_text((string) LTP_Core::get('pair_state', ''))); ?></span>
                        <?php endif; ?>
                    </p>
                    <p><strong>المصدر:</strong> <?php echo esc_html($source); ?></p>
                    <p><strong>الموقع:</strong> <?php echo esc_html(LTP_Core::get('site_label', get_bloginfo('name'))); ?></p>
                    <p><strong>Site ID:</strong> <code><?php echo esc_html($site_id); ?></code></p>
                </div>

                <div class="ltp-card">
                    <h3>آخر 7 أيام</h3>
                    <p><strong>👁️ زيارات:</strong> <?php echo number_format($total['page_view']); ?></p>
                    <p><strong>📞 نقرات:</strong> <?php echo number_format($total['click']); ?></p>
                    <p><strong>📉 معدل التحويل:</strong>
                        <?php echo $total['page_view'] > 0 ? round(($total['click'] / $total['page_view']) * 100, 2) : 0; ?>%
                    </p>
                </div>

                <div class="ltp-card">
                    <h3>الأحداث (7 أيام)</h3>
                    <p>👁️ Page View: <strong><?php echo number_format($total['page_view']); ?></strong></p>
                    <p>📜 Scroll 50%: <strong><?php echo number_format($total['scroll_50']); ?></strong></p>
                    <p>📜 Scroll 90%: <strong><?php echo number_format($total['scroll_90']); ?></strong></p>
                    <p>🖱️ Clicks: <strong><?php echo number_format($total['click']); ?></strong></p>
                    <p>🚪 Exit: <strong><?php echo number_format($total['exit']); ?></strong></p>
                </div>
            </div>

            <div class="ltp-card">
                <h3>📈 الرسم البياني (7 أيام)</h3>
                <table class="ltp-table">
                    <thead>
                        <tr><th>اليوم</th><th>زيارات</th><th>نقرات</th><th>معدل</th></tr>
                    </thead>
                    <tbody>
                        <?php foreach ($last7 as $d => $v):
                            $rate = $v['page_view'] > 0 ? round(($v['click'] / $v['page_view']) * 100, 2) : 0;
                        ?>
                        <tr>
                            <td><?php echo esc_html($d); ?></td>
                            <td><?php echo number_format($v['page_view']); ?></td>
                            <td><?php echo number_format($v['click']); ?></td>
                            <td><?php echo $rate; ?>%</td>
                        </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            </div>

            <?php if (isset($_GET['numsaved'])): ?><div class="notice notice-success"><p>✅ حُفظت اختيارات الأرقام</p></div><?php endif; ?>
            <?php LTP_Telegram::card(); ?>
            <?php LTP_WooCommerce::card(); ?>
            <?php LTP_Numbers::card(); ?>
            <?php LTP_Inventory::card(); ?>

            <div class="ltp-card">
                <h3>🧪 اختبار الاتصال</h3>
                <button class="button button-primary" id="ltp-test-webhook">اختبار Webhook</button>
                <div id="ltp-test-result" style="margin-top:12px;"></div>
            </div>
        </div>
        <?php
    }

    // ═══════════════════════════════════════════════════════
    // صفحة الإعدادات
    // ═══════════════════════════════════════════════════════
    public function page_settings() {
        $webhook = LTP_Core::get('webhook_url');
        $secret  = LTP_Core::get('webhook_secret');
        $site    = LTP_Core::get('site_label', get_bloginfo('name'));
        $greet   = LTP_Core::get('wa_greeting', 'هلا، أبي أستفسر عن: ');
        $match   = LTP_Core::get('match_code', 1);
        $exclude = LTP_Core::get('exclude_admin', 0);
        $consent = LTP_Core::get('consent_enabled', 0);
        $track_all = LTP_Core::get('track_all', 1);
        $server_host = LTP_Core::get('server_host', '');
        $cf      = LTP_Core::get('behind_cloudflare', 0);

        $has_config = LTP_Core::has_config_file();
        $config_data = LTP_Core::load_config();
        $config_count = count($config_data);
        ?>
        <div class="wrap ltp-wrap">
            <h1>⚙️ إعدادات Lead Tracker Pro</h1>

            <?php if (isset($_GET['saved'])): ?>
                <div class="notice notice-success"><p>✅ تم الحفظ</p></div>
            <?php endif; ?>

            <?php if (isset($_GET['badurl'])): ?>
                <div class="notice notice-error"><p>❌ رابط Webhook غير صحيح وتم تجاهله — يجب أن يبدأ بـ <code>https://script.google.com/macros/s/</code> وينتهي بـ <code>/exec</code>، أو يكون على «نطاق الخادم».</p></div>
            <?php endif; ?>

            <?php if (isset($_GET['reset'])): ?>
                <div class="notice notice-success"><p>✅ حُذفت إعدادات قاعدة البيانات — الإعدادات الآن من config.json</p></div>
            <?php endif; ?>

            <?php LTP_Pair::box(); ?>

            <?php if ($has_config && $config_count > 0): ?>
                <div class="notice notice-info">
                    <p>
                        <strong>📄 ملف config.json موجود</strong> — يحتوي على
                        <strong><?php echo esc_html($config_count); ?></strong> حقل.
                        الحقول التي عليها علامة 📄 تأخذ قيمتها من الملف تلقائيًا.
                        إذا أردت تغييرها يدويًا من هنا، فاملأ الحقل ← سيُحفظ في قاعدة البيانات ويتجاوز ملف config.
                    </p>
                </div>
            <?php endif; ?>

            <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
                <input type="hidden" name="action" value="ltp_save">
                <?php wp_nonce_field('ltp_save', '_ltp_nonce'); ?>

                <details class="ltp-card">
                    <summary style="cursor:pointer;font-weight:600;">🛠️ إعدادات الاتصال اليدوية (متقدم — لا تحتاج إليها، فالربط تلقائي)</summary>

                    <table class="form-table">
                        <tr>
                            <th><label for="webhook_url"><?php echo $this->field_label('webhook_url', 'Webhook URL'); ?></label></th>
                            <td>
                                <input type="url" name="webhook_url" id="webhook_url" class="large-text"
                                       value="<?php echo esc_attr($webhook); ?>"
                                       placeholder="https://script.google.com/macros/s/.../exec">
                                <p class="description">رابط Apps Script (زر «نسخ» من Deploy ← Web App URL)</p>
                            </td>
                        </tr>
                        <tr>
                            <th><label for="webhook_secret"><?php echo $this->field_label('webhook_secret', 'Secret Key'); ?></label></th>
                            <td>
                                <input type="password" name="webhook_secret" id="webhook_secret" class="regular-text"
                                       value="" autocomplete="new-password"
                                       placeholder="<?php echo $secret !== '' ? esc_attr('•••••••• محفوظ — اتركه فارغًا') : ''; ?>">
                                <p class="description">يضعه الربط تلقائيًا. اكتب هنا فقط إذا كنت تضبط يدويًا بالمفتاح العام SECRET.</p>
                            </td>
                        </tr>
                        <tr>
                            <th><label for="site_label"><?php echo $this->field_label('site_label', 'اسم الموقع'); ?></label></th>
                            <td>
                                <input type="text" name="site_label" id="site_label" class="regular-text"
                                       value="<?php echo esc_attr($site); ?>">
                                <p class="description">يظهر في إشعارات Telegram + اسم الجدول في Google Sheet</p>
                            </td>
                        </tr>
                        <tr>
                            <th><label for="server_mirror">خادم Maestro LT</label></th>
                            <td>
                                <label><input type="checkbox" name="server_mirror" id="server_mirror" value="1" <?php checked((bool) LTP_Core::get('server_mirror')); ?>>
                                    أرسل نسخة من كل حدث إلى الخادم أيضًا (يبقى الجدول يعمل كما هو)</label>
                                <p><input type="url" name="server_url" class="large-text" value="<?php echo esc_attr(LTP_Core::get('server_url', LTP_Core::SERVER_URL)); ?>"></p>
                                <p class="description">فعّله فقط عندما يعمل الخادم. الإرسال يتم في الخلفية ولا يؤخّر الزائر.</p>
                            </td>
                        </tr>
                    </table>
                </details>

                <?php // 2.12.0: التحديث الأوتوماتيك ?>
                <div class="ltp-card">
                    <h3>🔄 التحديثات</h3>
                    <?php $us = LTP_Updater::status(); ?>
                    <?php if (!LTP_Updater::enabled()): ?>
                        <p class="description">التحديث التلقائي غير مفعّل بعد في هذا الإصدار.</p>
                    <?php else: ?>
                        <p><label><input type="checkbox" name="auto_update" value="1" <?php checked((string) LTP_Core::get('auto_update', '1') !== '0'); ?>>
                            حدّث الإضافة تلقائيًا عند صدور إصدار جديد (موقّع من Maestro LT)</label></p>
                        <p><label for="update_channel">القناة:</label>
                            <select name="update_channel" id="update_channel">
                                <option value="stable" <?php selected(LTP_Updater::channel(), 'stable'); ?>>عادية (بعد تجربة الإصدار)</option>
                                <option value="early" <?php selected(LTP_Updater::channel(), 'early'); ?>>مبكرة (فور صدوره)</option>
                            </select></p>
                        <p class="description">الإصدار الحالي <?php echo esc_html(LTP_VERSION); ?>
                            <?php if (!empty($us['checked'])) echo ' · آخر فحص ' . esc_html($us['checked']) . ' UTC'; ?>
                            <?php if (!empty($us['available']) && version_compare($us['available'], LTP_VERSION, '>')) echo ' · متاح ' . esc_html($us['available']); ?>
                            <?php if (!empty($us['error'])) echo ' · ⚠️ ' . esc_html($us['error']) . ' (' . esc_html($us['error_at'] ?? '') . ' UTC)'; ?></p>
                    <?php endif; ?>
                </div>

                <div class="ltp-card">
                    <h3>💬 إعدادات WhatsApp</h3>

                    <table class="form-table">
                        <tr>
                            <th><label for="wa_greeting"><?php echo $this->field_label('wa_greeting', 'رسالة الواتساب الافتراضية'); ?></label></th>
                            <td>
                                <input type="text" name="wa_greeting" id="wa_greeting" class="large-text"
                                       value="<?php echo esc_attr($greet); ?>">
                            </td>
                        </tr>
                        <tr>
                            <th><label for="match_code"><?php echo $this->field_label('match_code', 'رمز المطابقة'); ?></label></th>
                            <td>
                                <label>
                                    <input type="checkbox" name="match_code" value="1" <?php checked($match, 1); ?>>
                                    إضافة «رمز #XXXX» إلى رسالة الواتساب تلقائيًا
                                </label>
                            </td>
                        </tr>
                        <tr>
                            <th><label for="journey">طبيعة النشاط</label></th>
                            <td>
                                <select name="journey" id="journey">
                                    <?php foreach (LTP_Roles::JOURNEYS as $jk => $jl): ?>
                                        <option value="<?php echo esc_attr($jk); ?>" <?php selected(LTP_Roles::journey(), $jk); ?>><?php echo esc_html($jl); ?></option>
                                    <?php endforeach; ?>
                                </select>
                                <p class="description">أين تنتهي رحلة العميل؟ على أساسها تحدّد الإضافة أهمية كل إجراء تلقائيًا (واتساب · اتصال · نموذج…): أيّها يُحتسب عميلًا محتملًا ويُرسل إلى جوجل ويصل عنه تنبيه. ويمكنك تغيير أي إجراء من جدول الأرقام والجرد في لوحة التحكم.</p>
                            </td>
                        </tr>
                        <tr>
                            <th>استهداف الإعلانات</th>
                            <td>
                                <?php $tc = array_filter(explode(',', (string) LTP_Core::get('target_countries', ''))); ?>
                                <?php foreach (self::TARGET_COUNTRIES as $code => $name): ?>
                                    <label style="margin-left:14px;white-space:nowrap;"><input type="checkbox" name="target_countries[]" value="<?php echo esc_attr($code); ?>" <?php checked(in_array($code, $tc, true)); ?>> <?php echo esc_html($name); ?></label>
                                <?php endforeach; ?>
                                <p style="margin-top:8px;"><input type="text" name="target_cities" class="regular-text" value="<?php echo esc_attr(LTP_Core::get('target_cities', '')); ?>" placeholder="فارغ = الدولة كلها · أو مثلًا: الرياض، جدة"></p>
                                <p class="description">الاستهداف نفسه الموجود في حملات جوجل. أي زيارة إعلان من خارج الاستهداف تُعلَّم في الجدول ويصل عنها تنبيه — مع إشارات أخرى (VPN · ساعة الجهاز على بلد آخر). العلامة تنبيه للمراجعة، وليست حظرًا.</p>
                            </td>
                        </tr>
                        <tr>
                            <th><label for="click_rules"><?php echo $this->field_label('click_rules', 'عناصر تواصل يدوية'); ?></label></th>
                            <td>
                                <textarea name="click_rules" id="click_rules" class="large-text code" rows="4" dir="ltr"
                                          placeholder=".my-float-btn = wa&#10;#call-box = call"><?php echo esc_textarea(LTP_Core::get('click_rules', '')); ?></textarea>
                                <p class="description">إذا ظهر عنصر تواصل في «الجرد» على أنه غير معروف: اكتب محدّده ونوعه، سطرًا لكل عنصر. الأنواع: wa · call · sms · email · msg · form · button · cart · checkout · map · social</p>
                            </td>
                        </tr>
                    </table>
                </div>

                <div class="ltp-card">
                    <h3>🔒 الخصوصية والتتبع</h3>

                    <table class="form-table">
                        <tr>
                            <th><?php echo $this->field_label('consent_enabled', 'Cookie Banner'); ?></th>
                            <td>
                                <label>
                                    <input type="checkbox" name="consent_enabled" value="1" <?php checked($consent, 1); ?>>
                                    تفعيل شريط الموافقة (إذا رفض الزائر، نسجّل الزيارة فقط دون بيانات جهازه)
                                </label>
                            </td>
                        </tr>
                        <tr>
                            <th><?php echo $this->field_label('track_all', 'تتبع كل الزيارات بالتفصيل'); ?></th>
                            <td>
                                <label>
                                    <input type="checkbox" name="track_all" value="1" <?php checked($track_all, 1); ?>>
                                    سجّل كل زيارة بالتفصيل من أي مصدر
                                </label>
                                <p class="description">مفعّلة (الافتراضي منذ 2.3.2): تُسجَّل كل زيارة بالتفصيل. إذا عطّلتها: يُسجَّل زائر الإعلان فقط بالتفصيل، وتُسجَّل أي نقرة من أي مصدر مع مصدرها (يوفّر مساحة الجدول وحدود جوجل).</p>
                            </td>
                        </tr>
                        <tr>
                            <th><label for="server_host"><?php echo $this->field_label('server_host', 'نطاق الخادم'); ?></label></th>
                            <td>
                                <input type="text" name="server_host" id="server_host" class="regular-text" value="<?php echo esc_attr($server_host); ?>" placeholder="api.example.com">
                                <p class="description">اتركه فارغًا ما دامت البيانات تذهب إلى Google Sheet. عند الانتقال إلى خادمنا: اكتب النطاق هنا، وضع رابط الخادم في Webhook URL.</p>
                            </td>
                        </tr>
                        <tr>
                            <th><?php echo $this->field_label('behind_cloudflare', 'الموقع خلف Cloudflare'); ?></th>
                            <td>
                                <label>
                                    <input type="checkbox" name="behind_cloudflare" value="1" <?php checked($cf, 1); ?>>
                                    فعّلها إذا كان الموقع يعمل عبر Cloudflare (ليُسجَّل العنوان والدولة بشكل صحيح)
                                </label>
                                <p class="description">إذا لم تكن متأكدًا فاتركها معطّلة.</p>
                            </td>
                        </tr>
                        <tr>
                            <th><label for="fpjs_key">Fingerprint Pro (اختياري)</label></th>
                            <td>
                                <input type="text" name="fpjs_key" id="fpjs_key" class="regular-text code" dir="ltr" value="<?php echo esc_attr(LTP_Core::get('fpjs_key', '')); ?>" placeholder="Public API key">
                                <select name="fpjs_region">
                                    <?php foreach (['us' => 'US', 'eu' => 'EU', 'ap' => 'Asia Pacific'] as $rk => $rl): ?>
                                        <option value="<?php echo esc_attr($rk); ?>" <?php selected(LTP_Core::get('fpjs_region', 'us'), $rk); ?>><?php echo esc_html($rl); ?></option>
                                    <?php endforeach; ?>
                                </select>
                                <select name="fpjs_scope">
                                    <option value="ads" <?php selected(LTP_Core::get('fpjs_scope', 'ads'), 'ads'); ?>>زوار الإعلانات فقط</option>
                                    <option value="all" <?php selected(LTP_Core::get('fpjs_scope', 'ads'), 'all'); ?>>كل الزوار</option>
                                </select>
                                <p style="margin-top:8px;"><input type="text" name="tm_key" class="regular-text code" dir="ltr" value="<?php echo esc_attr(LTP_Core::get('tm_key', '')); ?>" placeholder="ThumbmarkJS API key (اختياري)"></p>
                                <p class="description">للمقارنة مع البصمة الحالية و«بصمة 2». ضع المفتاح العام (Public) من لوحة Fingerprint — لا المفتاح السري. «زوار الإعلانات فقط» يوفّر الطلبات (الباقة المجانية 1000 شهريًا). تذهب بيانات جهاز الزائر إلى خوادم Fingerprint — يجب ذكر ذلك في سياسة الخصوصية. فارغ = معطّل.</p>
                            </td>
                        </tr>
                        <tr>
                            <th><?php echo $this->field_label('exclude_admin', 'استثناء المسؤولين'); ?></th>
                            <td>
                                <label>
                                    <input type="checkbox" name="exclude_admin" value="1" <?php checked($exclude, 1); ?>>
                                    عدم تسجيل زيارات المديرين (Admin)
                                </label>
                            </td>
                        </tr>
                        <tr>
                            <th>روابط سريعة</th>
                            <td>
                                <p>📌 <strong>Webhook URL الحالي:</strong> <code><?php echo esc_url(rest_url('lt/v1/event')); ?></code></p>
                                <p>📌 <strong>Stats API:</strong> <code><?php echo esc_url(rest_url('lt/v1/stats')); ?></code></p>
                            </td>
                        </tr>
                    </table>
                </div>

                <?php submit_button('💾 حفظ في قاعدة البيانات'); ?>
            </form>

            <?php if ($has_config): ?>
                <div class="ltp-card" style="border-left:4px solid #2271b1;">
                    <h3>🔄 إدارة config.json</h3>
                    <p>الإعدادات محفوظة حاليًا في <code>wp-content/plugins/lead-tracker-pro/config.json</code>.</p>
                    <p>
                        <strong>لتغيير أي إعداد:</strong>
                        <br>1. عدّل الملف <code>config.json</code> على السيرفر
                        <br>2. حدّث الصفحة — ستتحدّث الإعدادات تلقائيًا
                    </p>

                    <hr style="margin:20px 0;">

                    <p><strong>⚠️ لحذف الإعدادات من قاعدة البيانات والاعتماد على config.json فقط:</strong></p>
                    <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>"
                          onsubmit="return confirm('هل أنت متأكد؟ ستُحذف كل الإعدادات من قاعدة البيانات، وتُقرأ من config.json.');">
                        <input type="hidden" name="action" value="ltp_reset_db">
                        <?php wp_nonce_field('ltp_reset_db', '_ltp_reset_nonce'); ?>
                        <button type="submit" class="button">🗑️ حذف الإعدادات من قاعدة البيانات</button>
                    </form>
                </div>
            <?php endif; ?>
        </div>
        <?php
    }

    public function save() {
        if (!current_user_can('manage_options')) wp_die('غير مسموح');
        check_admin_referer('ltp_save', '_ltp_nonce');

        LTP_Core::set('server_host',     sanitize_text_field($_POST['server_host'] ?? ''));
        $url = esc_url_raw(trim(wp_unslash($_POST['webhook_url'] ?? '')));
        LTP_Core::set('webhook_url', ($url !== '' && LTP_Core::webhook_ready($url)) ? $url : '');
        $bad_url = ($url !== '' && !LTP_Core::webhook_ready($url));
        $sec = sanitize_text_field(wp_unslash($_POST['webhook_secret'] ?? ''));
        if ($sec !== '') LTP_Core::set('webhook_secret', $sec);   // فاضي = سيب المحفوظ زي ما هو
        LTP_Core::set('site_label',      sanitize_text_field($_POST['site_label'] ?? ''));
        LTP_Core::set('wa_greeting',     sanitize_text_field($_POST['wa_greeting'] ?? ''));
        LTP_Core::set('match_code',      isset($_POST['match_code']) ? 1 : 0);
        LTP_Core::set('click_rules',     sanitize_textarea_field(wp_unslash($_POST['click_rules'] ?? '')));
        $fk = preg_replace('/[^A-Za-z0-9]/', '', (string) ($_POST['fpjs_key'] ?? ''));
        LTP_Core::set('fpjs_key', substr($fk, 0, 40));
        LTP_Core::set('tm_key', substr(preg_replace('/[^A-Za-z0-9_\-]/', '', (string) ($_POST['tm_key'] ?? '')), 0, 80));
        LTP_Core::set('fpjs_region', in_array($_POST['fpjs_region'] ?? '', ['us', 'eu', 'ap'], true) ? $_POST['fpjs_region'] : 'us');
        LTP_Core::set('fpjs_scope', ($_POST['fpjs_scope'] ?? '') === 'all' ? 'all' : 'ads');
        $j = sanitize_key($_POST['journey'] ?? '');
        if (isset(LTP_Roles::JOURNEYS[$j])) LTP_Core::set('journey', $j);
        $tcs = array_values(array_intersect(array_map('strval', (array) ($_POST['target_countries'] ?? [])), array_keys(self::TARGET_COUNTRIES)));
        LTP_Core::set('target_countries', implode(',', $tcs));
        LTP_Core::set('target_cities', mb_substr(sanitize_text_field(wp_unslash($_POST['target_cities'] ?? '')), 0, 200));
        LTP_Core::set('exclude_admin',  isset($_POST['exclude_admin']) ? 1 : 0);
        LTP_Core::set('behind_cloudflare', isset($_POST['behind_cloudflare']) ? 1 : 0);
        LTP_Core::set('consent_enabled', isset($_POST['consent_enabled']) ? 1 : 0);
        LTP_Core::set('track_all',       isset($_POST['track_all']) ? 1 : 0);
        LTP_Core::set('server_mirror',   isset($_POST['server_mirror']) ? 1 : 0);
        $su = esc_url_raw(trim(wp_unslash($_POST['server_url'] ?? '')));
        LTP_Core::set('server_url', strpos($su, 'https://') === 0 ? $su : LTP_Core::SERVER_URL);
        if (LTP_Updater::enabled()) {   // 2.12.0
            LTP_Core::set('auto_update', isset($_POST['auto_update']) ? '1' : '0');
            LTP_Core::set('update_channel', ($_POST['update_channel'] ?? '') === 'early' ? 'early' : 'stable');
        }

        wp_safe_redirect(admin_url('admin.php?page=lead-tracker-settings&saved=1' . ($bad_url ? '&badurl=1' : '')));
        exit;
    }

    public function reset_db() {
        if (!current_user_can('manage_options')) wp_die('غير مسموح');
        check_admin_referer('ltp_reset_db', '_ltp_reset_nonce');

        $keys = [
            'webhook_url', 'webhook_secret', 'site_label',
            'wa_greeting', 'match_code', 'exclude_admin',
            'behind_cloudflare', 'consent_enabled', 'track_all', 'server_host',
            'wa_only', 'click_rules', 'server_mirror', 'server_url',
            'paired_at', 'pair_state'
        ];

        foreach ($keys as $k) {
            delete_option('ltp_' . $k);
        }

        wp_safe_redirect(admin_url('admin.php?page=lead-tracker-settings&reset=1'));
        exit;
    }
}