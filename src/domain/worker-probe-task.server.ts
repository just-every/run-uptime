import type {Bindings} from './control.server.ts'
import type {snapshotSettings} from './snapshot-policy.server.ts'
import {SubrequestBudget} from './worker-budget.ts'
import {workerProbe} from './worker-http.server.ts'
import {hostedProbeUserAgent} from './probe-identification.ts'
import {dnsCache} from './worker-dns.server.ts'
// @ts-ignore Shared protocol settings.
import {isProtocol} from './protocol/settings.mjs'

export type ScheduledProbeTask={definition:any;probes:string[];snapshotPolicy:Awaited<ReturnType<typeof snapshotSettings>>};
export type ProbedSlot={attempts:any[];spent:number;validated:string[]};

export async function probeWorkerTask(env:Bindings,monitorId:string,task:ScheduledProbeTask,capacity:number,previous:string[]):Promise<ProbedSlot>{
 const validated=new Set(previous),dns=dnsCache(validated);
 const budget=new SubrequestBudget(capacity),allowance=budget.reserve(capacity)!;
 const {definition}=task,attempts=[];
 const userAgent=['http','keyword'].includes(definition.type??'http')&&!definition.catalog?
  await hostedProbeUserAgent(monitorId,env.UPTIME_ORIGIN):undefined;
 const context={dns,allowance,appOrigin:env.UPTIME_ORIGIN,snapshotPolicy:task.snapshotPolicy};
 for(const probe of task.probes){
  const canaryUrl=definition.assignments[probe].canaryUrl;
  const canary=canaryUrl?{
   ...await workerProbe({...definition,type:'http',tlsTrust:undefined,catalog:undefined,url:canaryUrl,method:'GET',assertions:{status:200}},probe,{...context,statusOnly:true}),
   attempt:0,
  }:undefined;
  for(let attempt=0;attempt<=definition.retries;attempt++){
   const observation=isProtocol(definition.type)?
    await (await import('./worker-protocol-diagnostics.server.ts')).workerProtocolProbe(definition,probe,allowance,task.snapshotPolicy):
    await workerProbe(definition,probe,{...context,userAgent});
   attempts.push({...observation,attempt,...(canary?{canary}:{})});
   if(observation.outcome!=='target_failure')break;
  }
 }
 return {attempts,spent:capacity-allowance.reserved,validated:[...validated]};
}
