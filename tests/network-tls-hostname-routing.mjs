// Only DNS and numeric socket routing change at this authorized network edge.
// NODE_EXTRA_CA_CERTS supplies trust before Node starts; native TLS checks stay on.
import assert from 'node:assert/strict';
import https from 'node:https';
import {Resolver} from 'node:dns/promises';

const target='hostname.sanity.test',canary='canary.hostname.sanity.test';
const resolve4=Resolver.prototype.resolve4,resolve6=Resolver.prototype.resolve6;
Resolver.prototype.resolve4=async function(host,...args){
 if([target,canary].includes(host))return ['93.184.216.34'];
 return resolve4.call(this,host,...args);
};
Resolver.prototype.resolve6=async function(host,...args){
 if([target,canary].includes(host))return [];
 return resolve6.call(this,host,...args);
};
const request=https.request;
https.request=function(options,...args){
 if(options?.hostname==='93.184.216.34'){
  assert.ok([target,canary].includes(options.servername));
  assert.equal(options.headers.host,options.servername);
  assert.equal(options.rejectUnauthorized,true);
  assert.equal(typeof options.checkServerIdentity,'function');
  assert.equal(options.ca,undefined,'the edge supplies no per-request trust exception');
  return request.call(this,{...options,hostname:'127.0.0.1',port:Number(process.env[options.servername===target?'HOSTNAME_TARGET_PORT':'HOSTNAME_CANARY_PORT'])},...args);
 }
 return request.call(this,options,...args);
};
