import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createClock} from '../runners/src/clock.mjs';
import {authFixture} from './tls-auth-support.mjs';
const token='extracted-token-private-value', item='extracted-item-private-value', password='local-login-private-value', responseSecret='response-private-value';
const serializedSafe = value => {const text=JSON.stringify(value);for (const secret of [token,item,password,responseSecret]) assert.equal(text.includes(secret),false,'Transaction evidence retains no request or extracted values')};
test('API-003 scheduled API login/create/read/delete retains failures, cleanup and expired authority without extracted secrets',async()=>{
  const state={wrong:false,expired:false,missing:false,deleted:0};
  const h=await authFixture((request,res)=>{
    res.setHeader('content-type','application/json');
    if (request.url==='/login') {assert.deepEqual(JSON.parse(request.body),{password});res.end(JSON.stringify({token}));return}
    if (request.headers.authorization!==`Bearer ${token}` || state.expired) {res.statusCode=401;res.end(JSON.stringify({error:responseSecret}));return}
    if (request.url==='/items'&&request.method==='POST') {assert.deepEqual(JSON.parse(request.body),{label:'scheduled item'});res.statusCode=201;res.end(JSON.stringify(state.missing?{}:{id:item}));return}
    if (request.url===`/items/${item}`&&request.method==='GET') {res.end(JSON.stringify({ready:state.wrong?responseSecret:true}));return}
    if (request.url===`/items/${item}`&&request.method==='DELETE') {state.deleted++;res.end(JSON.stringify({deleted:true}));return}
    res.statusCode=404;res.end('{}');
  });
  try {
    const url=path=>h.url(path,'auth.example.test'), auth={authorization:'Bearer {{session}}'};
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
    const offset=5000,clock=createClock();clock.observe(0,0,offset);
    const local={...result,startedAt:result.startedAt-offset,completedAt:result.completedAt-offset,apiTransaction:{...result.apiTransaction,steps:result.apiTransaction.steps.map(step=>({...step,startedAt:step.startedAt-offset,completedAt:step.completedAt-offset}))}};
    const aligned=clock.align(local,{dueAt:task.dueAt});assert.deepEqual(aligned,result,'Worker clock alignment preserves every step timing and duration');
    await h.submit(task,aligned);
    state.wrong=true;task=await h.manual(monitor.id);result=await h.run(task);
    assert.equal(result.outcome,'target_failure');assert.deepEqual(result.apiTransaction.steps.map(step=>step.outcome),['pass','pass','target_failure','pass']);assert.equal(state.deleted,2);serializedSafe(result);
    assert.equal(result.apiTransaction.cleanup.passed,1,'A failed business requirement still runs cleanup');
    const tampered=structuredClone(result);tampered.apiTransaction.steps[2].checks[1].reason=responseSecret;
    const rejected=await h.f.submit(h.f.first,task,[{...tampered,attempt:0,canary:await h.canary(task)}]);assert.equal(rejected.status,400,'Signed evidence refuses arbitrary response diagnostics');
    await h.submit(task,result);
    const detail=await h.f.request(`/api/monitors/${monitor.id}/history`);assert.equal(detail.status,200);serializedSafe(detail.data);
    state.missing=true;task=await h.manual(monitor.id);result=await h.run(task);assert.equal(result.outcome,'target_failure');assert.equal(result.apiTransaction.steps[1].checks.at(-1).assertion,'extract');assert.equal(result.apiTransaction.steps[1].checks.at(-1).pass,false);assert.equal(result.apiTransaction.cleanup.skipped,1);serializedSafe(result);await h.submit(task,result);state.missing=false;
    state.expired=true;task=await h.manual(monitor.id);result=await h.run(task);
    assert.equal(result.outcome,'target_failure');assert.deepEqual(result.apiTransaction.steps.map(step=>step.outcome),['pass','target_failure','skipped','skipped']);assert.equal(result.apiTransaction.steps[1].status,401);assert.equal(result.apiTransaction.cleanup.skipped,1);serializedSafe(result);await h.submit(task,result);
    state.expired=false;await h.f.pause(monitor);
    const expiredMonitor=await h.create({type:'api',name:'Expired local API authority',url:url('/login'),api,request:{credentialRef:'transaction-login'},timeoutMs:10000,retries:0});
    await h.write('transaction-login',{...credential,monitorId:expiredMonitor.id,expiresAt:Date.now()-1});task=await h.claim(expiredMonitor.id);const before=h.records.length;result=await h.run(task);
    assert.equal(result.outcome,'runner_error','Unavailable local authentication keeps coverage Unknown');assert.equal(result.apiTransaction.steps[0].checks[0].assertion,'credential');assert.equal(result.apiTransaction.cleanup.skipped,1);assert.equal(h.records.length,before,'Expired local authentication sends no target request');serializedSafe(result);await h.submit(task,result);
    assert.equal((await h.f.state(expiredMonitor.id)).state,'Unknown');
    const archive=await h.f.request('/api/archive');assert.equal(archive.status,200);serializedSafe(archive.data);
    for (const replacement of [
      {...api,steps:api.steps.map((step,i)=>i===1?{...step,url:'https://{{session}}/items'}:step)},
      {...api,steps:api.steps.map((step,i)=>i===1?{...step,url:'https://other.example.test/items'}:step)},
      {...api,steps:api.steps.map((step,i)=>i===1?{...step,headers:{authorization:'Bearer literal-private-value'}}:step)},
      {...api,variables:{...api.variables,staticToken:'literal-private-value'},steps:api.steps.map((step,i)=>i===1?{...step,headers:{authorization:'Bearer {{staticToken}}'}}:step)},
    ]) {const refused=await h.f.request(`/api/monitors/${monitor.id}`,{method:'PATCH',body:{...monitor.definition,api:replacement}});assert.equal(refused.status,400)}
  } finally {await h.close()}
});
