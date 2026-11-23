import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { hash } from '@runeditrun/rer/internal/modules/deploy-kit/validation.mjs';
import { readLedger } from '@runeditrun/rer/internal/modules/deploy-kit/migration-ledger.mjs';
import { migrate } from '@runeditrun/rer/internal/modules/deploy-kit/migrations.mjs';

// Preserve the distinction between Wrangler's local names and a deployment's
// hash-attested history. Never infer applied bytes from a name-only ledger.
export async function migrationHistory(db, root, { upgrade = false } = {}) {
 const { unstable_splitSqlQuery: split } = createRequire(join(root, 'package.json'))('wrangler');
 const plan = await Promise.all((await readdir(join(root, 'migrations'))).filter(name => name.endsWith('.sql')).sort().map(async name => {
  const sql = await readFile(join(root, 'migrations', name), 'utf8');
  return { name, sql, sha256: hash(sql), statements: split(sql) };
 }));
 const tables = (await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('d1_migrations','_rer_deploy_migrations')").all()).results.map(row => row.name);
 const columns = tables.includes('d1_migrations') ? (await db.prepare('PRAGMA table_info(d1_migrations)').all()).results.map(row => row.name) : [];
 const tracked = tables.includes('_rer_deploy_migrations') || columns.includes('sha256') || columns.includes('state');
 let names;
 if (tracked) {
  // D1 batch is atomic; the same reviewed kit transition is used by deployment.
  const api = { request: async (_path, { body }) => [await db.prepare(body.sql).all()], importSql: async (_id, sql) => db.batch(split(sql).map(statement => db.prepare(statement))) };
  if (upgrade) await migrate(api, 'local', plan);
  const { applied } = await readLedger(api, 'local', plan, (api, id, sql) => api.request('', { body: { sql } }));
  names = applied.map(row => row.name);
 } else {
  names = tables.includes('d1_migrations') ? (await db.prepare('SELECT name FROM d1_migrations ORDER BY id').all()).results.map(row => row.name) : [];
  // Wrangler applies by name, so a checkout that already ran 0092 can append
  // the backfill guard later. Every other migration must still be a prefix.
  const guard = '0091_z_defer_availability_backfill.sql';
  const ordinaryNames = names.filter(name => name !== guard);
  const ordinaryPlan = plan.filter(row => row.name !== guard);
  if (new Set(names).size !== names.length ||
      !ordinaryNames.every((name, index) => name === ordinaryPlan[index]?.name) ||
      (names.includes(guard) && !plan.some(row => row.name === guard))) {
   throw Error('changed-or-uncertain-migration-history');
  }
 }
 const byName = new Map(plan.map(row => [row.name, row]));
 return { tracked, plan: names.map(name => byName.get(name)) };
}
