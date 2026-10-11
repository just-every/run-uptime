import { all, statement, state, insist, quote } from './storage.mjs';
import { canonicalJson, sha256 } from './hash.mjs';
import { sidecar } from './copies.mjs';
export async function tombstone(source,table,key) { return sha256(canonicalJson([source,table,key])); }
export async function erasureStatements(db,table,primaryKey) {
  const s=await state(db), hash=await tombstone(s.source_identity,table,primaryKey);
  return [statement(db,'INSERT OR IGNORE INTO rer_portability_journal VALUES(?,?)',s.source_identity,hash),
    db.prepare('UPDATE rer_portability_state SET epoch=epoch+1 WHERE id=1'),
    statement(db,'INSERT INTO rer_portability_epochs SELECT source_identity,epoch FROM rer_portability_state WHERE id=1 ON CONFLICT(source) DO UPDATE SET epoch=MAX(epoch,excluded.epoch)')];
}
export async function invalidateTransfersStatements(db) {
  const tables=await all(db,"SELECT name FROM sqlite_master WHERE type='table' AND (name GLOB 'rer_portability_snap_*' OR name GLOB 'rer_portability_stage_*')");
  return [...tables.map(x=>db.prepare(`DROP TABLE ${quote(x.name)}`)),db.prepare('DELETE FROM rer_portability_segments'),db.prepare('DELETE FROM rer_portability_parts'),
    db.prepare('DELETE FROM rer_portability_jobs'),db.prepare('UPDATE rer_portability_state SET import_job=NULL,applying=0 WHERE id=1')];
}
export async function journal(db,source) {
  return (await all(db,'SELECT tombstone FROM rer_portability_journal WHERE source=? ORDER BY tombstone',source)).map(x=>x.tombstone);
}
export async function fence(db,manifest,copies,later) {
  const recorded=await statement(db,'SELECT epoch FROM rer_portability_epochs WHERE source=?',manifest.sourceIdentity).first();
  const s=await state(db);
  insist(manifest.epoch>=Math.max(recorded?.epoch??0,s.source_identity===manifest.sourceIdentity?s.epoch:0),'erasure_epoch');
  if(later) insist(later.sourceIdentity===manifest.sourceIdentity && Number.isSafeInteger(later.epoch) && later.epoch>=manifest.epoch && Array.isArray(later.journal),'later_journal');
  const hashes=new Set([...manifest.journal,...await journal(db,manifest.sourceIdentity),...(later?.journal??[])]);
  insist([...hashes].every(x=>/^[a-f0-9]{64}$/.test(x)),'invalid_journal');
  for(const table of manifest.tables) {
    for(let offset=0;offset<table.count;offset+=500) {
      const rows=await all(db,`SELECT rer_portability_tombstone FROM ${quote(sidecar(copies[table.name]))} ORDER BY rer_portability_row_order LIMIT 500 OFFSET ?`,offset);
      for(const row of rows) {
        insist(!hashes.has(row.rer_portability_tombstone),'erased_row:'+table.name);
      }
    }
  }
  return {hashes:[...hashes],epoch:later?.epoch??manifest.epoch};
}
export function mergeJournal(db,manifest,checked) {
  return [...checked.hashes.map(h=>statement(db,'INSERT OR IGNORE INTO rer_portability_journal VALUES(?,?)',manifest.sourceIdentity,h)),
    statement(db,'INSERT INTO rer_portability_epochs VALUES(?,?) ON CONFLICT(source) DO UPDATE SET epoch=MAX(epoch,excluded.epoch)',manifest.sourceIdentity,checked.epoch),
    statement(db,'UPDATE rer_portability_state SET source_identity=?,epoch=? WHERE id=1',manifest.sourceIdentity,checked.epoch)];
}
