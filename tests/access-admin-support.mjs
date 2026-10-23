import {completeSecondFactor} from './mfa-auth-support.mjs';
import assert from 'node:assert/strict';
import {sessionCookie} from './auth-test-support.mjs';
import {readDeliveredMessages} from './mail-provider-fixture.mjs';
import {main as accessCommand} from '../scripts/access.mjs';
import {proveScopedAccess} from './access-scope-support.mjs';

// Extend the existing access matrix, with real Base invitations and mail only
// faked at the authorized provider edge. No extra registration or fake session.
export async function proveMemberLifecycle({origin,call,fetcher,DB,cookie,memberCookie,hosted,mails}) {
 async function accept(email){
  const delivered=hosted?mails.findLast(m=>m.personalizations.some(p=>p.to.some(to=>to.email===email))): (await readDeliveredMessages()).findLast(m=>m.origin===origin&&m.message.personalizations.some(p=>p.to.some(to=>to.email===email)))?.message;
  assert.ok(delivered,'invitation reached the authorized mail edge');
  const link=new URL(delivered.content.find(c=>c.type==='text/plain').value.match(/https?:\/\/[^\s]+/)[0]);
  const accepted=await call('/auth/confirm',{token:link.searchParams.get('token')});
  const acceptedCookie=sessionCookie(accepted);assert.ok(acceptedCookie);
  await completeSecondFactor(origin,acceptedCookie,fetcher);
  const person=await DB.prepare('SELECT id,role,version FROM oa_operators WHERE email=?').bind(email).first();
  return {id:person.id,cookie:acceptedCookie,baseRole:person.role};
 }
 async function invite(role,scopes=[],viaCLI=false){
  const email=`synthetic-uptime-${role}@example.test`;
  if(viaCLI)assert.deepEqual(await accessCommand(['--origin',origin,'invite','--email',email,'--name',`Synthetic ${role}`,'--role',role,...scopes.flatMap(s=>['--scope',s.kind+':'+s.value])],{UPTIME_ACCESS_COOKIE:cookie},fetcher),{status:'accepted'});
  else assert.equal((await call('/api/access/invitations',{email,displayName:`Synthetic ${role}`,role,scopes},{cookie})).status,202);
  const person=await accept(email);
  const response=await call('/api/access/self',undefined,{cookie:person.cookie});assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{id:person.id,role,scopes,revision:(await DB.prepare('SELECT revision FROM uptime_member_roles WHERE operator_id=?').bind(person.id).first()).revision});
  return person;
 }
 // The original Base admin invitation door remains public and authoritative.
 const email='synthetic-uptime-admin@example.test';
 assert.equal((await call('/auth/invite',{email,displayName:'Synthetic Uptime Admin',role:'admin'},{cookie})).status,202);
 const admin=await accept(email);assert.equal(admin.baseRole,'admin');
 const monitor=await DB.prepare('SELECT id,definition FROM monitors ORDER BY rowid LIMIT 1').first(),path='/api/v1/monitors/'+encodeURIComponent(monitor.id);
 const response=await call(path,undefined,{cookie:admin.cookie});assert.equal(response.status,200);assert.equal((await response.json()).id,monitor.id);
 const head=await fetcher(origin+path,{method:'HEAD',headers:{host:new URL(origin).host,origin,cookie:admin.cookie}});assert.equal(head.status,200);assert.equal(await head.text(),'');
 assert.equal((await call('/api/v1/monitors/missing-monitor',undefined,{cookie:admin.cookie})).status,404);
 // C11's summary-only limit is deliberately replaced by the complete product
 // role policy. Identity/import/erasure remain explicit owner-only doors.
 for(const other of ['/api/overview','/api/archive','/api/definitions/export','/api/v1/monitors'])assert.equal((await call(other,undefined,{cookie:admin.cookie})).status,200,'workspace admin product read/export');
 for(const other of ['/api/business-import-settings','/api/metrics/keys'])assert.equal((await call(other,undefined,{cookie:admin.cookie})).status,403,'owner-only administration');
 const created=await call('/api/monitors',{name:'synthetic-uptime-admin-check',type:'heartbeat',canaryUrl:'https://canary.example.test/health',heartbeat:{maxAgeMs:60000}},{cookie:admin.cookie});assert.equal(created.status,201);
 const editor=await invite('editor'),responder=await invite('responder'),reader=await invite('read-only',[],true);
 for(const person of [editor,responder,reader]){
  assert.equal(person.baseRole,'member');assert.equal((await call(path,undefined,{cookie:person.cookie})).status,200);
  for(const denied of ['/api/archive','/api/definitions/export','/api/discovery-sources','/api/notifications/destinations'])assert.equal((await call(denied,undefined,{cookie:person.cookie})).status,403);
  assert.equal((await call('/api/access/invitations',{email:'synthetic-denied@example.test',displayName:'Denied',role:'admin'},{cookie:person.cookie})).status,403);
 }
 const definition={name:'synthetic-uptime-editor-check',type:'heartbeat',canaryUrl:'https://canary.example.test/health',heartbeat:{maxAgeMs:60000},service:'synthetic-service-a',group:'synthetic-team-a'};
 const edited=await call('/api/monitors',definition,{cookie:editor.cookie});assert.equal(edited.status,201);const target=await edited.json();
 const patch=(person,body)=>fetcher(origin+'/api/monitors/'+target.id,{method:'PATCH',redirect:'manual',headers:{host:new URL(origin).host,origin,'content-type':'application/json',cookie:person.cookie},body:JSON.stringify(body)});
 assert.equal((await patch(editor,{...target.definition,name:'synthetic-uptime-editor-revised'})).status,200);
 for(const person of [reader,responder])assert.equal((await patch(person,{...target.definition,name:'synthetic-refused-edit'})).status,403);
 for(const person of [admin,responder,editor])assert.equal((await call(`/api/monitors/${target.id}/run`,{},{cookie:person.cookie})).status,200);
 assert.equal((await call(`/api/monitors/${target.id}/run`,{},{cookie:reader.cookie})).status,403);
 const contact=await call('/api/notifications/destinations',{name:'synthetic-admin-contact',kind:'email',address:'synthetic-uptime-contact@example.test'},{cookie:admin.cookie});assert.equal(contact.status,201);const destination=await contact.json();
 for(const person of [reader,responder,editor])assert.equal((await call('/api/notifications/destinations',{name:'synthetic-denied',kind:'email',address:'synthetic-denied@example.test'},{cookie:person.cookie})).status,403);
 const routing={scope:'monitor',mode:'selected',destinationIds:[destination.id],expectedRevision:0};
 const preview=await call(`/api/monitors/${target.id}/alert-route/preview`,routing,{cookie:editor.cookie});assert.equal(preview.status,200);const review=await preview.json();
 assert.equal((await call(`/api/monitors/${target.id}/alert-route/apply`,{...routing,digest:review.digest},{cookie:editor.cookie})).status,200);
 for(const person of [reader,responder])assert.equal((await call(`/api/monitors/${target.id}/alert-route/preview`,routing,{cookie:person.cookie})).status,403);
 assert.equal((await call(path,undefined,{cookie:memberCookie,'x-role':'admin','x-operator-role':'owner'})).status,401,'client claims cannot turn an unassigned Base member into an administrator');
 const before=(await DB.prepare('SELECT COUNT(*) n FROM monitors').first()).n;
 assert.equal((await call('/api/monitors',definition,{cookie:reader.cookie,'x-role':'owner','x-operator-id':admin.id})).status,403);
 assert.equal((await DB.prepare('SELECT COUNT(*) n FROM monitors').first()).n,before);
 await proveScopedAccess({origin,call,fetcher,DB,cookie,editor,responder,reader,target,invite});
 // Role narrowing and Base removal use live authority. Already authorized
 // results remain available; later operations observe the changed assignment.
 const held=await call(path,undefined,{cookie:editor.cookie});assert.equal(held.status,200);
 assert.equal((await call(`/api/access/members/${editor.id}`,{role:'read-only'},{cookie})).status,200);
 assert.equal((await patch(editor,target.definition)).status,403);assert.equal((await held.json()).id,monitor.id);
 const authorized=await call(path,undefined,{cookie:admin.cookie});assert.equal(authorized.status,200);
 assert.equal((await call('/auth/operator/status',{operatorId:admin.id,status:'inactive'},{cookie})).status,200);
 assert.equal((await authorized.json()).id,monitor.id);
 for(const verb of ['GET','HEAD'])assert.equal((await fetcher(origin+path,{method:verb,headers:{host:new URL(origin).host,origin,cookie:admin.cookie}})).status,401);
 assert.equal((await call(path,undefined,{cookie})).status,200);
 const audits=(await DB.prepare("SELECT actor_kind,actor_ref,action,subject_ref FROM uptime_audit WHERE action LIKE 'access_%'").all()).results;
 for(const [person,action] of [[editor,'access_check_write'],[editor,'access_route_write'],[responder,'access_maintenance_write'],[admin,'access_secret_write'],[admin,'access_export']])assert.ok(audits.some(a=>a.actor_kind==='operator'&&a.actor_ref===person.id&&a.action===action),action+' retains its live actor');
 assert.ok(!JSON.stringify(audits).includes('synthetic-uptime-contact@example.test'),'permission audit contains no request values');
 console.log('ACCESS-001 lifecycle/API/CLI: live owner/admin/editor/responder/read-only, invitations, assignment/removal, role actions/refusals, scope boundaries, stale/forged authority and opaque mutation/export audit. UI and API/CI credentials remain gaps.');
}
