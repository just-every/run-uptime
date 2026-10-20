// The sole fake for the dependency journey is this network edge. Real discovery,
// pinned HTTP sockets, assertions, signed runner calls and Worker persistence run.
import assert from 'node:assert/strict';
import https from 'node:https';
import {Resolver} from 'node:dns/promises';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {closeServer} from './resilience/support.mjs';
export const applicationUrl='https://shop.provider.test/';
export const statusOrigin='https://status.provider.test';
export const canaryUrl='https://canary.provider.test/health';
export async function statuspageEdge(directory){
 const keyPath=join(directory,'dependency-key.pem'),certPath=join(directory,'dependency-cert.pem');
 const child=spawn('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',keyPath,'-out',certPath,'-days','1','-subj','/CN=provider.test','-addext','subjectAltName=DNS:shop.provider.test,DNS:status.provider.test,DNS:canary.provider.test'],{stdio:'ignore'});
 assert.equal((await once(child,'exit'))[0],0,'network edge certificate creation');
 const tls={key:await readFile(keyPath),cert:await readFile(certPath)},requests=[];
 const state={source:200,robots:false,components:[{id:'api',name:'API',status:'operational'},{id:'payments',name:'Payments',status:'operational'},...Array.from({length:8},(_,i)=>({id:`region-${i}`,name:`Region ${i}`,status:'operational'}))]};
 const server=https.createServer(tls,(req,res)=>{
  const host=req.headers.host;requests.push({host,path:req.url,method:req.method});
  if(host==='shop.provider.test'&&req.url==='/'){res.writeHead(200,{'content-type':'text/html'});res.end(`<title>Acme Store</title><h1>Acme Store</h1><a href="${statusOrigin}/">Provider status</a>`);return}
  if(host==='canary.provider.test'){res.writeHead(200,{'content-type':'text/plain'});res.end('independent check');return}
  if(host==='status.provider.test'){
   if(req.url==='/robots.txt'){res.writeHead(200,{'content-type':'text/plain'});res.end(state.robots?'User-agent: *\nDisallow: /api/v2/components.json\n':'User-agent: *\nAllow: /\n');return}
   if(req.url==='/api/v2/status.json'||req.url==='/api/v2/components.json'){
    res.writeHead(state.source,{'content-type':'application/json'});res.end(JSON.stringify(req.url.endsWith('/components.json')?{page:{name:'Acme Cloud'},components:state.components}:{page:{name:'Acme Cloud'},status:{indicator:'none',description:'All Systems Operational'}}));return
   }
  }
  res.writeHead(404,{'content-type':'text/plain'});res.end('not found');
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const port=server.address().port,request=https.request,resolve4=Resolver.prototype.resolve4,resolve6=Resolver.prototype.resolve6;
 Resolver.prototype.resolve4=async function(host){if(['shop.provider.test','status.provider.test','canary.provider.test'].includes(host))return ['93.184.216.36'];if(host.endsWith('.provider.test'))throw Object.assign(Error('No fixture hostname'),{code:'ENOTFOUND'});return resolve4.call(this,host)};
 Resolver.prototype.resolve6=async function(host){return host.endsWith('.provider.test')?[]:resolve6.call(this,host)};
 https.request=function(options,...args){
  if(options?.hostname!=='93.184.216.36')return request.call(this,options,...args);
  assert.equal(options.rejectUnauthorized,true);assert.equal(typeof options.checkServerIdentity,'function');
  assert.equal(options.headers.host,options.servername);assert.ok(options.method==='GET'||options.method==='HEAD','discovery and monitors read only');
  return request.call(this,{...options,hostname:'127.0.0.1',port,ca:tls.cert},...args);
 };
 return {state,requests,async close(){https.request=request;Resolver.prototype.resolve4=resolve4;Resolver.prototype.resolve6=resolve6;await closeServer(server)}};
}
