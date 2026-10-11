import { mkdir, readFile, writeFile, rename, readdir, unlink, link } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { alive } from './identity.mjs';

export async function atomicJson(path, value) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(value), { flag: 'wx', mode: 0o600 });
    await rename(temporary, path);
  } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}

export async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}

// Lamport's bakery lock: publish choosing before reading tickets, then wait for
// every earlier (number,id). Unique records avoid the stale-unlink/new-lock race
// of a single reclaimable lock file. Every publication is atomic and complete.
export async function transaction(directory, owner, action) {
  const locks = join(directory, 'locks');
  await mkdir(locks, { recursive: true, mode: 0o700 });
  const id = randomUUID(), path = join(locks, `${id}.json`);
  const candidate = `${path}.tmp`;
  await writeFile(candidate, JSON.stringify({ id, owner, choosing: true, number: 0 }), { flag: 'wx', mode: 0o600 });
  try { await link(candidate, path); } finally { await unlink(candidate); }
  const proofs = new Map();
  async function liveOwner(record) {
    const key = `${record.owner.token}:${record.owner.pid}:${record.owner.start}`;
    const previous = proofs.get(key);
    // A briefly cached live proof only delays reclamation; it cannot admit an
    // extra writer. Unique lifetime tokens cannot become live again after death.
    if (previous && Date.now() - previous.at < 200) return previous.live;
    const live = await alive(record.owner);
    proofs.set(key, { live, at: Date.now() });
    return live;
  }
  async function participants() {
    const records = await Promise.all((await readdir(locks)).filter(name => name.endsWith('.json'))
      .map(name => readJson(join(locks, name), null)));
    const live = [];
    for (const record of records) {
      if (!record) continue;
      if (record.id === id || await liveOwner(record)) live.push(record);
      else await unlink(join(locks, `${record.id}.json`)).catch(error => { if (error.code !== 'ENOENT') throw error; });
    }
    return live;
  }
  try {
    const number = Math.max(0, ...(await participants()).map(record => record.number)) + 1;
    await atomicJson(path, { id, owner, choosing: false, number });
    while ((await participants()).some(record => record.id !== id && (record.choosing
      || record.number < number || (record.number === number && record.id < id)))) await delay(20);
    const statePath = join(directory, 'state.json');
    const state = await readJson(statePath, { version: 1, sequence: 0, queued: [], running: [] });
    if (state.version !== 1 || !Array.isArray(state.queued) || !Array.isArray(state.running)) throw Error('Invalid job queue state');
    const result = await action(state);
    await atomicJson(statePath, state);
    return result;
  } finally { await unlink(path).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}
