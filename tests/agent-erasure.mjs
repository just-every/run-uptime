// An agent edits monitors for two different people; erasing one person must
// leave no trace of them in the agent-door custody tables, the monitor control
// read or the monitor page, while the other person's agent records stay intact.
import assert from 'node:assert/strict';
import {webcrypto,randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {migratedWorker,runtimeDirectory,cleanupDirectory,availablePorts} from './notify-acceptance-runtime.mjs';
import {testAuthBindings,authRequest,sessionCookie,deliveredLink} from './auth-test-support.mjs';
import {completeSecondFactor} from './mfa-auth-support.mjs';
import {signJws,seconds,autonomousPolicy,policyEnvelope} from '../src/base/modules/agent-door/conformance/crypto.mjs';
import {createProtocol,errorCode} from '../src/base/modules/agent-door/conformance/protocol.mjs';
import {prepareIncident} from './agent-conformance/incident.mjs';
import {nativeHttp} from './agent-conformance/http.mjs';
import {readFileSync,readdirSync} from 'node:fs';
const pair=await webcrypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
const key=await webcrypto.subtle.exportKey('jwk',pair.publicKey),kid='uptime-agent-erasure',issuer='https://business.example.test',installationId=randomUUID(),sub=randomUUID(),business=randomUUID();
const directory=await runtimeDirectory(),[port]=await availablePorts(1),origin='http://127.0.0.1:'+port;
const signer={privateKey:pair.privateKey,kid,issuer,installationId};
const bindings={...testAuthBindings,RER_OWNER_CLAIM_ISSUER:issuer,RER_OWNER_CLAIM_INSTALLATION_ID:installationId,RER_OWNER_CLAIM_APP_ORIGIN:origin,RER_OWNER_CLAIM_PUBLIC_KEYS:JSON.stringify({[kid]:key}),RER_BUSINESS_TRUST:JSON.stringify({v:1,issuer,audience:origin,subject:installationId,keys:{[kid]:key}})};
const canaries={name:'Erased Agent Principal',email:'erase-agent-principal@example.test'};
let worker;const problems=[],check=(label,ok)=>{if(!ok)problems.push(label)};
try{
 ({worker}=await migratedWorker({port,persist:join(directory,'worker'),bindings,outboundService:async()=>{throw Error('Unexpected provider request')}}));
 const iat=seconds(),claim=await signJws(pair.privateKey,kid,'rer-owner-claim+jwt',{v:1,iss:issuer,aud:origin,installationId,email:bindings.OWNER_EMAIL,jti:randomUUID(),iat,exp:iat+300});
 const call=authRequest(origin),claimed=await call('/auth/owner-claim',{token:claim,displayName:'Riley Owner',returnTo:'/app'});let cookie=sessionCookie(claimed);
 const settings=(rev,team)=>signJws(pair.privateKey,kid,'rer-business-settings+jwt',{v:1,iss:issuer,aud:origin,sub:installationId,business,email:bindings.OWNER_EMAIL,owner_id:sub,jti:randomUUID(),iat:seconds(),exp:seconds()+300,rev,values:{},logo:null,team});
 assert.equal((await call('/api/rer/business-settings',{settings:await settings(1,null)})).status,200);
 // A second person joins through the real invitation lifecycle and gets a Business agent of their own.
 const otherSub=randomUUID();
 assert.equal((await call('/api/rer/business-settings',{settings:await settings(2,[{id:otherSub,email:canaries.email,name:canaries.name,role:'admin',invite:1}])})).status,200);
 const invitation=await deliveredLink(call,{email:canaries.email,kind:'invite'}),otherCookie=sessionCookie(await call('/auth/confirm',{token:invitation.searchParams.get('token')}));
 await completeSecondFactor(origin,otherCookie);await completeSecondFactor(origin,cookie);
 const db=await worker.getD1Database('DB');
 const sponsor=await db.prepare('SELECT id FROM oa_operators WHERE email=?').bind(bindings.OWNER_EMAIL).first(),other=await db.prepare('SELECT id FROM oa_operators WHERE email=?').bind(canaries.email).first();
 const surface={seed:'uptime',specialist:'monitoring-operator',tools:['uptime:read','uptime:evidence','uptime:operate','definitions:preview','events:read'].map(scope=>({scope}))};
 const agent=(person,label)=>createProtocol({fetch,origin,surface,signer,person,business,consent:randomUUID(),points:[],agentId:label+'-'+randomUUID(),seq:0,revision:0,listed:new Map()});
 const keeper=agent({email:bindings.OWNER_EMAIL,cookie,sub},'night-shift'),erased=agent({email:canaries.email,cookie:otherCookie,sub:otherSub},'day-shift');
 const initial=await policyEnvelope(keeper,autonomousPolicy());
 assert.equal((await keeper.request('/api/rer/agent-policy',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({policy:initial.policy})})).status,200);
 keeper.seq=erased.seq=initial.payload.seq;keeper.revision=erased.revision=initial.payload.revision;
 const native=async(path,body,method=body===undefined?'GET':'POST',as=cookie)=>{const response=await fetch(origin+path,{method,redirect:'manual',headers:{cookie:as,origin,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});assert.ok(response.ok,`${path} HTTP ${response.status}`);return response.status===204?null:response.json()};
 const definition=name=>({name,type:'http',network:'public',url:'https://agent-erasure.example.test/health',method:'GET',assertions:{status:200},intervalMs:60000,timeoutMs:5000,retries:0,probes:['local-a'],failureQuorum:1,confirmSlots:1,recoverSlots:1,freshnessMs:120000,enabled:true});
 const theirs=await native('/api/monitors',definition('Prepared for the erased person')),mine=await native('/api/monitors',definition('Prepared for the kept person'));
 const edit=async(who,monitor,name)=>{const answer=await who.tool('uptime.monitors.update',{id:monitor.id,version:monitor.revision,definition:{name},expected_revision:monitor.revision,idempotency_key:randomUUID()});assert.equal(answer.result?.isError,false,errorCode(answer));return answer.result.structuredContent};
 const editedTheirs=await edit(erased,theirs,'Prepared for the erased person (edited)'),editedMine=await edit(keeper,mine,'Prepared for the kept person (edited)');
 // A manual check and a runner handoff put the same principal into the other agent tables.
 const manual=await erased.tool('uptime.checks.run',{id:theirs.id,version:editedTheirs.revision,idempotency_key:randomUUID()});assert.equal(manual.result?.isError,false,errorCode(manual));
 const manualKeeper=await keeper.tool('uptime.checks.run',{id:mine.id,version:editedMine.revision,idempotency_key:randomUUID()});assert.equal(manualKeeper.result?.isError,false,errorCode(manualKeeper));
 // A runner claim, a destination test and a discovery start put the same saved principal into the other agent tables.
 const runnerId=(await native('/api/runners'))[0].runnerId;
 for(let claim=0;claim<2;claim++){const response=await fetch(origin+'/api/runner/claim',{method:'POST',headers:{origin,'content-type':'application/json','x-runner-key':bindings.UPTIME_RUNNER_KEY,'x-runner-id':runnerId},body:'{}'});assert.equal(response.status,200)}
 const destination=await native('/api/notifications/destinations',{name:'Agent erasure webhook',kind:'webhook',url:'https://notifications.example.com/agent-erasure'});
 for(const who of [erased,keeper]){
  const tested=await who.tool('uptime.destinations.test',{id:destination.id,idempotency_key:randomUUID()});assert.equal(tested.result?.isError,false,errorCode(tested));
  const discovery=await who.tool('uptime.discovery.start',{url:'https://discovery.example.test/',idempotency_key:randomUUID()});assert.equal(discovery.result?.isError,false,errorCode(discovery));
 }

 // Ordinary agent work writes history outside the agent tables: the incident timeline, the route history, the portable audit.
 const http=nativeHttp({request:fetch,origin,cookie}),{incident,observedMonitor}=await prepareIncident(http);
 const current=async()=>(await native('/api/overview')).monitors.find(m=>m.id===observedMonitor.id),watched=await current();
 await native('/api/monitors/'+observedMonitor.id,{...watched.definition,enabled:true},'PATCH');
 const live=await current(),window=()=>{const startsAt=Date.now()+86400000;return {id:'erasure-'+randomUUID(),name:'Agent erasure maintenance',mode:'suppress',timeZone:'UTC',startsAt,endsAt:startsAt+3600000}};
 const work=async(who,toolName,args)=>{const answer=await who.tool(toolName,{...args,idempotency_key:randomUUID()});assert.equal(answer.result?.isError,false,toolName+': '+errorCode(answer));return answer.result.structuredContent};
 const applied=async(who,monitor)=>{
  const input={monitorIds:[monitor],window:window()},preview=await work(who,'uptime.maintenance.preview',input);
  await work(who,'uptime.maintenance.update',{...input,digest:preview.digest});
  const route={scope:'monitor',mode:'selected',destinationIds:[destination.id],expectedRevision:0},review=await work(who,'uptime.routes.preview',{id:monitor,route});
  await work(who,'uptime.routes.update',{id:monitor,route,digest:review.digest});
 };
 await work(erased,'uptime.incidents.acknowledge',{id:incident.id,version:incident.version});
 await work(erased,'uptime.monitors.pause',{id:observedMonitor.id,version:live.revision});
 await applied(erased,theirs.id);await applied(keeper,mine.id);
 const history=async()=>({audit:(await db.prepare("SELECT * FROM uptime_audit WHERE actor_kind='feature' AND actor_ref NOT IN ('notification-dispatch','operator-auth-mail','cron-maintenance','archive-transfer','credential-maintenance','business-import','incident-mention') ORDER BY occurred_at,id").all()).results,routes:(await db.prepare('SELECT * FROM alert_route_changes ORDER BY changed_at,rowid').all()).results});
 const written=await history();
 assert.ok(written.audit.length>=4&&written.routes.length>=2,'the agents\' maintenance and route actions wrote audit and route history');
 const exportable=async()=>{const response=await fetch(origin+'/api/archive',{headers:{cookie,origin}});return {status:response.status,text:await response.text()}};
 const beforeExport=await exportable();check('REPRO archive: GET /api/archive -> '+beforeExport.status+' '+beforeExport.text.slice(0,80)+' after uptime.maintenance.update by an agent',beforeExport.status===200);
 const agentTables=['uptime_agent_revisions','uptime_agent_handoffs','uptime_agent_manual','uptime_agent_discoveries','uptime_agent_notifications'];
 const mention=async who=>{const hits={};for(const table of agentTables){const n=(await db.prepare(`SELECT COUNT(*) n FROM ${table} WHERE principal LIKE ?`).bind('%'+who+'%').first()).n;if(n)hits[table]=n}return hits};
 const preparedBy=async cookieOf=>{const overview=await native('/api/overview',undefined,'GET',cookieOf);return Object.fromEntries(overview.monitors.map(m=>[m.id,m.preparedBy?.label??null]))};
 const before=await preparedBy(cookie);
 assert.match(before[theirs.id],new RegExp(canaries.name),'the monitor control names the person whose agent prepared it');
 assert.match(before[mine.id],/Riley Owner/);
 for(const person of [sponsor,other])for(const table of agentTables)assert.ok((await mention(person.id))[table],`${table} holds ${person===other?'the erased':'the kept'} person's principal`);
 const keptRows=Object.fromEntries(await Promise.all(agentTables.map(async table=>[table,(await db.prepare(`SELECT * FROM ${table} WHERE principal LIKE ? ORDER BY rowid`).bind('%'+sponsor.id+'%').all()).results])));
 const keeperDoor=async()=>Object.fromEntries(await Promise.all(['agent_door_agents','agent_door_audit','agent_door_calls'].map(async table=>[table,(await db.prepare(`SELECT * FROM ${table} WHERE ${table==='agent_door_agents'?'id':'agent'}=? ORDER BY rowid`).bind(keeper.agentId).all()).results]))),keptDoor=await keeperDoor();
 const notificationRows=(await db.prepare("SELECT COUNT(*) n FROM uptime_agent_notifications WHERE instr(principal,?)>0 OR delivery_id IN(SELECT id FROM notification_jobs WHERE json_extract(event,'$.preparedBy.for.id')=?)").bind(other.id,other.id).first()).n;
 const erasure=await native(`/api/operators/${other.id}/erase`,{});assert.equal(erasure.erased,true);
 // PROBE: the control read, the monitor page's own data and every table are redacted at once.
 const after=await preparedBy(cookie);
 assert.ok(after[theirs.id]!==null&&!after[theirs.id].includes(canaries.name),'the monitor still reports that an agent prepared it, without the erased name: '+after[theirs.id]);
 assert.equal(after[mine.id],before[mine.id],'the kept person is untouched');
 assert.deepEqual(await mention(other.id),{});
 assert.deepEqual(await mention(canaries.name),{});
 assert.deepEqual(await mention(canaries.email),{});
 for(const table of agentTables)assert.deepEqual((await db.prepare(`SELECT * FROM ${table} WHERE principal LIKE ? ORDER BY rowid`).bind('%'+sponsor.id+'%').all()).results,keptRows[table],`${table} keeps the other person's records`);
 for(const table of agentTables)assert.ok(erasure.receipt.counts[table]>0,`${table} counted in the erasure receipt`);
 // Every agent-door table, Base's and Uptime's, holds no trace of the erased person; the erasure receipt counts what it reached.
 const doorTables=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name GLOB 'agent_door_*' OR name GLOB 'uptime_agent_*') ORDER BY name").all()).results.map(row=>row.name),leaks=[];
 for(const name of doorTables){const text=JSON.stringify((await db.prepare(`SELECT * FROM "${name}"`).all()).results);for(const [label,value] of [...Object.entries(canaries),['id',other.id]])if(text.includes(value))leaks.push(`${name}:${label}`)}
 assert.deepEqual(leaks,[],'no agent-door table keeps the erased person');
 for(const table of ['agent_door_agents','agent_door_audit','agent_door_calls'])assert.ok(erasure.receipt.counts[table]>0,`${table} counted in the erasure receipt`);
 assert.deepEqual(await keeperDoor(),keptDoor,'the other person\'s agent, calls and audit are untouched');
 // The kept person's agent keeps working and still reads its own and the erased person's monitor.
 const read=await keeper.tool('uptime.monitors.read',{id:theirs.id});assert.equal(read.result?.isError,false,errorCode(read));
 assert.ok(!JSON.stringify(read.result.structuredContent).includes(canaries.name)&&read.result.structuredContent.preparedBy,'the agent read names no erased person');
 const refused=await erased.tool('uptime.monitors.read',{id:theirs.id});assert.equal(refused.status,401,'the erased person\'s agent can no longer act');

 // PROBE: the history the agents wrote names no erased person anywhere, in the database or in any read the owner can make.
 const label=(await db.prepare("SELECT json_extract(row,'$.label') label FROM agent_door_audit WHERE agent=? LIMIT 1").bind(erased.agentId).first()).label,nameless=text=>!text.includes(canaries.name)&&!text.includes(canaries.email)&&!text.includes(other.id)&&!text.includes(label);
 const reads={incident:'/api/v1/incidents/'+incident.id,incidentConsole:'/api/incidents/'+incident.id,route:`/api/monitors/${theirs.id}/alert-route`,overview:'/api/overview',monitorIncidents:`/api/monitors/${theirs.id}/incidents`};
 for(const [name,path] of Object.entries(reads)){const response=await fetch(origin+path,{headers:{cookie,origin}});check(`PROBE ${name}: ${path} (${response.status}) names the erased person`,response.status===200&&nameless(await response.text()))}
 const timeline=(await native(reads.incident)).timeline??[];
 check('PROBE incident dialog: the agent\'s acknowledge and pause entries stay as an anonymous agent and a former member',['acknowledged','pause_applied'].every(kind=>timeline.some(entry=>entry.kind===kind&&entry.actor.kind&&nameless(JSON.stringify(entry)))));
 const afterHistory=await history();
 check('PROBE uptime_audit: no audit actor is a personal label',afterHistory.audit.every(row=>nameless(row.actor_ref)));
 check('PROBE uptime_audit: the agent actions stay, counted and timed as before',afterHistory.audit.length===written.audit.length&&afterHistory.audit.every((row,i)=>row.id===written.audit[i].id&&row.occurred_at===written.audit[i].occurred_at&&row.action===written.audit[i].action));
 check('PROBE alert-route changes: no actor is a personal label',afterHistory.routes.every(row=>nameless(JSON.stringify(row))));
 const kept=written.audit.filter(row=>row.actor_ref===written.audit.find(r=>r.subject_ref===mine.id).actor_ref);
 check('PROBE second operator: the other agent\'s audit and route rows are byte-identical',JSON.stringify(afterHistory.audit.filter(row=>kept.some(k=>k.id===row.id)))===JSON.stringify(kept)&&JSON.stringify(afterHistory.routes.filter(row=>row.scope_value===mine.id))===JSON.stringify(written.routes.filter(row=>row.scope_value===mine.id)));
 const afterExport=await exportable();
 check('PROBE archive: GET /api/archive -> '+afterExport.status+' '+afterExport.text.slice(0,80),afterExport.status===200);
 check('PROBE archive: names no erased person and keeps the agent action in a non-personal form',nameless(afterExport.text)&&/"actor_ref\\?":\\?"agent:/.test(afterExport.text));
 // The whole database, every table. The Business roster (bs_*) is the Business door's retirement rule, ruled by gr on 2 Nov, not the agent door's.
 const whole=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT GLOB '_cf_*' AND name NOT GLOB 'bs_*' ORDER BY name").all()).results.map(row=>row.name),residue=[];
 for(const name of whole){const text=JSON.stringify((await db.prepare(`SELECT * FROM "${name}"`).all()).results);for(const [what,value] of [['name',canaries.name],['email',canaries.email],['label',label]])if(text.includes(value))residue.push(`${name}:${what}`)}
 check('PROBE whole database: no table names the erased person: '+residue.join(', '),residue.length===0);
 check('PROBE receipt: uptime_agent_notifications counts each touched row once ('+erasure.receipt.counts.uptime_agent_notifications+' of '+notificationRows+')',erasure.receipt.counts.uptime_agent_notifications===notificationRows);
 assert.deepEqual(problems,[],'the erasure leaves the person reachable:\n'+problems.join('\n'));
 console.log('PASS agent-door custody names no erased person after operator erasure; the other person\'s agent records are intact.');
}finally{if(worker)await worker.dispose();await cleanupDirectory(directory)}
