import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {dispatchNotifications} from '../runners/src/notification-dispatch.mjs';
import {contactQuietUntil} from '../src/domain/contact-quiet.ts';
import {sleep} from './notify-fallback-fixture.mjs';
// Extend the DELIVERY-002 public-door case; the only substitutes are provider edges.
export async function proveQuietFallback({ok,rpc,edge,mail,confirm,restart,destinations:{slack,email,hook},inspect}){
 // Exact local-time boundaries include the repeated and skipped hour, and an overnight window.
 const policy={timeZone:'America/New_York',start:'22:00',end:'07:00'};
 assert.equal(contactQuietUntil(policy,Date.parse('2026-01-10T04:00:00Z')),Date.parse('2026-01-10T12:00:00Z'));
 assert.equal(contactQuietUntil({...policy,start:'01:00',end:'02:30'},Date.parse('2026-03-08T06:30:00Z')),Date.parse('2026-03-08T07:00:00Z'));
 assert.equal(contactQuietUntil({...policy,start:'00:00',end:'02:00'},Date.parse('2026-11-01T05:30:00Z')),Date.parse('2026-11-01T07:00:00Z'));
 assert.equal(contactQuietUntil(policy,Date.parse('2026-01-10T12:00:00Z')),null);
 const endAt=Math.ceil((Date.now()+40000)/60000)*60000,timeZone='America/Chicago';
 const time=at=>new Intl.DateTimeFormat('en-GB',{timeZone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(at);
 const quietHours={timeZone,start:time(endAt-120000),end:time(endAt)};
 edge.slack='dead';
 const monitors=[];
 for(const contact of [email,hook]){
  const monitor=await confirm({destinationIds:[slack.id],fallback:{destinationIds:[contact.id],deadlineSeconds:5},contactSettings:{[contact.id]:{quietHours}}});
  monitors.push({monitor,contact});
 }
 await dispatchNotifications(rpc,edge);await dispatchNotifications(rpc,edge);
 const rows=async()=> (await ok('/api/notifications')).deliveries;
 const held=[];
 for(const {monitor,contact} of monitors){
  const row=(await rows()).find(d=>d.event.monitorId===monitor.id&&d.destinationId===contact.id);
  assert.equal(row.state,'queued');assert.equal(row.code,'waiting_for_contact_quiet');assert.equal(row.quietUntil,endAt);assert.equal(row.attempts,0);assert.equal(row.attemptHistory.length,0);
  held.push(row);
 }
 const mailCount=mail.records.length,hookCount=edge.sent.filter(s=>s.url.startsWith('https://escalation.example.com')).length;
 await restart();await sleep(5100);await dispatchNotifications(rpc,edge);
 assert.ok(Date.now()<endAt,'restart proof runs within the saved quiet window');
 assert.equal(mail.records.length,mailCount);assert.equal(edge.sent.filter(s=>s.url.startsWith('https://escalation.example.com')).length,hookCount);
 for(const row of held){const current=(await rows()).find(d=>d.id===row.id);assert.equal(current.quietUntil,endAt);assert.equal(current.state,'queued');assert.equal(current.attempts,0)}
 if(inspect)await inspect({quietId:held[0].id,quietUntil:endAt});
 // Reserve before the next minute, then prove both a live and a restarted
 // reservation cannot start when that minute becomes quiet.
 await sleep(endAt-Date.now()-10000);
 const crossing=[];
 for(let i=0;i<2;i++){
  const monitor=await confirm({destinationIds:[hook.id],contactSettings:{[hook.id]:{quietHours:{timeZone,start:time(endAt),end:time(endAt+60000)}}}});
  const id=(await rpc('',{operation:'poll'})).jobs.find(j=>j.event.monitorId===monitor.id).id,reservation=randomUUID();
  const claim=await rpc('',{operation:'claim',id,reservation,runnerNow:Date.now()});assert.ok(claim);crossing.push({id,claim,reservation});
 }
 assert.ok(Date.now()<endAt,'reservations were taken before the quiet boundary');
 await sleep(endAt-Date.now()+50);
 assert.equal(await rpc('',{operation:'start',...crossing[0]}),false,'a quiet boundary refuses the prepared send');
 await restart();
 for(const row of crossing){const current=await rpc('',{operation:'get',id:row.id});assert.equal(current.state,'queued');assert.equal(current.attempts,0);assert.equal(current.claim,null)}
 await dispatchNotifications(rpc,edge);await dispatchNotifications(rpc,edge);
 for(const row of held){const current=(await rows()).find(d=>d.id===row.id);assert.equal(current.state,'accepted');assert.equal(current.attempts,1);assert.equal(current.attemptHistory.length,1);assert.equal(current.attemptHistory[0].phase,'fallback');assert.ok(current.attemptHistory[0].started_at>=endAt);assert.equal(current.chain.after[0].outcome,'failed')}
 assert.equal(mail.records.filter(r=>r.deliveryId===held[0].id).length,1);
 assert.equal(edge.sent.filter(s=>s.url.startsWith('https://escalation.example.com')).length,hookCount+1);
 for(const row of crossing){const current=(await rows()).find(d=>d.id===row.id);assert.equal(current.state,'queued');assert.equal(current.code,'waiting_for_contact_quiet');assert.equal(current.attemptHistory[0].started_at,null)}
 await sleep(endAt+60000-Date.now()+50);await dispatchNotifications(rpc,edge);await dispatchNotifications(rpc,edge);
 for(const row of crossing){const current=(await rows()).find(d=>d.id===row.id);assert.equal(current.state,'accepted');assert.equal(current.attempts,1);assert.equal(current.attemptHistory.length,1);assert.ok(current.attemptHistory[0].started_at>=endAt+60000);assert.equal(edge.sent.filter(s=>JSON.parse(s.body).monitorId===current.event.monitorId).length,1)}
 console.log('QUIET_PROOF live and restarted unstarted reservations cross quiet without consuming an attempt');
 console.log('QUIET_PROOF email and webhook fallbacks wait through restart, then send once at the saved local-time boundary');
}
