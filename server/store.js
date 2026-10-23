// Data layer for the server. Two interchangeable stores:
//   supabase: the real database (used when SUPABASE_URL and SUPABASE_SERVICE_KEY are set)
//   memory:   data/clients.json plus in-memory chats (for quick tests; resets on restart)
// The server only talks to the functions below, so nothing else changes between them.

import { readFileSync } from 'node:fs';

const SB_URL = process.env.SUPABASE_URL?.replace(/\/+$/, '');
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

export const STORE_KIND =
  SB_URL && SB_KEY && process.env.FORCE_MEMORY_STORE !== '1' ? 'supabase' : 'memory';

const monthStart = () => new Date().toISOString().slice(0, 7) + '-01';
const dayStartIso = () => new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z';

// ---------------------------------------------------------------- memory
function memoryStore() {
  const clients = JSON.parse(
    readFileSync(new URL('./data/clients.json', import.meta.url), 'utf8')
  ).map((c) => ({ ...c, id: c.license_key, unknown_message_mode: 'always' }));

  const numbers = new Map(); // "clientId|number" -> { status, bot_paused_until }
  for (const c of clients) {
    for (const n of c.ignored || []) numbers.set(`${c.id}|${n}`, { status: 'ignored' });
  }
  const chats = new Map(); // "clientId|number" -> [{ role, content }]
  const used = new Map(); // clientId -> count
  const replies = new Map(); // "clientId|number|day" -> count
  const today = () => new Date().toISOString().slice(0, 10);

  return {
    async getClient(licenseKey) {
      return clients.find((c) => c.license_key === licenseKey) || null;
    },
    async getNumber(client, number) {
      return numbers.get(`${client.id}|${number}`) || null;
    },
    async addCustomer(client, number) {
      const k = `${client.id}|${number}`;
      if (!numbers.has(k)) numbers.set(k, { status: 'customer' });
    },
    async chatsUsed(client) {
      return used.get(client.id) || 0;
    },
    async countRepliesToday(client, number) {
      return replies.get(`${client.id}|${number}|${today()}`) || 0;
    },
    async getHistory(client, number, limit) {
      return (chats.get(`${client.id}|${number}`) || []).slice(-limit);
    },
    async recordExchange(client, number, userText, reply) {
      const k = `${client.id}|${number}`;
      const h = chats.get(k) || [];
      h.push({ role: 'user', content: userText }, { role: 'assistant', content: reply });
      chats.set(k, h);
      const n = (used.get(client.id) || 0) + 1;
      used.set(client.id, n);
      const dk = `${k}|${today()}`;
      replies.set(dk, (replies.get(dk) || 0) + 1);
      return n;
    },
  };
}

// -------------------------------------------------------------- supabase
function supabaseStore() {
  const baseHeaders = { apikey: SB_KEY, 'content-type': 'application/json' };
  // Legacy service_role keys are JWTs and go in Authorization too.
  // New-style secret keys (sb_secret_...) go in the apikey header only.
  if (!SB_KEY.startsWith('sb_')) baseHeaders.authorization = `Bearer ${SB_KEY}`;

  async function rest(path, { method = 'GET', body, headers = {} } = {}) {
    const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
      method,
      headers: { ...baseHeaders, ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!r.ok) {
      throw new Error(`Supabase ${r.status} on ${method} ${path.split('?')[0]}: ${(await r.text()).slice(0, 300)}`);
    }
    return r;
  }
  async function json(path, opts) {
    const r = await rest(path, opts);
    const t = await r.text();
    return t ? JSON.parse(t) : null;
  }
  const enc = encodeURIComponent;

  return {
    async getClient(licenseKey) {
      const rows = await json(`clients?license_key=eq.${enc(licenseKey)}&select=*&limit=1`);
      return rows?.[0] || null;
    },
    async getNumber(client, number) {
      const rows = await json(
        `numbers?client_id=eq.${client.id}&number=eq.${enc(number)}&select=status,bot_paused_until&limit=1`
      );
      return rows?.[0] || null;
    },
    async addCustomer(client, number, source = 'first_message') {
      await rest('numbers?on_conflict=client_id,number', {
        method: 'POST',
        headers: { prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: { client_id: client.id, number, status: 'customer', source },
      });
    },
    async chatsUsed(client) {
      // The counter restarts in a new month (the database function does the same on write).
      return String(client.month_start) < monthStart() ? 0 : client.chats_this_month;
    },
    async countRepliesToday(client, number) {
      const r = await rest(
        `messages?client_id=eq.${client.id}&number=eq.${enc(number)}&source=eq.bot` +
          `&sent_at=gte.${enc(dayStartIso())}&select=id&limit=1`,
        { headers: { prefer: 'count=exact' } }
      );
      const total = (r.headers.get('content-range') || '').split('/')[1];
      return Number(total) || 0;
    },
    async getHistory(client, number, limit) {
      const rows = await json(
        `messages?client_id=eq.${client.id}&number=eq.${enc(number)}` +
          `&select=direction,body&order=sent_at.desc&limit=${limit}`
      );
      const list = (rows || [])
        .reverse()
        .map((m) => ({ role: m.direction === 'in' ? 'user' : 'assistant', content: m.body }));
      while (list.length && list[0].role === 'assistant') list.shift(); // chats must start with the customer
      return list;
    },
    async recordExchange(client, number, userText, reply) {
      const t1 = new Date();
      const t2 = new Date(t1.getTime() + 1); // keeps the reply after the question
      await rest('messages', {
        method: 'POST',
        headers: { prefer: 'return=minimal' },
        body: [
          { client_id: client.id, number, direction: 'in', body: userText, source: 'customer', sent_at: t1.toISOString() },
          { client_id: client.id, number, direction: 'out', body: reply, source: 'bot', sent_at: t2.toISOString() },
        ],
      });
      const n = await json('rpc/increment_chat', { method: 'POST', body: { p_client: client.id } });
      return Number(n);
    },
  };
}

export const store = STORE_KIND === 'supabase' ? supabaseStore() : memoryStore();

// Used by check-db.js: confirms every table is reachable with the server key.
export async function checkDatabase() {
  if (STORE_KIND !== 'supabase') return { kind: 'memory', tables: {} };
  const headers = { apikey: SB_KEY };
  if (!SB_KEY.startsWith('sb_')) headers.authorization = `Bearer ${SB_KEY}`;
  const tables = {};
  for (const t of ['clients', 'numbers', 'calls', 'messages', 'outbox', 'devices', 'payments']) {
    const r = await fetch(`${SB_URL}/rest/v1/${t}?select=*&limit=1`, { headers });
    tables[t] = r.ok ? 'ok' : `error ${r.status}: ${(await r.text()).slice(0, 160)}`;
  }
  return { kind: 'supabase', tables };
}
