import assert from 'node:assert/strict';
import {dispatchNotifications} from '../runners/src/notification-dispatch.mjs';
// DELIVERY-002 fallback contacts through the owner route API, the real runner dispatcher and the Worker mail sender.
// Provider-edge responses (mail, Slack, webhooks) are the only fakes.
export const sleep=ms=>new Promise(resolve=>setTimeout(resolve,Math.max(0,ms)));
/** A SendGrid-shaped edge behind the Worker's outbound service: records each submission, answers 202 unless told otherwise. */
export function mailEdge(){
 const records=[],responses=[];
 return {records,responses,async outbound(request){
  if(request.url!=='https://api.sendgrid.com/v3/mail/send'){assert.match(new URL(request.url).hostname,/^(watch|heartbeat)\.example\.test$/);return new Response('',{status:200})}
  const body=JSON.parse(await request.text());records.push({at:Date.now(),deliveryId:body.custom_args.rer_delivery_id,text:body.content.find(c=>c.type==='text/plain').value});
  return new Response('',{status:responses.shift()??202});
 }};
}
export async function proveFallbackChains({f,ok,rpc,edge,mail,confirm,restart,destinations:{slack,email,hook}}){
 const deliveries=async()=> (await ok('/api/notifications')).deliveries;
 const forMonitor=async id=> (await deliveries()).filter(d=>d.event.monitorId===id&&d.event.kind==='trigger');
 const sent=url=>edge.sent.filter(s=>s.url.startsWith(url)).length;
 // A dead Slack incoming webhook (404 no_team) is Failed at once; the email fallback goes out on the next poll.
 edge.slack='dead';mail.responses.push(500);
 const dead=await confirm({destinationIds:[slack.id],fallback:{destinationIds:[email.id,hook.id],deadlineSeconds:5}});
 await dispatchNotifications(rpc,edge);
 let rows=await forMonitor(dead.id);assert.equal(rows.length,1);assert.equal(rows[0].state,'rejected');assert.equal(rows[0].status,404);assert.equal(rows[0].code,'slack_no_team');
 const failedAt=rows[0].attemptHistory[0].finished_at;
 await dispatchNotifications(rpc,edge);
 rows=await forMonitor(dead.id);const viaEmail=rows.find(d=>d.destinationId===email.id);
 assert.ok(viaEmail,'the first fallback contact receives the alert');assert.equal(viaEmail.state,'uncertain');
 const emailSends=mail.records.filter(r=>r.deliveryId===viaEmail.id);assert.equal(emailSends.length,1);
 assert.ok(emailSends[0].at-failedAt<5000,'a Failed primary escalates within the deadline');
 assert.match(emailSends[0].text,/Fallback 1: Dead Slack \(slack\) failed \(slack_no_team\)\./);
 assert.deepEqual(viaEmail.event.fallbackContext.previous.map(p=>[p.destinationId,p.outcome,p.code]),[[slack.id,'failed','slack_no_team']]);
 assert.deepEqual(viaEmail.attemptHistory.map(a=>[a.number,a.phase,a.outcome_category,a.key_reference]),[[1,'fallback','uncertain',viaEmail.eventId]]);
 // The uncertain email is not resent and the next contact waits for the deadline.
 await dispatchNotifications(rpc,edge);assert.equal(sent('https://escalation.example.com'),0);
 await sleep(viaEmail.attemptHistory[0].started_at+5000-Date.now()+50);
 await dispatchNotifications(rpc,edge);await dispatchNotifications(rpc,edge);
 rows=await forMonitor(dead.id);const viaHook=rows.find(d=>d.destinationId===hook.id);
 assert.equal(viaHook.state,'accepted');const hookBody=JSON.parse(edge.sent.find(s=>s.url.startsWith('https://escalation.example.com')).body);
 assert.equal(hookBody.fallbackContext.step,2);assert.deepEqual(hookBody.fallbackContext.previous.map(p=>[p.destinationName,p.outcome]),[['On-call email','uncertain']]);
 assert.equal(mail.records.filter(r=>r.deliveryId===viaEmail.id).length,1,'email is never resent automatically');
 const views=Object.fromEntries(rows.map(d=>[d.destinationId,d.chain]));
 assert.deepEqual(views[slack.id].fallbacks,[{id:viaEmail.id,destinationName:'On-call email',state:'uncertain'}]);
 assert.deepEqual(views[email.id].after.map(p=>[p.destinationName,p.outcome,p.stateNow]),[['Dead Slack','failed','rejected']]);
 assert.deepEqual(views[email.id].fallbacks.map(x=>[x.destinationName,x.state]),[['Escalation webhook','accepted']]);
 assert.equal(views[hook.id].after[0].destinationName,'On-call email');assert.equal(views[hook.id].ended,undefined);
 await dispatchNotifications(rpc,edge);assert.equal((await forMonitor(dead.id)).length,3,'an accepted contact ends the chain');
 // Test sends and drills keep one attempt and never start a chain, even on a deduplicating signed webhook.
 const before=(await deliveries()).length,mailBefore=mail.records.length;
 assert.equal((await f.request(`/api/notifications/destinations/${slack.id}/test`,{body:{}})).status,202);
 edge.hookResponses.push({status:500,headers:{}});const drill=await ok(`/api/notifications/destinations/${hook.id}/drill`,{});
 for(let i=0;i<3;i++)await dispatchNotifications(rpc,edge);
 const isolated=(await deliveries()).slice(0,(await deliveries()).length-before);
 assert.equal(isolated.length,2,'no fallback job for a test or drill');assert.ok(isolated.every(d=>d.event.kind==='test'&&d.attempts===1&&!d.chain&&d.attemptHistory.length===1));
 assert.equal(isolated.find(d=>d.id===drill.deliveryId).state,'uncertain');assert.equal(mail.records.length,mailBefore);
 console.log('FALLBACK_PROOF failed Slack, uncertain email deadline, webhook acceptance and test/drill isolation passed');
 // An Uncertain primary (timeout) escalates only after the deadline, across a Worker restart, then the chain ends.
 edge.slack='timeout';edge.hookResponses.push({status:400,headers:{}});
 const slow=await confirm({destinationIds:[slack.id],fallback:{destinationIds:[hook.id],deadlineSeconds:5}});
 await dispatchNotifications(rpc,edge);
 rows=await forMonitor(slow.id);assert.equal(rows.length,1);assert.equal(rows[0].state,'uncertain');assert.equal(rows[0].code,'response_unknown');
 const startedAt=rows[0].attemptHistory[0].started_at,hookSends=sent('https://escalation.example.com');
 await restart();
 await dispatchNotifications(rpc,edge);assert.ok(Date.now()<startedAt+5000,'the check ran inside the deadline');
 assert.equal((await forMonitor(slow.id)).length,1,'no fallback before the uncertainty deadline');assert.equal(sent('https://escalation.example.com'),hookSends);
 await sleep(startedAt+5000-Date.now()+50);
 await dispatchNotifications(rpc,edge);await dispatchNotifications(rpc,edge);await dispatchNotifications(rpc,edge);
 rows=await forMonitor(slow.id);assert.equal(rows.length,2);assert.equal(sent('https://escalation.example.com'),hookSends+1,'the fallback fires once');
 const last=rows.find(d=>d.destinationId===hook.id),primary=rows.find(d=>d.destinationId===slack.id);
 assert.equal(last.state,'rejected');assert.equal(last.chain.ended,'exhausted');assert.equal(last.chain.after[0].outcome,'uncertain');
 assert.equal(primary.state,'uncertain');assert.equal(primary.attempts,1,'an uncertain Slack send is never resent');
 assert.ok(last.attemptHistory[0].started_at-startedAt>=5000);
 console.log('FALLBACK_PROOF uncertain timeout deadline across restart and exhausted chain passed');
 return {chainMonitor:dead,fallbackId:viaEmail.id,exhaustedId:last.id};
}

// Dependency notices use the same saved fallback delay and transport-boundary decisions as incident alerts.
export async function proveDependencyFallback(){
 const {catalogRuntime}=await import('./service-catalog-fixture.mjs');
 for(const scenario of ['delayed','primary-accepted','zero','quiet','recovered']){
  const sent=[],transport={async send(wire,beforeRequest){await beforeRequest();const body=JSON.parse(wire.body),primary=new URL(wire.url).hostname==='primary.example.com';sent.push({primary,id:wire.headers['webhook-id'],body});return {status:primary?(scenario==='primary-accepted'&&sent.filter(s=>s.primary).length>1?202:scenario==='primary-accepted'?500:400):202,headers:scenario==='primary-accepted'?{'retry-after':'10'}:{},body:''}}};
  const f=await catalogRuntime(transport),{g,ok,id,edge,route,check,run}=f;
  try{
   const primary=await ok('/api/notifications/destinations',{name:'synthetic-uptime-1',kind:'webhook',url:'https://primary.example.com/notice'});
   const fallback=await ok('/api/notifications/destinations',{name:'synthetic-uptime-2',kind:'webhook',url:'https://fallback.example.com/notice'});
   const time=at=>new Intl.DateTimeFormat('en-GB',{timeZone:'UTC',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(at);
   const delayMinutes=['delayed','primary-accepted','recovered'].includes(scenario)?1:0;
   const quiet=scenario==='quiet'?{quietHours:{timeZone:'UTC',start:time(Date.now()-3600000),end:time(Date.now()+3600000)}}:{};
   await route(id,{destinationIds:[primary.id],fallback:{destinationIds:[fallback.id],deadlineSeconds:5},contactSettings:{[fallback.id]:{delayMinutes,...quiet}}});
   edge.state.stripe.statuses.api='degraded';await check(id);
   const deliveries=async()=>(await ok('/api/notifications')).deliveries.filter(d=>d.event.monitorId===id&&d.event.kind==='dependency');
   const first=(await deliveries()).find(d=>d.destinationId===primary.id);assert.ok(first);
   const due=first.event.observedAt+delayMinutes*60000;
   // The deciding Worker's durable attempt time is authoritative, not the test process's receipt clock.
   const assertTiming=async()=>{for(const d of await deliveries())if(d.destinationId===fallback.id)for(const a of d.attemptHistory)if(a.started_at!==null)assert.ok(a.started_at>=due,`${scenario}: fallback started ${a.started_at-first.event.observedAt} ms after confirmation; expected >= ${delayMinutes*60000}`)};
   await run();await assertTiming();
   if(scenario==='delayed')await f.restart();
   if(scenario==='recovered'){edge.state.stripe.statuses.api='up';await check(id);await run();assert.equal((await deliveries()).find(d=>d.destinationId===fallback.id).state,'rejected','recovery durably cancels the queued fallback')}
   const until=['delayed','primary-accepted'].includes(scenario)?due+1000:Date.now()+1000;
   while(Date.now()<until){await run();await assertTiming();await sleep(Math.min(1000,until-Date.now()))}
   await run();await assertTiming();
   const fallbackSends=sent.filter(s=>!s.primary&&s.body.eventType==='uptime.dependency.firing');
   assert.equal(fallbackSends.length,['delayed','zero'].includes(scenario)?1:0,`${scenario}: exact fallback count`);
   if(scenario==='primary-accepted')assert.equal((await deliveries()).find(d=>d.destinationId===primary.id).state,'accepted');
   if(scenario==='quiet')assert.equal((await deliveries()).find(d=>d.destinationId===fallback.id).code,'waiting_for_contact_quiet');
   const started=(await deliveries()).find(d=>d.destinationId===fallback.id)?.attemptHistory.find(a=>a.started_at!==null)?.started_at;
   console.log('DEPENDENCY_FALLBACK '+JSON.stringify({scenario,delayMinutes,sends:fallbackSends.length,workerElapsedMs:started===undefined?null:started-first.event.observedAt}));
  }finally{await f.close()}
 }
}
