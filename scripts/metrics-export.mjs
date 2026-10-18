#!/usr/bin/env node
import {createHmac} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {NodePinnedTransport} from '../src/base/modules/integrations/core/node-transport.ts';
import {validateDestination} from '../src/base/modules/integrations/core/destination.ts';
import {metricSamples} from '../src/domain/metrics/prometheus.ts';

const sites=new Set(['datadoghq.com','us3.datadoghq.com','us5.datadoghq.com','datadoghq.eu','ap1.datadoghq.com','ap2.datadoghq.com','ddog-gov.com']);
const MAX_BYTES=2*1024*1024;
export function parseExportArgs(argv){
 const options={monitors:[]};
 const names={'--origin':'origin','--datadog-site':'datadogSite','--webhook':'webhook','--period':'period','--from':'from','--to':'to','--time-zone':'timeZone','--monitor':'monitor'};
 for(let i=0;i<argv.length;i++){
  const name=names[argv[i]],value=argv[++i];
  if(!name||!value||value.startsWith('--'))throw Error('Invalid export arguments');
  if(name==='monitor')options.monitors.push(value);
  else {if(options[name]!==undefined)throw Error('Duplicate export option');options[name]=value;}
 }
 return options;
}
function exportOrigin(value){
 const url=new URL(value);
 const loopback=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 if((url.protocol!=='https:'&&!(url.protocol==='http:'&&loopback))||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('Explicit HTTPS origin required; HTTP is allowed only on loopback');
 return url.origin;
}
async function snapshotBody(response){
 const reader=response.body?.getReader();if(!reader)throw Error('Missing snapshot body');
 let size=0;const chunks=[];
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_BYTES){await reader.cancel();throw Error('Snapshot exceeds export bound');}chunks.push(value);}}
 finally{reader.releaseLock();}
 const bytes=Buffer.concat(chunks);return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
function validateSnapshot(snapshot){
 if(snapshot?.schemaVersion!==1||snapshot.source!=='uptime'||!Number.isSafeInteger(snapshot.generatedAt)||snapshot.generatedAt<0||!Array.isArray(snapshot.monitors)||snapshot.monitors.length>100)throw Error('Invalid snapshot');
 if(!snapshot.period||!Number.isSafeInteger(snapshot.period.from)||!Number.isSafeInteger(snapshot.period.to)||snapshot.period.from<0||snapshot.period.from>=snapshot.period.to||snapshot.period.to>snapshot.generatedAt)throw Error('Invalid snapshot window');
 for(const monitor of snapshot.monitors){
  if(typeof monitor.id!=='string'||!monitor.id||monitor.id.length>512||/[\x00-\x1f\x7f]/.test(monitor.id)||!Array.isArray(monitor.current?.probes)||monitor.current.probes.length>3||!Array.isArray(monitor.latency?.locations)||monitor.latency.locations.length>3)throw Error('Invalid snapshot population');
 }
 return metricSamples(snapshot);
}
/** Dependencies are only the HTTP/network edges; this performs one explicit export and never retries. */
export async function runMetricsExport(options,{env=process.env,fetchImpl=fetch,transport=new NodePinnedTransport({timeoutMs:15000,maxResponseBytes:65536})}={}){
 const origin=exportOrigin(options.origin);
 if(Boolean(options.datadogSite)===Boolean(options.webhook))throw Error('Select exactly one Datadog site or signed webhook');
 let endpoint;
 if(options.datadogSite){if(!sites.has(options.datadogSite))throw Error('Unsupported Datadog site');if(!env.DATADOG_API_KEY)throw Error('DATADOG_API_KEY is required');endpoint=`https://api.${options.datadogSite}/api/v2/series`;}
 else {endpoint=validateDestination(options.webhook).href;if(!env.UPTIME_METRICS_WEBHOOK_SECRET||Buffer.byteLength(env.UPTIME_METRICS_WEBHOOK_SECRET)<32)throw Error('UPTIME_METRICS_WEBHOOK_SECRET must contain at least 32 bytes');}
 if(!env.UPTIME_METRICS_TOKEN)throw Error('UPTIME_METRICS_TOKEN is required');
 if(!Array.isArray(options.monitors??[])||(options.monitors??[]).length>100)throw Error('At most 100 monitors may be exported');
 const url=new URL('/api/v1/metrics',origin);url.searchParams.set('format','json');
 for(const name of ['period','from','to','timeZone'])if(options[name]!==undefined)url.searchParams.set(name,options[name]);
 if(options.monitors?.length)url.searchParams.set('monitor',options.monitors.join(','));
 let snapshot;
 try{
  const response=await fetchImpl(url,{headers:{authorization:`Bearer ${env.UPTIME_METRICS_TOKEN}`,accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(15000),cache:'no-store'});
  if(!response.ok){await response.body?.cancel();return {status:'failed',exitCode:1};}
  snapshot=await snapshotBody(response);
 }catch{return {status:'failed',exitCode:1};}
 const samples=validateSnapshot(snapshot),headers={'content-type':'application/json'};
 let body;
 if(options.datadogSite){
  body=JSON.stringify({series:samples.map(sample=>({metric:sample.name,type:3,points:[{timestamp:Math.floor(snapshot.generatedAt/1000),value:sample.value}],tags:['source:uptime',...Object.entries(sample.labels).map(([key,value])=>`${key}:${value}`)]}))});
  headers['DD-API-KEY']=env.DATADOG_API_KEY;
 }else{
  body=JSON.stringify(snapshot);
  const timestamp=String(Math.floor(Date.now()/1000));
  headers['x-uptime-timestamp']=timestamp;
  headers['x-uptime-signature']=`v1=${createHmac('sha256',env.UPTIME_METRICS_WEBHOOK_SECRET).update(`${timestamp}.${body}`).digest('hex')}`;
 }
 if(Buffer.byteLength(body)>(options.datadogSite?512000:MAX_BYTES))throw Error('Export exceeds provider body bound; select fewer monitors');
 try{
  const response=await transport.send({url:endpoint,headers,body});
  if(response.status>=200&&response.status<300)return {status:'accepted',exitCode:0};
  if(response.status===408||response.status>=500)return {status:'uncertain',exitCode:2};
  return {status:'failed',exitCode:1};
 }catch{return {status:'uncertain',exitCode:2};}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const result=await runMetricsExport(parseExportArgs(process.argv.slice(2)));console.log(`Metrics export ${result.status}.`);process.exitCode=result.exitCode;}
 catch{console.error('Metrics export failed: check arguments, named environment credentials and snapshot bounds.');process.exitCode=1;}
}
