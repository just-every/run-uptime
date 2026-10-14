import { join } from 'node:path';
import { assert, hash } from './validation.mjs';
import { regularBytes } from './artifact.mjs';
import { assertMigrationSqlSafe } from './sql-safety.mjs';
import { sqlTokens } from './sql-tokens.mjs';
import { ledger, literal, createLedger, readLedger, recorded } from './migration-ledger.mjs';
export function validateMigrations(migrations) {
  let previous = '';
  for (const migration of migrations) {
    assert(/^[0-9]+_[a-zA-Z0-9_-]+\.sql$/.test(migration.name) && migration.name > previous, 'migration-order-or-name'); previous = migration.name;
    assert(typeof migration.sql === 'string' && migration.sql.trim() && hash(migration.sql) === migration.sha256 && migration.sql.length <= 512000, 'invalid-migration-bytes');
    assertMigrationSqlSafe(migration.sql);
    assert(sqlTokens(migration.sql).length > 0, 'invalid-migration-bytes');
    assert(migration.rewrites === undefined || Array.isArray(migration.rewrites) && migration.rewrites.every(rewrite => /^[a-f0-9]{64}$/.test(rewrite?.from ?? '') && rewrite.from !== migration.sha256 && typeof rewrite.reason === 'string' && rewrite.reason.trim()), 'invalid-migration-rewrite');
  }
}
const rewriteKeys = ['migration','from','to','reason','reviewed'];
/** A seed's reviewed rewrites of already released migrations, from
 * migrations/rewrites.json: { version: 1, rewrites: [{ migration, from, to,
 * reason, reviewed: true }] }. `from` is the released bytes' SHA-256, `to` the
 * current bytes'. Each named migration then also accepts an applied row holding
 * `from`; the ledger keeps that row as applied. Any other change stays refused. */
export async function readMigrationRewrites(product) {
  const text = await regularBytes(join(product,'migrations/rewrites.json'),1024*1024).then(String,error => { if (error.code === 'ENOENT') return undefined; throw error; });
  if (text === undefined) return [];
  let declaration; try { declaration = JSON.parse(text); } catch { throw new Error('invalid-migration-rewrites'); }
  assert(declaration?.version === 1 && Object.keys(declaration).every(key => ['version','rewrites'].includes(key)) && Array.isArray(declaration.rewrites) && declaration.rewrites.length <= 1000, 'invalid-migration-rewrites');
  for (const item of declaration.rewrites) {
    assert(item && Object.keys(item).every(key => rewriteKeys.includes(key)) && /^[0-9]+_[a-zA-Z0-9_-]+\.sql$/.test(item.migration ?? '') && /^[a-f0-9]{64}$/.test(item.from ?? '') && /^[a-f0-9]{64}$/.test(item.to ?? '') && item.from !== item.to
      && typeof item.reason === 'string' && item.reason.trim() && item.reason.length <= 1000, 'invalid-migration-rewrites');
    assert(item.reviewed === true, 'unreviewed-migration-rewrite');
  }
  assert(new Set(declaration.rewrites.map(item => `${item.migration} ${item.from}`)).size === declaration.rewrites.length, 'invalid-migration-rewrites');
  return declaration.rewrites;
}
/** Attach declared rewrites to the migrations they name. A record must name a
 * migration in the list (unless `partial`, for a list that is one of several)
 * and its `to` must be that migration's current bytes. */
export function withRewrites(migrations, rewrites, { partial = false } = {}) {
  for (const item of rewrites) {
    const migration = migrations.find(x => x.name === item.migration);
    assert(migration || partial, 'unknown-migration-rewrite');
    if (migration) assert(migration.sha256 === item.to, 'migration-rewrite-mismatch');
  }
  return migrations.map(migration => {
    const declared = rewrites.filter(item => item.migration === migration.name);
    return declared.length ? { ...migration, rewrites: declared.map(({ from, reason }) => ({ from, reason })) } : migration;
  });
}
export async function query(api, id, sql) {
  const rows = await api.request(`/d1/database/${id}/query`,{method:'POST',body:{sql}});
  assert(Array.isArray(rows) && rows.length > 0 && rows.every(x => x.success === true && Array.isArray(x.results)), 'd1-query-failed');
  return rows;
}
export async function migrate(api, id, migrations, { apply = true, upgrade = apply } = {}) {
  validateMigrations(migrations);
  const { applied, transition, exists } = await readLedger(api, id, migrations, query);
  const pending = migrations.slice(applied.length);
  assert(apply || pending.length === 0,'pending-migrations');
  if (transition && upgrade) {
    await api.importSql(id, transition);
    const verified = await readLedger(api, id, migrations, query);
    assert(!verified.transition && verified.applied.length === applied.length, 'migration-readback-mismatch');
  }
  if (pending.length && !exists) await query(api,id,createLedger);
  for (const migration of pending) {
    // Claim before execution. A lost response/partial provider failure is never automatically replayed.
    await query(api,id,`INSERT INTO ${ledger}(name,sha256,state) VALUES (${literal(migration.name)},${literal(migration.sha256)},'applying')`);
    const last = sqlTokens(migration.sql).at(-1);
    // A second terminator after trailing comments creates an empty D1 statement.
    // Keep the newline even when terminated: a final line comment must end.
    const separator = last?.kind === 'symbol' && last.value === ';' ? '' : '; ';
    await api.importSql(id,`${migration.sql}\n${separator}UPDATE ${ledger} SET state='applied' WHERE name=${literal(migration.name)} AND sha256=${literal(migration.sha256)};`);
  }
  if (pending.length) {
    const final = (await query(api,id,`SELECT name, sha256, state FROM ${ledger} ORDER BY id`))[0].results;
    assert(final.length === migrations.length && final.every((x,i) => x.state === 'applied' && recorded(x, migrations[i])), 'migration-readback-mismatch');
  }
  return { applied:pending.map(x => x.name), history:migrations.map(({name,sha256}) => ({name,sha256})) };
}
