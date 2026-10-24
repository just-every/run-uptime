// Scheduled notification measurement only. Push Verify still runs notifications-2 once.
import {spawn,execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {plan} from './verify-ci.mjs';

const [mode,option,...extra]=process.argv.slice(2),quotas={normal:30,cpu:10};
if(!Object.hasOwn(quotas,mode)||extra.length||(option!==undefined&&option!=='--one-sample'))throw Error('Usage: measure-notifications.mjs normal|cpu [--one-sample]');
const root=fileURLToPath(new URL('../../',import.meta.url)),sha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const quota=option==='--one-sample'?1:quotas[mode],output=resolve(process.env.UPTIME_MEASUREMENT_EVIDENCE??'data/notification-measurements',mode);
await mkdir(resolve(output,'..'),{recursive:true});
await mkdir(output); // Never overwrite a previous invocation or its failed sample.
const commands=plan.push.find(shard=>shard.name==='notifications-2').commands;
const summary={sha,mode,cpuRate:mode==='cpu'?5:1,shard:'notifications-2',commands,requiredSamples:quotas[mode],requestedSamples:quota,localSmoke:option==='--one-sample',startedAt:new Date().toISOString(),samples:[],completedSamples:0,passedSamples:0,failedSamples:0};
const save=()=>writeFile(join(output,'RESULTS.json'),JSON.stringify(summary,null,2)+'\n');
await save();
for(let index=1;index<=quota;index++){
 const directory=join(output,`sample-${String(index).padStart(2,'0')}`);await mkdir(directory,{recursive:true});
 const started=Date.now(),log=[];
 const preload=pathToFileURL(fileURLToPath(new URL('./notification-measurement-browser.mjs',import.meta.url))).href;
 const env={...process.env,UPTIME_MEASUREMENT_MODE:mode,UPTIME_MEASUREMENT_FOCUS:join(directory,'focus.jsonl'),UPTIME_SECRET_UI_EVIDENCE:join(directory,'browser'),NODE_OPTIONS:[process.env.NODE_OPTIONS,`--import=${preload}`].filter(Boolean).join(' ')};
 console.log(`MEASUREMENT sha=${sha} mode=${mode} sample=${index}/${quota}`);
 const child=spawn('/bin/bash',['-euo','pipefail','-c',commands.join(' && ')],{cwd:root,env,stdio:['ignore','pipe','pipe']});
 for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{log.push(chunk);process.stdout.write(chunk)});
 const result=await new Promise(resolve=>{child.once('error',error=>resolve({code:null,signal:null,error:error.message}));child.once('exit',(code,signal)=>resolve({code,signal}))});
 await writeFile(join(directory,'sample.log'),Buffer.concat(log));
 const passed=result.code===0;
 summary.samples.push({index,startedAt:new Date(started).toISOString(),durationMs:Date.now()-started,...result,passed});
 summary.completedSamples++;summary[passed?'passedSamples':'failedSamples']++;
 summary.finishedAt=new Date().toISOString();await save();
 if(!passed){process.exitCode=1;break} // A failure ends the mode; no retry can erase it.
}
console.log(JSON.stringify(summary,null,2));
