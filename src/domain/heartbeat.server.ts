// @ts-ignore Shared scheduler snippet renderer.
import {heartbeatSnippets} from './heartbeat-snippets.mjs'
import {heartbeatJobSnapshot,failureOutput} from './heartbeat-jobs.server.ts'
// @ts-ignore Shared immutable job snapshot evaluation.
import {heartbeatDeadline} from './heartbeat-job.mjs'
import {mutationGuard,auditStatement,automated,type AuditActor} from './audit.server.ts'
import {get,save,sha,same,type Bindings} from './control.server.ts'
export async function issueHeartbeatKey(env:Bindings,id:string,actor:AuditActor=automated){
 let monitor=await get(env,id);
 if(!monitor||monitor.definition.type!=='heartbeat')throw Error('Heartbeat monitor required');
 monitor=await save(env,monitor.definition,id,actor); // Rotation starts a new immutable revision without inherited receipts.
 if(!monitor)throw Error('Heartbeat monitor unavailable');
 const token=crypto.randomUUID()+crypto.randomUUID(),urlToken=crypto.randomUUID()+crypto.randomUUID();
 await env.DB.batch([mutationGuard(env,'EXISTS(SELECT 1 FROM monitors WHERE id=? AND revision=?)',[id,monitor.revision]),env.DB.prepare('INSERT INTO heartbeat_authority(monitor_id,revision,token_hash,url_token_hash,last_sequence,received_at) VALUES(?,?,?,?,0,NULL) ON CONFLICT(monitor_id) DO UPDATE SET revision=excluded.revision,token_hash=excluded.token_hash,url_token_hash=excluded.url_token_hash,last_sequence=0,received_at=NULL,last_completed_id=NULL,started_at=NULL').bind(id,monitor.revision,await sha(token),await sha(urlToken)),auditStatement(env,actor,'credential_rotate','credential')]);
 return {token,urlToken,capabilityPath:`/api/heartbeats/${id}/url/${urlToken}`,replayProtected:false,snippets:heartbeatSnippets({baseUrl:`${env.UPTIME_ORIGIN}/api/heartbeats/${id}/url/${urlToken}`,cron:monitor.definition.heartbeat.cron,timeZone:monitor.definition.heartbeat.timeZone}),revision:monitor.revision,receiptPath:`/api/heartbeats/${id}`,sequenceStartsAt:1};
}
export async function receiveHeartbeat(env:Bindings,id:string,authorization:string,sequence:string,state:'start'|'success'|'fail'='success',exitCode:number|null=null,body:any={},urlToken?:string){
 const monitor=await get(env,id),authority=await env.DB.prepare('SELECT * FROM heartbeat_authority WHERE monitor_id=?').bind(id).first<any>();
 if(!monitor||!monitor.definition.enabled||monitor.definition.type!=='heartbeat'||!authority||authority.revision!==monitor.revision||!(urlToken?authority.url_token_hash&&await same(await sha(urlToken),authority.url_token_hash):authorization.startsWith('Bearer ')&&await same(await sha(authorization.slice(7)),authority.token_hash)))throw Error('Heartbeat authorization required');
 const next=urlToken?authority.last_sequence+1:Number(sequence);
 if((!urlToken&&!/^[1-9][0-9]{0,15}$/.test(sequence))||!Number.isSafeInteger(next)||next<=authority.last_sequence)throw Error('Heartbeat sequence must increase');
 if(!['start','success','fail'].includes(state)||!(exitCode===null||Number.isInteger(exitCode)&&exitCode>=0&&exitCode<=255))throw Error('Invalid heartbeat state');
 if(!body||typeof body!=='object'||Array.isArray(body))throw Error('Heartbeat body must be a JSON object');
 const output=state==='fail'?failureOutput(body,{...monitor.definition.heartbeat,outputMasks:[...(monitor.definition.heartbeat.outputMasks??[]),authorization.slice(7),...(urlToken?[urlToken]:[])].filter(Boolean)}):'';
 if(state!=='fail'&&Object.keys(body).length)throw Error('Start and success pings take no fields');
 if(state==='start'&&authority.started_at!==null)throw Object.assign(Error('A job run is already started; finish it before starting another'),{status:409});
 const previous=await heartbeatJobSnapshot(env,id,monitor.revision),now=Date.now(),eventId=crypto.randomUUID(),startedAt=state==='start'?now:authority.started_at,duration=state==='start'||startedAt===null?null:now-startedAt,late=state==='success'&&(now>=heartbeatDeadline(monitor.definition,previous)||duration!==null&&monitor.definition.heartbeat.maxRunDurationMs>0&&duration>=monitor.definition.heartbeat.maxRunDurationMs);
 if(duration!==null&&duration<0)throw Error('Job completion precedes start');
 const limit=await env.DB.prepare('INSERT INTO heartbeat_limits(monitor_id,window_start,receipts) SELECT ?,?,1 WHERE EXISTS(SELECT 1 FROM monitors WHERE id=?) ON CONFLICT(monitor_id) DO UPDATE SET window_start=CASE WHEN heartbeat_limits.window_start<=? THEN excluded.window_start ELSE heartbeat_limits.window_start END,receipts=CASE WHEN heartbeat_limits.window_start<=? THEN 1 ELSE heartbeat_limits.receipts+1 END WHERE heartbeat_limits.window_start<=? OR heartbeat_limits.receipts<60 RETURNING receipts').bind(id,now,id,now-60000,now-60000,now-60000).first();
 if(!limit)throw Object.assign(Error('Heartbeat rate limit reached'),{status:429});
 const immediate=state==='fail'||state==='success'&&(previous.failure!==null||late);
 const boundary=state==='success'?heartbeatDeadline(monitor.definition,{...previous,receivedAt:now}):Math.max(now,Math.min(heartbeatDeadline(monitor.definition,previous),state==='start'&&monitor.definition.heartbeat.maxRunDurationMs?now+monitor.definition.heartbeat.maxRunDurationMs:Number.MAX_SAFE_INTEGER));
 const results=await env.DB.batch([
  mutationGuard(env,"EXISTS(SELECT 1 FROM heartbeat_authority a JOIN monitors m ON m.id=a.monitor_id WHERE a.monitor_id=? AND a.revision=? AND a.token_hash=? AND a.last_sequence=? AND m.revision=a.revision AND json_extract(m.definition,'$.enabled')=1)",[id,monitor.revision,authority.token_hash,authority.last_sequence]),
  env.DB.prepare('INSERT INTO heartbeat_runs(id,monitor_id,revision,sequence,state,received_at,started_at,duration_ms,exit_code,output,late) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(eventId,id,monitor.revision,next,state,now,startedAt,duration,exitCode,output,Number(late)),
  env.DB.prepare('UPDATE heartbeat_authority SET last_sequence=?,received_at=?,last_completed_id=?,started_at=? WHERE monitor_id=? AND revision=?').bind(next,state==='success'?now:authority.received_at,state==='start'?authority.last_completed_id:eventId,state==='start'?now:null,id,monitor.revision),
  env.DB.prepare('UPDATE monitors SET next_due=MIN(next_due,?) WHERE id=? AND revision=?').bind(immediate?now:boundary,id,monitor.revision),
 ]);
 if(!results[2].meta.changes)throw Error('Heartbeat receipt rejected');
 return {received:true,state,replayProtected:!urlToken,receivedAt:now,revision:monitor.revision,runId:eventId,durationMs:duration,late,evaluationScheduled:immediate};
}
export async function snapshotHeartbeat(env:Bindings,task:any){
 if(!task||task.definition.type!=='heartbeat')return task;
 const job=await heartbeatJobSnapshot(env,task.monitorId,task.revision),receivedAt=job.receivedAt;
 await env.DB.prepare('INSERT OR IGNORE INTO heartbeat_claims(slot_id,revision,received_at,job_snapshot) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM slots WHERE id=?)').bind(task.id,task.revision,receivedAt,JSON.stringify(job),task.id).run();
 const stored=await env.DB.prepare('SELECT received_at,job_snapshot FROM heartbeat_claims WHERE slot_id=?').bind(task.id).first<any>();
 if(!stored)return null;
 return {...task,heartbeatReceipt:{receivedAt:stored.received_at,...(stored.job_snapshot?{job:JSON.parse(stored.job_snapshot)}:{})}};
}

export async function validateHeartbeatSnapshot(env:Bindings,slot:any,attempts:any[]){
 const snapshot=await env.DB.prepare('SELECT * FROM heartbeat_claims WHERE slot_id=?').bind(slot.id).first<any>();
 if(!snapshot||snapshot.revision!==slot.revision)throw Error('Heartbeat claim snapshot unavailable');
 for(const o of attempts){
  if(o.outcome==='runner_error'&&o.heartbeatJob===undefined)continue;
  if(snapshot.job_snapshot!==null){if(JSON.stringify(o.heartbeatJob)!==snapshot.job_snapshot)throw Error('Heartbeat job snapshot mismatch');continue}
  if(o.heartbeatJob!==undefined)throw Error('Unexpected heartbeat job snapshot');
  if(o.outcome==='runner_error')continue;
  if((o.heartbeatReceivedAt??null)!==snapshot.received_at)throw Error('Heartbeat receipt evidence mismatch');
  const fresh=Number.isFinite(snapshot.received_at)&&snapshot.received_at<=o.startedAt&&o.completedAt-snapshot.received_at<=JSON.parse(slot.definition).heartbeat.maxAgeMs;
  if((o.outcome==='pass')!==fresh)throw Error('Heartbeat freshness evidence mismatch');
 }
}
