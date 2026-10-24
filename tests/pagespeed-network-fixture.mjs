import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {Resolver} from 'node:dns/promises';
import {X509Certificate,createHash} from 'node:crypto';
import {readFile,chmod} from 'node:fs/promises';
import {join} from 'node:path';
import {promisify} from 'node:util';
import {dnsListener} from './discovery-sources-fixture.mjs';

export async function timingNetwork(directory){
 const host='synthetic-uptime-3.test',address='93.184.216.53',keyFile=join(directory,'timing-key.pem'),certFile=join(directory,'timing-cert.pem');
 await promisify(childProcess.execFile)('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',keyFile,'-out',certFile,'-days','1','-subj','/CN='+host,'-addext','subjectAltName=DNS:'+host]);
 await chmod(keyFile,0o600);
 const key=await readFile(keyFile),cert=await readFile(certFile),spki=createHash('sha256').update(new X509Certificate(cert).publicKey.export({type:'spki',format:'der'})).digest('base64');
 const state={dns:20,tls:30,connect:0,firstByte:0},queries=[],sockets=new Set();
 const track=socket=>{sockets.add(socket);socket.on('error',()=>{});socket.once('close',()=>sockets.delete(socket));return socket};
 const serve=async(_request,response)=>{await new Promise(resolve=>setTimeout(resolve,state.firstByte));response.writeHead(200,{'content-type':'text/html','cache-control':'no-store'});response.end('<!doctype html><html lang="en"><title>Timing fixture</title><h1>Timing fixture</h1></html>')};
 const secure=https.createServer({key,cert},serve),plain=http.createServer(serve);
 const listen=server=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
 await listen(secure);await listen(plain);
 // Delay the actual TLS handshake, after the browser's TCP connection exists.
 const front=net.createServer(client=>{
  track(client);client.pause();setTimeout(()=>{
   if(client.destroyed)return;
   const upstream=track(net.connect({host:'127.0.0.1',port:secure.address().port}));
   upstream.once('connect',()=>{client.pipe(upstream);upstream.pipe(client);client.resume()});
   client.once('close',()=>upstream.destroy());upstream.once('close',()=>client.destroy());
  },state.tls);
 });await listen(front);
 const dns=await dnsListener({[host]:{A:[address]}},queries,()=>state.dns),dnsServer=`127.0.0.1:${dns.address().port}`;
 const methods=['resolve4','resolve6'],resolvers=Object.fromEntries(methods.map(method=>[method,Resolver.prototype[method]]));
 const connect=net.connect,request=http.request,spawn=childProcess.spawn;
 for(const method of methods)Resolver.prototype[method]=function(name,...args){
  if(name!==host)return resolvers[method].call(this,name,...args);
  const resolver=new Resolver({timeout:1500,tries:1});resolver.setServers([dnsServer]);return resolvers[method].call(resolver,name,...args);
 };
 // The DNS answer stays publicly routable; only this network edge directs its
 // packets to our controlled listeners. The runner still pins that answer.
 net.connect=function(options,...args){
  if(options?.host!==address)return connect.call(this,options,...args);
  // Delay connection initiation at the existing wire edge, before the real socket connects.
  const socket=track(new net.Socket());
  const timer=setTimeout(()=>{if(!socket.destroyed)socket.connect({...options,host:'127.0.0.1'},...args)},state.connect);
  socket.once('close',()=>clearTimeout(timer));return socket;
 };
 http.request=function(options,...args){return request.call(this,options?.host===address?{...options,host:'127.0.0.1'}:options,...args)};
 const child=new URL('../runners/src/pagespeed/child.mjs',import.meta.url).pathname,preload=new URL('./pagespeed-network-trust.mjs',import.meta.url).pathname;
 childProcess.spawn=function(executable,args,options){
  return args?.[0]===child?spawn(executable,['--import',preload,...args],{...options,env:{...options.env,UPTIME_TEST_TRUST_SPKI:spki}}):spawn(executable,args,options);
 };syncBuiltinESMExports();
 return {host,queries,state,https:`https://${host}:${front.address().port}`,http:`http://${host}:${plain.address().port}`,
  async close(){
   childProcess.spawn=spawn;syncBuiltinESMExports();net.connect=connect;http.request=request;for(const method of methods)Resolver.prototype[method]=resolvers[method];
   dns.close();for(const socket of sockets)socket.destroy();
   for(const server of [front,secure,plain]){server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve))}
  }};
}
