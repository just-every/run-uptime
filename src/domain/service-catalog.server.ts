import {MONITOR_LIMIT,get,grants,revisionStatements,save,withinMonitorCap,type Bindings} from './control.server.ts'
import {assignDefinition} from './runner-registration.server.ts'
import {mutationGuard,type AuditActor} from './audit.server.ts'
// @ts-ignore Shared policy; edition JavaScript.
import {validateDefinition} from './policy.mjs'
// @ts-ignore Shared catalog data, search and definitions.
import {CATALOG_REVIEWED,CATALOG_VERSION,catalogEntry,definitionFor,publicEntry,searchCatalog,targetUrl,targetsFor} from './service-catalog/index.mjs'
// DEPENDENCY-002: the owner's door to the third-party service catalog. The catalog is data in the repository; the Worker
// never reads a provider. An owner follows an entry only after the owner's runner has read its status source live and
// reported that it answers with the shape the catalog expects (discovery.server.ts, kind catalog). A followed service is an
// ordinary dependency monitor saved through the monitor door's own revision statements, plus one row naming its catalog entry.
const CHECK_FRESH_MS=10*60_000
const refuse=(message:string,status=409)=>Object.assign(Error(message),{status})
const idShape=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
function exact(text:string,keys:string[],what:string){
 let input;try{input=JSON.parse(text)}catch{throw Error(`Invalid ${what}`)}
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!keys.includes(key)))throw Error(`Invalid ${what}`)
 return input as Record<string,any>
}
const PROBLEM_TEXT:Record<string,string>={unreachable:'did not answer',moved:'moved',shape:'no longer has the shape the catalog expects','too-large':'is larger than a check can read','component-missing':'no longer lists that component'}
const reviewText=(row:any)=>`The live check found the source ${PROBLEM_TEXT[row.problem]??'failing'}: ${row.detail}`
const viewOf=(entry:any,target:any)=>({scope:target.scope,key:target.component?.key??null,component:target.component?.name??null,region:target.component?.region??null})
type Followed={monitor_id:string;entry_id:string;catalog_version:number;scope:'whole'|'component';component_key:string|null;followed_at:number;checked_at:number|null}
function noticeView(row:any,ended:any,ack:any){
 const event=JSON.parse(row.event),end=ended?JSON.parse(ended):null
 return {id:row.id,monitorId:row.monitor_id,provider:event.dependency.provider,component:event.dependency.component,stated:event.dependency.stated,source:event.dependency.source,title:event.title,
  observedAt:event.observedAt,recoveredAt:end?.observedAt??null,state:end?'recovered':'open',acknowledgedAt:ack?.acknowledged_at??null,imported:row.status==='imported-inactive'}
}
export async function recentNotices(env:Bindings,limit=50){
 const rows=await env.DB.prepare(`SELECT o.id,o.monitor_id,o.event,o.status,(SELECT r.event FROM outbox r WHERE r.monitor_id=o.monitor_id AND r.kind='dependency_recovery' AND json_extract(r.event,'$.incidentKey')=json_extract(o.event,'$.incidentKey') ORDER BY r.rowid LIMIT 1) AS ended,a.acknowledged_at
  FROM outbox o LEFT JOIN dependency_acks a ON a.notice_id=o.id WHERE o.kind='dependency' ORDER BY o.rowid DESC LIMIT ?`).bind(limit).all<any>()
 return rows.results.map(row=>noticeView(row,row.ended,row))
}
// What the latest scheduled evidence of a followed monitor says about its source, without opening any provider.
async function sourceState(env:Bindings,monitorId:string){
 const rows=(await env.DB.prepare("SELECT o.evidence FROM observations o WHERE o.slot_id=(SELECT id FROM slots WHERE monitor_id=? AND manual=0 AND lease_owner<>'restored-inactive' AND EXISTS(SELECT 1 FROM observations x WHERE x.slot_id=slots.id) ORDER BY due_at DESC LIMIT 1) ORDER BY o.attempt DESC").bind(monitorId).all<{evidence:string}>()).results.map(row=>JSON.parse(row.evidence))
 if(!rows.length)return {state:'waiting',readable:true}
 if(rows.some(o=>o.checks?.some((c:any)=>c.assertion==='dependency')))return {state:'unknown',readable:false}
 return {state:rows.every(o=>o.outcome==='pass')?'operational':rows.some(o=>o.outcome==='target_failure')?'issue':'unknown',readable:true}
}
async function followedView(env:Bindings,row:Followed,reviews:Map<string,any>,links:Map<string,string[]>){
 const monitor=await get(env,row.monitor_id),entry=catalogEntry(row.entry_id),reasons:string[]=[]
 const target=entry&&(row.scope==='whole'?{scope:'whole'}:{scope:'component',component:entry.components.find((c:any)=>c.key===row.component_key)})
 if(!entry||(row.scope==='component'&&!(target as any).component))reasons.push('This service is no longer in the catalog.')
 else{
  if(row.catalog_version<CATALOG_VERSION)reasons.push(`Followed under catalog version ${row.catalog_version}; the catalog is now at version ${CATALOG_VERSION}.`)
  if(monitor&&monitor.definition.url!==targetUrl(entry,target))reasons.push('The catalog now names a different status source address.')
 }
 if(row.checked_at===null)reasons.push('Imported from another product, so its status source has not been checked live yet. Check it before enabling this monitor.')
 const review=reviews.get(row.entry_id);if(review)reasons.push(reviewText(review))
 const source=await sourceState(env,row.monitor_id)
 if(!source.readable)reasons.push('The status source stopped answering, moved or no longer has the expected shape, so the provider’s status is Unknown.')
 return {monitorId:row.monitor_id,name:monitor?.definition.name??'',entryId:row.entry_id,entryName:entry?.name??row.entry_id,scope:row.scope,component:entry&&row.scope==='component'?viewOf(entry,target).component:null,
  region:entry&&row.scope==='component'?viewOf(entry,target).region:null,catalogVersion:row.catalog_version,followedAt:row.followed_at,source:monitor?.definition.url??null,sourceState:source.state,
  review:{state:reasons.length?'needs_review':'ok',reasons},linked:links.get(row.monitor_id)??[]}
}
export async function catalogDocument(env:Bindings,query:string){
 const [reviewRows,followedRows,monitorRows,notices]=await Promise.all([
  env.DB.prepare('SELECT * FROM catalog_review').all<any>(),env.DB.prepare('SELECT * FROM followed_services ORDER BY followed_at,monitor_id').all<Followed>(),
  env.DB.prepare("SELECT id,definition FROM monitors ORDER BY rowid").all<any>(),recentNotices(env)])
 const reviews=new Map(reviewRows.results.map(row=>[row.entry_id,row])),links=new Map<string,string[]>(),definitions=monitorRows.results.map(row=>({id:row.id as string,definition:JSON.parse(row.definition)}))
 for(const row of definitions)for(const dependency of (row.definition.dependencies??[]) as string[])links.set(dependency,[...(links.get(dependency)??[]),row.id])
 // What a provider can be linked to: every monitor that is not itself a provider's, with its service and group.
 const linkable=definitions.filter(row=>!row.definition.tags?.includes('dependency')).map(row=>({id:row.id,name:row.definition.name,service:row.definition.service??null,group:row.definition.group??null}))
 const followed=await Promise.all(followedRows.results.map(row=>followedView(env,row,reviews,links)))
 const entries=searchCatalog(query).map((entry:any)=>({...publicEntry(entry),review:reviews.has(entry.id)?{state:'needs_review',problem:reviews.get(entry.id).problem,detail:reviews.get(entry.id).detail,checkedAt:reviews.get(entry.id).checked_at}:null,
  followed:followed.filter(item=>item.entryId===entry.id).map(item=>item.monitorId)}))
 return {version:CATALOG_VERSION,reviewed:CATALOG_REVIEWED,entries,followed,notices,monitors:linkable}
}
// The finished, passing live check an owner action relies on: the same entry parts, from this installation, in the last ten minutes.
async function passingCheck(env:Bindings,text:string){
 const input=exact(text,['check'],'follow request')
 if(typeof input.check!=='string'||!idShape.test(input.check))throw Error('Invalid follow request')
 const job=await env.DB.prepare("SELECT kind,spec,status,finished_at,result,error FROM discovery_jobs WHERE id=?").bind(input.check).first<any>()
 if(!job||job.kind!=='catalog')throw refuse('That status-source check was not found. Check the service again.',404)
 if(job.status!=='done')throw refuse(job.status==='failed'?`The check failed: ${job.error}`:'That check has not finished. Wait for it, then follow.')
 const result=JSON.parse(job.result)
 if(!result.ok)throw refuse(`This status source ${PROBLEM_TEXT[result.problem]}: ${result.detail} The catalog entry is marked needs review and nothing was followed.`)
 if(Date.now()-job.finished_at>CHECK_FRESH_MS)throw refuse('That check is older than ten minutes. Check the service again.')
 return {spec:JSON.parse(job.spec),result,checkedAt:job.finished_at as number}
}
export async function followServices(env:Bindings,text:string,actor:AuditActor){
 const {spec,result,checkedAt}=await passingCheck(env,text),entry=catalogEntry(spec.entry),targets=targetsFor(entry,spec),now=Date.now()
 for(const target of targets){
  const taken=await env.DB.prepare('SELECT 1 AS found FROM followed_services WHERE entry_id=? AND scope=? AND COALESCE(component_key,\'\')=?').bind(entry.id,target.scope,target.component?.key??'').first()
  if(taken)throw refuse(`${entry.name}${target.component?` ${target.component.name}`:''} is already followed.`)
 }
 if(Number((await env.DB.prepare('SELECT COUNT(*) n FROM monitors').first<any>())?.n)+targets.length>MONITOR_LIMIT)throw Error('Monitor limit reached')
 const statements:D1PreparedStatement[]=[],created:any[]=[]
 for(const [index,target] of targets.entries()){
  const definition=await assignDefinition(env,validateDefinition(definitionFor(entry,target,result.targets[index]),grants(env)),{}),key=crypto.randomUUID()
  statements.push(...(await revisionStatements(env,definition,null,key,now,actor)).statements,
   env.DB.prepare('INSERT INTO followed_services(monitor_id,entry_id,catalog_version,scope,component_key,followed_at,checked_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM monitors WHERE id=?)').bind(key,entry.id,CATALOG_VERSION,target.scope,target.component?.key??null,now,checkedAt,key))
  created.push({monitorId:key,name:definition.name,...viewOf(entry,target)})
 }
 await withinMonitorCap(env,targets.length,env.DB.batch(statements))
 return {followed:created,version:CATALOG_VERSION}
}
// The owner reviews a followed service after the catalog moved on or its source failed: the live check passes again, the
// monitor takes the catalog's current source and claim as an ordinary new revision, and the service records the new version.
export async function reviewFollowed(env:Bindings,id:string,text:string,actor:AuditActor){
 const row=await env.DB.prepare('SELECT * FROM followed_services WHERE monitor_id=?').bind(id).first<Followed>()
 if(!row)throw refuse('That followed service was not found.',404)
 const {spec,result,checkedAt}=await passingCheck(env,text),entry=catalogEntry(row.entry_id)
 if(!entry)throw refuse('This service is no longer in the catalog, so it cannot be reviewed. Stop following it.')
 const wanted=targetsFor(entry,spec)
 if(spec.entry!==row.entry_id||wanted.length!==1||wanted[0].scope!==row.scope||(wanted[0].component?.key??null)!==row.component_key)throw refuse('That check is for a different service.')
 const fresh=definitionFor(entry,wanted[0],result.targets[0]),old=await get(env,id)
 if(!old)throw refuse('That followed service was not found.',404)
 const saved=await save(env,{...old.definition,url:fresh.url,assertions:fresh.assertions,outcome:fresh.outcome,service:fresh.service,...(fresh.group?{group:fresh.group}:{})},id,actor)
 await env.DB.prepare('UPDATE followed_services SET catalog_version=?,checked_at=? WHERE monitor_id=?').bind(CATALOG_VERSION,checkedAt,id).run()
 return {monitorId:id,revision:saved!.revision,catalogVersion:CATALOG_VERSION}
}
// MONITOR-001's `dependencies` field is the owner link: it names the monitors a monitor depends on. Linking a followed service to a
// service or group saves each member as an ordinary new revision with the dependency added (or removed), so grouped acknowledgment
// (FOLLOWUP-001) never infers a link from timing alone.
export async function linkDependency(env:Bindings,id:string,text:string,actor:AuditActor){
 const input=exact(text,['kind','target','linked'],'link request')
 if(!['monitor','service','group'].includes(input.kind)||typeof input.target!=='string'||!input.target||input.target.length>512||typeof input.linked!=='boolean')throw Error('Choose a monitor, service or group, and whether to link it.')
 if(!await env.DB.prepare('SELECT 1 AS found FROM followed_services WHERE monitor_id=?').bind(id).first())throw refuse('That followed service was not found.',404)
 const rows=(await env.DB.prepare('SELECT id,definition FROM monitors ORDER BY rowid').all<any>()).results.map(row=>({id:row.id,definition:JSON.parse(row.definition)}))
 const followedIds=new Set((await env.DB.prepare('SELECT monitor_id FROM followed_services').all<any>()).results.map(row=>row.monitor_id))
 const members=rows.filter(row=>row.id!==id&&!followedIds.has(row.id)&&(input.kind==='monitor'?row.id===input.target:row.definition[input.kind]===input.target))
 if(!members.length)throw refuse(`No monitor matches that ${input.kind}.`,404)
 const changed:string[]=[]
 for(const member of members){
  const current:string[]=member.definition.dependencies??[],next=input.linked?[...new Set([...current,id])]:current.filter(item=>item!==id)
  if(next.length===current.length&&next.every((item,index)=>item===current[index]))continue
  await save(env,{...member.definition,dependencies:next},member.id,actor);changed.push(member.id)
 }
 return {linked:input.linked,changed,unchanged:members.length-changed.length}
}
export async function acknowledgeNotice(env:Bindings,id:string,actor:{id:string}){
 const row=await env.DB.prepare("SELECT id,monitor_id FROM outbox WHERE id=? AND kind='dependency' AND status<>'imported-inactive'").bind(id).first<any>()
 if(!row)throw refuse('That dependency notice was not found.',404)
 const now=Date.now()
 await env.DB.batch([mutationGuard(env,"EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND role='owner' AND status='active')",[actor.id]),
  env.DB.prepare('INSERT OR IGNORE INTO dependency_acks(notice_id,monitor_id,acknowledged_at,actor_id,via_incident_id) VALUES(?,?,?,?,NULL)').bind(row.id,row.monitor_id,now,actor.id)])
 return {acknowledged:true}
}
