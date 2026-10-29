import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
// Network edges only: public DNS validation and numeric pinning still execute in production code.
import assert from 'node:assert/strict';
import {Resolver} from 'node:dns/promises';
import https from 'node:https';
import net from 'node:net';
const hosts=['receiver.protocol.test','canary.protocol.test','wrong-cert.protocol.test','dns.google'];
const address='93.184.216.34';let receiverLookups=0;
Resolver.prototype.resolve4=async host=>{if(host==='receiver.protocol.test'&&process.env.MAIL_DIAGNOSTIC_PIN)assert.equal(++receiverLookups,1,'the failed receiver is resolved only once');assert.ok(hosts.includes(host),`Unexpected mail fixture lookup ${host}`);return [host==='receiver.protocol.test'?'93.184.216.35':address]};
Resolver.prototype.resolve6=async()=>[];
const connect=net.connect;
net.connect=function(options,...rest){
 if(typeof options==='object'&&[address,'93.184.216.35'].includes(options.host))return connect.call(this,{...options,host:'127.0.0.1'},...rest);
 return connect.call(this,options,...rest);
};
const request=https.request;
https.request=function(options,...rest){
 if(typeof options==='object'&&options.hostname===address){assert.ok(['canary.protocol.test','dns.google'].includes(options.servername));return request.call(this,{...options,hostname:'127.0.0.1',port:Number(process.env.MAIL_JOURNEY_WEB_PORT)},...rest)}
 return request.call(this,options,...rest);
};

if(process.env.MAIL_DIAGNOSTIC_PIN){
 const nativeSpawn=childProcess.spawn;
 childProcess.spawn=function(binary,args,options){
  if(binary==='traceroute'||binary==='/usr/sbin/traceroute'){
   assert.equal(args.at(-1),process.env.MAIL_DIAGNOSTIC_PIN);assert.ok(args.includes('-n'));assert.equal(args[args.indexOf('-m')+1],'5');assert.equal(args[args.indexOf('-q')+1],'1');
   return nativeSpawn.call(this,process.execPath,['-e','process.stdout.write('+JSON.stringify('1  '+args.at(-1)+'  1 ms\n')+')'],options);
  }
  return nativeSpawn.call(this,binary,args,options);
 };
 syncBuiltinESMExports();
}
