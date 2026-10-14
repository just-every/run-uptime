import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import {Resolver} from 'node:dns/promises';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startSynthetic} from '../runners/src/synthetic-server.mjs';
import {executeTaskProbe} from '../runners/src/execute-task.mjs';
import {publicReport} from '../runners/src/public-http.mjs';
import {createWatch} from '../runners/src/watch.mjs';
import {dispatchNotifications} from '../runners/src/notification-dispatch.mjs';
import {startFlowProxy} from '../runners/src/flow/proxy.mjs';
import {readGrant} from '../runners/src/grants.mjs';
import {validateDefinition} from '../src/domain/policy.mjs';

// Tests own every listener and grant. DNS is the network edge; any attempted lookup fails the assertion.
test('demo runner executes its fixture and refuses probes, discovery, watches and notifications before network work',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'uptime-demo-')),grantPath=join(directory,'grant.json');
 const previous=process.env.RER_DEMO;process.env.RER_DEMO='1';
 process.env.UPTIME_DEMO_LOG=join(directory,'blocked.jsonl');
 const target=await startSynthetic({grantPath,port:0});
 let dns=0,recipientRequests=0;
 const recipient=http.createServer((_req,res)=>{recipientRequests++;res.end('recipient')});await new Promise(r=>recipient.listen(0,'127.0.0.1',r));
 const resolve4=Resolver.prototype.resolve4,resolve6=Resolver.prototype.resolve6;
 Resolver.prototype.resolve4=Resolver.prototype.resolve6=async()=>{dns++;throw Error('unexpected DNS')};
 try{
  const origin=`http://127.0.0.1:${target.port}`,probe=async input=>executeTaskProbe({definition:input},'local-a',{grantPath,controlPort:0});
  for(const input of [{name:'HTTP demo sample',url:origin+'/health'},{name:'Keyword demo sample',url:origin+'/api/status',type:'keyword',assertions:{status:200,bodyIncludes:'healthy'}}])assert.equal((await probe(validateDefinition({...input,network:'synthetic'},[target.port]))).outcome,'pass');
  const redirect=await probe({name:'Redirect sample',url:origin+'/redirect',network:'synthetic'});assert.notEqual(redirect.outcome,'pass');
  for(const url of ['https://example.com/',`http://127.0.0.1:${recipient.address().port}/health`,origin+'/control',origin+'/health?redirect=yes']){
   const evidence=await probe({name:'Forbidden',url,network:url.startsWith(origin)||url.includes('127.0.0.1')?'synthetic':'public'});assert.equal(evidence.outcome,'runner_error');assert.match(evidence.checks[0].reason,/Demo/);
  }
  await assert.rejects(publicReport('https://example.com/',{maxBody:4096,userAgent:'demo-test'}),/Demo blocked/);
  let watchSends=0,now=0;const watch=createWatch({url:'https://example.com/watch',afterMs:1,now:()=>now,transport:{async send(){watchSends++;return {status:200}}}});await watch.failed();now=2;await watch.failed();assert.equal(watchSends,0);
  let deliveries=0,finished;
  const job={id:'demo-job',credential:{endpoint:'https://example.com/hook'}};
  const api=async(_path,input)=>{switch(input.operation){case 'poll':return {jobs:[job],serverNow:Date.now()};case 'claim':return 'claim';case 'get':return {state:'sending',claim:'claim',claimUntil:Date.now()+60000};case 'finish':finished=input.outcome;return true;default:throw Error(input.operation)}};
  await dispatchNotifications(api,{async send(){deliveries++;throw Error('must not send')}});assert.equal(deliveries,0);assert.deepEqual(finished,{kind:'rejected',code:'demo_blocked'});
  assert.equal(dns,0);assert.equal(recipientRequests,0);assert.match(await readFile(process.env.UPTIME_DEMO_LOG,'utf8'),/example.com/);
 }finally{Resolver.prototype.resolve4=resolve4;Resolver.prototype.resolve6=resolve6;await target.close();await new Promise(r=>recipient.close(r));await rm(directory,{recursive:true,force:true});if(previous===undefined)delete process.env.RER_DEMO;else process.env.RER_DEMO=previous;delete process.env.UPTIME_DEMO_LOG;}
});

test('demo browser proxy confines every request, CONNECT and WebSocket to custody, before DNS',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'uptime-demo-proxy-')),grantPath=join(directory,'grant.json');
 const previous=process.env.RER_DEMO;process.env.RER_DEMO='1';
 const target=await startSynthetic({grantPath,port:0}),grant=await readGrant(grantPath,0);let dns=0;
 const proxy=await startFlowProxy({grant,maxBytes:100000,resolver:{async resolve4(){dns++;throw Error('DNS forbidden')},async resolve6(){dns++;throw Error('DNS forbidden')}}});
 const auth='Basic '+Buffer.from(proxy.username+':'+proxy.password).toString('base64');
 const request=(url,method='GET')=>new Promise((resolve,reject)=>{const q=http.request({host:'127.0.0.1',port:proxy.port,path:url,method,headers:{'proxy-authorization':auth}},r=>{r.resume();r.on('end',()=>resolve(r.statusCode))});q.on('error',reject);q.end()});
 const tunnel=async(method,destination,extra='')=>new Promise((resolve,reject)=>{let output='';const s=net.connect(proxy.port,'127.0.0.1',()=>s.write(`${method} ${destination} HTTP/1.1\r\nHost: ${destination}\r\nProxy-Authorization: ${auth}\r\n${extra}\r\n`));s.on('data',c=>{output+=c;if(output.includes('\r\n')){s.destroy();resolve(output.split('\r\n')[0])}});s.on('error',reject)});
 try{
  assert.equal(await request(`http://127.0.0.1:${target.port}/demo`),200);
  for(const url of ['http://example.com/',`http://127.0.0.1:${target.port}/control`,`http://127.0.0.1:${target.port}/health?x=1`,'http://127.0.0.1:1/health'])assert.equal(await request(url),403);
  assert.equal(await request(`http://127.0.0.1:${target.port}/health`,'POST'),403);
  assert.match(await tunnel('CONNECT','example.com:443'),/403/);
  assert.match(await tunnel('CONNECT',`127.0.0.1:${target.port}`),/403/);
  assert.match(await tunnel('GET',`http://127.0.0.1:${target.port}/demo`,'Connection: Upgrade\r\nUpgrade: websocket\r\n'),/403/);
  assert.equal(dns,0);assert.ok(proxy.stats().blocked.some(row=>row.violation));
 }finally{await proxy.close();await target.close();await rm(directory,{recursive:true,force:true});if(previous===undefined)delete process.env.RER_DEMO;else process.env.RER_DEMO=previous;}
});
