import {demoEffect} from './demo-policy.mjs';
import {IntegrationsRepository} from '../../src/base/modules/integrations/core/repository.ts';
import {DeliveryService} from '../../src/base/modules/integrations/core/delivery.ts';
import {NodePinnedTransport} from '../../src/base/modules/integrations/core/node-transport.ts';
import {notificationProtocols} from '../../src/domain/notification-protocols.ts';
// Only named, bounded repository operations cross this authenticated channel.
// The authoritative database remains D1 across Node and Worker restarts.
class RunnerNotificationRepository extends IntegrationsRepository {
 constructor(api,now){super({batch:async()=>{throw Error('SQL is unavailable over the runner channel')}},'uptime-notifications');this.api=api;this.now=now;this.unstarted=new Map();this.reservations=new Map()}
 rpc(operation,fields={}){return this.api('/api/runner/notifications',{operation,...fields})}
 async get(id){
  const current=await this.rpc('get',{id}),claim=this.unstarted.get(id);
  if(claim&&current?.state==='sending'&&current.claim===claim&&current.claimUntil<=this.now()){
   this.unstarted.delete(id);if(!await this.rpc('releaseUnstarted',{id,claim,reservation:this.reservations.get(id)}))await this.recoverExpired();
   return this.rpc('get',{id});
  }
  return current;
 }
 async started(id){const claim=this.unstarted.get(id);if(!claim||!await this.rpc('start',{id,claim,reservation:this.reservations.get(id)}))throw Error('Notification claim cannot start');this.unstarted.delete(id)}
 log(id){return this.rpc('log',{id})}
 async claim(id){
  const reservation=crypto.randomUUID();this.reservations.set(id,reservation);
  const claim=await this.rpc('claim',{id,runnerNow:this.now(),reservation});if(!claim)return null;
  // This instance alone owns the fresh claim. It remains provably unsent until
  // the transport boundary below; duplicate readers have no matching token.
  this.unstarted.set(id,claim);
  const current=await this.get(id);
  if(current?.state!=='sending'||current.claim!==claim){this.unstarted.delete(id);return null}
  return claim;
 }
 finish(id,claim,outcome){if(this.unstarted.get(id)===claim)this.unstarted.delete(id);return this.rpc('finish',{id,claim,outcome})}
 recoverExpired(){return this.rpc('recoverExpired')}
}
export async function dispatchNotifications(api,transport=new NodePinnedTransport(),{now=Date.now}={}){
 const {jobs,serverNow}=await api('/api/runner/notifications',{operation:'poll'});
 if(Number.isFinite(serverNow)&&now()-serverNow>=60000)return 0;
 const repository=new RunnerNotificationRepository(api,now);
 for(const job of jobs){const service=new DeliveryService({repository,hashDestination:async url=>{if(url!==job.credential.endpoint)throw Error('Destination version mismatch');return job.destinationHash},protocols:notificationProtocols(job.credential,job.credentialId),transport:{async send(wire){await repository.started(job.id);return demoEffect(()=>transport.send(wire),()=>({status:200,headers:{},body:new URL(wire.url).hostname==='hooks.slack.com'?'ok':''}))}},now});await service.dispatch(job.id)}
 return jobs.length;
}
