// Local verification keeps every task; CI selects eight balanced push shards.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {allTasks, allShards, plan} from '../../scripts/verification-plan.mjs';
import {assertSharedBuild} from './verify-build.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const shared = process.env.UPTIME_VERIFY_BUILD;
function run(value, env = process.env) {
 console.log(`> ${value}`);
 const result = spawnSync('/bin/bash', ['-euo', 'pipefail', '-c', value], {cwd: root, env, stdio: 'inherit'});
 if (result.error) throw result.error;
 if (result.status !== 0) process.exit(result.status ?? 1);
}
function commands(task) {
 for (const value of task.commands) {
  if (shared && value === 'pnpm run build') continue;
  run(value);
 }
}

const [mode, tier, ...extra] = process.argv.slice(2);
if (extra.length) throw Error('Too many verification arguments');
if (mode === '--matrix') {
 if (!['push', 'all'].includes(tier)) throw Error('Usage: verify-ci.mjs --matrix push|all');
 const selected = tier === 'push' ? plan.push : allShards;
 console.log(JSON.stringify({include: selected.map(({name, browser, engines, evidence}) => ({name, browser, engines, evidence}))}));
} else if (mode === '--app') {
 if (tier) throw Error('Usage: verify-ci.mjs --app');
 if (shared) await assertSharedBuild(shared);
 const selected = process.env.SEED_VERIFY_SHARD;
 const tasks = selected ? allTasks.filter(task => task.name === selected) : allTasks;
 if (!tasks.length) throw Error(`Unknown verification task: ${selected}`);
 if (selected && !tasks[0].hosted && !shared) run('pnpm run build');
 for (const task of tasks) commands(task);
} else {
 const selected = allShards.find(shard => shard.name === mode);
 if (!selected || tier) throw Error('Usage: verify-ci.mjs SHARD');
 if (shared) await assertSharedBuild(shared);
 const hosted = selected.tasks.find(task => task.hosted);
 // Run the real production-output and hydration checks once. Keep other task
 // commands outside its lifecycle lock (some exercise real rer commands).
 if (hosted) run('pnpm exec rer verify', {...process.env, SEED_VERIFY_SHARD: hosted.name});
 else if (!shared) run('pnpm run build');
 for (const task of selected.tasks) if (!task.hosted) commands(task);
}
