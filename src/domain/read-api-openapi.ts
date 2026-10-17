const parameters = [
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
const operation=(summary:string,report:boolean)=>({summary,security:[{ownerSession:[]}],parameters:[...parameters,...(report?[{name:'format',in:'query',schema:{type:'string',enum:['json','csv'],default:'json'}}]:[])],responses:{
 '200':{description:report?'Coverage, SLA, latency and incidents computed from immutable scheduled evidence.':'Bounded latency statistics and series; nearest-rank percentiles and UTC-aligned buckets.',content:{'application/json':{schema:{type:'object'}},...(report?{'text/csv':{schema:{type:'string'}}}:{})}},
 '400':error,'401':error,'404':error,
}})
export const readApiOpenApi={
 openapi:'3.1.0',info:{title:'Uptime monitoring reads',version:'1.0.0',description:'Current v1 reads require an active owner session. API keys, scoped tokens and their rate-limit policy are not implemented. Local development uses an origin-specific session cookie. This document describes the implemented reads only.'},
 servers:[{url:'/'}],components:{securitySchemes:{ownerSession:{type:'apiKey',in:'cookie',name:'__Host-operator_session',description:'Native authenticated owner session. Signed-out and revoked sessions are refused; this is not an API key.'}}},
 paths:{
  '/api/v1/monitors/{id}/uptime':{get:operation('Read period availability and its supporting report',true)},
  '/api/v1/monitors/{id}/report':{get:operation('Read or download the same period report used by the console',true)},
  '/api/v1/monitors/{id}/response-times':{get:operation('Read response-time percentiles and series, up to 10,000 points',false)},
 },
}
