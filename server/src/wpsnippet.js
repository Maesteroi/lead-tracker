// كود «الربط السريع» اللي العميل بيلصقه في إضافة WPCode على موقعه ووردبريس (19 نوفمبر).
// بيعمل 3 حاجات، مرة واحدة، وللأدمن بس:
//   ١) ينزّل بلجن Lead Tracker Pro من app.maestrolt.com ويتأكد من بصمته (sha256) ويثبّته ويفعّله (لو مش مركّب).
//   ٢) يفتح شاشة الربط بمنصة Maestro LT (نفس زرار «اربط بـ Maestro LT» في البلجن)، والعميل يدوس «اربط» مرة واحدة.
//   ٣) من غير أي مفتاح أو كلمة سر جوه الكود: الربط بيتم بنفس الطريقة الآمنة (رقم مؤقت + دخول بجوجل).
// بعد ما البلجن يتثبّت ويتربط الكود يقف لوحده، والعميل يقدر يمسحه.
// (لما متجر ووردبريس يوافق على البلجن بيتثبّت من هناك بضغطة، والكود ده يفضل للي عايز يربط بسرعة من غير ما يرفع ملفات.)
export const WP_SNIPPET = `/* Maestro LT: الربط السريع. يثبّت الإضافة ويربط موقعك. بعد الربط يمكنك حذف هذا المقتطف. */
add_action( 'admin_init', function () {
    if ( ! current_user_can( 'install_plugins' ) || wp_doing_ajax() ) { return; }
    $file = 'lead-tracker-pro/lead-tracker-pro.php';
    require_once ABSPATH . 'wp-admin/includes/plugin.php';
    require_once ABSPATH . 'wp-admin/includes/file.php';

    if ( ! file_exists( WP_PLUGIN_DIR . '/' . $file ) ) {
        if ( get_transient( 'maestro_lt_try' ) ) { return; }
        set_transient( 'maestro_lt_try', 1, 10 * MINUTE_IN_SECONDS );
        $res  = wp_remote_get( 'https://app.maestrolt.com/plugin/info.json', array( 'timeout' => 15 ) );
        $info = is_wp_error( $res ) ? null : json_decode( wp_remote_retrieve_body( $res ), true );
        $pkg  = isset( $info['latest']['package'] ) ? (string) $info['latest']['package'] : '';
        $sha  = isset( $info['latest']['sha256'] ) ? (string) $info['latest']['sha256'] : '';
        if ( 0 !== strpos( $pkg, 'https://app.maestrolt.com/plugin/' ) || strlen( $sha ) !== 64 ) { return; }
        $tmp = download_url( $pkg );
        if ( is_wp_error( $tmp ) ) { return; }
        if ( ! hash_equals( $sha, hash_file( 'sha256', $tmp ) ) ) { @unlink( $tmp ); return; }
        WP_Filesystem();
        $ok = unzip_file( $tmp, WP_PLUGIN_DIR );
        @unlink( $tmp );
        if ( is_wp_error( $ok ) ) { return; }
    }
    if ( ! is_plugin_active( $file ) ) {
        activate_plugin( $file );
        wp_safe_redirect( admin_url( 'plugins.php?maestro_lt=1' ) );
        exit;
    }
    if ( class_exists( 'LTP_Pair' ) && method_exists( 'LTP_Pair', 'is_paired' ) && ! LTP_Pair::is_paired() && ! get_transient( 'maestro_lt_go' ) ) {
        set_transient( 'maestro_lt_go', 1, 10 * MINUTE_IN_SECONDS );
        wp_redirect( LTP_Pair::connect_url() );
        exit;
    }
} );`;
