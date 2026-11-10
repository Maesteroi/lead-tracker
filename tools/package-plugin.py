#!/usr/bin/env python3
"""يطلّع ملف ZIP للبلجن.

  python3 tools/package-plugin.py              نسخة الشغل بتاعتنا (زي ما هي، بالهب القديم في config.json)
  python3 tools/package-plugin.py --customer   نسخة العملاء: من غير هب الشيت (webhook_url فاضي) ومن غير فولدر apps-script

ليه نسخة العملاء لازم تتفصل: config.json في نسخة الشغل فيه رابط الشيت بتاعنا، فأي موقع يتركّب عليها بيحاول يتسجّل في شيتنا
كل ساعة. نسخة العملاء بتستنى كود الربط من لوحة Maestro LT (البلجن 2.10+).
الملف بيتحط في dist/ (مش بيتحط في المستودع).
"""
import json, os, re, sys, zipfile

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(ROOT, 'plugin', 'lead-tracker-pro')
customer = '--customer' in sys.argv

ver = re.search(r"define\('LTP_VERSION', '([^']+)'\)", open(os.path.join(SRC, 'lead-tracker-pro.php'), encoding='utf-8').read()).group(1)
out_dir = os.path.join(ROOT, 'dist'); os.makedirs(out_dir, exist_ok=True)
out = os.path.join(out_dir, 'lead-tracker-pro-%s%s.zip' % (ver, '-customer' if customer else ''))

cfg = json.load(open(os.path.join(SRC, 'config.json'), encoding='utf-8'))
if customer:
    cfg['webhook_url'] = ''
    cfg['webhook_secret'] = ''
    cfg['site_label'] = ''
    cfg['server_host'] = 'api.maestrolt.com'

with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for base, dirs, files in os.walk(SRC):
        dirs[:] = sorted(d for d in dirs if not (customer and base == SRC and d == 'apps-script'))
        for f in sorted(files):
            full = os.path.join(base, f)
            rel = os.path.relpath(full, SRC)
            if rel == 'config.json':
                z.writestr('lead-tracker-pro/config.json', json.dumps(cfg, ensure_ascii=False, indent=2) + '\n')
            else:
                z.write(full, 'lead-tracker-pro/' + rel)

# فحص ذاتي: نسخة العملاء مفيهاش أي رابط شيت في أي ملف
if customer:
    with zipfile.ZipFile(out) as z:
        for n in z.namelist():
            data = z.read(n)
            if re.search(rb'script\.google\.com/macros/s/[A-Za-z0-9_-]{20,}', data) and not n.endswith(('.php', '.txt', '.md')):
                sys.exit('❌ لقيت رابط شيت في %s' % n)
        c = json.loads(z.read('lead-tracker-pro/config.json'))
        assert c['webhook_url'] == '' and c['webhook_secret'] == '', 'config.json لسه فيه هب'
        assert not any(n.startswith('lead-tracker-pro/apps-script/') for n in z.namelist()), 'apps-script لسه في الملف'
print(out, '(%d KB)' % (os.path.getsize(out) // 1024))
