// A monitor's pass/fail rules in plain words: what one check must see (Up when), when the monitor is down (Down when) and
// the locations it is checked from, for the rows of the "Up or down" table on the monitor's page and the list's quiet line.
// Only rules the code applies are named: the agreement between locations is fixed (src/domain/policy.mjs), so it is stated,
// not offered as a setting.
export const quoted=(text,max=40)=>`“${text.length>max?text.slice(0,max-1)+'…':text}”`;
// "3 s", "250 ms": a duration rule's value.
export const responseTime=ms=>ms<1000?`${ms.toLocaleString()} ms`:`${(ms/1000).toLocaleString()} s`;
export const statusText=status=>(Array.isArray(status)?status:[status]).map(code=>String(code).replace(/^(\d{3})-(\d{3})$/,'$1–$2')).join(', ');
export const httpType=definition=>!definition.type||['http','keyword'].includes(definition.type);
// The HTTP rules, one per assertion, in the order they are checked (src/domain/http-assertions.mjs): the assertion key, the
// name the check evidence gives it, the rule's words and its expected value (a chip on the page).
export function httpRules(definition){
 const a=definition.assertions??{},rules=[{key:'status',assertion:'status',label:'Status is',value:statusText(a.status??200)}];
 if(a.bodyIncludes!==undefined)rules.push({key:'bodyIncludes',assertion:'body',label:'Page contains',value:quoted(a.bodyIncludes,200)});
 if(a.bodyExcludes!==undefined)rules.push({key:'bodyExcludes',assertion:'body-absent',label:'Page does not contain',value:quoted(a.bodyExcludes,200)});
 if(a.bodyRegex)rules.push({key:'bodyRegex',assertion:'body-regex',label:'Page matches',value:`/${a.bodyRegex.pattern}/${a.bodyRegex.flags??''}`,mono:true});
 if(a.header)rules.push({key:'header',assertion:'header',label:`Header ${a.header.name} is`,value:quoted(a.header.equals,200)});
 if(a.json)rules.push({key:'json',assertion:'json',label:`JSON ${a.json.path} is`,value:JSON.stringify(a.json.equals)});
 if(a.latencyMs!==undefined)rules.push({key:'latencyMs',assertion:'latency',label:'Responds within',value:responseTime(a.latencyMs)});
 return rules;
}
// The current names of the locations a monitor checks from (a renamed location shows its new name).
export function checkedFrom(definition,runners=[]){
 const names=Object.values(definition.assignments??{}).map(a=>runners.find(r=>r.runnerId===a.runnerId)?.networkLabel??a.networkLabel).filter(Boolean);
 return [...new Set(names)];
}
// A probe (local-a) as the location it runs from: the runner's current name, else the name it had when assigned. A revision
// from before assignments ran every probe on this computer's own location.
export function locationNamer(definition,runners=[]){
 return probe=>{const assignment=definition?.assignments?.[probe];return runners.find(r=>assignment?r.runnerId===assignment.runnerId:r.builtIn)?.networkLabel??assignment?.networkLabel??probe};
}
const hostOf=url=>{try{return new URL(url).hostname.replace(/^www\./,'')}catch{return url}};
// How an outage is agreed for this revision (src/domain/policy.mjs): two locations, or one while the external check its checks
// use still loads there. A monitor that follows Settings names the URL Settings holds now (m.externalCheck, from the server).
export function agreementRule(m,runners=[]){
 const d=m.definition;
 if(!d.assignments)return `${d.failureQuorum} failing checks agree`;
 const host=m.externalCheck?.url?hostOf(m.externalCheck.url):'',networks=new Set(Object.values(d.assignments).map(a=>a.networkLabel));
 if(networks.size<2)return host?`Fails from ${checkedFrom(d,runners)[0]} while ${host} still loads there`:`Fails from ${checkedFrom(d,runners)[0]}`;
 return host?`Fails from 2 locations, or from 1 while ${host} still loads there`:'Fails from 2 locations';
}
