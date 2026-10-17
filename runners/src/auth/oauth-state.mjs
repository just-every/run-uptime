import {open, rm} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {ownedDirectory, readOwned, writeOwned} from './files.mjs';
import {credentialContext, digest} from './context.mjs';
import {fields, text, integer, active, credentialError} from './validation.mjs';
const queues = new Map();
async function unchanged(context) {
  const source = await readOwned(context.path, 65536);
  try { if (digest(source.bytes) !== context.fingerprint) throw credentialError(); } finally { await source.file.close(); }
}
function validateState(state, identity) {
  fields(state, ['version', 'identity', 'accessToken', 'expiresAt'], ['refreshToken']);
  if (state.version !== 1 || state.identity !== identity) throw credentialError();
  text(state.accessToken, 8192); integer(state.expiresAt, 1, Number.MAX_SAFE_INTEGER);
  if (state.refreshToken !== undefined) text(state.refreshToken, 8192);
  return state;
}
/** One process queues its own refreshes. Another process cannot duplicate an
 * exchange: it refuses while this exclusive owner-only lock exists. A lock left
 * by an interrupted exchange is deliberately uncertain; owner recovery happens
 * with the runners stopped, never by automatically replaying a refresh. */
export async function withOAuthState(credential, signal, operation) {
  const context = credential[credentialContext]; if (!context) throw credentialError();
  const identity = digest(JSON.stringify([context.reference, context.monitorId, context.origin, context.fingerprint]));
  const previous = queues.get(identity) ?? Promise.resolve();
  let release; const current = new Promise(resolve => { release = resolve; });
  const queued = previous.then(() => current); queues.set(identity, queued);
  queued.then(() => { if (queues.get(identity) === queued) queues.delete(identity); });
  let aborted;
  try {
    await Promise.race([previous, new Promise((_, reject) => { aborted = () => reject(credentialError()); if (signal?.aborted) aborted(); else signal?.addEventListener('abort', aborted, {once: true}); })]);
    active(signal); await unchanged(context);
    const root = await ownedDirectory(join(context.root, '.uptime-auth'), true), path = join(root, `${identity}.json`), lockPath = join(root, `${identity}.lock`);
    let lock, uncertain = false;
    try {
      lock = await open(lockPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      await lock.writeFile(JSON.stringify({version: 1, pid: process.pid, token: randomUUID()})); await lock.sync();
      let state, source;
      try { source = await readOwned(path, 65536); state = validateState(JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(source.bytes)), identity); }
      catch (error) { if (error.code !== 'ENOENT') throw credentialError(); }
      finally { await source?.file.close(); }
      const save = async value => { active(signal); await unchanged(context); validateState(value, identity); await writeOwned(root, path, value); uncertain = false; };
      // A refresh can rotate authority before its response is lost. Keep the exclusive
      // lock until the replacement has reached durable storage, including on abort.
      const exchanging = () => { uncertain = true; };
      return await operation(state, save, identity, exchanging);
    } finally {
      // An unsuccessful open does not own the other process's lock.
      if (lock) { await lock.close(); if (!uncertain) await rm(lockPath); }
    }
  } finally {
    if (aborted) signal?.removeEventListener('abort', aborted);
    release();
  }
}
