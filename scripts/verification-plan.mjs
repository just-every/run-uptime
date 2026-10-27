// Keep every existing verification command; CI groups them into eight jobs.
import { readFile } from 'node:fs/promises';

const { scripts } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const command = name => {
 if (!scripts[name]) throw Error(`Verification script is missing: ${name}`);
 return `pnpm run ${name}`;
};
const shard = (name, names, browser = false) => ({ name, browser, commands: names.map(command) });
// Split the longer script chains without changing or omitting their commands.
const split = (name, size, browser) => {
 const commands = scripts[name]?.split(/\s+&&\s+/);
 if (!commands?.length) throw Error(`Verification script is missing: ${name}`);
 return Array.from({ length: Math.ceil(commands.length / size) }, (_, index) => ({
  name: `${name.replace(/^test:/, '')}-${index + 1}`, browser,
  commands: commands.slice(index * size, (index + 1) * size),
 }));
};
export const tasks = {
 push: [
  { ...shard('hosted', ['build', 'spec:check', 'typecheck'], true), hosted: true },
  shard('baseline', ['test:baseline']),
  shard('resilience', ['test:resilience']),
  shard('runtime', ['test:runtime']),
  shard('intake', ['test:intake', 'test:contact', 'test:availability']),
  shard('probes', ['test:probes']),
  shard('catalog', ['test:catalog']),
  shard('failure-snapshots',['test:snapshots'],true),
  shard('slow-responses',['test:slow'],true),
  shard('reports',['test:reports'],true),
  shard('read-api',['test:readapi'],true),
  shard('console',['test:console'],true),
  shard('locations',['test:locations'],true),
  shard('heartbeat-schedules',['test:heartbeat'],true),
  ...split('test:security', 3, true),
  ...split('test:notifications', 3, true),
  // The installer command journey is kept in the slow tier; mail settings stay on pushes.
  { name: 'local-settings', browser: false, commands: scripts['test:local'].split(/\s+&&\s+/).filter(item => !item.includes('tests/command-journey.mjs')) },
  shard('authority', ['test:base', 'test:admission', 'test:access', 'test:owner-deploy'], true),
  shard('archives', ['test:archive', 'test:definitions']),
  shard('runner', ['test:runner'], true),
  shard('runner-flows', ['test:flow'], true),
  shard('flow-qualification', ['test:flow:qualification'], true),
  shard('protocols', ['test:protocols'], true),
  shard('icmp', ['test:ping'], true),
  shard('metrics', ['test:metrics'], true),
  shard('private-locations', ['test:private'], true),
  shard('browser', ['test:browser'], true),
 ],
 nightly: [
  { name: 'installer', browser: true, commands: scripts['test:local'].split(/\s+&&\s+/).filter(item => item.includes('tests/command-journey.mjs')) },
  shard('readme', ['test:readme'], true),
 ],
};
export const allTasks = [...tasks.push, ...tasks.nightly];
if (new Set(allTasks.map(item => item.name)).size !== allTasks.length || allTasks.some(item => !item.commands.length)) throw Error('Invalid verification plan');


// Seconds in “Run this shard” on successful push 40417152463 (26 Oct 2026).
// Longest-first placement balances the observed work without moving assertions
// out of push coverage. The shared build removes the old per-task build cost.
const seconds = {
 "probes": 136,
 "failure-snapshots": 78,
 "baseline": 102,
 "read-api": 30,
 "catalog": 248,
 "resilience": 181,
 "runtime": 181,
 "security-2": 37,
 "security-3": 23,
 "locations": 23,
 "hosted": 40,
 "notifications-2": 264,
 "local-settings": 7,
 "security-1": 96,
 "archives": 374,
 "runner-flows": 377,
 "console": 251,
 "intake": 151,
 "reports": 165,
 "slow-responses": 143,
 "security-4": 9,
 "authority": 280,
 "metrics": 24,
 "heartbeat-schedules": 34,
 "icmp": 86,
 "notifications-3": 142,
 "protocols": 320,
 "runner": 186,
 "flow-qualification": 322,
 "private-locations": 66,
 "browser": 360,
 "notifications-1": 470
};
const bins = Array.from({length: 8}, (_, index) => ({name: `push-${index + 1}`, tasks: [], seconds: 0}));
for (const task of [...tasks.push].sort((a, b) => (seconds[b.name] ?? 60) - (seconds[a.name] ?? 60))) {
 const bin = [...bins].sort((a, b) => a.seconds - b.seconds || a.name.localeCompare(b.name))[0];
 bin.tasks.push(task);
 bin.seconds += seconds[task.name] ?? 60;
}
export const plan = {
 push: bins.map(bin => ({...bin, browser: bin.tasks.some(task => task.browser),
  engines: bin.tasks.some(task => task.name === 'runner-flows') ? 'all' : 'chromium',
  evidence: bin.tasks.some(task => task.name === 'browser')})),
 nightly: tasks.nightly.map(task => ({name: task.name, browser: task.browser, engines: 'chromium', evidence: false, tasks: [task]})),
};
export const allShards = [...plan.push, ...plan.nightly];
