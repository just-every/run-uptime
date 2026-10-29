// Test-only DNS/socket routing into an actual local HTTPS server. Certificate
// trust comes from NODE_EXTRA_CA_CERTS; production certificate checks stay on.
import assert from 'node:assert/strict';
import https from 'node:https';
import {Resolver} from 'node:dns/promises';

// Only the test process and emitted-Worker envelope control time; production has no clock override.
if(process.env.SIGNED_RUNNER_CLOCK!==undefined){const clock=Number(process.env.SIGNED_RUNNER_CLOCK);assert.ok(Number.isSafeInteger(clock));Date.now=()=>clock}

Resolver.prototype.resolve4=async host=>{
 assert.ok(['runner-target.test','canary.runner-target.test'].includes(host));
 return ['93.184.216.34'];
};
Resolver.prototype.resolve6=async()=>[];
const original=https.request;
https.request=function(options,callback){
 assert.equal(options.hostname,'93.184.216.34');
 assert.equal(options.rejectUnauthorized,true);
 assert.equal(typeof options.checkServerIdentity,'function');
 assert.ok(['runner-target.test','canary.runner-target.test'].includes(options.servername));
 assert.equal(options.headers.host,options.servername);
 return original.call(this,{...options,hostname:'127.0.0.1',port:Number(process.env.SIGNED_RUNNER_TARGET_PORT)},callback);
};
