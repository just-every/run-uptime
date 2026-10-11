import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {realpath,readFile,readdir,readlink} from 'node:fs/promises';
import {basename,join} from 'node:path';
const exec=promisify(execFile);
// macOS supplies lsof in /usr/sbin, which a command PATH may omit.
// Diagnose sockets with the system utility even when that PATH is constrained.
const lsof=process.platform==='darwin'?'/usr/sbin/lsof':'lsof';
const run=async(command,args)=>{
 try{return (await exec(command,args,{timeout:3000,maxBuffer:1024*1024})).stdout;}
 catch(error){
  // lsof exits 1 when a selected PID has exited,
  // while still returning the live listeners of other selected PIDs.
  return command===lsof&&error.code===1&&typeof error.stdout==='string'?error.stdout:'';
 }
};
export async function processName(pid){
 if(process.platform==='linux'){const name=await readFile(`/proc/${pid}/comm`,'utf8').catch(()=>'');if(name)return name.trim().replace(/[^a-zA-Z0-9._-]/g,'').slice(0,80)||'process';}
 const text=await run('/bin/ps',['-p',String(pid),'-o','comm=']);
 return basename(text.trim()).replace(/[^a-zA-Z0-9._-]/g,'').slice(0,80)||'process';
}
function records(text){let record;const rows=[];for(const line of text.split('\n')){if(line[0]==='p'){record={pid:Number(line.slice(1)),names:[]};rows.push(record);}else if(line[0]==='n'&&record)record.names.push(line.slice(1));}return rows;}
export async function listeners(pids){
 // -a is essential: otherwise lsof ORs the PID and network selections and
 // still walks every process's sockets. Read only the owned tree on failure.
 if(process.platform!=='linux')return records(await run(lsof,['-nP',...(pids?['-a','-p',pids.join(',')]:[]),'-iTCP','-sTCP:LISTEN','-Fpn']));
 const sockets=new Map();
 for(const file of ['tcp','tcp6'])for(const line of (await readFile('/proc/net/'+file,'utf8').catch(()=>'' )).trim().split('\n').slice(1)){
  const parts=line.trim().split(/\s+/);if(parts[3]==='0A')sockets.set(parts[9],parseInt(parts[1].split(':')[1],16));
 }
 const found=[];
 for(const pid of pids??await linuxPids()){
  const names=[];for(const target of await descriptors(pid)){const inode=/^socket:\[(\d+)\]$/.exec(target)?.[1];if(sockets.has(inode))names.push('127.0.0.1:'+sockets.get(inode));}
  if(names.length)found.push({pid,names});
 }return found;
}
async function linuxPids(){return (await readdir('/proc')).filter(name=>/^\d+$/.test(name)).map(Number);}
async function descriptors(pid){return Promise.all((await readdir(`/proc/${pid}/fd`).catch(()=>[])).map(fd=>readlink(`/proc/${pid}/fd/${fd}`).catch(()=>'')));}

export async function listenerPorts(pid){
 // Include child processes: pnpm commonly delegates the actual Vite listener.
 const rows=(await run('/bin/ps',['-axo','pid=,ppid='])).trim().split('\n').map(line=>line.trim().split(/\s+/).map(Number));
 const owned=new Set([pid]);for(let changed=true;changed;){changed=false;for(const [child,parent]of rows)if(owned.has(parent)&&!owned.has(child)){owned.add(child);changed=true;}}
 return [...new Set((await listeners([...owned])).filter(row=>owned.has(row.pid)).flatMap(row=>row.names.map(name=>Number(/:(\d+)$/.exec(name)?.[1])).filter(port=>Number.isInteger(port)&&port>0&&port<=65535)))].sort((a,b)=>a-b);
}
// The caller and the chain that launched it (an installer server running setup,
// pnpm, a shell) act for this command, never against it.
async function callerLineage(){
 const parents=new Map((await run('/bin/ps',['-axo','pid=,ppid='])).trim().split('\n').map(line=>line.trim().split(/\s+/).map(Number)));
 const lineage=new Set([process.pid,process.ppid]);
 for(let pid=process.ppid;pid>1&&parents.has(pid);){pid=parents.get(pid);if(lineage.has(pid))break;lineage.add(pid);}
 return lineage;
}
export async function localProcessConflict(root,savedOrigin){
 root=await realpath(root);const all=await listeners(),lineage=await callerLineage();
 const cwdRecords=process.platform!=='linux'&&all.length?records(await run(lsof,['-a','-p',all.map(row=>row.pid).join(','),'-d','cwd','-Fpn'])):[];
 let port;try{const url=new URL(savedOrigin);port=Number(url.port||80);}catch{}
 for(const row of all){
  if(lineage.has(row.pid))continue;
  const onSavedPort=port&&row.names.some(name=>Number(/:(\d+)$/.exec(name)?.[1])===port);
  const cwd=process.platform==='linux'?[await readlink(`/proc/${row.pid}/cwd`).catch(()=>undefined)].filter(Boolean):cwdRecords.filter(item=>item.pid===row.pid).flatMap(item=>item.names);
  const inCheckout=(await Promise.all(cwd.map(path=>realpath(path).catch(()=>undefined)))).includes(root);
  if(onSavedPort||inCheckout)return {pid:row.pid,command:await processName(row.pid),reason:onSavedPort?`saved local port ${port}`:'this checkout'};
 }
 // A process may hold the canonical database without listening. Inspect only
 // actual state files, never broad checkout contents or a process environment.
 const state=join(root,'.wrangler/state');
 let held;
 if(process.platform==='linux'){for(const pid of await linuxPids())if(!lineage.has(pid)&&(await descriptors(pid)).some(path=>path.startsWith(state+'/'))){held={pid};break;}}
 else held=records(await run(lsof,['-nP','+D',state,'-Fpn'])).find(row=>!lineage.has(row.pid));
 if(held)return {pid:held.pid,command:await processName(held.pid),reason:'the canonical local state'};
}
