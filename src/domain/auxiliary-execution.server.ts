import type {AuthBindings} from './operator-auth.server.ts'
import {auditStatement,automated} from './audit.server.ts'
const leaseMs=60000;
type Attempt={id:string;scope:string;job_id:string;started_at:number;lease_until:number;submitted_at:number|null;finished_at:number|null;outcome:string;code:string};
// A claim is retryable only until its durable transport boundary. A crash after
// that boundary is uncertain: neither a restart nor lease expiry resubmits it.
export async function reconcileAuxiliary(env:AuthBindings,now=Date.now()){
 await env.DB.prepare("UPDATE auxiliary_attempts SET finished_at=?,outcome=CASE WHEN submitted_at IS NULL THEN 'expired' ELSE 'uncertain' END,code=CASE WHEN submitted_at IS NULL THEN 'lease_expired_unsubmitted' ELSE 'lease_expired_submitted' END WHERE finished_at IS NULL AND lease_until<=?").bind(now,now).run();
 await env.DB.prepare("UPDATE monitoring_watch SET outcome=COALESCE((SELECT a.outcome FROM auxiliary_attempts a WHERE a.scope='watch' AND a.job_id=monitoring_watch.id ORDER BY a.started_at DESC,a.rowid DESC LIMIT 1),outcome) WHERE outcome IN ('sending','claimed')").run();
}
export async function claimAuxiliary(env:AuthBindings,scope:'watch'|'auth-mail',jobId:string,now:number,{retryMs=10000,repeatMs,authority='1',values=[]}:{retryMs?:number;repeatMs?:number;authority?:string;values?:unknown[]}={}){
 await reconcileAuxiliary(env,now);
 const id=crypto.randomUUID();
 const eligible=repeatMs===undefined?"(outcome IN ('rejected','rate_limited') AND started_at<=?) OR outcome='expired'":"started_at<=?";
 const claimed=await env.DB.prepare(`INSERT INTO auxiliary_attempts(id,scope,job_id,started_at,lease_until,outcome,code) SELECT ?,?,?,?,?,'claimed','awaiting_submission' WHERE ${authority} AND NOT EXISTS(SELECT 1 FROM auxiliary_attempts WHERE scope=? AND job_id=? AND (finished_at IS NULL OR NOT (${eligible})))`).bind(id,scope,jobId,now,now+leaseMs,...values,scope,jobId,now-(repeatMs??retryMs)).run();
 if(!claimed.meta.changes)return null;
 if(scope==='watch')await env.DB.prepare("INSERT INTO monitoring_watch(id,at,outcome) VALUES(?,?,'claimed') ON CONFLICT(id) DO UPDATE SET at=excluded.at,outcome=excluded.outcome").bind(jobId,now).run();
 return {id,scope,jobId};
}
export async function submitAuxiliary(env:AuthBindings,attempt:{id:string;scope:string;jobId:string},now=Date.now(),authority='1',values:unknown[]=[]){
 const result=await env.DB.batch([
  env.DB.prepare(`UPDATE auxiliary_attempts SET submitted_at=?,outcome='sending',code='submitted' WHERE id=? AND finished_at IS NULL AND submitted_at IS NULL AND lease_until>? AND ${authority}`).bind(now,attempt.id,now,...values),
  auditStatement(env,attempt.scope==='auth-mail'?{kind:'feature',ref:'operator-auth-mail'}:automated,'notification_send','notification',undefined,"changes()=1 AND ?=1",[Number(!attempt.jobId.startsWith('external-heartbeat'))],now),
  ...(attempt.scope==='watch'?[env.DB.prepare("UPDATE monitoring_watch SET outcome='sending' WHERE id=? AND at=(SELECT started_at FROM auxiliary_attempts WHERE id=? AND outcome='sending')").bind(attempt.jobId,attempt.id)]:[]),
 ]);
 if(!result[0].meta.changes)throw Error('Auxiliary execution authority unavailable');
}
export async function finishAuxiliary(env:AuthBindings,attempt:{id:string;scope:string;jobId:string},outcome:string,code:string,now=Date.now()){
 await env.DB.prepare('UPDATE auxiliary_attempts SET outcome=?,code=?,finished_at=? WHERE id=? AND finished_at IS NULL AND lease_until>?').bind(outcome,code,now,attempt.id,now).run();
 if(attempt.scope==='watch')await env.DB.prepare("UPDATE monitoring_watch SET outcome=(SELECT outcome FROM auxiliary_attempts WHERE id=?) WHERE id=? AND at=(SELECT started_at FROM auxiliary_attempts WHERE id=?)").bind(attempt.id,attempt.jobId,attempt.id).run();
}
export async function latestAuxiliary(env:AuthBindings,scope:string,jobId:string){return env.DB.prepare('SELECT * FROM auxiliary_attempts WHERE scope=? AND job_id=? ORDER BY started_at DESC,rowid DESC LIMIT 1').bind(scope,jobId).first<Attempt>()}
