import assert from 'node:assert/strict';
import https from 'node:https';
import tls from 'node:tls';
import {Resolver} from 'node:dns/promises';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {fixture} from './resilience/support.mjs';
import {executeTaskProbe} from '../runners/src/execute-task.mjs';
const exec=promisify(execFile);
export function socketEdge(port,ca){
 const connect=tls.connect,request=https.request,v4=Resolver.prototype.resolve4,v6=Resolver.prototype.resolve6;
 Resolver.prototype.resolve4=async()=>['93.184.216.45'];Resolver.prototype.resolve6=async()=>[];
 tls.connect=function(options,...args){if(options?.host==='93.184.216.45')return connect.call(this,{...options,host:'127.0.0.1',port,...(['auth.example.test','token.example.test'].includes(options.servername)?{ca}:{})},...args);return connect.call(this,options,...args)};
 https.request=function(options,...args){if(options?.hostname==='93.184.216.45')return request.call(this,{...options,hostname:'127.0.0.1',port,...(['auth.example.test','token.example.test'].includes(options.servername)?{ca}:{})},...args);return request.call(this,options,...args)};
 return ()=>{tls.connect=connect;https.request=request;Resolver.prototype.resolve4=v4;Resolver.prototype.resolve6=v6};
}
export async function certificates(directory){
 const command=(...args)=>exec('openssl',args,{cwd:directory});
 await command('req','-x509','-newkey','rsa:2048','-nodes','-keyout','ca.key','-out','ca.pem','-days','2','-subj','/CN=Uptime network-edge CA','-addext','basicConstraints=critical,CA:TRUE');
 await writeFile(join(directory,'server.ext'),'subjectAltName=DNS:legacy.example.test,DNS:other.example.test,DNS:auth.example.test,DNS:token.example.test\nextendedKeyUsage=serverAuth\n');
 await writeFile(join(directory,'client.ext'),'extendedKeyUsage=clientAuth\n');
 const result={ca:await readFile(join(directory,'ca.pem'),'utf8')};
 for(const [name,kind] of [['server','server'],['rotated','server'],['client','client'],['client2','client']]){
  await command('req','-new','-newkey','rsa:2048','-nodes','-keyout',name+'.key','-out',name+'.csr','-subj','/CN='+name);
  await command('x509','-req','-in',name+'.csr','-CA','ca.pem','-CAkey','ca.key','-CAcreateserial','-out',name+'.pem','-days','1','-extfile',kind+'.ext');
  result[name]={key:await readFile(join(directory,name+'.key'),'utf8'),cert:await readFile(join(directory,name+'.pem'),'utf8')};
 }
 await command('req','-x509','-newkey','rsa:2048','-nodes','-keyout','self-signed.key','-out','self-signed.pem','-days','1','-subj','/CN=legacy.example.test','-addext','subjectAltName=DNS:legacy.example.test');
 result.selfSigned={key:await readFile(join(directory,'self-signed.key'),'utf8'),cert:await readFile(join(directory,'self-signed.pem'),'utf8')};
 const {X509Certificate}=await import('node:crypto');result.fingerprint=createHash('sha256').update(new X509Certificate(result.server.cert).raw).digest('hex');result.selfSignedFingerprint=createHash('sha256').update(new X509Certificate(result.selfSigned.cert).raw).digest('hex');return result;
}
export async function authFixture(handler){
 const directory=await mkdtemp(join(tmpdir(),'uptime-tls-auth-')),previous=process.env.UPTIME_CREDENTIAL_DIR,records=[];let f,server,restore;
 try{
  const certs=await certificates(directory);
  server=https.createServer({...certs.server,ca:certs.ca,requestCert:true,rejectUnauthorized:false},(req,res)=>{let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{const record={host:req.headers.host,method:req.method,url:req.url,headers:req.headers,body,client:req.socket.getPeerCertificate()?.subject?.CN,authorized:req.socket.authorized};records.push(record);handler(record,res)})});
  server.on('tlsClientError',()=>{});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;
  f=await fixture();restore=socketEdge(port,certs.ca);process.env.UPTIME_CREDENTIAL_DIR=directory;
  const url=(path='/health',host='legacy.example.test')=>`https://${host}:${port}${path}`;
  const create=async(options={})=>f.monitor({runners:[f.first],canary:true,url:url(),intervalMs:86400000,timeoutMs:10000,...options});
  const claim=async id=>{const task=await f.claim(f.first);assert.equal(task?.monitorId,id);return task};
  const manual=async id=>{assert.equal((await f.request(`/api/monitors/${id}/run`,{body:{}})).status,200);return claim(id)};
  const run=task=>executeTaskProbe(task,task.probes[0],{controlPort:Number(new URL(f.origin).port)});
  const canary=async task=>{const probe=task.probes[0],canaryUrl=task.definition.assignments[probe].canaryUrl;return {...await executeTaskProbe({...task,definition:{...task.definition,type:'http',api:undefined,mail:undefined,url:canaryUrl,tlsTrust:undefined,request:undefined,timeoutMs:Math.min(task.definition.timeoutMs,10000),retries:0,assertions:{status:200}}},probe,{statusOnly:true}),attempt:0}};
  const submit=async(task,result)=>{const probe=task.probes[0],canaryUrl=task.definition.assignments[probe].canaryUrl;const canary=await executeTaskProbe({...task,definition:{...task.definition,type:'http',api:undefined,mail:undefined,url:canaryUrl,tlsTrust:undefined,request:undefined,timeoutMs:Math.min(task.definition.timeoutMs,10000),retries:0,assertions:{status:200}}},probe,{statusOnly:true});const response=await f.submit(f.first,task,[{...result,attempt:0,canary:{...canary,attempt:0}}]);assert.equal(response.status,200,JSON.stringify(response.data));return response};
  const write=(ref,input)=>writeFile(join(directory,ref+'.json'),JSON.stringify(input),{mode:0o600});
  const fresh=async task=>{
   const child=spawn(process.execPath,['tests/tls-auth-child.mjs'],{env:{...process.env,UPTIME_CREDENTIAL_DIR:directory},stdio:['pipe','pipe','pipe']});let output='',error='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>error+=b);child.stdin.end(JSON.stringify({task,port,ca:certs.ca,controlPort:Number(new URL(f.origin).port)}));assert.equal(await new Promise(resolve=>child.once('exit',resolve)),0,error);return JSON.parse(output);
  };
  return {f,directory,certs,server,records,url,create,claim,manual,run,submit,canary,write,fresh,close:async()=>{restore();if(previous===undefined)delete process.env.UPTIME_CREDENTIAL_DIR;else process.env.UPTIME_CREDENTIAL_DIR=previous;await f.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true})}};
 }catch(error){restore?.();if(previous===undefined)delete process.env.UPTIME_CREDENTIAL_DIR;else process.env.UPTIME_CREDENTIAL_DIR=previous;await f?.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}await rm(directory,{recursive:true,force:true});throw error}
}
