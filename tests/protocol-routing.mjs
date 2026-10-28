// Test-only DNS and socket routing for the protocol monitors' runner (preloaded into the real runner process). Every
// fixture host resolves to one public address; sockets the runner pins to that address are routed to local fixtures.
// Production validation still runs: the runner resolves, checks and pins exactly as it would against the Internet.
import assert from 'node:assert/strict';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import dns,{Resolver} from 'node:dns/promises';
import {syncBuiltinESMExports} from 'node:module';

const PUBLIC='93.184.216.34';
const HOSTS=['ns1.protocol.test','tcp.protocol.test','tls.protocol.test','canary.protocol.test','routing.protocol.example.com','cloudflare-dns.com','dns.google','data.iana.org','rdap.registry.test','rdap.registrar.test'];
const env=process.env;
Resolver.prototype.resolve4=async host=>{
 assert.ok(HOSTS.includes(host),`unexpected lookup ${host}`);
 // The runner's own resolver failing is a probe failure, never evidence about the target.
 if(env.PROTOCOL_RESOLVER_FAILS==='1'&&host==='tcp.protocol.test')throw Object.assign(Error('resolver failed'),{code:'ESERVFAIL'});
 return [PUBLIC];
};
Resolver.prototype.resolve6=async()=>[];
// NotificationTransport uses lookup rather than the probe Resolver. Route its
// receiver DNS through the same controlled public-address edge.
const originalLookup=dns.lookup;
dns.lookup=async(host,options)=>host==='routing.protocol.example.com'?(options?.all?[{address:PUBLIC,family:4}]:{address:PUBLIC,family:4}):originalLookup(host,options);
syncBuiltinESMExports();
const request=https.request;
https.request=function(options,callback){
 assert.equal(options.hostname,PUBLIC);assert.equal(options.rejectUnauthorized,true);assert.ok(HOSTS.includes(options.servername),`unexpected TLS name ${options.servername}`);
 return request.call(this,{...options,hostname:'127.0.0.1',port:Number(env.PROTOCOL_HTTPS_PORT)},callback);
};
const connect=net.connect;
net.connect=function(options,...rest){
 if(typeof options!=='object'||options.host!==PUBLIC)return connect.call(this,options,...rest);
 // A port that drops every packet: the connection neither opens nor fails until the check's timeout.
 // Like a real connect attempt, it keeps the process alive until the check gives up and destroys it.
 if(env.PROTOCOL_TCP_MODE==='blackhole'){const socket=new net.Socket(),pending=setTimeout(()=>{},60000);socket.once('close',()=>clearTimeout(pending));return socket}
 // Port 53 is the zone's name server; any other port is the monitored TCP service.
 return connect.call(this,{...options,host:'127.0.0.1',port:Number(options.port===53?env.PROTOCOL_DNS_PORT:env.PROTOCOL_TCP_PORT)},...rest);
};
const secure=tls.connect;
tls.connect=function(options,...rest){
 if(typeof options!=='object'||options.host!==PUBLIC)return secure.call(this,options,...rest);
 assert.equal(options.servername,'tls.protocol.test');
 return secure.call(this,{...options,host:'127.0.0.1',port:Number(env.PROTOCOL_TLS_PORT)},...rest);
};
