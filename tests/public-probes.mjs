import {test,before,after,mock} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import {Resolver} from 'node:dns/promises';
import {mkdtemp,writeFile,readFile,chmod,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {publicAddress,publicTarget} from '../src/domain/public-target.mjs';
import {validateDefinition} from '../src/domain/policy.mjs';
import {probeHttp} from '../runners/src/probes.mjs';
import {resolvePublic} from '../runners/src/public-http.mjs';
import {readCredentials} from '../runners/src/credentials.mjs';
import {executeTaskProbe} from '../runners/src/execute-task.mjs';
const dir=await mkdtemp(join(tmpdir(),'uptime-public-probes-'));
let servers=[],requests=[],pins=[],dns=[],httpOriginal=http.request,httpsOriginal=https.request,restoreEnv={};
let route=()=>({status:200,body:'{"ready":true,"word":"operational"}',headers:{'x-check':'yes'}});
const def=(extra={})=>validateDefinition({name:'Authorized synthetic protocol test',url:'https://public-a.test/health',network:'public',timeoutMs:1000,retries:0,...extra},[]);
async function run(extra={}){return probeHttp(def(extra),'local-a',[],{monitorId:'probe-monitor'})}
before(async()=>{
 const result=spawnSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(dir,'key.pem'),'-out',join(dir,'cert.pem'),'-days','1','-subj','/CN=public-a.test','-addext','subjectAltName=DNS:public-a.test,DNS:public-b.test'],{stdio:'ignore'});assert.equal(result.status,0);
 const key=await readFile(join(dir,'key.pem')),cert=await readFile(join(dir,'cert.pem'));
 const handler=(req,res)=>{let body='';req.on('data',b=>body+=b);req.on('end',()=>{requests.push({host:req.headers.host,headers:req.headers,method:req.method,body,path:req.url,sni:req.socket.servername});const response=route(req);if(response.hang)return;if(response.drip){res.writeHead(200);res.write('a');const timer=setInterval(()=>res.write('a'),10);res.on('close',()=>clearInterval(timer));return}res.writeHead(response.status,response.headers);res.end(response.body)})};
 servers=[http.createServer(handler),https.createServer({key,cert},handler)];await Promise.all(servers.map((server,i)=>new Promise(resolve=>server.listen(15512+i,'127.0.0.1',resolve))));
 mock.method(Resolver.prototype,'resolve4',async function(host){dns.push(host);return ['93.184.216.34']});
 mock.method(Resolver.prototype,'resolve6',async()=>[]);
 // Test-only socket routing: production options are checked before connecting to our fixture.
 for(const [transport,original,port] of [[http,httpOriginal,15512],[https,httpsOriginal,15513]])mock.method(transport,'request',function(options,callback){
   assert.equal(options.hostname,'93.184.216.34');assert.equal(options.lookup,undefined);if(options.protocol==='https:')assert.equal(options.rejectUnauthorized,true);assert.equal(options.headers.host,new URL(`${options.protocol}//${options.headers.host}`).host);
   pins.push({hostname:options.hostname,host:options.headers.host,servername:options.servername,agent:options.agent});
   return original.call(this,{...options,hostname:'127.0.0.1',port,ca:cert},callback);
 });
 for(const name of ['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NODE_USE_ENV_PROXY']){restoreEnv[name]=process.env[name];process.env[name]=name==='NODE_USE_ENV_PROXY'?'1':'http://127.0.0.1:1'}
 process.env.UPTIME_CREDENTIAL_DIR=dir;
});
after(async()=>{mock.restoreAll();for(const [name,value] of Object.entries(restoreEnv))if(value===undefined)delete process.env[name];else process.env[name]=value;delete process.env.UPTIME_CREDENTIAL_DIR;for(const server of servers){server.closeAllConnections();await new Promise(r=>server.close(r))}await rm(dir,{recursive:true,force:true})});
test('SSRF blocks all special IPv4 ranges and encoded literals, mapped/transition IPv6 and metadata',()=>{
 for(const value of ['0.0.0.0','0','10.1.2.3','100.64.0.1','100.100.100.200','127.0.0.1','127.1','2130706433','0x7f000001','0177.0.0.1','127.0.0.1.','169.254.169.254','168.63.129.16','172.16.0.1','172.31.255.255','192.0.0.9','192.0.2.1','192.31.196.1','192.52.193.1','192.88.99.1','192.168.0.1','192.175.48.1','198.18.0.1','198.19.255.255','198.51.100.1','203.0.113.1','224.0.0.1','240.0.0.1','255.255.255.255','::','::1','::ffff:127.0.0.1','::ffff:8.8.8.8','::8.8.8.8','64:ff9b::808:808','64:ff9b:1::1','100::1','2001::1','2001:20::1','2001:db8::1','2002:0808:0808::1','3ffe::1','3fff::1','fc00::1','fd00:ec2::254','fe80::1','ff02::1','2001:4860::5efe:7f00:1','2001:4860::200:5efe:a00:1','2620:4f:8000::1'])assert.equal(publicAddress(value),false,value);
 for(const value of ['8.8.8.8','1.1.1.1','93.184.216.34','2606:4700:4700::1111','2001:4860:4860::8888'])assert.equal(publicAddress(value),true,value);
 for(const url of ['http://%31%32%37.0.0.1/','http://0x7f.1/','http://user:pass@public-a.test/','file:///etc/passwd','https://[fe80::1%25en0]/','http://public-a.test\\@127.0.0.1/'])assert.throws(()=>publicTarget(url));
});
test('definition types and request references validate without retaining plaintext settings',()=>{
 for(const type of ['dns','ping','tcp','domain-expiry','browser','unknown'])assert.throws(()=>def({type}),/Unsupported/);
 assert.throws(()=>def({type:'keyword'}),/Keyword/);assert.equal(def({type:'keyword',assertions:{bodyIncludes:'word'}}).type,'keyword');
 for(const request of [{headers:{authorization:'secret'}},{body:'secret'},{credentialRef:'../escape'},{credentialRef:'a',auth:'secret'}])assert.throws(()=>def({request}));
 assert.throws(()=>def({headers:{a:'b'}}));assert.throws(()=>def({network:'synthetic'}));
 assert.equal(def({method:'POST',request:{credentialRef:'request-a'}}).request.credentialRef,'request-a');
});
test('A/AAAA resolution fails closed on unsafe answers and resolver errors, and reports names that do not resolve',async()=>{
 const v4=Resolver.prototype.resolve4,v6=Resolver.prototype.resolve6;
 try{Resolver.prototype.resolve4=async()=>['8.8.8.8','127.0.0.1'];await assert.rejects(resolvePublic(publicTarget('http://public-a.test/'),AbortSignal.timeout(1000)),/network/);
 Resolver.prototype.resolve4=async()=>['8.8.8.8'];Resolver.prototype.resolve6=async()=>['::ffff:8.8.8.8'];await assert.rejects(resolvePublic(publicTarget('http://public-a.test/'),AbortSignal.timeout(1000)),/network/);
 Resolver.prototype.resolve6=async()=>{throw Object.assign(Error(),{code:'ESERVFAIL'})};await assert.rejects(resolvePublic(publicTarget('http://public-a.test/'),AbortSignal.timeout(1000)),/dns/);
 // A name with no address is the target's outage (Failing), not the runner's (Unknown).
 Resolver.prototype.resolve6=async()=>[];Resolver.prototype.resolve4=async()=>[];await assert.rejects(resolvePublic(publicTarget('http://public-a.test/'),AbortSignal.timeout(1000)),error=>error.category==='unresolved'&&/no A or AAAA/.test(error.reason));
 Resolver.prototype.resolve6=Resolver.prototype.resolve4=async()=>{throw Object.assign(Error(),{code:'ENOTFOUND'})};await assert.rejects(resolvePublic(publicTarget('http://public-a.test/'),AbortSignal.timeout(1000)),error=>error.category==='unresolved'&&/NXDOMAIN/.test(error.reason));
 }finally{Resolver.prototype.resolve4=v4;Resolver.prototype.resolve6=v6}
});
test('actual HTTP/HTTPS sockets use validated pin, original Host and verified SNI despite proxy env',async()=>{
 route=()=>({status:200,headers:{'x-check':'yes'},body:'{"ready":true,"word":"operational"}'});
 const start=dns.length;
 for(const protocol of ['http','https']){const evidence=await run({url:`${protocol}://public-a.test/health`,type:'keyword',assertions:{status:200,bodyIncludes:'operational',header:{name:'x-check',equals:'yes'},json:{path:'ready',equals:true},latencyMs:1000}});assert.equal(evidence.outcome,'pass');assert.deepEqual(evidence.checks.map(c=>c.assertion),['status','body','header','json','latency']);assert.equal(evidence.body,undefined)}
 assert.equal(dns.length-start,2);assert.equal(requests.at(-1).host,'public-a.test');assert.equal(requests.at(-1).sni,'public-a.test');assert.equal(pins.at(-1).hostname,'93.184.216.34');
 const evidence=await run({url:'https://not-in-certificate.test/health'});assert.equal(evidence.outcome,'target_failure');assert.equal(evidence.checks[0].assertion,'connection');
});
test('credential files enforce owner-only scope, header/body/auth and origin binding',async()=>{
 await writeFile(join(dir,'request-a.json'),JSON.stringify({monitorId:'probe-monitor',origin:'https://public-a.test',headers:{'x-secret':'private-header','content-type':'application/json'},body:'private-body',auth:{type:'bearer',token:'private-token'}}),{mode:0o600});
 const settings=await readCredentials('request-a','https://public-a.test/health','POST',dir,'probe-monitor');assert.equal(settings.headers.authorization,'Bearer private-token');
 await assert.rejects(readCredentials('request-a','https://public-b.test/health','POST',dir,'probe-monitor'));await assert.rejects(readCredentials('request-a','https://public-a.test/health','GET',dir,'probe-monitor'));
 await chmod(join(dir,'request-a.json'),0o644);await assert.rejects(readCredentials('request-a','https://public-a.test/health','POST',dir,'probe-monitor'));await chmod(join(dir,'request-a.json'),0o600);
 await symlink(join(dir,'request-a.json'),join(dir,'linked.json'));await assert.rejects(readCredentials('linked','https://public-a.test/health','POST',dir,'probe-monitor'));
 for(const header of ['Host','Content-Length','Transfer-Encoding','Proxy-Authorization','Connection']){await writeFile(join(dir,'bad.json'),JSON.stringify({monitorId:'probe-monitor',origin:'https://public-a.test',headers:{[header]:'value'}}),{mode:0o600});await assert.rejects(readCredentials('bad','https://public-a.test/health','POST',dir,'probe-monitor'))}
 route=()=>({status:200,body:'operational'});const evidence=await run({method:'POST',request:{credentialRef:'request-a'}});assert.equal(evidence.outcome,'pass');assert.equal(requests.at(-1).body,'private-body');assert.equal(requests.at(-1).headers['x-secret'],'private-header');assert.equal(requests.at(-1).headers.authorization,'Bearer private-token');assert.doesNotMatch(JSON.stringify(evidence),/private-header|private-body|private-token/);
});
test('redirects re-resolve every hop; cross-origin headers/auth/body are discarded permanently',async()=>{
 requests=[];const start=dns.length;
 route=req=>req.url==='/health'?{status:307,headers:{location:'https://public-b.test/second'}}:req.url==='/second'?{status:307,headers:{location:'https://public-a.test/final'}}:{status:200,body:'okay'};
 const evidence=await run({method:'POST',request:{credentialRef:'request-a'}});assert.equal(evidence.outcome,'pass');assert.equal(dns.length-start,3);assert.equal(requests[0].body,'private-body');
 for(const req of requests.slice(1)){assert.equal(req.method,'GET');assert.equal(req.body,'');assert.equal(req.headers.authorization,undefined);assert.equal(req.headers['x-secret'],undefined)}
});
test('redirects block private/mapped literals, mixed DNS, HTTPS downgrade, absent location and hop overflow',async()=>{
 for(const location of ['http://public-b.test/health','https://127.0.0.1/health','https://[::ffff:7f00:1]/health','https://168.63.129.16/health','https://user:secret@public-b.test/health']){requests=[];route=()=>({status:302,headers:{location}});assert.notEqual((await run()).outcome,'pass');assert.equal(requests.length,1)}
 requests=[];route=()=>({status:302,headers:{location:'/again'}});assert.equal((await run()).checks[0].assertion,'redirect');assert.equal(requests.length,6);
 route=()=>({status:302});assert.equal((await run()).checks[0].assertion,'redirect');
 const original=Resolver.prototype.resolve4;let count=0;Resolver.prototype.resolve4=async()=>++count===1?['93.184.216.34']:['169.254.169.254'];try{requests=[];route=()=>({status:302,headers:{location:'/again'}});assert.equal((await run()).checks[0].assertion,'network');assert.equal(requests.length,1)}finally{Resolver.prototype.resolve4=original}
});
test('total timeout bounds DNS, redirects, response body and slow streams; body limit and encoding fail',async()=>{
 const original=Resolver.prototype.resolve4;Resolver.prototype.resolve4=()=>new Promise(()=>{});let started=Date.now();try{const result=await run({timeoutMs:50});assert.equal(result.checks[0].assertion,'timeout');assert.ok(Date.now()-started<1000)}finally{Resolver.prototype.resolve4=original}
 for(const response of [{hang:true},{drip:true}]){route=()=>response;started=Date.now();assert.equal((await run({timeoutMs:80})).checks[0].assertion,'timeout');assert.ok(Date.now()-started<1000)}
 route=()=>({status:200,body:'x'.repeat(65537)});assert.equal((await run()).checks[0].assertion,'body-limit');
 route=()=>({status:200,body:'encoded',headers:{'content-encoding':'gzip'}});assert.equal((await run()).checks[0].assertion,'encoding');
 route=()=>({status:200,body:'wrong'});assert.equal((await run({type:'keyword',assertions:{bodyIncludes:'required'}})).outcome,'target_failure');
});
test('synthetic runner still requires a live owner-only custody grant and fixture identity',async()=>{
 const definition=validateDefinition({name:'fixture',url:'http://127.0.0.1:15512/health'},[15512]);
 await assert.rejects(executeTaskProbe({definition},'local-a',{grantPath:join(dir,'absent'),controlPort:15514}));
 const evidence=await probeHttp(definition,'local-a',[15512]);assert.equal(evidence.outcome,'runner_error');assert.equal(evidence.checks[0].assertion,'custody');
});
