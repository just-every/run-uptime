import type {Bindings} from './control.server.ts'
import {settingsOf,type snapshotSettings} from './snapshot-policy.server.ts'
import {SubrequestBudget} from './worker-budget.ts'
import {workerProbe} from './worker-http.server.ts'
import {hostedProbeUserAgent} from './probe-identification.ts'
import {dnsCache} from './worker-dns.server.ts'
import {HOSTED_RUNNER_ID} from './hosted-runner.ts'
import {claimHostedSchedules,type HostedClaimResult,type HostedScheduleClaim} from './hosted-scheduled-claim.server.ts'
// @ts-ignore Shared protocol settings.
import {isProtocol} from './protocol/settings.mjs'

export type ScheduledProbeTask={definition:any;probes:string[];snapshotPolicy:Awaited<ReturnType<typeof snapshotSettings>>};
export type ProbedSlot={attempts:any[];spent:number;validated:string[]};
/** One due monitor as the scheduled run hands it over: its stored definition text and failure snapshot settings row. */
export type DueCheck={id:string;revision:number;next_due:number;definition:string;snapshotPolicy:Record<string,unknown>|null};
export type CheckedSlot={spent:number;validated:string[];contactAt:number};
export type CompleteCheck=(claim:HostedClaimResult|null,slotId:string,attempts:any[])=>Promise<number>;

// Claim, probe and hand the result on, away from the scheduled run: it keeps only what was
// spent and learned. Cron uses the same immutable claims, retries, canaries and evidence
// acceptance as private runners.
export async function checkWorkerTask(env:Bindings,due:DueCheck,capacity:number,previous:string[],cronThrough:number|undefined,complete:CompleteCheck):Promise<CheckedSlot>{
 const [claimed]=await claimHostedSchedules(env,[{...due,definition:JSON.parse(due.definition),encoded:due.definition,snapshotPolicy:settingsOf(due.snapshotPolicy)}],cronThrough);
 const task=claimed??await (await import('./attempt-claims.server.ts')).claimAttempt(env,HOSTED_RUNNER_ID,{monitorId:due.id,dueThrough:cronThrough});
 if(!task)return {spent:0,validated:previous,contactAt:0};
 const result=await probeWorkerTask(env,due.id,task,capacity,previous);
 let contactAt=0;
 if(result.attempts.length){
  const {definition:_probed,snapshotPolicy:_policy,...claim}=claimed??{} as Partial<HostedScheduleClaim>;
  contactAt=await complete(claimed?claim as HostedClaimResult:null,task.id,result.attempts);
 }
 return {spent:result.spent,validated:result.validated,contactAt};
}

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
