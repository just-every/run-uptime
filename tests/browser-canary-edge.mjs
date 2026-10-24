// Only the controlled public canary's socket is mapped to this run's local network edge.
import http from 'node:http';
import assert from 'node:assert/strict';
import {syncBuiltinESMExports} from 'node:module';
const port=Number(process.env.UPTIME_BROWSER_CANARY_PORT);assert.ok(Number.isSafeInteger(port)&&port>0);
const request=http.request;
http.request=function(options,...args){
 if(options?.hostname==='93.184.216.35'){
  assert.equal(Number(options.port),port);assert.equal(options.headers.host,`93.184.216.35:${port}`);
  return request.call(this,{...options,hostname:'127.0.0.1'},...args);
 }
 return request.call(this,options,...args);
};
syncBuiltinESMExports();
