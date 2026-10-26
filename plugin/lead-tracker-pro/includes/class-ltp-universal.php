<?php
if (!defined('ABSPATH')) exit;

/**
 * Lead Tracker Pro — Universal E-commerce Tracker
 * يشتغل مع أي متجر إلكتروني (Shopify, Salla, Zid, Custom)
 * يكشف أزرار "أضف للسلة" و"إتمام الشراء" عبر JavaScript
 */
class LTP_Universal {

    private static $instance = null;

    public static function instance() {
        if (self::$instance === null) self::$instance = new self();
        return self::$instance;
    }

    private function __construct() {
        // لو WooCommerce موجود، مانحقنش السكربت
        // (عشان مانكررش الأحداث)
        if (class_exists('WooCommerce')) return;

        add_action('wp_footer', [$this, 'inject_universal_script'], 999);
    }

    /**
     * حقن السكربت في الـ footer
     */
    public function inject_universal_script() {
        if (is_admin()) return;

        $endpoint = esc_url_raw(rest_url('lt/v1/event'));
        ?>
<script data-no-optimize="1" data-no-defer="1" data-no-minify="1" data-cfasync="false">
(function(){
  'use strict';
  try {
    var EP = <?php echo wp_json_encode($endpoint); ?>;

    // ─── Helpers ───
    function ck(k, v, days) {
      try {
        if (v === undefined) {
          var m = document.cookie.match(new RegExp('(^|; )' + k + '=([^;]*)'));
          return m ? decodeURIComponent(m[2]) : '';
        }
        var exp = '';
        if (days) {
          var d = new Date();
          d.setTime(d.getTime() + (days * 24 * 60 * 60 * 1000));
          exp = '; expires=' + d.toUTCString();
        }
        document.cookie = k + '=' + encodeURIComponent(v) + exp +
          '; path=/; SameSite=Lax' + (location.protocol === 'https:' ? '; Secure' : '');
      } catch (e) {}
    }

    function send(data) {
      var j = JSON.stringify(data);
      try {
        if (navigator.sendBeacon && navigator.sendBeacon(EP, new Blob([j], { type: 'application/json' }))) return;
      } catch (e) {}
      try { fetch(EP, { method: 'POST', body: j, headers: { 'Content-Type': 'application/json' }, keepalive: true }); } catch (e) {}
    }

    // ─── Base payload (من الكوكيز اللي tracker.js كتبها) ───
    function base(ev) {
      return {
        event: ev,
        sid: ck('ltp_sid'),
        vid: ck('ltp_vid'),
        s: ck('ltp_src') || 'direct',
        utm: ck('ltp_utm') || '',
        rh: ck('ltp_rh') || '',
        rp: ck('ltp_rp') || '',
        lp: ck('ltp_lp') || location.pathname,
        gclid: ck('ltp_gclid') || '',
        fbclid: ck('ltp_fbclid') || '',
        msclkid: ck('ltp_msclkid') || '',
        ttclid: ck('ltp_ttclid') || '',
        vis: parseInt(ck('ltp_vis') || '1', 10),
        first: ck('ltp_first') || '',
        title: (document.title || '').split(/\s[|\-–—]\s/)[0].trim(),
        url: location.href.split('#')[0],
        path: location.pathname,
        scr: screen.width + 'x' + screen.height,
        lang: navigator.language || '',
        consent: ck('ltp_consent_v2') || 'granted'
      };
    }

    // ─── 1. كشف "Add to Cart" ───
    var ADD_TO_CART_SELECTORS = [
      '[data-ltp-event="add_to_cart"]',
      'button[name="add-to-cart"]',
      'button[name="add"]',
      '.add_to_cart_button',
      '.single_add_to_cart_button',
      '[data-add-to-cart]',
      'button[class*="add-to-cart"]',
      'button[class*="addtocart"]',
      'button[class*="add-cart"]',
      'a[class*="add-to-cart"]',
      'button[id*="add-to-cart"]',
      '[data-testid*="add-to-cart"]'
    ];

    // ─── 2. كشف "Buy Now" / "Checkout" ───
    var CHECKOUT_SELECTORS = [
      '[data-ltp-event="begin_checkout"]',
      'button[name="checkout"]',
      'a.checkout-button',
      '.checkout-button',
      'button[class*="checkout"]',
      '[href*="/checkout"]',
      '[data-testid*="checkout"]'
    ];

    // ─── 3. صفحة الشكر بعد الشراء ───
    function isThankYouPage() {
      var u = location.href.toLowerCase();
      var pats = [
        '/thank-you', '/thank_you', '/thanks', '/success',
        '/order-confirmation', '/order-received', '/order/success',
        '/order-complete', '/checkout/success', '/purchase/success',
        '/confirmation', '/orders/'
      ];
      for (var i = 0; i < pats.length; i++) {
        if (u.indexOf(pats[i]) >= 0) return true;
      }
      // لو في body كلاس يدل على كده
      var cls = (document.body && document.body.className) ? document.body.className.toLowerCase() : '';
      if (/thank|success|order.received|order.complete|order.confirm/.test(cls)) return true;
      return false;
    }

    // ─── 4. استخراج القيمة من الرابط أو data-* ───
    function extractValue(el) {
      if (!el) return 0;
      var attrs = [
        el.getAttribute('data-ltp-value'),
        el.getAttribute('data-value'),
        el.getAttribute('data-price'),
        el.getAttribute('data-product-price')
      ];
      for (var i = 0; i < attrs.length; i++) {
        var v = parseFloat(String(attrs[i] || '').replace(/[^\d.]/g, ''));
        if (v > 0) return v;
      }
      // حاول نلقى القيمة من الأب
      var par = el.closest('[data-ltp-value], [data-price]');
      if (par) {
        var pv = parseFloat(String(par.getAttribute('data-ltp-value') || par.getAttribute('data-price') || '').replace(/[^\d.]/g, ''));
        if (pv > 0) return pv;
      }
      return 0;
    }

    // ─── 5. استخراج اسم المنتج ───
    function extractProduct(el) {
      if (!el) return '';
      var attrs = [
        el.getAttribute('data-ltp-product'),
        el.getAttribute('data-product-name'),
        el.getAttribute('data-product'),
        el.getAttribute('aria-label'),
        el.getAttribute('title')
      ];
      for (var i = 0; i < attrs.length; i++) {
        if (attrs[i] && attrs[i].length > 1) return String(attrs[i]).slice(0, 100);
      }
      // من الأب
      var par = el.closest('[data-product-name]');
      if (par) {
        var pn = par.getAttribute('data-product-name');
        if (pn) return String(pn).slice(0, 100);
      }
      // من h1 الصفحة
      var h1 = document.querySelector('h1');
      if (h1) return (h1.textContent || '').trim().slice(0, 100);
      return '';
    }

    // ─── 6. مراقبة الضغطات ───
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;

      // add_to_cart
      var addBtn = null;
      for (var i = 0; i < ADD_TO_CART_SELECTORS.length; i++) {
        addBtn = t.closest(ADD_TO_CART_SELECTORS[i]);
        if (addBtn) break;
      }
      if (addBtn) {
        var b1 = base('add_to_cart');
        b1.product_name = extractProduct(addBtn);
        b1.product_value = extractValue(addBtn);
        b1.btn_text = (addBtn.textContent || '').trim().slice(0, 80);
        b1.href = addBtn.href || '';
        b1.currency = 'SAR';
        send(b1);
        return;
      }

      // begin_checkout
      var checkoutBtn = null;
      for (var j = 0; j < CHECKOUT_SELECTORS.length; j++) {
        checkoutBtn = t.closest(CHECKOUT_SELECTORS[j]);
        if (checkoutBtn) break;
      }
      if (checkoutBtn) {
        var b2 = base('begin_checkout');
        b2.btn_text = (checkoutBtn.textContent || '').trim().slice(0, 80);
        b2.href = checkoutBtn.href || '';
        send(b2);
        return;
      }
    }, true);

    // ─── 7. عند فتح صفحة الشكر (شراء) ───
    if (isThankYouPage()) {
      setTimeout(function() {
        // محاولة استخراج القيمة من الصفحة
        var total = 0;
        var totalEl = document.querySelector('[data-ltp-total], .order-total, .total-amount, [class*="order-total"], [class*="total-value"]');
        if (totalEl) {
          var m = String(totalEl.textContent).match(/[\d,]+\.?\d*/);
          if (m) total = parseFloat(m[0].replace(/,/g, ''));
        }

        var orderId = '';
        var orderEl = document.querySelector('[data-ltp-order-id], .order-number, [class*="order-id"], [class*="order-number"]');
        if (orderEl) orderId = (orderEl.textContent || '').trim().slice(0, 50);
        if (!orderId) {
          var m2 = location.href.match(/order[\/=-]([A-Z0-9\-]+)/i);
          if (m2) orderId = m2[1];
        }

        var b = base('purchase');
        b.order_id = orderId;
        b.order_total = total;
        b.currency = 'SAR';
        b.detected_by = 'universal_dom';
        send(b);
      }, 1500);
    }

    // ─── 8. مراقبة "view_item" — لو في URL /product/ أو /p/ ───
    (function() {
      var u = location.pathname.toLowerCase();
      if (/\/(product|products|item|p)\//.test(u)) {
        var b = base('view_item');
        var h1 = document.querySelector('h1');
        b.product_name = h1 ? h1.textContent.trim().slice(0, 100) : '';
        var priceEl = document.querySelector('[class*="price"]:not([class*="old"]):not([class*="sale"])');
        if (priceEl) {
          var pm = String(priceEl.textContent).match(/[\d,]+\.?\d*/);
          if (pm) b.product_value = parseFloat(pm[0].replace(/,/g, ''));
        }
        b.currency = 'SAR';
        send(b);
      }
    })();

    console.log('[LTP Universal] v2.4.0 loaded');
  } catch (e) {
    if (window.console) console.error('LTP Universal:', e);
  }
})();
</script>
        <?php
    }
}