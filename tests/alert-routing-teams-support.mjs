import assert from 'node:assert/strict';
import {inviteDoorMember} from './access-door-support.mjs';
import {main as routingCommand} from '../scripts/routing.mjs';
// Extends the registered routing journey. All authority is obtained through
// Base admission; reads of D1 below inspect persisted results only.
export async function proveRoutingTeams(f,ok){
 const owner=await ok('/api/access/self');
 const member=await inviteDoorMember(f.origin,f.cookie,'read-only','uptime-route-member',[{kind:'service',value:'Routing payments'}]);
 const memberCall=async(path,body)=>f.request(path,{body,headers:{cookie:member.cookie}});
 const email=await ok('/api/notifications/destinations',{name:'Synthetic routing member',kind:'email',address:'synthetic-uptime-route-member@example.test',enabled:true});
 const ownerEmail=await ok('/api/notifications/destinations',{name:'Synthetic routing owner',kind:'email',address:f.bindings.OWNER_EMAIL,enabled:true});
 const prod=await ok('/api/routing/teams',{name:'Production responders',enabled:true,memberIds:[member.id],expectedRevision:0});
 const stage=await ok('/api/routing/teams',{name:'Staging responders',enabled:true,memberIds:[owner.id],expectedRevision:0});
 assert.equal((await memberCall('/api/routing/teams',{name:'Denied',enabled:true,memberIds:[],expectedRevision:0})).status,403);
 assert.equal((await memberCall('/api/routing/recipient',{destinationId:ownerEmail.id,enabled:true})).status,403,'a member cannot consent for another verified email');
 const m=await f.monitor({name:'Team route admission',enabled:false,runners:[f.first],canary:true,service:'Routing payments',environment:'production'});
 const outside=await f.monitor({name:'Out of member scope',enabled:false,runners:[f.first],canary:true,service:'Another service',environment:'staging'});
 const route=id=>`/api/monitors/${id}/alert-route`;
 const save=async(id,fields)=>{const current=await ok(route(id)),input={scope:'monitor',mode:'selected',destinationIds:[],teamIds:[],expectedRevision:current.policies.find(p=>p.scope==='monitor').revision,...fields};const preview=await ok(route(id)+'/preview',input);return ok(route(id)+'/apply',{...input,digest:preview.digest})};
 await save(m.id,{teamIds:[prod.id]});
 assert.equal((await ok(route(m.id))).readyCount,0,'membership alone never infers consent');
 assert.equal((await memberCall('/api/routing/recipient',{destinationId:email.id,enabled:true})).status,200);
 assert.equal((await ok(route(m.id))).readyCount,1,'scoped member explicitly consented');
 await save(outside.id,{teamIds:[prod.id]});assert.equal((await ok(route(outside.id))).readyCount,0,'scope narrows receiving authority');
 const cli=await routingCommand(['self','--origin',f.origin],{UPTIME_ACCESS_COOKIE:member.cookie});assert.equal(cli.destinations.find(d=>d.id===email.id).optedIn,true);
 const pending={scope:'monitor',mode:'selected',destinationIds:[],teamIds:[prod.id],expectedRevision:(await ok(route(m.id))).effective.revision};
 const before=await ok(route(m.id)+'/preview',pending);
 assert.equal((await memberCall('/api/routing/recipient',{destinationId:email.id,enabled:false})).status,200);
 assert.equal((await f.request(route(m.id)+'/apply',{body:{...pending,digest:before.digest}})).status,409,'pausing invalidates recipient preview');
 assert.equal((await ok(route(m.id))).readyCount,0);
 assert.equal((await memberCall('/api/routing/recipient',{destinationId:email.id,enabled:true})).status,200);
 const quietHours={timeZone:'America/New_York',start:'22:00',end:'07:00'};
 await save(m.id,{teamIds:[prod.id],filters:{environments:['production'],severities:['critical'],origins:['monitor'],regions:['local-a']},quietHours});
 const sample=body=>ok(route(m.id)+'/sample',body),inside={kind:'trigger',regions:['local-a'],at:Date.parse('2026-01-10T04:00:00Z')},outsideQuiet={...inside,at:Date.parse('2026-01-10T15:00:00Z')};
 assert.equal((await sample(inside)).recipients.find(d=>d.id===email.id).outcome,'held_quiet');
 assert.equal((await sample(outsideQuiet)).recipients.find(d=>d.id===email.id).outcome,'ready');
 for(const change of [{kind:'slow'},{kind:'dependency'},{regions:['local-b']}])assert.equal((await sample({...outsideQuiet,...change})).recipients.find(d=>d.id===email.id).outcome,'excluded');
 await save(m.id,{teamIds:[prod.id],filters:{environments:['staging']},quietHours:null});assert.equal((await sample(outsideQuiet)).readyCount,0,'production does not match staging');
 await save(outside.id,{teamIds:[stage.id],filters:{environments:['staging']},quietHours:null});
 await ok('/api/routing/recipient',{destinationId:ownerEmail.id,enabled:true});assert.equal((await ok(route(outside.id)+'/sample',outsideQuiet)).readyCount,1);
 // Real scheduled confirmation with a mismatching environment creates no jobs.
 f.modes.target=503;await ok('/api/monitors/'+m.id,{...m.definition,enabled:true},{method:'PATCH'});
 let task=await f.claim(f.first);assert.equal(task.monitorId,m.id);assert.equal((await f.submit(f.first,task,[await f.evidence(task)])).status,200);
 assert.equal((await f.state(m.id)).targetState,'Failing');
 assert.equal((await f.DB.prepare('SELECT COUNT(*) n FROM notification_jobs WHERE json_extract(event,\'$.monitorId\')=?').bind(m.id).first()).n,0);
 await f.pause(m);
 // A second confirmed incident enters the actual team queue under route quiet.
 const teamMonitor=await f.monitor({name:'Quiet team queue',enabled:false,runners:[f.first],canary:true,service:'Routing payments',environment:'production'});
 const clock=offset=>new Date(Date.now()+offset).toISOString().slice(11,16),liveQuiet={timeZone:'UTC',start:clock(-3600000),end:clock(3600000)};
 await save(teamMonitor.id,{teamIds:[prod.id],filters:{environments:['production'],severities:['critical'],origins:['monitor'],regions:['local-a']},quietHours:liveQuiet});
 await ok('/api/monitors/'+teamMonitor.id,{...teamMonitor.definition,enabled:true},{method:'PATCH'});
 task=await f.claim(f.first);assert.equal(task.monitorId,teamMonitor.id);assert.equal((await f.submit(f.first,task,[await f.evidence(task)])).status,200);
 let jobs=(await ok('/api/notifications')).deliveries.filter(j=>j.event.monitorId===teamMonitor.id);assert.equal(jobs.length,1);assert.equal(jobs[0].destinationId,email.id);assert.equal(jobs[0].state,'queued');
 assert.equal((await memberCall('/api/routing/recipient',{destinationId:email.id,enabled:false})).status,200);
 await ok('/api/runner/notifications',{operation:'poll'},{runner:f.first});
 jobs=(await ok('/api/notifications')).deliveries.filter(j=>j.event.monitorId===teamMonitor.id);assert.equal(jobs[0].state,'rejected');assert.equal(jobs[0].code,'team_recipient_ineligible','live pause stops queued team authority');
 await f.pause(teamMonitor);
 // Rotation invalidates the exact bound credential even if the email remains
 // the same; renewed consent is explicit. Direct test drills remain separate.
 assert.equal((await memberCall('/api/routing/recipient',{destinationId:email.id,enabled:true})).status,200);
 await ok(`/api/notifications/destinations/${email.id}`,{name:email.name,enabled:true,address:'synthetic-uptime-routing-rotated@example.test'},{method:'PATCH'});
 await ok(`/api/notifications/destinations/${email.id}`,{name:email.name,enabled:true,address:'synthetic-uptime-route-member@example.test'},{method:'PATCH'});
 assert.equal((await ok(route(teamMonitor.id))).readyCount,0,'rotation excludes prior consent');
 assert.equal((await memberCall('/api/routing/recipient',{destinationId:email.id,enabled:true})).status,200);
 await ok('/api/access/members/'+member.id,{role:'responder',scopes:[{kind:'service',value:'Routing payments'}]});
 assert.equal((await ok(route(teamMonitor.id))).readyCount,0,'changed role revision invalidates old consent');
 assert.equal((await memberCall(route(teamMonitor.id)+'/apply',{action:'drill',routeId:'not-an-assigned-route',kind:'trigger',regions:['local-a'],expectedRevision:0})).status,403,'route drills inherit the existing route-write role admission');
 const portable=await ok('/api/archive');assert.ok(portable,'new local tables and opaque audit actions have an archive decision');
 await ok('/api/operators/'+member.id+'/erase',{});
 assert.equal((await f.DB.prepare('SELECT COUNT(*) n FROM alert_team_members WHERE operator_id=?').bind(member.id).first()).n,0);
 assert.equal((await f.DB.prepare('SELECT COUNT(*) n FROM alert_recipient_consents WHERE operator_id=?').bind(member.id).first()).n,0);
 assert.equal((await f.DB.prepare('SELECT COUNT(*) n FROM alert_team_deliveries WHERE operator_id=?').bind(member.id).first()).n,0);
 await ok('/api/monitors/'+teamMonitor.id+'/erase',{name:teamMonitor.definition.name});
 assert.equal((await f.DB.prepare('SELECT COUNT(*) n FROM alert_team_deliveries').first()).n,0,'monitor erasure removes its original team bindings');
 console.log('ROUTING-001 team API/CLI consent, scope/rotation/role fences, sample filters, real queue exclusion and quiet admission exercised');
}
