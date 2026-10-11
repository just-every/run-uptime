import { quote, all, insist } from './storage.mjs';
import { sidecar, copyRowid } from './copies.mjs';

// Local dev identity never travels. When a policy includes operator-auth tables,
// export drops dev sessions and every credential minted while using one, and
// suspends dev personas (<as>@dev.localhost); import refuses archives holding
// dev sessions or dev-minted credentials. These rules are not policy options.
const PERSONAS = "lower(email) LIKE '%@dev.localhost'";
export async function dropDevData(db, tables, copies) {
  const live = (await all(db, "SELECT name FROM sqlite_master WHERE type='table' AND name='oa_dev_credentials'")).length;
  const minted = copies.oa_dev_credentials ? quote(copies.oa_dev_credentials) : live ? 'oa_dev_credentials' : null;
  // Tokens read the credential record, so the record itself is emptied last.
  const rules = [['oa_sessions', "kind='dev'"], ...(minted ? [['oa_tokens', `id IN (SELECT id FROM ${minted} WHERE credential='oa_tokens')`]] : []), ['oa_dev_credentials', '1']];
  // Only operator-auth's own tables: a product table may share a name prefix.
  const has = (table, ...names) => names.every(name => tables.find(t => t.name === table)?.columns.some(c => c.name === name));
  const shaped = { oa_sessions: has('oa_sessions', 'kind'), oa_tokens: has('oa_tokens', 'id'), oa_dev_credentials: has('oa_dev_credentials', 'credential', 'id') };
  const statements = [];
  for (const [table, condition] of rules.filter(([table]) => copies[table] && shaped[table])) {
    const copy = quote(copies[table]), entry = tables.find(t => t.name === table);
    statements.push(db.prepare(`DELETE FROM ${quote(sidecar(copies[table]))} WHERE rer_portability_copy_rowid IN (SELECT ${copyRowid(entry)} FROM ${copy} WHERE ${condition})`));
    statements.push(db.prepare(`DELETE FROM ${copy} WHERE ${condition}`));
  }
  if (copies.oa_operators && has('oa_operators', 'email', 'status', 'version')) statements.push(db.prepare(`UPDATE ${quote(copies.oa_operators)} SET status='inactive',version=version+1 WHERE ${PERSONAS} AND status!='inactive'`));
  if (statements.length) await db.batch(statements);
}

export async function refuseDevData(db, copies, tables) {
  const has = (table, name) => tables.find(t => t.name === table)?.columns.some(c => c.name === name);
  if (copies.oa_sessions && has('oa_sessions', 'kind')) insist(!(await all(db, `SELECT 1 FROM ${quote(copies.oa_sessions)} WHERE kind='dev' LIMIT 1`)).length, 'dev_data:oa_sessions', 409);
  if (copies.oa_dev_credentials) insist(!(await all(db, `SELECT 1 FROM ${quote(copies.oa_dev_credentials)} LIMIT 1`)).length, 'dev_data:oa_dev_credentials', 409);
}
