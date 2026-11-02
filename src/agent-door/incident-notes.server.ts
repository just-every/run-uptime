import type {Bindings} from '../domain/control.server.ts'
import {get} from '../domain/control.server.ts'
import {authorizedDatabase} from '../domain/access-database.server.ts'
import {addComment,changeComment} from '../domain/incident-work/comments.server.ts'
import {findIncident} from '../domain/incident-work/common.server.ts'
import {ToolRefusal,type ToolContext,type ClassAndFacts,type JsonSchemaObject} from '../base/modules/agent-door/index.ts'
import {authority,unavailable} from './authority.server.ts'

const id={type:'string',minLength:1,maxLength:512}
// Preserve the original add request. Deletion is an explicit, disjoint variant;
// neither a narrative nor a caller-supplied count can select its effects.
export const incidentNoteSchema:JsonSchemaObject={type:'object',properties:{
 id,text:{type:'string',minLength:1,maxLength:5000},action:{const:'delete'},comment_id:id,version:{type:'integer',minimum:1},
},required:['id'],additionalProperties:false,oneOf:[
 {required:['text'],not:{anyOf:[{required:['action']},{required:['comment_id']},{required:['version']}]}},
 {required:['action','comment_id','version'],not:{required:['text']}},
]}

export function incidentNotes(env:Bindings){
 async function current(a:Record<string,any>,c:ToolContext,completed=false){
  const incident=await findIncident(env,a.id),access=await authority(env,c,'respond',[incident.monitor_id])
  if(access.kind==='credential')throw new ToolRefusal('insufficient_scope')
  if(a.action!=='delete')return {incident,access,comment:null}
  const comment=await env.DB.prepare('SELECT id,author_id,version,deleted_at FROM incident_comments WHERE id=? AND incident_id=? AND monitor_id=?').bind(a.comment_id,a.id,incident.monitor_id).first<{id:string;author_id:string;version:number;deleted_at:number|null}>()
  if(!comment||!completed&&comment.deleted_at!==null)throw unavailable()
  if(comment.author_id!==c.person.id&&!['owner','admin'].includes(access.role))throw new ToolRefusal('native_permission_required')
  if(!completed&&comment.version!==a.version)throw new ToolRefusal('revision_conflict')
  return {incident,access,comment}
 }
 return {
  async classify(a:Record<string,unknown>,c:ToolContext,completed?:readonly ClassAndFacts[]):Promise<ClassAndFacts[]>{
   const {comment}=await current(a,c,Boolean(completed))
   // Exact-key replay retains the original facts after current native scope
   // and author or administrator checks, even though the text is now gone.
   if(completed)return [...completed]
   return [{class:'standard',facts:{measure:1}},...(comment?[{class:'destructive' as const,facts:{measure:1}}]:[])]
  },
  async run(a:Record<string,any>,c:ToolContext){
   const {access}=await current(a,c),native={...env,DB:authorizedDatabase(env,access)}
   const actor={id:c.person.id,displayName:c.person.name,access,preparedBy:c.actor,approvers:c.approvers.map(person=>({...person}))}
   const result=a.action==='delete'
    ?await changeComment(native,a.id,a.comment_id,{version:a.version},actor,true)
    :await addComment(native,a.id,{text:a.text,mentions:[]},actor)
   c.emit('incident.updated',`uptime://incidents/${a.id}`)
   return {incidentId:a.id,...result}
  },
  async revision(a:Record<string,unknown>,c:ToolContext){return (await current(a,c)).comment?.version??null},
  async summary(a:Record<string,any>){
   const incident=await findIncident(env,a.id),monitor=await get(env,incident.monitor_id)
   return {target:{id:a.id,name:'Incident for '+monitor?.definition.name},items:a.action==='delete'
    ?['Delete one internal comment and its edit history irreversibly','Comment: '+a.comment_id,'Expected comment version: '+a.version]
    :['Add an internal incident note','Text: '+a.text]}
  },
 }
}
