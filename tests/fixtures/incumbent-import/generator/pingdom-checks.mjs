import {corpus,epoch,get,copy} from './transport.mjs'
import {addRelationships,addHistory,addTransactions} from './pingdom-resources.mjs'

export const pingdomNotes=[
 {id:'ping-detail-omission',path:'GET /checks/{checkid}.check.type',description:'The published GET oneOf omits ping although create/list document ping. Positive ping records retain documented list/common fields only. The empty ping settings object appears solely in an explicitly labeled adapter-convention fixture.'},
 {id:'contact-target-alternatives',path:'GET /alerting/contacts.contacts[].notification_targets',description:'The schema describes arrays of target alternatives; its example uses channel-keyed email/sms arrays. Both documented alternatives are separate fixtures, not a fabricated universal provider shape.'},
 {id:'threshold-schema-defect',path:'check.responsetime_threshold',description:'GET declares boolean with integer example 30000; create/modify declare integer milliseconds. This corpus uses documented integer semantics. Pingdom latency down alerts differ from Uptime Slow and require review.'},
 {id:'tms-identity-context',path:'GET /tms/check/{cid}',description:'Detail has no ID. List IDs and descriptor request/sourceId carry stable identity; native detail objects are unmodified.'},
 {id:'keywords-exclusive',path:'check.type.http',description:'Source shouldcontain and shouldnotcontain are mutually exclusive. Positive controls set one or neither; the combination is a separate negative case.'},
 {id:'recording-security-description',path:'metadata.disableWebSecurity',description:'The API property name suggests true disables security, but its description says false disables the same-origin policy. Preserve the source value for review; no value may relax native browser security.'},
 {id:'no-page-speed-export',path:'Page Speed',description:'API 3.1 publishes no Page Speed export schema. Operator transcription is separately labeled, not an API response.'},
 {id:'unavailable-resources',path:'public pages/integrations',description:'Complete public-page and integration-detail APIs are absent from the retrieved schema. Unknown count, not zero; handoff and export still require review.'}
]
export const intervals=[1,5,15,30,60]
const tag=name=>({name,type:'u',count:1})

function common(i,kind){
 return {id:61000+i,name:i===0?'Synthetic HTTP café — 東京':`Synthetic ${kind.toUpperCase()} ${String(i+1).padStart(2,'0')}`,hostname:`check-${61000+i}.example.test`,resolution:intervals[i%intervals.length],status:['up','down','unconfirmed_down','unknown','paused'][i%5],created:epoch-90*86400,lasttesttime:epoch-60,lastresponsetime:180+i,lasterrortime:epoch-86400,lastdownstart:epoch-86400,lastdownend:epoch-86339,ipv6:i%2===1,tags:i%7===0?[]:[tag('synthetic'),tag(kind)]}
}
function detail(summary,i,teams){
 const kind=summary.type,check={...copy(summary),type:{},probe_filters:[],integrationids:i%3===0?[91001,91002]:[],notifyagainevery:i%3===0?3:0,notifywhenbackup:i%2===0,sendnotificationwhendown:2,custom_message:i===0?'Synthetic latency review: café ☕':'Synthetic migration check'}
 if(kind==='http'){
  const encrypted=i<8||i%2===0
  check.type.http={url:`/health/${i+1}`,encryption:encrypted,port:encrypted?443:80,verify_certificate:i!==7,...(i<8?{ssl_down_days_before:7+i}:{}),...(i%3===0?{shouldcontain:'ready'}:i%3===1?{shouldnotcontain:'failure'}:{})}
  if(i===0)check.type.http.requestheaders=['Accept: application/json','X-Synthetic-Context: region: lab: east']
  if(i===1)check.responsetime_threshold=30000
  if(i===2)check.probe_filters=['region: EU','region: NA']
 }else if(kind==='tcp')check.type.tcp={port:12345,...(i%2?{stringtoexpect:'READY'}:{stringtosend:'PING\r\n',stringtoexpect:'PONG'})}
 else if(kind==='dns')check.type.dns={nameserver:`resolver-${i}.example.test`,expectedip:summary.ipv6?'2001:db8::53':'192.0.2.53'}
 else if(kind==='smtp')check.type.smtp={port:i%2?587:465,encryption:true,stringtoexpect:'220 synthetic.example.test ESMTP'}
 if(i===0)check.teams=copy(teams)
 return {check}
}

export function buildPingdom(){
 const c=corpus('pingdom',{account:'synthetic-pingdom-account',timezone:'not-supplied-by-provider'},pingdomNotes)
 const teams=[{id:81001,name:'Synthetic Platform',members:[{id:71001,name:'Synthetic Owner',type:'user'},{id:71002,name:'Synthetic Notify',type:'contact'}]},{id:81002,name:'Synthetic Réponse',members:[{id:71003,name:'Synthetic SMS',type:'contact'},{id:71004,name:'Synthetic APNS',type:'user'},{id:71005,name:'Synthetic AGCM',type:'contact'}]}]
 const checks=Array.from({length:65},(_,i)=>{const kind=i<25?'http':i<35?'tcp':i<45?'ping':i<55?'dns':'smtp';return {...common(i,kind),type:kind}})
 for(const offset of [0,25,50]){
  const page=checks.slice(offset,offset+25)
  c.add(`checks/list-${String(offset).padStart(3,'0')}.json`,'checks-list',{checks:page,counts:{total:65,limited:65,filtered:page.length}},{recordCount:page.length,request:get('/api/3.1/checks',{limit:25,offset,include_tags:true,include_severity:true}),pagination:{offset,limit:25,...(offset<50?{nextOffset:offset+25}:{})}})
 }
 const details=[]
 for(const [i,summary] of checks.entries()){
  if(summary.type==='ping')continue
  const response=detail(summary,i,teams);details.push(response)
  c.add(`checks/detail-${summary.id}.json`,'check-detail',response,{sourceId:summary.id,request:get(`/api/3.1/checks/${summary.id}`,{include_teams:true})})
 }
 addRelationships(c,teams)
 const history=addHistory(c)
 const transactions=addTransactions(c)
 const counts={uptimeChecks:65,uptimeListPages:3,uptimeDetails:55,pingSummaryOnly:10,byType:{http:25,tcp:10,ping:10,dns:10,smtp:10},expectedTlsCompanions:8,teams:2,contacts:5,integrationIds:2,maintenanceWindows:2,...history.counts,...transactions.counts}
 const result=c.finish(counts)
 return {...result,checks,details,teams,history,transactions,notes:pingdomNotes}
}
