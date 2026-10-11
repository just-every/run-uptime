import { cpus, totalmem, userInfo } from 'node:os';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const GIB = 1024 ** 3;
export const TIMEOUT_EXIT = 75;
export const priorities = { owner: 0, normal: 1, background: 2 };
const names = { slots: 'SLOTS', loadThreshold: 'LOAD_THRESHOLD',
  minFreeMemoryBytes: 'MIN_FREE_MEMORY_BYTES', pollMs: 'POLL_MS',
  nice: 'NICE', killGraceMs: 'KILL_GRACE_MS' };

export async function configuration({ env = process.env, ...overrides } = {}) {
  const directory = resolve(overrides.directory ?? env.RER_JOBS_DIR ?? `${userInfo().homedir}/.rer/jobs`);
  let disk = {};
  try { disk = JSON.parse(await readFile(resolve(directory, 'config.json'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const config = { slots: Math.max(1, Math.min(3, Math.floor(cpus().length / 4),
    Math.floor(totalmem() / (8 * GIB)))), loadThreshold: 36,
  minFreeMemoryBytes: 4 * GIB, pollMs: 3000, nice: 15, killGraceMs: 1000, ...disk };
  for (const [key, suffix] of Object.entries(names)) {
    if (env[`RER_JOBS_${suffix}`] !== undefined) config[key] = Number(env[`RER_JOBS_${suffix}`]);
    if (overrides[key] !== undefined) config[key] = overrides[key];
    if (!Number.isFinite(config[key]) || config[key] < 0) throw Error(`Invalid job queue ${key}`);
  }
  if (!Number.isInteger(config.slots) || config.slots < 1 || config.pollMs < 10
    || !Number.isInteger(config.nice) || config.nice > 19) throw Error('Invalid slots, pollMs or nice');
  return { ...config, directory };
}

export function ordered(jobs) {
  return [...jobs].sort((a, b) => priorities[a.priority] - priorities[b.priority] || a.sequence - b.sequence);
}

export function admissionDetails(running, config, sample) {
  if (running >= config.slots) return { code: 'slots', reason: `slots occupied (${running}/${config.slots})` };
  if (!Number.isFinite(sample.load) || !Number.isFinite(sample.freeMemoryBytes))
    return { code: 'resources_unavailable', reason: 'resource sample unavailable' };
  if (sample.load > config.loadThreshold) return { code: 'load',
    reason: `load ${sample.load.toFixed(2)} above threshold ${config.loadThreshold.toFixed(2)}` };
  if (sample.freeMemoryBytes <= config.minFreeMemoryBytes) return { code: 'free_memory',
    reason: `free memory ${(sample.freeMemoryBytes / GIB).toFixed(2)} GiB (${sample.freeMemoryBytes} bytes) at or below floor ${(config.minFreeMemoryBytes / GIB).toFixed(2)} GiB (${config.minFreeMemoryBytes} bytes)` };
  return null;
}

export function admission(running, config, sample) {
  return admissionDetails(running, config, sample)?.reason ?? null;
}
