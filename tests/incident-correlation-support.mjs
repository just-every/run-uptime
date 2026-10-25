import assert from 'node:assert/strict';
import {main as incidentCommand} from '../scripts/incidents.mjs';

// Part of the existing incident-work public-door journey, not a new registration.
export async function proveOwnIncidentCorrelation(f,inspect=async()=>{}){
 for(const link of ['service','dependency','group'])await proveCorrelationBranch(f,inspect,link);
}
async function proveCorrelationBranch(f,inspect,link){
 const ok=async(path,options={})=>{const r=await f.request(path,options);assert.ok(r.status>=200&&r.status<300,`${path}: ${r.status} ${JSON.stringify(r.data)}`);return r.data};
 const monitors=[];
 const dependency=link==='dependency'?await f.monitor({name:'synthetic-uptime-dependency',runners:[f.first],canary:true,enabled:false}):null;
 const linking=value=>link==='dependency'?{dependencies:value==='synthetic-uptime-shared'?[dependency.id]:[]}:{[link]:value};
 for(const [n,service] of [[1,'synthetic-uptime-shared'],[2,'synthetic-uptime-shared'],[3,'synthetic-uptime-unrelated']])monitors.push(await f.monitor({name:`synthetic-uptime-${n}`,...linking(service),runners:[f.first],canary:true,enabled:false}));
 const contact=await ok('/api/notifications/destinations',{body:{name:'synthetic-uptime-followup',kind:'email',address:'synthetic-uptime-followup@example.test'}});
 const route={scope:'monitor',mode:'selected',destinationIds:[contact.id],expectedRevision:0,contactSettings:{[contact.id]:{delayMinutes:1,repeatMinutes:1,maxRepeats:1,stopOnAck:true}}};
 const reviewed=await ok(`/api/monitors/${monitors[0].id}/alert-route/preview`,{body:route});await ok(`/api/monitors/${monitors[0].id}/alert-route/apply`,{body:{...route,digest:reviewed.digest}});
 for(const m of monitors)await ok('/api/monitors/'+m.id,{method:'PATCH',body:{...m.definition,enabled:true}});
 f.modes.target=503;
 for(let i=0;i<monitors.length;i++){const task=await f.claim(f.first);assert.ok(task);assert.equal((await f.submit(f.first,task,[await f.evidence(task)])).status,200)}
 const incidents=await Promise.all(monitors.map(async m=>(await ok(`/api/monitors/${m.id}/incidents`))[0]));
 const path=i=>'/api/incidents/'+encodeURIComponent(incidents[i].id);
 let first=await ok(path(0)),second=await ok(path(1));
 const commandRead=await incidentCommand(['read','--origin',f.origin,'--id',incidents[0].id],{UPTIME_ACCESS_COOKIE:f.cookie});assert.deepEqual(commandRead.dependencies.group,first.dependencies.group);assert.equal(commandRead.nextDue,first.nextDue);assert.equal(commandRead.nextDueKind,'notification','existing CLI exposes the same scheduled follow-up kind');
 assert.equal(first.nextDueKind,'notification');assert.equal(first.nextDue,first.trigger.observedAt+60000,'next-due time follows the exact route delay');
 assert.deepEqual(first.dependencies.group.map(g=>g.incidentId),[incidents[1].id],'own simultaneous outages group without any provider notice');
 assert.deepEqual(second.dependencies.group.map(g=>g.incidentId),[incidents[0].id]);
 assert.deepEqual((await ok(path(2))).dependencies.group,[],'unrelated simultaneous failure never joins');
 const evidence=async()=> (await f.DB.prepare('SELECT * FROM observations ORDER BY id').all()).results;
 const before=await evidence();
 await inspect({f,monitors,incidents,link});
 await ok(path(0)+'/actions',{body:{kind:'acknowledge',version:first.version}});
 second=await ok('/api/v1/incidents/'+encodeURIComponent(incidents[1].id));
 assert.equal(second.status,'acknowledged');assert.equal((await ok(path(2))).status,'open');
 const acknowledgment=second.timeline.find(e=>e.kind==='acknowledged');assert.equal(acknowledgment.data.channel,'group');assert.ok(acknowledgment.actor.id);assert.ok(acknowledgment.at);
 assert.deepEqual(await evidence(),before,'group acknowledgment preserves every monitor observation');
 // A later same-service outage falls outside the five-second confirmation window.
 await new Promise(resolve=>setTimeout(resolve,5200));
 const late=await f.monitor({name:'synthetic-uptime-4',...linking('synthetic-uptime-shared'),runners:[f.first],canary:true});
 for(const m of monitors)await f.pause(m);
 let task=await f.claim(f.first);assert.equal(task.monitorId,late.id);assert.equal((await f.submit(f.first,task,[await f.evidence(task)])).status,200);
 const lateIncident=(await ok(`/api/monitors/${late.id}/incidents`))[0];assert.deepEqual((await ok('/api/incidents/'+encodeURIComponent(lateIncident.id))).dependencies.group,[],'same label outside confirmation window never joins');
 await f.pause(late);
 await ok('/api/monitors/'+monitors[0].id,{method:'PATCH',body:{...monitors[0].definition,enabled:true}});
 f.modes.target=200;task=await f.claim(f.first);assert.equal(task.monitorId,monitors[0].id);assert.equal((await f.submit(f.first,task,[await f.evidence(task)])).status,200);
 first=await ok(path(0));second=await ok(path(1));assert.equal(first.machineState,'recovered');assert.equal(second.machineState,'open','one recovery closes only its own child');
 await f.pause(monitors[0]);
 console.log(`FOLLOWUP-001 ${link} incident correlation PASS: shared owner link within confirmation window, unrelated/late isolation, grouped actor acknowledgment without evidence changes, one-child recovery; API/CLI next-due kind and time.`);
}
