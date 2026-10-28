import {ToolRefusal,type ToolDefinition,type ToolContext,type ClassAndFacts,type ClassId,type ApprovalSummary} from '../../base/modules/agent-door/index.ts'
import {get,save,revisions,type Bindings} from '../control.server.ts'
import {authorizedDatabase} from '../access-database.server.ts'
import {mutationGuard,type AuditActor} from '../audit.server.ts'
import {incidentAction} from '../incident-work/actions.server.ts'
import {addComment} from '../incident-work/comments.server.ts'
import {findIncident} from '../incident-work/common.server.ts'
import {monitorReport} from '../reports/index.server.ts'
import {readAlertRoute,prepareAlertRouteAssignment,applyAlertRoute} from '../alert-routes.server.ts'
import {previewMaintenance,applyMaintenance} from '../planned-maintenance.server.ts'
import {saveEvidenceAccess,evidenceAccess as readEvidenceAccess} from '../failure-evidence-access.server.ts'
import {exportDefinitions} from '../definitions/index.server.ts'
import {recogniseFile} from '../definitions/index.server.ts'
import {projection,monitor,monitorHistory,witness,definition} from './projections.server.ts'
import {agentAccess,visibleIds,evidenceAccess,denied,type AgentAccess} from './authority.server.ts'
import {requestNeedsStepUp} from '../mfa/policy.server.ts'

type Args=Record<string,any>
const id={type:'string',minLength:1,maxLength:512},obj={type:'object',additionalProperties:true}
const input=(properties:Record<string,any>,required=Object.keys(properties))=>({type:'object' as const,properties,required,additionalProperties:false})
const standard=():ClassAndFacts[]=>[{class:'standard',facts:{measure:1}}]
const actor=(c:ToolContext):AuditActor=>({kind:'feature',ref:`agent:${c.agent.id}`,preparedBy:c.actor,approvers:c.approvers})
const native=(env:Bindings,a:AgentAccess)=>({...env,DB:authorizedDatabase(env,a)})
const link=(area:string,id:string)=>({uri:`uptime://${area}/${encodeURIComponent(id)}`,name:id})
async function current(env:Bindings,c:ToolContext,id:string){await agentAccess(env,c,'read',[id]);const m=await get(env,id);if(!m)throw denied();return m}
async function perform<T>(f:()=>Promise<T>):Promise<T>{try{return await f()}catch(error){if(error instanceof ToolRefusal)throw error;const status=(error as any)?.status;if(status===404||status===403||status===401)throw denied();if(status===409||/changed|uptime_audit.id/.test(String(error)))throw new ToolRefusal('revision_conflict');throw new ToolRefusal('native_refusal')}}

export function nativeTools(env:Bindings):ToolDefinition[]{
 const tools:ToolDefinition[]=[]
 function add(name:string,readOnly:boolean,schema:ReturnType<typeof input>,classes:ClassId[],clauses:string[],run:(args:Args,c:ToolContext)=>Promise<any>,extra:Partial<ToolDefinition>={}){
  tools.push({name:`uptime.${name}`,title:name.replaceAll('.',' '),description:`Uptime native ${name.replaceAll('.',' ')}. Current native role, service/team scope and immutable evidence remain authoritative.`,scope:readOnly?'uptime:read':'uptime:operate',readOnly,inputSchema:schema,outputSchema:obj,classes,clauses,untrusted:readOnly,
   classify:async(a,c)=>{await agentAccess(env,c,'read');return standard()},
   ...(!readOnly?{summary:async(a:Args,c:ToolContext):Promise<ApprovalSummary>=>({target:{id:a.id??a.monitorId??a.operatorId??'workspace'},items:[name]})}:{}),
   async run(a,c){
    const result=await perform(()=>run(a,c)),family=name.split('.')[0],target=result?.id??a.id;
    const area=family==='incidents'?'incidents':family==='routes'?'routes':['monitors','maintenance','reports','evidence','grants'].includes(family)?'monitors':null;
    const suffix=name==='monitors.history'?'/history':family==='reports'?'/uptime':family==='evidence'?'/failure-snapshots':'';
    const resources=area&&target?[{...link(area,String(target)),uri:link(area,String(target)).uri+suffix}]:undefined;
    return {result,...(resources?{resources}:{})}
   },...extra})
 }
 add('monitors.list',true,input({limit:{type:'integer',minimum:1,maximum:100}},[]),['standard'],['EVIDENCE-001','AUTHORITY-001'],async(a,c)=>({items:await Promise.all((await visibleIds(env,c)).slice(0,a.limit??100).map(id=>monitor(env,c,id)))}))
 add('monitors.read',true,input({id}),['standard'],['EVIDENCE-001','AUTHORITY-001'],(a,c)=>monitor(env,c,a.id),{classify:async(a,c)=>{await agentAccess(env,c,'read',[String(a.id)]);return standard()}})
 add('monitors.history',true,input({id}),['standard'],['EVIDENCE-001','STATE-001'],(a,c)=>monitorHistory(env,c,a.id),{classify:async(a,c)=>{await agentAccess(env,c,'read',[String(a.id)]);return standard()}})
 add('incidents.read',true,input({id}),['standard'],['EVIDENCE-001','INCIDENT-001'],(a,c)=>projection(env,c,'incidents',a.id),{classify:async(a,c)=>{await projection(env,c,'incidents',String(a.id));return standard()}})
 add('reports.read',true,input({id,from:{type:'string'},to:{type:'string'}},['id']),['standard'],['REPORT-001'],async(a,c)=>{await agentAccess(env,c,'read',[a.id]);const params=new URLSearchParams(Object.entries(a).filter(([k])=>['from','to'].includes(k)) as [string,string][]);return await monitorReport(env,a.id,params)??Promise.reject(denied())})
 add('evidence.read',true,input({id}),['standard','sensitive'],['EVIDENCE-002'],(a,c)=>projection(env,c,'monitors',a.id,'failure-snapshots'),{classify:async(a,c)=>{await evidenceAccess(env,c,String(a.id));const r=await projection(env,c,'monitors',String(a.id),'failure-snapshots');return r.items?.length?[{class:'sensitive',facts:{measure:r.items.length,kind:'failure-evidence'}}]:standard()}})
 const monSchema=input({id,definition:obj},['id','definition'])
 const proposed=async(a:Args,c:ToolContext,mode:string)=>{
  const old=mode==='create'?null:await current(env,c,a.id)
  const next={...(old?.definition??{}),...(a.definition??{}),...(mode==='pause'?{enabled:false}:mode==='resume'?{enabled:true}:{})}
  if(old&&(next.type!==old.definition.type||JSON.stringify(next.assertions)!==JSON.stringify(old.definition.assertions)))throw new ToolRefusal('assertion_change_requires_native_door')
  await agentAccess(env,c,'check_write',old?[old.id]:[],next,!old)
  // Retain native step-up for credential/private/synthetic/API/browser changes.
  if(requestNeedsStepUp(new Request(`${env.UPTIME_ORIGIN}/api/monitors/${old?.id??''}`,{method:'PATCH'}),next))throw new ToolRefusal('native_proof_required')
  return {old,next}
 }
 const monitorClasses=async(a:Args,c:ToolContext,mode:string):Promise<ClassAndFacts[]>=>{
  const {old,next}=await proposed(a,c,mode)
  const risks:ClassAndFacts[]=next.enabled||old?.definition.enabled?[{class:'live',facts:{measure:1,service:next.service??next.name??'monitor'}}]:standard()
  if(next.enabled&&(!old||!old.definition.enabled||next.url!==old.definition.url||JSON.stringify(next.probes)!==JSON.stringify(old.definition.probes)))risks.push({class:'external',facts:{measure:1,counterparty:'public'}})
  return risks
 }
 for(const mode of ['create','update','pause','resume'])add(`monitors.${mode}`,false,mode==='create'?input({definition:obj}):mode==='update'?monSchema:input({id}),(mode==='pause'?['standard','live']:mode==='resume'?['live','external']:['standard','live','external']),['MONITOR-001','HTTP-001','STATE-001'],async(a,c)=>{
  const {old,next}=await proposed(a,c,mode),access=await agentAccess(env,c,'check_write',old?[old.id]:[],next,!old)
  const result=await save(native(env,access),next,old?.id,actor(c));if(!result)throw denied();c.emit(`monitor.${mode}`,link('monitors',result.id).uri,{revision:result.revision});return {id:result.id,revision:result.revision,definition:definition(result.definition)}
 },{classify:(a,c)=>monitorClasses(a,c,mode),...(mode==='create'?{}:{revision:async(a,c)=>(await current(env,c,String(a.id))).revision}),summary:async(a,c)=>{const {old,next}=await proposed(a,c,mode);return {target:{...(old?{id:old.id}:{}),name:String(next.name??'New monitor')},items:[JSON.stringify(definition(next))]}}})
 for(const kind of ['acknowledge','assign','note'])add(`incidents.${kind}`,false,input({id,...(kind==='note'?{text:{type:'string',minLength:1,maxLength:5000}}:kind==='assign'?{ownerId:{anyOf:[id,{type:'null'}]}}:{})}),['standard'],['INCIDENT-001','STATE-001'],async(a,c)=>{
  const incident=await findIncident(env,a.id),access=await agentAccess(env,c,'respond',[incident.monitor_id]),e=native(env,access),who={id:c.person.id,displayName:c.actor.label,access}
  const version=(await env.DB.prepare('SELECT version FROM incident_work WHERE incident_id=?').bind(a.id).first<{version:number}>())?.version??0
  const result=kind==='note'?await addComment(e,a.id,{text:a.text},who):await incidentAction(e,a.id,{kind,version,...(kind==='assign'?{ownerId:a.ownerId}:{})},who)
  c.emit(`incident.${kind}`,link('incidents',a.id).uri);return result
 },{classify:async(a,c)=>{const i=await findIncident(env,String(a.id));await agentAccess(env,c,'respond',[i.monitor_id]);return standard()},revision:async a=>(await env.DB.prepare('SELECT version FROM incident_work WHERE incident_id=?').bind(a.id).first<{version:number}>())?.version??0,summary:async(a,c)=>{await projection(env,c,'incidents',String(a.id));return {target:{id:String(a.id)},items:[kind,...(kind==='note'?[String(a.text)]:kind==='assign'?[String(a.ownerId)]:[])]}}})
 add('maintenance.read',true,input({id}),['standard'],['MAINT-001'],async(a,c)=>{const m=await current(env,c,a.id);return {id:m.id,revision:m.revision,windows:m.definition.maintenanceWindows??[],maintenanceUntil:m.definition.maintenanceUntil??0}})
 add('maintenance.update',false,input({id,window:obj}),['live'],['MAINT-001'],async(a,c)=>{
  const access=await agentAccess(env,c,'maintenance_write',[a.id]),e=native(env,access),p=await previewMaintenance(e,{monitorIds:[a.id],window:a.window});const r=await applyMaintenance(e,{monitorIds:[a.id],window:a.window},p.digest,actor(c));c.emit('monitor.maintenance',link('monitors',a.id).uri);return r
 },{classify:async(a,c)=>{const m=await current(env,c,String(a.id));await agentAccess(env,c,'maintenance_write',[m.id]);return [{class:'live',facts:{measure:1,service:m.definition.service??m.definition.name}}]},revision:async(a,c)=>(await current(env,c,String(a.id))).revision,summary:async(a,c)=>{const p=await previewMaintenance(env,{monitorIds:[a.id],window:a.window});return {target:{id:String(a.id)},items:[JSON.stringify(p)]}}})
 add('routes.read',true,input({id}),['standard'],['ROUTING-001'],(a,c)=>projection(env,c,'routes',a.id))
 add('routes.preview',true,input({id,policy:obj}),['standard'],['ROUTING-001'],async(a,c)=>{await agentAccess(env,c,'route_write',[a.id],undefined,true);const {snapshot,monitor,...p}=await prepareAlertRouteAssignment(env,a.id,a.policy);return p})
 add('routes.update',false,input({id,policy:obj,digest:{type:'string'}}),['live','external','access'],['ROUTING-001'],async(a,c)=>{
  const access=await agentAccess(env,c,'route_write',[a.id],undefined,true),p=await prepareAlertRouteAssignment(env,a.id,a.policy);if(p.digest!==a.digest)throw new ToolRefusal('revision_conflict');const result=await applyAlertRoute(native(env,access),a.id,{...a.policy,digest:a.digest},actor(c));c.emit('route.updated',link('routes',a.id).uri);return result
 },{revision:async(a,c)=>{await agentAccess(env,c,'route_write',[String(a.id)],undefined,true);return (await readAlertRoute(env,String(a.id),{readOnly:true})).policies.find(p=>p.scope==='monitor')?.revision??0},
 authority:async(a,c)=>{const p=await prepareAlertRouteAssignment(env,String(a.id),a.policy);return {subject:`route:${a.id}`,widens:p.current.destinationIds.some(id=>!p.previous.destinationIds.includes(id))||p.current.teamIds.some(id=>!p.previous.teamIds.includes(id))}},
 classify:async(a,c)=>{await agentAccess(env,c,'route_write',[String(a.id)],undefined,true);const p=await prepareAlertRouteAssignment(env,String(a.id),a.policy);return [{class:'live',facts:{measure:p.affected.length,service:p.monitor.definition.service??p.monitor.definition.name}},{class:'external',facts:{measure:p.readyCount,counterparty:'known'}},{class:'access',facts:{measure:p.current.destinationIds.length,direction:p.current.destinationIds.some(id=>!p.previous.destinationIds.includes(id))?'widens':'narrows'}}]},
 summary:async a=>{const p=await prepareAlertRouteAssignment(env,String(a.id),a.policy);return {target:{id:String(a.id),name:p.monitor.definition.name},recipients:p.recipients.filter(r=>r.selected).map(r=>r.name),items:[JSON.stringify(p.current)]}}})
 add('definitions.read',true,input({}),['standard'],['IMPORT-001'],async(_a,c)=>{await agentAccess(env,c,'read',[],undefined,true);return exportDefinitions(env)})
 add('definitions.preview',true,input({file:{type:'string',maxLength:2097152}}),['standard'],['IMPORT-001'],async(a,c)=>{await agentAccess(env,c,'import',[],undefined,true);return recogniseFile(a.file,'uptime.monitors')})
 add('grants.read',true,input({id}),['standard'],['AUTHORITY-001','EVIDENCE-002'],async(a,c)=>{await agentAccess(env,c,'secret_write',[a.id],undefined,true);return readEvidenceAccess(env,a.id)})
 add('grants.update',false,input({id,operatorId:id,granted:{type:'boolean'}}),['access'],['AUTHORITY-001','EVIDENCE-002'],async(a,c)=>{
  const access=await agentAccess(env,c,'secret_write',[a.id],undefined,true);const result=await saveEvidenceAccess(native(env,access),a.id,{operatorId:a.operatorId,granted:a.granted},actor(c));c.emit('monitor.evidence-access',link('monitors',a.id).uri);return result
 },{authority:async a=>({subject:String(a.operatorId),widens:!!a.granted&&!await env.DB.prepare('SELECT 1 FROM failure_evidence_grants WHERE monitor_id=? AND operator_id=?').bind(a.id,a.operatorId).first()}),classify:async(a,c)=>{await agentAccess(env,c,'secret_write',[String(a.id)],undefined,true);return [{class:'access',facts:{measure:1,direction:a.granted?'widens':'narrows'}}]}})
 add('witness.read',true,input({}),['standard'],['EVIDENCE-001','AUDIT-001'],(_a,c)=>witness(env,c))
 return tools
}
