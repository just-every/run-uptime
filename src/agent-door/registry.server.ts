import {assertCiFile} from '../domain/ci/scope.server.ts'
import {createDiscovery,claimAdmittedDiscovery} from '../domain/discovery.server.ts'
import {assignment,mayAssign,assignments} from '../domain/access-members.server.ts'
// @ts-ignore Shared native role ceiling.
import {baseRole} from '../domain/role-permissions.mjs'
import {updateDestination,destinations} from '../domain/notification-destinations.server.ts'
import {testDestination} from '../domain/notifications.server.ts'
import {startDrill} from '../domain/alert-drills.server.ts'
import {mutationGuard} from '../domain/audit.server.ts'
import {delegation} from './work.server.ts'
import {claimAdmittedAttempt} from '../domain/attempts.server.ts'
import {nativeProof} from './proof.server.ts'
import {requestNeedsStepUp} from '../domain/mfa/policy.server.ts'
import {operatorAuth} from '../domain/operator-auth.server.ts'
import {erase} from '../domain/erasure.server.ts'
import {recogniseFile,exportDefinitions} from '../domain/definitions/index.server.ts'
import {ToolRefusal,type ToolDefinition,type ToolContext,type ClassAndFacts,type ClassId,type JsonSchemaObject} from '../base/modules/agent-door/index.ts'
import type {Bindings} from '../domain/control.server.ts'
import {save,get,sha} from '../domain/control.server.ts'
import {authorizedDatabase} from '../domain/access-database.server.ts'
import {incidentAction} from '../domain/incident-work/actions.server.ts'
import {addComment} from '../domain/incident-work/comments.server.ts'
import {findIncident} from '../domain/incident-work/common.server.ts'
import {applyMaintenance,previewMaintenance} from '../domain/planned-maintenance.server.ts'
import {applyAlertRoute,previewAlertRoute,prepareAlertRouteAssignment} from '../domain/alert-routes.server.ts'
import {saveEvidenceAccess} from '../domain/failure-evidence-access.server.ts'
import {authority,unavailable} from './authority.server.ts'
import * as reads from './reads.server.ts'
const string={type:'string',minLength:1,maxLength:512},integer={type:'integer',minimum:0}
const schema=(properties:Record<string,any>,required=Object.keys(properties)):JsonSchemaObject=>({type:'object',properties,required,additionalProperties:false})
const idSchema=schema({id:string})
const facts=(cls:ClassId,extra:object={}):ClassAndFacts=>({class:cls,facts:{measure:1,...extra}})
export const notTools=[{clauses:['PRIVATE-001'],reason:'device' as const},{clauses:['IMPORT-001','CODE-001'],reason:'import-door' as const},{clauses:['API-004'],reason:'screen' as const}]
const actor=(ctx:ToolContext)=>({kind:'feature' as const,ref:ctx.actor.label,delegation:delegation(ctx)})
async function current(env:Bindings,ctx:ToolContext,id:string){await authority(env,ctx,'read',[id]);const row=await get(env,id);if(!row)throw unavailable();return row}
function safeCall(run:(a:any,c:ToolContext)=>Promise<any>){return async(a:Record<string,unknown>,c:ToolContext)=>{try{return {result:await run(a,c)}}catch(error){if(error instanceof ToolRefusal)throw error;const e=error as Error&{status?:number};throw new ToolRefusal(e.status===409?'revision_conflict':e.status===404?'not_found':e.status===403?'native_permission_required':'native_operation_refused')}}}
function summaryItems(value:any,prefix=''):string[]{
 if(Array.isArray(value))return value.flatMap((item,index)=>summaryItems(item,`${prefix} ${index+1}`))
 if(value&&typeof value==='object')return Object.keys(value).sort().filter(key=>!['id','version','proof_reference'].includes(key)).flatMap(key=>summaryItems(value[key],[prefix,key.replaceAll('_',' ')].filter(Boolean).join(' / ')))
 return [`${prefix}: ${value===null?'none':String(value)}`]
}
async function actionSummary(env:Bindings,verb:string,title:string,a:any){
 let name=title;const items=[title,...summaryItems(a)];let recipients:string[]|undefined
 if(typeof a.id==='string'){
  if(verb.startsWith('destinations.')){const target=await env.DB.prepare('SELECT name,kind,credential_id FROM notification_destinations WHERE id=? AND deleted_at IS NULL').bind(a.id).first<any>();if(target){name=target.name;items.push('Saved destination version: '+target.credential_id);recipients=[target.kind+' destination: '+target.name]}}
  else if(verb.startsWith('access.')){const target=await env.DB.prepare('SELECT display_name FROM oa_operators WHERE id=?').bind(a.id).first<any>();if(target)name=target.display_name}
  else if(verb.startsWith('incidents.')){const incident=await findIncident(env,a.id);name='Incident for '+(await get(env,incident.monitor_id))?.definition.name}
  else {const m=await get(env,a.id);if(m){name=m.definition.name;items.push('Current monitor revision: '+m.revision)}}
 }
 if(a.definition?.name)name=a.definition.name
 if(a.monitorIds)for(const id of a.monitorIds){const m=await get(env,id);items.push('Selected monitor: '+(m?.definition.name??id))}
 return {target:{id:typeof a.id==='string'?a.id:undefined,name},items,...(recipients?{recipients}:{}),...(a.role?{role:a.role}:{})}
}
// Resolve audit identity through the same native visibility checks as execution.
async function recordTarget(env:Bindings,name:string,args:Record<string,unknown>,ctx:ToolContext){
 if(typeof args.id!=='string')return null
 const id=args.id
 if(name.startsWith('incidents.')){await reads.incidentRead(env,ctx,id);return {kind:'incident',id}}
 if(name.startsWith('destinations.')){const record=await reads.destinationRead(env,ctx,id);return {kind:'destination',id:record.id}}
 if(name.startsWith('discovery.')){const record=await reads.discoveryRead(env,ctx,id);return {kind:'discovery',id:record.id}}
 if(name.startsWith('access.')){
  await authority(env,ctx,'members',[],undefined,true)
  const record=await env.DB.prepare('SELECT id FROM oa_operators WHERE id=?').bind(id).first<{id:string}>()
  if(!record)throw unavailable()
  return {kind:'operator',id:record.id}
 }
 const record=await current(env,ctx,id)
 return {kind:'monitor',id:record.id}
}
export function tools(env:Bindings):ToolDefinition[]{
 const definitions:ToolDefinition[]=[]
 function read(name:string,title:string,input:JsonSchemaObject,clauses:string[],run:(a:any,c:ToolContext)=>Promise<any>,classes:ClassId[]=['standard']){
  definitions.push({name:'uptime.'+name,title,description:title+'. Uses current native role, scope and redacted records.',scope:name==='definitions.preview'?'definitions:preview':classes.includes('sensitive')?'uptime:evidence':'uptime:read',readOnly:true,inputSchema:input,outputSchema:{type:'object'},classes,clauses,untrusted:true,target:(a,c)=>recordTarget(env,name,a,c),classify:async(a,c)=>{await run(a,c);return classes.map(cls=>facts(cls,cls==='sensitive'?{kind:'failure-evidence'}:{}))},run:safeCall(run)})
 }
 read('monitors.list','List visible monitors',schema({}),['READAPI-001'],(_,c)=>reads.monitorList(env,c))
 read('monitors.read','Read one monitor',idSchema,['READAPI-001'],(a,c)=>reads.monitorRead(env,c,a.id))
 read('monitors.history','Read immutable check observations',idSchema,['READAPI-001'],(a,c)=>reads.historyRead(env,c,a.id))
 read('monitors.revisions','Read immutable monitor revisions',idSchema,['MONITOR-001'],(a,c)=>reads.revisionRead(env,c,a.id))
 read('incidents.read','Read incident coordination',idSchema,['FOLLOWUP-001'],(a,c)=>reads.incidentRead(env,c,a.id))
 read('reports.read','Read monitor availability report',schema({id:string,period:{type:'string',enum:['24h','7d','30d']}},['id']),['READAPI-001'],(a,c)=>reads.reportRead(env,c,a.id,a.period?{period:a.period}:{}))
 read('evidence.read','Read authorized private failure snapshots',idSchema,['EVIDENCE-001'],(a,c)=>reads.evidenceRead(env,c,a.id),['sensitive'])
 read('maintenance.read','Read a monitor maintenance calendar',idSchema,['MAINT-001'],async(a,c)=>({id:a.id,windows:(await current(env,c,a.id)).definition.maintenanceWindows??[]}))
 read('routes.read','Read monitor alert routing',idSchema,['ROUTING-001'],(a,c)=>reads.routeRead(env,c,a.id))
 read('destinations.read','Read destination metadata without endpoint secrets',idSchema,['DELIVERY-001'],(a,c)=>reads.destinationRead(env,c,a.id))
 read('grants.read','Read native effect and evidence grants',idSchema,['API-004'],(a,c)=>reads.grantsRead(env,c,a.id))
 read('discovery.read','Read a native discovery outcome',idSchema,['DISCOVERY-001'],(a,c)=>reads.discoveryRead(env,c,a.id))
 read('evidence.witness','Read native monitoring change witness',schema({}),['MONITOR-001','FOLLOWUP-001'],(_,c)=>reads.witnessRead(env,c))
 function mutation(name:string,title:string,input:JsonSchemaObject,classes:ClassId[],clauses:string[],run:(a:any,c:ToolContext)=>Promise<any>,classify:ToolDefinition['classify'],revision?:ToolDefinition['revision']){
  input={...input,properties:{...input.properties,proof_reference:{type:'string',maxLength:512}}}
  const guarded=async(a:any,c:ToolContext)=>{const {proof_reference,...args}=a;let execution=c;
   if(name.startsWith('monitors.')){const old=args.id?await get(env,args.id):null,next={...(old?.definition??{}),...(args.definition??{})};if(requestNeedsStepUp(new Request(new URL('/api/monitors/'+(args.id??''),c.origin),{method:'PATCH'}),next)){
    if(typeof proof_reference!=='string'||!await nativeProof(env).verify({kind:'step_up',tool:'uptime.'+name,args,principal:{person:c.person,agent:c.agent,scopes:[...c.scopes],clientId:c.clientId},reference:proof_reference}))throw new ToolRefusal('native_proof_required','Complete native step-up',{kind:'step_up',handoff:new URL('/app/settings',c.origin).href});execution={...c,nativeProof:{kind:'step_up',reference:proof_reference}}
   }}return run(args,execution)}
  const tool:ToolDefinition={name:'uptime.'+name,title,description:title+'. Native validation and immutable revisions remain authoritative.',scope:'uptime:operate',readOnly:false,inputSchema:input,outputSchema:{type:'object'},classes,clauses,target:(a,c)=>recordTarget(env,name,a,c),classify,run:safeCall(guarded),summary:async(a)=>actionSummary(env,name,title,a),...(revision?{revision}:{})};definitions.push(tool);return tool
 }


 mutation('checks.run','Queue a real manual check without changing scheduled health',schema({id:string,version:integer}),['external'],['HTTP-001','INCIDENT-001'],async(a,c)=>{const m=await current(env,c,a.id);if(!m.definition.enabled||m.revision!==a.version)throw new ToolRefusal('revision_conflict');const access=await authority(env,c,'respond',[a.id]),db=authorizedDatabase(env,access),id=`${m.id}:${m.revision}:manual:${crypto.randomUUID()}`;await db.batch([mutationGuard(env,"EXISTS(SELECT 1 FROM monitors WHERE id=? AND revision=? AND json_extract(definition,'$.enabled')=1)",[m.id,a.version]),env.DB.prepare("INSERT INTO slots(id,monitor_id,revision,due_at,status,definition,lease_owner,lease_until,missed_count,manual) VALUES(?,?,?,?,'queued',?,'unclaimed',0,0,1)").bind(id,m.id,m.revision,Date.now(),JSON.stringify(m.definition)),env.DB.prepare('INSERT INTO uptime_agent_manual(slot_id,principal) VALUES(?,?)').bind(id,JSON.stringify(delegation(c)))]);c.emit('monitor.check.queued',`uptime://monitors/${m.id}`);return {queued:true,slotId:id,policyAdvanced:false}},async(a,c)=>{const m=await current(env,c,String(a.id));await authority(env,c,'respond',[String(a.id)]);return [facts('external',{measure:m.definition.probes.length,counterparty:m.definition.network==='public'?'public':'known'})]})
 const dispatch=mutation('checks.dispatch','Admit a native runner request at its final boundary',schema({id:string,version:integer,runner_id:string,handoff_id:string}),['external'],['NETWORK-001','PRIVATE-001'],async(a,c)=>{
  if(c.door!=='embedded')throw new ToolRefusal('runner_protocol_required')
  const m=await current(env,c,a.id);if(m.revision!==a.version)throw new ToolRefusal('revision_conflict')
  const access=await authority(env,c,'respond',[a.id]);const task=await claimAdmittedAttempt({...env,DB:authorizedDatabase(env,access,()=>[mutationGuard(env,'EXISTS(SELECT 1 FROM monitors WHERE id=? AND revision=?)',[a.id,a.version])])},a.runner_id,{monitorId:a.id});return {task}
 },async(a,c)=>{const m=await current(env,c,String(a.id));await authority(env,c,'respond',[String(a.id)]);return [facts('external',{measure:m.definition.probes.length,counterparty:m.definition.network==='public'?'public':'known'})]})
 dispatch.continuationItem=async(a,c)=>{
  await current(env,c,String(a.id))
  const row=await env.DB.prepare('SELECT id,principal FROM uptime_agent_handoffs WHERE id=? AND monitor_id=? AND revision=? AND runner_id=?').bind(a.handoff_id,a.id,a.version,a.runner_id).first<{id:string;principal:string}>()
  const saved=row?JSON.parse(row.principal):null
  return row&&saved?.operationId?{id:row.id,operationId:saved.operationId}:null
 }
 const monitorRevision=async(a:any,c:ToolContext)=>(await current(env,c,a.id)).revision
 const monitorRisk=async(a:any,c:ToolContext)=>{
  const before=a.id?(await current(env,c,a.id)).definition:null,next={...(before??{}),...(a.definition as object??{})}
  const access=await authority(env,c,'check_write',a.id?[a.id]:[],next,!a.id)
  const risks:ClassAndFacts[]=[facts('live',{service:next.service??'monitoring'})]
  if(next.type!=='heartbeat'&&next.enabled!==false&&(!before||next.url!==before.url||JSON.stringify(next.probes)!==JSON.stringify(before.probes)||next.intervalMs!==before.intervalMs))risks.push(facts('external',{counterparty:'public'}))
  if((next.network&&next.network!=='public'&&next.network!==before?.network)||next.privateGrantRef!==before?.privateGrantRef||next.request?.credentialRef!==before?.request?.credentialRef||JSON.stringify(next.tlsTrust)!==JSON.stringify(before?.tlsTrust))risks.push(facts('security',{setting:'monitor-request-authority'}))
  return risks
 }
 mutation('monitors.create','Create a native monitor',schema({definition:{type:'object'}}),['live','external','security'],['MONITOR-001'],async(a,c)=>{const access=await authority(env,c,'check_write',[],a.definition,true);const result=await save({...env,DB:authorizedDatabase(env,access)},a.definition,undefined,actor(c));c.emit('monitor.created',`uptime://monitors/${result!.id}`);return reads.monitorRead(env,c,result!.id)},monitorRisk).authority=async(a)=>({subject:'monitor:new',widens:Boolean((a.definition as any)?.privateGrantRef||(a.definition as any)?.request?.credentialRef)})
 const monitorSchema=schema({id:string,version:integer,definition:{type:'object',minProperties:1}})
 const update=mutation('monitors.update','Update a native monitor definition',monitorSchema,['live','external','security'],['MONITOR-001'],async(a,c)=>{
  const old=await current(env,c,a.id),next={...old.definition,...a.definition},access=await authority(env,c,'check_write',[a.id],next),db=authorizedDatabase(env,access)
  // The exact native revision is also fenced in save's transaction.
  const result=await save({...env,DB:db},next,a.id,actor(c),a.version);c.emit('monitor.updated',`uptime://monitors/${a.id}`,{revision:result!.revision});return reads.monitorRead(env,c,a.id)
 },monitorRisk,monitorRevision)
 update.authority=async(a,c)=>{const old=(await current(env,c,String(a.id))).definition,next={...old,...a.definition as object};return {subject:`monitor:${a.id}`,widens:next.network!==old.network||next.privateGrantRef!==old.privateGrantRef||JSON.stringify(next.request)!==JSON.stringify(old.request)||JSON.stringify(next.tlsTrust)!==JSON.stringify(old.tlsTrust)}}
 for(const [verb,enabled] of [['pause',false],['resume',true]] as const)mutation('monitors.'+verb,(enabled?'Resume':'Pause')+' native monitor scheduling',schema({id:string,version:integer}),['live'],['MONITOR-001'],async(a,c)=>{const old=await current(env,c,a.id),access=await authority(env,c,'check_write',[a.id],old.definition);const result=await save({...env,DB:authorizedDatabase(env,access)},{...old.definition,enabled},a.id,actor(c),a.version);c.emit('monitor.updated',`uptime://monitors/${a.id}`,{revision:result!.revision});return reads.monitorRead(env,c,a.id)},async(a,c)=>{const old=await current(env,c,String(a.id));await authority(env,c,'check_write',[String(a.id)],old.definition);return [facts('live',{service:old.definition.service??'monitoring'})]},monitorRevision)
 const incidentVersion=async(a:any,c:ToolContext)=>{const read=await reads.incidentRead(env,c,a.id);return read.version}
 for(const kind of ['assign','acknowledge'] as const)mutation('incidents.'+kind,kind==='assign'?'Assign an eligible native responder':'Acknowledge an incident without asserting recovery',schema({id:string,version:integer,...(kind==='assign'?{owner_id:{type:['string','null']}}:{})}),['standard'],['FOLLOWUP-001'],async(a,c)=>{
  const incident=await findIncident(env,a.id),access=await authority(env,c,'respond',[incident.monitor_id]);if(access.kind==='credential')throw new ToolRefusal('insufficient_scope')
  const version=a.version,native={id:c.person.id,displayName:c.person.name,access,preparedBy:c.actor,approvers:c.approvers.map(person=>({...person}))}
  const result=await incidentAction({...env,DB:authorizedDatabase(env,access)},a.id,{kind,version,...(kind==='assign'?{ownerId:a.owner_id}:{})},native)
  c.emit('incident.updated',`uptime://incidents/${a.id}`,{version:result.version});return {id:a.id,...result}
 },async(a,c)=>{const incident=await findIncident(env,String(a.id));await authority(env,c,'respond',[incident.monitor_id]);return [facts('standard')]},incidentVersion)
 mutation('incidents.note','Add an internal incident note',schema({id:string,text:{type:'string',minLength:1,maxLength:5000}}),['standard'],['FOLLOWUP-001'],async(a,c)=>{const incident=await findIncident(env,a.id),access=await authority(env,c,'respond',[incident.monitor_id]);if(access.kind==='credential')throw new ToolRefusal('insufficient_scope');const result=await addComment({...env,DB:authorizedDatabase(env,access)},a.id,{text:a.text,mentions:[]},{id:c.person.id,displayName:c.person.name,access,preparedBy:c.actor,approvers:c.approvers.map(person=>({...person}))});c.emit('incident.updated',`uptime://incidents/${a.id}`);return {incidentId:a.id,...result}},async(a,c)=>{const i=await findIncident(env,String(a.id));await authority(env,c,'respond',[i.monitor_id]);return [facts('standard')]})
 mutation('maintenance.preview','Preview an exact native maintenance selection',schema({monitorIds:{type:'array',items:string,minItems:1,maxItems:100},window:{type:'object'}}),['standard'],['MAINT-001'],async(a,c)=>{await authority(env,c,'maintenance_write',a.monitorIds);return previewMaintenance(env,a)},async(a,c)=>{await authority(env,c,'maintenance_write',a.monitorIds as string[]);return [facts('standard')]})
 mutation('maintenance.update','Apply the exact previewed maintenance calendar',schema({monitorIds:{type:'array',items:string,minItems:1,maxItems:100},window:{type:'object'},digest:string}),['live'],['MAINT-001'],async(a,c)=>{const access=await authority(env,c,'maintenance_write',a.monitorIds);const {digest,...input}=a;const result=await applyMaintenance({...env,DB:authorizedDatabase(env,access)},input,digest,actor(c));for(const id of a.monitorIds)c.emit('monitor.updated',`uptime://monitors/${id}`);return result},async(a,c)=>{await authority(env,c,'maintenance_write',a.monitorIds as string[]);return [facts('live',{service:'monitoring-maintenance'})]})
 mutation('routes.preview','Preview a native alert route',schema({id:string,route:{type:'object'}}),['standard'],['ROUTING-001'],async(a,c)=>{await authority(env,c,'route_write',[a.id],undefined,true);const {monitor,snapshot,...view}=await prepareAlertRouteAssignment(env,a.id,a.route);return view},async(a,c)=>{await authority(env,c,'route_write',[String(a.id)],undefined,true);return [facts('standard')]})
 const route=mutation('routes.update','Apply an exact native alert-route preview',schema({id:string,route:{type:'object'},digest:string}),['live','external','access'],['ROUTING-001'],async(a,c)=>{const access=await authority(env,c,'route_write',[a.id],undefined,true);const result=await applyAlertRoute({...env,DB:authorizedDatabase(env,access)},a.id,{...a.route,digest:a.digest},actor(c));c.emit('route.updated',`uptime://routes/${a.id}`);return result},async(a,c)=>{await authority(env,c,'route_write',[String(a.id)],undefined,true);const p=await prepareAlertRouteAssignment(env,String(a.id),a.route);return [facts('live',{service:'alert-routing'}),facts('external',{measure:(p as any).readyCount??0,counterparty:'known'}),facts('access',{direction:'widens'})]})
 route.authority=async(a,c)=>{await authority(env,c,'route_write',[String(a.id)],undefined,true);return {subject:`route:${a.id}`,widens:true}}
 const grant=mutation('grants.update','Change a native private-evidence viewer grant',schema({id:string,operator_id:string,granted:{type:'boolean'}}),['access','security'],['EVIDENCE-001'],async(a,c)=>{const access=await authority(env,c,'secret_write',[a.id],undefined,true);const result=await saveEvidenceAccess({...env,DB:authorizedDatabase(env,access)},a.id,{operatorId:a.operator_id,granted:a.granted},actor(c));c.emit('monitor.updated',`uptime://monitors/${a.id}`);return result},async(a,c)=>{await authority(env,c,'secret_write',[String(a.id)],undefined,true);return [facts('access',{direction:a.granted?'widens':'narrows'}),facts('security',{setting:'failure-evidence-grant'})]})
 grant.proof='native';grant.proofKind='step_up'
 grant.authority=async(a)=>({subject:String(a.operator_id),widens:a.granted===true})

 read('definitions.read','Read redacted native definitions',schema({}),['CODE-001'],async(_,c)=>{await authority(env,c,'export',[],undefined,true);return {monitors:(await reads.monitorList(env,c)).items}})
 read('definitions.preview','Recognize a native definition file without applying it',schema({text:{type:'string',maxLength:2097152}}),['CODE-001'],async(a,c)=>{const access=await authority(env,c,'read');if(access.kind==='credential'){if(!access.tokenScopes.includes('definitions:preview'))throw new ToolRefusal('insufficient_scope');await assertCiFile(env,access,a.text)}return recogniseFile(a.text,'uptime.monitors')})
 const privacy=mutation('privacy.erase','Erase a native monitor and dependent records',schema({id:string,confirmation:string}),['destructive'],['ERASURE-001'],async(a,c)=>{const access=await authority(env,c,'owner',[a.id],undefined,true);const result=await erase({...env,DB:authorizedDatabase(env,access)},'monitor',a.id,actor(c),a.confirmation);c.emit('monitor.erased',`uptime://monitors/${a.id}`);return result},async(a,c)=>{await authority(env,c,'owner',[String(a.id)],undefined,true);return [facts('destructive')]},monitorRevision)
 privacy.proof='native';privacy.proofKind='step_up'

 const destination=mutation('destinations.update','Update a native notification destination',schema({id:string,destination:schema({name:{type:'string',minLength:1,maxLength:100},enabled:{type:'boolean'}})}),['live','access'],['NOTIFY-001'],async(a,c)=>{const access=await authority(env,c,'secret_write',[],undefined,true);const result=await updateDestination({...env,DB:authorizedDatabase(env,access)},a.id,a.destination,actor(c));c.emit('destination.updated',`uptime://destinations/${a.id}`);const {signingSecret,...safe}=result as any;return safe},async(a,c)=>{await reads.destinationRead(env,c,String(a.id));return [facts('live',{service:'alert-delivery'}),facts('access',{direction:(a.destination as any)?.enabled?'widens':'narrows'})]})
 destination.authority=async(a)=>({subject:`destination:${a.id}`,widens:Boolean((a.destination as any)?.enabled||(a.destination as any)?.address||(a.destination as any)?.url)});destination.proof='native';destination.proofKind='step_up'
 for(const verb of ['test','drill'] as const)mutation('destinations.'+verb,verb==='test'?'Queue an attributed native test send':'Queue a native recipient-confirmed channel drill',idSchema,['external'],[verb==='test'?'NOTIFY-001':'DRILL-001'],async(a,c)=>{const access=await authority(env,c,'secret_write',[],undefined,true),native={...env,DB:authorizedDatabase(env,access)},result=verb==='test'?await testDestination(native,a.id,delegation(c)):await startDrill(native,a.id,c.person.id,delegation(c));c.emit('destination.test.queued',`uptime://destinations/${a.id}`);return result},async(a,c)=>{await reads.destinationRead(env,c,String(a.id));return [facts('external',{counterparty:'known'})]})
 const notification=mutation('destinations.dispatch','Admit an existing native notification at its transport boundary',schema({id:string,delivery_id:string,credential_id:string}),['external'],['DELIVERY-001','NOTIFY-001'],async(a,c)=>{if(c.door!=='embedded')throw new ToolRefusal('runner_protocol_required');await reads.destinationRead(env,c,a.id);const job=await env.DB.prepare('SELECT 1 FROM notification_jobs WHERE id=? AND destination_id=? AND credential_id=?').bind(a.delivery_id,a.id,a.credential_id).first();if(!job)throw unavailable();return {admitted:true}},async(a,c)=>{await reads.destinationRead(env,c,String(a.id));return [facts('external',{counterparty:'known'})]})
 notification.continuationItem=async(a,c)=>{
  await reads.destinationRead(env,c,String(a.id))
  const row=await env.DB.prepare('SELECT n.delivery_id,n.principal FROM uptime_agent_notifications n JOIN notification_jobs j ON j.id=n.delivery_id WHERE n.delivery_id=? AND j.destination_id=? AND j.credential_id=?').bind(a.delivery_id,a.id,a.credential_id).first<{delivery_id:string;principal:string}>()
  const saved=row?JSON.parse(row.principal):null
  return row&&saved?.operationId?{id:row.delivery_id,operationId:saved.operationId}:null
 }

 const memberSchema=schema({id:string,version:integer,role:{type:'string',enum:['admin','editor','responder','read-only']},scopes:{type:'array',maxItems:30,items:{type:'object',properties:{kind:{type:'string',enum:['service','team']},value:string},required:['kind','value'],additionalProperties:false}}})
 const memberChange=async(a:any)=>{const target=await env.DB.prepare('SELECT o.id,o.role,o.version,r.role product_role,r.revision FROM oa_operators o JOIN uptime_member_roles r ON r.operator_id=o.id WHERE o.id=?').bind(a.id).first<any>();if(!target)throw unavailable();const scopes=(await env.DB.prepare('SELECT kind,value FROM uptime_member_scopes WHERE operator_id=? ORDER BY kind,value').bind(a.id).all<any>()).results;const rank:any={owner:5,admin:4,editor:3,responder:2,'read-only':1};const widens=rank[a.role]>rank[target.product_role]||['service','team'].some(kind=>{const before=scopes.filter(s=>s.kind===kind).map(s=>s.value),after=a.scopes.filter((s:any)=>s.kind===kind).map((s:any)=>s.value);return before.length>0&&(!after.length||after.some((v:string)=>!before.includes(v)))});return {target,widens}}
 const members=mutation('access.update','Change a native member product role and service/team scopes',memberSchema,['access'],['ACCESS-001'],async(a,c)=>{const access=await authority(env,c,'members',[],undefined,true);if(access.kind==='credential')throw new ToolRefusal('insufficient_scope');const {target}=await memberChange(a),value=assignment({role:a.role,scopes:a.scopes});mayAssign(access,value,target);if(a.id===c.person.id)throw new ToolRefusal('another_administrator_required');if(target.revision!==a.version)throw new ToolRefusal('revision_conflict');
  const extra=(statements:{sql:string;values:any[]}[])=>statements.some(s=>s.sql.startsWith('UPDATE oa_operators SET role='))?assignments(env,'id=?',[a.id],value):[];
  const configured={...env,DB:authorizedDatabase(env,access,extra)};
  if(target.role!==baseRole(a.role))await operatorAuth(configured).delegatedAdministration({personId:c.person.id,auditLabel:c.actor.label,agentId:c.agent.id}).setRole(a.id,baseRole(a.role));
  else await authorizedDatabase(env,access).batch([mutationGuard(env,'EXISTS(SELECT 1 FROM oa_operators o JOIN uptime_member_roles r ON r.operator_id=o.id WHERE o.id=? AND o.version=? AND r.revision=?)',[a.id,target.version,a.version]),...assignments(env,'id=?',[a.id],value)]);
  return {id:a.id,role:a.role,scopes:a.scopes}
 },async(a,c)=>{await authority(env,c,'members',[],undefined,true);return [facts('access',{direction:(await memberChange(a)).widens?'widens':'narrows'})]},async(a)=>{const row=await env.DB.prepare('SELECT revision FROM uptime_member_roles WHERE operator_id=?').bind(a.id).first<{revision:number}>();return row?.revision??null})
 members.authority=async(a)=>({subject:String(a.id),widens:(await memberChange(a)).widens});members.proof='native';members.proofKind='step_up'

 mutation('discovery.start','Start bounded native read-only website discovery',schema({url:{type:'string',minLength:1,maxLength:2048}}),['external'],['DISCOVERY-001'],async(a,c)=>{const access=await authority(env,c,'discovery_write',[],undefined,true);if(access.kind==='credential')throw new ToolRefusal('insufficient_scope');const db=authorizedDatabase(env,access,statements=>statements.filter(s=>s.sql.startsWith('INSERT INTO discovery_jobs')).map(s=>env.DB.prepare('INSERT INTO uptime_agent_discoveries(id,principal) SELECT id,? FROM discovery_jobs WHERE id=?').bind(JSON.stringify(delegation(c)),s.values[0])));const result=await createDiscovery({...env,DB:db},JSON.stringify({url:a.url}),access);c.emit('discovery.created',`uptime://discoveries/${result.id}`);return result},async(_,c)=>{await authority(env,c,'discovery_write',[],undefined,true);return [facts('external',{counterparty:'public'})]})
 const discovery=mutation('discovery.dispatch','Admit native discovery to its authenticated runner',schema({id:string,runner_id:string}),['external'],['DISCOVERY-001'],async(a,c)=>{if(c.door!=='embedded')throw new ToolRefusal('runner_protocol_required');const access=await authority(env,c,'discovery_write',[],undefined,true);return claimAdmittedDiscovery({...env,DB:authorizedDatabase(env,access)},a.id,a.runner_id)},async(a,c)=>{await reads.discoveryRead(env,c,String(a.id));return [facts('external',{counterparty:'public'})]})
 discovery.continuationItem=async(a,c)=>{
  await reads.discoveryRead(env,c,String(a.id))
  const row=await env.DB.prepare('SELECT id,principal FROM uptime_agent_discoveries WHERE id=?').bind(a.id).first<{id:string;principal:string}>()
  const saved=row?JSON.parse(row.principal):null
  return row&&saved?.operationId?{id:row.id,operationId:saved.operationId}:null
 }
 return definitions.sort((a,b)=>a.name.localeCompare(b.name))
}
