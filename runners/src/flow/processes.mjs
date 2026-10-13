// Ending the processes of a flow run by proof: the process tree below a pid, and any process whose command line names a run's
// folder (a browser left behind when the process that started it was killed outright still names its profile there).
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const run = promisify(execFile);
const table = async () => { try { return (await run('ps', ['-A', '-ww', '-o', 'pid=,ppid=,command='], {maxBuffer: 16 * 1024 * 1024})).stdout.split('\n'); } catch { return []; } };
const rows = async () => (await table()).map(line => /^\s*(\d+)\s+(\d+)\s(.*)$/.exec(line)).filter(Boolean).map(([, pid, ppid, command]) => ({pid: Number(pid), ppid: Number(ppid), command}));
const kill = pid => { try { process.kill(pid, 'SIGKILL'); } catch {} };

/** Every process below `root`, deepest last. */
export async function descendants(root) {
  const children = new Map();
  for (const {pid, ppid} of await rows()) children.set(ppid, [...(children.get(ppid) ?? []), pid]);
  const out = [], walk = id => { for (const c of children.get(id) ?? []) { out.push(c); walk(c); } };
  walk(root);
  return out;
}

/** Kill a process and everything below it: its group first, then any descendant that left the group. */
export async function killTree(pid) {
  const all = [pid, ...await descendants(pid)];
  try { process.kill(-pid, 'SIGKILL'); } catch {}
  for (const p of all.reverse()) kill(p);
}

/** Kill every other process whose command line names `folder` (a run's profile and home live there). */
export async function killFolderHolders(folder) {
  for (const {pid, command} of await rows()) if (pid !== process.pid && command.includes(folder)) kill(pid);
}
