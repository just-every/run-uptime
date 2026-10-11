import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
// Read the real Miniflare D1 files before settings publication. This works even
// in a fresh source checkout whose prior database exists but has no dist yet.
// No database or application substitute is created by this read-only probe.
export async function priorOwnerEmails(persist) {
 const directory = join(persist, 'v3', 'd1', 'miniflare-D1DatabaseObject');
 const emails = new Set();
 let files; try { files = await readdir(directory); } catch (error) { if (error.code === 'ENOENT') return emails; throw error; }
 for (const file of files.filter(file => file.endsWith('.sqlite'))) {
  const db = new DatabaseSync(join(directory, file), { readOnly: true });
  try {
   if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='oa_operators'").get()) {
    for (const row of db.prepare("SELECT email FROM oa_operators WHERE role='owner' AND status='active'").all()) emails.add(row.email.toLowerCase());
   }
  } finally { db.close(); }
 }
 return emails;
}
