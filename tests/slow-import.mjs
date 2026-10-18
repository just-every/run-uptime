// SLOW-001: source rules enter through the same reviewed owner routes as the console.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './resilience/support.mjs';

test('saved Pingdom and Site24x7 thresholds preview without changing a monitor or inventing timeout semantics',{timeout:30000},async()=>{
 const f=await fixture();
 try{
  const monitor=await f.monitor({name:'Import performance policy',runners:[f.first],enabled:false,timeoutMs:10000});
  const path=`/api/monitors/${monitor.id}/slow-policy/import-preview`;
  const rule={severity:2,comparison_operator:1,value:2000,strategy:1,polls_check:3};
  const profile={code:0,message:'success',data:{type:'URL',profile_type:1,response_time_threshold:{primary:[rule,{...rule,severity:3,value:3000,polls_check:2}],secondary:[{...rule,value:1000,polls_check:5}]}}};
  const input={source:'site24x7',document:profile,scope:'primary',locations:['local-a'],severity:2};
  const preview=await f.request(path,{body:input});assert.equal(preview.status,200);assert.equal(preview.data.slow.thresholdMs,2000);assert.equal(preview.data.slow.slots,3);assert.deepEqual(preview.data.slow.locations,['local-a']);
  const selected=await f.request(path,{body:{...input,scope:'secondary'}});assert.equal(selected.status,200);assert.equal(selected.data.slow.thresholdMs,1000);
  const critical=await f.request(path,{body:{...input,severity:3}});assert.equal(critical.status,200);assert.equal(critical.data.slow.thresholdMs,3000);
  for(const changed of [{comparison_operator:3},{strategy:2},{strategy:11},{polls_check:0},{value:10000},{value:'2000'}]){
   const document=structuredClone(profile);document.data.response_time_threshold.primary=[{...rule,...changed}];assert.equal((await f.request(path,{body:{...input,document}})).status,400);
  }
  for(const extra of [{scope:'all'},{severity:0},{locations:[]},{locations:['foreign-region']}])assert.equal((await f.request(path,{body:{...input,...extra}})).status,400);
  assert.equal((await f.request(path,{body:{source:'betterstack',document:{data:{attributes:{request_timeout:2}}}}})).status,400);
  const untouched=await f.request(`/api/monitors/${monitor.id}/slow-policy`);assert.equal(untouched.data.revision,monitor.revision);assert.equal(untouched.data.slow,null);
  const check={id:123,name:'Migrating checkout',hostname:'checkout.example.test',resolution:1,sendnotificationwhendown:2,type:{http:{encryption:true,verify_certificate:true,url:'/'}}};
  for(const threshold of [1500,10000,-1,'1500']){
   const response=await f.request('/api/definitions/preview?source=pingdom',{body:{check:{...check,responsetime_threshold:threshold}}});
   assert.equal(response.status,200);const plan=response.data;
   if(threshold===1500){assert.equal(plan.entries[0].action,'create');const applied=await f.request(`/api/definitions/apply?source=pingdom&digest=${plan.digest}`,{body:{check:{...check,responsetime_threshold:threshold}}});assert.equal(applied.status,201);const saved=(await f.request('/api/overview')).data.monitors.find(m=>m.definition.name===check.name).definition;assert.equal(saved.slow.thresholdMs,1500);assert.deepEqual(saved.assertions.status,['2xx','3xx']);assert.equal(saved.timeoutMs,10000);assert.equal(saved.enabled,false)}else assert.equal(plan.entries[0].action,'refused');
  }
 }finally{await f.close()}
});
