import {auditStatement,type AuditActor} from './audit.server.ts'
import {get,type Bindings} from './control.server.ts'
// @ts-ignore Edition effect rules are JavaScript shared with the runner.
import {API_EFFECTS,validateGrantInput} from './api-effects.mjs'
// API-004: exact, time-limited grants for a monitor's live effects. Every change is a new revision and an audit entry; the
// installation default is no grant. The runner receives only active grants with their remaining spend.
const shown=(row:any)=>({id:row.id,effect:row.effect,revision:row.revision,spendLimit:row.spend_limit,spent:row.spent,expiresAt:row.expires_at,createdAt:row.created_at,revokedAt:row.revoked_at})
async function monitor(env:Bindings,id:string){if(!await get(env,id))throw Object.assign(Error('Monitor not found'),{status:404})}
export async function effectGrants(env:Bindings,monitorId:string){
 await monitor(env,monitorId);
 return {grants:(await env.DB.prepare('SELECT * FROM effect_grants WHERE monitor_id=? ORDER BY effect,revision DESC').bind(monitorId).all<any>()).results.map(shown)};
}
export async function claimGrants(env:Bindings,monitorId:string,now:number){
 const rows=(await env.DB.prepare('SELECT id,effect,expires_at,spend_limit-spent remaining FROM effect_grants WHERE monitor_id=? AND revoked_at IS NULL AND expires_at>? AND spent<spend_limit').bind(monitorId,now).all<any>()).results;
 return rows.length?{effectGrants:rows.map(row=>({id:row.id,effect:row.effect,expiresAt:row.expires_at,remaining:row.remaining}))}:{};
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
/** The spend an accepted observation's live steps took, charged to the grant that was active for each effect. */
export function spendStatements(env:Bindings,monitorId:string,observations:any[],guard:string,values:unknown[]){
 const spend=new Map<string,number>();
 for(const o of observations)for(const step of [...(o.apiTransaction?.steps??[]),...(o.fixtures?.steps??[])])if(step.effect&&step.spend)spend.set(step.effect,(spend.get(step.effect)??0)+step.spend);
 return [...spend].map(([effect,amount])=>env.DB.prepare(`UPDATE effect_grants SET spent=MIN(spend_limit,spent+?) WHERE monitor_id=? AND effect=? AND revoked_at IS NULL AND ${guard}`).bind(amount,monitorId,effect,...values));
}
