// Whole owner/business journeys, balanced from CI wall-clock timings.
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
// Rounded command timings from scheduled Verify 45127930682 and manual Verify
// 45136475059. Keep the 270 s archive budget from push Verify 43714780460.
// The browser-suites weight includes its hosted verification checks.
const seconds={
 "control-runtime": 250,
 "signed-runner": 85,
 "probe-native-evidence": 25,
 "network-mixed-dns": 10,
 "private-network": 55,
 "cron-d1-budget": 600,
 "notify-delivery": 140,
 "notification-recovery": 325,
 "notification-fallback": 150,
 "hosted-alerts": 40,
 "webhook-custom": 20,
 "protocol-monitors": 240,
 "udp-monitors": 45,
 "mail-journey": 105,
 "ping-monitors": 55,
 "tls-auth": 120,
 "archive-roundtrip": 270,
 "definitions-import": 105,
 "erasure-audit": 35,
 "agent-erasure": 10,
 "roster-erasure": 10,
 "catalog": 40,
 "alert-routes": 70,
 "incident-work": 120,
 "read-api": 25,
 "flow-journey": 355,
 "api-transaction-journey": 45,
 "browser-suites": 330,
 "hosted-auth-browser": 80,
 "command-journey": 250,
 "operator-security": 135,
 "access-matrix": 45,
 "agent-door": 555,
 "agent-rate-overrun": 55,
 "agent-query-token": 10,
 "resilience/watches": 105,
 "maintenance-windows": 60,
 "slow-responses": 135,
 "reporting": 80,
 "metrics": 65,
 "failure-page-journey": 30,
 "discovery-jobs": 180,
 "alert-drill": 105,
 "contact-schedules": 130,
 "public-paths": 65,
 "owner-deploy-lifecycle": 75,
 "run-site-deploy": 5,
 "business-provisioned": 10,
 "owner-editor-browser": 50
};
function shards(weights){
const bins=Array.from({length:8},(_,index)=>({name:'push-'+(index+1),seconds:0,tasks:[]}));
for(const task of [...tasks.push].sort((a,b)=>(weights[b.name]??60)-(weights[a.name]??60))){
 const bin=[...bins].sort((a,b)=>a.seconds-b.seconds||a.name.localeCompare(b.name))[0];
 bin.tasks.push(task);bin.seconds+=weights[task.name]??60;
}
return bins.map(bin=>({...bin,browser:true,engines:bin.tasks.some(task=>task.name==='flow-journey')?'all':'chromium',evidence:bin.tasks.some(task=>task.name==='browser-suites')}));
}
// All Verify events run the same allocation of public-door journeys.
export const allShards=shards(seconds);
export const plan={push:allShards,nightly:allShards};
