<?php
if (!defined('ABSPATH')) exit;

/**
 * Lead Tracker Pro — جرد عناصر التواصل (2.6.5)
 *
 * الجرد بيتجمّع حسب العنصر مش حسب الصفحة:
 *  • عناصر الموقع كله (الهيدر/الفوتر/العائم) بتظهر مرة واحدة + «ظهر في N مجموعة».
 *  • الصفحات الكتير من نفس النوع (منتجات · أقسام · مقالات · رحلات…) = مجموعة واحدة.
 *  • الصفحات المميزة (الرئيسية · صفحات عادية زي «اتصل بنا») كل واحدة لوحدها.
 *  • 🔴 المشاكل فوق خالص.
 * وكل جهاز بيبعت مرة في اليوم لكل مجموعة — المتجر بـ 1000 منتج حجمه زي المتجر بـ 10.
 */
class LTP_Inventory {

    const OPT        = 'ltp_inv2';
    const MAX_ITEMS  = 400;
    const MAX_GROUPS = 80;
    const KEEP_DAYS  = 30;

    // الأنواع اللي بتتجمّع (صفحات كتير بنفس الشكل)
    const AGG = ['product', 'shop', 'post', 'archive', 'cart', 'checkout', 'account', 'cpt'];

    public static function group_label($g) {
        $labels = [
            'type:product'  => '🛍️ صفحات المنتجات',
            'type:shop'     => '🏬 المتجر والأقسام',
            'type:post'     => '📰 المقالات',
            'type:archive'  => '🗂️ الأرشيف والبحث',
            'type:cart'     => '🛒 السلة',
            'type:checkout' => '💳 الدفع',
            'type:account'  => '👤 حسابي',
        ];
        if (isset($labels[$g])) return $labels[$g];
        if (strpos($g, 'cpt:') === 0) return '📄 ' . substr($g, 4);
        if (strpos($g, 'path:') === 0) { $p = substr($g, 5); return $p === '/' ? '🏠 الرئيسية' : '📄 ' . urldecode($p); }
        return $g;
    }

    // نوع الصفحة الحالية (بيتبعت لـ tracker.js في الإعدادات)
    public static function page_type() {
        if (is_front_page()) return ['t' => 'home', 'l' => ''];
        if (function_exists('is_product') && is_product()) return ['t' => 'product', 'l' => ''];
        if (function_exists('is_cart') && is_cart()) return ['t' => 'cart', 'l' => ''];
        if (function_exists('is_checkout') && is_checkout()) return ['t' => 'checkout', 'l' => ''];
        if (function_exists('is_account_page') && is_account_page()) return ['t' => 'account', 'l' => ''];
        if ((function_exists('is_shop') && is_shop()) || (function_exists('is_product_taxonomy') && is_product_taxonomy())) return ['t' => 'shop', 'l' => ''];
        if (is_singular('post')) return ['t' => 'post', 'l' => ''];
        if (is_page()) return ['t' => 'page', 'l' => ''];
        if (is_singular()) {
            $pt = get_post_type();
            $o  = $pt ? get_post_type_object($pt) : null;
            return ['t' => 'cpt', 'l' => $o ? mb_substr($o->labels->name, 0, 40) : (string) $pt];
        }
        if (is_archive() || is_home() || is_search()) return ['t' => 'archive', 'l' => ''];
        return ['t' => 'other', 'l' => ''];
    }

    private static function group_key($ptype, $plabel, $path) {
        if ($ptype === 'cpt') return 'cpt:' . ($plabel !== '' ? $plabel : 'صفحات');
        if (in_array($ptype, self::AGG, true)) return 'type:' . $ptype;
        return 'path:' . $path;
    }

    private static function sig($it) {
        if (($it['v'] ?? '') === 'text') return 'text|' . $it['n'];
        return $it['t'] . '|' . $it['d'] . '|' . $it['u'] . '|' . $it['n'];
    }

    public static function load() {
        $s = get_option(self::OPT, []);
        if (!is_array($s)) $s = [];
        return $s + ['groups' => [], 'items' => []];
    }

    // ═══════════════════════════════════════════════════════
    // استقبال جرد من جهاز زائر
    // ═══════════════════════════════════════════════════════
    // فورمز الترتيب والفلترة في المتجر = مش تواصل (2.7.1)
    const FILTER_FORM = '/woocommerce-ordering|orderby|(^|[\s_\-.#])(filter|filters|facet|facets|sort|sorting|sf-panel)([\s_\-.]|$)|woof|wpf-|yith-wcan|price_slider|wc-block-product-filter/i';

    public static function ingest($path, $ptype, $plabel, $title, $dev, $ver, $items) {
        $items = array_values(array_filter((array) $items, function ($it) { return !($it['t'] === 'form' && preg_match(self::FILTER_FORM, (string) $it['d'])); }));
        if (get_option('ltp_inventory', null) !== null) delete_option('ltp_inventory');   // الشكل القديم (صفحة صفحة)
        $s   = self::load();
        $now = current_time('mysql');
        $g   = self::group_key($ptype, $plabel, $path);

        $grp = $s['groups'][$g] ?? ['paths' => [], 'reports' => 0];
        $grp['at']      = $now;
        $grp['title']   = $title;
        $grp['ver']     = $ver;
        $grp['reports'] = (int) $grp['reports'] + 1;
        $grp['dev'][$dev] = $now;
        $grp['paths']   = array_slice(array_values(array_unique(array_merge([$path], (array) $grp['paths']))), 0, 5);
        $s['groups'][$g] = $grp;

        foreach ($items as $it) {
            $k = self::sig($it);
            $old = $s['items'][$k] ?? ['groups' => [], 'paths' => [], 'devs' => [], 'pos' => [], 'first' => $now];
            $row = array_merge($it, [
                'groups' => array_merge((array) $old['groups'], [$g => $now]),
                'paths'  => array_slice(array_values(array_unique(array_merge([$path], (array) $old['paths']))), 0, 5),
                'devs'   => array_merge((array) $old['devs'], [$dev => $now]),
                'pos'    => array_slice(array_values(array_unique(array_filter(array_merge([(string) $it['p']], (array) $old['pos'])))), 0, 3),
                'first'  => $old['first'],
                'last'   => $now,
                'ver'    => $ver,
            ]);
            $s['items'][$k] = $row;
        }

        // العنصر اللي اختفى من مجموعة: آخر جرد للمجموعة دي مافيهوش ← يتشال منها
        $seen = [];
        foreach ($items as $it) $seen[self::sig($it)] = 1;
        foreach ($s['items'] as $k => $row) {
            // ماتشافش في المجموعة دي بقاله 3 أيام (من أي جهاز — العائم ممكن يبقى على الموبايل بس، وعنصر ممكن يبقى في منتج ومش في التاني) ← يتشال منها
            if (isset($row['groups'][$g]) && !isset($seen[$k]) && strtotime($row['groups'][$g]) < strtotime('-3 days', current_time('timestamp'))) unset($s['items'][$k]['groups'][$g]);
            if (empty($s['items'][$k]['groups'])) unset($s['items'][$k]);
        }

        self::prune($s);
        update_option(self::OPT, $s, false);
    }

    private static function prune(&$s) {
        $cut = date('Y-m-d H:i:s', strtotime('-' . self::KEEP_DAYS . ' days', current_time('timestamp')));
        foreach ($s['items'] as $k => $r) if (($r['last'] ?? '') < $cut) unset($s['items'][$k]);
        foreach ($s['groups'] as $k => $r) if (($r['at'] ?? '') < $cut) unset($s['groups'][$k]);
        if (count($s['groups']) > self::MAX_GROUPS) {
            uasort($s['groups'], function ($a, $b) { return strcmp($b['at'], $a['at']); });
            $s['groups'] = array_slice($s['groups'], 0, self::MAX_GROUPS, true);
        }
        if (count($s['items']) > self::MAX_ITEMS) {
            uasort($s['items'], function ($a, $b) { return strcmp($b['last'], $a['last']); });
            $s['items'] = array_slice($s['items'], 0, self::MAX_ITEMS, true);
        }
    }

    // زرار اتضغط ومافتحش أي حاجة (من سجل الضغطات الحقيقي)
    public static function noop($desc) {
        $n = get_option('ltp_noop', []);
        if (!is_array($n)) $n = [];
        $n[$desc] = ['c' => (int) ($n[$desc]['c'] ?? 0) + 1, 'at' => current_time('mysql')];
        if (count($n) > 50) { uasort($n, function ($a, $b) { return strcmp($b['at'], $a['at']); }); $n = array_slice($n, 0, 50, true); }
        update_option('ltp_noop', $n, false);
    }

    private static function noop_of($it) {
        static $n = null;
        if ($n === null) { $n = get_option('ltp_noop', []); if (!is_array($n)) $n = []; }
        $x = $n[$it['d']] ?? null;
        return ($x && $x['at'] >= date('Y-m-d H:i:s', strtotime('-14 days', current_time('timestamp')))) ? (int) $x['c'] : 0;
    }

    private static function note($it) {
        if (!empty($it['e']) && !self::noop_of($it)) return 'ℹ️ رابط «#» — بيشتغل بسكريبت (لو اتضغط ومافتحش حاجة هيظهر هنا كمشكلة)';
        return '';
    }

    private static function problem($it) {
        if (!empty($it['h'])) return '🔴 ' . $it['h'];
        if ($c = self::noop_of($it)) return '🔴 اتضغط ومافتحش حاجة (' . $c . ' مرة في آخر 14 يوم)';
        if ($it['t'] === 'wa' && empty($it['c']) && empty($it['cr'])) return '⚠️ كود المطابقة مش جاهز في الرابط';
        return '';
    }

    // ═══════════════════════════════════════════════════════
    // كارت لوحة التحكم
    // ═══════════════════════════════════════════════════════
    public static function card() {
        $s = self::load();
        $types = [
            'wa' => '💬 واتساب', 'call' => '📞 اتصال', 'sms' => '✉️ رسالة', 'email' => '📧 إيميل', 'msg' => '📨 تليجرام/ماسنجر',
            'form' => '📝 فورم', 'button' => '🔘 زرار', 'cart' => '🛒 سلة', 'checkout' => '💳 دفع', 'map' => '📍 خريطة', 'social' => '👥 سوشيال',
        ];
        $via = [
            'href' => 'رابط', 'attr' => 'رابط في الكود', 'kw' => 'بالكلمات (الرابط بيتعرف وقت الضغط)', 'kw-parent' => 'من الحاوية',
            'rule' => 'قاعدة يدوية', 'type' => 'نوع الزرار', 'text' => 'رقم مكتوب من غير رابط',
        ];
        $groups = $s['groups'];
        $total  = count($groups);
        $site = $problems = $byGroup = [];
        foreach ($s['items'] as $k => $it) {
            if ($it['t'] === 'form' && preg_match(self::FILTER_FORM, (string) $it['d'])) continue;   // جرد قديم قبل 2.7.1
            $n = count($it['groups']);
            if ($p = self::problem($it)) $problems[$k] = $p;
            if ($total >= 2 && $n >= max(2, (int) ceil($total * 0.6))) { $site[$k] = $it; continue; }
            foreach (array_keys($it['groups']) as $g) $byGroup[$g][$k] = $it;
        }
        $row = function ($it, $showWhere, $editable = true) use ($types, $via, $groups, $total) {
            $where = [];
            foreach (array_keys($it['groups']) as $g) $where[] = self::group_label($g);
            $devs = (isset($it['devs']['m']) ? '📱' : '') . (isset($it['devs']['d']) ? '💻' : '');
            ?>
            <tr>
                <td><?php echo esc_html($types[$it['t']] ?? $it['t']); ?><?php echo !empty($it['cr']) ? ' <small>(خارجي)</small>' : ''; ?></td>
                <td><?php echo esc_html($via[$it['v']] ?? $it['v']); ?></td>
                <td><?php echo esc_html(implode(' · ', (array) $it['pos'])); ?></td>
                <td><?php echo esc_html($it['x']); ?></td>
                <td><code dir="ltr"><?php echo esc_html($it['d']); ?></code></td>
                <td dir="ltr" style="max-width:240px;word-break:break-all;"><?php echo esc_html($it['u'] ?: $it['n']); ?></td>
                <td><?php $p = self::problem($it); $nt = self::note($it); echo $p !== '' ? esc_html($p) : ($nt !== '' ? esc_html($nt) : ($it['t'] === 'wa' ? '✅' : '—')); ?></td>
                <?php if ($showWhere): ?>
                    <td title="<?php echo esc_attr(implode("\n", array_merge($where, ['—'], (array) $it['paths']))); ?>"><?php echo esc_html(count($it['groups']) . ' من ' . $total); ?></td>
                <?php endif; ?>
                <td><?php echo esc_html($devs) . ($it['s'] ? '' : ' 🙈'); ?></td>
                <td><?php
                    if (($it['v'] ?? '') === 'text') { echo '—'; }
                    else {
                        $ek = LTP_Roles::elem_key($it['t'], $it['d'], $it['n'] ?? '', $it['x'] ?? '');
                        $nk = LTP_Numbers::key($it['n'] ?? '');
                        [$ar, $why] = LTP_Roles::element_role($it['t'], $it['d'], true);
                        if ($ek === '') {
                            // عنصر عام (زي «a» من غير class) من غير رقم ولا نص: الاختيار هنا هيلمس عناصر تانية
                            echo esc_html(LTP_Roles::label($ar)) . '<br><small style="color:#666;">' . esc_html($nk !== '' ? 'غيّره من جدول الأرقام' : 'العنصر عام — غيّره بقاعدة يدوية من الإعدادات') . '</small>';
                        } else {
                            $cur = LTP_Roles::load()['e'][$ek] ?? '';
                            if ($editable) echo LTP_Roles::select('role_e[' . $ek . ']', $cur, $ar) . '<br><small style="color:#666;">' . esc_html($why) . ($nk !== '' ? ' · للرقم كله: جدول الأرقام' : '') . '</small>'; // phpcs:ignore
                            else echo esc_html(LTP_Roles::label($cur !== '' ? $cur : $ar));
                        }
                    }
                ?></td>
            </tr>
            <?php
        };
        $head = function ($showWhere) {
            echo '<thead><tr><th>النوع</th><th>اتعرف إزاي</th><th>المكان</th><th>النص</th><th>العنصر</th><th>الرابط / الرقم</th><th>الحالة</th>'
                . ($showWhere ? '<th>ظهر في</th>' : '') . '<th>الأجهزة</th><th>الأهمية</th></tr></thead>';
        };
        ?>
        <div class="ltp-card">
            <h3>🔎 جرد عناصر التواصل</h3>
            <p class="description">بيتجمع لوحده من أجهزة الزوار: مرة في اليوم لكل مجموعة صفحات ولكل نوع جهاز. الصفحات اللي بنفس الشكل (المنتجات، الأقسام، المقالات…) = مجموعة واحدة، والصفحات المميزة (الرئيسية، اتصل بنا…) كل واحدة لوحدها. أي عنصر تواصل ناقص من هنا = مش متتبع. 🙈 = مش ظاهر للزائر.</p>
            <?php if (!$s['items']): ?>
                <p>لسه مفيش جرد. هيظهر بعد أول زيارة للموقع بعد التحديث (بيستنى 6 ثواني بعد ما الصفحة تحمل).</p>
            <?php else: ?>
                <?php echo LTP_Roles::legend(); // phpcs:ignore ?>
                <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
                <input type="hidden" name="action" value="ltp_numbers_save">
                <?php wp_nonce_field('ltp_numbers_save', '_ltp_num_nonce'); ?>
                <p><strong><?php echo esc_html($total); ?></strong> مجموعة صفحات · <strong><?php echo esc_html(count($s['items'])); ?></strong> عنصر
                    <?php if ($problems): ?> · <strong style="color:#b32d2e;"><?php echo esc_html(count($problems)); ?> مشكلة</strong><?php endif; ?></p>

                <?php if ($problems): ?>
                    <h4 style="margin:16px 0 6px;color:#b32d2e;">🔴 محتاج تصليح</h4>
                    <table class="ltp-table widefat striped"><?php $head(true); ?><tbody>
                        <?php foreach (array_keys($problems) as $k) $row($s['items'][$k], true, false); ?>
                    </tbody></table>
                <?php endif; ?>

                <?php if ($site): ?>
                    <h4 style="margin:16px 0 6px;">🌐 في الموقع كله (الهيدر · الفوتر · العائم)</h4>
                    <table class="ltp-table widefat striped"><?php $head(true); ?><tbody>
                        <?php foreach ($site as $it) $row($it, true); ?>
                    </tbody></table>
                <?php endif; ?>

                <?php
                uksort($byGroup, function ($a, $b) use ($groups) {
                    $wa = strpos($a, 'path:/') === 0 && $a === 'path:/' ? 0 : (strpos($a, 'type:') === 0 || strpos($a, 'cpt:') === 0 ? 1 : 2);
                    $wb = strpos($b, 'path:/') === 0 && $b === 'path:/' ? 0 : (strpos($b, 'type:') === 0 || strpos($b, 'cpt:') === 0 ? 1 : 2);
                    return $wa === $wb ? strcmp($groups[$b]['at'] ?? '', $groups[$a]['at'] ?? '') : $wa - $wb;
                });
                foreach ($byGroup as $g => $its):
                    $gr = $groups[$g] ?? ['paths' => [], 'at' => '', 'ver' => '', 'dev' => []]; ?>
                    <h4 style="margin:16px 0 6px;"><?php echo esc_html(self::group_label($g)); ?>
                        <small style="color:#666;font-weight:normal;">(<?php echo esc_html('مثال: ' . implode(' · ', array_slice((array) $gr['paths'], 0, 3)) . ' · آخر جرد ' . $gr['at'] . ' · v' . $gr['ver']); ?>)</small></h4>
                    <table class="ltp-table widefat striped"><?php $head(false); ?><tbody>
                        <?php foreach ($its as $it) $row($it, false); ?>
                    </tbody></table>
                <?php endforeach; ?>
                <p><button type="submit" class="button">💾 حفظ الأهمية</button></p>
                </form>
            <?php endif; ?>
        </div>
        <?php
    }
}
