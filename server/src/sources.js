// مصادر الزيارات بالتفصيل (15 نوفمبر، طلب محمود): مجموعة ← وتحتها مين بالظبط.
// • إعلان جوجل · بحث جوجل · خرائط جوجل
// • محرك بحث آخر ← Bing · Yandex · DuckDuckGo …   • ذكاء اصطناعي ← ChatGPT · Perplexity · Gemini …
// • سوشيال ← فيسبوك · إنستجرام · إكس · تيك توك …   • إعلانات أخرى ← إعلان بينج · تيك توك …
// • مواقع أخرى ← اسم الموقع اللي جه منه           • مباشر
// التفصيل من الدومين اللي الزائر جه منه (source_detail) أو utm_source، اللي البلجن بيبعتهم من الأول.

const GROUP_OF = {
  google_ads: 'google_ads', google_organic: 'google_organic', google_maps: 'google_maps', maps: 'google_maps', google: 'google_organic',
  search_other: 'search_other', bing: 'search_other',
  ai: 'ai',
  facebook: 'social', instagram: 'social', tiktok: 'social', snapchat: 'social', youtube: 'social', x: 'social', whatsapp: 'social', threads: 'social', linkedin: 'social', social_other: 'social', social: 'social',
  bing_ads: 'ads_other', tiktok_ads: 'ads_other', ads_other: 'ads_other', ads: 'ads_other',
  other_site: 'other_site', other: 'other_site', listening: 'listening', direct: 'direct',
};
export const GROUPS = ['google_ads', 'google_organic', 'google_maps', 'search_other', 'ai', 'social', 'ads_other', 'other_site', 'listening', 'direct'];

// أسماء تجارية معروفة (نفس الاسم بالعربي والإنجليزي)
const ENGINES = [[/(^|\.)bing\./, 'Bing'], [/yandex\./, 'Yandex'], [/duckduckgo\./, 'DuckDuckGo'], [/yahoo\./, 'Yahoo'], [/ecosia\./, 'Ecosia'], [/search\.brave\.|brave\.com/, 'Brave'], [/baidu\./, 'Baidu'], [/naver\./, 'Naver'], [/petalsearch|petal\./, 'Petal']];
const AIS = [[/chatgpt|openai/, 'ChatGPT'], [/perplexity/, 'Perplexity'], [/gemini|bard\.google/, 'Gemini'], [/copilot/, 'Copilot'], [/claude\.ai|anthropic/, 'Claude'], [/deepseek/, 'DeepSeek'], [/grok|x\.ai/, 'Grok'], [/you\.com/, 'You.com'], [/meta\.ai/, 'Meta AI'], [/mistral|chat\.mistral/, 'Mistral']];

function hostOf(detail, utm) {
  const d = String(detail || '').trim().toLowerCase();
  if (d && !d.startsWith('campaign=')) return d.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '').replace(/^m\./, '');
  const m = String(utm || '').toLowerCase().match(/(?:^|·\s*)source=([^·]+)/);
  return m ? m[1].trim().replace(/^www\./, '') : '';
}
function named(list, h) { for (const [re, name] of list) if (re.test(h)) return name; return null; }

// اسم العضو جوه المجموعة: سوشيال وإعلانات = مفتاح ثابت (الواجهة بتترجمه) · الباقي = اسم أو دومين
export function memberOf(group, fine, detail, utm) {
  if (group === 'social' || group === 'ads_other') return { key: fine || group, label: null };
  if (group === 'search_other' || group === 'ai' || group === 'other_site') {
    const h = hostOf(detail, utm);
    const n = group === 'search_other' ? named(ENGINES, h) : group === 'ai' ? named(AIS, h) : (named(AIS, h) || named(ENGINES, h));
    if (n) return { key: n.toLowerCase(), label: n };
    if (h) return { key: h, label: h.slice(0, 60) };
    return { key: 'unknown', label: null };
  }
  return null;
}

export function groupOf(fine) { return GROUP_OF[fine] || 'other_site'; }

// sessions ← [{ key, n, members: [{ key, label, n }] }] بالترتيب من الأكبر
export function sourceTree(sessions) {
  const g = new Map();
  for (const s of sessions || []) {
    const fine = s.source_fine || s.source || 'direct';
    const key = groupOf(fine);
    const x = g.get(key) || { key, n: 0, m: new Map() };
    x.n++;
    const mem = memberOf(key, fine, s.source_detail, s.utm);
    if (mem) { const y = x.m.get(mem.key) || { key: mem.key, label: mem.label, n: 0 }; y.n++; x.m.set(mem.key, y); }
    g.set(key, x);
  }
  return [...g.values()].sort((a, b) => b.n - a.n).map((x) => ({ key: x.key, n: x.n, members: [...x.m.values()].sort((a, b) => b.n - a.n).slice(0, 12) }));
}
