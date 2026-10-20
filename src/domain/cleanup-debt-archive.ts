import {clock,identity,unique,type Tables} from './archive-schema.ts'
// @ts-ignore Edition cleanup-debt rules are JavaScript shared with the runner.
import {RESOLUTION_NOTE_CHARS} from './cleanup-debt.mjs'
// @ts-ignore Edition API evidence rules are JavaScript shared with the runner.
import {API_FIXTURE_ATTEMPTS} from './api-transaction-evidence.mjs'
/** Cleanup debt travels with its monitor: it names a revision and slot the archive holds, and carries no value or body. */
export function validateCleanupDebtArchive(t:Tables){
 unique(t.cleanup_debt,r=>r.id,'cleanup debt');
 const revisions=new Set(t.revisions.map(r=>`${r.monitor_id}:${r.revision}`)),slots=new Map(t.slots.map(s=>[s.id,s.monitor_id]));
 for(const row of t.cleanup_debt){
  for(const key of ['monitor_id','slot_id','probe','observation_id'])identity(row[key],'cleanup debt reference');
  if(!revisions.has(`${row.monitor_id}:${row.revision}`)||slots.get(row.slot_id)!==row.monitor_id)throw Error('Orphan archive cleanup debt');
  if(!Number.isInteger(row.attempt)||row.attempt<0||!Number.isInteger(row.attempts)||row.attempts<0||row.attempts>API_FIXTURE_ATTEMPTS||typeof row.step_name!=='string'||!row.step_name||row.step_name.length>80||/[\x00-\x1f\x7f]/.test(row.step_name)||typeof row.category!=='string'||!/^[a-z][a-z0-9-]{0,39}$/.test(row.category))throw Error('Invalid archive cleanup debt');
  clock(row.created_at,'cleanup debt');
  if(row.state==='open'){if(row.resolver_note!==null||row.resolved_at!==null)throw Error('Invalid archive cleanup debt resolution')}
  else if(row.state==='resolved'){clock(row.resolved_at,'cleanup debt resolution');if(row.resolved_at<row.created_at||typeof row.resolver_note!=='string'||!row.resolver_note.trim()||row.resolver_note.length>RESOLUTION_NOTE_CHARS||/[\x00-\x1f\x7f]/.test(row.resolver_note))throw Error('Invalid archive cleanup debt resolution')}
  else throw Error('Invalid archive cleanup debt state');
 }
}
