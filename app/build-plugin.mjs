// تجهيز تحديث البلجن الموقّع (قرار محمود 10 نوفمبر). بيشتغل في Cloudflare Workers Builds قبل نشر اللوحة:
//   Build command:  node build-plugin.mjs        (Root directory = app)
// بيعمل نسخة العملاء من plugin/lead-tracker-pro (من غير فولدر apps-script ومن غير رابط الشيت)، ويحسب بصمتها (sha256)،
// ويوقّع «lead-tracker-pro|الإصدار|البصمة» بالمفتاح الخاص (سر البناء PLUGIN_SIGNING_KEY، مش في المستودع)،
// ويكتب public/plugin/info.json + public/plugin/lead-tracker-pro-<الإصدار>.zip.
// أمان: لو المفتاح ناقص، أو مش مطابق للمفتاح العام اللي جوه البلجن، أو الإصدار مش مطابق لـplugin/release.json،
// أو release.json فيه "stop": true ← info.json بيتكتب بـ"stop": true ومفيش ملف تحديث (والمواقع ماتتحدّثش). النشر نفسه مابيفشلش.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const SRC = path.resolve(opt('--src', path.join(HERE, '../plugin/lead-tracker-pro')));
const RELEASE = path.resolve(opt('--release', path.join(HERE, '../plugin/release.json')));
const OUT = path.resolve(opt('--out', path.join(HERE, 'public/plugin')));
const BASE_URL = 'https://app.maestrolt.com/plugin/';
const SLUG = 'lead-tracker-pro';

// ── ZIP ثابت (نفس المدخل = نفس البصمة) من غير أي مكتبة ──
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
export function makeZip(files) {   // files: [{ name, data(Buffer) }] بالترتيب
  const DOS_TIME = 0, DOS_DATE = (0 << 9) | (1 << 5) | 1;   // 1980-01-01 00:00 (ثابت)
  const locals = [], centrals = []; let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8');
    const comp = zlib.deflateRawSync(f.data, { level: 9 });
    const crc = crc32(f.data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8);
    lh.writeUInt16LE(DOS_TIME, 10); lh.writeUInt16LE(DOS_DATE, 12); lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(f.data.length, 22); lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10);
    ch.writeUInt16LE(DOS_TIME, 12); ch.writeUInt16LE(DOS_DATE, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20);
    ch.writeUInt32LE(f.data.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(0, 30); ch.writeUInt32LE(0, 34); ch.writeUInt32LE(0, 38); ch.writeUInt32LE(offset, 42);
    locals.push(lh, name, comp); centrals.push(ch, name);
    offset += lh.length + name.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

// نسخة العملاء: كل ملفات البلجن ما عدا apps-script/، وconfig.json من غير رابط الشيت
export function customerFiles(src) {
  const out = [];
  const walk = (dir, rel) => {
    for (const n of fs.readdirSync(dir).sort()) {
      const p = path.join(dir, n), r = rel ? rel + '/' + n : n;
      if (!rel && n === 'apps-script') continue;
      if (n.startsWith('.')) continue;
      if (fs.statSync(p).isDirectory()) walk(p, r);
      else out.push({ name: SLUG + '/' + r, data: fs.readFileSync(p) });
    }
  };
  walk(src, '');
  const cfg = out.find((f) => f.name === SLUG + '/config.json');
  if (cfg) {
    const c = JSON.parse(cfg.data.toString('utf8'));
    Object.assign(c, { webhook_url: '', webhook_secret: '', site_label: '', server_host: 'api.maestrolt.com' });
    cfg.data = Buffer.from(JSON.stringify(c, null, 2) + '\n', 'utf8');
  }
  return out;
}

export const message = (version, sha) => SLUG + '|' + version + '|' + sha;

function privateKey(b64) {
  const der = Buffer.from(String(b64 || '').trim(), 'base64');
  return crypto.createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
}
function publicKeyFromRaw(b64) {
  const raw = Buffer.from(String(b64 || '').trim(), 'base64');
  if (raw.length !== 32) throw new Error('public key must be 32 bytes');
  return crypto.createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), raw]), format: 'der', type: 'spki' });
}
export function pluginPubkey(src) {
  const m = /const PUBKEY\s*=\s*'([A-Za-z0-9+/=]*)'/.exec(fs.readFileSync(path.join(src, 'includes/class-ltp-updater.php'), 'utf8'));
  return m ? m[1] : '';
}
export function pluginVersion(src) {
  const m = /define\('LTP_VERSION', '([^']+)'\)/.exec(fs.readFileSync(path.join(src, 'lead-tracker-pro.php'), 'utf8'));
  return m ? m[1] : '';
}

export function build({ src = SRC, release = RELEASE, out = OUT, signingKey = process.env.PLUGIN_SIGNING_KEY, expectPubkey = process.env.PLUGIN_EXPECT_PUBKEY } = {}) {
  fs.mkdirSync(out, { recursive: true });
  for (const f of fs.readdirSync(out)) if (/^lead-tracker-pro-.*\.zip$/.test(f) || f === 'info.json') fs.unlinkSync(path.join(out, f));
  const stop = (reason) => {
    const info = { slug: SLUG, stop: true, reason, built_at: new Date().toISOString() };
    fs.writeFileSync(path.join(out, 'info.json'), JSON.stringify(info, null, 2) + '\n');
    return info;
  };
  let rel;
  try { rel = JSON.parse(fs.readFileSync(release, 'utf8')); } catch (e) { return stop('release.json missing or invalid'); }
  const version = pluginVersion(src);
  if (!/^\d+\.\d+\.\d+$/.test(version)) return stop('plugin version not found');
  if (rel.version !== version) return stop('release.json version ' + rel.version + ' != plugin ' + version);
  if (rel.stop) return stop('stopped in release.json');
  if (!signingKey) return stop('unsigned: PLUGIN_SIGNING_KEY is not set');
  let priv, pub;
  try { priv = privateKey(signingKey); pub = publicKeyFromRaw(expectPubkey || pluginPubkey(src)); } catch (e) { return stop('bad key: ' + e.message); }
  const zip = makeZip(customerFiles(src));
  const sha = crypto.createHash('sha256').update(zip).digest('hex');
  const sig = crypto.sign(null, Buffer.from(message(version, sha)), priv);
  if (!crypto.verify(null, Buffer.from(message(version, sha)), pub, sig)) return stop('signing key does not match the public key inside the plugin');
  const file = SLUG + '-' + version + '.zip';
  fs.writeFileSync(path.join(out, file), zip);
  const info = {
    slug: SLUG, stop: false,
    stable_delay_days: Number.isFinite(rel.stable_delay_days) ? rel.stable_delay_days : 3,
    latest: {
      version, package: BASE_URL + file, sha256: sha, sig: sig.toString('base64'),
      released_at: rel.released_at, requires: '5.8', requires_php: '7.4', tested: String(rel.tested || '6.8'),
      notes: String(rel.notes || '').slice(0, 500),
    },
    built_at: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(out, 'info.json'), JSON.stringify(info, null, 2) + '\n');
  return info;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const info = build();
  // مابنطبعش أي سر: الإصدار والبصمة والحالة بس
  console.log(info.stop ? 'plugin feed: STOPPED (' + info.reason + ')' : 'plugin feed: ' + info.latest.version + ' sha256=' + info.latest.sha256);
}
