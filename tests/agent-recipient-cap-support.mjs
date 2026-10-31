import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {hostedRuntime} from './hosted-auth-runtime.mjs';
import {splitSql} from './migration-support.mjs';
import {authRequest,sessionCookie} from './auth-test-support.mjs';
import {completeSecondFactor} from './mfa-auth-support.mjs';
import {allDeliveredMessages} from './mail-provider-fixture.mjs';
import {signJws,autonomousPolicy} from '../src/base/modules/agent-door/conformance/crypto.mjs';
import {createProtocol,errorCode} from '../src/base/modules/agent-door/conformance/protocol.mjs';
import {auditRows} from '../src/base/modules/agent-door/conformance/audit-rows.mjs';

// The existing emitted-Worker envelope fixes only the clock and transport.
// An independent installation keeps prior journey usage out of this daily cap;
// every owner, policy, MCP and approval request reaches the production handler.
export async function proveRecipientCap({c:parent,bindings,directory}) {
 const now=Date.now(),origin=parent.origin,persist=join(directory,'recipient-cap');
 await mkdir(persist);
 const worker=await hostedRuntime(persist,{...bindings,UPTIME_ORIGIN:origin},undefined,{now});
 try {
  const db=await worker.getD1Database('DB');
  for(const name of(await readdir('migrations')).filter(name=>name.endsWith('.sql')).sort()) {
   for(const sql of splitSql(await readFile(join('migrations',name),'utf8')))await db.prepare(sql).run();
  }
  const fetcher=async(url,init={})=>worker.dispatchFetch('http://local/envelope',{
   method:'POST',redirect:'manual',body:JSON.stringify({url:String(url),method:init.method??'GET',headers:{host:new URL(url).host,...init.headers},...(init.body===undefined?{}:{body:init.body})}),
  });
  const call=authRequest(origin,fetcher),iat=Math.floor(now/1000),signer=parent.signer;
  const claim=await signJws(signer.privateKey,signer.kid,'rer-owner-claim+jwt',{
   v:1,iss:signer.issuer,aud:origin,installationId:signer.installationId,email:bindings.OWNER_EMAIL,jti:randomUUID(),iat,exp:iat+300,
  });
  const cookie=sessionCookie(await call('/auth/owner-claim',{token:claim,displayName:'Recipient policy owner',returnTo:'/app'}));
  await completeSecondFactor(origin,cookie,fetcher,now);
  const native=async(path,body)=>{
   const response=await call(path,body,{cookie});
   assert.ok(response.ok,`${path}: HTTP ${response.status}`);return response.json();
  };
  const settings=await signJws(signer.privateKey,signer.kid,'rer-business-settings+jwt',{
   v:1,iss:signer.issuer,aud:origin,sub:signer.installationId,business:parent.business,email:bindings.OWNER_EMAIL,
   owner_id:parent.person.sub,jti:randomUUID(),iat,exp:iat+300,rev:1,values:{},logo:null,team:null,
  });
  await native('/api/rer/business-settings',{settings});
  const c=createProtocol({fetch:fetcher,origin,surface:parent.surface,signer,
   person:{...parent.person,cookie},business:parent.business,consent:randomUUID(),points:[],
   agentId:'recipient-cap-'+randomUUID(),seq:0,revision:0,now:()=>now,
  });
  const owner=await native('/api/access/self'),destinations=[];
  for(let i=1;i<=4;i++) {
   const name='synthetic-uptime-'+i,address=name+'@'+'example.test';
   const saved=await native('/api/notifications/destinations',{name,kind:'email',address});
   destinations.push({...saved,address});
  }
  const saved=await native('/api/notifications/destinations');
  assert.deepEqual(saved.map(row=>row.address).sort(),destinations.map(row=>row.address).sort(),
   'four distinct saved single-address destinations exist through owner doors');
  assert.ok(saved.every(row=>row.kind==='email'&&row.credentialsAvailable));
  const policy=autonomousPolicy();
  policy.rules.push(
   {id:'external-within-daily-cap',class:'external',seed:'uptime',agent:c.agentId,counterparty:'known',max_per_day:3,do:'autonomous'},
   {id:'external-needs-person',class:'external',do:'approval',approver:['person:'+c.person.sub],wait:'PT1H'},
  );
  await c.adopt(policy);
  const jobs=async()=>(await db.prepare('SELECT * FROM notification_jobs ORDER BY id').all()).results;
  const usage=async()=>(await db.prepare('SELECT * FROM agent_door_usage WHERE agent=? ORDER BY decision_id').bind(c.agentId).all()).results;
  const facts=[{class:'external',facts:{measure:1,counterparty:'known'}}];
  function decision(answer,rule,disposition) {
   assert.equal(answer.status,200);assert.equal(errorCode(answer),null);
   assert.equal(answer.decision.disposition,disposition);
   assert.deepEqual(answer.decision.classes,facts.map(item=>({...item,rule,do:disposition})),
    'the native classifier computes one known outside recipient and the cap chooses its rule');
  }
  async function counted(expected) {
   const rows=await usage();assert.equal(rows.length,expected);
   assert.ok(rows.every(row=>row.at===now),'all daily reservations use the fixed clock without a day transition');
   for(const row of rows)assert.deepEqual(JSON.parse(row.classes),facts);
   assert.equal(rows.reduce((sum,row)=>sum+JSON.parse(row.classes)[0].facts.measure,0),expected);
   return rows;
  }
  const tables=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT GLOB '_cf*' ORDER BY name").all()).results
   .map(row=>row.name).filter(name=>!name.startsWith('agent_door_')&&!['public_rate_limits','oa_limits'].includes(name));
  const product=async()=>{
   const state={};
   for(const name of tables)state[name]=(await db.prepare(`SELECT * FROM "${name.replaceAll('"','""')}"`).all()).results
    .sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
   return state;
  };
  const mailCount=allDeliveredMessages().length,admitted=[],replays=[];
  for(const [index,destination] of destinations.slice(0,3).entries()) {
   const args={id:destination.id,idempotency_key:randomUUID()},before=await jobs();
   const answer=await c.tool('uptime.destinations.test',args);
   decision(answer,'external-within-daily-cap','autonomous');
   assert.equal(answer.result.isError,false);assert.equal(answer.result.structuredContent.queued,true);
   const after=await jobs(),id=answer.result.structuredContent.deliveryId;
   assert.deepEqual(after.filter(row=>row.id!==id),before,'each distinct admitted call adds only its one native job');
   assert.equal(after.length,index+1);
   assert.equal(after.find(row=>row.id===id)?.destination_id,destination.id);
   await counted(index+1);admitted.push(answer);
   if(index===0) {
    const beforeReplay=await product(),usageBefore=await usage();
    const replay=await c.tool('uptime.destinations.test',args);
    decision(replay,'external-within-daily-cap','autonomous');
    assert.deepEqual(replay.result.structuredContent,answer.result.structuredContent);
    assert.deepEqual(await product(),beforeReplay,'immediate exact-key replay adds no job or product effect');
    assert.deepEqual(await usage(),usageBefore,'immediate exact-key replay consumes no additional recipient');
    replays.push(replay);
   }
  }
  const beforeHeld=await product(),usageBeforeHeld=await usage();
  const fourth=await c.tool('uptime.destinations.test',{id:destinations[3].id,idempotency_key:randomUUID()});
  decision(fourth,'external-needs-person','approval');
  assert.equal(fourth.result.resultType,'input_required');assert.equal(fourth.result.structuredContent,undefined);
  assert.deepEqual(await product(),beforeHeld,'past-cap input_required changes no notification, credential, monitoring or other product row');
  assert.deepEqual(await usage(),usageBeforeHeld,'a held call reserves no recipient usage');
  const path='/agents/api/approvals/'+encodeURIComponent(fourth.result._meta['com.runeditrun/approval'].id);
  const view=(await c.personJson(path)).approval;
  assert.deepEqual(view.summary.nativeTarget,{kind:'destination',id:destinations[3].id});
  assert.deepEqual(view.approvers,['person:'+c.person.sub]);
  const approved=await c.decideApproval(fourth);
  assert.equal(approved.ok,true);assert.equal(approved.body.approval.state,'executed');
  const finalJobs=await jobs(),fourthJob=finalJobs.filter(row=>row.destination_id===destinations[3].id);
  assert.equal(finalJobs.length,4);assert.equal(fourthJob.length,1);
  assert.deepEqual(finalJobs.filter(row=>row.id!==fourthJob[0].id),beforeHeld.notification_jobs);
  await counted(4);
  const afterApproval=await product(),afterUsage=await usage();
  assert.equal((await c.decideApproval(fourth)).body.approval.state,'executed');
  assert.deepEqual(await product(),afterApproval,'repeated native person approval creates no fifth job');
  assert.deepEqual(await usage(),afterUsage,'repeated person approval consumes no extra usage');
  const {rows,differs}=await auditRows(c);assert.equal(differs,0,'audit recomputes the retained daily-cap decisions');
  for(const answer of [...admitted,...replays,fourth]) {
   const row=rows.find(row=>row.id===answer.decision.id);assert.ok(row);
   assert.deepEqual(row.classes,facts);assert.equal(row.sponsor.id,owner.id);assert.equal(row.agent.id,c.agentId);
   assert.equal(row.decision,answer.decision.disposition);
   assert.deepEqual(row.rules,answer.decision.classes.map(({facts:_,...rule})=>rule));
   assert.equal(row.outcome,answer===fourth?'pending':replays.includes(answer)?'replayed':'done');
  }
  const execution=rows.find(row=>row.decision_id===fourth.decision.id);assert.ok(execution);
  assert.equal(execution.outcome,'done');assert.equal(execution.decision,'approval');
  assert.deepEqual(execution.classes,facts);assert.deepEqual(execution.approval.by,[owner.id]);
  assert.deepEqual(execution.resource,{kind:'destination',id:destinations[3].id});
  assert.deepEqual((await usage()).map(row=>row.decision_id).sort(),[...admitted.map(answer=>answer.decision.id),execution.id].sort(),
   'durable recipient reservations belong only to the three executions and the approved fourth execution');
  assert.ok(finalJobs.every(row=>row.state==='queued'&&row.attempts===0),'queue admission claims no delivery');
  assert.deepEqual((await product()).notification_delivery_attempts,[],'no provider dispatch was invoked');
  assert.equal(allDeliveredMessages().length,mailCount,'no recipient message was submitted');
  assert.ok(c.points.every(point=>point.ok),JSON.stringify(c.points.filter(point=>!point.ok)));
  console.log('PROBE BASE-AGENT-011 acceptance-2: MCP native queue -> first three distinct saved email recipients admitted; exact-key replay adds no job or usage; fourth input_required preserves product rows; named-person approval creates one fourth job; durable usage and audit agree; no dispatch or day transition');
 } finally {await worker.dispose()}
}
