import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {plan,allTasks,allShards} from '/workspace/run-uptime/scripts/verification-plan.mjs';
import {planVerification} from '/workspace/run-uptime/scripts/verify-plan.mjs';
const packet=process.env.HOME+'/rer-consolidation/work/main-uptime-stranger33-trips-1-c1/packet';
const before=JSON.parse(await readFile(packet+'/shards-before.json','utf8'));
const shape=tasks=>tasks.map(t=>[t.name,t.commands,t.hosted??false]).sort((a,b)=>a[0].localeCompare(b[0]));
const expected=shape(before.push.flatMap(s=>s.tasks));
assert.deepEqual(shape(allTasks),expected);
for(const [label,shards] of [['before',before.push],['push',plan.push],['nightly',plan.nightly],['release',allShards]]){
 const tasks=shards.flatMap(s=>s.tasks);
 assert.equal(shards.length,8);
 assert.equal(new Set(tasks.map(t=>t.name)).size,tasks.length);
 assert.deepEqual(shape(tasks),expected);
 for(const shard of shards){
  assert.equal(shard.browser,true);
  assert.equal(shard.engines,shard.tasks.some(t=>t.name==='flow-journey')?'all':'chromium');
  assert.equal(shard.evidence,shard.tasks.some(t=>t.name==='browser-suites'));
 }
 console.log(`${label}: ${tasks.length} journeys assigned exactly once in ${shards.length} shards`);
 for(const s of shards) console.log(`${s.name}: ${s.tasks.map(t=>t.commands.at(-1)).join(' ; ')}`);
}
assert.deepEqual(plan.nightly,before.nightly);
assert.deepEqual(allShards,before.nightly);
for(const tier of ['push','nightly','all']){
 const out=await planVerification({env:{TIER:tier},plan});
 const selected=[...new Map(out.matrix.include.map(s=>[s.name,s])).values()];
 assert.equal(selected.length,8);
 const matrix=JSON.parse(execFileSync('node',['.github/scripts/verify-ci.mjs','--matrix',tier==='push'?'push':'all'],{encoding:'utf8'})).include;
 assert.deepEqual(matrix.map(s=>s.name),selected.map(s=>s.name));
 for(const s of matrix){const source=(tier==='push'?plan.push:allShards).find(t=>t.name===s.name);for(const key of ['browser','engines','evidence'])assert.equal(s[key],source[key]);}
}
const mean=plan.push.reduce((s,b)=>s+b.seconds,0)/8,max=Math.max(...plan.push.map(b=>b.seconds));
console.log(`Push scheduling estimates: mean ${mean}s, max ${max}s, ratio ${max/mean}. Estimates are not measured CI durations.`);
assert(max<1.5*mean);
await writeFile(packet+'/shards-after.json',JSON.stringify(plan,null,2)+'\n');
console.log('PASS: complete coverage, unchanged task commands, unchanged nightly/release allocation, tier matrices, browser engines and evidence routing.');
