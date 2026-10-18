const parameters = [
 {name:'rootCause',in:'query',schema:{type:'string'},description:'Filter incident rows and their grouped downtime by category ID. Coverage and SLA denominators remain complete.'},
 {name:'id',in:'path',required:true,schema:{type:'string'},description:'Installation-local monitor ID.'},
 {name:'period',in:'query',schema:{type:'string',enum:['24h','7d','30d','90d','custom'],default:'24h'}},
 {name:'from',in:'query',schema:{type:'string'},description:'Custom start: ISO 8601 date/time or epoch milliseconds.'},
 {name:'to',in:'query',schema:{type:'string'},description:'Custom end, after from and no later than now. Ranges are at most 90 days.'},
 {name:'timeZone',in:'query',schema:{type:'string',default:'America/Chicago'},description:'IANA zone. Ambiguous or nonexistent local DST times require an explicit UTC offset.'},
 {name:'sla',in:'query',schema:{type:'number',exclusiveMinimum:0,maximum:100},description:'Optional SLA target as a percentage of observed time.'},
 {name:'bucket',in:'query',schema:{type:'string',enum:['raw','1m','5m','1h','1d'],default:'5m'}},
 {name:'location',in:'query',schema:{type:'string',default:'all'},description:'all or a probe ID selected in this monitor’s retained revisions.'},
]
const error={description:'Request refused',content:{'application/json':{schema:{type:'object',required:['error'],properties:{error:{type:'string'},code:{type:'string'}}}}}}
const operation=(summary:string,report:boolean)=>({summary,security:[{ownerSession:[]}],parameters:[...parameters,...(report?[{name:'format',in:'query',schema:{type:'string',enum:['json','csv','pdf'],default:'json'}}]:[])],responses:{
 '200':{description:report?'Coverage, SLA, latency and incidents computed from immutable scheduled evidence.':'Bounded latency statistics and series; nearest-rank percentiles and UTC-aligned buckets.',content:{'application/json':{schema:{type:'object'}},...(report?{'text/csv':{schema:{type:'string'}},'application/pdf':{schema:{type:'string',format:'binary'}}}:{})}},
 '400':error,'401':error,'404':error,
}})
export const readApiOpenApi={
 openapi:'3.1.0',info:{title:'Uptime monitoring reads',version:'1.0.0',description:'Report and incident reads require an active owner session. The metrics endpoint additionally accepts a read-only metrics:read key. General-purpose scoped keys are not implemented. Local development uses an origin-specific session cookie. This document describes the implemented reads only.'},
 servers:[{url:'/'}],components:{securitySchemes:{metricsKey:{type:'http',scheme:'bearer',description:'Installation-local, shown-once, expiring and revocable metrics:read key. Only GET /api/v1/metrics is authorized.'},ownerSession:{type:'apiKey',in:'cookie',name:'__Host-operator_session',description:'Native authenticated owner session. Signed-out and revoked sessions are refused; this is not an API key.'}}},
 paths:{
  '/api/v1/metrics':{get:{summary:'Prometheus text or the same JSON metrics snapshot',security:[{ownerSession:[]},{metricsKey:[]}],parameters:[...parameters.filter(p=>['period','from','to','timeZone'].includes(p.name)),{name:'monitor',in:'query',schema:{type:'string'},description:'Comma-separated monitor IDs, at most 100; omitted selects this installation.'},{name:'format',in:'query',schema:{type:'string',enum:['prometheus','json'],default:'prometheus'}}],responses:{'200':{description:'Exact immutable report denominators/latency and incident totals, current coverage/freshness and current outcomes of delivery jobs created in the window. Gauges, maximum 90 days, 100 monitors, 3 probe IDs per monitor, 15000 samples and 2 MiB.',content:{'text/plain':{schema:{type:'string'}},'application/json':{schema:{type:'object'}}}},'400':error,'401':error,'403':error,'404':error,'429':error}}},
  '/api/v1/incidents':{get:{summary:'Page through confirmed incidents and private root-cause accounts',security:[{ownerSession:[]}],parameters:['monitor','tag','from','to','state','rootCause','cursor','limit'].map(name=>({name,in:'query',schema:{type:'string'},description:name==='limit'?'1 to 100; defaults to 50.':name==='cursor'?'Opaque nextCursor returned by the preceding page; stable confirmation order.':'Optional incident filter.'})),responses:{'200':{description:'items, nextCursor, limit, from and to. Sources remain labelled; use each detailUrl for comments and timeline.'},'400':error,'401':error}}},
  '/api/v1/incidents/{id}':{get:{summary:'Read one incident, comments, edit history, root cause and activity timeline',security:[{ownerSession:[]}],parameters:[{name:'id',in:'path',required:true,schema:{type:'string'},description:'Stable trigger event ID from the incident list.'}],responses:{'200':{description:'Private incident detail. Response resolution is separate from machine recovery. nextDue is the earliest pending contact delay or reminder under the confirmation-time contact policy, or null when none is scheduled.'},'401':error,'404':error}}},
  '/api/v1/monitors/{id}/uptime':{get:operation('Read period availability and its supporting report',true)},
  '/api/v1/monitors/{id}/report':{get:operation('Read or download the same period report used by the console',true)},
  '/api/v1/monitors/{id}/response-times':{get:operation('Read response-time percentiles and series, up to 10,000 points',false)},
 },
}
