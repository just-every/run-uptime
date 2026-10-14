import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {Resolver} from 'node:dns/promises';
import {validateDefinition} from '../src/domain/policy.mjs';
import {executeTaskProbe} from '../runners/src/execute-task.mjs';
import {browserCapability} from '../runners/src/flow/browser.mjs';

test('real demo browser passes the synthetic journey and refuses redirect, subresource, WebSocket, tunnel and popup recipients',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'uptime-demo-browser-')),grantPath=join(directory,'grant.json'),workspace=join(directory,'flows');await mkdir(workspace,{mode:0o700});
 const previous=process.env.RER_DEMO;process.env.RER_DEMO='1';process.env.UPTIME_DEMO_LOG=join(directory,'blocked.jsonl');
 const identity=randomUUID();let scenario='healthy',recipientRequests=0,dns=0;
 const recipient=http.createServer((_q,r)=>{recipientRequests++;r.end('recipient')});recipient.on('upgrade',(_q,s)=>{recipientRequests++;s.destroy()});await new Promise(r=>recipient.listen(0,'127.0.0.1',r));
 const recipientUrl=`http://127.0.0.1:${recipient.address().port}/leak`;
 const target=http.createServer((req,res)=>{
  res.setHeader('x-uptime-fixture',identity);
  if(scenario==='redirect'){res.writeHead(302,{location:recipientUrl});res.end();return;}
  const scripts={healthy:"document.querySelector('#result').textContent='Demo service checked'",subresource:`fetch('${recipientUrl}').catch(()=>{});document.querySelector('#result').textContent='Demo service checked'`,websocket:`new WebSocket('${recipientUrl.replace('http:','ws:')}');document.querySelector('#result').textContent='Demo service checked'`,tunnel:`fetch('https://example.com/leak').catch(()=>{});document.querySelector('#result').textContent='Demo service checked'`,popup:`window.open('${recipientUrl}');document.querySelector('#result').textContent='Demo service checked'`};
  res.writeHead(200,{'content-type':'text/html'});res.end(`<!doctype html><html><body><h1>Demo service</h1><button onclick="${scripts[scenario]}">Check service</button><p id="result"></p></body></html>`);
 });await new Promise(r=>target.listen(0,'127.0.0.1',r));
 const port=target.address().port,origin=`http://127.0.0.1:${port}`;
 await writeFile(grantPath,JSON.stringify({schemaVersion:1,custody:'local-uptime-synthetic',host:'127.0.0.1',port,pid:process.pid,identity,expiresAt:Date.now()+3600000,paths:['/demo']}),{mode:0o600});
 const resolve4=Resolver.prototype.resolve4,resolve6=Resolver.prototype.resolve6;
 Resolver.prototype.resolve4=Resolver.prototype.resolve6=async()=>{dns++;throw Error('unexpected DNS')};
 try{
  assert.equal((await browserCapability()).available,true,'Real Chromium is required; this acceptance must not skip');
  const definition=validateDefinition({name:'Demo sample browser',type:'flow',network:'synthetic',url:origin+'/demo',timeoutMs:15000,flow:{intent:'Demo browser containment',steps:[{kind:'goto',url:origin+'/demo'},{kind:'click',target:{role:'button',name:'Check service'}},{kind:'expect',what:'text',value:'Demo service checked'}],outcomes:[{id:'checked',what:'text',value:'Demo service checked'}]}},[port]);
  const run=()=>executeTaskProbe({definition},'local-a',{grantPath,controlPort:0,flowWorkspace:workspace});
  const healthy=await run();assert.equal(healthy.outcome,'pass',JSON.stringify(healthy));
  for(scenario of ['redirect','subresource','websocket','tunnel','popup']){const result=await run();assert.notEqual(result.outcome,'pass',scenario+': '+JSON.stringify(result));assert.equal(recipientRequests,0,scenario+' must not contact recipient');}
  assert.equal(dns,0);assert.equal(recipientRequests,0);
 }finally{Resolver.prototype.resolve4=resolve4;Resolver.prototype.resolve6=resolve6;target.closeAllConnections();recipient.closeAllConnections();await Promise.all([new Promise(r=>target.close(r)),new Promise(r=>recipient.close(r))]);await rm(directory,{recursive:true,force:true});if(previous===undefined)delete process.env.RER_DEMO;else process.env.RER_DEMO=previous;delete process.env.UPTIME_DEMO_LOG;}
});
