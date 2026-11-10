import assert from 'node:assert/strict';
import {webcrypto,randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {migratedWorker,runtimeDirectory,cleanupDirectory} from './notify-acceptance-runtime.mjs';
import {testAuthBindings,authRequest,sessionCookie,emailSignIn} from './auth-test-support.mjs';
import {signJws,seconds,autonomousPolicy,policyEnvelope} from '../src/base/modules/agent-door/conformance/crypto.mjs';
import {createProtocol} from '../src/base/modules/agent-door/conformance/protocol.mjs';
import {proveScheduledDrills,proveDrillSponsorErasure} from './agent-drill-schedules-support.mjs';

// Extend the registered drill journey with its own real company and installation.
export async function agentDrillJourney(){
 const directory=await runtimeDirectory(),pair=await webcrypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 const publicKey=await webcrypto.subtle.exportKey('jwk',pair.publicKey),kid='synthetic-uptime-drills',issuer='https://business.example.test',installationId=randomUUID(),sub=randomUUID(),business=randomUUID();
 // Acquire an ordinary free local port before signing this installation's audience.
 const {availablePorts}=await import('./notify-acceptance-runtime.mjs');const [port]=await availablePorts(1),origin='http://127.0.0.1:'+port;
 const bindings={...testAuthBindings,RER_OWNER_CLAIM_ISSUER:issuer,RER_OWNER_CLAIM_INSTALLATION_ID:installationId,RER_OWNER_CLAIM_APP_ORIGIN:origin,RER_OWNER_CLAIM_PUBLIC_KEYS:JSON.stringify({[kid]:publicKey}),RER_BUSINESS_TRUST:JSON.stringify({v:1,issuer,audience:origin,subject:installationId,keys:{[kid]:publicKey}})};
 let worker,cookie;
 try{
  ({worker}=await migratedWorker({port,persist:join(directory,'worker'),bindings}));
  const call=authRequest(origin),iat=seconds(),sign=(typ,payload)=>signJws(pair.privateKey,kid,typ,{v:1,iss:issuer,aud:origin,jti:randomUUID(),iat,exp:iat+300,...payload});
  cookie=sessionCookie(await call('/auth/owner-claim',{token:await sign('rer-owner-claim+jwt',{installationId,email:bindings.OWNER_EMAIL}),displayName:'Route owner',returnTo:'/app'}));
  assert.equal((await call('/api/rer/business-settings',{settings:await sign('rer-business-settings+jwt',{sub:installationId,business,email:bindings.OWNER_EMAIL,owner_id:sub,rev:1,values:{},logo:null,team:null})})).status,200);
  const surface={seed:'uptime',specialist:'monitoring-operator',tools:['uptime:read','uptime:evidence','uptime:operate','definitions:preview','events:read'].map(scope=>({scope}))};
  const c=createProtocol({fetch,origin,surface,signer:{privateKey:pair.privateKey,kid,issuer,installationId},person:{email:bindings.OWNER_EMAIL,cookie,sub},business,consent:randomUUID(),points:[],agentId:'synthetic-uptime-drills-'+randomUUID(),seq:0,revision:0,listed:new Map()});
  const initial=await policyEnvelope(c,autonomousPolicy()),adopted=await c.request('/api/rer/agent-policy',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({policy:initial.policy})});assert.equal(adopted.status,200);c.seq=initial.payload.seq;c.revision=initial.payload.revision;
  surface.tools=(await c.mcp('tools/list')).result.tools.map(t=>({name:t.name,scope:t._meta['com.runeditrun/scope'],readOnly:t.annotations.readOnlyHint,classes:t._meta['com.runeditrun/classes'],clauses:t._meta['com.runeditrun/clauses']}));
  const send=c.tool;c.tool=(name,args={},options)=>send(name,{...args,...(!surface.tools.find(t=>t.name===name)?.readOnly&&!args.idempotency_key?{idempotency_key:randomUUID()}:{})},options);
  const native=async(path,body,method=body===undefined?'GET':'POST')=>{const response=await fetch(origin+path,{method,redirect:'manual',headers:{origin,cookie,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});assert.ok(response.ok,path+' HTTP '+response.status);return response.json()};
  const db=await worker.getD1Database('DB'),sponsor=await db.prepare('SELECT id FROM oa_operators WHERE email=?').bind(bindings.OWNER_EMAIL).first();
  const proof=await proveScheduledDrills({c,native,worker,db,origin,cookie,sponsorId:sponsor.id,directory});
  cookie=await emailSignIn(origin,{bindings});c.person.cookie=cookie;
  await proveDrillSponsorErasure({native,origin,cookie,sponsorId:sponsor.id,directory,bindings,proof});
  const erased=await c.tool('uptime.destinations.schedule_drills',proof.scheduledArgs);assert.ok(erased.status===401||erased.result?.isError,'an erased sponsor cannot replay the captured schedule');
  assert.ok(c.points.every(point=>point.ok));
 }finally{await worker?.dispose();await cleanupDirectory(directory)}
}
