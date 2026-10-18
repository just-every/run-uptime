import {normalizeContactSettings} from './contact-schedule.ts';
export function normalizeSlow(value,probes,type){
 if(value===undefined||value===null)return null;
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['thresholdMs','mode','slots','percentile','locations','destinationIds','contactSettings'].includes(k)))throw Error('Invalid slow-response policy');
 if(!['http','keyword','tcp','dns','tls','domain','flow'].includes(type))throw Error('Slow-response policy needs a timed response monitor');
 const {thresholdMs,mode,slots,percentile=95,locations='all',destinationIds=null,contactSettings={}}=value;
 if(!Number.isInteger(thresholdMs)||thresholdMs<1||thresholdMs>600000)throw Error('Slow threshold must be 1 to 600000 milliseconds');
 if(!['consecutive','percentile'].includes(mode)||!Number.isInteger(slots)||slots<1||slots>100||![50,95,99].includes(percentile))throw Error('Choose consecutive slots or a p50, p95 or p99 window of 1 to 100 slots');
 if(locations!=='all'&&(!Array.isArray(locations)||!locations.length||new Set(locations).size!==locations.length||locations.some(p=>!probes.includes(p))))throw Error('Choose all or a nonempty subset of configured locations');
 if(destinationIds!==null&&(!Array.isArray(destinationIds)||destinationIds.length>100||new Set(destinationIds).size!==destinationIds.length||destinationIds.some(id=>typeof id!=='string'||!id||id.length>512||/[\x00-\x1f\x7f]/.test(id))))throw Error('Choose local slow-notice destinations');
 return {thresholdMs,mode,slots,percentile,locations:locations==='all'?'all':[...locations].sort(),destinationIds:destinationIds===null?null:[...destinationIds].sort(),contactSettings:normalizeContactSettings(contactSettings,destinationIds??[])};
}
