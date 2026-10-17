import {clock,identity,unique,type Tables} from './archive-schema.ts'
// @ts-ignore Shared output bounds.
import {HEARTBEAT_OUTPUT_BYTES} from './heartbeat-job.mjs'
/** Portable receipts are historical records only; no authority or claim is reconstructed. */
export function validateHeartbeatRuns(t:Tables){
 unique(t.heartbeat_runs,r=>r.id,'heartbeat run');unique(t.heartbeat_runs,r=>`${r.monitor_id}:${r.revision}:${r.sequence}`,'heartbeat sequence');
 const revisions=new Map(t.revisions.map(r=>[`${r.monitor_id}:${r.revision}`,r]));
 for(const row of t.heartbeat_runs){
  identity(row.id,'heartbeat run');const revision=revisions.get(`${row.monitor_id}:${row.revision}`);
  if(!revision||JSON.parse(revision.definition).type!=='heartbeat'||!Number.isSafeInteger(row.sequence)||row.sequence<1||!['start','success','fail'].includes(row.state)||![0,1].includes(row.late)||typeof row.output!=='string'||new TextEncoder().encode(row.output).length>HEARTBEAT_OUTPUT_BYTES)throw Error('Invalid archive heartbeat run');
  clock(row.received_at,'heartbeat receipt');if(row.received_at<revision.created_at)throw Error('Heartbeat receipt precedes its revision');
  if(row.started_at!==null){clock(row.started_at,'heartbeat start');if(row.started_at<revision.created_at||row.started_at>row.received_at)throw Error('Invalid heartbeat duration')}
  if(row.state==='start'){
   if(row.started_at!==row.received_at||row.duration_ms!==null||row.exit_code!==null||row.output||row.late)throw Error('Invalid heartbeat start');
  }else{
   if(row.started_at===null?row.duration_ms!==null:row.duration_ms!==row.received_at-row.started_at)throw Error('Invalid heartbeat duration');
   if(row.state==='success'&&(row.exit_code!==null||row.output)||row.state==='fail'&&(row.late||!(row.exit_code===null||Number.isInteger(row.exit_code)&&row.exit_code>=0&&row.exit_code<=255)))throw Error('Invalid heartbeat completion');
  }
 }
 const previous=new Map<string,any>();
 for(const row of [...t.heartbeat_runs].sort((a,b)=>a.sequence-b.sequence)){
  const key=`${row.monitor_id}:${row.revision}`,before=previous.get(key);
  if(before&&before.received_at>row.received_at)throw Error('Heartbeat sequence time mismatch');
  if(row.state==='start'&&before?.state==='start')throw Error('Overlapping archived heartbeat runs');
  if(row.state!=='start'&&(before?.state==='start'?row.started_at!==before.started_at:row.started_at!==null))throw Error('Heartbeat finish has no matching start');
  previous.set(key,row);
 }
}
