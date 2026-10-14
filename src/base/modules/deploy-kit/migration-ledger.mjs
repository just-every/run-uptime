import { assert } from './validation.mjs';

export const ledger = 'd1_migrations';
const legacy = '_rer_deploy_migrations';
export const literal = value => `'${value.replaceAll("'","''")}'`;
export const createLedger = `CREATE TABLE ${ledger} (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, sha256 TEXT, state TEXT CHECK(state IN ('applying','applied')))`;
/** An applied row records this migration: its current bytes, or bytes a seed's
 * reviewed rewrite record says this migration replaced. */
export const recorded = (row, migration) => row.name === migration?.name && (row.sha256 === migration.sha256 || (migration.rewrites ?? []).some(rewrite => rewrite.from === row.sha256));
const validPrefix = (rows, migrations) => rows.every((row, index) => recorded(row, migrations[index]) && row.state === 'applied');
const same = (a, b) => a.length === b.length && a.every((row, index) => row.name === b[index].name && row.sha256 === b[index].sha256 && row.state === b[index].state);

export async function readLedger(api, id, migrations, query) {
  const read = async sql => (await query(api, id, sql))[0].results;
  const tables = (await read(`SELECT name FROM sqlite_master WHERE type='table' AND name IN ('${legacy}','${ledger}')`)).map(row => row.name);
  let old = [], applied = [], transition = '';
  if (tables.includes(legacy)) {
    const columns = await read(`SELECT name FROM pragma_table_info('${legacy}')`);
    assert(columns.length === 3 && columns.every(row => ['name','sha256','state'].includes(row.name)), 'invalid-migration-ledger');
    old = await read(`SELECT name, sha256, state FROM ${legacy} ORDER BY name`);
    assert(validPrefix(old, migrations), 'changed-or-uncertain-migration-history');
  }
  if (tables.includes(ledger)) {
    const columns = (await read(`SELECT name FROM pragma_table_info('${ledger}')`)).map(row => row.name);
    assert(['id','name','applied_at'].every(name => columns.includes(name)), 'invalid-migration-ledger');
    if (columns.includes('sha256') && columns.includes('state')) {
      applied = await read(`SELECT name, sha256, state FROM ${ledger} ORDER BY id`);
      assert(validPrefix(applied, migrations), 'changed-or-uncertain-migration-history');
      if (tables.includes(legacy)) assert(same(applied, old), 'changed-or-uncertain-migration-history');
    } else {
      assert(!columns.includes('sha256') && !columns.includes('state'), 'invalid-migration-ledger');
      const prior = await read(`SELECT name FROM ${ledger} ORDER BY id`);
      // Names alone cannot attest historical bytes. Only an already verified kit
      // prefix can supply hashes; preserve Wrangler row IDs and timestamps.
      assert(prior.length <= old.length && prior.every((row,index) => row.name === old[index].name), 'legacy-migration-history-needs-reviewed-hash-adoption');
      transition += `ALTER TABLE ${ledger} ADD COLUMN sha256 TEXT;\nALTER TABLE ${ledger} ADD COLUMN state TEXT;\n`;
      for (const row of old.slice(0,prior.length)) transition += `UPDATE ${ledger} SET sha256=${literal(row.sha256)}, state='applied' WHERE name=${literal(row.name)};\n`;
      for (const row of old.slice(prior.length)) transition += insert(row);
      applied = old;
    }
  } else if (tables.includes(legacy)) {
    transition = `${createLedger};\n`;
    for (const row of old) transition += insert(row);
    applied = old;
  }
  if (tables.includes(legacy)) transition += `DROP TABLE ${legacy};`;
  return { applied, transition, exists:tables.includes(ledger) || tables.includes(legacy) };
}
function insert(row) {
  return `INSERT INTO ${ledger}(name,sha256,state) VALUES (${literal(row.name)},${literal(row.sha256)},'applied');\n`;
}
