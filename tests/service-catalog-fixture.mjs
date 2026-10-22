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
export const hosts={stripe:'status.stripe.com',aws:'status.aws.amazon.com',slack:'slack-status.com',acme:'status.acme-cloud.test',app:'shop.provider.test',app2:'portal.provider.test',canary:'canary.provider.test'};
const rss=items=>`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Service Status</title><link>https://status.aws.amazon.com/</link>${items.map(title=>`<item><title><![CDATA[${title}]]></title><link>https://status.aws.amazon.com/</link></item>`).join('')}</channel></rss>`;
export async function catalogEdge(directory){
 const keyPath=join(directory,'catalog-key.pem'),certPath=join(directory,'catalog-cert.pem'),names=Object.values(hosts);
 const child=spawn('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',keyPath,'-out',certPath,'-days','1','-subj','/CN=catalog.test','-addext',`subjectAltName=${names.map(name=>`DNS:${name}`).join(',')}`],{stdio:'ignore'});
 assert.equal((await once(child,'exit'))[0],0,'network edge certificate creation');
 const tls={key:await readFile(keyPath),cert:await readFile(certPath)},requests=[];
 // mode: 200 serves the document; a status code answers it; 'moved' redirects; 'shape' serves a document without the claim; 'drop' resets the connection.
 const state={stripe:{mode:200,statuses:{api:'up',webhooks:'up',dashboard:'up',stripejs:'up',checkout:'up',supportsite:'up'}},aws:{mode:200,items:[]},slack:{mode:200,status:'ok'},app:200,app2:200};
 const answer=(res,source,json)=>{
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
  if(host===hosts.app||host===hosts.app2){const code=host===hosts.app?state.app:state.app2;res.writeHead(code,{'content-type':'text/html'});res.end(code===200?'<title>Shop</title>':'down');return}
  if(host===hosts.canary){res.writeHead(200,{'content-type':'text/plain'});res.end('independent check');return}
  res.writeHead(404,{'content-type':'text/plain'});res.end('not found');
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const port=server.address().port,request=https.request,resolve4=Resolver.prototype.resolve4,resolve6=Resolver.prototype.resolve6;
 const mine=host=>names.includes(host);
 Resolver.prototype.resolve4=async function(host){if(mine(host))return ['93.184.216.36'];return resolve4.call(this,host)};
 Resolver.prototype.resolve6=async function(host){return mine(host)?[]:resolve6.call(this,host)};
 https.request=function(options,...args){
  if(options?.hostname!=='93.184.216.36')return request.call(this,options,...args);
  assert.equal(options.rejectUnauthorized,true);assert.equal(options.headers.host,options.servername);
  return request.call(this,{...options,hostname:'127.0.0.1',port,ca:tls.cert},...args);
 };
 return {state,requests,async close(){https.request=request;Resolver.prototype.resolve4=resolve4;Resolver.prototype.resolve6=resolve6;await closeServer(server)}};
}
