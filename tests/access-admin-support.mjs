import assert from 'node:assert/strict';
import {sessionCookie} from './auth-test-support.mjs';
import {readDeliveredMessages} from './mail-provider-fixture.mjs';

// Extend the existing access matrix; no new registration or fake authority.
export async function proveAdminMonitorRead({origin,call,fetcher,DB,cookie,memberCookie,hosted,mails}) {
 const invited=await call('/auth/invite',{email:'synthetic-uptime-admin@example.test',displayName:'Synthetic Uptime Admin',role:'admin'},{cookie});
 assert.equal(invited.status,202);
 const delivered=hosted?mails.at(-1):(await readDeliveredMessages()).filter(m=>m.origin===origin).at(-1)?.message;
 assert.ok(delivered,'invitation reached the authorized mail edge');
 const link=new URL(delivered.content.find(c=>c.type==='text/plain').value.match(/https?:\/\/[^\s]+/)[0]);
 const accepted=await call('/auth/confirm',{token:link.searchParams.get('token')});
 const adminCookie=sessionCookie(accepted);assert.ok(adminCookie);
 const admin=await DB.prepare("SELECT id,role FROM oa_operators WHERE email='synthetic-uptime-admin@example.test'").first();assert.equal(admin.role,'admin');
 const monitor=await DB.prepare('SELECT id FROM monitors ORDER BY rowid LIMIT 1').first(),path='/api/v1/monitors/'+encodeURIComponent(monitor.id);
 const response=await call(path,undefined,{cookie:adminCookie});assert.equal(response.status,200);const summary=await response.json();assert.equal(summary.id,monitor.id);
 const head=await fetcher(origin+path,{method:'HEAD',headers:{host:new URL(origin).host,origin,cookie:adminCookie}});assert.equal(head.status,200);assert.equal(await head.text(),'');
 assert.equal((await call('/api/v1/monitors/missing-monitor',undefined,{cookie:adminCookie})).status,404);
 for(const other of ['/api/overview','/api/archive','/api/definitions/export','/api/v1/monitors'])assert.equal((await call(other,undefined,{cookie:adminCookie})).status,401,'summary authority does not widen another door');
 const before=(await DB.prepare('SELECT COUNT(*) n FROM monitors').first()).n;
 assert.equal((await call('/api/monitors',{name:'synthetic-uptime-refused',url:'https://synthetic-uptime.example.test/'},{cookie:adminCookie})).status,401);
 assert.equal((await DB.prepare('SELECT COUNT(*) n FROM monitors').first()).n,before);
 assert.equal((await call(path,undefined,{cookie:memberCookie,'x-role':'admin','x-operator-role':'owner'})).status,401,'client claims cannot turn a member into an admin');
 // An already-authorized response is retained across removal; every later request re-reads live Base authority.
 const authorized=await call(path,undefined,{cookie:adminCookie});assert.equal(authorized.status,200);
 assert.equal((await call('/auth/operator/status',{operatorId:admin.id,status:'inactive'},{cookie})).status,200);
 assert.equal((await authorized.json()).id,monitor.id,'removal preserves the already-authorized result');
 for(const verb of ['GET','HEAD'])assert.equal((await fetcher(origin+path,{method:verb,headers:{host:new URL(origin).host,origin,cookie:adminCookie}})).status,401);
 assert.equal((await call(path,undefined,{cookie})).status,200,'owner access and preserved monitor result remain available');
 console.log('ACCESS-001 Base admin invitation at the mail edge, exact monitor summary GET/HEAD, missing monitor, refused writes/exports/list and forged member role, preserved authorized response and immediate post-removal denial passed.');
}
