// PERF-001: the owner's side of the real-user beacon, and the two page-speed reports. A site is registered off; the owner enables
// it, sets its sampling (10% by default) and excluded paths, and every change is an audit entry. The real-user report counts
// sampled page views; the synthetic report counts page-speed checks. Each keeps its own denominator and they are never summed.
import {auditStatement,type AuditActor} from '../audit.server.ts'
import {get,type Bindings} from '../control.server.ts'
// @ts-ignore Shared beacon rules (edition JavaScript).
import {RUM_LIMITS,validateSiteInput} from './privacy.mjs'
// @ts-ignore Shared page-speed figures.
import {budgetValues} from '../pagespeed.mjs'

const shown=(env:Bindings,row:any)=>({id:row.id,origin:row.origin,enabled:Boolean(row.enabled),samplePercent:row.sample_percent,excludedPaths:JSON.parse(row.excluded_paths),
 snippet:`<script src="${env.UPTIME_ORIGIN}/rum/v1/s/${row.id}.js" async></script>`,createdAt:row.created_at,updatedAt:row.updated_at})
const notFound=()=>Object.assign(Error('Beacon site not found'),{status:404})
export async function rumSites(env:Bindings){
 return {sites:(await env.DB.prepare('SELECT * FROM rum_sites ORDER BY origin').all<any>()).results.map(row=>shown(env,row)),
  defaults:{enabled:false,samplePercent:RUM_LIMITS.defaultSamplePercent,excludedPaths:[]},
  privacy:'Anonymous hourly aggregates by route, device and country only. No cookies, query strings, fragments, identifiers or IP addresses are kept; Do Not Track, Global Privacy Control and automated browsers are never measured; nothing is measured before the site records consent.'}
}
export async function registerRumSite(env:Bindings,input:any,actor:AuditActor){
 const site=validateSiteInput(input,{local:env.UPTIME_LOCAL_REVIEW==='true'}),id=crypto.randomUUID(),now=Date.now()
 if(await env.DB.prepare('SELECT 1 FROM rum_sites WHERE origin=?').bind(site.origin).first())throw Object.assign(Error('That origin is already registered'),{status:409})
 await env.DB.batch([env.DB.prepare('INSERT INTO rum_sites(id,origin,enabled,sample_percent,excluded_paths,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
  .bind(id,site.origin,Number(site.enabled??false),site.samplePercent??RUM_LIMITS.defaultSamplePercent,JSON.stringify(site.excludedPaths??[]),now,now),
  auditStatement(env,actor,'rum_site_register','rum_site',crypto.randomUUID(),'1',[],now)])
 return shown(env,await env.DB.prepare('SELECT * FROM rum_sites WHERE id=?').bind(id).first<any>())
}
export async function updateRumSite(env:Bindings,id:string,input:any,actor:AuditActor){
 const change=validateSiteInput(input,{local:env.UPTIME_LOCAL_REVIEW==='true',partial:true}),now=Date.now()
 if(change.origin!==undefined)throw Object.assign(Error('A registered origin does not change; register the other origin instead'),{status:400})
 const row=await env.DB.prepare('SELECT * FROM rum_sites WHERE id=?').bind(id).first<any>();if(!row)throw notFound()
 await env.DB.batch([env.DB.prepare('UPDATE rum_sites SET enabled=?,sample_percent=?,excluded_paths=?,updated_at=? WHERE id=?')
  .bind(Number(change.enabled??Boolean(row.enabled)),change.samplePercent??row.sample_percent,JSON.stringify(change.excludedPaths??JSON.parse(row.excluded_paths)),now,id),
  auditStatement(env,actor,change.enabled===false?'rum_site_disable':'rum_site_change','rum_site',crypto.randomUUID(),'1',[],now)])
 return shown(env,await env.DB.prepare('SELECT * FROM rum_sites WHERE id=?').bind(id).first<any>())
}
const average=(sum:number,n:number,scale=1)=>n?Math.round(sum/n/scale*1000)/1000:null
/** Real-user figures for one site over the last `hours`, by route, device and country. Denominator: sampled page views. */
export async function rumReport(env:Bindings,id:string,hours=24){
 const row=await env.DB.prepare('SELECT * FROM rum_sites WHERE id=?').bind(id).first<any>();if(!row)throw notFound()
 const since=Date.now()-Math.min(Math.max(1,hours),RUM_LIMITS.reportHours)*3600000
 const [groups,dropped]=await env.DB.batch<any>([env.DB.prepare(`SELECT route,device,region,SUM(views) views,SUM(failed_views) failed,SUM(known_views) known,SUM(errors) errors,SUM(lcp_n) lcp_n,SUM(lcp_sum) lcp_sum,SUM(lcp_poor) lcp_poor,
  SUM(cls_n) cls_n,SUM(cls_milli_sum) cls_sum,SUM(inp_n) inp_n,SUM(inp_sum) inp_sum,SUM(ttfb_n) ttfb_n,SUM(ttfb_sum) ttfb_sum FROM rum_aggregates WHERE site_id=? AND hour>=? GROUP BY route,device,region ORDER BY route,device,region`).bind(id,since-3600000),
  env.DB.prepare('SELECT reason,SUM(count) count FROM rum_dropped WHERE site_id=? AND hour>=? GROUP BY reason ORDER BY reason').bind(id,since-3600000)])
 const rows=groups.results.map((g:any)=>({route:g.route,device:g.device,region:g.region,views:g.views,
  availability:g.known?{loaded:g.known-g.failed,of:g.known,percent:Math.round((g.known-g.failed)/g.known*10000)/100}:null,errors:g.errors,
  lcpMs:{average:average(g.lcp_sum,g.lcp_n),poorPercent:g.lcp_n?Math.round(g.lcp_poor/g.lcp_n*10000)/100:null,of:g.lcp_n},cls:{average:average(g.cls_sum,g.cls_n,1000),of:g.cls_n},
  inpMs:{average:average(g.inp_sum,g.inp_n),of:g.inp_n},ttfbMs:{average:average(g.ttfb_sum,g.ttfb_n),of:g.ttfb_n}}))
 return {kind:'real-user',denominator:'sampled page views',site:shown(env,row),hours,views:rows.reduce((sum:number,r:any)=>sum+r.views,0),rows,
  dropped:Object.fromEntries(dropped.results.map((d:any)=>[d.reason,d.count]))}
}
/** Synthetic page-speed figures for one monitor: its latest checks. Denominator: page-speed checks (runner errors are coverage, not checks). */
export async function pageSpeedReport(env:Bindings,monitorId:string){
 const monitor=await get(env,monitorId);if(!monitor||monitor.definition.type!=='pagespeed')throw Object.assign(Error('Page-speed monitor not found'),{status:404})
 const rows=(await env.DB.prepare('SELECT o.evidence,s.due_at FROM observations o JOIN slots s ON s.id=o.slot_id WHERE s.monitor_id=? ORDER BY s.due_at DESC,o.rowid DESC LIMIT 100').bind(monitorId).all<any>()).results
 const checks=rows.map((r:any)=>JSON.parse(r.evidence)).filter((o:any)=>o.outcome!=='runner_error')
 const latest=checks.find((o:any)=>o.pagespeed)
 const site=await env.DB.prepare('SELECT * FROM rum_sites WHERE origin=?').bind(new URL(monitor.definition.url).origin).first<any>()
 return {kind:'synthetic',denominator:'page-speed checks',checks:checks.length,overBudget:checks.filter((o:any)=>o.outcome==='target_failure').length,
  settings:monitor.definition.pagespeed,latest:latest?{completedAt:latest.completedAt,probe:latest.probe,outcome:latest.outcome,checks:latest.checks,figures:budgetValues(latest.pagespeed),evidence:latest.pagespeed}:null,
  realUser:site?{siteId:site.id,report:await rumReport(env,site.id,24)}:null}
}
