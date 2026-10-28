import {recogniseHistory} from '../src/domain/definitions/history.ts';
import {isIncidentJson} from '../src/domain/source-history/json.ts';
const context=options=>Object.fromEntries([['sourceMonitorId',options['source-monitor']],['extractedAt',options['extracted-at']],['coverageFrom',options.from],['coverageTo',options.to]].filter(([,value])=>value!==undefined));
export const isHistoryFile=(text,source='auto',sourceMonitor)=>sourceMonitor!==undefined||source==='uptimerobot-log'||(source==='auto'&&(isIncidentJson(text)||Boolean(recogniseHistory(text))));
export async function localHistoryCommand(env,command,options,text){
 if(command==='history-batches')return (await env.DB.prepare('SELECT * FROM source_history_batches ORDER BY imported_at,id,monitor_id').all()).results;
 if(command==='history-remove')return (await import('../src/domain/source-history/apply.server.ts')).removeHistoryBatch(env,options.batch);
 if(command==='history-cutover')return (await import('../src/domain/source-history/cutover.server.ts')).setHistoryCutover(env,options.monitor,{cutoverAt:options.at});
 if(command==='apply')return (await import('../src/domain/source-history/apply.server.ts')).applyHistory(env,{text,digest:options.digest,...context(options)});
 return (await import('../src/domain/source-history/preview.server.ts')).historyPlan(env,text,context(options));
}
export async function remoteHistoryCommand(command,options,text){
 const url=new URL(options.origin);
 if(url.pathname!=='/'||url.search||url.hash||url.username||url.password||(url.protocol!=='https:'&&!(url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname))))throw Error('Use an HTTPS installation origin (HTTP is allowed only on loopback).');
 if(process.env.UPTIME_CI_TOKEN)throw Error('Source history requires an owner session; CI credentials cannot import history.');
 const cookie=process.env.UPTIME_SESSION_COOKIE;
 if(!cookie)throw Error('Set UPTIME_SESSION_COOKIE to the authorized owner session.');
 const base='/api/definitions/history/',path=command==='history-batches'?'batches':command==='history-remove'?'batches/'+encodeURIComponent(options.batch):command==='history-cutover'?'cutover/'+encodeURIComponent(options.monitor):command==='apply'?'apply':'preview';
 const method=command==='history-batches'?'GET':command==='history-remove'?'DELETE':'POST';
 const body=method==='POST'?JSON.stringify(command==='history-cutover'?{cutoverAt:options.at}:{text,...context(options),...(command==='apply'?{digest:options.digest}:{})}):undefined;
 const response=await fetch(url.origin+base+path,{method,redirect:'error',headers:{origin:url.origin,cookie,...(body?{'content-type':'application/json'}:{})},body}),result=await response.json();
 if(!response.ok)throw Error(`History ${command} refused (HTTP ${response.status}): ${result.error}`);
 return result;
}
export function printHistory(result){
 if(result.kind==='history'){
  console.log(`${result.source}: ${result.rows} rows; ${result.counts.create} new, ${result.counts.unchanged} unchanged, ${result.counts.unmapped} unmapped, ${result.counts.conflict} conflicting.`);
  for(const m of result.mapping)console.log(`- Source monitor ${m.sourceMonitorId||'(missing ID)'} (${m.name||'unnamed'}) -> ${m.monitorId??'unmapped'}: ${m.rows} rows, ${m.outageCount} outages, ${m.totalDowntimeSeconds} seconds; ${new Date(m.dateFrom).toISOString()} to ${new Date(m.dateTo).toISOString()}`);
  for(const row of result.entries.filter(e=>e.reason))console.log(`  ${row.line}: ${row.reason}`);
  for(const warning of result.warnings??[])console.log(warning);
  console.log(`Plan digest: ${result.reviewDigest}`);
 }else console.log(JSON.stringify(result));
}
