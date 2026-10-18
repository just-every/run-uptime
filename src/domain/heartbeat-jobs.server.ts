// @ts-ignore Shared calendar.
import {nextHeartbeatOccurrence} from './heartbeat-cron.mjs'
import {get,save,type Bindings} from './control.server.ts'
import type {AuditActor} from './audit.server.ts'
// @ts-ignore Shared bounded heartbeat vocabulary.
import {heartbeatSettings,heartbeatDeadline,redactHeartbeatOutput} from './heartbeat-job.mjs'
export async function heartbeatJobSnapshot(env:Bindings,id:string,revision:number){
 const authority=await env.DB.prepare('SELECT a.received_at,a.started_at,r.state,r.received_at AS completed_at,r.exit_code,r.output,r.late FROM heartbeat_authority a LEFT JOIN heartbeat_runs r ON r.id=a.last_completed_id AND r.monitor_id=a.monitor_id AND r.revision=a.revision WHERE a.monitor_id=? AND a.revision=?').bind(id,revision).first<any>();
 const definition=await env.DB.prepare('SELECT created_at FROM revisions WHERE monitor_id=? AND revision=?').bind(id,revision).first<any>();
 if(!definition)throw Error('Heartbeat revision unavailable');
 return {version:1,baselineAt:definition.created_at,receivedAt:authority?.received_at??null,startedAt:authority?.started_at??null,failure:authority?.state==='fail'?{at:authority.completed_at,exitCode:authority.exit_code,output:authority.output}:null,late:Boolean(authority?.state==='success'&&authority.late)};
}
/** A due-time change only requests signed evaluation; no receipt projects health. */
export async function scheduleHeartbeatEvaluation(env:Bindings,id:string,immediate=false,snapshotAt?:number){
 const monitor=await get(env,id);if(!monitor||monitor.definition.type!=='heartbeat'||!monitor.definition.enabled)return;
 const job=await heartbeatJobSnapshot(env,id,monitor.revision),now=Date.now();
 if(snapshotAt!==undefined&&job.failure&&job.failure.at>snapshotAt)immediate=true;
 const boundaries=[heartbeatDeadline(monitor.definition,job),...(job.startedAt!==null&&monitor.definition.heartbeat.maxRunDurationMs?[job.startedAt+monitor.definition.heartbeat.maxRunDurationMs]:[])].filter(at=>at>now);
 if(immediate||boundaries.length)await env.DB.prepare('UPDATE monitors SET next_due=MIN(next_due,?) WHERE id=? AND revision=?').bind(immediate?now:Math.min(...boundaries),id,monitor.revision).run();
}
export function failureOutput(body:any,settings:any){
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>k!=='output'))throw Error('Failure ping takes only an output field');
 return redactHeartbeatOutput(body.output??'',settings.outputMasks??[]);
}
export async function configureHeartbeat(env:Bindings,id:string,input:any,actor:AuditActor){
 const monitor=await get(env,id);if(!monitor||monitor.definition.type!=='heartbeat')throw Error('Heartbeat monitor required');
 const heartbeat=heartbeatSettings(input);
 // A changed schedule is a new revision and retires existing receipt authority.
 const result=await save(env,{...monitor.definition,heartbeat},id,actor);
 await scheduleHeartbeatEvaluation(env,id);return result;
}
export async function heartbeatRuns(env:Pick<Bindings,'DB'>,id:string,{before,from,to,limit=50,previewFrom}:{before?:string;from?:number;to?:number;limit?:number;previewFrom?:number}={}){
 const rows=(await env.DB.prepare('SELECT * FROM heartbeat_runs WHERE monitor_id=? AND (? IS NULL OR received_at>=?) AND (? IS NULL OR received_at<?) AND (? IS NULL OR (received_at,id)<(SELECT received_at,id FROM heartbeat_runs WHERE id=? AND monitor_id=?)) ORDER BY received_at DESC,id DESC LIMIT ?').bind(id,from??null,from??null,to??null,to??null,before??null,before??null,id,limit+1).all<any>()).results;
 const more=rows.length>limit,selected=rows.slice(0,limit);
 const revision=await env.DB.prepare('SELECT definition FROM monitors WHERE id=?').bind(id).first<any>(),h=revision?JSON.parse(revision.definition).heartbeat:null;
 const upcoming=[];let at=previewFrom??Date.now();if(h?.cron)for(let i=0;i<3;i++){at=nextHeartbeatOccurrence(h,at);upcoming.push({expectedAt:at,deadlineAt:at+(h.graceMs??0)})}
 return {schedule:h?{...h,upcoming,dstPolicy:'Skip nonexistent local times; first occurrence of repeated local times only.'}:null,runs:selected.map(r=>({id:r.id,monitorId:r.monitor_id,revision:r.revision,sequence:r.sequence,state:r.state,receivedAt:r.received_at,startedAt:r.started_at,durationMs:r.duration_ms,exitCode:r.exit_code,output:r.output,late:Boolean(r.late)})),nextCursor:more?selected.at(-1)!.id:null};
}
