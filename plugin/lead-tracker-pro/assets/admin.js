jQuery(function ($) {
  $('#ltp-test-webhook').on('click', function () {
    var $btn = $(this);
    var $res = $('#ltp-test-result');

    $btn.prop('disabled', true).text('⏳ جارٍ الاختبار...');
    $res.removeClass('success error').text('').hide();

    $.post(LTP_ADMIN.ajax, {
      action: 'ltp_test_webhook',
      nonce: LTP_ADMIN.nonce
    })
    .done(function (r) {
      if (r.success) {
        $res.addClass('success').text(r.data.msg).show();
      } else {
        $res.addClass('error').text(r.data.msg).show();
      }
    })
    .fail(function () {
      $res.addClass('error').text('❌ فشل الاتصال بالخادم').show();
    })
    .always(function () {
      $btn.prop('disabled', false).text('اختبار Webhook');
    });
  });
});