// The sole fake for the catalog journey is this network edge: the status sources the catalog names, the application
// being monitored and the canary. The real runner, pinned HTTP sockets, assertions, signed runner calls, Worker persistence and
// notification delivery all run. Every request the edge receives is recorded; the catalog journey asserts they are GET only.
import assert from 'node:assert/strict';
import https from 'node:https';
import {Resolver} from 'node:dns/promises';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {closeServer} from './resilience/support.mjs';
export const hosts={stripe:'status.stripe.com',aws:'status.aws.amazon.com',slack:'slack-status.com',acme:'status.acme-cloud.test',app:'shop.provider.test',app2:'portal.provider.test',canary:'canary.provider.test',
 cloudflare:'www.cloudflarestatus.com',gcp:'status.cloud.google.com',paypal:'www.paypal-status.com',okta:'feeds.feedburner.com'};
const rss=items=>`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Service Status</title><link>https://status.aws.amazon.com/</link>${items.map(title=>`<item><title><![CDATA[${title}]]></title><link>https://status.aws.amazon.com/</link></item>`).join('')}</channel></rss>`;
// Full-size documents in each provider's published format: synthetic parts pad every one past 64 KiB around the part followed.
const many=(count,make)=>Array.from({length:count},(_,index)=>make(index));
const LOCATION={title:'Iowa (us-central1)',id:'us-central1'},GCE={title:'Google Compute Engine',id:'synthetic-uptime-gce'};
const gcpIncident=(index,open)=>({id:`synthetic-uptime-${index}`,number:String(index),begin:'2026-10-01T00:00:00+00:00',created:'2026-10-01T00:05:00+00:00',...(open?{}:{end:'2026-10-01T02:00:00+00:00'}),modified:'2026-10-01T02:00:00+00:00',
 external_desc:open?'Synthetic Compute Engine outage in us-central1':'A resolved synthetic incident that pads the document. '.repeat(4),most_recent_update:{status:open?'SERVICE_OUTAGE':'AVAILABLE',text:open?'We are investigating.':'Resolved.',affected_locations:open?[LOCATION]:[]},
 status_impact:open?'SERVICE_OUTAGE':'SERVICE_DISRUPTION',severity:open?'high':'medium',service_key:'synthetic-uptime-gce',service_name:GCE.title,affected_products:[GCE],uri:`incidents/synthetic-uptime-${index}`,currently_affected_locations:open?[LOCATION]:[],previously_affected_locations:[LOCATION]});
export const documents={
 cloudflare:state=>JSON.stringify({page:{id:'synthetic-uptime-page',name:'Cloudflare',url:'https://www.cloudflarestatus.com'},components:[{id:'synthetic-uptime-services',name:'Cloudflare Sites and Services',status:'operational',group:true,group_id:null},
  ...many(600,index=>({id:`synthetic-uptime-${index}`,name:`Synthetic Uptime Component ${index}`,status:'operational',group:false,group_id:'synthetic-uptime-services',description:'A synthetic component that pads the document.'})),
  {id:'synthetic-uptime-workers',name:'Workers',status:state.status,group:false,group_id:'synthetic-uptime-services'}]}),
 gcpIncidents:state=>JSON.stringify([...(state.open?[gcpIncident(9999,true)]:[]),...many(200,index=>gcpIncident(index,false))]),
 gcpProducts:()=>JSON.stringify({products:[...many(1500,index=>({title:`Synthetic Uptime Product ${index}`,id:`synthetic-uptime-${index}`})),GCE]}),
 paypal:state=>JSON.stringify({result:[...many(500,index=>({id:index+100,name:`Synthetic Uptime Component ${index}`,displayName:`Synthetic Uptime Component ${index}`,parentId:null,category:{name:'product',description:'Product category'},status:{production:'Operational',sandbox:'Operational'}})),
  {id:7,name:'REST APIs',displayName:'REST APIs',parentId:null,category:{name:'product',description:'Product category'},status:{production:state.status,sandbox:'Operational'}}],lang:'en'}),
 okta:state=>`<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Okta Status</title><id>synthetic-uptime-feed</id>${state.open?'<entry><title>Service Disruption</title><updated>2026-10-22T10:00:00.000Z</updated><id>synthetic-uptime-open</id><content type="text">Synthetic disruption in US Cell 1.</content></entry>':''}${many(400,index=>`<entry><title>Resolved Service Degradation</title><updated>2026-10-01T00:00:00.000Z</updated><id>synthetic-uptime-${index}</id><content type="text">A resolved synthetic incident &amp; its notes.</content></entry>`).join('')}</feed>`,
};
// A document past the reader's bound: a valid start, then parts streamed with backpressure until `total` bytes, unless the reader stops first.
const OVERSIZE=32*1024*1024;
function oversize(res,feed,record){
 const head=feed?'<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">':'{"components":[',part=Buffer.from(feed?'<entry><title>Resolved Service Degradation</title></entry>'.repeat(256):'{"id":"synthetic-uptime-pad","name":"Synthetic Uptime Pad","status":"operational"},'.repeat(256));
 const sent={total:OVERSIZE,sent:0,closed:false};record.push(sent);
 res.writeHead(200,{'content-type':feed?'application/atom+xml':'application/json'});res.write(head);
 res.on('close',()=>{sent.closed=true});
 const pump=()=>{while(sent.sent<OVERSIZE&&!res.destroyed){sent.sent+=part.length;if(!res.write(part)){res.once('drain',pump);return}}if(!res.destroyed)res.end(feed?'</feed>':'{}]}')};
 pump();
}
export async function catalogEdge(directory){
 const keyPath=join(directory,'catalog-key.pem'),certPath=join(directory,'catalog-cert.pem'),names=Object.values(hosts);
 const child=spawn('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',keyPath,'-out',certPath,'-days','1','-subj','/CN=catalog.test','-addext',`subjectAltName=${names.map(name=>`DNS:${name}`).join(',')}`],{stdio:'ignore'});
 assert.equal((await once(child,'exit'))[0],0,'network edge certificate creation');
 const tls={key:await readFile(keyPath),cert:await readFile(certPath)},requests=[];
 // mode: 200 serves the document; a status code answers it; 'moved' redirects; 'shape' serves a document without the claim; 'drop' resets the connection.
 const state={stripe:{mode:200,statuses:{api:'up',webhooks:'up',dashboard:'up',stripejs:'up',checkout:'up',supportsite:'up'}},aws:{mode:200,items:[]},slack:{mode:200,status:'ok'},app:200,app2:200,
  cloudflare:{mode:200,status:'operational'},gcp:{mode:200,open:false},paypal:{mode:200,status:'Operational'},okta:{mode:200,open:false}},oversized=[];
 const answer=(res,source,json)=>{
  if(source.mode==='timeout')return;
  if(source.mode==='drop'){res.socket.destroy();return}
  if(source.mode==='moved'){res.writeHead(301,{location:'https://www.provider.test/status'});res.end();return}
  if(typeof source.mode==='number'&&source.mode!==200){res.writeHead(source.mode,{'content-type':'text/plain'});res.end('provider unavailable');return}
  res.writeHead(200,{'content-type':json?'application/json':'application/rss+xml'});return true;
 };
 const server=https.createServer(tls,(req,res)=>{
  const host=req.headers.host;requests.push({host,path:req.url,method:req.method});
  if(host===hosts.stripe&&req.url==='/current'){if(answer(res,state.stripe,true))res.end(JSON.stringify(state.stripe.mode==='shape'?{message:'maintenance page'}:{statuses:state.stripe.statuses,largestatus:Object.values(state.stripe.statuses).every(value=>value==='up')?'up':'degraded'}));return}
  if(host===hosts.aws&&/^\/rss\/ec2-us-east-1\.rss$/.test(req.url)){if(answer(res,state.aws,false))res.end(state.aws.mode==='shape'?'<html>not a feed</html>':rss(state.aws.items));return}
  if(host===hosts.slack&&req.url==='/api/v2.0.0/current'){if(answer(res,state.slack,true))res.end(JSON.stringify({status:state.slack.status,active_incidents:[]}));return}
  // A Statuspage-compatible provider the catalog does not list, added by its status page address.
  if(host===hosts.acme&&req.url==='/'){res.writeHead(200,{'content-type':'text/html'});res.end('<title>Acme Cloud Status</title><h1>Acme Cloud Status</h1>');return}
  if(host===hosts.acme&&req.url==='/api/v2/status.json'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({page:{name:'Acme Cloud'},status:{indicator:'none',description:'All Systems Operational'}}));return}
  if(host===hosts.acme&&req.url==='/api/v2/components.json'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({page:{name:'Acme Cloud'},components:[{id:'synthetic-uptime-1',name:'API',status:'operational'}]}));return}
  // mode 'oversize' streams a document past the reader's bound; 'shape' answers 200 with a page that is not the provider's format.
  const full=(source,body,feed=false)=>{if(source.mode==='oversize')return oversize(res,feed,oversized);if(source.mode==='shape'){res.writeHead(200,{'content-type':'text/html'});res.end('<html><body>Status page maintenance</body></html>');return}if(answer(res,source,!feed))res.end(body())};
  if(host===hosts.cloudflare&&req.url==='/api/v2/components.json')return full(state.cloudflare,()=>documents.cloudflare(state.cloudflare));
  if(host===hosts.gcp&&req.url==='/incidents.json')return full(state.gcp,()=>documents.gcpIncidents(state.gcp));
  if(host===hosts.gcp&&req.url==='/products.json')return full({mode:200},documents.gcpProducts);
  if(host===hosts.paypal&&req.url==='/api/v1/components')return full(state.paypal,()=>documents.paypal(state.paypal));
  if(host===hosts.okta&&req.url==='/OktaStatusRSS')return full(state.okta,()=>documents.okta(state.okta),true);
  if(host===hosts.app||host===hosts.app2){const code=host===hosts.app?state.app:state.app2;res.writeHead(code,{'content-type':'text/html'});res.end(code===200?'<title>Shop</title>':'down');return}
  if(host===hosts.canary){res.writeHead(200,{'content-type':'text/plain'});res.end('independent check');return}
  res.writeHead(404,{'content-type':'text/plain'});res.end('not found');
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const port=server.address().port,request=https.request,resolve4=Resolver.prototype.resolve4,resolve6=Resolver.prototype.resolve6;
 const mine=host=>names.includes(host);
 Resolver.prototype.resolve4=async function(host){if(host===hosts.stripe&&state.stripe.mode==='dns')throw Object.assign(Error('controlled source DNS failure'),{code:'ETIMEOUT'});if(host==='www.provider.test')throw Object.assign(Error('controlled moved-source DNS failure'),{code:'ETIMEOUT'});if(mine(host))return ['93.184.216.36'];return resolve4.call(this,host)};
 Resolver.prototype.resolve6=async function(host){return mine(host)?[]:resolve6.call(this,host)};
 https.request=function(options,...args){
  if(options?.hostname!=='93.184.216.36')return request.call(this,options,...args);
  if(options.headers.host===hosts.stripe&&state.stripe.mode==='refused')throw Object.assign(Error('controlled source refusal'),{code:'ECONNREFUSED'});
  assert.equal(options.rejectUnauthorized,true);assert.equal(options.headers.host,options.servername);
  return request.call(this,{...options,hostname:'127.0.0.1',port,ca:tls.cert},...args);
 };
 return {state,requests,oversized,async close(){https.request=request;Resolver.prototype.resolve4=resolve4;Resolver.prototype.resolve6=resolve6;await closeServer(server)}};
}

// Public-door setup shared by the dependency delivery and erasure regression journeys.
export async function catalogRuntime(transport){
 const {fixture}=await import('./resilience/support.mjs');
 const {runRunner}=await import('../runners/src/private-runner.mjs');
 const g=await fixture(),edge=await catalogEdge(g.directory);let restarted;
 const ok=async(path,body,method)=>{const r=await g.request(path,{body,...(method?{method}:{})});assert.ok(r.status<300,`${path}: ${r.status} ${JSON.stringify(r.data)}`);return r.data};
 const run=()=>runRunner({origin:g.origin,key:g.first.key,runnerId:g.first.runnerId,localReview:true,once:true,...(transport?{transport}:{})});
 try{
  await ok('/api/runners/'+g.second.runnerId,undefined,'DELETE');
  await ok('/api/external-check',{url:`https://${hosts.canary}/health`});
  const job=await ok('/api/service-catalog/checks',{entry:'stripe',scope:'components',components:['api']});
  const controller=new AbortController(),looking=runRunner({origin:g.origin,key:g.first.key,runnerId:g.first.runnerId,localReview:true,signal:controller.signal,pollMs:100,...(transport?{transport}:{})});
  try{const until=Date.now()+30000;while((await ok('/api/discoveries/'+job.id)).status!=='done'){assert.ok(Date.now()<until,'catalog source check completes');await new Promise(r=>setTimeout(r,100))}}finally{controller.abort();await looking}
  const followed=await ok('/api/service-follows',{check:job.id});
  const id=followed.followed[0].monitorId;
  const saved=(await ok('/api/overview')).monitors.find(m=>m.id===id);
  await ok('/api/monitors/'+id,{...saved.definition,confirmSlots:1,recoverSlots:1,retries:0},'PATCH');
  const route=async(monitorId,policy)=>{const path=`/api/monitors/${monitorId}/alert-route`,current=await ok(path),input={scope:'monitor',mode:'selected',destinationIds:[],contactSettings:{},...policy,expectedRevision:current.policies.find(p=>p.scope==='monitor').revision};const preview=await ok(path+'/preview',input);return ok(path+'/apply',{...input,digest:preview.digest})};
  await route(id,{});
  const check=async monitorId=>{
   const path=`/api/monitors/${monitorId}/history`,before=(await ok(path)).length;
   await g.DB.prepare('UPDATE monitors SET next_due=? WHERE id=?').bind(Date.now()-1,monitorId).run();
   for(let i=0;i<8;i++){await run();if((await ok(path)).length>before)break}
   assert.equal((await ok(path)).length,before+1,'scheduled signed completion');
  };
  return {g,edge,ok,run,route,check,id,async restart(){await (restarted??g.worker).dispose();const {startLocalWorker}=await import('./mail-provider-fixture.mjs');restarted=await startLocalWorker({persist:g.directory,port:Number(new URL(g.origin).port),bindings:g.bindings,cf:{}});g.DB=await restarted.getD1Database('DB')},async close(){await restarted?.dispose();await edge.close();await g.close()}};
 }catch(error){await edge.close();await g.close();throw error}
}
