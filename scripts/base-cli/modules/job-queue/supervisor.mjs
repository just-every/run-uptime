import { spawn } from 'node:child_process';
import { identity } from './identity.mjs';
import { signalGroup } from './processes.mjs';

const marker = `rer-job-supervisor-${process.argv[2]}`;
process.title = marker;
let stopping = false, started = false;
function stop() {
  if (stopping) return;
  stopping = true;
  // Remain group leader until escalation: this prevents group-ID reuse while
  // cleanup is in progress and allows the caller to safely finish cancellation.
  signalGroup(process.pid, 'SIGTERM');
  setTimeout(() => signalGroup(process.pid, 'SIGKILL'), Math.max(20, Number(process.argv[3])));
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
process.on('disconnect', stop);
const lifetime = await identity();
process.send({ ready: { ...lifetime.info, marker, pgid: process.pid } });
process.on('message', message => {
  if (started || stopping || !message.command) return;
  started = true;
  const child = spawn('/usr/bin/nice', ['-n', String(message.nice), ...message.command],
    { cwd: message.cwd, env: { ...process.env, RER_JOB_MEMBERSHIP: message.membership }, stdio: 'inherit' });
  child.once('error', error => process.send?.({ done: { code: 127, error: error.message } }));
  child.once('exit', (code, signal) => {
    if (process.connected) process.send({ done: { code, signal } });
  });
});
