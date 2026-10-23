// Checks that the server can reach Supabase and that the tables exist.
// Run after the schema is installed:  npm run check-db

import { store, STORE_KIND, checkDatabase } from './store.js';

if (STORE_KIND !== 'supabase') {
  console.error('Supabase is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_KEY to .env (see .env.example).');
  process.exit(1);
}

let bad = 0;
try {
  const { tables } = await checkDatabase();
  for (const [name, status] of Object.entries(tables)) {
    console.log(`${status === 'ok' ? 'OK  ' : 'FAIL'}  table ${name}${status === 'ok' ? '' : '  ' + status}`);
    if (status !== 'ok') bad++;
  }
  const client = await store.getClient('TEST-ACTIVE');
  console.log(client ? 'OK    sample client TEST-ACTIVE found' : 'FAIL  sample client TEST-ACTIVE not found (did the schema run completely?)');
  if (!client) bad++;
} catch (err) {
  console.error('FAIL  could not reach the database:', err.message);
  const cause = err.cause;
  if (cause) {
    console.error(`      reason: ${cause.code || cause.name || ''} ${cause.message || ''}`.trimEnd());
    const hints = {
      ERR_INVALID_URL: 'SUPABASE_URL is malformed. It should look like https://yourproject.supabase.co (no quotes, spaces or extra path).',
      ENOTFOUND: 'The address could not be found. Check SUPABASE_URL for a typo, and check your internet connection.',
      ECONNREFUSED: 'The connection was refused. A firewall, VPN or antivirus may be blocking Node.',
      ECONNRESET: 'The connection was reset. A firewall, VPN, proxy or antivirus may be interfering.',
      UND_ERR_CONNECT_TIMEOUT: 'The connection timed out. Check your internet, VPN or firewall.',
    };
    if (hints[cause.code]) console.error(`      hint: ${hints[cause.code]}`);
  }
  console.error(`      using URL: ${process.env.SUPABASE_URL}`); // the URL is not secret; the key is never printed
  bad++;
}
console.log(bad === 0 ? '\nDatabase is ready.' : `\n${bad} problem(s). Fix them, then run this again.`);
process.exit(bad === 0 ? 0 : 1);
