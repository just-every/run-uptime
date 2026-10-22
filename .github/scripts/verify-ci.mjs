// Same plan/shards/aggregate shape as Base 98214f2's seed Verify template.
// Keep the complete local verify path; only CI selects a shard and a tier.
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const { scripts } = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
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
export const plan = {
 push: [
  { ...shard('hosted', ['build', 'spec:check', 'typecheck'], true), hosted: true },
  shard('baseline', ['test:baseline']),
  // The combined runtime shard took 5m35s: resilience 2m18s, runtime 2m29s,
  // and intake/contact/availability 42s. Each group builds and runs independently.
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
  // The combined runner-flows shard took 9m10s of its 12 minutes once the catalog and discovery-source
  // journeys joined: runner and discovery 2m58s, flows 4m38s. Flows keep the name the workflow installs all engines for.
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
const all = [...plan.push, ...plan.nightly];
if (new Set(all.map(item => item.name)).size !== all.length || all.some(item => !item.commands.length)) throw Error('Invalid verification plan');

function run(value, env = process.env) {
 console.log(`> ${value}`);
 const result = spawnSync('/bin/bash', ['-euo', 'pipefail', '-c', value], { cwd: root, env, stdio: 'inherit' });
 if (result.error) throw result.error;
 if (result.status !== 0) process.exit(result.status ?? 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
 const [mode, tier, ...extra] = process.argv.slice(2);
 if (extra.length) throw Error('Too many verification arguments');
 if (mode === '--matrix') {
  if (!['push', 'all'].includes(tier)) throw Error('Usage: verify-ci.mjs --matrix push|all');
  const selected = tier === 'push' ? plan.push : all;
  console.log(JSON.stringify({ include: selected.map(({ name, browser }) => ({ name, browser })) }));
 } else if (mode === '--app') {
  if (tier) throw Error('Usage: verify-ci.mjs --app');
  const selected = process.env.SEED_VERIFY_SHARD;
  const shards = selected ? all.filter(item => item.name === selected) : all;
  if (!shards.length) throw Error(`Unknown verification shard: ${selected}`);
  // Every CI shard builds its exact source independently. A complete local run builds once.
  if (selected && !shards[0].hosted) run(command('build'));
  for (const item of shards) for (const value of item.commands) run(value);
 } else {
  const selected = all.find(item => item.name === mode);
  if (!selected || tier) throw Error('Usage: verify-ci.mjs SHARD');
  // Only this shard runs rer's production-output and hydration checks, after building.
  run(selected.hosted ? 'pnpm exec rer verify' : 'node .github/scripts/verify-ci.mjs --app', { ...process.env, SEED_VERIFY_SHARD: selected.name });
 }
}
