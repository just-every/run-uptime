import {periodAvailability} from './coverage.server.ts'
import {periodLatency,latencyOptions} from './latency.server.ts'
import type {ReportPeriod} from './period.ts'
// @ts-ignore Immutable profile vocabulary shared with the isolated runner.
import {flowProfile} from '../flow-profile.mjs'

/** Keep profile changes visible rather than assigning today's browser to old checks. */
export async function periodFlowProfiles(db:D1Database,id:string,period:ReportPeriod,options:ReturnType<typeof latencyOptions>){
 const revisions=(await db.prepare('SELECT revision,definition,created_at FROM revisions WHERE monitor_id=? AND created_at<? ORDER BY revision').bind(id,period.to).all<{revision:number;definition:string;created_at:number}>()).results
 const segments=[]
 for(let index=0;index<revisions.length;index++){
  const row=revisions[index],definition=JSON.parse(row.definition),from=Math.max(period.from,row.created_at),to=Math.min(period.to,revisions[index+1]?.created_at??period.to)
  if(definition.type!=='flow'||from>=to)continue
  const range={...period,from,to}
  const [availability,latency]=await Promise.all([periodAvailability(db,id,range),periodLatency(db,id,range,options)])
  segments.push({revision:row.revision,from,to,profile:flowProfile(definition.flow),availability,latency})
 }
 return segments
}
