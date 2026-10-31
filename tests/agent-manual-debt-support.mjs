import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {prepareManualDebt} from './agent-conformance/manual-debt.mjs';
import {nativeHttp} from './agent-conformance/http.mjs';
import {autonomousPolicy} from '../src/base/modules/agent-door/conformance/crypto.mjs';
import {errorCode} from '../src/base/modules/agent-door/conformance/protocol.mjs';

export async function proveManualDebt({c,db,origin,cookie,proof}){
 const http=nativeHttp({request:fetch,origin,cookie});
 const fixture=await prepareManualDebt(http,{name:'synthetic-uptime-manual-boundary',open:1});
 try{
  const {monitor}=fixture,args=()=>({id:monitor.id,version:monitor.revision,idempotency_key:randomUUID()});
  const slots=async()=> (await db.prepare('SELECT * FROM slots WHERE monitor_id=? AND manual=1 ORDER BY id').bind(monitor.id).all()).results;
  const scheduled=async()=>({monitor:await db.prepare('SELECT revision,next_due,state FROM monitors WHERE id=?').bind(monitor.id).first(),
   slots:(await db.prepare('SELECT * FROM slots WHERE monitor_id=? AND manual=0 ORDER BY id').bind(monitor.id).all()).results,
   incidents:await http.json('/api/monitors/'+monitor.id+'/incidents')});
  const selective=autonomousPolicy();selective.rules.push({id:'manual-live',class:'live',do:'approval',approver:['sponsor'],wait:'PT1H'});
  await c.adopt(selective);
  const baseline=await scheduled(),low=await c.tool('uptime.checks.run',args());
  assert.equal(low.result?.isError,false,errorCode(low));assert.equal(low.decision.disposition,'autonomous');
  assert.deepEqual(low.decision.classes.map(item=>item.class),['external'],'one open plus one possible debt stays below the boundary');
  await fixture.execute({manual:true,queue:false,slotId:low.result.structuredContent.slotId});
  assert.equal((await fixture.debts()).open.length,2);
  assert.deepEqual(await scheduled(),baseline,'manual fixture execution preserves scheduled evidence and health');
  const ordinaryRunner=await http.json('/api/runners',{networkLabel:'synthetic-uptime-ordinary-'+randomUUID()});
  const ordinary=await http.json('/api/monitors',{...monitor.definition,type:'http',api:undefined,name:'synthetic-uptime-no-fixtures',url:monitor.definition.url,assignments:{'local-a':{runnerId:ordinaryRunner.runnerId}}});
  const plain=await c.tool('uptime.checks.run',{id:ordinary.id,version:ordinary.revision,idempotency_key:randomUUID()});
  assert.equal(plain.result?.isError,false,errorCode(plain));assert.equal(plain.decision.disposition,'autonomous');
  assert.deepEqual(plain.decision.classes.map(item=>item.class),['external'],'ordinary manual check has no fixture effect');
  const before=await slots(),pending=await c.tool('uptime.checks.run',args());
  assert.equal(pending.decision.disposition,'approval');assert.equal(pending.result.resultType,'input_required');
  assert.deepEqual(pending.decision.classes.map(({class:cls,facts})=>({class:cls,facts})),[
   {class:'external',facts:{measure:1,counterparty:'public'}},{class:'live',facts:{measure:1,service:'monitor:'+monitor.id}},
  ]);
  assert.deepEqual(await slots(),before,'no manual slot before live approval');
  const approvalPath=answer=>'/agents/api/approvals/'+encodeURIComponent(answer.result._meta['com.runeditrun/approval'].id);
  const held=(await c.personJson(approvalPath(pending))).approval;
  assert.equal(held.summary.target.name,monitor.definition.name);
  assert.deepEqual(held.summary.nativeTarget,{kind:'monitor',id:monitor.id});
  assert.ok(held.summary.items.includes('Cleanup debt: 2 open + 1 possible = 3; setup refusal limit: 3.'));
  await proof.capture('manual-cleanup-approval',approvalPath(pending).replace('/agents/api/approvals/','/agents/approvals/'));
  // Replace a debt through real execution and the explicit owner resolution.
  // Count and live facts stay equal; the old summary's debt evidence must fail.
  const old=(await fixture.debts()).open;
  await fixture.execute({manual:true});
  await http.json('/api/monitors/'+monitor.id+'/cleanup-debt/'+encodeURIComponent(old[0].id)+'/resolve',{note:'Removed the synthetic fixture at its authorized target'});
  assert.equal((await fixture.debts()).open.length,2);
  const changed=await slots(),stale=await c.decideApproval(pending);
  assert.equal(stale.ok,true);assert.equal(stale.body.approval.state,'refused');
  assert.equal(stale.body.approval.code,'approval_evidence_changed');
  assert.deepEqual(await slots(),changed,'changed debt evidence cannot release the old held check');
  const freshArgs=args(),fresh=await c.tool('uptime.checks.run',freshArgs);
  assert.equal(fresh.decision.disposition,'approval');assert.deepEqual(await slots(),changed);
  const freshView=(await c.personJson(approvalPath(fresh))).approval;
  assert.notEqual(freshView.summary_sha256,held.summary_sha256);
  const approved=await c.decideApproval(fresh);assert.equal(approved.ok,true);assert.equal(approved.body.approval.state,'executed');
  const queued=await slots();assert.equal(queued.length,changed.length+1);assert.equal(queued.filter(row=>row.status==='queued').length,1);
  const replay=await c.tool('uptime.checks.run',freshArgs);assert.equal(replay.result?.isError,false,errorCode(replay));
  assert.equal(replay.result.structuredContent.policyAdvanced,false);
  assert.equal(replay.result.structuredContent.slotId,queued.find(row=>row.status==='queued').id);
  assert.deepEqual(await slots(),queued,'approved exact-key replay queues no second manual slot');
  assert.deepEqual(await scheduled(),baseline,'approval, debt change and replay do not alter scheduled health or cadence');
  console.log('PROBE SURFACE-006 4: MCP manual API fixture -> below boundary external; 2 + 1 = 3 live held without slots; changed debt identities refuse old approval; fresh approval and replay queue exactly one manual slot; scheduled health unchanged');
 }finally{await fixture.close();await c.adopt(autonomousPolicy())}
}
