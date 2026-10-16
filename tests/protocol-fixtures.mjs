// Network-edge fixtures for the protocol monitors: a test CA and certificates, one HTTPS server playing the DNS over
// HTTPS resolvers, IANA's RDAP bootstrap, a registry, a registrar and the external check, a TCP service and a TLS service.
// Each answers from `scenario`, which the test changes between scheduled checks.
import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import {once} from 'node:events';

const openssl=args=>execFileSync('openssl',args,{stdio:'ignore'});
async function signed(dir,name,names,days,ca){
 const key=join(dir,`${name}.key`),csr=join(dir,`${name}.csr`),cert=join(dir,`${name}.pem`),ext=join(dir,`${name}.ext`);
 await writeFile(ext,`subjectAltName=${names.map(n=>`DNS:${n}`).join(',')}\n`);
 openssl(['req','-newkey','rsa:2048','-nodes','-keyout',key,'-out',csr,'-subj',`/CN=${names[0]}`]);
 if(ca)openssl(['x509','-req','-in',csr,'-CA',ca.cert,'-CAkey',ca.key,'-CAcreateserial','-out',cert,'-days',String(days),'-extfile',ext]);
 else openssl(['x509','-req','-in',csr,'-signkey',key,'-out',cert,'-days',String(days),'-extfile',ext]);
 return {key:await readFile(key),cert:await readFile(cert)};
}
export async function certificates(dir){
 const ca={key:join(dir,'ca.key'),cert:join(dir,'ca.pem')};
 openssl(['req','-x509','-newkey','rsa:2048','-nodes','-keyout',ca.key,'-out',ca.cert,'-days','30','-subj','/CN=Protocol fixture test CA']);
 const host='tls.protocol.test';
 return {caPath:ca.cert,
  web:await signed(dir,'web',['localhost','canary.protocol.test','cloudflare-dns.com','dns.google','data.iana.org','rdap.registry.test','rdap.registrar.test'],30,ca),
  expiring:await signed(dir,'expiring',[host],10,ca),wrongName:await signed(dir,'wrong-name',['other.protocol.test'],200,ca),
  selfSigned:await signed(dir,'self-signed',[host],200,null),renewed:await signed(dir,'renewed',[host],400,ca)};
}
export async function listen(server,port=0){server.listen(port,'127.0.0.1');await once(server,'listening');return server.address().port}
export async function close(server){if(server?.listening){server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve))}}
const iso=at=>new Date(at).toISOString();
// scenario.dns[resolver] = {status, answers} for the monitored name; scenario.registry / scenario.registrar = {status, expiresAt, redacted}.
export function webServer(tlsOptions,scenario,controlHandler){
 return https.createServer(tlsOptions,async(req,res)=>{
  const host=String(req.headers.host).split(':')[0],url=new URL(req.url,'https://'+host);
  const json=(status,body)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body))};
  if(host==='localhost')return controlHandler(req,res);
  if(host==='canary.protocol.test'){res.writeHead(200);return res.end('ok')}
  if(host==='cloudflare-dns.com'||host==='dns.google'){
   // The zone's name server and its address, for the authoritative query; every other question is the monitored record.
   const name=url.searchParams.get('name'),type=url.searchParams.get('type');
   if(type==='NS')return json(200,{Status:name==='protocol.test'?0:3,TC:false,...(name==='protocol.test'?{Answer:[{name,type:2,TTL:60,data:'ns1.protocol.test.'}]}:{})});
   if(name==='ns1.protocol.test')return json(200,{Status:0,TC:false,Answer:[{name,type:1,TTL:60,data:'93.184.216.34'}]});
   const answer=scenario.dns[host==='dns.google'?'google':'cloudflare'];
   if(answer.status==='unavailable')return json(503,{error:'unavailable'});
   const code={answer:0,nxdomain:3,servfail:2}[answer.status];
   return json(200,{Status:code,TC:false,Question:[{name:url.searchParams.get('name'),type:1}],...(answer.answers?.length?{Answer:answer.answers.map(data=>({name:url.searchParams.get('name'),type:1,TTL:60,data}))}:{})});
  }
  if(host==='data.iana.org')return json(200,{version:'1.0',services:[[['test'],['https://rdap.registry.test/']]]});
  if(host==='rdap.registry.test'||host==='rdap.registrar.test'){
   const record=scenario[host==='rdap.registry.test'?'registry':'registrar'];
   if(record.status!==200)return json(record.status,{errorCode:record.status});
   return json(200,{objectClassName:'domain',ldhName:url.pathname.split('/').pop(),status:['client transfer prohibited'],
    events:[...(record.redacted||record.expiresAt===undefined?[]:[{eventAction:'expiration',eventDate:iso(record.expiresAt)}]),{eventAction:'last update of RDAP database',eventDate:iso(Date.now()-3600000)}],
    ...(record.redacted?{redacted:[{name:{description:'Expiration Date'},method:'removal'}]}:{}),
    ...(host==='rdap.registry.test'?{links:[{rel:'related',type:'application/rdap+json',href:`https://rdap.registrar.test/domain/${url.pathname.split('/').pop()}`}]}:{})});
  }
  res.writeHead(404);res.end();
 });
}
// The zone's authoritative name server over TCP: answers the monitored A record from scenario.dns.authoritative.
export function dnsServer(scenario){
 return net.createServer(socket=>{
  socket.on('error',()=>{});let buffer=Buffer.alloc(0);
  socket.on('data',chunk=>{
   buffer=Buffer.concat([buffer,chunk]);if(buffer.length<2||buffer.length<2+buffer.readUInt16BE(0))return;
   const query=buffer.subarray(2,2+buffer.readUInt16BE(0)),answer=scenario.dns.authoritative,end=12+query.subarray(12).indexOf(0)+5;
   const rcode={answer:0,nxdomain:3,servfail:2}[answer.status],records=answer.status==='answer'?answer.answers:[];
   const header=Buffer.from([query[0],query[1],0x84,rcode,0,1,0,records.length,0,0,0,0]);
   const body=records.map(ip=>Buffer.from([0xc0,12,0,1,0,1,0,0,0,60,0,4,...ip.split('.').map(Number)]));
   const message=Buffer.concat([header,query.subarray(12,end),...body]),framed=Buffer.alloc(2);framed.writeUInt16BE(message.length);
   socket.end(Buffer.concat([framed,message]));
  });
 });
}
export function tcpServer(){return net.createServer(socket=>{socket.on('error',()=>{});socket.write('READY protocol fixture service\r\n');socket.end()})}
export function tlsServer(scenario,fallback){
 return tls.createServer({...fallback,SNICallback:(name,callback)=>callback(null,tls.createSecureContext(scenario.certificate))},socket=>{socket.on('error',()=>{});socket.end()});
}
