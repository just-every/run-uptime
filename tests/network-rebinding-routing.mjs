// This child controls only the authorized DNS and socket edge. TLS remains native.
import {appendFileSync} from 'node:fs';
import https from 'node:https';
import {Resolver} from 'node:dns/promises';

const target='rebinding.sanity.test',canary='canary.'+target;
const allowed='93.184.216.34',forbidden='10.0.0.1';
const phase=process.env.REBINDING_PHASE;
let answer=phase==='forbidden'?forbidden:allowed,sequence=0,witness=false;
const record=row=>appendFileSync(process.env.REBINDING_JOURNAL,JSON.stringify({sequence:++sequence,...row})+'\n');
const resolve4=Resolver.prototype.resolve4,resolve6=Resolver.prototype.resolve6;
Resolver.prototype.resolve4=async function(host,...args){
 if(host===target){record({event:'dns',answer,witness});return [answer]}
 if(host===canary)return [allowed];
 return resolve4.call(this,host,...args);
};
Resolver.prototype.resolve6=async function(host,...args){
 if([target,canary].includes(host))return [];
 return resolve6.call(this,host,...args);
};
const request=https.request;
https.request=function(options,...args){
 if([target,canary].includes(options?.servername)||[target,canary].includes(options?.hostname)){
  const isCanary=options.servername===canary||options.hostname===canary;
  if(!isCanary&&phase==='rebind'&&answer===allowed){
   // Production validation has already returned a numeric destination. Change
   // the authoritative answer before Node can create a socket for this request.
   record({event:'validated-dispatch-boundary',destination:options.hostname});
   answer=forbidden;record({event:'answer-changed',answer});
   witness=true;new Resolver().resolve4(target);witness=false;
  }
  const destination=options.hostname;
  // A hostname dispatch would resolve the current authority, including B. Route
  // that regression to B's own counted listener instead of hiding it by assert.
  const numeric=destination===target?answer:destination;
  record({event:'dispatch',canary:isCanary,destination,numeric,answer,host:options.headers?.host,sni:options.servername,verified:options.rejectUnauthorized===true,identityCheck:typeof options.checkServerIdentity==='function',trustOverride:options.ca!==undefined});
  const port=Number(process.env[isCanary?'REBINDING_CANARY_PORT':numeric===allowed?'REBINDING_ALLOWED_PORT':'REBINDING_FORBIDDEN_PORT']);
  const req=request.call(this,{...options,hostname:'127.0.0.1',port},...args);
  req.on('socket',socket=>socket.once('secureConnect',()=>record({event:'tls-verified',canary:isCanary,destination,authorized:socket.authorized,authorizationError:socket.authorizationError??null,remoteAddress:socket.remoteAddress,remotePort:socket.remotePort})));
  return req;
 }
 return request.call(this,options,...args);
};
