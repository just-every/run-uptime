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
// Seconds include real runner/browser work; these are scheduling estimates, not assertions.
const seconds={
 "control-runtime": 188,
 "signed-runner": 63,
 "probe-native-evidence": 19,
 "private-network": 86,
 "notify-delivery": 77,
 "notification-recovery": 334,
 "notification-fallback": 171,
 "hosted-alerts": 15,
 "webhook-custom": 20,
 "protocol-monitors": 149,
 "udp-monitors": 54,
 "mail-journey": 133,
 "ping-monitors": 83,
 "tls-auth": 38,
 "archive-roundtrip": 19,
 "definitions-import": 89,
 "erasure-audit": 45,
 "catalog": 33,
 "alert-routes": 43,
 "incident-work": 109,
 "read-api": 15,
 "flow-journey": 371,
 "api-transaction-journey": 43,
 "browser-suites": 197,
 "hosted-auth-browser": 13,
 "command-journey": 317,
 "operator-security": 37,
 "access-matrix": 32,
 "resilience/watches": 42,
 "maintenance-windows": 51,
 "slow-responses": 137,
 "reporting": 88,
 "metrics": 12,
 "failure-page-journey": 24,
 "discovery-jobs": 145,
 "alert-drill": 28,
 "contact-schedules": 128,
 "public-paths": 33,
 "owner-deploy-lifecycle": 78,
 "business-provisioned": 11,
 "owner-editor-browser": 54
};
const bins=Array.from({length:8},(_,index)=>({name:'push-'+(index+1),seconds:0,tasks:[]}));
for(const task of [...tasks.push].sort((a,b)=>(seconds[b.name]??60)-(seconds[a.name]??60))){
 const bin=[...bins].sort((a,b)=>a.seconds-b.seconds||a.name.localeCompare(b.name))[0];
 bin.tasks.push(task);bin.seconds+=seconds[task.name]??60;
}
export const plan={push:bins.map(bin=>({...bin,browser:true,engines:bin.tasks.some(task=>task.name==='flow-journey')?'all':'chromium',evidence:bin.tasks.some(task=>task.name==='browser-suites')}))};
// Nightly keeps its reuse proof and exercises the same journeys; all-tier matrices deduplicate them.
plan.nightly=plan.push;
export const allShards=plan.push;
