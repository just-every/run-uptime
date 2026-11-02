import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {randomUUID} from 'node:crypto';
import {accessToken,autonomousPolicy} from '../src/base/modules/agent-door/conformance/crypto.mjs';
import {auditRows} from '../src/base/modules/agent-door/conformance/audit.mjs';
import {allDeliveredMessages} from './mail-provider-fixture.mjs';

// A separate paused monitor keeps these person-only actions independent of the
// retained Pause and independent-reviewer journeys. No runner is dispatched.
export async function provePersonActionRefusals({c,native,call,origin,db,providerRequests,sponsorId,reviewerSub,reviewerId,reviewerCookie}){
 const previousPolicy=c.document,networkBefore=structuredClone(providerRequests),mailBefore=allDeliveredMessages().length;
 const noTraffic=()=>{
  assert.ok(isDeepStrictEqual(providerRequests,networkBefore),'no provider traffic during person-action qualification');
  assert.equal(allDeliveredMessages().length,mailBefore,'no mail during person-action qualification');
 };
 const snapshot=async()=>{
  const tables=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT GLOB '_cf_*' ORDER BY name").all()).results;
  return Object.fromEntries(await Promise.all(tables.map(async({name})=>[name,(await db.prepare(`SELECT * FROM "${name.replaceAll('"','""')}" ORDER BY rowid`).all()).results])));
 };
 const unchanged=async before=>{
  const after=await snapshot();
  assert.deepEqual(Object.keys(after),Object.keys(before),'refusal retains every durable table');
  // Do not dump credential or session rows into an assertion failure.
  for(const table of Object.keys(before))assert.ok(isDeepStrictEqual(after[table],before[table]),`${table}: person-only refusal changes no durable row`);
  noTraffic();
 };
 const person=async(path,body)=>{
  const response=await call(path,body,{cookie:reviewerCookie});
  assert.equal(response.status,200,'the authorized native reviewer session is actionable');
  return response.json();
 };
 const refuse=async(path,body,token,before)=>{
  for(const headers of [{authorization:'Bearer '+token},{authorization:'Bearer '+token,cookie:reviewerCookie}]){
   const response=await call(path,body,headers);
   assert.equal(response.status,403,'agent bearer cannot perform a person action, even with the legitimate person cookie');
   assert.deepEqual(await response.json(),{code:'person_session_required'});
   await unchanged(before);
  }
 };
 const monitor=await native('/api/monitors',{name:'synthetic-uptime-person-actions',type:'http',network:'public',url:'https://example.com/health',method:'GET',assertions:{status:200},intervalMs:60000,timeoutMs:5000,retries:0,probes:['local-a'],failureQuorum:1,confirmSlots:1,recoverSlots:1,freshnessMs:120000,enabled:false});
 const target={kind:'monitor',id:monitor.id},original=await native('/api/v1/monitors/'+monitor.id);
 assert.equal(original.enabled,false);
 const approvalPolicy=autonomousPolicy();
 approvalPolicy.rules=[{id:'person-approval',class:'*',do:'approval',approver:['person:'+reviewerSub],wait:'PT1H'}];
 await c.adopt(approvalPolicy);
 const token=await accessToken(c),args={id:monitor.id,version:monitor.revision,expected_revision:monitor.revision,definition:{name:'synthetic-uptime-person-approved'},idempotency_key:randomUUID()};
 const pending=await c.tool('uptime.monitors.update',args,{token});
 assert.equal(pending.status,200);assert.equal(pending.result?.resultType,'input_required');
 assert.equal(pending.result.structuredContent,undefined);
 assert.equal(pending.decision.disposition,'approval');
 const handle=pending.result._meta['com.runeditrun/approval'];assert.ok(handle.id);
 const approvalPath='/agents/api/approvals/'+encodeURIComponent(handle.id);
 const view=(await person(approvalPath)).approval;
 assert.equal(view.state,'pending');assert.deepEqual(view.approvals,[]);
 assert.equal(view.revision,pending.decision.revision);assert.match(view.summary_sha256,/^[a-f0-9]{64}$/);
 assert.deepEqual(view.summary.nativeTarget,target);
 const decision={revision:view.revision,summary_sha256:view.summary_sha256};
 const approvalBefore=await snapshot();
 await refuse(approvalPath+'/approve',decision,token,approvalBefore);
 assert.deepEqual((await person(approvalPath)).approval,view,'both bearer refusals retain the exact pending approval and its empty marks');
 assert.deepEqual(await native('/api/v1/monitors/'+monitor.id),original,'refused approval retains the native definition and revision');
 const approved=(await person(approvalPath+'/approve',decision)).approval;
 assert.equal(approved.state,'executed');assert.equal(approved.code,null);
 assert.equal(approved.approvals.length,1);assert.equal(approved.approvals[0].person,reviewerId);
 assert.equal(approved.approvals[0].ref,'person:'+reviewerSub);
 assert.ok(Number.isFinite(Date.parse(approved.approvals[0].at)));
 const current=await native('/api/v1/monitors/'+monitor.id);
 assert.equal(current.name,args.definition.name);assert.equal(current.revision,original.revision+1);assert.equal(current.enabled,false);
 const {rows,differs}=await auditRows(c);assert.equal(differs,0);
 const executions=rows.filter(row=>row.decision_id===pending.decision.id);
 assert.equal(executions.length,1);
 const execution=executions[0];
 assert.equal(execution.outcome,'done');assert.deepEqual(execution.approval,{id:handle.id,by:[reviewerId]});
 assert.equal(execution.sponsor.id,sponsorId);assert.equal(execution.agent.id,c.agentId);assert.deepEqual(execution.resource,target);
 const prepared=JSON.parse((await db.prepare('SELECT principal FROM uptime_agent_revisions WHERE monitor_id=? AND revision=?').bind(monitor.id,current.revision).first()).principal);
 assert.deepEqual(prepared.approvers.map(person=>person.id),[reviewerId]);
 assert.equal(prepared.agent.id,c.agentId);assert.equal(prepared.person.id,sponsorId);
 noTraffic();
 console.log(`PROBE BASE-AGENT-008 acceptance-2-approval: current MCP agent bearer, alone and with the authorized reviewer cookie, POST exact pending approval revision and summary -> 403 person_session_required; all ${Object.keys(approvalBefore).length} durable tables unchanged; identical person-only POST executes one paused rename attributed to the reviewer and agent preparer, no provider traffic`);

 const reviewPolicy=autonomousPolicy();
 reviewPolicy.rules=[{id:'person-review',class:'*',do:'review'}];reviewPolicy.reviewers=['person:'+reviewerSub];
 await c.adopt(reviewPolicy);
 const reviewToken=await accessToken(c);
 const reviewed=await c.tool('uptime.monitors.update',{id:monitor.id,version:current.revision,expected_revision:current.revision,definition:{name:'synthetic-uptime-person-review'},idempotency_key:randomUUID()},{token:reviewToken});
 assert.equal(reviewed.result?.isError,false);
 assert.equal(reviewed.decision.disposition,'review');
 const reviewHandle=reviewed.result._meta['com.runeditrun/review'];assert.ok(reviewHandle.id);
 const reviewPath='/agents/api/reviews/'+encodeURIComponent(reviewHandle.id);
 const reviewView=(await person('/agents/api/reviews')).reviews.find(row=>row.id===reviewHandle.id);
 assert.ok(reviewView,'the native reviewer can read the genuinely open review');
 assert.equal(reviewView.state,'open');assert.equal(reviewView.marked_by,null);assert.equal(reviewView.marked_at,null);
 assert.equal(reviewView.decision_id,reviewed.decision.id);assert.deepEqual(reviewView.summary.nativeTarget,target);
 const reviewMonitor=await native('/api/v1/monitors/'+monitor.id);
 assert.equal(reviewMonitor.name,'synthetic-uptime-person-review');assert.equal(reviewMonitor.revision,current.revision+1);assert.equal(reviewMonitor.enabled,false);
 const reviewBefore=await snapshot(),reviewBody={};
 await refuse(reviewPath+'/reviewed',reviewBody,reviewToken,reviewBefore);
 assert.deepEqual((await person('/agents/api/reviews')).reviews.find(row=>row.id===reviewHandle.id),reviewView,'both bearer refusals retain the open review and its empty mark');
 assert.deepEqual(await native('/api/v1/monitors/'+monitor.id),reviewMonitor,'refused review mark retains the completed native record');
 const marked=(await person(reviewPath+'/reviewed',reviewBody)).review;
 assert.equal(marked.state,'reviewed');assert.equal(marked.marked_by,reviewerId);
 assert.ok(Number.isFinite(Date.parse(marked.marked_at)));
 assert.deepEqual(marked.prepared_by,reviewView.prepared_by);
 const markedRow=await db.prepare('SELECT * FROM agent_door_reviews WHERE id=?').bind(reviewHandle.id).first();
 assert.equal(markedRow.marked_by,reviewerId);assert.equal(markedRow.state,'reviewed');assert.equal(markedRow.marked_at,marked.marked_at);
 for(const table of Object.keys(reviewBefore).filter(name=>!name.startsWith('agent_door_'))){
  const after=await db.prepare(`SELECT * FROM "${table.replaceAll('"','""')}" ORDER BY rowid`).all();
  assert.ok(isDeepStrictEqual(after.results,reviewBefore[table]),`${table}: a person review mark has no native product effect`);
 }
 assert.deepEqual(await native('/api/v1/monitors/'+monitor.id),reviewMonitor);
 // Both permitted name edits remain paused and create no scheduled work.
 const after=await snapshot();
 for(const table of ['slots','observations','notification_jobs','notification_deliveries'].filter(name=>Object.hasOwn(after,name)))assert.ok(isDeepStrictEqual(after[table],approvalBefore[table]),`${table}: no work dispatched`);
 noTraffic();
 console.log(`PROBE BASE-AGENT-008 acceptance-2-reviewed: current MCP agent bearer, alone and with the authorized reviewer cookie, POST existing open review -> 403 person_session_required; all ${Object.keys(reviewBefore).length} durable tables unchanged; identical person-only POST marks reviewed with only the reviewer attributed, native product records unchanged, no provider traffic`);
 await c.adopt(previousPolicy);
}
