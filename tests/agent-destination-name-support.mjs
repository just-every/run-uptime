import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {randomUUID} from 'node:crypto';
import {autonomousPolicy,heldPolicy,accessToken} from '../src/base/modules/agent-door/conformance/crypto.mjs';
import {errorCode} from '../src/base/modules/agent-door/conformance/protocol.mjs';
import {completeSecondFactor} from './mfa-auth-support.mjs';
import {allDeliveredMessages} from './mail-provider-fixture.mjs';

const tool='uptime.destinations.update',standard=[{class:'standard',facts:{measure:1}}];
const ordered=rows=>rows.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
export async function proveDestinationNameEffects({c,native,db,origin,cookie,providerRequests}){
 await completeSecondFactor(origin,cookie);
 const owner=await native('/api/access/self');assert.equal(owner.role,'owner');
 const sponsor=await db.prepare('SELECT display_name FROM oa_operators WHERE id=?').bind(owner.id).first();
 const originalRoute=await native('/api/alert-route');
 const setRoute=async policy=>{const preview=await native('/api/alert-route/preview',policy);await native('/api/alert-route/apply',{...policy,digest:preview.digest});};
 await setRoute({scope:'installation',mode:'selected',destinationIds:[],expectedRevision:originalRoute.revision});
 const record=await native('/api/notifications/destinations',{name:'synthetic-uptime-name-original',kind:'email',enabled:true,address:['synthetic-uptime-1','recipient.example.test'].join(String.fromCharCode(64))});
 const snapshot=async()=>{
  const tables=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name NOT LIKE 'sqlite_%' OR name='sqlite_sequence') AND name NOT GLOB '_cf_*' ORDER BY name").all()).results;
  const state={};for(const {name} of tables)state[name]=ordered((await db.prepare(`SELECT * FROM "${name.replaceAll('"','""')}"`).all()).results);return state;
 };
 const proof=async args=>(await native('/agents/native-proof',{agent_id:c.agentId,tool,arguments:args})).reference;
 const nativeRead=async()=>{
  const rows=await native('/api/notifications/destinations');return rows.find(row=>row.id===record.id);
 };
 const original=await nativeRead();assert.equal(original.enabled,true);assert.equal(original.credentialsAvailable,true);
 function checkState(before,after,answer,args,{held=false,replay=false,refused=false,started,ended}){
  const expected=structuredClone(before),target={kind:'destination',id:record.id},decision=answer.decision.id;
  assert.deepEqual(Object.keys(after),Object.keys(before));
  const added=(table,key='id')=>after[table].filter(row=>!before[table].some(old=>old[key]===row[key]));
  const admission=after.agent_door_agents.find(row=>row.id===c.agentId),prior=before.agent_door_agents.find(row=>row.id===c.agentId);
  assert.ok(admission.window>=Math.floor(started/60000)&&admission.window<=Math.floor(ended/60000));
  expected.agent_door_agents=ordered(before.agent_door_agents.map(row=>row.id===c.agentId?{...row,window:admission.window,requests:prior.window===admission.window?prior.requests+1:1}:row));
  const audits=added('agent_door_audit');assert.equal(audits.length,1);
  const audit=JSON.parse(audits[0].row);
  assert.equal(audit.id,decision);assert.equal(audit.agent.id,c.agentId);assert.equal(audit.sponsor.id,owner.id);
  assert.equal(audit.tool,tool);assert.deepEqual(audit.resource,target);assert.equal(audit.idempotency_key,args.idempotency_key);
  assert.equal(audit.consent,c.consent);assert.equal(audit.revision,c.revision);assert.equal(audit.door,'mcp');
  assert.equal(audit.approval,null);assert.equal(audit.code,refused?'native_proof_required':null);
  assert.equal(audit.outcome,refused?'refused':replay?'replayed':'done');
  assert.deepEqual(audit.classes,standard);assert.equal(audit.decision,held?'review':'autonomous');
  assert.ok(Date.parse(audits[0].at)>=started&&Date.parse(audits[0].at)<=ended);
  expected.agent_door_audit=ordered([...before.agent_door_audit,...audits]);
  if(!replay&&!refused){
   expected.notification_destinations=ordered(before.notification_destinations.map(row=>row.id===record.id?{...row,name:args.destination.name}:row));
   const usage=added('agent_door_usage','decision_id');assert.equal(usage.length,1);
   assert.deepEqual(usage[0],{decision_id:decision,at:usage[0].at,seed:'uptime',specialist:c.surface.specialist,agent:c.agentId,classes:JSON.stringify(standard)});
   expected.agent_door_usage=ordered([...before.agent_door_usage,...usage]);
   const calls=added('agent_door_calls','key');assert.equal(calls.length,1);assert.equal(calls[0].agent,c.agentId);
   assert.equal(calls[0].key,args.idempotency_key);assert.equal(calls[0].decision_id,decision);assert.equal(calls[0].state,'done');assert.match(calls[0].digest,/^[a-f0-9]{64}$/);
   const saved=JSON.parse(calls[0].outcome);assert.equal(saved.outcome,'done');assert.deepEqual(saved.result,answer.result.structuredContent);assert.equal(saved.decision.disposition,held?'review':'autonomous');
   expected.agent_door_calls=ordered([...before.agent_door_calls,...calls]);
   const events=added('agent_door_events');assert.equal(events.length,1);const event=JSON.parse(events[0].event);
   assert.deepEqual(event,{id:events[0].id,type:'destination.updated',uri:'uptime://destinations/'+record.id,actor:{kind:'agent',agent:{id:c.agentId,name:'Agent door conformance'},for:{id:owner.id,name:sponsor.display_name},label:'Agent door conformance for '+(sponsor.display_name)},at:event.at});
   assert.equal(events[0].uri,event.uri);expected.agent_door_events=ordered([...before.agent_door_events,...events]);
   const receipts=added('uptime_audit');assert.equal(receipts.length,1);
   assert.deepEqual(receipts[0],{id:receipts[0].id,actor_kind:'operator',actor_ref:owner.id,occurred_at:receipts[0].occurred_at,action:'access_secret_write',subject_kind:'operator',subject_ref:receipts[0].id});
   expected.uptime_audit=ordered([...before.uptime_audit,...receipts]);
   if(held){
    const reviews=added('agent_door_reviews');assert.equal(reviews.length,1);assert.equal(reviews[0].state,'open');assert.equal(reviews[0].marked_by,null);assert.equal(reviews[0].marked_at,null);
    const review=JSON.parse(reviews[0].saved);assert.equal(review.decision_id,decision);assert.equal(review.tool,tool);assert.deepEqual(review.classes,standard);assert.equal(review.principal.person.id,owner.id);assert.equal(review.principal.agent.id,c.agentId);assert.deepEqual(review.reviewers,['sponsor']);assert.deepEqual(review.summary.nativeTarget,target);
    assert.equal(answer.result._meta['com.runeditrun/review'].id,reviews[0].id);
    expected.agent_door_reviews=ordered([...before.agent_door_reviews,...reviews]);
   }
  }
  expected.sqlite_sequence=ordered(before.sqlite_sequence.map(row=>({...row,seq:row.seq+(row.name==='agent_door_audit'?(!replay&&!refused?2:1):row.name==='agent_door_events'&&!replay&&!refused?1:0)})));
  for(const table of Object.keys(expected))assert.ok(isDeepStrictEqual(after[table],expected[table]),table+': only the enumerated name, admission, receipt, usage, exact-key outcome, event and optional review may change');
 }
 for(const [policy,document] of [['autonomous',autonomousPolicy()],['held',heldPolicy()]])for(const version of ['2026-07-28','2025-11-25']){
  // Block both legacy effects as well: this name edit must need neither one.
  const selected=structuredClone(document);selected.rules.push({id:'live-blocked',class:'live',do:'blocked'},{id:'access-blocked',class:'access',do:'blocked'});
  await c.adopt(selected);
  const args={id:record.id,destination:{name:'synthetic-uptime-name-'+policy+'-'+version,enabled:true}},key=randomUUID();
  const proofReference=await proof(args),token=await accessToken(c),input={...args,idempotency_key:key};
  const network=structuredClone(providerRequests),mail=allDeliveredMessages().length;
  for(const mode of ['unproved','allowed','replay']){
   const before=await snapshot(),started=Date.now();
   const answer=await c.tool(tool,input,{version,token,...(mode==='unproved'?{}:{proofReference})});
   const ended=Date.now(),after=await snapshot();
   assert.deepEqual(answer.decision.classes.map(({class:cls,facts})=>({class:cls,facts})),standard);
   assert.equal(answer.decision.disposition,policy==='held'?'review':'autonomous');
   if(mode==='unproved'){assert.equal(errorCode(answer),'native_proof_required');assert.equal(answer.result.structuredContent,undefined)}
   else {assert.equal(answer.result?.isError,false);assert.deepEqual(answer.result.structuredContent,{updated:true});assert.equal(answer.result.resultType,'complete');}
   assert.equal(answer.result._meta['com.runeditrun/approval'],undefined);
   if(policy==='autonomous')assert.equal(answer.result._meta['com.runeditrun/review'],undefined);
   checkState(before,after,answer,input,{held:policy==='held',replay:mode==='replay',refused:mode==='unproved',started,ended});
  }
  assert.deepEqual(await nativeRead(),{...original,name:args.destination.name},'native read preserves enabled state, email endpoint and credential availability');
  assert.deepEqual(providerRequests,network);assert.equal(allDeliveredMessages().length,mail);
  console.log(`PROBE SURFACE-002 acceptance-5-name-${policy}-${version}: owner-sponsored MCP name edit with live and access blocked -> standard measure 1, destination target, missing proof refused, one name effect, ${policy==='held'?'one attributed standard review':'no review'}, no approval, exact-key replay unchanged; all durable tables and provider traffic checked`);
 }
 // Hold only the native save's database handoff, then complete an ordinary
 // owner PATCH before its transaction. The production mutation and real D1
 // remain unchanged: this deterministically exercises the stale-read window.
 const {updateDestination}=await import('../src/domain/notification-destinations.server.ts');
 for(const race of ['enabled','credential']){
  const racing=await native('/api/notifications/destinations',{name:'synthetic-uptime-race',kind:'email',enabled:true,address:['synthetic-uptime-3','recipient.example.test'].join(String.fromCharCode(64))});
  const old=await db.prepare('SELECT * FROM notification_destinations WHERE id=?').bind(racing.id).first();
  let concurrent,attempted=false;
  const barrier=new Proxy(db,{get(target,key){
   if(key==='batch')return async statements=>{
    attempted=true;
    await native('/api/notifications/destinations/'+racing.id,{name:old.name,enabled:race!=='enabled',...(race==='credential'?{address:['synthetic-uptime-4','recipient.example.test'].join(String.fromCharCode(64))}:{})},'PATCH');
    concurrent=await snapshot();
    return target.batch(statements);
   };
   const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
  }});
  await assert.rejects(()=>updateDestination({DB:barrier},racing.id,{name:'synthetic-uptime-stale',enabled:true},{kind:'operator',ref:owner.id},{name:old.name,enabled:true,credentialId:old.credential_id}));
  assert.equal(attempted,true);assert.ok(isDeepStrictEqual(await snapshot(),concurrent),'stale name save cannot overwrite the concurrent owner change or alter any other durable table');
  const current=await db.prepare('SELECT * FROM notification_destinations WHERE id=?').bind(racing.id).first();
  assert.equal(current.name,old.name);
  if(race==='enabled')assert.equal(current.enabled,0);else assert.notEqual(current.credential_id,old.credential_id);
  console.log('PROBE SURFACE-002 acceptance-5-'+race+'-fence: native name-save command interleaved with owner PATCH -> transaction refuses, complete concurrent state preserved');
 }
 await c.adopt(autonomousPolicy());
 const route=await native('/api/alert-route');
 await setRoute({scope:'installation',mode:originalRoute.mode,destinationIds:originalRoute.destinationIds,expectedRevision:route.revision});
 console.log('PASS SURFACE-002 saved destination name effects and complete durable preservation');
}
