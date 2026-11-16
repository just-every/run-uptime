// Whole owner/business journeys, balanced from local public-door timings.
import {readFile} from 'node:fs/promises';
const {scripts}=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
const groups=['runtime','delivery','protocols','data','transactions','console','identity','operations'];
const commands=groups.flatMap(group=>scripts['test:'+group].split(/\s+&&\s+/));
if(new Set(commands).size!==commands.length)throw Error('A journey is selected twice');
export const tasks={push:commands.map(command=>{
 const name=/tests\/(.+)\.mjs$/.exec(command)?.[1];
 if(!name)throw Error('Unknown journey command: '+command);
 return {name,browser:true,...(name==='browser-suites'?{hosted:true}:{}),commands:[...(name==='browser-suites'?['pnpm run build','pnpm run spec:check','pnpm run typecheck','pnpm run test:base']:[]),command]};
}),nightly:[]};
// A standalone local suite builds before opening its first Worker.
tasks.push.sort((a,b)=>Number(Boolean(b.hosted))-Number(Boolean(a.hosted)));
export const allTasks=tasks.push;
// Scheduling weights calibrated to push run 40737989176; these are estimates, not assertions.
const seconds={
 "control-runtime": 196,
 "signed-runner": 57,
 "probe-native-evidence": 18,
 "private-network": 83,
 "notify-delivery": 85,
 "notification-recovery": 335,
 "notification-fallback": 189,
 "hosted-alerts": 10,
 "webhook-custom": 14,
 "protocol-monitors": 128,
 "udp-monitors": 54,
 "mail-journey": 114,
 "ping-monitors": 56,
 "tls-auth": 34,
 "archive-roundtrip": 19,
 "definitions-import": 60,
 "erasure-audit": 39,
 "catalog": 39,
 "alert-routes": 51,
 "incident-work": 114,
 "read-api": 14,
 "flow-journey": 438,
 "api-transaction-journey": 45,
 "browser-suites": 134,
 "hosted-auth-browser": 14,
 "command-journey": 286,
 "operator-security": 37,
 "access-matrix": 29,
 "resilience/watches": 46,
 "maintenance-windows": 35,
 "slow-responses": 132,
 "reporting": 76,
 "metrics": 12,
 "failure-page-journey": 27,
 "discovery-jobs": 140,
 "alert-drill": 29,
 "contact-schedules": 142,
 "public-paths": 28,
 "owner-deploy-lifecycle": 81,
 "business-provisioned": 11,
 "owner-editor-browser": 52
};
function shards(weights){
const bins=Array.from({length:8},(_,index)=>({name:'push-'+(index+1),seconds:0,tasks:[]}));
for(const task of [...tasks.push].sort((a,b)=>(weights[b.name]??60)-(weights[a.name]??60))){
 const bin=[...bins].sort((a,b)=>a.seconds-b.seconds||a.name.localeCompare(b.name))[0];
 bin.tasks.push(task);bin.seconds+=weights[task.name]??60;
}
return bins.map(bin=>({...bin,browser:true,engines:bin.tasks.some(task=>task.name==='flow-journey')?'all':'chromium',evidence:bin.tasks.some(task=>task.name==='browser-suites')}));
}
// Keep the nightly allocation separate so its existing schedule is unchanged.
const nightlyShards=shards(seconds);
// Push run 43714780460 outgrew the old fallback (60 s) for agent-door and
// archive-roundtrip's 19 s estimate. Budget their observed whole-file times;
// keep the journeys intact and the job limit unchanged.
// Branch pushes and releases share one allocation. All-tier matrices select
// these same-named shards once, rather than running the journeys twice.
export const allShards=shards({...seconds,'agent-door':555,'archive-roundtrip':270});
export const plan={push:allShards,nightly:nightlyShards};
