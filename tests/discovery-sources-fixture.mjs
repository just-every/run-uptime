// DISCOVERY-001's network edge. Controlled real endpoints: a UDP DNS listener that answers the synthetic zone over the DNS wire
// protocol, and one HTTPS listener that serves the site's pages, robots.txt, sitemap and OpenAPI document. The runner's own
// node:dns Resolver is pointed at that DNS listener for the zone's names (the build host's system resolver cannot serve a test
// zone), and connections to the zone's public addresses are delivered to the HTTPS listener with the test CA; lookups, TLS,
// robots, sitemaps and specs all run for real. The six provider accounts the build has no access to are fakes of each provider's
// documented API shape on the same listener. Every DNS query and HTTP request is recorded.
import assert from 'node:assert/strict';
import https from 'node:https';
import dgram from 'node:dgram';
import {Resolver} from 'node:dns/promises';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {closeServer} from './resilience/support.mjs';
export const DOMAIN='synthetic-uptime-1.test';
const SITE='93.184.216.50',API='93.184.216.51',PROVIDER='93.184.216.52',PRIVATE='10.20.30.40';
export const PROVIDER_HOSTS=['api.cloudflare.com','route53.amazonaws.com','api.github.com','api.vercel.com','api.netlify.com','codedeploy.us-east-1.amazonaws.com'];
const host=label=>label?`${label}.${DOMAIN}`:DOMAIN;
// The zone as the DNS listener answers it; a test changes it between runs.
export function initialZone(){
 return {[host('')]:{A:[SITE]},[host('www')]:{A:[SITE]},[host('api')]:{CNAME:host('edge')},[host('edge')]:{A:[API]},[host('app')]:{A:[SITE]},[host('docs')]:{A:[SITE]},[host('shop')]:{A:[SITE]},
  [host('web')]:{A:[SITE]},[host('preview')]:{A:[SITE]},[host('blog')]:{A:[SITE]},[host('cdn')]:{A:[SITE]},[host('canary')]:{A:[SITE]},[host('status')]:{A:[PRIVATE]},...Object.fromEntries(PROVIDER_HOSTS.map(name=>[name,{A:[PROVIDER]}]))};
}
const TYPES={1:'A',5:'CNAME',28:'AAAA'};
const encodeName=name=>Buffer.concat([...name.split('.').filter(Boolean).map(label=>Buffer.concat([Buffer.from([label.length]),Buffer.from(label)])),Buffer.from([0])]);
function readName(buffer,offset){const labels=[];for(;;){const length=buffer[offset++];if(!length)break;labels.push(buffer.subarray(offset,offset+length).toString());offset+=length}return {name:labels.join('.').toLowerCase(),offset}}
const record=(name,type,ttl,data)=>{const head=Buffer.alloc(10);head.writeUInt16BE(type,0);head.writeUInt16BE(1,2);head.writeUInt32BE(ttl,4);head.writeUInt16BE(data.length,8);return Buffer.concat([encodeName(name),head,data])};
const address=(type,value)=>type===1?Buffer.from(value.split('.').map(Number)):Buffer.from(value.split(':').flatMap(part=>[parseInt(part.padStart(4,'0').slice(0,2),16),parseInt(part.padStart(4,'0').slice(2),16)]));
// A real DNS listener: one question per message, CNAME chains followed inside the zone, NXDOMAIN for a name the zone lacks.
export async function dnsListener(zone,queries,delay=()=>0){
 const socket=dgram.createSocket('udp4');
 socket.on('message',(message,from)=>{
  const id=message.readUInt16BE(0),flags=message.readUInt16BE(2),{name,offset}=readName(message,12),qtype=message.readUInt16BE(offset);
  queries.push({name,type:TYPES[qtype]??String(qtype)});
  const answers=[];let current=name,code=0;
  for(let hops=0;hops<4;hops++){
   const entry=zone[current];if(!entry){if(current===name)code=3;break}
   if(entry.CNAME){answers.push(record(current,5,60,encodeName(entry.CNAME)));if(qtype===5)break;current=entry.CNAME;continue}
   for(const value of (qtype===1?entry.A:qtype===28?entry.AAAA:null)??[])answers.push(record(current,qtype,60,address(qtype,value)));
   break;
  }
  const header=Buffer.alloc(12);header.writeUInt16BE(id,0);header.writeUInt16BE(0x8400|(flags&0x0100)|0x0080|code,2);header.writeUInt16BE(1,4);header.writeUInt16BE(answers.length,6);
  const send=()=>socket.send(Buffer.concat([header,message.subarray(12,offset+4),...answers]),from.port,from.address);
  const waiting=delay();if(waiting>0)setTimeout(send,waiting);else send();
 });
 socket.bind(0,'127.0.0.1');await once(socket,'listening');
 return socket;
}
// Synthetic runner-local credentials, by provider host. Signature Version 4 requests carry the access key id and a signature.
const CREDENTIALS={'api.cloudflare.com':/^Bearer synthetic-uptime-21$/,'route53.amazonaws.com':/^AWS4-HMAC-SHA256 Credential=synthetic-uptime-22\/\d{8}\/us-east-1\/route53\/aws4_request, SignedHeaders=[a-z0-9;-]+, Signature=[0-9a-f]{64}$/,
 'api.github.com':/^Bearer synthetic-uptime-23$/,'api.vercel.com':/^Bearer synthetic-uptime-24$/,'api.netlify.com':/^Bearer synthetic-uptime-25$/,
 'codedeploy.us-east-1.amazonaws.com':/^AWS4-HMAC-SHA256 Credential=synthetic-uptime-27\/\d{8}\/us-east-1\/codedeploy\/aws4_request, SignedHeaders=[a-z0-9;-]+, Signature=[0-9a-f]{64}$/};
export const SECRETS=['synthetic-uptime-21','synthetic-uptime-22-secret','synthetic-uptime-23','synthetic-uptime-24','synthetic-uptime-25','synthetic-uptime-27-secret'];
const json=(res,status,value)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(value))};
const xml=(res,value)=>{res.writeHead(200,{'content-type':'application/xml'});res.end(value)};
// The site, as the edge serves it; a test changes it between runs.
export function initialSite(){
 return {sitemap:['/','/pricing','/checkout'],spec:{'/health':false,'/orders':false,'/items/{id}':false,'/search':true},down:new Set()};
}
// The providers' accounts, in their documented shapes; a test changes them between runs.
export function initialProviders(){
 const zoneId='0123456789abcdef0123456789abcdef',hostedZone='ZSYNTHETICUPTIME1';
 return {zoneId,hostedZone,cloudflare:[{type:'A',name:host('www'),content:SITE},{type:'CNAME',name:host('api'),content:host('edge')},{type:'A',name:host('status'),content:PRIVATE},{type:'TXT',name:DOMAIN,content:'v=spf1 -all'}],
  route53:[{type:'A',name:host('shop'),values:[SITE]},{type:'MX',name:DOMAIN,values:['10 mail.example.org']}],
  github:[{id:9001,created_at:new Date(Date.now()-3600000).toISOString(),environment:'production',url:host('app')}],githubRuns:2,
  vercel:{deployments:[{uid:'dpl_synthetic1',created:Date.now()-3600000}],domains:[host('web')]},
  netlify:{deploys:[{id:'synthetic-uptime-31',state:'ready',context:'production',created_at:new Date(Date.now()-3600000).toISOString()}],domain:host('docs')},
  codedeploy:{deployments:[{id:'d-SYNTHETIC1',createTime:(Date.now()-3600000)/1000}],since:[]}};
}
const spec=paths=>({openapi:'3.0.3',info:{title:'Synthetic Uptime API'},servers:[{url:`https://${host('api')}/v1`}],paths:Object.fromEntries(Object.entries(paths).map(([path,required])=>[path,{get:{parameters:required?[{name:'q',in:'query',required:true}]:[],responses:{200:{description:'ok'}}}}]))});
export async function sourcesEdge(directory){
 // The certificate also names hosts a test adds to the zone later.
 const keyPath=join(directory,'sources-key.pem'),certPath=join(directory,'sources-cert.pem'),zone=initialZone(),names=[...Object.keys(zone),host('dashboard'),host('portal')];
 const child=spawn('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',keyPath,'-out',certPath,'-days','1','-subj',`/CN=${DOMAIN}`,'-addext',`subjectAltName=${names.map(name=>`DNS:${name}`).join(',')}`],{stdio:'ignore'});
 assert.equal((await once(child,'exit'))[0],0,'network edge certificate creation');
 const tls={key:await readFile(keyPath),cert:await readFile(certPath)},requests=[],queries=[],site=initialSite(),providers=initialProviders();
 const pageHost=name=>[host(''),host('www'),host('app'),host('docs'),host('shop'),host('web'),host('preview'),host('blog'),host('cdn'),host('canary'),host('dashboard'),host('portal')].includes(name);
 const server=https.createServer(tls,(req,res)=>{
  const name=req.headers.host,url=new URL(req.url,`https://${name}`);
  // Each provider's fake answers only its own runner-local credential; the record keeps whether it was the right one, never the value.
  const credential=CREDENTIALS[name],authorization=req.headers.authorization??'',credentialOk=credential?credential.test(authorization):null;
  requests.push({host:name,method:req.method,path:url.pathname,query:url.search,target:req.headers['x-amz-target']??null,credentialOk});
  if(credential&&!credentialOk){json(res,403,{error:'wrong credential'});return}
  if(pageHost(name)){
   if(site.down.has(name)){res.socket.destroy();return}
   if(url.pathname==='/robots.txt'){res.writeHead(200,{'content-type':'text/plain'});res.end(`User-agent: *\nAllow: /\nSitemap: https://${host('www')}/sitemap.xml\n`);return}
   if(url.pathname==='/sitemap.xml'&&name===host('www')){xml(res,`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${site.sitemap.map(path=>`<url><loc>https://${host('www')}${path}</loc></url>`).join('')}</urlset>`);return}
   if(name===host('www')&&!site.sitemap.includes(url.pathname)&&url.pathname!=='/'){res.writeHead(404,{'content-type':'text/plain'});res.end('not found');return}
   res.writeHead(200,{'content-type':'text/html'});res.end(`<!doctype html><title>Synthetic Uptime ${url.pathname==='/'?name.split('.')[0]:url.pathname.slice(1)}</title><h1>Synthetic Uptime</h1>`);return;
  }
  if(name===host('api')){
   if(url.pathname==='/robots.txt'){res.writeHead(200,{'content-type':'text/plain'});res.end('User-agent: *\nAllow: /\n');return}
   if(url.pathname==='/'){json(res,200,{service:'synthetic-uptime',docs:'/openapi.json'});return}
   if(url.pathname==='/openapi.json'){json(res,200,spec(site.spec));return}
   if(url.pathname==='/v1/orders'){json(res,401,{error:'sign in'});return}
   if(url.pathname.startsWith('/v1/')&&Object.hasOwn(site.spec,url.pathname.slice(3))){json(res,200,{ok:true});return}
   json(res,404,{error:'not found'});return;
  }
  if(name==='api.cloudflare.com'){
   if(url.pathname===`/client/v4/zones/${providers.zoneId}`){json(res,200,{success:true,result:{id:providers.zoneId,name:DOMAIN}});return}
   if(url.pathname===`/client/v4/zones/${providers.zoneId}/dns_records`){json(res,200,{success:true,result:providers.cloudflare.map((r,i)=>({id:`r${i}`,...r})),result_info:{page:1,per_page:100,count:providers.cloudflare.length,total_count:providers.cloudflare.length,total_pages:1}});return}
  }
  if(name==='route53.amazonaws.com'){
   if(url.pathname===`/2013-04-01/hostedzone/${providers.hostedZone}`){xml(res,`<?xml version="1.0"?><GetHostedZoneResponse xmlns="https://route53.amazonaws.com/doc/2013-04-01/"><HostedZone><Id>/hostedzone/${providers.hostedZone}</Id><Name>${DOMAIN}.</Name><CallerReference>synthetic</CallerReference></HostedZone></GetHostedZoneResponse>`);return}
   if(url.pathname===`/2013-04-01/hostedzone/${providers.hostedZone}/rrset`){xml(res,`<?xml version="1.0"?><ListResourceRecordSetsResponse xmlns="https://route53.amazonaws.com/doc/2013-04-01/"><ResourceRecordSets>${providers.route53.map(r=>`<ResourceRecordSet><Name>${r.name}.</Name><Type>${r.type}</Type><TTL>300</TTL><ResourceRecords>${r.values.map(v=>`<ResourceRecord><Value>${v}</Value></ResourceRecord>`).join('')}</ResourceRecords></ResourceRecordSet>`).join('')}</ResourceRecordSets><IsTruncated>false</IsTruncated><MaxItems>100</MaxItems></ListResourceRecordSetsResponse>`);return}
  }
  if(name==='api.github.com'){
   const base='/repos/synthetic-uptime/shop';
   if(url.pathname===`${base}/deployments`){json(res,200,providers.github.map(d=>({id:d.id,created_at:d.created_at,environment:d.environment,sha:'0'.repeat(40),ref:'main'})));return}
   const status=new RegExp(`^${base}/deployments/(\\d+)/statuses$`).exec(url.pathname);
   if(status){const d=providers.github.find(item=>String(item.id)===status[1]);json(res,200,d?[{state:'success',environment_url:`https://${d.url}/`,created_at:d.created_at}]:[]);return}
   if(url.pathname===`${base}/actions/runs`){json(res,200,{total_count:providers.githubRuns,workflow_runs:Array.from({length:providers.githubRuns},(_,i)=>({id:i+1,status:'completed',conclusion:'success'}))});return}
  }
  if(name==='api.vercel.com'){
   if(url.pathname==='/v6/deployments'){const since=Number(url.searchParams.get('since')??0);json(res,200,{deployments:providers.vercel.deployments.filter(d=>d.created>=since).map(d=>({uid:d.uid,created:d.created,state:'READY',target:'production',url:'synthetic-uptime-shop.vercel.app'})),pagination:{count:1}});return}
   if(url.pathname==='/v9/projects/prj_synthetic_uptime/domains'){json(res,200,{domains:providers.vercel.domains.map(name=>({name,verified:true})),pagination:{count:providers.vercel.domains.length}});return}
  }
  if(name==='api.netlify.com'){
   if(url.pathname==='/api/v1/sites/synthetic-uptime-site/deploys'){json(res,200,providers.netlify.deploys);return}
   if(url.pathname==='/api/v1/sites/synthetic-uptime-site'){json(res,200,{id:'synthetic-uptime-site',ssl_url:`https://synthetic-uptime-site.netlify.app`,custom_domain:providers.netlify.domain});return}
  }
  if(name==='codedeploy.us-east-1.amazonaws.com'&&req.method==='POST'){
   let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{
    const input=JSON.parse(body),target=req.headers['x-amz-target'];
    if(target==='CodeDeploy_20141006.ListDeployments'&&input.applicationName==='synthetic-uptime-shop'&&input.deploymentGroupName==='production'){providers.codedeploy.since.push(input.createTimeRange?.start??null);const since=input.createTimeRange?.start??0;json(res,200,{deployments:providers.codedeploy.deployments.filter(d=>d.createTime>=since).map(d=>d.id)});return}
    if(target==='CodeDeploy_20141006.BatchGetDeployments'){json(res,200,{deploymentsInfo:input.deploymentIds.map(id=>({deploymentId:id,applicationName:'synthetic-uptime-shop',deploymentGroupName:'production',status:'Succeeded',createTime:providers.codedeploy.deployments.find(d=>d.id===id).createTime}))});return}
    json(res,400,{__type:'UnknownOperationException'});
   });return;
  }
  json(res,404,{error:'not found'});
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const dns=await dnsListener(zone,queries),dnsServer=`127.0.0.1:${dns.address().port}`,port=server.address().port;
 // Point the runner's resolvers at the controlled DNS listener for the zone's names; everything else keeps the host's resolver.
 const methods=['resolve4','resolve6','resolveCname'],original=Object.fromEntries(methods.map(method=>[method,Resolver.prototype[method]])),request=https.request;
 const ours=name=>name===DOMAIN||name.endsWith(`.${DOMAIN}`)||PROVIDER_HOSTS.includes(name);
 for(const method of methods)Resolver.prototype[method]=function(name,...rest){
  if(!ours(String(name).toLowerCase()))return original[method].call(this,name,...rest);
  const resolver=new Resolver({timeout:1000,tries:1});resolver.setServers([dnsServer]);return original[method].call(resolver,name,...rest);
 };
 https.request=function(options,...args){
  if(![SITE,API,PROVIDER].includes(options?.hostname))return request.call(this,options,...args);
  assert.equal(options.rejectUnauthorized,true);assert.equal(options.headers.host.split(':')[0],options.servername);
  return request.call(this,{...options,hostname:'127.0.0.1',port,ca:tls.cert},...args);
 };
 return {zone,site,providers,requests,queries,
  async close(){https.request=request;for(const method of methods)Resolver.prototype[method]=original[method];dns.close();await closeServer(server)}};
}
