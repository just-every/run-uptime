import {auditStatement,type AuditActor} from './audit.server.ts'
import {get,type Bindings} from './control.server.ts'
// @ts-ignore Edition cleanup-debt rules are JavaScript shared with the runner.
import {CLEANUP_DEBT_LIMIT,hasFixtures,observationDebts,resolutionNote} from './cleanup-debt.mjs'
const shown=(row:any)=>({id:row.id,revision:row.revision,slotId:row.slot_id,probe:row.probe,attempt:row.attempt,observationId:row.observation_id,step:row.step_name,attempts:row.attempts,category:row.category,createdAt:row.created_at,state:row.state,note:row.resolver_note,resolvedAt:row.resolved_at})
/** What a claim tells the runner: how many debts are open, so it refuses new setup at the limit. */
export async function claimDebt(env:Bindings,monitorId:string,definition:any){
 if(!hasFixtures(definition))return {};
 const row=await env.DB.prepare("SELECT COUNT(*) n FROM cleanup_debt WHERE monitor_id=? AND state='open'").bind(monitorId).first<{n:number}>();
 return {cleanupDebt:{open:Number(row?.n??0),limit:CLEANUP_DEBT_LIMIT}};
}
/** Each accepted observation's incomplete cleanup steps, inserted in the same guarded transaction as the observation. */
export function debtStatements(env:Bindings,slot:any,observations:any[],guard:string,values:unknown[],now:number){
 return observations.flatMap(o=>observationDebts(slot,o)).map((d:any)=>env.DB.prepare(`INSERT OR IGNORE INTO cleanup_debt(id,monitor_id,revision,slot_id,probe,attempt,observation_id,step_name,attempts,category,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE ${guard}`)
  .bind(d.id,d.monitor_id,d.revision,d.slot_id,d.probe,d.attempt,d.observation_id,d.step_name,d.attempts,d.category,now,...values));
}
export async function cleanupDebt(env:Bindings,monitorId:string){
 if(!await get(env,monitorId))throw Object.assign(Error('Monitor not found'),{status:404});
 const rows=(await env.DB.prepare('SELECT * FROM cleanup_debt WHERE monitor_id=? ORDER BY created_at DESC,id LIMIT 200').bind(monitorId).all<any>()).results.map(shown);
 return {limit:CLEANUP_DEBT_LIMIT,open:rows.filter(row=>row.state==='open'),resolved:rows.filter(row=>row.state==='resolved')};
}
/** Only the owner closes a debt, with a note. Resolving again changes nothing and records nothing. */
export async function resolveCleanupDebt(env:Bindings,monitorId:string,debtId:string,input:any,actor:AuditActor){
 const note=resolutionNote(input),now=Date.now();
 const find=()=>env.DB.prepare('SELECT * FROM cleanup_debt WHERE id=? AND monitor_id=?').bind(debtId,monitorId).first<any>();
 const row=await find();if(!row)throw Object.assign(Error('Cleanup debt not found'),{status:404});
 if(row.state==='open')await env.DB.batch([
  env.DB.prepare("UPDATE cleanup_debt SET state='resolved',resolver_note=?,resolved_at=? WHERE id=? AND state='open'").bind(note,now,debtId),
  auditStatement(env,actor,'cleanup_debt_resolve','monitor',crypto.randomUUID(),'changes()=1',[],now)]);
 return {debt:shown(await find())};
}
