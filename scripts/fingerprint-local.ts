// Prints a schema fingerprint of the locally migrated database (see schema-fingerprint.sql).
// Usage: npx tsx scripts/fingerprint-local.ts [--functions]
import { readFileSync } from 'node:fs';
import { createTestDb } from '../tests/db/harness.js';

const t = await createTestDb();
if (process.argv.includes('--functions')) {
  const { rows } = await t.db.query<{ fn: string; h: string }>(`
    select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as fn, md5(p.prosrc) as h
      from pg_proc p where p.pronamespace = 'public'::regnamespace order by 1`);
  for (const r of rows) console.log(`${r.h} ${r.fn}`);
} else {
  const { rows } = await t.db.query(readFileSync(new URL('./schema-fingerprint.sql', import.meta.url), 'utf8'));
  console.log(JSON.stringify(rows[0], null, 2));
}
