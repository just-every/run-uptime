// Real upstream consumers of the emitted Worker's authenticated metrics door.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import {once} from 'node:events';
import {createReadStream,createWriteStream} from 'node:fs';
import {mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {freePort} from '../scripts/local-ports.mjs';
import {fixture} from './resilience/support.mjs';

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function eventually(check,label,timeout=30000){
 const until=Date.now()+timeout;let error;
 while(Date.now()<until){try{const value=await check();if(value)return value}catch(cause){error=cause}await sleep(250)}
 throw Error(`${label}${error?`: ${error.message}`:''}`);
}
async function command(program,args){
 const child=spawn(program,args,{stdio:['ignore','ignore','pipe']});
 let bytes=0;child.stderr.on('data',chunk=>bytes+=chunk.length);
 const timer=setTimeout(()=>child.kill('SIGKILL'),240000);
 try{assert.equal((await once(child,'exit'))[0],0,`${program} failed (${bytes} private diagnostic bytes)`)}finally{clearTimeout(timer)}
}
// Versioned upstream release archives, verified before any executable is started.
const releases={
 'linux-x64':['a622e3007c9109a7f470e1433cbd29bf392596715cf7eea8b81b37fa9d26b7be','043fa7b8c634ff060a70e2d069d0beee9300e5b259d8125c456d6b8cae35169f'],
 'linux-arm64':['f2dec3178f1181c1b795b275750d056e71ead13f7fbfe08b76834c4ec20b748e','bb0ce9f61e972e1a9ddfd5d6d4aea417894b7ceddbe60bab7024b2b641b5eae7'],
 'darwin-x64':['e73ecf2ccd3ecca4bba8f2f82f82c8c51d190283217c6007b41bfe2478ebe482','f9718154edc42c6ebaf6c760e75b948e983db2f4ce1b9477cd58e33003fe146f'],
 'darwin-arm64':['f71d933be340486e27625a9b80c7be8282a5c8dbb041594ba2e52a4788dc6ebb','84a56b0e1a42083b97ad2e703abbd0a1e14e78ec961ce79843b5309a7350556d'],
};
async function upstream(directory){
 const hashes=releases[`${process.platform}-${process.arch}`];assert.ok(hashes,'supported upstream binary platform');
 const platform=`${process.platform}-${process.arch==='x64'?'amd64':process.arch}`;
 const specs=[
  {name:`prometheus-3.2.1.${platform}`,url:`https://github.com/prometheus/prometheus/releases/download/v3.2.1/prometheus-3.2.1.${platform}.tar.gz`,hash:hashes[0]},
  {name:'grafana-v11.6.0',url:`https://dl.grafana.com/oss/release/grafana-11.6.0.${platform}.tar.gz`,hash:hashes[1]},
 ];
 await Promise.all(specs.map(async(spec,index)=>{
  const archive=join(directory,`upstream-${index}.tar.gz`);
  await command('curl',['--fail','--silent','--show-error','--location','--max-time','180',spec.url,'--output',archive]);
  const hash=createHash('sha256');for await(const chunk of createReadStream(archive))hash.update(chunk);
  assert.equal(hash.digest('hex'),spec.hash,'upstream archive integrity');
  await command('tar',['-xzf',archive,'-C',directory]);
  await rm(archive);
 }));
 return {prometheus:join(directory,specs[0].name,'prometheus'),grafana:join(directory,specs[1].name)};
}
function start(program,args,env,directory,name){
 const log=createWriteStream(join(directory,name+'.log'),{mode:0o600});
 const child=spawn(program,args,{env:{...process.env,...env},stdio:['ignore','pipe','pipe']});
 child.stdout.pipe(log);child.stderr.pipe(log,{end:false});
 const exited=once(child,'exit');
 return {child,async stop(){
  if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');
  const timer=setTimeout(()=>child.kill('SIGKILL'),5000);
  try{await exited}finally{clearTimeout(timer);log.end()}
 }};
}
const near=(actual,expected,label)=>assert.ok(Number.isFinite(actual)&&Math.abs(actual-expected)<1e-7,`${label}: ${actual} equals ${expected}`);

export async function proveGrafanaPrometheus({inspect}={}){
 const directory=await mkdtemp(join(tmpdir(),'uptime-grafana-'));
 let foreign,f,prometheus,grafana;
 try{
  const tools=await upstream(directory);
  // Both installations are populated through owner doors and signed production runners.
  foreign=await fixture();foreign.modes.target=200;
  const foreignMonitor=await foreign.monitor({name:'synthetic-uptime-1'});
  await foreign.run(foreign.first);await foreign.run(foreign.second);
  assert.equal((await foreign.state(foreignMonitor.id)).state,'Healthy');
  const foreignKey=(await foreign.request('/api/metrics/keys',{body:{name:'synthetic-uptime-2'}})).data;
  f=await fixture({UPTIME_RUNNER_STALE_MS:'15000'});f.modes.target=200;
  const ok=async(path,body,method,status=200)=>{
   const response=await f.request(path,{body,method});assert.equal(response.status,status,path);return response.data;
  };
  const key=await ok('/api/metrics/keys',{name:'synthetic-uptime-3'},'POST',201);
  const from=Date.now()-1000;
  const active=await f.monitor({name:'synthetic-uptime-4',freshnessMs:15000});
  const paused=await f.monitor({name:'synthetic-uptime-5',enabled:false});
  const idle=await ok('/api/runners',{networkLabel:'synthetic-uptime-6'},'POST',201);
  const maintenance=await f.monitor({name:'synthetic-uptime-7',runners:[idle],maintenanceUntil:Date.now()+180000});
  const ids=[active.id,paused.id,maintenance.id];
  const tokenFile=join(directory,'metrics-key'),foreignToken=join(directory,'foreign-key');
  await writeFile(tokenFile,key.token,{mode:0o600});await writeFile(foreignToken,foreignKey.token,{mode:0o600});
  const promOrigin=`http://127.0.0.1:${await freePort()}`,grafanaOrigin=`http://127.0.0.1:${await freePort()}`;
  const config=join(directory,'prometheus.json');
  let to=Date.now();
  const period=()=>new URLSearchParams({period:'custom',from:String(from),to:String(to),timeZone:'America/Chicago'});
  const writeConfig=()=>writeFile(config,JSON.stringify({global:{scrape_interval:'3s',scrape_timeout:'2s'},scrape_configs:[
   ...[['uptime',tokenFile,ids],['foreign-key',foreignToken,ids],['foreign-monitor',tokenFile,[foreignMonitor.id]]].map(([job_name,credentials_file,monitors])=>({
    job_name,metrics_path:'/api/v1/metrics',params:{period:['custom'],from:[String(from)],to:[String(to)],timeZone:['America/Chicago'],monitor:[monitors.join(',')]},
    authorization:{type:'Bearer',credentials_file},static_configs:[{targets:[new URL(f.origin).host]}],
   })),
  ]}),{mode:0o600});
  await writeConfig();
  prometheus=start(tools.prometheus,[`--config.file=${config}`,`--storage.tsdb.path=${join(directory,'tsdb')}`,`--web.listen-address=${new URL(promOrigin).host}`,'--web.enable-lifecycle'],{},directory,'prometheus');
  const admin='synthetic-uptime-8',password=randomBytes(24).toString('hex');
  const grafanaConfig=join(directory,'grafana.ini');await writeFile(grafanaConfig,'[server]\nhttp_addr = 127.0.0.1\nhttp_port = '+new URL(grafanaOrigin).port+'\n');
  await mkdir(join(directory,'provisioning'));
  grafana=start(join(tools.grafana,'bin/grafana'),['server',`--homepath=${tools.grafana}`,`--config=${grafanaConfig}`],{
   GF_PATHS_DATA:join(directory,'grafana-data'),GF_PATHS_LOGS:join(directory,'grafana-logs'),GF_PATHS_PLUGINS:join(directory,'plugins'),GF_PATHS_PROVISIONING:join(directory,'provisioning'),
   GF_SECURITY_ADMIN_USER:admin,GF_SECURITY_ADMIN_PASSWORD:password,GF_ANALYTICS_REPORTING_ENABLED:'false',GF_ANALYTICS_CHECK_FOR_UPDATES:'false',GF_ANALYTICS_CHECK_FOR_PLUGIN_UPDATES:'false',GF_PLUGINS_PREINSTALL_DISABLED:'true',GF_USERS_ALLOW_SIGN_UP:'false',
  },directory,'grafana');
  await eventually(async()=>{const r=await fetch(promOrigin+'/-/ready');return r.ok},'real Prometheus readiness');
  await eventually(async()=>{const r=await fetch(grafanaOrigin+'/api/health');return r.ok},'real Grafana readiness');
  const grafanaAPI=async(path,body)=>{
   const response=await fetch(grafanaOrigin+path,{method:body===undefined?'GET':'POST',headers:{authorization:'Basic '+Buffer.from(admin+':'+password).toString('base64'),'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
   assert.equal(response.status,200,'Grafana '+path);return response.json();
  };
  const ds='synthetic-uptime-9';
  await grafanaAPI('/api/datasources',{uid:ds,name:'Uptime',type:'prometheus',access:'proxy',url:promOrigin,jsonData:{httpMethod:'POST',timeInterval:'1s'}});
  const supplied=JSON.parse(await readFile('docs/grafana/uptime-dashboard.json','utf8'));
  const imported=await grafanaAPI('/api/dashboards/import',{dashboard:supplied,overwrite:true,inputs:[{name:'DS_PROMETHEUS',type:'datasource',pluginId:'prometheus',value:ds}]});
  const {dashboard}=await grafanaAPI('/api/dashboards/uid/'+imported.uid);
  // Execute the persisted dashboard's actual targets through Grafana's backend.
  // Only the monitor variable is substituted, as a user's selection would be.
  async function panel(id,selection=ids){
   const definition=dashboard.panels.find(p=>p.id===id);assert.ok(definition,'imported dashboard panel');
   const result=await grafanaAPI('/api/ds/query',{
    from:String(Date.now()-60000),to:String(Date.now()),queries:definition.targets.map(target=>({...target,
     datasource:definition.datasource,expr:target.expr.replaceAll('$monitor',selection.join('|')),intervalMs:1000,maxDataPoints:1000,
    })),
   });
   const samples=[];
   for(const target of definition.targets){
    const answer=result.results[target.refId];assert.ok(answer&&!answer.error,`panel ${id} query succeeds`);
    for(const frame of answer.frames??[]){
     const fields=frame.schema.fields,values=frame.data.values;
     for(let column=0;column<fields.length;column++)if(fields[column].type==='number'){
      const field=fields[column];
      for(let row=0;row<values[column].length;row++){
       const labels={...field.labels};
       for(let other=0;other<fields.length;other++)if(fields[other].type==='string')labels[fields[other].name]=values[other][row];
       samples.push({name:labels.__name__??field.name,labels,value:values[column][row]});
      }
     }
    }
   }
   return samples;
  }
  function value(samples,labels,name){
   const matches=samples.filter(sample=>(!name||sample.name===name)&&Object.entries(labels).every(([key,value])=>sample.labels[key]===value));
   assert.equal(matches.length,1,'one Grafana series for '+JSON.stringify({name,...labels}));return matches[0].value;
  }
  const query=async expr=>{
   const response=await fetch(promOrigin+'/api/v1/query?'+new URLSearchParams({query:expr}));assert.equal(response.status,200);return (await response.json()).data.result;
  };
  const targets=async()=>{const response=await fetch(promOrigin+'/api/v1/targets');assert.equal(response.status,200);return (await response.json()).data.activeTargets};
  const history=()=>ok(`/api/monitors/${active.id}/history`);
  const runBoth=async()=>{await f.run(f.first);await f.run(f.second)};
  const due=async()=>{const monitor=(await ok('/api/overview')).monitors.find(m=>m.id===active.id);await sleep(Math.max(0,monitor.nextDue-Date.now()+25))};
  await runBoth();
  const original=(await history())[0];assert.equal(original.manual,0);assert.equal(original.observations.length,2);assert.ok(original.observations.every(o=>o.outcome==='pass'));
  await eventually(async()=>value(await panel(2),{monitor_id:active.id,state:'Healthy'})===1,'Grafana shows signed Healthy evidence');
  f.modes.target=503;await due();await runBoth();
  const failed=(await history())[0];assert.ok(failed.observations.every(o=>o.status===503&&o.outcome==='target_failure'));
  await eventually(async()=>value(await panel(2),{monitor_id:active.id,state:'Failing'})===1,'Grafana shows the actual failed monitor');
  const stopped=failed.observations.find(o=>o.probe==='local-b');
  // Stop invoking the assigned second runner. No pause, reassignment or fabricated result.
  f.modes.target=200;await sleep(Math.max(0,stopped.completedAt+15050-Date.now()));await f.run(f.first);
  await eventually(async()=>{
   const samples=await panel(7);return value(samples,{monitor_id:active.id,probe_id:'local-b'},'uptime_probe_contact_fresh')===0&&value(samples,{monitor_id:active.id,probe_id:'local-a'},'uptime_probe_evidence_fresh')===1;
  },'Grafana exposes stopped runner contact and evidence independently');
  assert.equal(value(await panel(6),{monitor_id:active.id},'uptime_coverage_expected'),2);
  assert.equal(value(await panel(6),{monitor_id:active.id},'uptime_coverage_observed'),1);
  assert.equal(value(await panel(2),{monitor_id:active.id,state:'Unknown'}),1,'an absent passing probe cannot recover the outage');
  const retained=await history();assert.deepEqual(retained.find(slot=>slot.id===failed.id),failed);assert.deepEqual(retained.find(slot=>slot.id===original.id),original);
  assert.equal(retained.flatMap(s=>s.observations).filter(o=>o.probe==='local-b').length,2);

  // Freeze the same custom report bounds in the real scrape configuration.
  to=Date.now();await writeConfig();assert.equal((await fetch(promOrigin+'/-/reload',{method:'POST'})).status,200);
  await eventually(async()=>value(await panel(11),{},'uptime_window_to_timestamp_seconds')===to/1000,'Grafana loads the fixed report window');
  const panels=new Map();for(const definition of dashboard.panels)panels.set(definition.id,await panel(definition.id));
  for(const id of ids){
   const report=await ok(`/api/v1/monitors/${id}/report?${period()}&bucket=1d`);
   const labels={monitor_id:id};
   for(const [field,metric] of Object.entries({observedMs:'observed',upMs:'healthy',notPassingMs:'not_passing',unknownMs:'unknown',pausedMs:'paused',maintenanceMs:'maintenance'}))near(value(panels.get(4),labels,'uptime_availability_'+metric+'_seconds'),report.availability[field]/1000,metric);
   const defined=report.availability.uptimePercent!==null;assert.equal(value(panels.get(10),labels),Number(defined));
   if(defined)near(value(panels.get(1),labels),report.availability.uptimePercent,'report availability');
   else assert.equal(panels.get(1).filter(s=>s.labels.monitor_id===id).length,0,'undefined availability is absent');
   const locations=['all',...(report.latency.availableLocations??[])];
   for(const probe of locations){
    const latency=probe==='all'?report.latency:await ok(`/api/v1/monitors/${id}/response-times?${period()}&bucket=1d&location=${probe}`);
    for(const [field,statistic] of Object.entries({minMs:'min',meanMs:'mean',p50Ms:'p50',p95Ms:'p95',p99Ms:'p99',maxMs:'max'}))if(latency.statistics[field]!==null)near(value(panels.get(5),{...labels,probe_id:probe,statistic}),latency.statistics[field]/1000,'location latency '+statistic);
   }
   assert.equal(value(panels.get(8),labels),report.incidentSummary.count);
  }
  assert.ok(value(panels.get(4),{monitor_id:active.id},'uptime_availability_observed_seconds')>0);
  assert.ok(value(panels.get(4),{monitor_id:active.id},'uptime_availability_not_passing_seconds')>0);
  assert.ok(value(panels.get(4),{monitor_id:active.id},'uptime_availability_unknown_seconds')>0);
  assert.ok(value(panels.get(4),{monitor_id:paused.id},'uptime_availability_paused_seconds')>0);
  assert.ok(value(panels.get(4),{monitor_id:maintenance.id},'uptime_availability_maintenance_seconds')>0);
  assert.ok(panels.get(5).some(s=>s.labels.probe_id==='local-a')&&panels.get(5).some(s=>s.labels.probe_id==='local-b'));
  assert.ok(panels.get(9).length>0,'delivery outcome panel executes against real series');

  const denied=await eventually(async()=>{const t=await targets();return t.length===3&&t.every(target=>target.health!=='unknown')&&t},'all real scrape results');
  assert.equal(denied.find(t=>t.labels.job==='uptime').health,'up');
  assert.match(denied.find(t=>t.labels.job==='foreign-key').lastError,/401/);
  assert.match(denied.find(t=>t.labels.job==='foreign-monitor').lastError,/404/);
  assert.equal((await query('uptime_availability_defined{job=~"foreign-.*"}')).length,0,'refused scrapes never ingest foreign metrics');
  for(const samples of panels.values())assert.ok(samples.every(s=>!s.labels.monitor_id||ids.includes(s.labels.monitor_id)),'dashboard has only this installation and selected monitors');
  assert.equal((await panel(1,[foreignMonitor.id])).length,0,'selecting a foreign monitor reveals no data');
  assert.equal((await fetch(foreign.origin+'/api/v1/metrics',{headers:{authorization:'Bearer '+key.token}})).status,401);

  assert.equal((await f.request('/api/metrics/keys/'+key.credential.id,{method:'DELETE'})).status,200);
  await eventually(async()=>{const t=(await targets()).find(t=>t.labels.job==='uptime');return t.health==='down'&&/401/.test(t.lastError)},'revocation fails the real Prometheus scrape');
  const lastSnapshot='last_over_time(uptime_snapshot_timestamp_seconds{job="uptime"}[1h])';
  const capture=Number((await query(lastSnapshot))[0].value[1]);
  const firstAge=value(await panel(3),{});assert.ok(firstAge>=0,'snapshot age never presents a future capture');
  await sleep(1500);const secondAge=value(await panel(3),{});
  assert.ok(secondAge>firstAge+1,'cached snapshot grows older after refused scrapes');
  assert.equal(Number((await query(lastSnapshot))[0].value[1]),capture,'failed scrapes do not refresh the retained snapshot');
  assert.equal(Number((await query('up{job="uptime"}'))[0].value[1]),0);
  if(inspect)await inspect({origin:grafanaOrigin,admin,password,uid:imported.uid});
  console.log('METRICS-001 real Grafana and Prometheus PASS: all imported panel queries, signed failure and lost probe, fixed-window report equality, exclusions, scoped isolation and revoked-scrape snapshot aging.');
 }finally{
  const outcomes=await Promise.allSettled([grafana?.stop(),prometheus?.stop()]);
  await f?.close();await foreign?.close();await rm(directory,{recursive:true,force:true});
  for(const outcome of outcomes)if(outcome.status==='rejected')throw outcome.reason;
 }
}
