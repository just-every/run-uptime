import {escape,icon} from './console-format.js';
// A monitor's pass/fail rules in plain words: what one check must see (Up when), when the monitor is down (Down when),
// when it is back up, and the locations it is checked from. Shown as a short line on the monitor list and as the
// "Up or down" card on the monitor's page. Only rules the code applies are named: the agreement between locations is
// fixed (src/domain/policy.mjs), so it is stated, not offered as a setting.
const quoted=(text,max=40)=>`“${text.length>max?text.slice(0,max-1)+'…':text}”`;
export const responseTime=ms=>ms<1000?`${ms.toLocaleString()} ms`:`${(ms/1000).toLocaleString()} s`;
const statusText=status=>(Array.isArray(status)?status:[status]).map(code=>String(code).replace(/^(\d{3})-(\d{3})$/,'$1–$2')).join(', ');
const OTHER_TYPES={heartbeat:'Heartbeat arrives',mail:'Mail checks pass',api:'Every step passes',flow:'Every flow step passes',tcp:'Port connects',udp:'Expected reply',ping:'Echo replies',dns:'Expected answer',tls:'Valid certificate',domain:'Registration in date'};
const httpType=definition=>!definition.type||['http','keyword'].includes(definition.type);
// The HTTP rules, one per assertion, in the order they are checked (src/domain/http-assertions.mjs).
export function httpRules(definition){
 const a=definition.assertions??{},rules=[`Status is ${statusText(a.status??200)}`];
 if(a.bodyIncludes!==undefined)rules.push(`Page contains ${quoted(a.bodyIncludes,200)}`);
 if(a.bodyExcludes!==undefined)rules.push(`Page does not contain ${quoted(a.bodyExcludes,200)}`);
 if(a.bodyRegex)rules.push(`Page matches /${a.bodyRegex.pattern}/${a.bodyRegex.flags??''}`);
 if(a.header)rules.push(`Header ${a.header.name} is ${quoted(a.header.equals,200)}`);
 if(a.json)rules.push(`JSON ${a.json.path} is ${JSON.stringify(a.json.equals)}`);
 if(a.latencyMs!==undefined)rules.push(`Responds within ${responseTime(a.latencyMs)}`);
 return rules;
}
// The monitor list's "Up when" cell: "200 · contains “Order” · under 3 s".
export function upWhen(definition){
 const a=definition.assertions??{},latency=a.latencyMs!==undefined?`under ${responseTime(a.latencyMs)}`:null;
 if(!httpType(definition))return [OTHER_TYPES[definition.type]??'Check passes',latency].filter(Boolean).join(' · ');
 const parts=[statusText(a.status??200)];
 if(a.bodyIncludes!==undefined)parts.push(`contains ${quoted(a.bodyIncludes,24)}`);
 if(a.bodyExcludes!==undefined)parts.push(`not ${quoted(a.bodyExcludes,24)}`);
 if(a.bodyRegex)parts.push('pattern');
 if(a.header)parts.push(`${a.header.name} header`);
 if(a.json)parts.push('JSON value');
 if(latency)parts.push(latency);
 return parts.join(' · ');
}
// The current names of the locations a monitor checks from (a renamed location shows its new name).
export function checkedFrom(definition,runners=[]){
 const names=Object.values(definition.assignments??{}).map(a=>runners.find(r=>r.runnerId===a.runnerId)?.networkLabel??a.networkLabel).filter(Boolean);
 return [...new Set(names)];
}
const hostOf=url=>{try{return new URL(url).hostname}catch{return url}};
// How an outage is agreed for this revision: two locations, or one plus its passing external check.
export function agreementRule(definition){
 if(!definition.assignments)return `${definition.failureQuorum} failing checks agree`;
 const canary=Object.values(definition.assignments).find(a=>a.canaryUrl)?.canaryUrl;
 return canary?`Seen from 2 locations, or 1 plus ${hostOf(canary)}`:'Seen from 2 locations';
}
const list=(kind,items)=>`<ul class="rule-list ${kind}">${items.map(text=>`<li><span class="rule-mark">${icon(kind==='up'?'check':'x-circle')}</span><span>${escape(text)}</span></li>`).join('')}</ul>`;
// The monitor page's card. `other` is the existing summary markup for types whose rules are not HTTP assertions.
export function rulesCard(m,runners,{editable,other,details}){
 const d=m.definition,locations=checkedFrom(d,runners);
 const up=httpType(d)?list('up',httpRules(d)):other;
 return `<section class="ui-card panel assertions rules-card" aria-labelledby="expects-heading"><div class="panel-head"><h2 id="expects-heading">Up or down</h2>${editable?`<a class="ui-link" id="edit-rules" href="/app/monitor?monitor=${encodeURIComponent(m.id)}">Edit rules</a>`:''}</div>`
  +`<h3>Up when</h3>${up}<h3>Down when</h3>${list('down',[`${d.confirmSlots} failed ${d.confirmSlots===1?'check':'checks in a row'}`,agreementRule(d)])}`
  +`<h3>Back up after</h3>${list('up',[`${d.recoverSlots} passing ${d.recoverSlots===1?'check':'checks'}`])}`
  +(locations.length?`<h3>Checked from</h3><p class="location-chips">${locations.map(name=>`<span class="location-chip">${escape(name)}</span>`).join('')}</p>`:'')
  +details+'</section>';
}
