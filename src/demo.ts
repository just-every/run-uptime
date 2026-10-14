import {demoBindings} from './domain/demo.server.ts'
import {ensureFirstRunner} from './domain/runner-registration.server.ts'
import type {Bindings} from './domain/control.server.ts'
// @ts-ignore Shared definition validation is JavaScript.
import {validateDefinition} from './domain/policy.mjs'

/** These are real runnable definitions, not invented successful observations. */
export async function seedDemo(input:Bindings,{now}:{ownerEmail:string;now:Date}){
 const env=await demoBindings(input),port=Number(env.UPTIME_SYNTHETIC_PORT)
 if(!Number.isInteger(port)||port<1||port>65535)throw Error('Demo synthetic target is not configured')
 const runner=await ensureFirstRunner(env),origin=`http://127.0.0.1:${port}`,at=now.getTime()
 const examples=[
  {id:'demo-http',name:'Demo sample · Checkout API',type:'http',url:origin+'/health',assertions:{status:200,json:{path:'ok',equals:true}}},
  {id:'demo-keyword',name:'Demo sample · Service response',type:'keyword',url:origin+'/api/status',assertions:{status:200,bodyIncludes:'healthy'}},
  {id:'demo-browser',name:'Demo sample · Browser journey',type:'flow',url:origin+'/demo',intervalMs:300000,timeoutMs:30000,
   flow:{intent:'Demo sample: open the bundled page and check its confirmation; this says nothing about a real customer website.',steps:[{kind:'goto',url:origin+'/demo'},{kind:'click',target:{role:'button',name:'Check service'}}],outcomes:[{id:'confirmed',what:'text',value:'Demo service checked'}]}},
 ]
 const statements=[]
 for(const {id,...example} of examples){
  const definition=validateDefinition({...example,network:'synthetic',probes:['local-a'],intervalMs:60000,retries:0,confirmSlots:2,recoverSlots:2,...example,assignments:{'local-a':{runnerId:runner.runner_id,networkLabel:runner.network_label}}},[port])
  const data=JSON.stringify(definition)
  statements.push(env.DB.prepare('INSERT INTO monitors(id,revision,definition,next_due,state) VALUES(?,1,?,?,?) ON CONFLICT(id) DO NOTHING').bind(id,data,at,JSON.stringify({state:'Unknown',confirmedFailure:false,notificationOpen:false})),
   env.DB.prepare('INSERT INTO revisions(monitor_id,revision,definition,created_at) VALUES(?,1,?,?) ON CONFLICT DO NOTHING').bind(id,data,at),
   env.DB.prepare('INSERT INTO evidence_generation(monitor_id) VALUES(?) ON CONFLICT DO NOTHING').bind(id))
 }
 statements.push(env.DB.prepare('INSERT INTO uptime_first_run(id,completed_at) VALUES(1,?) ON CONFLICT DO NOTHING').bind(at))
 await env.DB.batch(statements)
}
