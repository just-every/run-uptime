import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './resilience/support.mjs';
import {definitionDoor} from './auth-test-support.mjs';

test('owner creates and definition batches share one atomic monitor capacity; edits remain available',async()=>{
 const f=await fixture(),imports=definitionDoor({origin:f.origin,cookie:f.cookie});
 try{
  const file={format:'uptime.monitors',version:1,monitors:Array.from({length:98},(_,i)=>({name:`Capacity ${i}`,url:`https://capacity.example.test/${i}`}))};
  const preview=await imports.preview(file);assert.equal(preview.status,200);
  const imported=await imports.apply(preview.body);assert.equal(imported.status,200,JSON.stringify(imported.body));
  const count=async table=>(await f.DB.prepare(`SELECT COUNT(*) n FROM ${table}`).first()).n;
  const tables=['monitors','revisions','evidence_generation','definition_batches','definition_batch_entries'];
  const counts=async()=>Object.fromEntries(await Promise.all(tables.map(async table=>[table,await count(table)])));
  const initial=await counts();
  const batchFile={format:'uptime.monitors',version:1,monitors:[{name:'Batch race A',url:'https://capacity.example.test/batch-a'},{name:'Batch race B',url:'https://capacity.example.test/batch-b'}]};
  const batchPlan=await imports.preview(batchFile);assert.equal(batchPlan.body.counts.create,2);
  const [batchRace,singleRace]=await Promise.all([
   imports.apply(batchPlan.body),
   f.request('/api/monitors',{body:{name:'Competing with batch',url:'https://capacity.example.test/competing',enabled:false}})
  ]);
  if(batchRace.status===200){
   assert.equal(batchRace.body.created.length,2);assert.ok(singleRace.status>=400&&singleRace.status<500);assert.equal(await count('monitors'),100);
   const eraseId=batchRace.body.created[0];assert.equal((await f.request(`/api/monitors/${eraseId}/erase`,{body:{name:'Batch race A'}})).status,200);
  }else{
   assert.ok(batchRace.status>=400&&batchRace.status<500);assert.equal(singleRace.status,201);
   const refusedCounts=await counts();for(const table of ['monitors','revisions','evidence_generation'])assert.equal(refusedCounts[table],initial[table]+1);
   for(const table of ['definition_batches','definition_batch_entries'])assert.equal(refusedCounts[table],initial[table],'a losing two-monitor batch leaves no partial rows');
  }
  const before=await counts();assert.equal(before.monitors,99);
  const pending={format:'uptime.monitors',version:1,monitors:[{name:'Import loser',url:'https://capacity.example.test/import'}]};
  const plan=await imports.preview(pending);assert.equal(plan.body.counts.create,1);
  const responses=await Promise.all(['A','B'].map(name=>f.request('/api/monitors',{body:{name:`Concurrent ${name}`,url:'https://capacity.example.test/race',enabled:false}})));
  console.log(JSON.stringify({before:before.monitors,statuses:responses.map(r=>r.status),after:await count('monitors')}));
  assert.deepEqual(responses.map(r=>r.status).sort(),[201,400]);assert.match(responses.find(r=>r.status===400).data.error,/Monitor limit reached/);
  const after=await counts();for(const table of ['monitors','revisions','evidence_generation'])assert.equal(after[table],before[table]+1);
  for(const table of ['definition_batches','definition_batch_entries'])assert.equal(after[table],before[table]);
  const refused=await imports.apply(plan.body);assert.equal(refused.status,409);assert.deepEqual(await counts(),after,'a refused multi-write import leaves no partial rows');
  const created=responses.find(r=>r.status===201).data;
  assert.equal((await f.request(`/api/monitors/${created.id}`,{method:'PATCH',body:{...created.definition,name:'Edited at capacity'}})).status,200);
  assert.equal(await count('monitors'),100);assert.equal(await count('revisions'),after.revisions+1);
 }finally{await f.close()}
});
