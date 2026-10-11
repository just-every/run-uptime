import {notificationOverview} from './notifications.server.ts'
import {mutationGuard,auditStatement,type AuditActor} from './audit.server.ts'
import {availabilityOverview} from './availability.server.ts'
import {operatorSession,type AuthBindings} from './operator-auth.server.ts'
// Server-only Worker control plane. Policy is edition-selected family source.
// @ts-ignore checked by family policy tests
import {validateDefinition} from './policy.mjs'
import {readContact} from './runner-contact.server.ts'
import {assignDefinition,listRunners,ensureFirstRunner,runnerIdentity} from './runner-registration.server.ts'
import {attemptSnapshot} from './attempt-checkpoint.server.ts'
import {legacyWarning} from './legacy-monitoring.server.ts'
import {projectAttempts} from './attempt-projection.ts'
export interface Bindings extends AuthBindings {ASSETS?:Fetcher;RER_DEPLOY_SOURCE?:string;RER_DEPLOY_FINGERPRINT?:string;RER_VERSION?:{id:string};DB:D1Database;UPTIME_RUNNER_KEY:string;UPTIME_SYNTHETIC_PORT:string;UPTIME_HEARTBEAT_URL?:string;UPTIME_HEARTBEAT_INTERVAL_MS?:string;UPTIME_RUNNER_STALE_MS?:string;UPTIME_WATCH_REPEAT_MS?:string;UPTIME_DIGEST_INTERVAL_MS?:string}
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
  const state={...projectAttempts(m.definition,snapshot.slots,snapshot.observations,now,snapshot.checkpoint),notificationOpen:m.storedState.notificationOpen,incidentKey:m.storedState.incidentKey};
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
  runner:{identity:'private-runner',version:'uptime-node/0.1.0',independentVantage:new Set(runners.filter((r:any)=>r.revokedAt===null).map((r:any)=>r.networkLabel)).size>1,runners,grants:grants(env),contact:await readContact(env.DB)},
  notifications:await notificationOverview(env),now};
}
export async function save(env:Bindings,input:any,id?:string,actor:AuditActor={kind:'feature',ref:'cron-maintenance'}){const definition=await assignDefinition(env,validateDefinition(input,grants(env)),input),now=Date.now(),old=id?await get(env,id):null;if(id&&!old)throw Error('Monitor not found');const key=id??crypto.randomUUID(),revision=(old?.revision??0)+1;if(!old&&Number((await env.DB.prepare('SELECT COUNT(*) n FROM monitors').first<any>())?.n)>=100)throw Error('Monitor limit reached');const data=JSON.stringify(definition);const state=JSON.stringify({state:'Unknown',confirmedFailure:old?.storedState.confirmedFailure??false,notificationOpen:old?.storedState.notificationOpen??false,incidentKey:old?.storedState.incidentKey??null});await env.DB.batch([...(old?[mutationGuard(env,'EXISTS(SELECT 1 FROM monitors WHERE id=? AND revision=?)',[key,old.revision])]:[]),old?env.DB.prepare('UPDATE monitors SET revision=?,definition=?,next_due=?,state=? WHERE id=? AND revision=?').bind(revision,data,now,state,key,old.revision):env.DB.prepare('INSERT INTO monitors VALUES(?,?,?,?,?)').bind(key,revision,data,now,state),env.DB.prepare('INSERT INTO revisions VALUES(?,?,?,?)').bind(key,revision,data,now),env.DB.prepare('INSERT OR IGNORE INTO evidence_generation(monitor_id) VALUES(?)').bind(key),...((old?.definition.type==='heartbeat'||definition.type==='heartbeat')?[auditStatement(env,actor,'credential_retire','credential',crypto.randomUUID(),'EXISTS(SELECT 1 FROM heartbeat_authority WHERE monitor_id=?)',[key],now),env.DB.prepare('DELETE FROM heartbeat_authority WHERE monitor_id=?').bind(key)]:[])]);return get(env,key)}
export {claimAttempt as claim,completeAttempts as complete} from './attempts.server.ts'
// A monitor's revisions, newest first: each save's number, time (its grid's start and next_due until the first claim) and
// definition, so the monitor page can bound every revision's scheduled due times and show past pauses and maintenance.
export async function revisions(env:Bindings,id:string){const rows=await env.DB.prepare('SELECT revision,definition,created_at FROM revisions WHERE monitor_id=? ORDER BY revision DESC LIMIT 100').bind(id).all<any>();return rows.results.map(r=>({revision:r.revision,start:r.created_at,definition:JSON.parse(r.definition)}))}
export async function history(env:Bindings,id:string){const rows=await env.DB.prepare('SELECT * FROM slots WHERE monitor_id=? ORDER BY due_at DESC,rowid DESC LIMIT 100').bind(id).all<any>();const values=[];for(const row of rows.results){const os=await env.DB.prepare('SELECT evidence FROM observations WHERE slot_id=? ORDER BY probe,attempt').bind(row.id).all<any>();values.push({...row,definition:JSON.parse(row.definition),observations:os.results.map(o=>JSON.parse(o.evidence))})}return values}
export {archive,restore} from './archive.server.ts'
