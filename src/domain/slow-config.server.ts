import {get,revisionStatements,grants,type Bindings} from './control.server.ts'
import {destinations} from './notification-destinations.server.ts'
import {normalizeContactSettings} from './contact-schedule.ts'
// @ts-ignore Shared monitor validation.
import {validateDefinition} from './policy.mjs'
import {auditStatement,type AuditActor} from './audit.server.ts'
// @ts-ignore Shared pure policy validation.
import {normalizeSlow} from './slow-policy.mjs'
export async function readSlowPolicy(env:Bindings,id:string){
 const monitor=await get(env,id);if(!monitor)throw Object.assign(Error('Monitor not found'),{status:404});
 const latest=await env.DB.prepare("SELECT kind,event FROM outbox WHERE monitor_id=? AND kind IN ('slow','slow_recovery') AND status<>'imported-inactive' ORDER BY rowid DESC LIMIT 1").bind(id).first<{kind:string;event:string}>();
 return {definition:monitor.definition,revision:monitor.revision,slow:monitor.definition.slow??null,destinations:await destinations(env),status:latest?{kind:latest.kind,...JSON.parse(latest.event),acknowledgedAt:(await env.DB.prepare('SELECT acknowledged_at FROM slow_acknowledgements WHERE opening_event_id=?').bind(JSON.parse(latest.event).id).first<{acknowledged_at:number}>())?.acknowledged_at??null}:null};
}
export async function saveSlowPolicy(env:Bindings,id:string,input:any,actor:AuditActor){
 if(!input||Object.keys(input).some(k=>!['expectedRevision','slow'].includes(k)))throw Error('Choose a slow policy and its current revision');
 const current=await readSlowPolicy(env,id),old=await get(env,id);
 if(!old||old.revision!==current.revision)throw Object.assign(Error('Monitor changed; reopen the slow policy'),{status:409});
 if(input.expectedRevision!==current.revision)throw Object.assign(Error('Monitor changed; reopen the slow policy before saving'),{status:409});
 const slow=normalizeSlow(input.slow,current.definition.probes,current.definition.type);
 if(slow){
  slow.contactSettings=normalizeContactSettings(slow.contactSettings,slow.destinationIds??[]);
  if(slow.destinationIds?.some((key:string)=>!current.destinations.some(d=>d.id===key)))throw Error('Choose existing local slow-notice destinations');
 }
 const definition=validateDefinition({...current.definition,slow},grants(env));
 const statements=(await revisionStatements(env,definition,old,id,Date.now(),actor)).statements;
 statements.push(auditStatement(env,actor,'slow_policy_change','monitor'));
 try{await env.DB.batch(statements)}catch(error){if(String(error).includes('uptime_audit.id'))throw Object.assign(Error('Monitor changed; reopen the slow policy'),{status:409});throw error}
 return get(env,id);
}
