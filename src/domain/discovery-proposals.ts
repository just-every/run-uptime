// DISCOVERY-001: what the owner reviews for one source. The latest finished run's candidates, each with its provenance, intended
// outcome, duplicates (existing monitors, and the same check proposed by another source), expected traffic and cost, the locations
// it would run from and the credentials it needs, compared with the previous run (first, new or unchanged) and with the owner's
// current monitors. An endpoint the previous run found and this one did not is listed as removed, with the monitors that still
// check it, for the owner to review; nothing is paused, archived or deleted here. Pure: it reads what it is given.
type Candidate={key:string;url:string;kind:string;identifier:string;seenAt:number;reason:string|null;proposal:{name:string;reason:string;checks:string[];definition:any}|null}
type Run={id:string;started_at:number;finished_at:number;since:number|null;result:{requests:number;durationMs:number;notes:string[];candidates:Candidate[];gone:string[]}}
type Monitor={id:string;definition:any}
type Runner={runner_id:string;network_label:string;revoked_at:number|null;last_contact_at:number|null}
const DAY=86_400_000
// The checks a proposal would duplicate: the same address for a web or browser check, the same host and port for a certificate,
// the same name and record type for DNS.
function sameCheck(a:any,b:any){
 const web=(type:string)=>['http','keyword'].includes(type)
 if(web(a.type)&&web(b.type))return a.url===b.url
 if(a.type!==b.type)return false
 if(a.type==='tls')return a.tls?.host===b.tls?.host&&a.tls?.port===b.tls?.port
 if(a.type==='dns')return a.dns?.name===b.dns?.name&&a.dns?.recordType===b.dns?.recordType
 return a.url===b.url
}
// The locations a new monitor starts on, as the console's own adoption assigns them: every joined location (else the first one),
// up to three checks, two for a browser check.
export function startLocations(runners:Runner[],type:string){
 const active=runners.filter(row=>row.revoked_at===null),joined=active.filter(row=>row.last_contact_at!==null)
 return (joined.length?joined:active.slice(0,1)).slice(0,type==='flow'?2:3).map(row=>({runnerId:row.runner_id,networkLabel:row.network_label}))
}
const COST_UNKNOWN='COST-001 has not published prices, so no USD amount is shown.'
export function costOf(definition:any,locations:number){
 const runsPerDay=Math.round(DAY/definition.intervalMs)*locations
 return {state:'unknown' as const,usd:null,reason:COST_UNKNOWN,monitorRunsPerDay:runsPerDay,probes:locations,
  ...(definition.type==='flow'?{browserMinutes:{state:'unknown' as const,reason:'Browser-minutes depend on each run’s length, and COST-001 has not published their price.'}}:{})}
}
export function trafficOf(definition:any,locations:number){
 const perLocationPerDay=Math.round(DAY/definition.intervalMs)
 return {unit:definition.type==='flow'?'browser runs':'checks',perLocationPerDay,locations,perDay:perLocationPerDay*locations,perMonth:perLocationPerDay*locations*30}
}
function credentialNeeds(candidate:Candidate){
 const status=candidate.proposal?.definition.assertions?.status
 if(candidate.kind==='api'&&(status===401||status===403))return `None to see that it answers: it answers ${status} without a key. Checking signed-in responses needs a request credential on your runner (API-002).`
 return 'None: a public check that sends no request credential.'
}
export function proposalView({run,previous,monitors,decisions,runners,others}:{run:Run;previous:Run|null;monitors:Monitor[];decisions:Map<string,any>;runners:Runner[];others:{sourceId:string;label:string;candidates:Candidate[]}[]}){
 const before=new Set(previous?.result.candidates.map(candidate=>candidate.key)??[]),now=new Set(run.result.candidates.map(candidate=>candidate.key))
 const proposals=run.result.candidates.map(candidate=>{
  const definition=candidate.proposal?.definition,decision=decisions.get(candidate.key)??null
  const base={key:candidate.key,url:candidate.url,kind:candidate.kind,identifier:candidate.identifier,seenAt:candidate.seenAt,change:!previous?'first':before.has(candidate.key)?'unchanged':'new',
   decision:decision?{decision:decision.decision,monitorId:decision.monitor_id,decidedAt:decision.decided_at}:null}
  if(!definition)return {...base,refused:candidate.reason}
  const locations=startLocations(runners,definition.type)
  const duplicates={monitors:monitors.filter(monitor=>sameCheck(definition,monitor.definition)).map(monitor=>({id:monitor.id,name:monitor.definition.name})),
   proposals:[...run.result.candidates.filter(other=>other.key!==candidate.key&&other.proposal&&sameCheck(definition,other.proposal.definition)).map(other=>({sourceId:null,label:'this run',key:other.key})),
    ...others.flatMap(source=>source.candidates.filter(other=>other.proposal&&sameCheck(definition,other.proposal.definition)).map(other=>({sourceId:source.sourceId,label:source.label,key:other.key})))]}
  return {...base,refused:null,name:candidate.proposal!.name,reason:candidate.proposal!.reason,checks:candidate.proposal!.checks,definition,outcome:definition.outcome??null,
   duplicates,locations,traffic:trafficOf(definition,locations.length),cost:costOf(definition,locations.length),credentials:credentialNeeds(candidate)}
 })
 const removed=(previous?.result.candidates??[]).filter(candidate=>!now.has(candidate.key)&&candidate.proposal).map(candidate=>({key:candidate.key,url:candidate.url,kind:candidate.kind,identifier:candidate.identifier,lastSeenAt:candidate.seenAt,
  answered:!run.result.gone.includes(candidate.url),
  monitors:monitors.filter(monitor=>sameCheck(candidate.proposal!.definition,monitor.definition)).map(monitor=>({id:monitor.id,name:monitor.definition.name}))}))
 return {run:{id:run.id,startedAt:run.started_at,finishedAt:run.finished_at,since:run.since,requests:run.result.requests,durationMs:run.result.durationMs,notes:run.result.notes,previousRunId:previous?.id??null},proposals,removed}
}
