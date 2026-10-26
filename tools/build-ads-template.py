#!/usr/bin/env python3
"""يحط كود google-ads-script/click-collector.js جوه apps-script/ads-bridge.js (ADS_SCRIPT_SOURCE)
— ده الكود اللي بيظهر في قايمة «نسخ كود جوجل أدز». شغّله بعد أي تعديل في السكريبت."""
import json, pathlib, re
root = pathlib.Path(__file__).resolve().parent.parent
src = (root / 'google-ads-script/click-collector.js').read_text(encoding='utf-8')
assert "'PASTE_WEBAPP_URL'" in src and "'PASTE_ADS_KEY'" in src
p = root / 'apps-script/ads-bridge.js'
s = p.read_text(encoding='utf-8')
new = 'var ADS_SCRIPT_SOURCE = ' + json.dumps(src, ensure_ascii=False) + ';'
s2, n = re.subn(r'^var ADS_SCRIPT_SOURCE = .*;$', lambda m: new, s, flags=re.M)
assert n == 1
p.write_text(s2, encoding='utf-8')
print('ok', len(src))
