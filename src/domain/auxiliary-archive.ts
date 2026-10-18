import {clock,type Tables} from './archive-schema.ts'
/** Outcomes are portable evidence; no recipient, request body or credential is
 * accepted into the auxiliary journal. Restored work never becomes a queue. */
export function validateAuxiliaryArchive(t:Tables){
 const ids=new Set<string>(),active=new Set<string>();
 for(const row of t.auxiliary_attempts){
  if(typeof row.id!=='string'||!/^[a-f0-9-]{36}$/.test(row.id)||ids.has(row.id)||!['watch','auth-mail'].includes(row.scope)||typeof row.job_id!=='string'||(row.scope==='auth-mail'?!/^[a-f0-9-]{36}$/.test(row.job_id):! /^(external-heartbeat|runner-stale:self-[a-f0-9-]{36}:\d+|healthy-digest:\d+)$/.test(row.job_id))||!['claimed','sending','accepted','development','rejected','rate_limited','uncertain','expired'].includes(row.outcome)||typeof row.code!=='string'||!/^[a-z][a-z0-9_]{0,79}$/.test(row.code))throw Error('Invalid auxiliary archive attempt');
  ids.add(row.id);clock(row.started_at,'auxiliary start');clock(row.lease_until,'auxiliary lease');if(row.lease_until<=row.started_at)throw Error('Invalid auxiliary archive lease');
  for(const key of ['submitted_at','finished_at'])if(row[key]!==null){clock(row[key],'auxiliary outcome');if(row[key]<row.started_at)throw Error('Invalid auxiliary archive outcome time')}
  if((row.finished_at===null)!==['claimed','sending'].includes(row.outcome)||(row.outcome==='claimed'&&row.submitted_at!==null)||(row.outcome==='sending'&&row.submitted_at===null)||(row.finished_at!==null&&row.submitted_at!==null&&row.finished_at<row.submitted_at))throw Error('Invalid auxiliary archive progress');
  if(row.finished_at===null){const key=`${row.scope}:${row.job_id}`;if(active.has(key))throw Error('Duplicate auxiliary archive lease');active.add(key)}
 }
}
export function restoreAuxiliary(t:Tables,now:number){
 for(const row of t.auxiliary_attempts)if(row.finished_at===null){row.finished_at=Math.max(now,row.started_at,row.submitted_at??0);row.outcome='uncertain';row.code='restored_inactive'}
}
