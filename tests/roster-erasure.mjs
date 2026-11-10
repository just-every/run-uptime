// Erasing an operator the Business invited retires them from the Business-signed roster as well as from the agent door:
// bs_team and bs_settings.document keep no trace of them, a later revision that still lists them applies as retired,
// the other person's roster entry and agent records are untouched, and erasing al@ never reaches sal@'s agent records.
import assert from 'node:assert/strict';
import {webcrypto,randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {migratedWorker,runtimeDirectory,cleanupDirectory,availablePorts} from './notify-acceptance-runtime.mjs';
import {testAuthBindings,authRequest,sessionCookie,deliveredLink} from './auth-test-support.mjs';
import {completeSecondFactor} from './mfa-auth-support.mjs';
import {signJws,seconds,autonomousPolicy,policyEnvelope} from '../src/base/modules/agent-door/conformance/crypto.mjs';
import {createProtocol,errorCode} from '../src/base/modules/agent-door/conformance/protocol.mjs';
const pair=await webcrypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
const key=await webcrypto.subtle.exportKey('jwk',pair.publicKey),kid='uptime-roster-erasure',issuer='https://business.example.test',installationId=randomUUID(),ownerSub=randomUUID(),business=randomUUID();
const directory=await runtimeDirectory(),[port]=await availablePorts(1),origin='http://127.0.0.1:'+port;
const signer={privateKey:pair.privateKey,kid,issuer,installationId};
const bindings={...testAuthBindings,RER_OWNER_CLAIM_ISSUER:issuer,RER_OWNER_CLAIM_INSTALLATION_ID:installationId,RER_OWNER_CLAIM_APP_ORIGIN:origin,RER_OWNER_CLAIM_PUBLIC_KEYS:JSON.stringify({[kid]:key}),RER_BUSINESS_TRUST:JSON.stringify({v:1,issuer,audience:origin,subject:installationId,keys:{[kid]:key}})};
// al@ is a suffix of sal@: the bare-substring matcher selected the second person's agent records when the first was erased.
const erasedPerson={sub:randomUUID(),name:'Alvin Erased',email:'al@example.test'},keptPerson={sub:randomUUID(),name:'Sally Kept',email:'sal@example.test'};
let worker;
try{
 ({worker}=await migratedWorker({port,persist:join(directory,'worker'),bindings,outboundService:async()=>{throw Error('Unexpected provider request')}}));
 const iat=seconds(),claim=await signJws(pair.privateKey,kid,'rer-owner-claim+jwt',{v:1,iss:issuer,aud:origin,installationId,email:bindings.OWNER_EMAIL,jti:randomUUID(),iat,exp:iat+300});
 const call=authRequest(origin),claimed=await call('/auth/owner-claim',{token:claim,displayName:'Riley Owner',returnTo:'/app'}),cookie=sessionCookie(claimed);
 const settings=(rev,team)=>signJws(pair.privateKey,kid,'rer-business-settings+jwt',{v:1,iss:issuer,aud:origin,sub:installationId,business,email:bindings.OWNER_EMAIL,owner_id:ownerSub,jti:randomUUID(),iat:seconds(),exp:seconds()+300,rev,values:{},logo:null,team});
 const deliver=async(rev,team)=>{const response=await call('/api/rer/business-settings',{settings:await settings(rev,team)});return {status:response.status,body:await response.json()}};
 const listed=(person,invite)=>({id:person.sub,email:person.email,name:person.name,role:'admin',invite});
 assert.equal((await deliver(1,null)).status,200);
 assert.equal((await deliver(2,[listed(erasedPerson,1),listed(keptPerson,1)])).status,200);
 const joined={};
 for(const person of [erasedPerson,keptPerson]){
  const invitation=await deliveredLink(call,{email:person.email,kind:'invite'});
  joined[person.email]=sessionCookie(await call('/auth/confirm',{token:invitation.searchParams.get('token')}));
  await completeSecondFactor(origin,joined[person.email]);
 }
 await completeSecondFactor(origin,cookie);
 const db=await worker.getD1Database('DB');
 const operator=async email=>(await db.prepare('SELECT id FROM oa_operators WHERE email=?').bind(email).first()).id;
 const erasedId=await operator(erasedPerson.email),keptId=await operator(keptPerson.email);
 // Both people's agents do work, so each has agent-door records that name their sponsor's exact email.
 const surface={seed:'uptime',specialist:'monitoring-operator',tools:['uptime:read','uptime:evidence','uptime:operate','definitions:preview','events:read'].map(scope=>({scope}))};
 const agent=(person,label)=>createProtocol({fetch,origin,surface,signer,person,business,consent:randomUUID(),points:[],agentId:label+'-'+randomUUID(),seq:0,revision:0,listed:new Map()});
 const owner=agent({email:bindings.OWNER_EMAIL,cookie,sub:ownerSub},'owner-shift'),erased=agent({email:erasedPerson.email,cookie:joined[erasedPerson.email],sub:erasedPerson.sub},'al-shift'),kept=agent({email:keptPerson.email,cookie:joined[keptPerson.email],sub:keptPerson.sub},'sal-shift');
 const initial=await policyEnvelope(owner,autonomousPolicy());
 assert.equal((await owner.request('/api/rer/agent-policy',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({policy:initial.policy})})).status,200);
 for(const who of [owner,erased,kept]){who.seq=initial.payload.seq;who.revision=initial.payload.revision}
 const native=async(path,body,as=cookie)=>{const response=await fetch(origin+path,{method:body===undefined?'GET':'POST',redirect:'manual',headers:{cookie:as,origin,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});const text=await response.text();assert.ok(response.status<400,path+' '+response.status+' '+text.slice(0,200));return JSON.parse(text)};
 const monitor=name=>({name,type:'http',network:'public',url:'https://roster-erasure.example.test/health',method:'GET',assertions:{status:200},intervalMs:60000,timeoutMs:5000,retries:0,probes:['local-a'],failureQuorum:1,confirmSlots:1,recoverSlots:1,freshnessMs:300000});
 const theirs=await native('/api/monitors',monitor('Prepared for Alvin')),mine=await native('/api/monitors',monitor('Pager for '+keptPerson.email));
 // A monitor named for sal@ puts the address into the result the door keeps of the call: the only way an email reaches these records.
 for(const [who,target] of [[erased,theirs],[kept,mine]]){
  const answer=await who.tool('uptime.monitors.update',{id:target.id,version:target.revision,definition:{name:target===mine?'Pager for '+keptPerson.email+' (edited)':'Prepared for Alvin (edited)'},expected_revision:target.revision,idempotency_key:randomUUID()});
  assert.equal(answer.result?.isError,false,errorCode(answer));
 }
 const doorOf=async who=>Object.fromEntries(await Promise.all(['agent_door_agents','agent_door_audit','agent_door_calls'].map(async table=>[table,(await db.prepare(`SELECT * FROM ${table} WHERE ${table==='agent_door_agents'?'id':'agent'}=? ORDER BY rowid`).bind(who.agentId).all()).results])));
 const keptDoor=await doorOf(kept);
 assert.ok(keptDoor.agent_door_audit.length>0&&JSON.stringify(keptDoor).includes(keptPerson.email),'the kept person\'s agent records name their exact email');
 const keptRoster=async()=>({row:await db.prepare('SELECT * FROM bs_team WHERE operator_id=?').bind(keptId).first(),entry:(await db.prepare("SELECT json_extract(m.value,'$') e FROM bs_settings s,json_each(s.document,'$.team') m WHERE json_extract(m.value,'$.id')=?").bind(keptPerson.sub).first())?.e});
 const keptBefore=await keptRoster();
 assert.ok(keptBefore.row&&keptBefore.entry,'the kept person is on the roster');
 const rosterOf=async person=>{
  const team=(await db.prepare('SELECT COUNT(*) n FROM bs_team WHERE email=? OR operator_id=? OR business_id=?').bind(person.email,person.sub===erasedPerson.sub?erasedId:keptId,person.sub).first()).n;
  const entries=JSON.parse((await db.prepare('SELECT document FROM bs_settings').first()).document).team??[];
  return {team,document:entries.some(entry=>entry.id===person.sub||entry.email===person.email)};
 };
 assert.deepEqual(await rosterOf(erasedPerson),{team:1,document:true},'the erased person is on the roster before erasure');

 const erasure=await native(`/api/operators/${erasedId}/erase`,{});assert.equal(erasure.erased,true);

 // (a) No trace of the person in the roster or anywhere else: the whole database, every table including bs_*.
 assert.deepEqual(await rosterOf(erasedPerson),{team:0,document:false},'bs_team and the stored Business document drop the erased person');
 const traces=[['name',erasedPerson.name],['email',erasedPerson.email],['operator',erasedId],['business id',erasedPerson.sub]],residue=[];
 const tables=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT GLOB '_cf_*' ORDER BY name").all()).results.map(row=>row.name);
 assert.ok(tables.includes('bs_team')&&tables.includes('bs_retired'),'the scan covers the Business roster and its tombstones');
 for(const name of tables){const text=JSON.stringify((await db.prepare(`SELECT * FROM "${name}"`).all()).results);for(const [what,value] of traces)if(text.includes(value)){
  // al@ is also a suffix of sal@: only the kept person's own, longer address may remain.
  // The native audit keeps its opaque operator id by design; ids are scanned in the Business roster and the agent custody tables.
  if((what==='operator'||what==='business id')&&!/^(bs_|agent_door_|uptime_agent_)/.test(name))continue;
  if(what==='email'&&!text.replaceAll(keptPerson.email,'').includes(value))continue;
  residue.push(`${name}:${what}`)}}
 assert.deepEqual(residue,[],'no table keeps the erased person');
 // The erasure record keeps its shape: a count per table and no personal data.
 const receipt=JSON.stringify(erasure.receipt);
 assert.ok(Object.values(erasure.receipt.counts).every(Number.isInteger)&&!traces.some(([,value])=>receipt.includes(value)),'the receipt counts rows per table and holds no personal data');

 // (d) The other person's roster entry, agent records and access are exactly as they were.
 assert.deepEqual(await keptRoster(),keptBefore,'the kept person\'s bs_team row and roster entry are byte-identical');
 assert.deepEqual(await doorOf(kept),keptDoor,'erasing al@ leaves sal@\'s agent, calls and audit untouched');
 assert.equal((await kept.tool('uptime.monitors.read',{id:mine.id})).result?.isError,false,'the kept person\'s agent keeps working');
 assert.equal((await fetch(origin+'/api/overview',{headers:{cookie:joined[keptPerson.email],origin}})).status,200,'the kept person keeps their session');

 // (c) The Business lists the erased person again: the revision applies as retired and everyone else applies.
 const relisted=await deliver(3,[listed(erasedPerson,1),listed(keptPerson,1)]);
 assert.equal(relisted.status,200);
 assert.deepEqual(relisted.body.retired,[erasedPerson.email],'the re-listed erased person is reported retired');
 assert.deepEqual(await rosterOf(erasedPerson),{team:0,document:false},'a re-listed erased person gets no row and no document entry');
 assert.equal(await db.prepare('SELECT COUNT(*) n FROM oa_operators WHERE email=?').bind(erasedPerson.email).first('n'),0,'no native account is created for them');
 // A revision refreshes the native state of each listed person (the invitation was accepted); everything else about them is unchanged.
 const keptAfter=await keptRoster();
 assert.equal(keptAfter.row.state,'active');
 assert.deepEqual({...keptAfter,row:{...keptAfter.row,state:null}},{...keptBefore,row:{...keptBefore.row,state:null}},'the kept person survives the re-listing');
 assert.equal(await db.prepare('SELECT COUNT(*) n FROM bs_retired').first('n')>0,true,'the tombstone is kept as digests');
 console.log('PASS erasing an invited operator retires them from the Business roster; the other person\'s roster entry and agent records are intact.');
}finally{if(worker)await worker.dispose();await cleanupDirectory(directory)}
