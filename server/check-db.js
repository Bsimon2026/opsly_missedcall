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
  bad++;
}
console.log(bad === 0 ? '\nDatabase is ready.' : `\n${bad} problem(s). Fix them, then run this again.`);
process.exit(bad === 0 ? 0 : 1);
