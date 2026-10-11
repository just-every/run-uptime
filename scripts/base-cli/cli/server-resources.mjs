import {loadavg,tmpdir} from 'node:os';
import {statfs} from 'node:fs/promises';
import {refuse} from './errors.mjs';
// Persistent serving is not a bounded queue job. Check its launch separately,
// after finite preparation, while its canonical server reservation is held.
export function servingLoadThreshold(env=process.env){
 const threshold=Number(env.RER_SERVERS_LOAD_THRESHOLD??36);
 if(!Number.isFinite(threshold)||threshold<0)throw refuse('Invalid server load threshold.');
 return threshold;
}
export async function serverResources(root,{load=()=>loadavg()[0],disk=statfs,env=process.env}={}){
 const threshold=servingLoadThreshold(env);
 const measured=await load();
 if(!Number.isFinite(measured)||measured>threshold)throw refuse(`Server startup requires machine load at or below ${threshold}. Retry when the machine is available.`);
 for(const path of new Set([root,tmpdir()])){
  const state=await disk(path,{bigint:true});
  if(state.bavail*state.bsize<15n*1024n**3n)throw refuse('Server startup requires 15 GiB free on checkout and temporary volumes. Recover owned space before retrying.');
 }
}
