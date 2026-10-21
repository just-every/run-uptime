import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import {createClock} from '../runners/src/clock.mjs';
import {executeTaskProbe} from '../runners/src/execute-task.mjs';
import {authFixture} from './tls-auth-support.mjs';
import {fixture as installation} from './resilience/support.mjs';
import {availablePorts} from './notify-acceptance-runtime.mjs';
import {FIXTURE_EMAIL,FIXTURE_PASSWORD,startFlowFixture} from './flow-fixture.mjs';
const [token,item,password,responseSecret,liveOrder]=Array.from({length:5},()=>randomBytes(24).toString('base64url'));
const liveToken=`sk_live_${randomBytes(16).toString('hex')}`,testToken=`sk_test_${randomBytes(16).toString('hex')}`;
const serializedSafe = (value,extra=[]) => {const text=JSON.stringify(value);for (const secret of [token,item,password,responseSecret,liveOrder,liveToken,testToken,...extra]) assert.equal(text.includes(secret),false,'Transaction evidence retains no request or extracted values')};
const waitFor = async (check,label) => {for (const end=Date.now()+15000;Date.now()<end;await new Promise(resolve=>setTimeout(resolve,20)))if(await check())return;throw Error(`Timed out waiting for ${label}`)};
const rehash = archive => ({payload:archive.payload,sha256:createHash('sha256').update(JSON.stringify(archive.payload)).digest('hex')});
test('API-004 sandbox setup/teardown, cancellation, denied cleanup, retained debt and explicit operator resolution without a live charge',async()=>{
  const state={wrong:false,expired:false,missing:false,hold:false,deny:false,deleted:0};
  const h=await authFixture((request,res)=>{
    res.setHeader('content-type','application/json');
    if (request.url==='/login') {assert.deepEqual(JSON.parse(request.body),{password});res.end(JSON.stringify({token}));return}
    if (request.url==='/live-login') {res.end(JSON.stringify({token:liveToken}));return}
    if (request.url==='/test-login') {res.end(JSON.stringify({token:testToken}));return}
    if (request.url==='/orders'&&request.method==='POST') {if(![`Bearer ${liveToken}`,`Bearer ${testToken}`].includes(request.headers.authorization)){res.statusCode=401;res.end('{}');return}res.statusCode=201;res.end(JSON.stringify({id:liveOrder,livemode:true}));return}
    if (request.url===`/orders/${liveOrder}`&&request.method==='DELETE') {res.end(JSON.stringify({cancelled:true}));return}
    if (request.headers.authorization!==`Bearer ${token}` || state.expired) {res.statusCode=401;res.end(JSON.stringify({error:responseSecret}));return}
    if (request.url==='/items'&&request.method==='POST') {assert.deepEqual(JSON.parse(request.body),{label:'scheduled item'});res.statusCode=201;res.end(JSON.stringify(state.missing?{}:{id:item}));return}
    if (request.url===`/items/${item}`&&request.method==='GET') {if(state.hold)return;res.end(JSON.stringify({ready:state.wrong?responseSecret:true}));return}
    // A denied cleanup is cut at the socket, as a network edge refusing it would.
    if (request.url===`/items/${item}`&&request.method==='DELETE') {if(state.deny){res.socket.destroy();return}state.deleted++;res.end(JSON.stringify({deleted:true}));return}
    res.statusCode=404;res.end('{}');
  });
  try {
    const url=path=>h.url(path,'auth.example.test'), auth={authorization:'Bearer {{session}}'}, controlPort=Number(new URL(h.f.origin).port);
    const debts=async id=>{const r=await h.f.request(`/api/monitors/${id}/cleanup-debt`);assert.equal(r.status,200);serializedSafe(r.data);return r.data};
    const api={variables:{label:'scheduled item'},steps:[
      {name:'Login',phase:'setup',url:url('/login'),method:'POST',assertions:{status:200},extract:{session:'$.token'}},
      {name:'Create item',phase:'request',url:url('/items'),method:'POST',headers:{...auth,'content-type':'application/json'},body:'{"label":"{{label}}"}',assertions:{status:201},extract:{item:'$.id'}},
      {name:'Read item',phase:'request',url:url('/items/{{item}}'),method:'GET',headers:auth,assertions:{status:200,json:{path:'$.ready',equals:true}}},
      {name:'Delete item',phase:'cleanup',url:url('/items/{{item}}'),method:'DELETE',headers:auth,assertions:{status:200,json:{path:'$.deleted',equals:true}}},
    ]};
    const monitor=await h.create({type:'api',name:'Inventory API journey',url:url('/login'),api,request:{credentialRef:'transaction-login'},timeoutMs:10000,retries:0});
    const credential={monitorId:monitor.id,origin:new URL(url('/login')).origin,body:JSON.stringify({password})};
    await h.write('transaction-login',credential);
    let task=await h.claim(monitor.id), result=await h.run(task);
    assert.equal(result.outcome,'pass');assert.equal(result.apiTransaction.cleanup.passed,1);assert.equal(state.deleted,1);
    assert.deepEqual(result.apiTransaction.steps.map(step=>step.outcome),['pass','pass','pass','pass']);serializedSafe(result);
    assert.deepEqual(result.apiTransaction.steps.map(step=>step.attempts),[1,1,1,1],'Every step retains its attempt count');
    const offset=5000,clock=createClock();clock.observe(0,0,offset);
    const local={...result,startedAt:result.startedAt-offset,completedAt:result.completedAt-offset,apiTransaction:{...result.apiTransaction,steps:result.apiTransaction.steps.map(step=>({...step,startedAt:step.startedAt-offset,completedAt:step.completedAt-offset}))}};
    const aligned=clock.align(local,{dueAt:task.dueAt});assert.deepEqual(aligned,result,'Worker clock alignment preserves every step timing and duration');
    await h.submit(task,aligned);
    state.wrong=true;task=await h.manual(monitor.id);result=await h.run(task);
    assert.equal(result.outcome,'target_failure');assert.deepEqual(result.apiTransaction.steps.map(step=>step.outcome),['pass','pass','target_failure','pass']);assert.equal(state.deleted,2);serializedSafe(result);
    assert.equal(result.apiTransaction.cleanup.passed,1,'A failed business requirement still runs cleanup');
    const tampered=structuredClone(result);tampered.apiTransaction.steps[2].checks[1].reason=responseSecret;
    const rejected=await h.f.submit(h.f.first,task,[{...tampered,attempt:0,canary:await h.canary(task)}]);assert.equal(rejected.status,400,'Signed evidence refuses arbitrary response diagnostics');
    await h.submit(task,result);state.wrong=false;
    const detail=await h.f.request(`/api/monitors/${monitor.id}/history`);assert.equal(detail.status,200);serializedSafe(detail.data);
    // The target reports the item created but its identifier never arrives: cleanup cannot run, so it is debt, never a guessed request.
    state.missing=true;task=await h.manual(monitor.id);result=await h.run(task);assert.equal(result.outcome,'target_failure');assert.equal(result.apiTransaction.steps[1].checks.at(-1).assertion,'extract');assert.equal(result.apiTransaction.steps[1].checks.at(-1).pass,false);
    assert.equal(result.apiTransaction.cleanup.failed,1);assert.equal(result.apiTransaction.steps[3].checks[0].assertion,'variable');assert.equal(state.deleted,2,'No cleanup request is fabricated without its value');serializedSafe(result);await h.submit(task,result);state.missing=false;
    assert.deepEqual((await debts(monitor.id)).open.map(d=>[d.step,d.attempts,d.category]),[['Delete item',0,'variable']]);
    // A cancellation mid-request stops the journey; cleanup still runs inside its reserve and the run is Unknown, never a pass.
    state.hold=true;task=await h.manual(monitor.id);const reads=()=>h.records.filter(r=>r.url===`/items/${item}`&&r.method==='GET').length,before=reads(),cancel=new AbortController();
    const running=executeTaskProbe(task,task.probes[0],{controlPort,signal:cancel.signal});await waitFor(()=>reads()>before,'the held read');cancel.abort();result=await running;state.hold=false;
    assert.equal(result.outcome,'runner_error');assert.equal(result.apiTransaction.cancelled,true);assert.deepEqual(result.apiTransaction.steps.map(step=>step.outcome),['pass','pass','runner_error','pass']);
    assert.equal(result.apiTransaction.steps[2].checks[0].assertion,'cancelled');assert.equal(state.deleted,3,'Cleanup ran after the cancellation');serializedSafe(result);await h.submit(task,result);
    // Cleanup denied at the network edge makes its bounded attempts and is retained with its failure category.
    const deletes=()=>h.records.filter(r=>r.url===`/items/${item}`&&r.method==='DELETE').length,deleteCount=deletes();
    state.deny=true;task=await h.manual(monitor.id);result=await h.run(task);
    assert.equal(deletes()-deleteCount,3,'A denied cleanup makes exactly its bounded attempts');assert.equal(result.apiTransaction.steps[3].attempts,3);assert.equal(result.apiTransaction.cleanup.failed,1);serializedSafe(result);await h.submit(task,result);
    const category=result.apiTransaction.steps[3].checks[0].assertion;assert.match(category,/^(connection|transport)$/);
    assert.deepEqual((await debts(monitor.id)).open.map(d=>[d.step,d.attempts,d.category]),[['Delete item',3,category],['Delete item',0,'variable']]);
    state.expired=true;task=await h.manual(monitor.id);result=await h.run(task);
    assert.equal(result.outcome,'target_failure');assert.deepEqual(result.apiTransaction.steps.map(step=>step.outcome),['pass','target_failure','skipped','skipped']);assert.equal(result.apiTransaction.steps[1].status,401);assert.equal(result.apiTransaction.cleanup.skipped,1);serializedSafe(result);await h.submit(task,result);state.expired=false;
    assert.equal((await debts(monitor.id)).open.length,2,'A request that created nothing leaves no debt');
    task=await h.manual(monitor.id);result=await h.run(task);await h.submit(task,result);
    assert.equal((await debts(monitor.id)).open.length,3);
    // At the limit, the next scheduled run refuses setup and reads Unknown with the named reason; nothing reaches the target.
    await h.f.DB.prepare('UPDATE monitors SET next_due=? WHERE id=?').bind(Date.now(),monitor.id).run();
    task=await h.claim(monitor.id);assert.deepEqual(task.cleanupDebt,{open:3,limit:3});const sent=h.records.length;result=await h.run(task);
    assert.equal(result.outcome,'runner_error');assert.equal(result.checks[0].assertion,'debt');assert.equal(h.records.length,sent,'No setup request while the debt limit holds');await h.submit(task,result);
    const unknown=await h.f.state(monitor.id);assert.equal(unknown.state,'Unknown');assert.match(unknown.reason,/Setup refused: 3 cleanup debts are open/);
    // Only the owner resolves debt, idempotently, with a note and an anonymized audit entry; the evidence stays.
    const [first]=(await debts(monitor.id)).open,resolve=body=>h.f.request(`/api/monitors/${monitor.id}/cleanup-debt/${encodeURIComponent(first.id)}/resolve`,{body});
    assert.equal((await resolve({note:''})).status,400);assert.equal((await h.f.request(`/api/monitors/${monitor.id}/cleanup-debt/absent/resolve`,{body:{note:'x'}})).status,404);
    const resolved=await resolve({note:'Deleted the scheduled item by hand'});assert.equal(resolved.status,200);assert.equal(resolved.data.debt.state,'resolved');
    const again=await resolve({note:'A second note'});assert.deepEqual(again.data,resolved.data,'Resolving again changes nothing');
    assert.equal((await h.f.DB.prepare("SELECT COUNT(*) n FROM uptime_audit WHERE action='cleanup_debt_resolve' AND actor_kind='operator'").first()).n,1);
    assert.ok(await h.f.DB.prepare('SELECT 1 FROM observations WHERE id=?').bind(first.observationId).first(),'Resolution keeps the evidence the debt came from');
    state.deny=false;task=await h.manual(monitor.id);assert.equal(task.cleanupDebt.open,2);result=await h.run(task);assert.equal(result.outcome,'pass');await h.submit(task,result);
    assert.deepEqual((await debts(monitor.id)).open.length,2,'A later passing run never closes debt');
    // Live effects: a Stripe live-mode key or a livemode response needs an exact unexpired grant under its spend limit.
    const liveApi=login=>({variables:{},steps:[{name:'Login',phase:'setup',url:url(login),method:'POST',assertions:{status:200},extract:{session:'$.token'}},
      {name:'Create order',phase:'request',url:url('/orders'),method:'POST',headers:{...auth,'content-type':'application/json'},body:'{"amount":1200}',assertions:{status:201},extract:{order:'$.id'}},
      {name:'Cancel order',phase:'cleanup',url:url('/orders/{{order}}'),method:'DELETE',headers:auth,assertions:{status:200}}]});
    const live=await h.create({type:'api',name:'Live order API',url:url('/live-login'),api:liveApi('/live-login'),timeoutMs:10000,retries:0});
    const orders=()=>h.records.filter(r=>r.url==='/orders').length,grant=body=>h.f.request(`/api/monitors/${live.id}/effect-grants`,{body});
    task=await h.claim(live.id);assert.equal(task.effectGrants,undefined,'The installation default is no grant');let placed=orders();result=await h.run(task);
    assert.equal(result.outcome,'runner_error');assert.equal(result.apiTransaction.steps[1].checks[0].assertion,'grant');assert.equal(orders(),placed,'A live-mode credential sends nothing without a grant');assert.equal(result.apiTransaction.steps[2].outcome,'skipped');serializedSafe(result);await h.submit(task,result);
    assert.equal((await grant({effect:'live-payment',spendLimit:5000,expiresAt:Date.now()+48*3600000})).status,400,'A grant expires within its bound');
    assert.equal((await grant({effect:'live-payment',spendLimit:5000,expiresAt:Date.now()+60000})).status,201);
    task=await h.manual(live.id);assert.equal(task.effectGrants.length,1);result=await h.run(task);
    assert.equal(result.outcome,'pass');assert.deepEqual(result.apiTransaction.steps.map(step=>[step.effect,step.spend]),[[undefined,undefined],['live-payment',1200],['live-payment',1]]);serializedSafe(result);await h.submit(task,result);
    assert.equal((await h.f.request(`/api/monitors/${live.id}/effect-grants`)).data.grants[0].spent,1201);
    assert.equal((await grant({effect:'live-payment',spendLimit:1000,expiresAt:Date.now()+60000})).status,201);
    task=await h.manual(live.id);placed=orders();result=await h.run(task);assert.equal(result.apiTransaction.steps[1].checks[0].assertion,'grant');assert.equal(orders(),placed,'A spend above the grant limit sends nothing');await h.submit(task,result);
    assert.equal((await grant({effect:'live-payment',spendLimit:5000,expiresAt:Date.now()+1500})).status,201);
    task=await h.manual(live.id);assert.equal(task.effectGrants.length,1);await new Promise(resolve=>setTimeout(resolve,1600));placed=orders();result=await h.run(task);
    assert.equal(result.apiTransaction.steps[1].checks[0].assertion,'grant');assert.equal(orders(),placed,'An expired grant is refused at the attempt itself');await h.submit(task,result);
    task=await h.manual(live.id);assert.equal(task.effectGrants,undefined);result=await h.run(task);assert.equal(result.apiTransaction.steps[1].checks[0].assertion,'grant');await h.submit(task,result);
    const grants=(await h.f.request(`/api/monitors/${live.id}/effect-grants`)).data.grants;assert.deepEqual(grants.map(g=>g.revision),[3,2,1],'Grants are revisioned');
    assert.equal((await h.f.DB.prepare("SELECT COUNT(*) n FROM uptime_audit WHERE action='effect_grant_change'").first()).n,3);
    // A test-mode key whose response says livemode: true is refused after the fact, and what it created is retained as debt.
    assert.equal((await h.f.request(`/api/monitors/${live.id}/effect-grants/revoke`,{body:{effect:'live-payment'}})).status,200);
    assert.equal((await h.f.request(`/api/monitors/${live.id}`,{method:'PATCH',body:{...live.definition,url:url('/test-login'),api:liveApi('/test-login')}})).status,200);
    task=await h.manual(live.id);result=await h.run(task);
    assert.equal(result.outcome,'runner_error');assert.equal(result.apiTransaction.steps[1].checks[0].assertion,'grant');assert.equal(result.apiTransaction.steps[2].checks[0].assertion,'variable');serializedSafe(result);await h.submit(task,result);
    assert.deepEqual((await debts(live.id)).open.map(d=>[d.step,d.category]),[['Cancel order','variable']]);
    // Debt travels in archives, restores exactly, and a pre-migration archive restores every row; grants stay local.
    const archive=await h.f.request('/api/archive');assert.equal(archive.status,200);serializedSafe(archive.data);
    const archived=archive.data.payload.productTables.cleanup_debt;assert.equal(archived.length,4);assert.equal(archive.data.payload.productTables.effect_grants,undefined);
    const receiving=await installation();
    try {
      assert.equal((await receiving.request('/api/restore',{body:{archive:archive.data}})).status,200);
      assert.deepEqual((await receiving.DB.prepare('SELECT * FROM cleanup_debt ORDER BY rowid').all()).results,archived);
      assert.equal((await receiving.DB.prepare('SELECT COUNT(*) n FROM effect_grants').first()).n,0);
    } finally {await receiving.close()}
    const prior=structuredClone(archive.data);prior.payload.extensionVersion=8;delete prior.payload.productTables.cleanup_debt;delete prior.payload.productTables.notification_delivery_attempts;
    const older=await installation();
    try {
      assert.equal((await older.request('/api/restore',{body:{archive:rehash(prior)}})).status,200);
      assert.equal((await older.DB.prepare('SELECT COUNT(*) n FROM observations').first()).n,archive.data.payload.tables.observations.length);
      assert.equal((await older.DB.prepare('SELECT COUNT(*) n FROM cleanup_debt').first()).n,0);
    } finally {await older.close()}
    // Monitor erasure removes its debt and grants with it.
    assert.equal((await h.f.request(`/api/monitors/${live.id}/erase`,{body:{name:live.definition.name}})).status,200);
    assert.equal((await h.f.DB.prepare('SELECT COUNT(*) n FROM cleanup_debt WHERE monitor_id=?').bind(live.id).first()).n,0);
    assert.equal((await h.f.DB.prepare('SELECT COUNT(*) n FROM effect_grants WHERE monitor_id=?').bind(live.id).first()).n,0);
    await h.f.pause((await h.f.request(`/api/overview?monitor=${monitor.id}`)).data.monitors[0]);
    const expiredMonitor=await h.create({type:'api',name:'Expired local API authority',url:url('/login'),api,request:{credentialRef:'transaction-login'},timeoutMs:10000,retries:0});
    await h.write('transaction-login',{...credential,monitorId:expiredMonitor.id,expiresAt:Date.now()-1});task=await h.claim(expiredMonitor.id);const before2=h.records.length;result=await h.run(task);
    assert.equal(result.outcome,'runner_error','Unavailable local authentication keeps coverage Unknown');assert.equal(result.apiTransaction.steps[0].checks[0].assertion,'credential');assert.equal(result.apiTransaction.cleanup.skipped,1);assert.equal(h.records.length,before2,'Expired local authentication sends no target request');serializedSafe(result);await h.submit(task,result);
    assert.equal((await h.f.state(expiredMonitor.id)).state,'Unknown');
    for (const replacement of [
      {...api,steps:api.steps.map((step,i)=>i===1?{...step,url:'https://{{session}}/items'}:step)},
      {...api,steps:api.steps.map((step,i)=>i===1?{...step,url:'https://other.example.test/items'}:step)},
      {...api,steps:api.steps.map((step,i)=>i===1?{...step,headers:{authorization:'Bearer literal-private-value'}}:step)},
      {...api,variables:{...api.variables,staticToken:'literal-private-value'},steps:api.steps.map((step,i)=>i===1?{...step,headers:{authorization:'Bearer {{staticToken}}'}}:step)},
      {...api,steps:api.steps.map((step,i)=>i===1?{...step,effect:'spend-anything'}:step)},
    ]) {const refused=await h.f.request(`/api/monitors/${monitor.id}`,{method:'PATCH',body:{...monitor.definition,api:replacement}});assert.equal(refused.status,400)}
  } finally {await h.close()}
});
test('API-004 browser sandbox checkout runs setup and teardown around the real browser, through cancellation, denied cleanup and the debt limit',async()=>{
  const [syntheticPort]=await availablePorts(1),work=await mkdtemp(join(tmpdir(),'uptime-api004-')),grantPath=join(work,'grant.json'),flowWorkspace=join(work,'flows');
  await mkdir(flowWorkspace,{mode:0o700});
  const site=await startFlowFixture({port:syntheticPort,grantPath}),sandbox=site.seen.sandbox;
  let h;
  try {
    h=await authFixture(()=>{},{UPTIME_SYNTHETIC_PORT:String(syntheticPort)});
    const base=`${site.origin}/s/sandbox-checkout`,endpoint=path=>`${base}/api${path}`,controlPort=Number(new URL(h.f.origin).port);
    const flow={intent:'Sign in and place a sandbox order',steps:[
      {kind:'goto',url:`${base}/login`},{kind:'fill',target:{label:'Email'},credentialRef:'login-email'},{kind:'fill',target:{label:'Password'},credentialRef:'login-password'},
      {kind:'click',target:{role:'button',name:'Sign in'}},{kind:'waitFor',what:'text',value:'Welcome back'},{kind:'click',target:{role:'button',name:'Confirm sandbox order'}},{kind:'expect',what:'url',value:'/s/sandbox-checkout/confirm'}],
      outcomes:[{id:'order-confirmed',what:'text',value:'Order confirmed'}],
      fixtures:{setup:[
        {name:'Create synthetic account',url:endpoint('/accounts'),method:'POST',body:'{}',assertions:{status:201},extract:{account:'$.id'}},
        {name:'Create Stripe test-mode order',url:endpoint('/orders'),method:'POST',headers:{'content-type':'application/json'},body:'{"amount":1200,"account":"{{account}}"}',assertions:{status:201,json:{path:'$.livemode',equals:false}},extract:{order:'$.id'}}],
      teardown:[{name:'Cancel order',url:endpoint('/orders/{{order}}'),method:'DELETE'},{name:'Delete synthetic account',url:endpoint('/accounts/{{account}}'),method:'DELETE'}]}};
    const monitor=await h.f.monitor({type:'flow',network:'synthetic',name:'Sandbox checkout',url:`${base}/login`,flow,runners:[h.f.first],intervalMs:300000,timeoutMs:60000,retries:0});
    for (const [ref,value] of [['login-email',FIXTURE_EMAIL],['login-password',FIXTURE_PASSWORD]]) await h.write(ref,{monitorId:monitor.id,origin:site.origin,value});
    const run=(task,options={})=>executeTaskProbe(task,task.probes[0],{grantPath,controlPort,flowWorkspace,...options});
    const submit=async(task,result)=>{const r=await h.f.submit(h.f.first,task,[{...result,attempt:0}]);assert.equal(r.status,200,JSON.stringify(r.data))};
    const open=async()=>{const r=await h.f.request(`/api/monitors/${monitor.id}/cleanup-debt`);assert.equal(r.status,200);serializedSafe(r.data,sandbox.created);return r.data.open};
    const residue=()=>sandbox.accounts.size+sandbox.orders.size;
    let task=await h.claim(monitor.id),result=await run(task);
    assert.equal(result.outcome,'pass',JSON.stringify(result.checks));assert.deepEqual(result.fixtures.steps.map(step=>[step.name,step.outcome]),[['Create synthetic account','pass'],['Create Stripe test-mode order','pass'],['Cancel order','pass'],['Delete synthetic account','pass']]);
    assert.equal(residue(),0,'Teardown removed every sandbox resource');serializedSafe(result,sandbox.created);await submit(task,result);
    // Cancelled mid-flow: the browser stops, teardown still runs, and the run is recorded as cancelled, never as a pass.
    const dashboards=()=>site.seen.requests.filter(path=>path==='/s/sandbox-checkout/dashboard').length,seen=dashboards(),cancel=new AbortController();
    task=await h.manual(monitor.id);const running=run(task,{signal:cancel.signal});await waitFor(()=>dashboards()>seen,'the signed-in dashboard');cancel.abort();result=await running;
    assert.equal(result.outcome,'runner_error');assert.equal(result.checks[0].assertion,'runner');assert.match(result.checks[0].reason,/^Cancelled/);assert.equal(result.fixtures.cancelled,true);assert.equal(result.fixtures.cleanup.passed,2);
    assert.equal(residue(),0,'A cancelled journey still tears down');serializedSafe(result,sandbox.created);await submit(task,result);
    // Teardown denied at the network edge: bounded attempts, a passing browser verdict, and one retained debt per step.
    const denied=()=>sandbox.calls.filter(call=>call.startsWith('DELETE')).length;let deletes=denied();
    sandbox.deny='all';task=await h.manual(monitor.id);result=await run(task);
    assert.equal(result.outcome,'pass','Teardown never changes the browser verdict');assert.deepEqual(result.fixtures.steps.slice(2).map(step=>step.attempts),[3,3]);assert.equal(denied()-deletes,6);assert.equal(residue(),2);await submit(task,result);
    sandbox.deny='orders';task=await h.manual(monitor.id);result=await run(task);await submit(task,result);sandbox.deny=null;
    const debts=await open();assert.deepEqual(debts.map(d=>[d.step,d.attempts]).sort(),[['Cancel order',3],['Cancel order',3],['Delete synthetic account',3]]);
    // At three open debts the next scheduled run refuses new setup and reads Unknown with the named reason.
    await h.f.DB.prepare('UPDATE monitors SET next_due=? WHERE id=?').bind(Date.now(),monitor.id).run();
    const calls=sandbox.calls.length;task=await h.claim(monitor.id);result=await run(task);
    assert.equal(result.outcome,'runner_error');assert.equal(result.checks[0].assertion,'debt');assert.equal(sandbox.calls.length,calls,'No synthetic account is created at the limit');await submit(task,result);
    const unknown=await h.f.state(monitor.id);assert.equal(unknown.state,'Unknown');assert.match(unknown.reason,/Setup refused/);
    const resolved=await h.f.request(`/api/monitors/${monitor.id}/cleanup-debt/${encodeURIComponent(debts[0].id)}/resolve`,{body:{note:'Cancelled the order in the Stripe test dashboard'}});assert.equal(resolved.status,200);
    task=await h.manual(monitor.id);result=await run(task);assert.equal(result.outcome,'pass');assert.ok(sandbox.calls.length>calls,'Setup runs again once a debt is resolved');await submit(task,result);
    assert.equal((await open()).length,2,'A later passing run never closes debt');
    const history=await h.f.request(`/api/monitors/${monitor.id}/history`),archive=await h.f.request('/api/archive');serializedSafe(history.data,sandbox.created);serializedSafe(archive.data,sandbox.created);
    assert.equal(archive.data.payload.productTables.cleanup_debt.length,3);
  } finally {await h?.close();await site.close();await rm(work,{recursive:true,force:true})}
});
