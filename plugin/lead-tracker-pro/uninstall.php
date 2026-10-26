<?php
/**
 * Uninstall — Lead Tracker Pro
 * يُشغَّل عند حذف الإضافة (Delete، مش Deactivate)
 */

if (!defined('WP_UNINSTALL_PLUGIN')) exit;

// حذف كل الإعدادات
$options = [
    'ltp_installed_at', 'ltp_version', 'ltp_site_id',
    'ltp_events', 'ltp_flush_rewrite',
    'ltp_webhook_url', 'ltp_webhook_secret', 'ltp_site_label',
    'ltp_wa_greeting', 'ltp_match_code', 'ltp_exclude_admin',
    'ltp_wa_verify_token', 'ltp_consent_enabled', 'ltp_behind_cloudflare',
    'ltp_track_all', 'ltp_server_host', 'ltp_wa_only', 'ltp_click_rules', 'ltp_inventory', 'ltp_inv2', 'ltp_noop', 'ltp_roles', 'ltp_wc_last', 'ltp_fpjs_key', 'ltp_fpjs_region', 'ltp_fpjs_scope', 'ltp_tm_key', 'ltp_target_countries', 'ltp_target_cities', 'ltp_tg_invite', 'ltp_journey', 'ltp_numbers', 'ltp_number_overrides', 'ltp_numbers_since', 'ltp_wc_since', 'ltp_wc_retry', 'ltp_paired_at', 'ltp_pair_state', 'ltp_pair_due', 'ltp_pair_nonce', 'ltp_pair_tried_at',
];

foreach ($options as $opt) {
    delete_option($opt);
}
wp_clear_scheduled_hook('ltp_autopair');

// حذف كل Transients (Rate limit + dedup)
global $wpdb;
$wpdb->query(
    "DELETE FROM {$wpdb->options}
     WHERE option_name LIKE '_transient_ltp_%'
        OR option_name LIKE '_transient_timeout_ltp_%'"
);