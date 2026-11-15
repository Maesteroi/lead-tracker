// مصادر الزيارات بالتفصيل (15 نوفمبر): المجموعة ← تحتها مين بالظبط.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceTree, memberOf } from '../src/sources.js';

test('sources: grouped (ads · search · other engines · AI · social · sites · direct) with the members inside each', () => {
  const S = (fine, detail, utm) => ({ source_fine: fine, source_detail: detail || null, utm: utm || null });
  const tree = sourceTree([
    S('google_ads'), S('google_ads'), S('google_organic', 'www.google.com'),
    S('search_other', 'www.bing.com'), S('search_other', 'yandex.ru'), S('search_other', 'duckduckgo.com'),
    S('ai', 'chatgpt.com'), S('ai', '', 'source=chatgpt.com'), S('ai', 'www.perplexity.ai'), S('ai', 'gemini.google.com'),
    S('facebook'), S('instagram'), S('instagram'), S('x'),
    S('other_site', 'www.haraj.com.sa'), S('other_site', 'campaign=summer', 'source=newsletter'),
    S('direct'), S('tiktok_ads'),
  ]);
  const g = Object.fromEntries(tree.map((x) => [x.key, x]));
  assert.equal(g.google_ads.n, 2); assert.deepEqual(g.google_ads.members, []);
  assert.deepEqual(g.search_other.members.map((m) => m.label).sort(), ['Bing', 'DuckDuckGo', 'Yandex']);
  assert.deepEqual(g.ai.members.map((m) => [m.label, m.n]), [['ChatGPT', 2], ['Perplexity', 1], ['Gemini', 1]], 'ChatGPT from the referrer or from utm_source');
  assert.deepEqual(g.social.members.map((m) => [m.key, m.n]), [['instagram', 2], ['facebook', 1], ['x', 1]]);
  assert.deepEqual(g.other_site.members.map((m) => m.label).sort(), ['haraj.com.sa', 'newsletter']);
  assert.deepEqual(g.ads_other.members.map((m) => m.key), ['tiktok_ads']);
  assert.equal(tree[0].key, 'ai', 'biggest group first');
});

test('sources: an AI or engine with no referrer and no utm is «not identified», never guessed', () => {
  assert.deepEqual(memberOf('ai', 'ai', '', ''), { key: 'unknown', label: null });
  assert.equal(memberOf('google_ads', 'google_ads', 'x', ''), null);
});
