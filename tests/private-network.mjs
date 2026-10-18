// PRIVATE-001 through the migrated emitted Worker and real signed runner.
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdir,writeFile,unlink,realpath,chmod,rename,symlink} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {testAuthBindings} from './auth-test-support.mjs';
import {availablePorts,migratedWorker,runtimeDirectory,cleanupDirectory,ownerAPI} from './notify-acceptance-runtime.mjs';
import {certificates,listen,close} from './protocol-fixtures.mjs';
const directory=await runtimeDirectory(),[port]=await availablePorts(1),origin=`http://127.0.0.1:${port}`;
let worker,web,tcp,canary,grants,runnerId,mode=200,requests=0,connections=0,forbiddenConnections=0,revokeFile;
try{
 const certs=await certificates(directory);canary=https.createServer(certs.web,(_,res)=>{res.writeHead(200);res.end()});const canaryPort=await listen(canary);
 web=http.createServer(async(req,res)=>{
  requests++;if(req.headers.host!=='checkout.internal.test:8080'){forbiddenConnections++;res.writeHead(403);res.end();return}
  if(req.url==='/blocked-redirect'){res.writeHead(302,{location:'http://neighbor.internal.test:8080/admin'});res.end();return}
  if(req.url==='/revoke-between-requests'){await unlink(revokeFile);res.writeHead(302,{location:'/health'});res.end();return}
  res.writeHead(mode,{'content-type':'text/html'});res.end('<!doctype html><html><body><h1>Private checkout ready</h1>'+ (req.url==='/browser-neighbor'?'<img alt="forbidden neighbor" src="http://neighbor.internal.test:8080/admin">':'')+'</body></html>');
 });const httpPort=await listen(web);
 tcp=net.createServer(socket=>{connections++;socket.on('error',()=>{});socket.end('WAREHOUSE READY\r\n')});const tcpPort=await listen(tcp);
 ({worker}=await migratedWorker({port,persist:join(directory,'worker')}));
 await mkdir(join(directory,'grants'),{mode:0o700});grants=await realpath(join(directory,'grants'));
 const {api,signIn}=ownerAPI(origin);await signIn();
 const post=async(path,data,method='POST')=>{const r=await api(path,method,data,{origin});assert.ok(r.status>=200&&r.status<300,`${path}: ${JSON.stringify(r.data)}`);return r.data};
 const run=async extra=>{
  const child=spawn(process.execPath,['--import',resolve('tests/private-network-routing.mjs'),'--input-type=module','-e',"import {runRunner} from './runners/src/private-runner.mjs';await runRunner({origin:process.env.UPTIME_CONTROL_ORIGIN,key:process.env.UPTIME_RUNNER_KEY,localReview:true,once:true});"],{env:{...process.env,UPTIME_CONTROL_ORIGIN:origin,UPTIME_RUNNER_KEY:testAuthBindings.UPTIME_RUNNER_KEY,UPTIME_PRIVATE_GRANT_DIR:grants,PRIVATE_HTTP_PORT:String(httpPort),PRIVATE_TCP_PORT:String(tcpPort),PROTOCOL_HTTPS_PORT:String(canaryPort),NODE_EXTRA_CA_CERTS:certs.caPath,...extra},stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);const timer=setTimeout(()=>child.kill('SIGKILL'),35000);try{assert.equal((await once(child,'exit'))[0],0,output.slice(0,1800))}finally{clearTimeout(timer)}
 };
 await run();const runners=(await api('/api/runners')).data;runnerId=runners.find(r=>!r.hosted).runnerId;assert.equal(runners[0].capabilities.privateNetwork,true);assert.ok(runners[0].capabilities.capacity>0);assert.ok(runners[0].capabilities.version);
 const base={network:'private',privateGrantRef:'warehouse',url:'http://checkout.internal.test:8080/health?code=ready',assignments:{'local-a':runnerId},canaryUrl:'https://canary.protocol.test/ok',intervalMs:5000,retries:0,confirmSlots:1,recoverSlots:1};
 const create=async extra=>post('/api/monitors',{name:'US warehouse checkout',...base,...extra});
 const permission=m=>({runnerId,monitorId:m.id,hosts:['checkout.internal.test'],cidrs:['10.24.3.10/32'],ports:[8080,5432],expiresAt:Date.now()+600000});
 const grant=async(m,changes={},options={})=>{const path=join(grants,'warehouse.json');await writeFile(path,JSON.stringify({...permission(m),...changes}),{mode:0o600,...options});return path};
 const step=async(m,extra)=>{const current=(await api(`/api/overview?monitor=${m.id}`)).data.monitors[0],delay=current.nextDue-Date.now()+20;if(delay>0)await new Promise(r=>setTimeout(r,delay));await run(extra);const history=(await api(`/api/monitors/${m.id}/history`)).data;const slot=history.find(s=>!s.manual);assert.equal(slot.status,'complete');assert.equal(slot.observations[0].canary.outcome,'pass',JSON.stringify(slot.observations[0].canary));return slot.observations[0]};
 const pause=async m=>post(`/api/monitors/${m.id}`,{...m.definition,enabled:false},'PATCH');
 for(const bad of [{url:'http://169.254.169.254/latest/meta-data/'},{url:'http://127.0.0.1:8080/'},{url:'http://metadata.google.internal/'},{url:'http://checkout.internal.test:2375/'},{privateGrantRef:undefined},{network:'public',privateGrantRef:'warehouse'}])assert.equal((await api('/api/monitors','POST',{name:'Refused private target',...base,...bad},{origin})).status,400);
 let m=await create({});let o=await step(m);assert.equal(o.outcome,'runner_error');assert.equal(o.checks[0].assertion,'grant');assert.equal(requests,0);
 await grant(m);o=await step(m);assert.equal(o.outcome,'pass');assert.equal((await api(`/api/overview?monitor=${m.id}`)).data.monitors[0].state.targetState,'Healthy');
 mode=503;o=await step(m);assert.equal(o.outcome,'target_failure');assert.equal((await api(`/api/overview?monitor=${m.id}`)).data.monitors[0].state.targetState,'Failing',JSON.stringify(o));mode=200;o=await step(m);assert.equal(o.outcome,'pass');await pause(m);const sourceHTTP=m;
 for(const [name,changes,edge] of [['neighbor CIDR',{cidrs:['10.24.3.11/32']}],['foreign runner',{runnerId:'self-11111111-1111-4111-8111-111111111111'}],['foreign monitor',{monitorId:'another-monitor'}],['expired',{expiresAt:Date.now()-1}],['ungranted port',{ports:[8081]}],['mixed DNS',{}, {PRIVATE_DNS_MODE:'mixed'}],['metadata DNS',{}, {PRIVATE_DNS_MODE:'metadata'}]]){
  m=await create({name:`Private refusal: ${name}`});await grant(m,changes);const before=requests;o=await step(m,edge);assert.equal(o.outcome,'runner_error',name);assert.equal(o.checks[0].assertion,'grant',name);assert.equal(requests,before,name);await pause(m);
 }
 m=await create({name:'Unprotected local grant'});const grantFile=await grant(m);await chmod(grantFile,0o644);let deniedBefore=requests;o=await step(m);assert.equal(o.outcome,'runner_error');assert.equal(requests,deniedBefore);await chmod(grantFile,0o600);await pause(m);
 m=await create({name:'Symlink local grant'});await grant(m);const moved=join(grants,'original.json');await rename(grantFile,moved);await symlink(moved,grantFile);deniedBefore=requests;o=await step(m);assert.equal(o.outcome,'runner_error');assert.equal(requests,deniedBefore);await unlink(grantFile);await rename(moved,grantFile);await pause(m);
 m=await create({name:'Private redirected neighbor',url:'http://checkout.internal.test:8080/blocked-redirect'});await grant(m);let before=requests;o=await step(m);assert.equal(o.outcome,'runner_error');assert.equal(requests-before,1,'no connection to redirect neighbor');await pause(m);
 m=await create({name:'Private grant retired mid-request',url:'http://checkout.internal.test:8080/revoke-between-requests'});revokeFile=await grant(m);before=requests;o=await step(m);assert.equal(o.outcome,'runner_error');assert.equal(requests-before,1,'every hop re-reads the local grant');await pause(m);
 m=await create({name:'Public scope cannot borrow private grants',network:'public',privateGrantRef:undefined});await grant(m);before=requests;o=await step(m);assert.equal(o.outcome,'runner_error');assert.equal(o.checks[0].assertion,'network');assert.equal(requests,before);await pause(m);
 m=await create({name:'Warehouse database',type:'tcp',url:undefined,tcp:{host:'checkout.internal.test',port:5432,bannerIncludes:'WAREHOUSE READY'}});await grant(m);o=await step(m);assert.equal(o.outcome,'pass');assert.equal(o.protocol.address,'10.24.3.10');assert.ok(connections>0);await pause(m);
 const flow={intent:'Confirm the warehouse order screen opens',steps:[{kind:'goto',url:'http://checkout.internal.test:8080/checkout'}],outcomes:[{id:'warehouse-ready',what:'text',value:'Private checkout ready'}]};
 m=await create({name:'Private warehouse browser',type:'flow',url:flow.steps[0].url,flow,intervalMs:300000,timeoutMs:20000});await grant(m);o=await step(m);assert.equal(o.outcome,'pass',JSON.stringify(o.checks));assert.equal(o.flow.outcomes[0].observed,true);await pause(m);
 m=await create({name:'Private browser neighbor refusal',type:'flow',url:'http://checkout.internal.test:8080/browser-neighbor',flow:{...flow,steps:[{kind:'goto',url:'http://checkout.internal.test:8080/browser-neighbor'}]},intervalMs:300000,timeoutMs:20000});await grant(m);o=await step(m);assert.equal(o.outcome,'runner_error');assert.equal(o.checks[0].assertion,'grant');assert.equal(forbiddenConnections,0);await pause(m);
 const exported=(await api('/api/definitions/export')).data;assert.ok(exported.monitors.some(d=>d.network==='private'&&d.privateGrantRef==='warehouse'));
 const archived=await api('/api/archive');assert.equal(archived.status,200,JSON.stringify(archived.data));assert.ok(!JSON.stringify(archived.data).includes('"cidrs"'),'grant authority never enters archives');
 m=await create({name:'Revoked private runner'});await grant(m);await post(`/api/runners/${runnerId}`,undefined,'DELETE');before=requests;assert.equal((await api('/api/runner/claim','POST',{}, {'x-runner-key':testAuthBindings.UPTIME_RUNNER_KEY})).status,401);assert.equal(requests,before);
 await grant(sourceHTTP);await worker.dispose();worker=null;({worker}=await migratedWorker({port,persist:join(directory,'receiving')}));await signIn();await post('/api/restore',archived.data);let restored=(await api('/api/overview')).data.monitors;assert.ok(restored.length);assert.ok(restored.every(m=>m.definition.enabled===false));assert.ok(restored.some(m=>m.definition.type==='tcp'&&m.definition.network==='private'));
 before=requests;await run();assert.equal(requests,before);const receivingRunner=(await api('/api/runners')).data.find(r=>!r.hosted).runnerId;const receivingMonitor=restored.find(m=>m.id===sourceHTTP.id);await post(`/api/monitors/${receivingMonitor.id}`,{...receivingMonitor.definition,enabled:true,assignments:{'local-a':receivingRunner}},'PATCH');await run();const imported=(await api(`/api/monitors/${receivingMonitor.id}/history`)).data.find(s=>!s.manual);assert.equal(imported.observations[0].outcome,'runner_error');assert.equal(imported.observations[0].checks[0].assertion,'grant');assert.equal(requests,before,'a restored reference gains no original-runner authority');assert.equal((await api('/api/archive')).status,200);
 console.log('PRIVATE-001 PASS: authenticated runner grants; real HTTP failure/recovery, TCP and isolated browser; private/public/metadata/neighbor/port/expiry/identity/redirect fences; local authority excluded from portable definitions and archives; runner revocation.');
}finally{await close(web);await close(tcp);await close(canary);await worker?.dispose();await cleanupDirectory(directory)}
