// عميل صغير لـSupabase (PostgREST + Storage) بـfetch بس، من غير مكتبات.
// كل النداءات بمفتاح الخدمة (السيرفر بس). المفتاح في أسرار Cloudflare، مش في الكود.

export class Db {
  constructor(env, fetchImpl) {
    this.base = String(env.SUPABASE_URL || '').replace(/\/$/, '');
    this.key = env.SUPABASE_SERVICE_KEY || '';
    this.fetch = fetchImpl || ((...a) => fetch(...a));
    if (!this.base || !this.key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_KEY missing');
  }

  headers(extra) {
    return Object.assign({
      apikey: this.key,
      Authorization: 'Bearer ' + this.key,
      'Content-Type': 'application/json',
    }, extra || {});
  }

  async req(method, path, body, extra) {
    const res = await this.fetch(this.base + '/rest/v1/' + path, {
      method,
      headers: this.headers(extra),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      const err = new Error('db ' + method + ' ' + path.split('?')[0] + ' ' + res.status + ': ' + text.slice(0, 300));
      err.status = res.status;
      throw err;
    }
    return text ? JSON.parse(text) : null;
  }

  // select: q مثال «clients?id=eq.abc&select=*»
  select(q) { return this.req('GET', q); }

  async one(q) {
    const rows = await this.select(q + (q.includes('?') ? '&' : '?') + 'limit=1');
    return rows && rows[0] ? rows[0] : null;
  }

  insert(table, rows, opts) {
    opts = opts || {};
    const prefer = ['return=' + (opts.returning === false ? 'minimal' : 'representation')];
    if (opts.ignoreDuplicates) prefer.push('resolution=ignore-duplicates');
    if (opts.merge) prefer.push('resolution=merge-duplicates');
    const q = table + (opts.onConflict ? '?on_conflict=' + encodeURIComponent(opts.onConflict) : '');
    return this.req('POST', q, rows, { Prefer: prefer.join(',') });
  }

  update(q, patch) { return this.req('PATCH', q, patch, { Prefer: 'return=representation' }); }

  // Storage
  async putObject(bucket, path, bytes, mime) {
    const res = await this.fetch(this.base + '/storage/v1/object/' + bucket + '/' + path, {
      method: 'POST',
      headers: { apikey: this.key, Authorization: 'Bearer ' + this.key, 'Content-Type': mime || 'application/octet-stream', 'x-upsert': 'true' },
      body: bytes,
    });
    if (!res.ok) throw new Error('storage put ' + res.status + ': ' + (await res.text()).slice(0, 200));
    return path;
  }

  async getObject(bucket, path) {
    const res = await this.fetch(this.base + '/storage/v1/object/' + bucket + '/' + path, {
      headers: { apikey: this.key, Authorization: 'Bearer ' + this.key },
    });
    if (!res.ok) throw new Error('storage get ' + res.status);
    return res.arrayBuffer();
  }

  async deleteObject(bucket, path) {
    const res = await this.fetch(this.base + '/storage/v1/object/' + bucket, {
      method: 'DELETE',
      headers: this.headers(),
      body: JSON.stringify({ prefixes: [path] }),
    });
    return res.ok;
  }
}

export const eq = (v) => 'eq.' + encodeURIComponent(String(v));
