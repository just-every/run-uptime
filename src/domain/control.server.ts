import {notificationOverview} from './notifications.server.ts'
import {mutationGuard,auditStatement,type AuditActor} from './audit.server.ts'
import {availabilityOverview} from './availability.server.ts'
import {operatorSession,type AuthBindings} from './operator-auth.server.ts'
// Server-only Worker control plane. Policy is edition-selected family source.
// @ts-ignore checked by family policy tests
import {validateDefinition} from './policy.mjs'
// @ts-ignore Edition flow vocabulary is JavaScript shared with the runner.
import {FLOW_LIMITS,requirementChange} from './flow.mjs'
import {readContact} from './runner-contact.server.ts'
import {externalCheckUrl} from './external-check.server.ts'
import {assignDefinition,listRunners,ensureFirstRunner,runnerIdentity} from './runner-registration.server.ts'
import {attemptSnapshot} from './attempt-checkpoint.server.ts'
import {legacyWarning} from './legacy-monitoring.server.ts'
import {definitionChange,definitionChangeNote} from './flow-changes.server.ts'
import {projectAttempts} from './attempt-projection.ts'
import {acceptanceMs} from './schedule.ts'
import {classifyStorage} from './storage-error.ts'
export interface Bindings extends AuthBindings {ASSETS?:Fetcher;RER_DEPLOY_SOURCE?:string;RER_DEPLOY_FINGERPRINT?:string;RER_VERSION?:{id:string};DB:D1Database;UPTIME_RUNNER_KEY:string;UPTIME_SYNTHETIC_PORT:string;UPTIME_HEARTBEAT_URL?:string;UPTIME_START_URL?:string;UPTIME_DEPLOY_ENVIRONMENT?:string;UPTIME_HEARTBEAT_INTERVAL_MS?:string;UPTIME_RUNNER_STALE_MS?:string;UPTIME_WATCH_REPEAT_MS?:string;UPTIME_DIGEST_INTERVAL_MS?:string}
export async function sha(value:string){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join('')}
export async function same(a:string,b:string){const [x,y]=await Promise.all([sha(a),sha(b)]);let difference=0;for(let i=0;i<x.length;i++)difference|=x.charCodeAt(i)^y.charCodeAt(i);return difference===0}
export async function sign(key:string,value:string){const secret=await crypto.subtle.importKey('raw',new TextEncoder().encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);return [...new Uint8Array(await crypto.subtle.sign('HMAC',secret,new TextEncoder().encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join('')}
export function grants(env:Bindings){if(!env.UPTIME_SYNTHETIC_PORT)return [];const port=Number(env.UPTIME_SYNTHETIC_PORT),origin=new URL(env.UPTIME_ORIGIN??'http://localhost'),controlPort=Number(origin.port||(origin.protocol==='https:'?443:80));if(!Number.isInteger(port)||port<1||port>65535||port===controlPort)throw Error('Invalid local endpoint grant');return [port]}
export async function session(env:Bindings,request:Request){return Boolean(await operatorSession(env,request))}
export async function get(env:Bindings,id:string){const row=await env.DB.prepare('SELECT * FROM monitors WHERE id=?').bind(id).first<any>();return row?{id:row.id,revision:row.revision,definition:JSON.parse(row.definition),nextDue:row.next_due,storedState:JSON.parse(row.state)}:null}
export async function overview(env:Bindings){
 await ensureFirstRunner(env);
 const now=Date.now(),runners=await listRunners(env),staleMs=Number(env.UPTIME_RUNNER_STALE_MS??120000);
 if(!Number.isSafeInteger(staleMs)||staleMs<=0)throw Error('Invalid monitoring watch interval');
 const legacy=await runnerIdentity(env);
 const rows=await env.DB.prepare('SELECT id FROM monitors ORDER BY rowid').all<any>(),monitors=[];
 for(const row of rows.results){
  const m=await get(env,row.id);if(!m)continue;
  const snapshot=await attemptSnapshot(env,m.id,m.revision,m.definition,now);
  const state:any={...projectAttempts(m.definition,snapshot.slots,snapshot.observations,now,snapshot.checkpoint),notificationOpen:m.storedState.notificationOpen,incidentKey:m.storedState.incidentKey};
  const changed=m.storedState.notificationOpen?await definitionChange(env,m.id,m.storedState.incidentRevision,m.revision,m.definition):null;if(changed){state.definitionChange=changed;state.reason+=definitionChangeNote(changed)}
  if(state.notificationOpen&&state.targetState==='Healthy'&&state.recoveryStreak<m.definition.recoverSlots){
   state.targetState=state.underlyingState='Recovering';if(!state.maintenance)state.state='Recovering';state.confirmedFailure=true;
  }
  const activeLabels=new Set();
  for(const assignment of Object.values(m.definition.assignments??(legacy?{legacy:{runnerId:legacy.runner_id,networkLabel:legacy.network_label}}:{})) as any[]){
   const runner=runners.find((r:any)=>r.runnerId===assignment.runnerId) as any;
   if(runner&&runner.revokedAt===null&&runner.lastContactAt!==null&&runner.lastContactAt<=now&&now-runner.lastContactAt<=staleMs)activeLabels.add(assignment.networkLabel);
  }
  monitors.push({...m,configurationWarning:m.definition.assignments?null:legacyWarning,activeVantages:activeLabels.size,state:m.definition.enabled?state:{...state,state:'Paused',targetState:'Unknown',reason:'Monitor paused; historical observations do not establish current target health.'}});
 }
 const availability=await availabilityOverview(env.DB,monitors,now);
 const alerts=await env.DB.prepare('SELECT * FROM outbox ORDER BY rowid DESC LIMIT 200').all<any>();
 return {monitors:monitors.map(m=>({...m,availability:availability.get(m.id)})),alerts:alerts.results.map(r=>({...r,event:JSON.parse(r.event)})),
  runner:{identity:'private-runner',version:'uptime-node/0.1.0',independentVantage:new Set(runners.filter((r:any)=>r.revokedAt===null).map((r:any)=>r.networkLabel)).size>1,runners,grants:grants(env),contact:await readContact(env.DB),externalCheckUrl:await externalCheckUrl(env)},
  notifications:await notificationOverview(env),now};
}
export const MONITOR_LIMIT=100
// The revision guard runs in the write transaction. A racing create returns the same useful capacity error as preflight.
export async function withinMonitorCap<T>(env:Bindings,adding:number,batch:Promise<T>):Promise<T>{
 try{return await batch}catch(error){
  if(adding&&classifyStorage(error)?.class==='guard_conflict'&&Number((await env.DB.prepare('SELECT COUNT(*) n FROM monitors').first<any>())?.n)+adding>MONITOR_LIMIT)throw Error('Monitor limit reached')
  throw error
 }
}
// When the monitor's previous scheduled check last started at any vantage: the claim time (a scheduled slot's lease runs exactly
// one acceptance window from its claim), the latest delivery of its part to a vantage, or the latest reported start of a vantage's
// first attempt, whichever is latest. Slots restored from an archive ran elsewhere and never set this installation's schedule.
export async function lastScheduledStart(env:Bindings,id:string){
 const slot=await env.DB.prepare("SELECT id,lease_until,definition FROM slots WHERE monitor_id=? AND manual=0 AND lease_owner<>'restored-inactive' ORDER BY due_at DESC,rowid DESC LIMIT 1").bind(id).first<any>();if(!slot)return null;
 const started=await env.DB.prepare("SELECT MAX(json_extract(evidence,'$.startedAt')) AS at FROM observations WHERE slot_id=? AND attempt=0").bind(slot.id).first<any>();
 const delivered=await env.DB.prepare('SELECT MAX(delivered_at) AS at FROM runner_assignments WHERE slot_id=?').bind(slot.id).first<any>();
 const claimed=slot.lease_until>0?slot.lease_until-acceptanceMs(JSON.parse(slot.definition)):null;
 const values=[claimed,delivered?.at,started?.at].filter(v=>Number.isSafeInteger(v));return values.length?Math.max(...values):null;
}
// The statements that make `definition` the monitor's next immutable revision (or its first). A new revision is due
// no sooner than the shorter of its old and new intervals after the monitor's previous scheduled check started, so an
// edit never makes checks run closer together than either cadence, and never delays one by a whole new longer interval. The caller adds its own guards and runs everything in one batch.
// A heartbeat revision retires the monitor's token, unless the caller keeps it (a definition file never carries tokens):
// a kept token moves to the new revision with its sequence and last receipt, so the owner's jobs keep pinging.
export async function revisionStatements(env:Bindings,definition:any,old:Awaited<ReturnType<typeof get>>,key:string,now:number,actor:AuditActor,{keepHeartbeatToken=false}={}){
 const revision=(old?.revision??0)+1,data=JSON.stringify(definition),started=old?await lastScheduledStart(env,key):null,nextDue=Math.max(now,started===null?now:started+Math.min(definition.intervalMs,old!.definition.intervalMs));
 const state=JSON.stringify({state:'Unknown',confirmedFailure:old?.storedState.confirmedFailure??false,notificationOpen:old?.storedState.notificationOpen??false,incidentKey:old?.storedState.incidentKey??null,incidentRevision:old?.storedState.incidentRevision??null});
 return {revision,statements:[...(old?[mutationGuard(env,'EXISTS(SELECT 1 FROM monitors WHERE id=? AND revision=?)',[key,old.revision])]:[mutationGuard(env,'(SELECT COUNT(*) FROM monitors)<?',[MONITOR_LIMIT])]),old?env.DB.prepare('UPDATE monitors SET revision=?,definition=?,next_due=?,state=? WHERE id=? AND revision=?').bind(revision,data,nextDue,state,key,old.revision):env.DB.prepare('INSERT INTO monitors VALUES(?,?,?,?,?)').bind(key,revision,data,nextDue,state),env.DB.prepare('INSERT INTO revisions VALUES(?,?,?,?)').bind(key,revision,data,now),env.DB.prepare('INSERT OR IGNORE INTO evidence_generation(monitor_id) VALUES(?)').bind(key),...(keepHeartbeatToken&&old?.definition.type==='heartbeat'&&definition.type==='heartbeat'?[env.DB.prepare('UPDATE heartbeat_authority SET revision=? WHERE monitor_id=? AND revision=?').bind(revision,key,old.revision)]:(old?.definition.type==='heartbeat'||definition.type==='heartbeat')?[auditStatement(env,actor,'credential_retire','credential',crypto.randomUUID(),'EXISTS(SELECT 1 FROM heartbeat_authority WHERE monitor_id=?)',[key],now),env.DB.prepare('DELETE FROM heartbeat_authority WHERE monitor_id=?').bind(key)]:[])]};
}
export async function save(env:Bindings,input:any,id?:string,actor:AuditActor={kind:'feature',ref:'cron-maintenance'}){const definition=await assignDefinition(env,validateDefinition(input,grants(env)),input),now=Date.now(),old=id?await get(env,id):null;if(id&&!old)throw Error('Monitor not found');const key=id??crypto.randomUUID();if(!old&&Number((await env.DB.prepare('SELECT COUNT(*) n FROM monitors').first<any>())?.n)>=MONITOR_LIMIT)throw Error('Monitor limit reached');await assertFlowCapacity(env,definition,id);const statements=(await revisionStatements(env,definition,old,key,now,actor)).statements,addsFlow=Number(definition.type==='flow'&&old?.definition.type!=='flow');if(addsFlow)statements.push(flowCapGuard(env));await withinMonitorCap(env,Number(!old),withinFlowCap(env,addsFlow,env.DB.batch(statements)));return get(env,key)}
export {claimAttempt as claim,completeAttempts as complete} from './attempts.server.ts'
// A monitor's revisions, newest first: each save's number, time (its grid's start and next_due until the first claim) and
// definition, so the monitor page can bound every revision's scheduled due times and show past pauses and maintenance.
// Where a flow is involved, each revision also says how its set of required outcomes moved from the revision before it (`shrank`
// when something the earlier revision required is gone, which includes a flow edited into another type), so a quietly weakened
// flow shows in the history.
export async function revisions(env:Bindings,id:string){
 const rows=await env.DB.prepare('SELECT revision,definition,created_at FROM revisions WHERE monitor_id=? ORDER BY revision DESC LIMIT 100').bind(id).all<any>(),all=rows.results.map(r=>({revision:r.revision as number,start:r.created_at as number,definition:JSON.parse(r.definition)}))
 const flowOf=(d:any)=>d?.type==='flow'?d.flow:null
 return all.map((r,i)=>{const before=all[i+1];return r.definition.type==='flow'||before?.definition.type==='flow'?{...r,flowChange:before?requirementChange(flowOf(before.definition),flowOf(r.definition)):null}:r})
}
// An installation runs at most FLOW_LIMITS.maxFlowsPerInstallation flow monitors (browser runs cost minutes of runner time).
const flowLimitReached=()=>Error(`Flow monitor limit reached (an installation runs at most ${FLOW_LIMITS.maxFlowsPerInstallation} flows)`)
export async function assertFlowCapacity(env:Bindings,definition:any,excludeId?:string){
 if(definition.type!=='flow')return
 const n=Number((await env.DB.prepare("SELECT COUNT(*) n FROM monitors WHERE json_extract(definition,'$.type')='flow' AND id<>?").bind(excludeId??'').first<any>())?.n)
 if(n>=FLOW_LIMITS.maxFlowsPerInstallation)throw flowLimitReached()
}
// The same bound inside the batch that adds a flow, after its writes: concurrent saves that each counted room cannot all commit.
export const flowCapGuard=(env:Bindings)=>mutationGuard(env,"(SELECT COUNT(*) FROM monitors WHERE json_extract(definition,'$.type')='flow')<=?",[FLOW_LIMITS.maxFlowsPerInstallation])
// A batch that adds `adding` flows and is refused by its guards answers with the flow limit when a racing save took the room.
export async function withinFlowCap<T>(env:Bindings,adding:number,batch:Promise<T>):Promise<T>{
 try{return await batch}catch(error){
  if(adding&&classifyStorage(error)?.class==='guard_conflict'&&Number((await env.DB.prepare("SELECT COUNT(*) n FROM monitors WHERE json_extract(definition,'$.type')='flow'").first<any>())?.n)+adding>FLOW_LIMITS.maxFlowsPerInstallation)throw flowLimitReached()
  throw error
 }
}
export async function history(env:Bindings,id:string){const rows=await env.DB.prepare('SELECT * FROM slots WHERE monitor_id=? ORDER BY due_at DESC,rowid DESC LIMIT 100').bind(id).all<any>();const values=[];for(const row of rows.results){const os=await env.DB.prepare('SELECT evidence FROM observations WHERE slot_id=? ORDER BY probe,attempt').bind(row.id).all<any>();values.push({...row,definition:JSON.parse(row.definition),observations:os.results.map(o=>JSON.parse(o.evidence))})}return values}
export {archive,restore} from './archive.server.ts'
