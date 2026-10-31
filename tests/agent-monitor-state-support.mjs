import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {autonomousPolicy} from '../src/base/modules/agent-door/conformance/crypto.mjs';
import {errorCode} from '../src/base/modules/agent-door/conformance/protocol.mjs';
import {auditRows} from '../src/base/modules/agent-door/conformance/audit.mjs';

// Continue the registered emitted-Worker journey with independent native
// records. No classifier, class declaration or expected-output helper is used.
export async function proveMonitorStateEffects({c,native,db,proof}) {
 const tool='uptime.monitors.update',definition={name:'synthetic-uptime-1',type:'http',network:'public',
  url:'https://monitor-state.example.test/health',method:'GET',assertions:{status:200},
  intervalMs:60000,timeoutMs:5000,retries:0,probes:['local-a'],failureQuorum:1,
  confirmSlots:1,recoverSlots:1,freshnessMs:120000,enabled:false,service:'synthetic-uptime-state'};
 const paused=await native('/api/monitors',definition);
 const running=await native('/api/monitors',{...definition,enabled:true});
 const owner=await native('/api/access/self');
 const read=id=>native('/api/monitors/'+id+'/revisions');
 const invoke=args=>c.tool(tool,{...args,expected_revision:args.version});
 const classes=answer=>answer.decision.classes.map(({class:cls,facts})=>({class:cls,facts}));
 const live=[{class:'live',facts:{measure:1,service:'synthetic-uptime-state'}}];
 const snapshot=async()=>{
  const tables=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT GLOB '_cf*' ORDER BY name").all()).results;
  const state={};
  for(const {name} of tables){
   // Shared-door policy, audit and authentication bookkeeping are independent
   // of the native records whose immutability a refusal promises.
   if(name.startsWith('agent_door_')||name.startsWith('oa_')||name==='public_rate_limits')continue;
   state[name]=(await db.prepare(`SELECT * FROM "${name.replaceAll('"','""')}"`).all()).results.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  return state;
 };
 async function oneRevision(record,name) {
  const rows=await read(record.id);
  assert.equal(rows.length,2,'one successful edit appends exactly one immutable revision');
  const old=rows.find(row=>row.revision===record.revision),current=rows.find(row=>row.revision===record.revision+1);
  assert.deepEqual(old.definition,record.definition,'the original native definition is immutable');
  assert.deepEqual(current.definition,{...record.definition,name},'only the reviewed name changes; scheduling and request authority remain identical');
  const visible=await native('/api/v1/monitors/'+record.id);
  assert.equal(visible.revision,record.revision+1);assert.equal(visible.name,name);
  assert.equal(visible.enabled,record.definition.enabled);
 }
 async function audit(answer,id,outcome) {
  const {rows,differs}=await auditRows(c);assert.equal(differs,0);
  const row=rows.find(row=>row.id===answer.decision.id);
  assert.ok(row);assert.equal(row.outcome,outcome);
  assert.deepEqual(row.resource,{kind:'monitor',id});assert.deepEqual(row.classes,classes(answer));
  return rows;
 }
 const blocked=autonomousPolicy();blocked.rules.push({id:'live-blocked',class:'live',do:'blocked'});
 await c.adopt(blocked);
 const args={id:paused.id,version:paused.revision,definition:{name:'synthetic-uptime-2'},idempotency_key:randomUUID()};
 const changed=await invoke(args);
 assert.equal(changed.result?.isError,false);assert.equal(changed.decision.disposition,'autonomous');
 assert.deepEqual(classes(changed),[{class:'standard',facts:{measure:1}}]);
 assert.deepEqual((await invoke(args)).result.structuredContent,changed.result.structuredContent,'exact-key replay returns the same paused edit');
 await oneRevision(paused,args.definition.name);await audit(changed,paused.id,'done');
 const after=await snapshot();
 const stale=await invoke({...args,idempotency_key:randomUUID()});
 assert.equal(errorCode(stale),'revision_conflict');assert.deepEqual(await snapshot(),after,'a stale paused revision cannot overwrite native records');
 console.log('PROBE SURFACE-002 paused-name: MCP update under live-blocked policy -> standard, one native revision, exact-key replay and stale refusal');

 const runningArgs={...args,id:running.id,version:running.revision,idempotency_key:randomUUID()};
 const before=await snapshot(),refused=await invoke(runningArgs);
 assert.equal(errorCode(refused),'policy_blocked');assert.deepEqual(classes(refused),live);
 assert.equal(refused.result.structuredContent,undefined);await audit(refused,running.id,'refused');
 assert.deepEqual(await snapshot(),before,'live-blocked running edit changes no native record');
 console.log('PROBE SURFACE-002 running-name-blocked: equivalent MCP name edit -> live with native monitor target, policy_blocked and unchanged native records');

 const held=autonomousPolicy();held.rules.push({id:'live-person',class:'live',do:'approval',approver:['person:'+c.person.sub],wait:'PT1H'});
 await c.adopt(held);
 const heldArgs={...runningArgs,idempotency_key:randomUUID()},heldBefore=await snapshot();
 const pending=await invoke(heldArgs);
 assert.equal(pending.decision.disposition,'approval');assert.equal(pending.result.resultType,'input_required');
 assert.deepEqual(classes(pending),live);assert.equal(pending.result.structuredContent,undefined);
 await audit(pending,running.id,'pending');
 assert.deepEqual(await snapshot(),heldBefore,'waiting for native person approval changes no native record');
 const handle=pending.result._meta['com.runeditrun/approval'];
 const {approval}=await c.personJson('/agents/api/approvals/'+encodeURIComponent(handle.id));
 assert.deepEqual(approval.summary.nativeTarget,{kind:'monitor',id:running.id});
 assert.equal(approval.summary.target.id,running.id);assert.equal(approval.summary.target.name,running.definition.name);
 assert.ok(approval.summary.items.includes('Current monitor revision: '+running.revision));
 assert.ok(approval.summary.items.some(item=>item.includes('synthetic-uptime-2')),'the person reviews the requested native name');
 await proof.capture('monitor-name-approval',new URL(handle.url).pathname);
 const approved=await c.decideApproval(pending);
 assert.equal(approved.ok,true);assert.equal(approved.body.approval.state,'executed');
 await oneRevision(running,heldArgs.definition.name);
 const executed=await snapshot();
 assert.equal((await c.decideApproval(pending)).body.approval.state,'executed');
 assert.deepEqual(await snapshot(),executed,'repeated person approval cannot append a second revision');
 const {rows}=await auditRows(c),execution=rows.findLast(row=>row.decision_id===pending.decision.id&&row.outcome==='done');
 assert.ok(execution);assert.deepEqual(execution.resource,{kind:'monitor',id:running.id});
 assert.deepEqual(execution.approval.by,[owner.id]);assert.deepEqual(execution.classes,live);
 console.log('PROBE SURFACE-002 running-name-approved: MCP update -> held with native target and reviewed name; named native approval commits exactly once');

 // A pending approval also retains the native revision fence.
 const staleArgs={id:running.id,version:running.revision+1,definition:{name:'synthetic-uptime-3'},idempotency_key:randomUUID()};
 const stalePending=await invoke(staleArgs);assert.equal(stalePending.decision.disposition,'approval');
 const [current]=await read(running.id);
 await native('/api/monitors/'+running.id,{...current.definition,name:'synthetic-uptime-4'},'PATCH');
 const newer=await snapshot(),staleApproval=await c.decideApproval(stalePending);
 assert.equal(staleApproval.ok,true);assert.equal(staleApproval.body.approval.state,'refused');
 assert.equal(staleApproval.body.approval.code,'revision_conflict');
 assert.deepEqual(await snapshot(),newer,'an approved stale edit cannot overwrite a newer native revision');
 // Leave no newly running fixture to compete with the retained runner journey.
 const [latest]=await read(running.id);
 await native('/api/monitors/'+running.id,{...latest.definition,enabled:false},'PATCH');
 await c.adopt(autonomousPolicy());
 console.log('PASS SURFACE-002 ordinary paused and running name edits, native targets, policy refusal, person approval, replay and revision fences');
}
