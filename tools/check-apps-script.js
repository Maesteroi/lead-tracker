#!/usr/bin/env node
// فحص كود Apps Script وسكريبت جوجل أدز قبل أي دمج:
//   1) كل ملف بيتقري من غير خطأ كتابة.
//   2) مفيش دالة متعرّفة مرتين. في Apps Script كل الملفات مساحة واحدة، وآخر تعريف هو اللي بيشتغل
//      من غير أي تحذير (ده اللي حصل في Code.js الحي 8 نوفمبر: 98 دالة متكررة).
// التشغيل: node tools/check-apps-script.js
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');

// تكرار قديم معروف ومتسجل (3 نسخ بتتصرف مختلف عند الفشل). ممنوع يزيد، ولما يتصلح السطر ده يتمسح.
const KNOWN_DUPLICATES = { getAccessToken_: 3 };

function jsFiles(dir) {
  return fs.readdirSync(path.join(root, dir)).filter((f) => f.endsWith('.js')).sort().map((f) => path.join(dir, f));
}

let failed = 0;
function fail(msg) { failed++; console.log('✗ ' + msg); }

const files = jsFiles('apps-script').concat(jsFiles('google-ads-script'));
for (const f of files) {
  try {
    execFileSync(process.execPath, ['--check', path.join(root, f)], { stdio: 'pipe' });
  } catch (e) {
    fail('خطأ كتابة في ' + f + '\n' + String(e.stderr || e.message).split('\n').slice(0, 4).join('\n'));
  }
}
if (!failed) console.log('✓ ' + files.length + ' ملف: مفيش أخطاء كتابة');

// الدوال اللي على أول السطر بس (التعريفات العامة)
const seen = {};
for (const f of jsFiles('apps-script')) {
  fs.readFileSync(path.join(root, f), 'utf8').split('\n').forEach((line, i) => {
    const m = /^(?:async\s+)?function\s*\*?\s*([A-Za-z0-9_$]+)\s*\(/.exec(line);
    if (m) (seen[m[1]] = seen[m[1]] || []).push(f + ':' + (i + 1));
  });
}
let dups = 0;
for (const name of Object.keys(seen).sort()) {
  const where = seen[name];
  if (where.length < 2) continue;
  if (KNOWN_DUPLICATES[name] === where.length) { console.log('⚠ تكرار قديم معروف: ' + name + ' (' + where.join(' · ') + ')'); continue; }
  dups++;
  fail('الدالة ' + name + ' متعرّفة ' + where.length + ' مرات: ' + where.join(' · '));
}
for (const name of Object.keys(KNOWN_DUPLICATES)) {
  if ((seen[name] || []).length < 2) fail('«' + name + '» مابقتش متكررة: امسحها من KNOWN_DUPLICATES في tools/check-apps-script.js');
}
if (!dups) console.log('✓ ' + Object.keys(seen).length + ' دالة: مفيش تكرار جديد');

console.log('\n' + (failed ? failed + ' failed' : 'all checks passed'));
process.exit(failed ? 1 : 0);
