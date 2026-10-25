import {monitorReport,type MonitorReport} from './index.server.ts'
import {configuredPeriod} from './configured-period.server.ts'
import {credentialMonitorFilter,type CredentialEnvironment} from '../credentials/model.server.ts'
import {windowMetrics} from '../availability.server.ts'
import {ReportInputError} from './period.ts'
export async function serviceReport(env:CredentialEnvironment,service:string,params:URLSearchParams,now=Date.now()){
 if(!service||service.length>100)throw new ReportInputError('Choose a service name')
 const filter=credentialMonitorFilter(env),rows=(await env.DB.prepare(`SELECT id FROM monitors WHERE json_extract(definition,'$.service')=? AND ${filter.sql} ORDER BY id`).bind(service,...filter.params).all<{id:string}>()).results
 if(!rows.length)return null
 const period=await configuredPeriod(env,params,now),members:MonitorReport[]=[]
 for(const row of rows){const report=await monitorReport(env,row.id,period,now);if(report)members.push(report)}
 const sum=(key:'upMs'|'notPassingMs'|'windowMs'|'pausedMs'|'maintenanceMs')=>members.reduce((sum,m)=>sum+m.availability[key],0)
 const availability=windowMetrics(sum('upMs'),sum('notPassingMs'),sum('windowMs'),sum('pausedMs'),sum('maintenanceMs')),target=period.slaTargetPercent
 return {schemaVersion:1,generatedAt:now,service:{name:service,monitors:members.map(m=>m.monitor)},period,denominatorPolicy:'Sum of member-monitor time, with each member calculated by the same immutable period engine. Unknown, paused and maintenance time remain separate; no average of percentages or percentiles.',availability,
 sla:target===null?null:{targetPercent:target,actualPercent:availability.uptimePercent,met:availability.observedMs?availability.upMs*100>=target*availability.observedMs:null,denominatorMs:availability.observedMs,allowedNotPassingMs:availability.observedMs*(100-target)/100,remainingBudgetMs:availability.observedMs*(100-target)/100-availability.notPassingMs},
 incidentSummary:{count:members.reduce((n,m)=>n+m.incidentSummary.count,0),durationInPeriodMs:members.reduce((n,m)=>n+m.incidentSummary.durationInPeriodMs,0)},members}
}
export function serviceReportCsv(report:NonNullable<Awaited<ReturnType<typeof serviceReport>>>){
 const cell=(v:unknown)=>{const text=String(v??'');return '"'+(/^[\s]*[=+@-]/.test(text)?"'":'')+text.replaceAll('"','""')+'"'},rows:unknown[][]=[['scope','monitor_id','monitor_name','from','to','time_zone','metric','value']]
 const add=(scope:string,id:string,name:string,values:Record<string,unknown>)=>{for(const [key,value]of Object.entries(values))rows.push([scope,id,name,report.period.from,report.period.to,report.period.timeZone,key,value])}
 add('service','',report.service.name,report.availability);for(const member of report.members)add('monitor',member.monitor.id,member.monitor.name,member.availability)
 return rows.map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n'
}
