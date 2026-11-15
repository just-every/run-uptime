import {escape} from './console-format.js';
const labels={assertions:'Check criteria',status:'Expected status',bodyIncludes:'Body contains',bodyExcludes:'Body excludes',bodyRegex:'Body expression',latencyMs:'Response time (ms)',header:'Header',json:'JSON check',name:'Name',url:'URL',type:'Check type',intervalMs:'Check interval',timeoutMs:'Response timeout',method:'Request method',tags:'Tags',enabled:'Enabled',dependencies:'Depends on',freshnessMs:'Results stay fresh for',confirmSlots:'Failed checks in a row',recoverSlots:'Passing checks to recover',failureQuorum:'Locations that must fail',retries:'Retries',network:'Network'};
// Internal bookkeeping a person does not read: which probe slot holds which runner, and whether a paused monitor keeps its
// external check copy. A change of location is shown by name (see locationsOf); the rest is not a change they made.
const hidden=new Set(['externalCheck','probes','assignments','canaryUrl','runnerId']);
const duration=ms=>ms%60000===0?`${ms/60000} min`:ms%1000===0?`${ms/1000} s`:`${ms} ms`;
const times=new Set(['intervalMs','timeoutMs','freshnessMs']);
const yesNo=value=>value===true?'Yes':value===false?'No':value;
const text=(value,field)=>value==null?'Not set':Array.isArray(value)?value.map(item=>text(item,field)).join(', '):typeof value==='object'?Object.entries(value).filter(([key])=>!hidden.has(key)).map(([key,v])=>`${labels[key]??key}: ${text(v,key)}`).join('; '):times.has(field)&&Number.isFinite(value)?duration(value):String(yesNo(value));
const sentence=field=>{const words=field.replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase();return words[0].toUpperCase()+words.slice(1)};
const locationsOf=assignments=>[...new Set(Object.values(assignments??{}).map(assignment=>assignment?.networkLabel).filter(Boolean))].sort();
export function changeMarkup({field,from,to}){
 if(field==='assignments'){
  const before=locationsOf(from),after=locationsOf(to);
  return JSON.stringify(before)===JSON.stringify(after)?'':`<p><span class="field">Locations</span>: ${escape(before.join(', ')||'Not set')} → ${escape(after.join(', ')||'Not set')}</p>`;
 }
 if(hidden.has(field))return '';
 if((from&&typeof from==='object'&&!Array.isArray(from))||(to&&typeof to==='object'&&!Array.isArray(to))){
  return [...new Set([...Object.keys(from??{}),...Object.keys(to??{})])].filter(key=>JSON.stringify(from?.[key])!==JSON.stringify(to?.[key])).map(key=>changeMarkup({field:key,from:from?.[key],to:to?.[key]})).join('');
 }
 return `<p><span class="field">${escape(labels[field]??sentence(field))}</span>: ${escape(text(from,field))} → ${escape(text(to,field))}</p>`;
}
