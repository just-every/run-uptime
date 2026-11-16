// Run Edit Run fleet, 2026-11-16. Offline proof of the workflow's real planner
// and shard runner. Spawn is recorded, so no application journeys run here.
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import * as childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
const [stage, destination] = process.argv.slice(2);
const root = process.cwd();
const {allTasks, allShards, plan} = await import(pathToFileURL(resolve('scripts/verification-plan.mjs')));
const {planVerification} = await import(pathToFileURL(resolve('scripts/verify-plan.mjs')));
const {scripts} = JSON.parse(await readFile('package.json', 'utf8'));
const expected = ['runtime','delivery','protocols','data','transactions','console','identity','operations']
 .flatMap(group => scripts['test:'+group].split(/\s+&&\s+/)).sort();
assert.equal(new Set(expected).size, expected.length);
assert.deepEqual(allTasks.flatMap(task => task.commands.filter(command => command.startsWith('node tests/'))).sort(), expected);
const historical = [534,616,683,516,735,655,865,732];
// Historical estimates are not runtime assertions. Updated whole-file costs use
// the supplied tag timings for five files and the 15 Nov push rebalance for archive.
const costs = Object.fromEntries(plan.nightly.flatMap(shard => shard.tasks.map(task => [task.name, 60])));
Object.assign(costs, {
 'control-runtime':196,'signed-runner':57,'probe-native-evidence':18,'private-network':50,
 'notify-delivery':85,'notification-recovery':335,'notification-fallback':189,'hosted-alerts':10,
 'webhook-custom':14,'protocol-monitors':128,'udp-monitors':54,'mail-journey':114,'ping-monitors':56,
 'tls-auth':34,'archive-roundtrip':270,'definitions-import':60,'erasure-audit':39,'catalog':39,
 'alert-routes':60,'incident-work':120,'read-api':14,'flow-journey':438,'api-transaction-journey':45,
 'browser-suites':134,'hosted-auth-browser':14,'command-journey':286,'operator-security':37,
 'access-matrix':29,'resilience/watches':46,'maintenance-windows':35,'slow-responses':132,
 'reporting':76,'metrics':12,'failure-page-journey':27,'discovery-jobs':140,'alert-drill':29,
 'contact-schedules':130,'public-paths':28,'owner-deploy-lifecycle':81,'business-provisioned':11,
 'owner-editor-browser':52,'agent-door':580,
});
const report = {stage, expectedTestCount:expected.length, historicalPushSeconds:historical, tiers:{}};
for (const [label, ref, tier] of [
 ['branch','refs/heads/cloud/main-uptime-tag-shards-1','push'],
 ['tag','refs/tags/v0.0.0','all'],
 ['nightly','refs/heads/main','nightly'],
]) {
 const env = {GITHUB_EVENT_NAME:label === 'nightly' ? 'schedule' : 'push', GITHUB_REF:ref, TIER:tier};
 const decision = await planVerification({env, plan, fetch:() => {throw Error('Unexpected network access');}});
 assert.equal(decision.tier,tier);
 assert.equal(decision.coverage,'full');
 // Execute the actual workflow CLI --plan with no credential or run identity,
 // which makes branch planning fail closed to full coverage without API calls.
 const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GITHUB_') && !['GH_TOKEN','TIER','UPTIME_VERIFY_BUILD'].includes(key)));
 const output = childProcess.execFileSync(process.execPath,['.github/scripts/verify-ci.mjs','--plan'],{cwd:root,env:{...cleanEnv,...env},encoding:'utf8'});
 const values = Object.fromEntries(output.trim().split('\n').map(line => [line.slice(0,line.indexOf('=')),line.slice(line.indexOf('=')+1)]));
 const matrix = JSON.parse(values.matrix).include;
 assert.equal(values.tier,tier);
 assert.equal(values.has_shards,'true');
 assert.equal(matrix.length,8);
 assert.equal(new Set(matrix.map(shard => shard.name)).size,matrix.length);
 const allocation = tier === 'push' ? plan.push : tier === 'nightly' ? plan.nightly : allShards;
 const selected = matrix.map(item => {
  const shard = allocation.find(shard => shard.name === item.name);
  assert.ok(shard);
  assert.deepEqual(item,{name:shard.name,browser:shard.browser,engines:shard.engines,evidence:shard.evidence});
  return {name:shard.name, files:shard.tasks.map(task => `tests/${task.name}.mjs`),
   estimatedJourneySeconds:shard.tasks.reduce((sum,task) => sum + costs[task.name],0), schedulerSeconds:shard.seconds};
 });
 const selectedCommands = allocation.flatMap(shard => shard.tasks.flatMap(task => task.commands.filter(command => command.startsWith('node tests/')))).sort();
 assert.deepEqual(selectedCommands,expected);
 report.tiers[label]={event:env.GITHUB_EVENT_NAME,ref,tier,matrix,shards:selected,selectedExactlyOnce:true};
}
// Exercise each real runner's tier selector. Intercept spawnSync only at its
// process boundary; record which complete task commands the runner dispatches.
const realSpawn = childProcess.default.spawnSync;
const dispatches = [];
childProcess.default.spawnSync = (binary,args,options) => {dispatches.push({command:args.at(-1),hosted:options.env.SEED_VERIFY_SHARD});return {status:0};};
syncBuiltinESMExports();
const argv = process.argv;
const log = console.log;
console.log = () => {};
try {
 for (const tier of ['push','all','nightly']) {
  const shards = tier === 'push' ? plan.push : tier === 'nightly' ? plan.nightly : allShards;
  for (const shard of shards) {
   dispatches.length=0;
   process.argv=[process.execPath,resolve('.github/scripts/verify-ci.mjs'),shard.name];
   process.env.TIER=tier;
   delete process.env.UPTIME_VERIFY_BUILD;
   await import(pathToFileURL(resolve('.github/scripts/verify-ci.mjs')) + `?proof=${tier}-${shard.name}`);
   const actual = dispatches.flatMap(call => call.hosted
    ? allTasks.find(task => task.name === call.hosted).commands.filter(command => command.startsWith('node tests/'))
    : call.command.startsWith('node tests/') ? [call.command] : []).sort();
   assert.deepEqual(actual,shard.tasks.flatMap(task => task.commands.filter(command => command.startsWith('node tests/'))).sort());
  }
 }
} finally {
 process.argv=argv;
 console.log=log;
 childProcess.default.spawnSync=realSpawn;
 syncBuiltinESMExports();
}
report.runnerDispatchMatchesPlan=true;
await writeFile(destination,JSON.stringify(report,null,2)+'\n');
console.log(`${stage}: ${expected.length} test files exactly once in each of branch, tag and nightly; 8 shards; all runner dispatches match the plan.`);
