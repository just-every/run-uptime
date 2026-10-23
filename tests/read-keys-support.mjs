import assert from 'node:assert/strict';
import {completeSecondFactor} from './mfa-auth-support.mjs';
import {emailSignIn} from './auth-test-support.mjs';
import {inviteDoorMember} from './access-door-support.mjs';
import {main as keysCommand} from '../scripts/api-keys.mjs';
export async function proveReadKeys({origin,db,cookie,ids,from,to}){
 const owner=(path,method='GET',body,session=cookie)=>fetch(origin+path,{method,headers:{origin,cookie:session,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 const spec=(name,resources={mode:'selection',monitorIds:[ids[0]],tags:[]})=>({name,scopes:['monitoring:read'],expiresAt:Date.now()+3600000,resources});
 const issue=async(body,session=cookie)=>{const response=await owner('/api/credentials','POST',body,session);assert.equal(response.status,201,'native owner with fresh factor creates a key');return response.json()};
 const read=(key,path,method='GET',body,headers={})=>fetch(origin+path,{method,headers:{origin,'content-type':'application/json',authorization:'Bearer '+key.token,...headers},...(body?{body:JSON.stringify(body)}:{})});
 const usage=async()=> (await db.prepare('SELECT COUNT(*) n FROM integration_token_usage').first()).n;
 const evidence=async()=>Object.fromEntries(await Promise.all(['monitors','revisions','slots','observations','incident_comments','incident_work'].map(async table=>[table,(await db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results])));
 await db.prepare('UPDATE uptime_mfa_proofs SET verified_at=?').bind(Date.now()-300001).run();
 assert.equal((await owner('/api/credentials','POST',spec('stale proof'))).status,403);await completeSecondFactor(origin,cookie);
 for(const body of [{...spec('missing expiry'),expiresAt:undefined},{...spec('expired'),expiresAt:Date.now()-1},{...spec('write scope'),scopes:['definitions:apply']}])assert.equal((await owner('/api/credentials','POST',body)).status,400);
 const selected=await keysCommand(['--origin',origin,'create'],{UPTIME_ACCESS_COOKIE:cookie},fetch,spec('Selected monitor'));
 const stored=await db.prepare('SELECT token_hash FROM integration_tokens WHERE namespace=(SELECT namespace FROM uptime_credential_grants WHERE id=?)').bind(selected.credential.id).first();assert.notEqual(stored.token_hash,selected.token);
 let metadata=await keysCommand(['--origin',origin,'list'],{UPTIME_ACCESS_COOKIE:cookie});assert.ok(!JSON.stringify(metadata).includes(selected.token));assert.ok(!JSON.stringify(metadata).includes(stored.token_hash));assert.equal(metadata.find(k=>k.id===selected.credential.id).lastUsedAt,null);
 const before=evidence(),usedBefore=await usage();
 for(const path of ['/api/monitors/'+ids[0],'/api/incidents/unknown/comments','/api/credentials'])for(const method of ['POST','PATCH','DELETE'])assert.equal((await read(selected,path,method,method==='DELETE'?undefined:{})).status,403);
 for(const path of ['/api/archive','/api/definitions/export','/api/access/members'])assert.equal((await read(selected,path)).status,403);
 assert.equal(await usage(),usedBefore,'forbidden capabilities do not record token usage');assert.deepEqual(await evidence(),await before,'read keys never mutate incident or monitor data');
 assert.equal((await read({token:'int_'+'f'.repeat(64)},'/api/v1/monitors','GET',undefined,{cookie})).status,401,'unknown bearer cannot fall back to owner cookie');
 const outside=await read(selected,'/api/v1/monitors/'+ids[1]),missing=await read(selected,'/api/v1/monitors/missing');assert.equal(outside.status,404);assert.equal(missing.status,404);assert.deepEqual(await outside.json(),await missing.json());
 const query=new URLSearchParams({from:String(from),to:String(to)}),single='/api/v1/monitors/'+ids[0];
 for(const path of [single,single+'/uptime?'+query,single+'/report?'+query,single+'/response-times?'+query,'/api/v1/monitors','/api/v1/uptime?'+query,'/api/v1/incidents','/api/v1/metrics?'+query+'&format=json']){
  const response=await read(selected,path);assert.equal(response.status,200,`${path}: ${response.status}`);assert.ok(response.headers.has('ratelimit'));
  const head=await read(selected,path,'HEAD');assert.equal(head.status,200);assert.equal(await head.text(),'');
 }
 const report=await(await read(selected,single+'/report?'+query)).json(),same=await(await owner(single+'/report?'+query)).json();assert.deepEqual(report.availability,same.availability);
 for(const format of ['csv','pdf']){const response=await read(selected,single+'/report?'+query+'&format='+format);assert.equal(response.status,200);assert.match(response.headers.get('content-type'),format==='csv'?/text\/csv/:/application\/pdf/)}
 const list=await(await read(selected,'/api/v1/monitors')).json();assert.deepEqual(list.items.map(m=>m.id),[ids[0]]);
 const incidents=await(await read(selected,'/api/v1/incidents')).json();assert.ok(incidents.items.length);assert.ok(incidents.items.every(i=>i.monitorId===ids[0]));
 const incident=await read(selected,'/api/v1/incidents/'+encodeURIComponent(incidents.items[0].id));assert.equal(incident.status,200);assert.deepEqual((await incident.json()).failureSnapshots,[]);
 const detailHead=await read(selected,'/api/v1/incidents/'+encodeURIComponent(incidents.items[0].id),'HEAD');assert.equal(detailHead.status,200);assert.equal(await detailHead.text(),'');
 assert.equal((await read(selected,'/api/v1/uptime?monitor='+ids[1])).status,404);
 for(const source of ['not-a-source','UptimeRobot'])assert.equal((await read(selected,single+'/uptime?source='+source)).status,400);
 metadata=await keysCommand(['--origin',origin,'list'],{UPTIME_ACCESS_COOKIE:cookie});assert.ok(metadata.find(k=>k.id===selected.credential.id).lastUsedAt);
 const tagged=await issue(spec('Customer tags',{mode:'selection',monitorIds:[],tags:['customer']})),seen=[];let cursor;
 do{const response=await read(tagged,'/api/v1/monitors?'+new URLSearchParams({limit:'1',...(cursor?{cursor}:{})}));assert.equal(response.status,200);const page=await response.json();seen.push(...page.items.map(m=>m.id));cursor=page.nextCursor}while(cursor);
 assert.deepEqual(seen,[ids[0],ids[1]].sort());assert.equal((await read(tagged,'/api/v1/monitors/'+ids[2])).status,404);
 const combined=await issue(spec('Intersected filters',{mode:'selection',monitorIds:[ids[0],ids[2]],tags:['customer']}));assert.deepEqual((await(await read(combined,'/api/v1/monitors')).json()).items.map(m=>m.id),[ids[0]]);assert.equal((await read(combined,'/api/v1/monitors/'+ids[2])).status,404);
 const empty=await issue(spec('Explicit empty',{mode:'selection',monitorIds:[],tags:[]}));assert.deepEqual((await(await read(empty,'/api/v1/monitors')).json()).items,[]);assert.deepEqual((await(await read(empty,'/api/v1/uptime?'+query)).json()).monitors,[]);
 const limited=await issue(spec('Rate budget'));let rate;
 for(let n=0;n<130;n++){rate=await read(limited,single,'HEAD');if(rate.status===429)break;assert.equal(rate.status,200)}
 assert.equal(rate.status,429);assert.ok(Number(rate.headers.get('retry-after'))>0);assert.equal((await read(tagged,single,'HEAD')).status,200,'independent key budget');
 await keysCommand(['--origin',origin,'revoke','--id',selected.credential.id],{UPTIME_ACCESS_COOKIE:cookie});assert.equal((await read(selected,single)).status,401);
 const expiresAt=(Math.floor(Date.now()/1000)+1)*1000+500,expiring=await issue({...spec('Exact millisecond expiry'),expiresAt});
 await new Promise(resolve=>setTimeout(resolve,Math.max(0,expiresAt-Date.now()+5)));assert.equal((await read(expiring,single)).status,401,'public request after exact subsecond expiry is refused');
 await db.prepare('UPDATE integration_tokens SET expires_at=? WHERE namespace=(SELECT namespace FROM uptime_credential_grants WHERE id=?)').bind(Date.now()-1,tagged.credential.id).run();assert.equal((await read(tagged,single)).status,401);
 // Native second owner admission gives a separate accountable issuer to revoke.
 const fresh=await emailSignIn(origin),other=await inviteDoorMember(origin,fresh,'owner','read-key-issuer');await completeSecondFactor(origin,other.cookie);
 const issuedOther=await issue(spec('Separate issuer'),other.cookie);assert.equal((await read(issuedOther,single)).status,200);
 assert.equal((await owner('/auth/operator/status','POST',{operatorId:other.id,status:'inactive'},fresh)).status,200);assert.equal((await read(issuedOther,single)).status,401);
 console.log('READAPI key slice: native owner/fresh-factor issuance, CLI, immutable resource pagination, GET/HEAD shared figures, format reads, per-key limits, no-write denial, expiry/revocation/issuer removal and local-only archive authority.');
}

// The reporting fixture intentionally contains partial historical events. Prove
// archive custody through the valid native installation before seeding it.
export async function proveCredentialArchive({origin,cookie}){
 const created=await fetch(origin+'/api/credentials',{method:'POST',headers:{origin,cookie,'content-type':'application/json'},body:JSON.stringify({name:'Local authority archive exclusion',scopes:['monitoring:read'],expiresAt:Date.now()+3600000,resources:{mode:'workspace',monitorIds:[],tags:[]}})});assert.equal(created.status,201);const key=await created.json();
 const response=await fetch(origin+'/api/archive',{headers:{origin,cookie}});assert.equal(response.status,200);const text=await response.text();assert.ok(!text.includes(key.token)&&!text.includes('uptime_credential_grants')&&!text.includes('uptime_credential_workspace'));
}
