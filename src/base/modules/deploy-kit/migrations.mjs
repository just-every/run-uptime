import { assert, hash } from './validation.mjs';
import { assertMigrationSqlSafe } from './sql-safety.mjs';
import { sqlTokens } from './sql-tokens.mjs';
const ledger = '_rer_deploy_migrations';
const literal = value => `'${value.replaceAll("'","''")}'`;
export function validateMigrations(migrations) {
  let previous = '';
  for (const migration of migrations) {
    assert(/^[0-9]+_[a-zA-Z0-9_-]+\.sql$/.test(migration.name) && migration.name > previous, 'migration-order-or-name'); previous = migration.name;
    assert(typeof migration.sql === 'string' && migration.sql.trim() && hash(migration.sql) === migration.sha256 && migration.sql.length <= 512000, 'invalid-migration-bytes');
    assertMigrationSqlSafe(migration.sql);
    assert(sqlTokens(migration.sql).length > 0, 'invalid-migration-bytes');
  }
}
export async function query(api, id, sql) {
  const rows = await api.request(`/d1/database/${id}/query`,{method:'POST',body:{sql}});
  assert(Array.isArray(rows) && rows.length > 0 && rows.every(x => x.success === true && Array.isArray(x.results)), 'd1-query-failed');
  return rows;
}
export async function migrate(api, id, migrations, { apply = true } = {}) {
  validateMigrations(migrations);
  const tables = (await query(api,id,"SELECT name FROM sqlite_master WHERE type='table' AND name IN ('_rer_deploy_migrations','d1_migrations')"))[0].results.map(x => x.name);
  let applied = [];
  if (tables.includes(ledger)) applied = (await query(api,id,`SELECT name, sha256, state FROM ${ledger} ORDER BY name`))[0].results;
  // Wrangler history has no hashes. Never assume old SQL bytes from its names alone.
  if (tables.includes('d1_migrations')) {
    const prior = (await query(api,id,'SELECT name FROM d1_migrations ORDER BY id'))[0].results;
    assert(prior.every(x => applied.some(y => x.name === y.name && y.state === 'applied')), 'legacy-migration-history-needs-reviewed-hash-adoption');
  }
  assert(applied.every((row,index) => row.name === migrations[index]?.name && row.sha256 === migrations[index]?.sha256 && row.state === 'applied'), 'changed-or-uncertain-migration-history');
  const pending = migrations.slice(applied.length);
  assert(apply || pending.length === 0,'pending-migrations');
  if (pending.length && !tables.includes(ledger)) await query(api,id,`CREATE TABLE ${ledger} (name TEXT PRIMARY KEY, sha256 TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('applying','applied')))`);
  for (const migration of pending) {
    // Claim before execution. A lost response/partial provider failure is never automatically replayed.
    await query(api,id,`INSERT INTO ${ledger}(name,sha256,state) VALUES (${literal(migration.name)},${literal(migration.sha256)},'applying')`);
    const last = sqlTokens(migration.sql).at(-1);
    // A second terminator after trailing comments creates an empty D1 statement.
    // Keep the newline even when terminated: a final line comment must end.
    const separator = last?.kind === 'symbol' && last.value === ';' ? '' : '; ';
    await query(api,id,`${migration.sql}\n${separator}UPDATE ${ledger} SET state='applied' WHERE name=${literal(migration.name)} AND sha256=${literal(migration.sha256)};`);
  }
  if (pending.length) {
    const final = (await query(api,id,`SELECT name, sha256, state FROM ${ledger} ORDER BY name`))[0].results;
    assert(final.length === migrations.length && final.every((x,i) => x.state === 'applied' && x.name === migrations[i].name && x.sha256 === migrations[i].sha256), 'migration-readback-mismatch');
  }
  return { applied:pending.map(x => x.name), history:migrations.map(({name,sha256}) => ({name,sha256})) };
}
