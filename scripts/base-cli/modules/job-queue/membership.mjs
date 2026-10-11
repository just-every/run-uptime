import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { alive } from './identity.mjs';
const execute = promisify(execFile);

// Environment conveys a capability, never a boolean exemption. Validate both
// the live lease and the calling process's actual ancestry before sharing it.
export async function liveMembership(value = process.env.RER_JOB_MEMBERSHIP) {
 if (!value) return null;
 try {
  const claim = JSON.parse(value);
  if (typeof claim.directory !== 'string' || typeof claim.id !== 'string' || typeof claim.token !== 'string') return null;
  const state = JSON.parse(await readFile(join(claim.directory, 'state.json'), 'utf8'));
  const job = state.running.find(job => job.id === claim.id && job.membership === claim.token);
  if (!job || !await alive(job.owner)) return null;
  if(await descendantOf(job.owner.pid))return {id:job.id,label:job.label,repository:job.repository};
 } catch { /* Invalid, stale or unrelated inheritance requires normal admission. */ }
 return null;
}

export async function descendantOf(owner) {
 const {stdout}=await execute('/bin/ps',['-A','-o','pid=','-o','ppid=']);
 const parents=new Map(stdout.trim().split('\n').map(line=>line.trim().split(/\s+/).map(Number))),visited=new Set();
 for(let pid=process.pid;pid>1&&!visited.has(pid);pid=parents.get(pid)){
  if(pid===owner)return true;visited.add(pid);
 }
 return false;
}
