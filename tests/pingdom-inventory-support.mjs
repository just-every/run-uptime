import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {definitionDoor} from './auth-test-support.mjs';
import {mailEdges} from './mail-edges.mjs';

// Inventory shape only: these are synthetic targets, never the trial's targets.
export const pingdomInventory=()=>Array.from({length:12},(_,i)=>({check:{
 id:11034001+i,name:`Inventory check ${i+1}`,hostname:i<8?'tls.protocol.test':i===8?'tcp.protocol.test':i===9?'canary.protocol.test':i===10?'ping.protocol.test':'shop.protocol.test',
 resolution:[0,1,2,10].includes(i)?1:5,status:i===7?'paused':'up',sendnotificationwhendown:2,notifyagainevery:0,notifywhenbackup:true,
 ...(i<8?{responsetime_threshold:i===1?5000:30000}:{}),
 type:i<8?{http:{encryption:true,verify_certificate:true,url:`/inventory/${i+1}`,port:443,shouldcontain:'ready',ssl_down_days_before:i===2?30:7,...(i===7?{postdata:'synthetic=ready',requestheaders:{'content-type':'application/x-www-form-urlencoded','x-inventory':'synthetic'}}:{})}}:
 i===8?{tcp:{port:6432}}:i===9?{smtp:{port:587,encryption:true}}:i===10?{ping:{}}:{dns:{nameserver:'ns1.protocol.test',expectedip:'192.0.2.10'}},
}}));

export async function provePingdomInventory({api,origin,certs,scenario,registration,directory,webPort,tcpPort,tlsPort,dnsPort,key}){
 const fetcher=async(url,init)=>{const {cookie,...headers}=init.headers;const path=new URL(url);const response=await api(path.pathname+path.search,init.body===undefined?undefined:JSON.parse(init.body),headers,init.method);return {status:response.status,json:async()=>response.data}};
 const door=definitionDoor({origin,cookie:'',fetcher}),source=pingdomInventory(),plan=await door.preview(source,'pingdom');
 assert.equal(plan.status,200,JSON.stringify(plan.body));assert.equal(plan.body.entries.length,20,'twelve checks and eight explicit certificate companions');
 assert.equal(plan.body.counts.create,20,JSON.stringify(plan.body.entries));
 const applied=await door.apply(plan.body);assert.equal(applied.status,200,JSON.stringify(applied.body));
 const monitors=(await api('/api/overview')).data.monitors.filter(m=>m.definition.name.startsWith('Inventory check '));
 assert.equal(monitors.length,20);assert.ok(monitors.every(m=>!m.definition.enabled));
 for(const m of monitors)assert.deepEqual((await api(`/api/monitors/${m.id}/history`)).data,[],'import never fabricates a run');
 const byName=name=>monitors.find(m=>m.definition.name===name);
 for(let i=0;i<12;i++){
  const d=byName(`Inventory check ${i+1}`).definition,c=source[i].check;
  assert.equal(d.intervalMs,c.resolution*60000);assert.ok(d.url.includes(c.hostname));
  assert.equal(d.type,i<8?'keyword':i===8?'tcp':i===9?'mail':i===10?'ping':'dns');
 }
 assert.equal(byName('Inventory check 9').definition.tcp.port,6432);
 assert.equal(byName('Inventory check 10').definition.mail.security,'starttls');
 assert.equal(byName('Inventory check 10').definition.mail.port,587);
 assert.equal(byName('Inventory check 12').definition.dns.nameserver,'ns1.protocol.test');
 assert.deepEqual(byName('Inventory check 12').definition.dns.expect.values,['192.0.2.10']);
 const post=byName('Inventory check 8'),credentials=join(directory,'inventory-credentials');await mkdir(credentials,{mode:0o700});
 assert.equal(post.definition.method,'POST');assert.equal(post.definition.request.credentialRef,'pingdom-11034008');
 // Rebind through the existing protected, origin- and monitor-bound credential door.
 await writeFile(join(credentials,'pingdom-11034008.json'),JSON.stringify({monitorId:post.id,origin:'https://tls.protocol.test',headers:source[7].check.type.http.requestheaders,body:source[7].check.type.http.postdata}),{mode:0o600});
 const edge=await mailEdges(certs.web);
 try{
  scenario.certificate=certs.expiring;scenario.dns={cloudflare:{status:'answer',answers:['192.0.2.99']},google:{status:'answer',answers:['192.0.2.99']},authoritative:{status:'answer',answers:['192.0.2.10']}};
  for(const m of monitors){
   const d=m.definition;
   const saved=await api(`/api/monitors/${m.id}`,{...d,enabled:true,assignments:{'local-a':registration.runnerId},canaryUrl:'https://canary.protocol.test/ok'},{},'PATCH');assert.equal(saved.status,200,JSON.stringify(saved.data));
   const child=spawn(process.execPath,['--import',resolve('tests/ping-routing.mjs'),resolve('tests/signed-runner-child.mjs')],{env:{...process.env,UPTIME_CONTROL_ORIGIN:origin,UPTIME_RUNNER_KEY:key,NODE_EXTRA_CA_CERTS:certs.caPath,UPTIME_CREDENTIAL_DIR:credentials,PROTOCOL_HTTPS_PORT:String(webPort),PROTOCOL_TCP_PORT:String(tcpPort),PROTOCOL_TLS_PORT:String(tlsPort),PROTOCOL_DNS_PORT:String(dnsPort),PROTOCOL_SMTP_PORT:String(edge.ports.smtp),...(process.env.UPTIME_PINGDOM_NATIVE==='1'?{PING_MODE:'native'}:{})},stdio:['ignore','pipe','pipe']});
   let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);const timer=setTimeout(()=>child.kill('SIGKILL'),40000);
   try{assert.equal((await once(child,'exit'))[0],0,output.slice(-1000))}finally{clearTimeout(timer)}
   const history=(await api(`/api/monitors/${m.id}/history`)).data,observation=history[0]?.observations[0];assert.ok(observation,JSON.stringify(history));assert.equal(history[0].manual,0);
   assert.equal(observation.outcome,d.type==='tls'&&d.tls.failBeforeDays===30?'target_failure':'pass',JSON.stringify(observation));
   if(d.type==='tls')assert.equal(observation.checks.find(c=>c.assertion==='expiry-window').pass,d.tls.failBeforeDays===7);
   if(d.type==='dns'){assert.deepEqual(observation.protocol.resolvers.map(r=>r.id),['nameserver']);assert.equal(observation.protocol.resolvers[0].server,'ns1.protocol.test 93.184.216.34');assert.deepEqual(observation.protocol.resolvers[0].answers,['192.0.2.10'])}
   if(d.type==='ping'){assert.equal(observation.protocol.transmitted,3);assert.equal(observation.protocol.received,3);assert.equal(observation.checks[0].assertion,'reachability')}
   if(d.type==='mail')assert.ok(observation.checks.some(c=>c.assertion==='tls'&&c.pass));
   const paused=await api(`/api/monitors/${m.id}`,{...saved.data.definition,enabled:false},{},'PATCH');assert.equal(paused.status,200);
   assert.equal((await api(`/api/overview?monitor=${m.id}`)).data.monitors[0].state.state,'Paused');
  }
  const request=scenario.httpRequests.find(r=>r.url==='/inventory/8');assert.equal(request.method,'POST');assert.equal(request.body,'synthetic=ready');assert.equal(request.headers['x-inventory'],'synthetic');assert.equal(request.headers['content-type'],'application/x-www-form-urlencoded');
  assert.equal(edge.state.accepted.length,0,'SMTP probe never sends a message');assert.ok(edge.state.commands.includes('STARTTLS'));
  const first=byName('Inventory check 1'),current=(await api(`/api/overview?monitor=${first.id}`)).data.monitors[0];assert.equal((await api(`/api/monitors/${first.id}`,{...current.definition,enabled:true},{},'PATCH')).status,200);
  source[0].check.tags=[{name:'reviewed-catchup'}];
  const again=await door.preview(source,'pingdom');assert.equal(again.status,200);assert.equal(again.body.counts.create,0);assert.equal((await door.apply(again.body)).status,200);
  const retained=(await api('/api/overview')).data.monitors.filter(m=>m.definition.name.startsWith('Inventory check '));assert.equal(retained.find(m=>m.id===first.id).definition.enabled,true,'catch-up preserves a locally resumed check');assert.ok(retained.filter(m=>m.id!==first.id).every(m=>!m.definition.enabled),'catch-up preserves local pauses, including the source-paused POST');assert.deepEqual(retained.map(m=>m.id).sort(),monitors.map(m=>m.id).sort());
  const resumed=retained.find(m=>m.id===first.id);assert.equal((await api(`/api/monitors/${first.id}`,{...resumed.definition,enabled:false},{},'PATCH')).status,200);
  console.log('PINGDOM-INVENTORY PASS: 12 source settings, 8 certificate companions, paused import/re-import, exact intervals/targets, signed scheduled HTTP/POST/body/headers/TCP/STARTTLS/ICMP/named-DNS execution and 7/30-day failure windows.');
 }finally{await edge.close()}
}
