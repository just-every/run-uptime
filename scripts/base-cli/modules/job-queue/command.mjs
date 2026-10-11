import { spawn } from 'node:child_process';
import { constants } from 'node:os';
import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { stopGroup } from './processes.mjs';

export function signalExit(signal) { return 128 + (constants.signals[signal] ?? 1); }

export async function execute(command, job, config, adopt, signal, onStarted, options = {}) {
  const child = (options.spawn ?? spawn)(process.execPath, [fileURLToPath(new URL('./supervisor.mjs', import.meta.url)), randomUUID(), String(config.killGraceMs)],
    { cwd: job.repository, env: options.env ?? process.env, detached: true, stdio: ['inherit', 'inherit', 'inherit', 'ipc'] });
  let owner, finish, outcome;
  const done = new Promise(resolve => { finish = resolve; });
  const exited = new Promise(resolve => child.once('close', (code, signame) => {
    finish({ code: code ?? signalExit(signame), signal: signame }); resolve();
  }));
  child.once('error', error => finish({ code: 127, error: error.message }));
  child.on('message', message => {
    if (message.done) finish({ ...message.done,
      code: message.done.code ?? signalExit(message.done.signal) });
  });
  const abort = () => finish({ code: signalExit(signal.reason || 'SIGTERM'), signal: signal.reason });
  signal.addEventListener('abort', abort, { once: true });
  try {
    const ready = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Job supervisor did not become ready')), 10000);
      child.once('message', message => { clearTimeout(timer); resolve(message.ready); });
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', () => { clearTimeout(timer); reject(Error('Job supervisor exited before readiness')); });
    });
    owner = ready;
    if (!owner || owner.pid !== child.pid) throw Error('Invalid job supervisor identity');
    // Commit the group lease before allowing the supervisor to spawn any work.
    await adopt(owner);
    if (signal.aborted) abort();
    else {
      await onStarted?.(job);
      if (signal.aborted) abort();
      else child.send({ command, cwd: job.repository, nice: config.nice, membership: JSON.stringify({ directory: config.directory, id: job.id, token: job.membership }) });
    }
    outcome=await done;return outcome;
  } finally {
    signal.removeEventListener('abort', abort);
    try {
      if (owner) await stopGroup(owner, config.killGraceMs);
      else child.kill('SIGKILL'); // The supervisor has not been given GO.
      await exited;
      await options.cleanup?.(child,outcome);
      if (owner?.socket) await unlink(owner.socket).catch(error => { if (error.code !== 'ENOENT') throw error; });
    } catch (error) { error.keepLease = true; throw error; }
  }
}
