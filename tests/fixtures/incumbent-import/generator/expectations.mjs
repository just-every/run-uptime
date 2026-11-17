import {clock,corpus,copy,get} from './transport.mjs'

export function legacyFixture(){
 return Array.from({length:7},(_,i)=>{
  const id=6001+i,name=`synthetic-uptime-${i+1}`
  if(i===4||i===5)return {id,name,type:i===4?'script':'recording',interval:5,region:'eu',steps:[],tags:['synthetic-uptime-1']}
  const check={id,name,hostname:`${name}.example`,resolution:5,type:i===3?{tcp:{port:443}}:{http:{encryption:true,verify_certificate:true,url:'/status',port:443,...(i%2?{shouldnotcontain:'failure'}:{shouldcontain:'ready'})}}}
  if(i===0)check.tags=[{name:'synthetic-uptime-1',type:'a',count:1},{name:'synthetic-uptime-2',type:'a',count:1}]
  if(i===1)check.probe_filters=['region: EU','region: NA']
  if(i===2)check.probe_filters=['region: APAC']
  if(i===6)check.tags=[{name:''}]
  return {check}
 })
}

export function pageSpeed(){
 const c=corpus('pingdom-pagespeed-transcription',{account:'synthetic-pingdom-account',origin:'operator-transcription'},[{id:'not-an-api-export',description:'These fields are a synthetic operator transcription of documented Page Speed UI. No public native export schema has been established; this is a proposal, not a Pingdom API response.'}])
 c.add('transcription.json','page-speed-transcription',{name:'Synthetic page speed — café',url:'https://page-speed.example.test/',intervalMinutes:30,region:'North America',medianLoadTimeMs:1500,yslowGrade:'B',resources:[{url:'https://page-speed.example.test/',startTimeMs:0,loadTimeMs:600},{url:'https://page-speed.example.test/site.css',startTimeMs:600,loadTimeMs:100}],historicalReports:[{from:'2026-10-01T00:00:00Z',to:clock,medianLoadTimeMs:1500}],filmstrip:[{timeMs:0,artifact:'synthetic-filmstrip-000.svg'},{timeMs:500,artifact:'synthetic-filmstrip-500.svg'}]},{sourceId:'synthetic-pagespeed-1',request:{method:'LOCAL',path:'operator-transcription/pagespeed',query:{}}})
 for(const [label,color] of [['000','#fff'],['500','#1e4535']])c.put(`synthetic-filmstrip-${label}.svg`,Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="${color}"/><text x="16" y="90" fill="#888">Synthetic ${label} ms</text></svg>\n`))
 return c.finish({pageSpeedTranscriptions:1,claimedNativeExports:0})
}

// Authored from documented source semantics; never calls or imports a mapper.
// These are facts and obligations, not an assertion that every converter exists.
export function expectations(pingdom,aws,cases){
 const checks=pingdom.checks.map(value=>({sourceId:String(value.id),sourceType:value.type,intervalMs:value.resolution*60000,ipv6:value.ipv6,sourceStatus:value.status,initialLocalEnabled:false,detailAvailable:value.type!=='ping',...(value.id<61008?{tlsCompanion:{sourceId:`${value.id}:tls`,expiryDays:7+value.id-61000}}:{})}))
 return {
  format:'uptime.incumbent-fixture-expectations.v1',author:'Codex',authoredAt:'2026-11-17',basis:'Public Pingdom API 3.1 and AWS API references; planner FIELD-MAP.csv at 99eeacb8f36b6c97ead141fd1703fbbdec89f0b2. No production importer is used to derive expectations.',
  counts:{pingdom:pingdom.counts,aws:aws.counts},checks,
  history:copy(pingdom.history.expected),
  identity:{tms:pingdom.transactions.summaries.map(v=>({sourceId:String(v.id),path:`/api/3.1/tms/check/${v.id}`,type:v.type,name:v.name})),integrationIds:['91001','91002'],contactIds:['71001','71002','71003','71004','71005'],integrationIdsAreContactIds:false},
  transactionProposals:[{sourceId:'83001',outcome:'login',disposition:'reviewed conversion required',expectedElement:'[data-synthetic=dashboard]'},{sourceId:'83002',outcome:'signup',disposition:'reviewed conversion required',expectedElement:'[data-synthetic=welcome]'},{sourceId:'83003',outcome:'sandbox checkout',disposition:'reviewed conversion required',expectedElement:'[data-synthetic=sandbox-receipt]'},{sourceId:'83004',outcome:'unsupported command',disposition:'refused',sourcePath:'steps[1].fn',command:'execute_javascript'}],
  maintenance:{sourceTimezoneSupplied:false,recurrenceMustNotInventTimezone:true,dstBoundaryUtc:'2026-11-01T06:00:00Z',windows:2,occurrences:5,sourceEpochsRemainUnchanged:true},
  sourceOnly:['source status and last-result snapshots','geographic probes','IAM/KMS/S3/Lambda/SNS references','device authority','source alarm state'],
  noEffects:['outbound provider/target connection','code execution','enabled monitor','runner or credential grant','destination activation','notification replay','native incident','scheduled slot or observation'],
  leafCoverage:{documentedInventory:'documented-field-map.csv',documentedPaths:363,unknownFields:'Every supplied leaf, empty list and empty object requires an exact-path disposition. Unavailable resources are unknown, never counted as extracted zero.'},
  cases
 }
}
