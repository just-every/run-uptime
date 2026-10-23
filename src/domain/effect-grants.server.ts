import {auditStatement,type AuditActor} from './audit.server.ts'
import {get,type Bindings} from './control.server.ts'
// @ts-ignore Edition effect rules are JavaScript shared with the runner.
import {API_EFFECTS,GRANT_LIMITS,validateGrantInput} from './api-effects.mjs'
// API-004: exact, time-limited grants for a monitor's live effects. Every change is a new revision and an audit entry; the
// installation default is no grant. A claim names each active grant without its allowance; the runner spends each live effect
// from its exact grant here before the effect is sent.
const shown=(row:any)=>({id:row.id,effect:row.effect,revision:row.revision,spendLimit:row.spend_limit,spent:row.spent,expiresAt:row.expires_at,createdAt:row.created_at,revokedAt:row.revoked_at})
async function monitor(env:Bindings,id:string){if(!await get(env,id))throw Object.assign(Error('Monitor not found'),{status:404})}
export async function effectGrants(env:Bindings,monitorId:string){
 await monitor(env,monitorId);
 return {grants:(await env.DB.prepare('SELECT * FROM effect_grants WHERE monitor_id=? ORDER BY effect,revision DESC').bind(monitorId).all<any>()).results.map(shown)};
}
export async function claimGrants(env:Bindings,monitorId:string,now:number){
 const rows=(await env.DB.prepare('SELECT id,effect,expires_at FROM effect_grants WHERE monitor_id=? AND revoked_at IS NULL AND expires_at>? AND spent<spend_limit').bind(monitorId,now).all<any>()).results;
 return rows.length?{effectGrants:rows.map(row=>({id:row.id,effect:row.effect,expiresAt:row.expires_at}))}:{};
}
const revision="COALESCE((SELECT MAX(revision) FROM effect_grants WHERE monitor_id=? AND effect=?),0)+1";
export async function grantEffect(env:Bindings,monitorId:string,input:any,actor:AuditActor){
 await monitor(env,monitorId);const now=Date.now(),grant=validateGrantInput(input,now),id=crypto.randomUUID();
 await env.DB.batch([
  env.DB.prepare('UPDATE effect_grants SET revoked_at=? WHERE monitor_id=? AND effect=? AND revoked_at IS NULL').bind(now,monitorId,grant.effect),
  env.DB.prepare(`INSERT INTO effect_grants(id,monitor_id,effect,revision,spend_limit,expires_at,created_at) VALUES(?,?,?,${revision},?,?,?)`).bind(id,monitorId,grant.effect,monitorId,grant.effect,grant.spendLimit,grant.expiresAt,now),
  auditStatement(env,actor,'effect_grant_change','monitor',crypto.randomUUID(),'1',[],now)]);
 return effectGrants(env,monitorId);
}
export async function revokeEffect(env:Bindings,monitorId:string,input:any,actor:AuditActor){
 await monitor(env,monitorId);
 if(!input||Object.keys(input).some(key=>key!=='effect')||!API_EFFECTS.includes(input.effect))throw Error(`Name the effect to revoke: one of ${API_EFFECTS.join(', ')}`);
 const now=Date.now();
 await env.DB.batch([env.DB.prepare('UPDATE effect_grants SET revoked_at=? WHERE monitor_id=? AND effect=? AND revoked_at IS NULL').bind(now,monitorId,input.effect),auditStatement(env,actor,'effect_grant_revoke','monitor',crypto.randomUUID(),'changes()>0',[],now)]);
 return effectGrants(env,monitorId);
}
/** One live request's spend, taken from the exact grant the runner's claim named before the request is sent. One guarded update
 * requires the grant to be unrevoked, unexpired and to hold the whole amount, and the slot part to be this runner's delivered
 * attempt, inside its acceptance window and not yet reported. The spend stays recorded whether or not a result arrives. */
export async function spendGrant(env:Bindings,input:any,runnerId:string){
 const named=(value:unknown)=>typeof value==='string'&&value.length>0&&value.length<=512
 if(!input||Object.keys(input).some(key=>!['slotId','probe','attempt','grantId','effect','amount'].includes(key))||![input.slotId,input.probe,input.grantId].every(named)||!Number.isSafeInteger(input.attempt)||input.attempt<0||input.attempt>9||!API_EFFECTS.includes(input.effect)||!Number.isSafeInteger(input.amount)||input.amount<1||input.amount>GRANT_LIMITS.maxSpend)throw Error('A spend names its slot, probe, attempt, grant, effect and a whole-number amount')
 const now=Date.now(),spent=await env.DB.prepare(`UPDATE effect_grants SET spent=spent+?1 WHERE id=?2 AND effect=?3 AND revoked_at IS NULL AND expires_at>?4 AND spent+?1<=spend_limit
  AND monitor_id=(SELECT s.monitor_id FROM slots s JOIN runner_assignments a ON a.slot_id=s.id WHERE s.id=?5 AND s.status='running' AND s.lease_until>?4 AND a.probe=?6 AND a.runner_id=?7 AND a.delivered_at IS NOT NULL)
  AND NOT EXISTS(SELECT 1 FROM observations WHERE slot_id=?5 AND probe=?6 AND attempt>=?8)`).bind(input.amount,input.grantId,input.effect,now,input.slotId,input.probe,runnerId,input.attempt).run()
 if(!spent.meta.changes)throw Object.assign(Error('No active grant covers this live effect'),{status:403})
 return {spent:input.amount}
}
