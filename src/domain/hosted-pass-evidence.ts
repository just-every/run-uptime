import {evidenceTimes} from './evidence-clock.ts'
// @ts-ignore Shared with the Node runner.
import {statusMatches} from './http-assertions/status.mjs'
// @ts-ignore Shared with the Node runner.
import {MAX_BODY} from './http-assertions/limits.mjs'

// The in-process HTTP probe constructs this evidence, including the assertion
// result. Signed submissions and other replies still use the full validator.
export function validateHostedPass(o:any,definition:any,dueAt:number,now:number){
 const type=definition.type??'http';
 if(!['http','keyword'].includes(type)||definition.catalog||definition.request||definition.tlsTrust||
   !Object.keys(definition.assertions).every(key=>key==='status')||
   o.outcome!=='pass'||o.canary&&o.canary.outcome!=='pass')return false;
 const canaryExpected=Boolean(definition.assignments?.[o.probe]?.canaryUrl);
 if(!Number.isInteger(o.attempt)||o.attempt<0||o.attempt>definition.retries||canaryExpected!==Boolean(o.canary)||
    !statusPass(o,definition.assertions.status,dueAt,now)||
    o.canary&&(o.canary.probe!==o.probe||o.canary.attempt!==0||!statusPass(o.canary,200,dueAt,now))){
  throw Error('Invalid hosted HTTP pass evidence');
 }
 return true;
}

function statusPass(o:any,expected:number|Array<number|string>,dueAt:number,now:number){
 return o.runnerVersion==='uptime-worker/0.1.0'&&typeof o.id==='string'&&o.id.length>0&&o.id.length<=100&&
  evidenceTimes(o,dueAt,now)&&Math.abs(o.durationMs-(o.completedAt-o.startedAt))<=1&&
  Number.isInteger(o.status)&&o.status>=100&&o.status<=599&&statusMatches(o.status,expected)&&
  Number.isInteger(o.bytes)&&o.bytes>=0&&o.bytes<=MAX_BODY&&o.checks.length===1&&
  o.checks[0].assertion==='status'&&o.checks[0].pass===true;
}
