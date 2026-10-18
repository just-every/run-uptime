import type {Bindings} from '../control.server.ts'
import {availabilityOverview} from '../availability.server.ts'
import {attemptSnapshot} from '../attempt-checkpoint.server.ts'
import {projectRecentAttempts} from '../attempt-projection.ts'
import {ReportInputError} from '../reports/period.ts'

type MonitorRow = {id:string;revision:number;definition:string;state:string}

async function summaries(env:Bindings, rows:MonitorRow[], now:number) {
 const monitors=rows.map(row=>({...row,definition:JSON.parse(row.definition),storedState:JSON.parse(row.state)}))
 const availability=await availabilityOverview(env.DB,monitors,now)
 const result=[]
 // Keep the read door free of checkpoint writes and bound in-flight D1 work.
 for(let offset=0;offset<monitors.length;offset+=2)result.push(...await Promise.all(monitors.slice(offset,offset+2).map(async row=>{
  const snapshot=await attemptSnapshot(env,row.id,row.revision,row.definition,now,undefined,true)
  const projection=projectRecentAttempts(row.definition,snapshot.slots,snapshot.observations,now,snapshot.checkpoint)
  let state=projection.state
  if(row.storedState.notificationOpen&&projection.targetState==='Healthy'&&projection.recoveryStreak<row.definition.recoverSlots&&!projection.maintenance)state='Recovering'
  if(!row.definition.enabled)state='Paused'
  return {id:row.id,name:row.definition.name,type:row.definition.type,revision:row.revision,tags:row.definition.tags??[],enabled:row.definition.enabled,
   current:{state,lastCheckAt:availability.get(row.id)!.lastCheckAt,
    coverage:{expected:row.definition.probes.length,observed:projection.regions.filter((region:any)=>region.state!=='Unknown').length,
     locations:projection.regions.map((region:any)=>({id:region.probe,state:region.state}))}}}
 })))
 return result
}

/** Stable keyset order over monitor IDs. Deleted records never shift a page. */
export async function monitoringMonitors(env:Bindings, params:URLSearchParams, now=Date.now()) {
 const limit=params.has('limit')?Number(params.get('limit')):50,cursor=params.get('cursor'),tag=params.get('tag')
 if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw new ReportInputError('Monitor page size must be between 1 and 100')
 if(cursor!==null&&(!cursor||cursor.length>512||/[\x00-\x1f\x7f]/.test(cursor)))throw new ReportInputError('Invalid monitor cursor')
 const where:string[]=[],values:(string|number)[]=[]
 if(cursor!==null){where.push('id>?');values.push(cursor)}
 if(tag!==null){where.push("EXISTS(SELECT 1 FROM json_each(json_extract(definition,'$.tags')) WHERE value=?)");values.push(tag)}
 const rows=(await env.DB.prepare(`SELECT id,revision,definition,state FROM monitors ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY id LIMIT ?`).bind(...values,limit+1).all<MonitorRow>()).results
 const page=rows.slice(0,limit)
 return {items:await summaries(env,page,now),nextCursor:rows.length>limit?page.at(-1)!.id:null,limit,generatedAt:now}
}

export async function monitoringMonitor(env:Bindings, id:string, now=Date.now()) {
 const row=await env.DB.prepare('SELECT id,revision,definition,state FROM monitors WHERE id=?').bind(id).first<MonitorRow>()
 return row?(await summaries(env,[row],now))[0]:null
}
