import {DeliveryService} from '../base/modules/integrations/core/delivery.ts'
import {validateDestination} from '../base/modules/integrations/core/destination.ts'
import type {TrustedTransport} from '../base/modules/integrations/core/types.ts'
import {NotificationRepository,pollNotificationJobs} from './notification-rpc.server.ts'
import {registerClaim,startClaim} from './notification-claims.server.ts'
import {notificationProtocols} from './notification-protocols.ts'
import {retireObsoleteCredentials} from './notification-credentials.server.ts'
import {dispatchNotificationMail} from './notification-mail.server.ts'
import {retireDrillTokens} from './alert-drills.server.ts'
import {hostedInstallation} from './hosted-runner.ts'
import {boundedBody} from './worker-http.server.ts'
import {dnsCache,type PublicDNS} from './worker-dns.server.ts'
import type {Allowance,SubrequestBudget} from './worker-budget.ts'
import type {Bindings} from './control.server.ts'
// The custody a private runner's dispatch keeps over the channel (runners/src/notification-dispatch.mjs), here direct:
// claim, register a reservation, mark the claim started at the transport boundary, then exactly one attempt.
class WorkerNotificationRepository extends NotificationRepository {
 private held=new Map<string,{claim:string;reservation:string}>()
 async claim(id:string,now:number,leaseMs:number){
  const claim=await super.claim(id,now,leaseMs);if(!claim)return null;
  const reservation=crypto.randomUUID();await registerClaim(this.env,id,claim,reservation,now);this.held.set(id,{claim,reservation});return claim;
 }
 async start(id:string){const held=this.held.get(id);if(!held||!await startClaim(this.env,id,held.claim,held.reservation,Date.now()))throw Error('Notification claim cannot start')}
}
// Validates every DoH answer as public and never follows a redirect; Workers fetch then resolves on its own, so
// Cloudflare egress, not a pinned socket, is the boundary (the Node runner keeps NodePinnedTransport).
function workerTransport(dns:PublicDNS,allowance:Allowance,start:()=>Promise<void>):TrustedTransport{
 return {async send(wire){
  await start();
  const url=validateDestination(wire.url),signal=AbortSignal.timeout(15000);
  for(const name of Object.keys(wire.headers))if(/^(host|connection|transfer-encoding|content-length|proxy-authorization)$/i.test(name))throw Error('Forbidden transport header');
  await dns(url,signal,allowance);allowance.spend();
  const response=await fetch(url.href,{method:'POST',headers:wire.headers,body:wire.body,redirect:'manual',signal,cache:'no-store'});
  return {status:response.status,headers:Object.fromEntries(response.headers),body:(await boundedBody(response,65536)).body};
 }};
}
/** Hosted installs need no runner for alerts: each cron run sends queued email, webhook and Slack jobs it can afford. */
export async function scheduledNotifications(env:Bindings,budget:SubrequestBudget){
 if(!hostedInstallation(env))return dispatchNotificationMail(env);
 const jobs=await pollNotificationJobs(env,budget),repository=new WorkerNotificationRepository(env),dns=dnsCache();
 for(const job of jobs){
  // A+AAAA and the POST. A job the run cannot afford stays queued for the next run or a private runner's poll.
  const allowance=budget.reserve(3);if(!allowance)break;
  try{
   const service=new DeliveryService({repository,hashDestination:async url=>{if(url!==job.credential.endpoint)throw Error('Destination version mismatch');return job.destinationHash},protocols:notificationProtocols(job.credential,job.credentialId),transport:workerTransport(dns,allowance,()=>repository.start(job.id))});
   await service.dispatch(job.id);
  }finally{allowance.release()}
 }
 if(jobs.length){await retireObsoleteCredentials(env);await retireDrillTokens(env)}
}
