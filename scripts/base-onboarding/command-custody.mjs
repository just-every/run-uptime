import { readProcessIdentity, validPid } from './process-table.mjs';
import { stopOwnedGroup } from './process-cleanup.mjs';

// Pin the original launch PID rather than reading a mutable ChildProcess.pid at
// shutdown. Exit/close ends output capture, but never retires descendant custody.
export function commandCustody(child, scope) {
 if (!validPid(child.pid) || !['darwin', 'linux'].includes(process.platform)
  || (!scope && (child.exitCode != null || child.signalCode != null))) return;
 const owner = Object.freeze({ pid: child.pid, get exitCode() { return child.exitCode; }, get signalCode() { return child.signalCode; } });
 const ownership = [];
 Object.defineProperty(ownership, 'scope', { value: scope });
 // Capture the actual launch identity directly. A global startup scan can
 // compete with the app's startup and delay an otherwise prompt cancellation.
 const captured = readProcessIdentity(owner.pid).then(live => {
  if (live?.ppid === process.pid && owner.exitCode == null && owner.signalCode == null) ownership.push(live);
 });
 // Attach a handler now; the error is still propagated to the awaited cleanup.
 void captured.catch(() => {});
 let stopping;
 return { stop() {
  stopping ??= captured.then(() => stopOwnedGroup(owner, 'SIGTERM', ownership));
  return stopping;
 } };
}
