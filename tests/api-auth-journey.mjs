import assert from 'node:assert/strict';
import {createHash,createHmac,generateKeyPairSync,randomBytes,verify} from 'node:crypto';
import {rm,readdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {authFixture} from './tls-auth-support.mjs';
const digestPassword=randomBytes(32).toString('hex'),clientSecret=randomBytes(32).toString('hex'),jwtSecret=randomBytes(32).toString('hex'),initialRefreshToken=randomBytes(32).toString('hex');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function digestValid(record,{nonce,algorithm,qop}){
 const values=Object.fromEntries([...String(record.headers.authorization??'').matchAll(/([a-z]+)=(?:"([^"]*)"|([^,\s]+))/gi)].map(m=>[m[1],m[2]??m[3]]));
 if(values.username!=='operator'||values.realm!=='checkout'||values.nonce!==nonce||values.uri!==record.url||values.qop!==qop)return false;
 const hashName=algorithm.toLowerCase().replace('-sess','').replace('sha-','sha'),hash=value=>createHash(hashName).update(value).digest('hex');
 let a1=hash('operator:checkout:'+digestPassword);if(algorithm.endsWith('-sess'))a1=hash(a1+':'+nonce+':'+values.cnonce);
 const a2=hash(record.method+':'+record.url+(qop==='auth-int'?':'+hash(record.body):''));
 return values.response===hash(a1+':'+nonce+':'+values.nc+':'+values.cnonce+':'+qop+':'+a2);
}
export async function apiAuthJourney(){
 let edge,access='none',refresh=initialRefreshToken,tokenCalls=0,redirectToken=false,invalidToken=false,stale=false,acceptedClient='client',jwtAlgorithm='HS256',jwtKey=jwtSecret,redirectApplication=false,slowToken=false;
 try{
  edge=await authFixture((record,res)=>{
   const path=new URL(record.url,'https://auth.example.test').pathname;
   if(path==='/redirect-sink'){res.end('operational');return}
   if(redirectApplication&&record.host.startsWith('auth.example.test')){res.writeHead(302,{location:edge.url('/redirect-sink','token.example.test')});res.end();return}
   if(path.startsWith('/digest')){
    const algorithm=path.includes('sha512')?'SHA-512-256-sess':path.includes('md5')?'MD5':'SHA-256',qop=path.includes('md5')?'auth-int':'auth',nonce=stale?'new-nonce':'original-nonce';
    if(digestValid(record,{nonce,algorithm,qop})){res.end('operational');return}
    if(record.headers.authorization&&path.includes('stale')&&!stale)stale=true;
    res.writeHead(401,{'www-authenticate':`Digest realm="checkout", nonce="${stale?'new-nonce':nonce}", algorithm=${algorithm}, qop="${qop}", stale=${stale?'true':'false'}`});res.end('authentication required');return;
   }
   if(path==='/token'){
    tokenCalls++;if(redirectToken){res.writeHead(302,{location:edge.url('/stolen','other.example.test')});res.end();return}
    const form=new URLSearchParams(record.body),basic='Basic '+Buffer.from('client:'+clientSecret).toString('base64');
    if(record.headers.authorization!==basic&&!(form.get('client_id')==='client'&&form.get('client_secret')===clientSecret)){res.writeHead(400);res.end('{}');return}
    if(form.get('grant_type')==='refresh_token'&&form.get('refresh_token')!==refresh){res.writeHead(400);res.end('{}');return}
    access='oauth-access-private-'+tokenCalls;refresh='oauth-refresh-private-'+tokenCalls;
    res.setHeader('content-type','application/json');const tokenBody=JSON.stringify({access_token:access,refresh_token:refresh,token_type:'Bearer',expires_in:1});if(slowToken)setTimeout(()=>res.end(tokenBody),500).unref();else res.end(tokenBody);return;
   }
   if(path==='/oauth'){
    if(invalidToken){invalidToken=false;res.writeHead(401,{'www-authenticate':'Bearer error="invalid_token"'});res.end();return}
    if(record.headers.authorization!=='Bearer '+access){res.writeHead(401);res.end();return}res.end('operational');return;
   }
   if(path==='/jwt'){
    try{const token=record.headers.authorization.slice(7),parts=token.split('.'),header=JSON.parse(Buffer.from(parts[0],'base64url')),claims=JSON.parse(Buffer.from(parts[1],'base64url')),data=Buffer.from(parts[0]+'.'+parts[1]),signature=Buffer.from(parts[2],'base64url');
     assert.equal(header.alg,jwtAlgorithm);assert.equal(claims.iss,'uptime-test');assert.equal(claims.sub,'monitor');assert.equal(claims.aud,'checkout');assert.ok(claims.exp>Math.floor(Date.now()/1000));
     const valid=jwtAlgorithm==='HS256'?createHmac('sha256',jwtKey).update(data).digest().equals(signature):verify('sha256',data,{key:jwtKey,...(jwtAlgorithm==='ES256'?{dsaEncoding:'ieee-p1363'}:{})},signature);if(!valid)throw Error();res.end('operational');
    }catch{res.writeHead(401);res.end()}return;
   }
   if(path==='/mtls'){if(!record.authorized||record.client!==acceptedClient){res.writeHead(401);res.end();return}res.end('operational');return}
   res.end('operational');
  });const {f,create,claim,manual,run,submit,write,url,records}=edge;
  const check=async(m,{fresh=false}={})=>{const task=await manual(m.id),result=await(fresh?edge.fresh(task):run(task));await submit(task,result);return result};
  const credential=(m,auth,extra={})=>({monitorId:m.id,origin:new URL(url('/','auth.example.test')).origin,...(auth?{auth}:{}),...extra});
  const isolation=async m=>{redirectApplication=true;const start=records.length;try{assert.equal((await check(m)).outcome,'pass');const foreign=records.slice(start).filter(r=>r.url==='/redirect-sink');assert.equal(foreign.length,1);assert.equal(foreign[0].headers.authorization,undefined);assert.equal(foreign[0].client,undefined);assert.equal(foreign[0].body,'')}finally{redirectApplication=false}};
  for(const path of ['/digest','/digest-md5','/digest-sha512','/digest-stale']){
   stale=false;const m=await create({name:'Authenticated '+path,url:url(path,'auth.example.test'),request:{credentialRef:'digest'}});await write('digest',credential(m,{type:'digest',username:'operator',password:digestPassword,realm:'checkout'}));let task=await claim(m.id),result=await run(task);assert.equal(result.outcome,'pass');await submit(task,result);
   await isolation(m);await write('digest',credential(m,{type:'digest',username:'operator',password:digestPassword+'-revoked',realm:'checkout'}));result=await check(m);assert.equal(result.outcome,'target_failure');assert.match(result.checks[0].reason,/Authentication rejected/);
   await write('digest',credential(m,{type:'digest',username:'operator',password:digestPassword,realm:'checkout'}));assert.equal((await check(m)).outcome,'pass');await write('digest',credential(m,{type:'digest',username:'operator',password:digestPassword,realm:'checkout'},{expiresAt:Date.now()-1}));const count=records.length;assert.equal((await check(m)).outcome,'runner_error');assert.equal(records.length,count);await rm(join(edge.directory,'digest.json'));assert.equal((await check(m)).outcome,'runner_error');assert.equal(records.length,count);await f.pause(m);
  }
  for(const grant of ['client_credentials','refresh_token']){
   refresh=initialRefreshToken;const m=await create({name:'OAuth '+grant,url:url('/oauth','auth.example.test'),request:{credentialRef:'oauth'}}),auth={type:'oauth2',grant,tokenUrl:url('/token','token.example.test'),clientId:'client',clientSecret,clientAuthentication:grant==='client_credentials'?'basic':'body',scope:['checkout.read'],...(grant==='refresh_token'?{refreshToken:refresh}:{})};
   await write('oauth',credential(m,auth));let task=await claim(m.id),result=await run(task);assert.equal(result.outcome,'pass');await submit(task,result);
   await isolation(m);const calls=tokenCalls;invalidToken=true;assert.equal((await check(m)).outcome,'pass');assert.equal(tokenCalls,calls+1);
   await sleep(1100);assert.equal((await check(m,{fresh:true})).outcome,'pass');assert.ok(tokenCalls>calls+1,'expired token is acquired by a new runner process using rotated local state');
   await write('oauth',credential(m,{...auth,clientSecret:clientSecret+'-invalid'}));const apps=records.filter(r=>r.url==='/oauth').length;assert.equal((await check(m)).outcome,'runner_error');assert.equal(records.filter(r=>r.url==='/oauth').length,apps);
   redirectToken=true;await write('oauth',credential(m,{...auth,scope:['changed.scope']}));assert.equal((await check(m)).outcome,'runner_error');assert.ok(!records.some(r=>r.url==='/stolen'));if(grant==='refresh_token'){const count=tokenCalls;assert.equal((await check(m)).outcome,'runner_error');assert.equal(tokenCalls,count,'an uncertain refresh exchange is never replayed')}redirectToken=false;const restored={...auth,...(grant==='refresh_token'?{refreshToken:refresh}:{})};await write('oauth',credential(m,restored));assert.equal((await check(m)).outcome,'pass');await write('oauth',credential(m,restored,{expiresAt:Date.now()-1}));const stopped=records.length;assert.equal((await check(m)).outcome,'runner_error');await rm(join(edge.directory,'oauth.json'));assert.equal((await check(m)).outcome,'runner_error');assert.equal(records.length,stopped);await f.pause(m);
  }
  const deadlineMonitor=await create({name:'OAuth acquisition deadline',url:url('/oauth','auth.example.test'),timeoutMs:100,request:{credentialRef:'deadline'}});await write('deadline',credential(deadlineMonitor,{type:'oauth2',grant:'client_credentials',tokenUrl:url('/token','token.example.test'),clientId:'client',clientSecret,clientAuthentication:'basic'}));slowToken=true;const beforeApps=records.filter(r=>r.url==='/oauth').length,deadlineTask=await claim(deadlineMonitor.id),deadlineResult=await run(deadlineTask);slowToken=false;assert.equal(deadlineResult.outcome,'runner_error');assert.equal(deadlineResult.checks[0].assertion,'credential');assert.equal(records.filter(r=>r.url==='/oauth').length,beforeApps);await submit(deadlineTask,deadlineResult);assert.equal((await f.state(deadlineMonitor.id)).state,'Unknown');await f.pause(deadlineMonitor);
  for(const algorithm of ['HS256','RS256','ES256']){
   const pair=algorithm==='HS256'?null:generateKeyPairSync(algorithm==='RS256'?'rsa':'ec',algorithm==='RS256'?{modulusLength:2048}:{namedCurve:'P-256'});jwtAlgorithm=algorithm;jwtKey=pair?.publicKey??jwtSecret;
   const key=pair?pair.privateKey.export({format:'pem',type:'pkcs8'}).toString():jwtSecret,m=await create({name:algorithm+' signed API',url:url('/jwt','auth.example.test'),request:{credentialRef:'jwt'}}),auth={type:'jwt',algorithm,key,issuer:'uptime-test',subject:'monitor',audience:'checkout',lifetimeSeconds:60};
   await write('jwt',credential(m,auth));const task=await claim(m.id),result=await run(task);assert.equal(result.outcome,'pass');await submit(task,result);await isolation(m);const previousKey=jwtKey;jwtKey=algorithm==='HS256'?randomBytes(32).toString('hex'):generateKeyPairSync(algorithm==='RS256'?'rsa':'ec',algorithm==='RS256'?{modulusLength:2048}:{namedCurve:'P-256'}).publicKey;assert.equal((await check(m)).outcome,'target_failure');jwtKey=previousKey;await write('jwt',credential(m,{...auth,keyId:'rotated-key'}));assert.equal((await check(m)).outcome,'pass');await write('jwt',credential(m,auth,{expiresAt:Date.now()-1}));assert.equal((await check(m)).outcome,'runner_error');await rm(join(edge.directory,'jwt.json'));const count=records.length;assert.equal((await check(m)).outcome,'runner_error');assert.equal(records.length,count);await f.pause(m);
  }
  const m=await create({name:'Client certificate API',url:url('/mtls','auth.example.test'),request:{credentialRef:'mtls'}}),client=extra=>credential(m,null,{tls:{clientCertificatePem:edge.certs[extra].cert,clientPrivateKeyPem:edge.certs[extra].key}});
  await write('mtls',client('client'));let task=await claim(m.id),result=await run(task);assert.equal(result.outcome,'pass');await submit(task,result);await isolation(m);acceptedClient='client2';assert.equal((await check(m)).outcome,'target_failure');await write('mtls',client('client2'));assert.equal((await check(m)).outcome,'pass');await write('mtls',{...client('client2'),expiresAt:Date.now()-1});assert.equal((await check(m)).outcome,'runner_error');await rm(join(edge.directory,'mtls.json'));assert.equal((await check(m)).outcome,'runner_error');await f.pause(m);
  const archive=await f.request('/api/archive');assert.equal(archive.status,200);const retained=JSON.stringify(archive.data);for(const secret of [digestPassword,clientSecret,jwtSecret,access,refresh,edge.certs.client.key])assert.ok(!retained.includes(secret),'local credential material must not enter portable records');
  const states=await readdir(join(edge.directory,'.uptime-auth'));assert.ok(states.some(name=>name.endsWith('.json')));assert.equal(states.filter(name=>name.endsWith('.lock')).length,2,'failed refresh exchanges remain explicitly uncertain');for(const name of states.filter(n=>n.endsWith('.json')))assert.ok(JSON.parse(await readFile(join(edge.directory,'.uptime-auth',name),'utf8')).refreshToken);
 }finally{await edge?.close()}
}
