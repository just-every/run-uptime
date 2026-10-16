import {demoBindings} from './domain/demo.server.ts'
import {ensureFirstRunner} from './domain/runner-registration.server.ts'
import {HOSTED_RUNNER_ID,hostedInstallation} from './domain/hosted-runner.ts'
import {createDestination} from './domain/notification-destinations.server.ts'
import {historyPeriods,historyStatements,incidentEvents,incidentStatements,type HistoryMonitor} from './domain/demo-history.server.ts'
import type {Bindings} from './domain/control.server.ts'
// @ts-ignore Shared definition validation is JavaScript.
import {validateDefinition} from './domain/policy.mjs'

const MINUTE=60000,INTERVAL=5*MINUTE,WEEK=7*24*60*MINUTE
const statusCheck={assertion:'status',reason:'Expected HTTP status'}
const checks=(extra:{assertion:string;reason:string},pass:boolean)=>[{...statusCheck,pass},{...extra,pass}]
const json={assertion:'json',reason:'JSON value matches assertion'},body={assertion:'body',reason:'Body contains required text'},latency={assertion:'latency',reason:'Response within required time'}

/**
 * A week-old workspace: two service endpoints, the public site checked for real, a resolved incident and
 * the notifications it sent. Older revisions sample less often; each stored definition covers its own
 * interval. Live checks continue every five minutes on the same monitors.
 */
export async function seedDemo(input:Bindings,{ownerEmail,now}:{ownerEmail:string;now:Date}){
 const env=await demoBindings(input),hosted=hostedInstallation(env),runner=await ensureFirstRunner(env),at=now.getTime()
 const {ports,health,status}=hosted?hostedServices:localServices(Number(env.UPTIME_SYNTHETIC_PORT))
 const count=Math.floor(WEEK/INTERVAL),start=Math.floor((at-WEEK)/INTERVAL)*INTERVAL,created=start-12*MINUTE
 const monitors:(Omit<HistoryMonitor,'definition'>&{input:any})[]=[
  {id:'checkout-api',input:{name:'Checkout API',type:'http',...health.input},
   passChecks:checks(json,true),failChecks:checks(json,false),status:200,...health.response,incident:{slotsBeforeEnd:641,failingSlots:4,status:503}},
  {id:'status-endpoint',input:{name:'Service status endpoint',type:'keyword',...status.input},
   passChecks:checks(body,true),failChecks:checks(body,false),status:200,...status.response},
  {id:'docs-site',input:{name:'Public docs',type:'keyword',url:'https://run-uptime.com/docs',timeoutMs:10000,assertions:{status:200,bodyIncludes:'Uptime'}},
   passChecks:checks(body,true),failChecks:checks(body,false),status:200,bytes:13938,baseMs:96,spreadMs:210},
  {id:'run-page',input:{name:'Install guide',type:'http',url:'https://run-uptime.com/run',timeoutMs:10000,assertions:{status:200,latencyMs:3000}},
   passChecks:checks(latency,true),failChecks:checks(latency,false),status:200,bytes:8106,baseMs:88,spreadMs:190},
 ]
 const history:HistoryMonitor[]=monitors.map(({input:definition,...m})=>{
  const worker=hosted&&new URL(definition.url).protocol==='https:'
  return {...m,definition:validateDefinition({...definition,probes:['local-a'],intervalMs:INTERVAL,freshnessMs:3*INTERVAL,retries:0,confirmSlots:2,recoverSlots:2,
   assignments:{'local-a':worker?{runnerId:HOSTED_RUNNER_ID,networkLabel:'Cloudflare Worker'}:{runnerId:runner.runner_id,networkLabel:runner.network_label}}},ports)}
 })
 const statements=[]
 for(const m of history){
  const periods=historyPeriods(m,start,count),revision=periods.at(-1)!.revision
  const data=JSON.stringify(m.definition),last=`${m.id}:${revision}:${start+(count-1)*INTERVAL}:local-a:0`
  const state={state:'Healthy',targetState:'Healthy',underlyingState:'Healthy',evidenceState:'Healthy',coverageState:'Complete',candidate:'Healthy',
   regions:[{probe:'local-a',networkLabel:m.definition.assignments['local-a'].networkLabel,canaryPassed:false,terminal:true,state:'Healthy',observationId:last,observedAt:start+(count-1)*INTERVAL+1000}],
   denominator:1,fails:0,unknown:0,failingVantages:0,failureStreak:0,recoveryStreak:m.incident?m.incident.slotsBeforeEnd-m.incident.failingSlots:count,notificationOpen:false,maintenance:false,
   reason:'0/1 selected probes failed; 0 unknown; coverage complete. 0 independent failing vantages; passing external check absent; scheduled-slot confirmation 0/2; recovery 2/2.',evaluatedAt:at,incidentKey:null,incidentRevision:null}
  statements.push(env.DB.prepare('INSERT INTO monitors(id,revision,definition,next_due,state) VALUES(?,CAST(? AS INTEGER),?,CAST(? AS INTEGER),?) ON CONFLICT(id) DO NOTHING').bind(m.id,revision,data,at,JSON.stringify(state)),
   env.DB.prepare('INSERT INTO evidence_generation(monitor_id) VALUES(?) ON CONFLICT DO NOTHING').bind(m.id),
   ...historyStatements(env,m,m.definition.assignments['local-a'].runnerId,start,count,periods))
 }
 statements.push(env.DB.prepare('INSERT INTO uptime_first_run(id,completed_at) VALUES(1,CAST(? AS INTEGER)) ON CONFLICT DO NOTHING').bind(created))
 await env.DB.batch(statements)
 await seedDestinations(env,ownerEmail,created)
 const destinations=(await env.DB.prepare('SELECT id,name,kind,credential_id FROM notification_destinations WHERE deleted_at IS NULL ORDER BY created_at,id').all<any>()).results
  .map(d=>({id:d.id,name:d.name,kind:d.kind,credentialId:d.credential_id,code:d.kind==='email'?'mail_accepted':'http_2xx'}))
 const checkout=history[0]
 await env.DB.batch(incidentStatements(env,checkout.id,incidentEvents(checkout,start,count,env.UPTIME_ORIGIN??''),destinations))
}

/**
 * The two service samples. A local demo checks the bundled synthetic target through its private runner.
 * A hosted demo has no runner beside it, so the Worker checks two public endpoints of the same kinds:
 * RunEditRun's own JSON health endpoint (the seeded incident therefore describes no one else's service)
 * and GitHub's public status API, whose page indicator is present in every answer, incident or not.
 */
const hostedServices={ports:[] as number[],
 health:{input:{url:'https://app.runeditrun.com/health',timeoutMs:10000,assertions:{status:200,json:{path:'status',equals:'ok'}}},response:{bytes:42,baseMs:21,spreadMs:64}},
 status:{input:{url:'https://www.githubstatus.com/api/v2/status.json',timeoutMs:10000,assertions:{status:200,bodyIncludes:'indicator'}},response:{bytes:215,baseMs:58,spreadMs:120}}}
function localServices(port:number){
 if(!Number.isInteger(port)||port<1||port>65535)throw Error('Demo synthetic target is not configured')
 const service=`http://127.0.0.1:${port}`
 return {ports:[port],
  health:{input:{url:service+'/health',assertions:{status:200,json:{path:'ok',equals:true}}},response:{bytes:28,baseMs:9,spreadMs:31}},
  status:{input:{url:service+'/api/status',assertions:{status:200,bodyIncludes:'healthy'}},response:{bytes:28,baseMs:4,spreadMs:18}}}
}

/** The owner's on-call email and a signed webhook, set up when the workspace started; never added twice. */
async function seedDestinations(env:Bindings,ownerEmail:string,created:number){
 if(await env.DB.prepare('SELECT 1 FROM notification_destinations LIMIT 1').first())return
 for(const destination of [{name:'On-call email',kind:'email',address:ownerEmail},{name:'Incident webhook',kind:'webhook',url:'https://hooks.example.com/uptime/incidents'}]){
  const {id}=await createDestination(env,destination)
  await env.DB.prepare('UPDATE notification_destinations SET created_at=CAST(? AS INTEGER) WHERE id=?').bind(created+(destination.kind==='email'?MINUTE:2*MINUTE),id).run()
 }
}
