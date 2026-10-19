// Network edges only: public DNS validation and numeric pinning still execute in production code.
import assert from 'node:assert/strict';
import {Resolver} from 'node:dns/promises';
import https from 'node:https';
import net from 'node:net';
const hosts=['canary.protocol.test','wrong-cert.protocol.test','dns.google'];
const address='93.184.216.34';
Resolver.prototype.resolve4=async host=>{assert.ok(hosts.includes(host),`Unexpected mail fixture lookup ${host}`);return [address]};
Resolver.prototype.resolve6=async()=>[];
const connect=net.connect;
net.connect=function(options,...rest){
 if(typeof options==='object'&&options.host===address)return connect.call(this,{...options,host:'127.0.0.1'},...rest);
 return connect.call(this,options,...rest);
};
const request=https.request;
https.request=function(options,...rest){
 if(typeof options==='object'&&options.hostname===address){assert.ok(['canary.protocol.test','dns.google'].includes(options.servername));return request.call(this,{...options,hostname:'127.0.0.1',port:Number(process.env.MAIL_JOURNEY_WEB_PORT)},...rest)}
 return request.call(this,options,...rest);
};
