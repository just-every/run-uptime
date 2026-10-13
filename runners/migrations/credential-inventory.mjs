import {readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {validMonitorId, validReference} from '../../src/domain/credential-binding.mjs';
// Read current definitions, including paused monitors, never revision/slot counts.
export async function credentialInventory(persist) {
  const directory = join(persist, 'v3', 'd1', 'miniflare-D1DatabaseObject');
  let names;
  try { names = await readdir(directory); } catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
  let found = false;
  const references = new Map();
  for (const name of names.filter(name => name.endsWith('.sqlite'))) {
    const db = new DatabaseSync(join(directory, name), {readOnly: true});
    try {
      if (!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='monitors'").get()) continue;
      if (found) throw Error('Ambiguous local database');
      found = true;
      const monitors = db.prepare('SELECT id, definition FROM monitors').all();
      if (monitors.length > 100) throw Error('Monitor capacity exceeded');
      for (const row of monitors) {
        if (!validMonitorId(row.id)) throw Error('Invalid monitor identity');
        const definition = JSON.parse(row.definition);
        const refs = new Set([definition.request?.credentialRef, ...(definition.flow?.steps ?? []).filter(step => step.kind === 'fill').map(step => step.credentialRef)].filter(ref => ref !== undefined));
        if (refs.size > 21 || [...refs].some(ref => !validReference(ref))) throw Error('Invalid credential reference');
        for (const ref of refs) {
          if (!references.has(ref)) references.set(ref, new Set());
          references.get(ref).add(row.id);
        }
      }
    } finally { db.close(); }
  }
  return Object.fromEntries([...references].sort(([a],[b]) => a.localeCompare(b)).map(([ref, ids]) => [ref, [...ids].sort()]));
}
