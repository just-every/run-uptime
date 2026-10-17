// A pass is evidence of the definition it ran only. When the revision now running requires less than the revision that was current
// when the open incident began (a flow lost a required outcome, or the monitor became another type), a pass under it is labelled a
// changed definition, in the state, the recovery event and the console, so a weakened monitor can never read as the original
// recovering.
// @ts-ignore Edition flow vocabulary is JavaScript shared with the runner.
import {requirementChange} from './flow.mjs'
import type {Bindings} from './control.server.ts'
export interface DefinitionChange{fromRevision:number;toRevision:number;removed:string[];fromType?:string;toType?:string}
const TYPE_NAMES:Record<string,string>={http:'an HTTP check',keyword:'a keyword check',heartbeat:'a heartbeat',flow:'a browser flow'}
const typeName=(type:string)=>TYPE_NAMES[type]??`a ${type} check`
export async function definitionChange(env:Bindings,monitorId:string,incidentRevision:unknown,revision:number,definition:any):Promise<DefinitionChange|null>{
 if(!Number.isInteger(incidentRevision)||incidentRevision===revision)return null
 const row=await env.DB.prepare('SELECT definition FROM revisions WHERE monitor_id=? AND revision=?').bind(monitorId,incidentRevision).first<any>()
 if(!row)return null
 const earlier=JSON.parse(row.definition),from={fromRevision:incidentRevision as number,toRevision:revision}
 if((earlier.type??'http')!==(definition.type??'http')){
  // Another type checks something else entirely: everything the earlier revision required is gone.
  const removed=earlier.type==='flow'?requirementChange(earlier.flow,null).removed:[]
  return {...from,removed:removed.length?removed:[typeName(earlier.type??'http')],fromType:earlier.type??'http',toType:definition.type??'http'}
 }
 if(['http','keyword'].includes(definition.type??'http')&&JSON.stringify(earlier.tlsTrust??null)!==JSON.stringify(definition.tlsTrust??null))return {...from,removed:['the original HTTPS certificate trust policy'],fromType:earlier.type??'http',toType:definition.type??'http'};
 if(definition.type!=='flow')return null
 const change=requirementChange(earlier.flow,definition.flow)
 return change.change==='shrank'?{...from,removed:change.removed}:null
}
export const definitionChangeNote=(c:DefinitionChange)=>c.removed.includes('the original HTTPS certificate trust policy')?` Changed definition: revision ${c.toRevision} uses a different HTTPS certificate trust policy from revision ${c.fromRevision}. A pass under this policy does not establish that the original certificate problem recovered.`:c.fromType?` Changed definition: revision ${c.toRevision} made this monitor ${typeName(c.toType!)} instead of ${typeName(c.fromType)} and no longer requires ${c.removed.join('; ')}, which revision ${c.fromRevision} required when this incident began, so a pass now is not evidence that the original ${c.fromType==='flow'?'flow':'check'} works.`
 :` Changed definition: revision ${c.toRevision} no longer requires ${c.removed.join('; ')}, which revision ${c.fromRevision} required when this incident began, so a pass now is not evidence that the original flow works.`
