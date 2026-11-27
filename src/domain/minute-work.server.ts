import {WorkerEntrypoint} from 'cloudflare:workers'
import type {Bindings} from './control.server.ts'
import type {HostedClaimResult} from './hosted-scheduled-claim.server.ts'
import {demoBindings} from './demo.server.ts'
import type {DueCheck,CheckedSlot} from './worker-probe-task.server.ts'
import {HOSTED_RUNNER_ID} from './hosted-runner.ts'

export interface MinuteWork {
 check(due:DueCheck,capacity:number,validated:string[],cronThrough?:number):Promise<CheckedSlot>;
 background(scheduledAt:number,remaining:number,contactAt:number):Promise<void>;
}

export async function completeWorkerCheck(env:Bindings,claim:HostedClaimResult|null,slotId:string,attempts:any[]){
 const {completeAttempts,completeHostedAttempts}=await import('./attempts.server.ts');
 if(!claim){
  await completeAttempts(env,{slotId,attempts},HOSTED_RUNNER_ID);
  return 0;
 }
 const result=await completeHostedAttempts(env,claim,attempts);
 return 'contactAt' in result&&typeof result.contactAt==='number'?result.contactAt:0;
}

type Loopback={ScheduledWork:(options:{props:{cron:true}})=>ScheduledWork};
// No HTTP route exposes these operations. The scheduled handler calls the
// Worker's own entry point, giving each check and each completed slot its own
// CPU budget: a check claims and probes, then hands its attempts straight to
// its result invocation, so the scheduled run itself never carries them.
export class ScheduledWork extends WorkerEntrypoint<Bindings,{cron?:boolean}> implements MinuteWork {
 #authorize(){
  if(this.ctx.props?.cron!==true)throw Error('Scheduled work requires the local Cron binding');
 }

 async check(due:DueCheck,capacity:number,validated:string[],cronThrough?:number){
  this.#authorize();
  const {checkWorkerTask}=await import('./worker-probe-task.server.ts');
  const work=(this.ctx.exports as unknown as Loopback).ScheduledWork({props:{cron:true}});
  return checkWorkerTask(await demoBindings(this.env),due,capacity,validated,cronThrough,
   (claim,slotId,attempts)=>work.complete(claim,slotId,attempts));
 }

 async complete(claim:HostedClaimResult|null,slotId:string,attempts:any[]){
  this.#authorize();
  return completeWorkerCheck(await demoBindings(this.env),claim,slotId,attempts);
 }

 async background(scheduledAt:number,remaining:number,contactAt:number){
  this.#authorize();
  const {runWorkerBackground}=await import('./worker-background.server.ts');
  await runWorkerBackground(await demoBindings(this.env),scheduledAt,remaining,contactAt);
 }
}
