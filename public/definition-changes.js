import {escape} from './console-format.js';
const labels={assertions:'Check criteria',status:'Expected status',bodyIncludes:'Body contains',bodyExcludes:'Body excludes',bodyRegex:'Body expression',latencyMs:'Response time (ms)',header:'Header',json:'JSON check',name:'Name',url:'URL',type:'Check type',intervalMs:'Check interval (ms)',timeoutMs:'Response timeout (ms)',method:'Request method',tags:'Tags',enabled:'Enabled'};
const text=value=>value==null?'Not set':Array.isArray(value)?value.map(text).join(', '):typeof value==='object'?Object.entries(value).map(([key,v])=>`${labels[key]??key}: ${text(v)}`).join('; '):String(value);
export function changeMarkup({field,from,to}){
 if((from&&typeof from==='object'&&!Array.isArray(from))||(to&&typeof to==='object'&&!Array.isArray(to))){
  return [...new Set([...Object.keys(from??{}),...Object.keys(to??{})])].filter(key=>JSON.stringify(from?.[key])!==JSON.stringify(to?.[key])).map(key=>changeMarkup({field:key,from:from?.[key],to:to?.[key]})).join('');
 }
 return `<p><span class="field">${escape(labels[field]??field.replace(/([a-z])([A-Z])/g,'$1 $2'))}</span>: ${escape(text(from))} → ${escape(text(to))}</p>`;
}
