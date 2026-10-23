import {escape,ago,humaneDuration} from './console-format.js';
import {httpRules,httpType,responseTime,agreementRule,locationNamer} from './monitor-rules.js';
import {latestAttempts} from './monitor-status.js';
import {isProtocol,protocolExpectations} from './protocol-panel.js';
import {isFlow,flowSummary} from './flow-panel.js';
import {mailSummary} from './mail-panel.js';
import {transactionSummary} from './transaction-panel.js';
// The monitor page's "Up or down" table (U15): a row per Up when rule with its expected value as a chip, a column per location
// the monitor checks from, and in each cell what that location saw on the newest complete scheduled check of the current
// revision (the page's `seen.newest`, from its history read). Under it the two numbers of Down when and Back up after, as
// chips, beside the fixed agreement rule. Every chip, "+ Add a rule" and "+ Location" is a <details> editor
// (public/monitor-rule-edit.js saves them), so a refresh keeps an open editor and its typed values (U9).
export const ADDABLE={bodyIncludes:'Page contains',bodyExcludes:'Page does not contain',bodyRegex:'Page matches a pattern',header:'Header is',json:'JSON value is',latencyMs:'Responds within'};
const PROBES=['local-a','local-b','local-c'];
// Kept in step with src/editor/monitor/check-from.mjs (the full form's Check from), which the console's static modules cannot
// import: three locations a monitor, two for a browser flow.
export const locationLimit=type=>type==='flow'?2:PROBES.length;
// What the page may change in place: HTTP and keyword rules, a protocol check's response time and the two numbers. Browser
// flows and heartbeats stay read-only here, and a followed service's rule is its provider's claim.
export function editing(d){
 const fixed=isFlow(d)||d.type==='heartbeat';
 return {rules:!fixed&&httpType(d)&&!d.tags?.includes('dependency'),latency:!fixed&&['tcp','udp','dns','tls'].includes(d.type),numbers:!fixed,locations:!fixed};
}
// A measured time as the table shows it: "480 ms", "2.1 s".
const measured=ms=>!Number.isFinite(ms)?'–':ms<1000?`${ms} ms`:`${Number((ms/1000).toFixed(1))} s`;
// Why an attempt failed before any rule was judged, from the category its runner reported.
const BEFORE_RULES={connection:'No connection',network:'No connection',timeout:'Timed out',dns:'No address',unresolved:'No address',tls:'TLS failed',redirect:'Redirected','body-limit':'Too large',encoding:'Unreadable'};
// The JSON rule's failure names what it found: "JSON assertion failed at $.status: actual missing; expected "ok"".
const jsonFound=reason=>{const actual=/: actual (.+); expected /.exec(reason??'')?.[1];return actual?(actual.length>18?actual.slice(0,17)+'…':actual):'Differs'};
const WORDS={body:['Found','Missing'],'body-absent':['Not found','Found'],'body-regex':['Matches','No match'],header:['Matches','Differs']};
// One location's cell for one rule: [tone, text]; tone is a .ui-result tone, or none for a rule its attempt never reached.
function cell(rule,o){
 if(o.outcome==='runner_error')return ['unknown','Couldn’t run'];
 const check=o.checks?.find(c=>c.assertion===rule.assertion);
 if(!check){
  if(rule.assertion!=='status'||o.outcome!=='target_failure')return ['none','–'];
  return ['failed',BEFORE_RULES[o.checks?.find(c=>!c.pass)?.assertion]??'Failed'];
 }
 const tone=check.pass?'passed':'failed';
 if(rule.assertion==='status')return [tone,String(o.status??(check.pass?'Passed':'Failed'))];
 if(rule.assertion==='latency')return [tone,measured(o.durationMs)];
 if(rule.assertion==='json')return [tone,check.pass?'Matches':jsonFound(check.reason)];
 return [tone,(WORDS[rule.assertion]??['Passed','Failed'])[check.pass?0:1]];
}
const OVERALL={pass:['passed','Passed'],target_failure:['failed','Failed'],runner_error:['unknown','Couldn’t run']};
// The rules: a row each, with the editor fields its chip opens. Other types list today's expectations; only a response time
// is theirs to change here.
function ruleRows(m){
 const d=m.definition,can=editing(d),latencyRow=()=>({key:'latencyMs',assertion:'latency',label:'Responds within',value:responseTime(d.assertions.latencyMs),edit:can.latency,remove:can.latency});
 if(httpType(d))return httpRules(d).map(rule=>({...rule,edit:can.rules,remove:can.rules&&rule.key!=='status'}));
 if(isProtocol(d))return [...protocolExpectations(d).filter(([label])=>label!=='Slowest answer').map(([label,value,mono],i)=>({key:`expect-${i}`,label,value,mono})),...(d.assertions?.latencyMs!==undefined?[latencyRow()]:[])];
 if(d.type==='heartbeat'){const h=d.heartbeat??{};return [{key:'period',label:'Success period + grace',value:humaneDuration((h.maxAgeMs??0)+(h.graceMs??0))},...(h.maxRunDurationMs?[{key:'run',label:'Maximum run duration',value:humaneDuration(h.maxRunDurationMs)}]:[])]}
 const summary=d.type==='mail'?mailSummary(d):d.type==='api'?transactionSummary(d):isFlow(d)?flowSummary(d):'';
 return summary?[{key:'summary',html:summary}]:[{key:'passes',label:'The check passes',value:''}];
}
// The fields a rule's editor shows, filled with the saved value; `kind` is its assertion key.
function fields(kind,d){
 const a=d.assertions??{},text=(name,label,value,extra='')=>`<label class="edit-field">${label}<input name="${name}" value="${escape(value)}" autocomplete="off"${extra}></label>`;
 if(kind==='status')return text('status','Status is',Array.isArray(a.status)?a.status.join(', '):a.status??200,' required');
 if(kind==='bodyIncludes')return text('text','Page contains',a.bodyIncludes??'',' maxlength="200" required');
 if(kind==='bodyExcludes')return text('text','Page does not contain',a.bodyExcludes??'',' maxlength="200" required');
 if(kind==='bodyRegex')return text('pattern','Page matches',a.bodyRegex?.pattern??'',' maxlength="500" required')+text('flags','Flags',a.bodyRegex?.flags??'',' maxlength="3" class="narrow"');
 if(kind==='header')return text('name','Header',a.header?.name??'',' maxlength="80" required')+text('equals','is',a.header?.equals??'',' maxlength="200"');
 if(kind==='json')return text('path','JSON value at',a.json?.path??'',' maxlength="500" required')+text('equals','is',a.json?showJson(a.json.equals):'',' maxlength="200" required');
 return `<label class="edit-field">Responds within<span class="ui-visually-hidden"> (seconds)</span><input name="seconds" type="number" min="0.001" step="any" inputmode="decimal" required value="${a.latencyMs===undefined?'':a.latencyMs/1000}"></label><span class="edit-unit" aria-hidden="true">s</span>`;
}
// A JSON value as typed: text that would read as JSON keeps its quotes (src/editor/monitor/definition.mjs showJsonValue).
function showJson(value){if(typeof value!=='string')return JSON.stringify(value);try{JSON.parse(value);return JSON.stringify(value)}catch{return value}}
const buttons=remove=>`<span class="edit-buttons"><button type="submit" class="primary ui-compact">Save</button><button type="button" class="ui-compact" data-action="cancel-edit">Cancel</button>${remove?'<button type="button" class="ui-link danger" data-action="remove-rule">Remove</button>':''}</span>`;
const problem=(ui,kind)=>`<p class="edit-error" role="alert" id="edit-error-${kind}">${escape(ui.errors[kind]??'')}</p>`;
// A rule's cell: the rule and its chip, which opens its editor in place.
function ruleCell(rule,d,ui,adding){
 const chip=rule.value?` <span class="value-chip${rule.mono?' ui-mono':''}">${escape(rule.value)}</span>`:'';
 if(rule.html)return rule.html;
 if(!rule.edit)return `<span class="rule-name">${escape(rule.label)}</span>${chip}`;
 return `<details class="rule-edit editor" id="edit-${rule.key}" data-kind="${rule.key}"${adding?' open':''}><summary><span class="rule-name">${escape(rule.label)}</span>${chip}<span class="ui-visually-hidden">, change</span></summary><form class="inline-edit" data-edit="${rule.key}" novalidate>${fields(rule.key,d)}${buttons(rule.remove)}${problem(ui,rule.key)}</form></details>`;
}
// The locations as columns: each probe's location, what its newest attempt in that check found, and how long ago; a
// location with no attempt there waits for its next check, or its first when it has never checked this monitor.
function columns(m,data,newest,earlier){
 const name=locationNamer(m.definition,data.runner.runners??[]),attempts=new Map(latestAttempts(newest).map(o=>[o.probe,o])),before=new Set(latestAttempts(earlier).map(o=>o.probe));
 return (m.definition.probes??[]).map(probe=>({probe,name:name(probe),attempt:attempts.get(probe),checked:before.has(probe)}));
}
function headCell(column,{picker,overall}){
 const o=column.attempt,name=picker?`<button type="button" class="col-name" data-action="open-picker" aria-label="${escape(column.name)}, change locations">${escape(column.name)}</button>`:`<span class="col-name">${escape(column.name)}</span>`;
 const [tone,word]=OVERALL[o?.outcome]??[];
 return `<th scope="col" data-key="col-${column.probe}">${name}<span class="col-age">${o?escape(ago(o.completedAt)):column.checked?'Waiting for next check':'Waiting for first check'}</span>${overall&&o?`<span class="ui-result ${tone}">${word}</span>`:''}</th>`;
}
function bodyCell(rule,column){
 const where=`<span class="cell-where">${escape(column.name)}</span>`;
 if(!column.attempt)return `<td>${where}<span class="cell-none">–</span></td>`;
 const [tone,text]=cell(rule,column.attempt);
 return `<td>${where}<span class="${tone==='none'?'cell-none':`ui-result ${tone}`}">${escape(text)}</span></td>`;
}
// The tick list of locations behind "+ Location" and each column's name, as the full form's Check from lists them: every
// location but one still waiting to join, unless this monitor checks from it; "Up to 3 locations"; a link to add one when no
// other is live.
function locationPicker(m,data,ui){
 const d=m.definition,runners=(data.runner.runners??[]).filter(row=>!row.revokedAt),assigned=new Set(Object.values(d.assignments??{}).map(a=>a.runnerId));
 const shown=runners.filter(row=>row.builtIn||row.hosted||row.lastContactAt!==null||assigned.has(row.runnerId)),limit=locationLimit(d.type);
 const names=shown.map(row=>row.networkLabel),nameOf=row=>names.filter(n=>n===row.networkLabel).length>1?`${row.networkLabel} · ${row.runnerId.slice(5,9)}`:row.networkLabel;
 const ticks=shown.map(row=>`<label class="loc-tick"><input type="checkbox" name="location" value="${escape(row.runnerId)}"${assigned.has(row.runnerId)?' checked':''}><span>${escape(nameOf(row))}</span></label>`).join('');
 const other=shown.some(row=>!assigned.has(row.runnerId))?'':'<p class="pop-note">No other location is live. <a class="ui-link" href="/app/locations">Add a location</a></p>';
 return `<details class="loc-pick editor" id="location-picker" data-kind="locations"><summary class="loc-add"><span aria-hidden="true">+</span>Location<span class="ui-visually-hidden">s to check from</span></summary><form class="loc-pop" data-edit="locations" aria-labelledby="location-picker-title" novalidate><p class="pop-title" id="location-picker-title">Check from</p><div class="loc-ticks" role="group" aria-labelledby="location-picker-title" data-limit="${limit}">${ticks}</div>${other}<p class="pop-note">Up to ${limit} locations</p>${problem(ui,'locations')}<p class="pop-buttons"><button type="submit" class="primary ui-compact">Save</button><button type="button" class="ui-compact" data-action="cancel-edit">Cancel</button></p></form></details>`;
}
// A number of checks as a chip that opens a number field (1–10) in its line.
function numberChip(kind,value,words,can,ui){
 if(!can)return `<span class="value-chip">${value}</span> ${words}`;
 return `<details class="num-edit editor" id="edit-${kind}" data-kind="${kind}"><summary><span class="value-chip">${value}</span> ${words}<span class="ui-visually-hidden">, change</span></summary><form class="inline-edit" data-edit="${kind}" novalidate><label class="edit-field"><input name="value" type="number" min="1" max="10" step="1" required value="${value}" aria-label="${words[0].toUpperCase()+words.slice(1)}"></label><span class="edit-unit">${words}</span>${buttons(false)}${problem(ui,kind)}</form></details>`;
}
function addRule(d){
 const missing=Object.entries(ADDABLE).filter(([key])=>(d.assertions??{})[key]===undefined);
 if(!missing.length)return '';
 return `<details class="add-rule editor" id="add-rule" data-kind="add"><summary class="ui-link"><span aria-hidden="true">+ </span>Add a rule</summary><div class="add-menu" role="group" aria-label="Rules to add">${missing.map(([key,label])=>`<button type="button" data-action="add-rule" data-rule="${key}">${label}</button>`).join('')}</div></details>`;
}
// ui: the page's editing state ({adding, errors}); newest: the newest complete scheduled slot of the current revision;
// earlier: the newest complete scheduled slot of any revision.
export function rulesTable(m,{data,newest,earlier,ui}){
 const d=m.definition,can=editing(d),heartbeat=d.type==='heartbeat',cols=heartbeat?[]:columns(m,data,newest,earlier),rows=ruleRows(m);
 if(ui.adding&&can.rules&&!rows.some(rule=>rule.key===ui.adding))rows.push({key:ui.adding,assertion:null,label:ADDABLE[ui.adding],value:'',edit:true,remove:false,draft:true});
 const perRule=httpType(d)&&!heartbeat,picker=can.locations&&!heartbeat;
 const head=`<thead><tr><th scope="col">Rule</th>${cols.map(column=>headCell(column,{picker,overall:!perRule})).join('')}</tr></thead>`;
 const body=rows.map(rule=>`<tr data-key="rule-${rule.key}"${rule.draft?' class="draft"':''}><th scope="row"${perRule&&!rule.html?'':` colspan="${1+cols.length}"`}>${ruleCell(rule,d,ui,rule.draft)}</th>${perRule&&!rule.html?cols.map(column=>rule.draft?`<td><span class="cell-where">${escape(column.name)}</span><span class="cell-none">–</span></td>`:bodyCell(rule,column)).join(''):''}</tr>`).join('');
 const agreement=agreementRule(m,data.runner.runners??[]);
 return `<section class="ui-card panel rules-table" id="rules-card" aria-labelledby="rules-heading"><div class="panel-head"><h2 id="rules-heading">Up or down</h2>${picker?locationPicker(m,data,ui):''}</div>`
  +`<table class="rule-grid" id="rule-grid" data-locations="${cols.length}">${head}<tbody>${body}</tbody></table>`
  +(can.rules?`<div class="grid-add">${addRule(d)}</div>`:'')
  +`<dl class="grid-foot"><div><dt>Down when</dt><dd>${numberChip('confirmSlots',d.confirmSlots,d.confirmSlots===1?'failed check':'failed checks in a row',can.numbers,ui)}<span class="agreement"> · ${escape(agreement.charAt(0).toLowerCase()+agreement.slice(1))}</span></dd></div>`
  +`<div><dt>Back up after</dt><dd>${numberChip('recoverSlots',d.recoverSlots,d.recoverSlots===1?'passing check':'passing checks',can.numbers,ui)}</dd></div></dl></section>`;
}
