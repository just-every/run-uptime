import type {Access} from './access.server.ts'
import type {Bindings} from './control.server.ts'
import {auditStatement,mutationGuard,type AuditActor} from './audit.server.ts'
import {classifyStorage} from './storage-error.ts'
import {createSourceJob} from './discovery.server.ts'
import {proposalView} from './discovery-proposals.ts'
// @ts-ignore Shared source validation; edition JavaScript.
import {SOURCE_KINDS,SOURCE_LIMITS,runSpec,validateSourceInput} from './discovery-sources.mjs'
// DISCOVERY-001: the owner's door to discovery sources. The owner authorizes a source by its identifiers; the Worker never reads
// it. An owner-started run is a discovery job the owner's runner claims, reads read-only and answers with derived candidates;
// the finished run is kept as the snapshot the next run is compared with. Proposals are reviewed here and adopted through the
// monitor door like any other new monitor: a source, a run, a rejection or a decision never creates, enables or runs a monitor.
const refuse=(message:string,status=409)=>Object.assign(Error(message),{status})
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
type Source={id:string;kind:string;label:string;identifiers:Record<string,string>;authorized_by:string|null;authorized_at:number;state:'active'|'inactive'}
const rowOf=(row:any):Source=>({...row,identifiers:JSON.parse(row.identifiers)})
const parsed=(run:any)=>run&&{...run,result:run.result===null?null:JSON.parse(run.result)}
const kinds=()=>Object.entries(SOURCE_KINDS as Record<string,any>).map(([kind,spec])=>({kind,label:spec.label,fields:spec.fields,provider:spec.provider,deploy:spec.deploy,access:spec.access}))
function exact(text:string,keys:string[],what:string){
 let input;try{input=JSON.parse(text)}catch{throw Error(`Invalid ${what}`)}
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!keys.includes(key)))throw Error(`Invalid ${what}`)
 return input as Record<string,any>
}
async function source(env:Bindings,id:string){
 const row=uuid.test(id)?await env.DB.prepare('SELECT * FROM discovery_sources WHERE id=?').bind(id).first<any>():null
 if(!row)throw refuse('That discovery source was not found.',404)
 return rowOf(row)
}
async function latestRuns(env:Bindings,id:string){
 const rows=(await env.DB.prepare("SELECT * FROM discovery_source_runs WHERE source_id=? ORDER BY started_at DESC,rowid DESC LIMIT 20").bind(id).all<any>()).results.map(parsed)
 const done=rows.filter(row=>row.status==='done')
 return {latest:done[0]??null,previous:done[1]??null,failed:rows[0]?.status==='failed'?rows[0]:null}
}
const pending=(env:Bindings,id:string)=>env.DB.prepare("SELECT id,status,created_at FROM discovery_jobs WHERE kind='source' AND json_extract(spec,'$.source')=? AND status IN ('queued','running') ORDER BY created_at DESC LIMIT 1").bind(id).first<any>()
function summary(row:Source,runs:{latest:any;failed:any},job:any){
 return {id:row.id,kind:row.kind,kindLabel:(SOURCE_KINDS as any)[row.kind].label,label:row.label,identifiers:row.identifiers,state:row.state,authorizedAt:row.authorized_at,
  latestRun:runs.latest?{id:runs.latest.id,startedAt:runs.latest.started_at,finishedAt:runs.latest.finished_at,candidates:runs.latest.result.candidates.length}:null,
  failure:runs.failed?{id:runs.failed.id,finishedAt:runs.failed.finished_at,error:runs.failed.error}:null,running:job?{id:job.id,status:job.status}:null}
}
export async function sourcesDocument(env:Bindings){
 const rows=(await env.DB.prepare('SELECT * FROM discovery_sources ORDER BY authorized_at,id').all<any>()).results.map(rowOf)
 return {kinds:kinds(),limit:SOURCE_LIMITS.sources,sources:await Promise.all(rows.map(async row=>summary(row,await latestRuns(env,row.id),await pending(env,row.id))))}
}
export async function authorizeSource(env:Bindings,text:string,actor:AuditActor){
 const checked=validateSourceInput(exact(text,['kind','label','identifiers'],'discovery source')),id=crypto.randomUUID(),now=Date.now()
 const identifiers=JSON.stringify(checked.identifiers)
 if(await env.DB.prepare('SELECT 1 AS found FROM discovery_sources WHERE kind=? AND identifiers=?').bind(checked.kind,identifiers).first())throw refuse('That source is already authorized.')
 await env.DB.batch([mutationGuard(env,'(SELECT COUNT(*) FROM discovery_sources)<?',[SOURCE_LIMITS.sources]),
  env.DB.prepare("INSERT INTO discovery_sources(id,kind,label,identifiers,authorized_by,authorized_at,state) VALUES(?,?,?,?,?,?,'active')").bind(id,checked.kind,checked.label,identifiers,actor.ref,now),
  auditStatement(env,actor,'discovery_source_authorize','discovery_source',crypto.randomUUID(),'1',[],now)]).catch(error=>{if(classifyStorage(error)?.class==='guard_conflict')throw refuse(`An installation holds at most ${SOURCE_LIMITS.sources} discovery sources.`);throw error})
 return summary({id,kind:checked.kind,label:checked.label,identifiers:checked.identifiers,authorized_by:actor.ref,authorized_at:now,state:'active'},{latest:null,failed:null},null)
}
// A source restored from an archive is inactive until the receiving owner authorizes it again.
export async function reauthorizeSource(env:Bindings,id:string,actor:AuditActor){
 const row=await source(env,id),now=Date.now()
 if(row.state==='active')throw refuse('That source is already authorized.')
 await env.DB.batch([env.DB.prepare("UPDATE discovery_sources SET state='active',authorized_by=?,authorized_at=? WHERE id=? AND state='inactive'").bind(actor.ref,now,id),
  auditStatement(env,actor,'discovery_source_authorize','discovery_source',crypto.randomUUID(),'1',[],now)])
 return {id,state:'active',authorizedAt:now}
}
// Revoking removes the authorization with its runs and decisions. Monitors the owner adopted stay as they are.
export async function revokeSource(env:Bindings,id:string,actor:AuditActor){
 await source(env,id);const now=Date.now()
 await env.DB.batch([env.DB.prepare('DELETE FROM discovery_decisions WHERE source_id=?').bind(id),env.DB.prepare('DELETE FROM discovery_source_runs WHERE source_id=?').bind(id),
  env.DB.prepare("UPDATE discovery_jobs SET status='expired',finished_at=?,error='The source was revoked.' WHERE kind='source' AND json_extract(spec,'$.source')=? AND status IN ('queued','running')").bind(now,id),
  env.DB.prepare('DELETE FROM discovery_sources WHERE id=?').bind(id),auditStatement(env,actor,'discovery_source_revoke','discovery_source',crypto.randomUUID(),'1',[],now)])
 return {revoked:true}
}
export async function startSourceRun(env:Bindings,id:string,initiator:Access){
 const row=await source(env,id)
 if(row.state!=='active')throw refuse('This source came from an archive. Authorize it again before running it.')
 if(await pending(env,id))throw refuse('A run of this source is already waiting or running.')
 const {latest}=await latestRuns(env,id)
 return createSourceJob(env,runSpec(row,latest&&{...latest,result:JSON.stringify(latest.result)}),initiator)
}
export async function sourceDocument(env:Bindings,id:string){
 const row=await source(env,id),runs=await latestRuns(env,id),job=await pending(env,id)
 const base={source:summary(row,runs,job),review:null as any}
 if(!runs.latest)return base
 const [monitors,decisions,runners,others]=await Promise.all([
  env.DB.prepare('SELECT id,definition FROM monitors ORDER BY rowid').all<any>().then(r=>r.results.map(m=>({id:m.id,definition:JSON.parse(m.definition)}))),
  env.DB.prepare('SELECT * FROM discovery_decisions WHERE source_id=?').bind(id).all<any>().then(r=>new Map(r.results.map(d=>[d.candidate_key,d]))),
  env.DB.prepare('SELECT runner_id,network_label,revoked_at,last_contact_at FROM runners ORDER BY registered_at,runner_id').all<any>().then(r=>r.results),
  env.DB.prepare(`SELECT s.id,s.label,r.result FROM discovery_sources s JOIN discovery_source_runs r ON r.source_id=s.id AND r.status='done'
   AND r.started_at=(SELECT MAX(started_at) FROM discovery_source_runs x WHERE x.source_id=s.id AND x.status='done') WHERE s.id<>?`).bind(id).all<any>().then(r=>r.results.map(o=>({sourceId:o.id,label:o.label,candidates:JSON.parse(o.result).candidates})))])
 return {...base,review:proposalView({run:runs.latest,previous:runs.previous,monitors,decisions,runners,others})}
}
// The owner's review of one proposal from the latest run: rejected, or adopted as a monitor the owner already created through the
// monitor door from that proposal. A decision changes no monitor.
export async function decideProposal(env:Bindings,id:string,text:string,actor:AuditActor){
 const input=exact(text,['key','decision','monitorId'],'decision')
 if(typeof input.key!=='string'||!/^[a-z0-9-]{1,80}$/.test(input.key)||!['rejected','adopted'].includes(input.decision)||(input.decision==='adopted')!==(typeof input.monitorId==='string'))throw Error('Choose rejected, or adopted with the monitor it became.')
 await source(env,id);const {latest}=await latestRuns(env,id)
 const candidate=latest?.result.candidates.find((item:any)=>item.key===input.key)
 if(!candidate?.proposal)throw refuse('That proposal is not in the latest run.',404)
 if(input.decision==='adopted'){
  const monitor=await env.DB.prepare('SELECT definition FROM monitors WHERE id=?').bind(input.monitorId).first<any>()
  if(!monitor)throw refuse('That monitor was not found.',404)
  if(JSON.parse(monitor.definition).type!==candidate.proposal.definition.type)throw refuse('That monitor is not the check this proposal described.')
 }
 const now=Date.now()
 await env.DB.prepare(`INSERT INTO discovery_decisions(source_id,candidate_key,decision,monitor_id,run_id,decided_at,actor_id) VALUES(?,?,?,?,?,?,?)
  ON CONFLICT(source_id,candidate_key) DO UPDATE SET decision=excluded.decision,monitor_id=excluded.monitor_id,run_id=excluded.run_id,decided_at=excluded.decided_at,actor_id=excluded.actor_id`)
  .bind(id,input.key,input.decision,input.decision==='adopted'?input.monitorId:null,latest.id,now,actor.ref).run()
 return {key:input.key,decision:input.decision,decidedAt:now}
}
