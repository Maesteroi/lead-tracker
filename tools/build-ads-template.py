#!/usr/bin/env python3
"""يبني apps-script/ads-script.html من google-ads-script/click-collector.js
(الكود اللي بيظهر في قايمة «نسخ كود جوجل أدز»). شغّله بعد أي تعديل في السكريبت."""
import html, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
src = (root / 'google-ads-script/click-collector.js').read_text(encoding='utf-8')
assert "'PASTE_WEBAPP_URL'" in src and "'PASTE_ADS_KEY'" in src
body = html.escape(src, quote=False)
body = body.replace("'PASTE_WEBAPP_URL'", "'<?= url ?>'").replace("'PASTE_ADS_KEY'", "'<?= key ?>'")
assert '<?' not in html.escape(src, quote=False)
page = '''<!DOCTYPE html>
<html dir="rtl"><head><base target="_top"><meta charset="utf-8">
<style>
body{font-family:Arial,sans-serif;margin:0;padding:12px;color:#202124}
ol{margin:6px 0 10px;padding-inline-start:20px;line-height:1.7;font-size:14px}
textarea{width:100%;height:330px;direction:ltr;font:12px/1.4 monospace;box-sizing:border-box}
button{background:#1a73e8;color:#fff;border:0;border-radius:6px;padding:10px 22px;font-size:15px;cursor:pointer}
#ok{color:#188038;margin-inline-start:10px;font-size:14px}
</style></head><body>
<ol>
<li>دوس <b>نسخ الكود</b>.</li>
<li>في أي حساب جوجل أدز: الأدوات ← الإجراءات المجمّعة ← النصوص البرمجية ← <b>+</b> ← الزق الكود زي ما هو.</li>
<li><b>تشغيل</b>. الحساب والحملات بيتكتبوا في دفتر «🌐 المواقع» لوحدهم.</li>
<li>من قايمة النصوص البرمجية: <b>التكرار ← يوميًا</b> الساعة 3 الفجر.</li>
</ol>
<button id="b" onclick="cp()">نسخ الكود</button><span id="ok"></span>
<textarea id="c" readonly>''' + body + '''</textarea>
<script>
function cp(){var t=document.getElementById('c');t.focus();t.select();var done=false;
try{done=document.execCommand('copy');}catch(e){}
if(!done&&navigator.clipboard){navigator.clipboard.writeText(t.value).then(function(){ok();});return;}
ok(done);}
function ok(d){document.getElementById('ok').textContent=(d===false)?'اضغط Ctrl+C (الكود متحدد)':'✓ اتنسخ';}
</script></body></html>
'''
(root / 'apps-script/ads-script.html').write_text(page, encoding='utf-8')
print('ok', len(page))
