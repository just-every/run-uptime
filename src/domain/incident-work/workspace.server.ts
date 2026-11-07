import type {Bindings} from '../control.server.ts'
import {inScope,type Access} from '../access.server.ts'
import {incidents} from '../incidents.server.ts'
// The responder's list contains only permitted monitors and their durable incidents.
// It never loads destination credentials, runner grants or workspace notification history.
export async function responseWorkspace(env:Bindings,access:Access){
 const rows=(await env.DB.prepare('SELECT id,definition FROM monitors ORDER BY rowid').all<{id:string;definition:string}>()).results
 const allowed=rows.map(row=>({...row,definition:JSON.parse(row.definition)})).filter(row=>inScope(row.definition,access.scopes))
 return {monitors:await Promise.all(allowed.map(async row=>({id:row.id,name:row.definition.name,
  incidents:(await incidents(env,row.id)).map(incident=>({id:incident.id,key:incident.key,startedAt:incident.startedAt,endedAt:incident.endedAt}))}))) }
}
