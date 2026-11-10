// Google Ads API (REST) — قراية بس. مفيش أي تعديل على حسابات الإعلانات من هنا.
// المراجعة الرسمية (10 نوفمبر 2026) في kb/04-channels/google-ads/api-official-review.md:
//  • الوصول على مشروع Google Cloud بتاع الـOAuth (Basic = 15,000 عملية في آخر 24 ساعة). مفيش developer token.
//  • كل طلب Search أو SearchStream = عملية واحدة مهما كان عدد الصفوف.
//  • click_view: يوم واحد في كل استعلام، وآخر 90 يوم بس، وأي حقل في WHERE لازم يبقى في SELECT.

export const ADS_VERSION_DEFAULT = 'v26';

const f0 = (fetchImpl) => fetchImpl || ((...a) => fetch(...a));

// refresh token ← access token. لازم نفس الـOAuth client اللي عليه Basic.
export async function accessToken(env, refreshToken, fetchImpl) {
  const res = await f0(fetchImpl)('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, refresh_token: refreshToken, grant_type: 'refresh_token' }).toString(),
  });
  let j = {};
  try { j = await res.json(); } catch (e) {}
  if (!res.ok || !j.access_token) {
    const err = new Error('oauth ' + res.status + ': ' + String(j.error || 'no token').slice(0, 60));   // اسم الخطأ بس، من غير أي قيمة
    err.code = String(j.error || '');
    throw err;
  }
  return j.access_token;
}

export function adsClient({ env, access, customerId, loginCustomerId, fetchImpl }) {
  const ver = String(env.ADS_API_VERSION || ADS_VERSION_DEFAULT).trim();
  const headers = { Authorization: 'Bearer ' + access, 'Content-Type': 'application/json' };
  if (loginCustomerId) headers['login-customer-id'] = String(loginCustomerId);
  const client = {
    ops: 0,
    async query(gaql) {
      client.ops++;   // الطلب بيتحسب عملية حتى لو فشل
      const res = await f0(fetchImpl)('https://googleads.googleapis.com/' + ver + '/customers/' + customerId + '/googleAds:searchStream', {
        method: 'POST', headers, body: JSON.stringify({ query: gaql }),
      });
      const text = await res.text();
      let body;
      try { body = JSON.parse(text || '[]'); } catch (e) { body = null; }
      if (!res.ok) {
        const e0 = ((Array.isArray(body) ? body[0] : body) || {}).error || {};
        const err = new Error('ads ' + res.status + ': ' + String(e0.message || e0.status || 'error').slice(0, 200));
        err.status = res.status;
        throw err;
      }
      const rows = [];
      for (const chunk of Array.isArray(body) ? body : [body || {}]) for (const r of chunk.results || []) rows.push(r);
      return rows;
    },
  };
  return client;
}

// ── الاستعلامات ──
const day1 = (d) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error('bad day'); return d; };

export const Q = {
  customer: () => 'SELECT customer.id, customer.currency_code, customer.time_zone, customer.status FROM customer',

  campaigns: () => 'SELECT campaign.id, campaign.name, campaign.status, campaign.primary_status, campaign.primary_status_reasons, campaign_budget.amount_micros ' +
    "FROM campaign WHERE campaign.status != 'REMOVED'",

  campaignDay: (d) => 'SELECT campaign.id, campaign.name, segments.date, metrics.impressions, metrics.clicks, metrics.invalid_clicks, metrics.cost_micros, ' +
    "metrics.conversions, metrics.conversions_value FROM campaign WHERE segments.date = '" + day1(d) + "'",

  clickTypes: (d) => "SELECT campaign.id, segments.date, segments.click_type, metrics.clicks FROM campaign WHERE segments.date = '" + day1(d) + "'",

  searchTerms: (d) => 'SELECT campaign.id, campaign.name, ad_group.id, ad_group.name, segments.date, segments.keyword.info.text, segments.keyword.info.match_type, ' +
    'search_term_view.search_term, metrics.clicks, metrics.impressions, metrics.cost_micros, metrics.conversions ' +
    "FROM search_term_view WHERE segments.date = '" + day1(d) + "' AND metrics.impressions > 0",

  // نفس حقول سكريبت الحساب المجرّب (google-ads-script/click-collector.js)
  clicks: (d) => 'SELECT click_view.gclid, campaign.id, campaign.name, ad_group.name, click_view.keyword_info.text, click_view.keyword_info.match_type, ' +
    'segments.date, segments.device, segments.ad_network_type, segments.click_type, segments.slot, click_view.page_number, ' +
    'click_view.location_of_presence.city, click_view.location_of_presence.region, click_view.location_of_presence.country, click_view.location_of_presence.most_specific, ' +
    'click_view.area_of_interest.city, click_view.area_of_interest.country, metrics.clicks ' +
    "FROM click_view WHERE segments.date = '" + day1(d) + "'",

  adsPolicy: () => 'SELECT campaign.id, ad_group_ad.policy_summary.approval_status FROM ad_group_ad ' +
    "WHERE ad_group_ad.status = 'ENABLED' AND ad_group.status = 'ENABLED' AND campaign.status = 'ENABLED'",

  geo: (names) => 'SELECT geo_target_constant.resource_name, geo_target_constant.id, geo_target_constant.name, geo_target_constant.target_type, geo_target_constant.country_code ' +
    'FROM geo_target_constant WHERE geo_target_constant.resource_name IN (' + names.map((n) => "'" + String(n).replace(/[^A-Za-z0-9/]/g, '') + "'").join(',') + ')',
};

// «geoTargetConstants/1012088» ← «1012088»
export const geoId = (resourceName) => { const m = /(\d+)$/.exec(String(resourceName || '')); return m ? m[1] : null; };
