import {WorkerEntrypoint} from 'cloudflare:workers'
import type {Bindings} from './control.server.ts'
import type {HostedScheduleClaim} from './hosted-scheduled-claim.server.ts'
import {demoBindings} from './demo.server.ts'
import type {ScheduledProbeTask,ProbedSlot} from './worker-probe-task.server.ts'
import {HOSTED_RUNNER_ID} from './hosted-runner.ts'

export interface MinuteWork {
 probe(monitorId:string,task:ScheduledProbeTask,capacity:number,validated:string[]):Promise<ProbedSlot>;
 complete(claim:HostedScheduleClaim|null,slotId:string,attempts:any[]):Promise<number>;
 background(scheduledAt:number,remaining:number):Promise<void>;
}

export async function completeWorkerCheck(env:Bindings,claim:HostedScheduleClaim|null,slotId:string,attempts:any[]){
 const {completeAttempts,completeHostedAttempts}=await import('./attempts.server.ts');
 if(!claim){
  await completeAttempts(env,{slotId,attempts},HOSTED_RUNNER_ID);
  return 0;
 }
 const result=await completeHostedAttempts(env,claim,attempts);
 return 'contactAt' in result&&typeof result.contactAt==='number'?result.contactAt:0;
}

// No HTTP route exposes these operations. The scheduled handler calls the
// Worker's own entry point, giving each completed slot its own CPU budget.
export class ScheduledWork extends WorkerEntrypoint<Bindings,{cron?:boolean}> implements MinuteWork {
 #authorize(){
  if(this.ctx.props?.cron!==true)throw Error('Scheduled work requires the local Cron binding');
 }

 async probe(monitorId:string,task:ScheduledProbeTask,capacity:number,validated:string[]){
  this.#authorize();
  const {probeWorkerTask}=await import('./worker-probe-task.server.ts');
  return probeWorkerTask(this.env,monitorId,task,capacity,validated);
 }

 async complete(claim:HostedScheduleClaim|null,slotId:string,attempts:any[]){
  this.#authorize();
  return completeWorkerCheck(await demoBindings(this.env),claim,slotId,attempts);
 }

 async background(scheduledAt:number,remaining:number){
  this.#authorize();
  const {runWorkerBackground}=await import('./worker-background.server.ts');
  await runWorkerBackground(await demoBindings(this.env),scheduledAt,remaining);
 }
}
