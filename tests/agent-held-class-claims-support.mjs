import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
import {autonomousPolicy,heldPolicy} from '../src/base/modules/agent-door/conformance/crypto.mjs';
import {errorCode} from '../src/base/modules/agent-door/conformance/protocol.mjs';
import {auditRows} from '../src/base/modules/agent-door/conformance/audit.mjs';
import {allDeliveredMessages} from './mail-provider-fixture.mjs';

// Fresh native targets keep every first call independent of cached effects.
// The owner enrolls this private runner, but this journey never polls it.
export async function proveHeldClassClaims({c,native,db,origin,sponsorId,providerRequests}) {
 const tool='uptime.monitors.pause',runner=await native('/api/runners',{networkLabel:'synthetic-uptime-claims'});
 const enrollmentBody=JSON.stringify({version:1}),stamp=String(Date.now());
 const enrolled=await fetch(origin+'/api/runner/enroll',{method:'POST',headers:{origin,'content-type':'application/json','x-runner-id':runner.runnerId,'x-runner-key':runner.key,
  'x-sent-at':stamp,'x-runner-signature':createHmac('sha256',runner.key).update(stamp+'.runner-enrolment.'+enrollmentBody).digest('hex')},body:enrollmentBody});
 assert.equal(enrolled.status,200);assert.equal((await enrolled.json()).runnerId,runner.runnerId);
 const owner=await native('/api/access/self');assert.equal(owner.id,sponsorId);
 const definition={name:'synthetic-uptime-claims',type:'http',network:'public',url:'https://claims.example.test/health',method:'GET',assertions:{status:200},
  intervalMs:60000,timeoutMs:5000,retries:0,probes:['local-a'],assignments:{'local-a':runner.runnerId},failureQuorum:1,confirmSlots:1,recoverSlots:1,freshnessMs:120000,enabled:true,service:'synthetic-uptime-claims'};
 // An independent owner pause establishes the native disabled definition,
 // including retirement of automatic external-check settings while paused.
 const ownerControl=await native('/api/monitors',definition);
 const ownerPaused=await native('/api/monitors/'+ownerControl.id,{...ownerControl.definition,enabled:false},'PATCH');
 assert.equal(ownerPaused.definition.enabled,false);
 const networkBefore=structuredClone(providerRequests),mailBefore=allDeliveredMessages().length;
 const tables=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT GLOB '_cf*' ORDER BY name").all()).results.map(row=>row.name);
 const snapshot=async()=>{
  const rows=await db.batch(tables.map(name=>db.prepare(`SELECT * FROM "${name.replaceAll('"','""')}"`)));
  return Object.fromEntries(tables.map((name,index)=>[name,rows[index].results.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))]));
 };
 const noTraffic=()=>{
  assert.deepEqual(providerRequests,networkBefore,'fresh pause and approval cause zero provider traffic');
  assert.equal(allDeliveredMessages().length,mailBefore,'fresh pause and approval send no mail');
 };
 function unchanged(before,after,allowed) {
  assert.deepEqual(Object.keys(after),Object.keys(before));
  for(const name of tables) {
   if(allowed.includes(name))continue;
   if(name==='agent_door_relay') {
    const changed=new Map(after.agent_door_audit.filter(row=>!before.agent_door_audit.some(old=>JSON.stringify(old)===JSON.stringify(row))).map(row=>[row.id,JSON.parse(row.row)]));
    const expected=new Set([...before[name].map(row=>row.decision_id),...Array.from(changed,([id,row])=>row.door==='mcp'&&row.consent!=null?id:null).filter(Boolean)]);
    assert.deepEqual(after[name].map(row=>row.decision_id).sort(),[...expected].sort(),'relay retains exactly the Business audit membership');
    const head=Math.max(0,...before[name].map(row=>row.sequence));
    for(const row of after[name]) {
     const old=before[name].find(item=>item.decision_id===row.decision_id);
     if(changed.has(row.decision_id)) {assert.equal(row.business,c.business);assert.ok(row.sequence>head,'only changed audits advance the relay');}
     else assert.deepEqual(row,old,'unrelated relay rows remain byte-for-byte unchanged');
    }
   } else if(name==='agent_door_agents') {
    const stable=rows=>rows.map(({window,requests,...row})=>row);
    assert.deepEqual(stable(after[name]),stable(before[name]),'admission changes only request counters, never identity or authority');
    assert.equal(after[name].find(row=>row.id===c.agentId).sponsor,sponsorId);
   } else assert.deepEqual(after[name],before[name],name+': no unexpected durable change');
  }
  noTraffic();
 }
 function added(before,after,table,count) {
  for(const row of before[table])assert.ok(after[table].some(next=>JSON.stringify(next)===JSON.stringify(row)),table+': existing rows preserved');
  const extra=after[table].filter(row=>!before[table].some(old=>JSON.stringify(old)===JSON.stringify(row)));
  assert.equal(extra.length,count,table+': only the expected records added');return extra;
 }
 async function audit(answer,args,claims,expected,outcome) {
  const {rows,differs}=await auditRows(c);assert.equal(differs,0);
  const row=rows.find(row=>row.id===answer.decision.id);assert.ok(row);
  assert.equal(row.tool,tool);assert.equal(row.agent.id,c.agentId);assert.equal(row.sponsor.id,sponsorId);
  assert.deepEqual(row.resource,{kind:'monitor',id:args.id});assert.deepEqual(row.classes,expected);
  assert.equal(row.decision,answer.decision.disposition);assert.equal(row.revision,c.revision);
  assert.deepEqual(row.rules,answer.decision.classes.map(({class:kind,rule,do:action})=>({class:kind,rule,do:action})));
  assert.deepEqual(row.ignored_arguments,Object.keys(claims).sort(),'misleading claims are recorded only as ignored argument names');
  assert.equal(row.idempotency_key,args.idempotency_key);assert.equal(row.outcome,outcome);return rows;
 }
 function pendingWire(answer,version) {
  assert.equal(answer.result.structuredContent,undefined);
  if(version==='2025-11-25') {
   assert.equal(answer.result.resultType,'complete');assert.equal(answer.result.isError,true);
   assert.equal(errorCode(answer),'approval_required','the older wire protocol withholds the result with its native approval error');
   assert.equal(answer.result.inputRequests,undefined);
   return answer.result._meta['com.runeditrun/error'].approval;
  }
  assert.equal(answer.result.resultType,'input_required');
  const handle=answer.result._meta['com.runeditrun/approval'];
  assert.equal(answer.result.inputRequests.approval.params.mode,'url');
  assert.equal(answer.result.inputRequests.approval.params.url,handle.url);
  return handle;
 }
 async function pausedOnce(record) {
  const current=await native('/api/v1/monitors/'+record.id),rows=await native('/api/monitors/'+record.id+'/revisions');
  assert.equal(current.enabled,false);assert.equal(current.revision,record.revision+1);
  assert.equal(rows.length,2,'exactly one pause creates exactly one native revision');
  assert.deepEqual(rows.find(row=>row.revision===record.revision).definition,record.definition);
  assert.deepEqual(rows.find(row=>row.revision===record.revision+1).definition,ownerPaused.definition,'the agent pause has exactly the independent owner pause definition');
 }
 const cases=[['clean',{}],['class',{class:'standard'}],['live',{live:false}],['internal',{internal:true}],['confirmation',{confirmExternal:true}],
  ['combined',{class:'standard',live:false,internal:true,confirmExternal:true,confirmation:true}]];
 for(const [policyName,policy] of [['autonomous',autonomousPolicy()],['held',heldPolicy()]]) {
  await c.adopt(policy);
  for(const version of ['2026-07-28','2025-11-25']) {
   let control;
   for(const [label,claims] of cases) {
    const record=await native('/api/monitors',definition);
    const saved=await native('/api/v1/monitors/'+record.id);
    assert.equal(saved.enabled,true);assert.equal(record.definition.enabled,true);
    assert.equal(record.definition.assignments['local-a'].runnerId,runner.runnerId);
    // The expected effect and service come from the independently owner-saved
    // native definition, never from a declaration or a classifier helper.
    const expected=[{class:'live',facts:{measure:1,service:record.definition.service}}];
    const args={id:record.id,version:record.revision,expected_revision:record.revision,idempotency_key:randomUUID()};
    assert.equal(await db.prepare('SELECT key FROM agent_door_calls WHERE agent=? AND key=?').bind(c.agentId,args.idempotency_key).first(),null,'first invocation has no cached admission');
    const invoke=()=>c.tool(tool,{...args,...claims},{version});
    const before=await snapshot(),answer=await invoke();
    assert.equal(answer.status,200);
    assert.deepEqual(answer.decision.classes.map(({class:kind,facts})=>({class:kind,facts})),expected);
    const decision={disposition:answer.decision.disposition,revision:answer.decision.revision,classes:answer.decision.classes};
    if(label==='clean')control=decision;else assert.deepEqual(decision,control,'first-call claims leave the clean control policy rule and disposition unchanged');
    assert.deepEqual(answer.decision.classes.map(({rule,do:action})=>({rule,do:action})),[{rule:'all',do:policyName==='held'?'approval':'autonomous'}]);
    let completed=answer;
    if(policyName==='held') {
     assert.equal(answer.decision.disposition,'approval');
     const handle=pendingWire(answer,version);assert.ok(handle.id);
     assert.equal(handle.url,origin+'/agents/approvals/'+encodeURIComponent(handle.id),'the handle names the canonical native approval page');
     const path='/agents/api/approvals/'+encodeURIComponent(handle.id),view=(await c.personJson(path)).approval;
     assert.equal(view.state,'pending');assert.deepEqual(view.approvals,[]);assert.deepEqual(view.approvers,['sponsor']);
     assert.deepEqual(view.classes,expected);assert.deepEqual(view.summary.nativeTarget,{kind:'monitor',id:record.id});
     assert.deepEqual(view.summary.target,{id:record.id,name:record.definition.name});
     assert.ok(view.summary.items.includes('Current monitor revision: '+record.revision));
     const pending=await snapshot();
     unchanged(before,pending,['agent_door_audit','agent_door_calls','agent_door_approvals','agent_door_events']);
     added(before,pending,'agent_door_audit',1);added(before,pending,'agent_door_calls',1);added(before,pending,'agent_door_events',1);
     const [approvalRow]=added(before,pending,'agent_door_approvals',1),admitted=JSON.parse(approvalRow.saved);
     assert.deepEqual(admitted.args,{id:record.id,version:record.revision},'only admitted native arguments enter the saved action');
     assert.equal(admitted.key,args.idempotency_key);assert.equal(admitted.expected_revision,record.revision);
     assert.deepEqual(admitted.summary,view.summary);assert.equal(admitted.summary_sha256,view.summary_sha256);
     assert.equal(admitted.principal.person.id,sponsorId);assert.deepEqual(admitted.classes,expected);
     assert.deepEqual(await native('/api/v1/monitors/'+record.id),saved,'the held call does not pause or revise the native monitor');
     await audit(answer,args,claims,expected,'pending');
     // Retrying the claims can neither answer approval nor replace its saved
     // arguments or its exact summary. No person has approved at this point.
     const retried=await invoke();
     assert.deepEqual(pendingWire(retried,version),handle);
     if(version==='2025-11-25') {
      const modern=await c.tool(tool,{...args,...claims},{version:'2026-07-28'});
      assert.deepEqual(pendingWire(modern,'2026-07-28'),handle,'the same legacy pending action returns input_required on the modern door');
     }
     assert.deepEqual((await c.personJson(path)).approval,view);
     const waiting=await snapshot();unchanged(pending,waiting,['agent_door_audit']);added(pending,waiting,'agent_door_audit',version==='2025-11-25'?2:1);
     assert.deepEqual(await native('/api/v1/monitors/'+record.id),saved);
     const approved=await native(path+'/approve',{revision:view.revision,summary_sha256:view.summary_sha256});
     assert.equal(approved.approval.state,'executed');
     assert.deepEqual(approved.approval.approvals.map(mark=>mark.person),[sponsorId],'only the actual signed-in named sponsor approves');
     assert.deepEqual(approved.approval.summary,view.summary);assert.equal(approved.approval.summary_sha256,view.summary_sha256);
     completed=await invoke();assert.equal(completed.result?.isError,false);
     assert.deepEqual(completed.result._meta['com.runeditrun/receipt'].approved_by,[sponsorId]);
     assert.equal(completed.result._meta['com.runeditrun/receipt'].approval_id,handle.id);
     const executed=await snapshot(),[usage]=added(waiting,executed,'agent_door_usage',1);
     assert.deepEqual(JSON.parse(usage.classes),expected);
     const stored=JSON.parse(executed.agent_door_approvals.find(row=>row.id===handle.id).saved);
     assert.deepEqual(stored,admitted,'person approval cannot substitute the saved action or its summary');
     const {rows}=await auditRows(c),executions=rows.filter(row=>row.decision_id===answer.decision.id);
     assert.equal(usage.decision_id,executions[0]?.id);
     assert.equal(executions.length,1);assert.equal(executions[0].outcome,'done');assert.deepEqual(executions[0].classes,expected);
     assert.deepEqual(executions[0].resource,{kind:'monitor',id:record.id});assert.deepEqual(executions[0].approval.by,[sponsorId]);
    } else {
     assert.equal(answer.result?.isError,false);assert.equal(answer.decision.disposition,'autonomous');
     assert.equal(answer.result.resultType,'complete');assert.equal(answer.result._meta['com.runeditrun/approval'],undefined);
     await audit(answer,args,claims,expected,'done');
     const after=await snapshot();
     assert.deepEqual(after.agent_door_approvals,before.agent_door_approvals,'autonomous calls complete without waiting');
     const [usage]=added(before,after,'agent_door_usage',1);assert.equal(usage.decision_id,answer.decision.id);assert.deepEqual(JSON.parse(usage.classes),expected);
    }
    await pausedOnce(record);
    const after=await snapshot(),replay=await invoke();assert.equal(replay.result?.isError,false);
    assert.deepEqual(replay.result.structuredContent,completed.result.structuredContent);
    assert.deepEqual(replay.result._meta['com.runeditrun/receipt'],completed.result._meta['com.runeditrun/receipt']);
    unchanged(after,await snapshot(),['agent_door_audit']);await pausedOnce(record);
    assert.equal((await db.prepare('SELECT COUNT(*) n FROM slots WHERE monitor_id=?').bind(record.id).first()).n,0,'unpolled runner creates no scheduled work or observations');
    noTraffic();
   }
   console.log(`PROBE BASE-AGENT-006 acceptance-3-${policyName}-${version}: fresh MCP pause controls and class, live, internal and confirmation claims -> unchanged live measure=1 and native service, rule and target; ${policyName==='held'?'native pending approval with modern input_required, unchanged durable native state and saved approval until named person approves; ':''}one pause revision and exact-key replay without another effect; zero runner or provider traffic`);
  }
 }
 await c.adopt(autonomousPolicy());
 console.log('PASS BASE-AGENT-006 fresh synchronous pause argument claims under both policies and protocol versions; other tools, record text and lifecycle families remain unqualified');
}
