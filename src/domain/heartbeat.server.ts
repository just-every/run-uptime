import {mutationGuard,auditStatement,automated,type AuditActor} from './audit.server.ts'
import {get,save,sha,same,type Bindings} from './control.server.ts'
export async function issueHeartbeatKey(env:Bindings,id:string,actor:AuditActor=automated){
 let monitor=await get(env,id);
 if(!monitor||monitor.definition.type!=='heartbeat')throw Error('Heartbeat monitor required');
 monitor=await save(env,monitor.definition,id,actor); // Rotation starts a new immutable revision without inherited receipts.
 if(!monitor)throw Error('Heartbeat monitor unavailable');
 const token=crypto.randomUUID()+crypto.randomUUID();
 await env.DB.batch([mutationGuard(env,'EXISTS(SELECT 1 FROM monitors WHERE id=? AND revision=?)',[id,monitor.revision]),env.DB.prepare('INSERT INTO heartbeat_authority(monitor_id,revision,token_hash,last_sequence,received_at) VALUES(?,?,?,0,NULL) ON CONFLICT(monitor_id) DO UPDATE SET revision=excluded.revision,token_hash=excluded.token_hash,last_sequence=0,received_at=NULL').bind(id,monitor.revision,await sha(token)),auditStatement(env,actor,'credential_rotate','credential')]);
 return {token,revision:monitor.revision,receiptPath:`/api/heartbeats/${id}`,sequenceStartsAt:1};
}
export async function receiveHeartbeat(env:Bindings,id:string,authorization:string,sequence:string){
 const monitor=await get(env,id),authority=await env.DB.prepare('SELECT * FROM heartbeat_authority WHERE monitor_id=?').bind(id).first<any>();
 if(!monitor||!monitor.definition.enabled||monitor.definition.type!=='heartbeat'||!authority||authority.revision!==monitor.revision||!authorization.startsWith('Bearer ')||!await same(await sha(authorization.slice(7)),authority.token_hash))throw Error('Heartbeat authorization required');
 const next=Number(sequence);
 if(!/^[1-9][0-9]{0,15}$/.test(sequence)||!Number.isSafeInteger(next)||next<=authority.last_sequence)throw Error('Heartbeat sequence must increase');
 const now=Date.now();
 const limit=await env.DB.prepare('INSERT INTO heartbeat_limits(monitor_id,window_start,receipts) SELECT ?,?,1 WHERE EXISTS(SELECT 1 FROM monitors WHERE id=?) ON CONFLICT(monitor_id) DO UPDATE SET window_start=CASE WHEN heartbeat_limits.window_start<=? THEN excluded.window_start ELSE heartbeat_limits.window_start END,receipts=CASE WHEN heartbeat_limits.window_start<=? THEN 1 ELSE heartbeat_limits.receipts+1 END WHERE heartbeat_limits.window_start<=? OR heartbeat_limits.receipts<60 RETURNING receipts').bind(id,now,id,now-60000,now-60000,now-60000).first();
 if(!limit)throw Object.assign(Error('Heartbeat rate limit reached'),{status:429});
 const result=await env.DB.prepare("UPDATE heartbeat_authority SET last_sequence=?,received_at=? WHERE monitor_id=? AND revision=? AND token_hash=? AND last_sequence<? AND EXISTS(SELECT 1 FROM monitors WHERE id=? AND revision=? AND json_extract(definition,'$.enabled')=1)").bind(next,now,id,monitor.revision,authority.token_hash,next,id,monitor.revision).run();
 if(!result.meta.changes)throw Error('Heartbeat receipt rejected');
 return {received:true,receivedAt:now,revision:monitor.revision};
}
export async function snapshotHeartbeat(env:Bindings,task:any){
 if(!task||task.definition.type!=='heartbeat')return task;
 const receipt=await env.DB.prepare('SELECT received_at FROM heartbeat_authority WHERE monitor_id=? AND revision=?').bind(task.monitorId,task.revision).first<any>();
 const receivedAt=receipt?.received_at??null;
 await env.DB.prepare('INSERT OR IGNORE INTO heartbeat_claims(slot_id,revision,received_at) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM slots WHERE id=?)').bind(task.id,task.revision,receivedAt,task.id).run();
 const stored=await env.DB.prepare('SELECT received_at FROM heartbeat_claims WHERE slot_id=?').bind(task.id).first<any>();if(!stored)return null;return {...task,heartbeatReceipt:stored.received_at===null?null:{receivedAt:stored.received_at}};
}
export async function validateHeartbeatSnapshot(env:Bindings,slot:any,attempts:any[]){
 const snapshot=await env.DB.prepare('SELECT * FROM heartbeat_claims WHERE slot_id=?').bind(slot.id).first<any>();
 if(!snapshot||snapshot.revision!==slot.revision)throw Error('Heartbeat claim snapshot unavailable');
 for(const o of attempts){
  if(o.outcome==='runner_error')continue;
  if((o.heartbeatReceivedAt??null)!==snapshot.received_at)throw Error('Heartbeat receipt evidence mismatch');
  const fresh=Number.isFinite(snapshot.received_at)&&snapshot.received_at<=o.startedAt&&o.completedAt-snapshot.received_at<=JSON.parse(slot.definition).heartbeat.maxAgeMs;
  if((o.outcome==='pass')!==fresh)throw Error('Heartbeat freshness evidence mismatch');
 }
}
