// تجهيز تحديث البلجن الموقّع: الـZIP سليم وثابت، نسخة العملاء من غير رابط الشيت، التوقيع بيتحقق، وأي مشكلة = stop (مفيش تحديث).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { build, message, pluginVersion, pluginPubkey } from '../build-plugin.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const SRC = path.join(ROOT, 'plugin/lead-tracker-pro');
const keys = () => { const k = crypto.generateKeyPairSync('ed25519'); return { priv: k.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'), pub: k.publicKey.export({ format: 'der', type: 'spki' }).subarray(12).toString('base64'), key: k.publicKey }; };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ltpfeed-'));
const release = (dir, o) => { const p = path.join(dir, 'release.json'); fs.writeFileSync(p, JSON.stringify(Object.assign({ version: pluginVersion(SRC), released_at: '2026-11-11T11:00:00Z', stable_delay_days: 3, notes: 'x' }, o || {}))); return p; };

test('a signed feed: info.json + zip, signature verifies with the public key, checksum matches the file', () => {
  const k = keys(), out = tmp();
  const info = build({ src: SRC, release: release(out), out, signingKey: k.priv, expectPubkey: k.pub });
  assert.equal(info.stop, false);
  const v = pluginVersion(SRC);
  assert.equal(info.latest.version, v);
  assert.equal(info.latest.package, 'https://app.maestrolt.com/plugin/lead-tracker-pro-' + v + '.zip');
  const zip = fs.readFileSync(path.join(out, 'lead-tracker-pro-' + v + '.zip'));
  assert.equal(crypto.createHash('sha256').update(zip).digest('hex'), info.latest.sha256);
  assert.ok(crypto.verify(null, Buffer.from(message(v, info.latest.sha256)), k.key, Buffer.from(info.latest.sig, 'base64')));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(out, 'info.json'), 'utf8')).latest.sha256, info.latest.sha256);
  assert.ok(!JSON.stringify(info).includes(k.priv));                                                // المفتاح الخاص مش في أي ملف منشور
  assert.ok(!fs.readdirSync(out).some((f) => fs.readFileSync(path.join(out, f)).includes(k.priv)));
});

test('the zip is a real customer build: valid archive, plugin folder, no apps-script, no sheet link', () => {
  const k = keys(), out = tmp();
  build({ src: SRC, release: release(out), out, signingKey: k.priv, expectPubkey: k.pub });
  const zipPath = path.join(out, 'lead-tracker-pro-' + pluginVersion(SRC) + '.zip');
  const py = execFileSync('python3', ['-I', '-c', 'import zipfile,sys,json;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;n=z.namelist();print(json.dumps({"n":n,"cfg":json.loads(z.read("lead-tracker-pro/config.json"))}))', zipPath]).toString();
  const r = JSON.parse(py);
  assert.ok(r.n.includes('lead-tracker-pro/lead-tracker-pro.php') && r.n.includes('lead-tracker-pro/includes/class-ltp-updater.php'));
  assert.ok(r.n.every((n) => n.startsWith('lead-tracker-pro/')) && !r.n.some((n) => n.includes('/apps-script/')));
  assert.deepEqual([r.cfg.webhook_url, r.cfg.webhook_secret, r.cfg.server_host], ['', '', 'api.maestrolt.com']);
});

test('same source = same checksum (reproducible build)', () => {
  const k = keys(), a = tmp(), b = tmp();
  const x = build({ src: SRC, release: release(a), out: a, signingKey: k.priv, expectPubkey: k.pub });
  const y = build({ src: SRC, release: release(b), out: b, signingKey: k.priv, expectPubkey: k.pub });
  assert.equal(x.latest.sha256, y.latest.sha256);
});

test('anything wrong = stop (no update offered, no zip), and the deploy itself does not fail', () => {
  const k = keys(), other = keys();
  for (const [name, args] of [
    ['no signing key', { signingKey: '' }],
    ['key not matching the plugin public key', { signingKey: other.priv }],
    ['garbage key', { signingKey: 'not-a-key' }],
    ['release.json version differs from the plugin', { rel: { version: '9.9.9' } }],
    ['stop switch in release.json', { rel: { stop: true } }],
  ]) {
    const out = tmp();
    const info = build({ src: SRC, release: release(out, args.rel), out, signingKey: args.signingKey === undefined ? k.priv : args.signingKey, expectPubkey: k.pub });
    assert.equal(info.stop, true, name);
    assert.ok(!fs.readdirSync(out).some((f) => f.endsWith('.zip')), name);
    assert.equal(JSON.parse(fs.readFileSync(path.join(out, 'info.json'), 'utf8')).stop, true, name);
  }
});

test('the real plugin carries the public key from Mahmoud and the release file matches the plugin version', () => {
  assert.equal(Buffer.from(pluginPubkey(SRC), 'base64').length, 32);
  assert.equal(JSON.parse(fs.readFileSync(path.join(ROOT, 'plugin/release.json'), 'utf8')).version, pluginVersion(SRC));
});
