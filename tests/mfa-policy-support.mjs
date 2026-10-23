import assert from 'node:assert/strict';
import {authenticatorCode,completeSecondFactor,factorRequest} from './mfa-auth-support.mjs';
import {emailSignIn,sessionCookie} from './auth-test-support.mjs';
import {readDeliveredMessages} from './mail-provider-fixture.mjs';
import {main as mfaCommand} from '../scripts/mfa.mjs';

export async function proveMfaPolicy({origin,bindings,call,cookie,DB}){
 // RFC 6238 published SHA-1 vector, independent authenticator-side generator.
 assert.equal(authenticatorCode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',59000,8),'94287082');
 const state=await completeSecondFactor(origin,cookie),mfa=factorRequest(origin,cookie),owner=(await DB.prepare("SELECT id FROM oa_operators WHERE role='owner'").first()).id;
 const status=await (await mfa('/status')).json();assert.ok(status.verified&&status.fresh);assert.ok(!JSON.stringify(status).includes(state.secret));assert.ok(!Object.hasOwn(status,'recoveryCodes'));
 const stored=await DB.prepare('SELECT secret,counter FROM uptime_mfa_factors WHERE id=?').bind(state.id).first();assert.ok(!stored.secret.includes(state.secret),'factor seed is sealed at rest');
 const recoveryRows=(await DB.prepare('SELECT digest FROM uptime_mfa_recovery WHERE operator_id=?').bind(owner).all()).results;assert.equal(recoveryRows.length,10);for(const code of state.recoveryCodes)assert.ok(!JSON.stringify(recoveryRows).includes(code),'recovery material is hashed');
 // A second email-link session is real Base authentication, not a factor proof.
 const emailOnly=await emailSignIn(origin,{bindings,secondFactor:false}),emailMfa=factorRequest(origin,emailOnly);
 for(const path of ['/api/overview','/app','/setup','/api/editor/config','/_serverFn/private','/auth/operators','/auth/session'])assert.equal((await call(path,undefined,{cookie:emailOnly})).status,403,'email-only factored account is gated at every private dispatcher');
 assert.equal((await emailMfa('/status')).status,200,'factor-only door remains available');
 const nextCode=authenticatorCode(state.secret,(Math.max(stored.counter+1,Math.floor(Date.now()/30000)))*30000);
 assert.equal((await emailMfa('/totp/verify',{code:nextCode})).status,200,'email sign-in completes with a real TOTP');
 assert.equal((await emailMfa('/totp/verify',{code:nextCode})).status,400,'TOTP counter cannot be replayed');
 assert.equal((await call('/api/overview',undefined,{cookie:emailOnly})).status,200);
 // A code is atomically consumed even when two concurrent requests present it.
 const code=state.recoveryCodes.shift(),race=await Promise.all([emailMfa('/recovery/verify',{code}),emailMfa('/recovery/verify',{code})]);assert.equal(race.filter(r=>r.status===200).length,1);assert.ok(race.every(r=>[200,400,409].includes(r.status)));
 assert.equal((await emailMfa('/recovery/verify',{code})).status,400,'used recovery code is refused');
 const destination=await call('/api/notifications/destinations',{name:'Synthetic MFA rotation',kind:'webhook',url:'https://receiver.example.com/events'},{cookie});assert.equal(destination.status,201,await destination.clone().text());const destinationId=(await destination.json()).id;
 const monitor=await call('/api/monitors',{name:'Synthetic MFA erase',type:'heartbeat',canaryUrl:'https://canary.example.test/health',heartbeat:{maxAgeMs:60000}},{cookie});assert.equal(monitor.status,201);const monitorId=(await monitor.json()).id;
 await DB.prepare('UPDATE uptime_mfa_proofs SET verified_at=? WHERE operator_id=?').bind(Date.now()-300001,owner).run();
 for(const [path,body] of [[`/api/monitors/${monitorId}/erase`,{name:'Synthetic MFA erase'}],[`/api/notifications/destinations/${destinationId}/rotate`,{}],['/api/restore',{}],['/api/runners',{name:'Synthetic denied runner'}],['/api/metrics/keys',{}],['/api/access/invitations',{email:'synthetic-denied-mfa@example.test',displayName:'Denied',role:'read-only'}]]){
  const denied=await call(path,body,{cookie});assert.equal(denied.status,403);assert.equal((await denied.json()).code,'fresh_second_factor_required');
 }
 assert.equal((await call('/api/archive',undefined,{cookie})).status,403,'archive export also needs fresh proof');
 assert.equal((await mfa('/policy',{required:true})).status,403,'policy cannot elevate its own expired proof');
 assert.equal((await mfa('/recovery/verify',{code:state.recoveryCodes.shift()})).status,200);
 assert.equal((await call(`/api/notifications/destinations/${destinationId}/rotate`,{},{cookie})).status,200,'fresh second factor admits rotation');
 assert.equal((await call(`/api/monitors/${monitorId}/erase`,{name:'Synthetic MFA erase'},{cookie})).status,200,'fresh second factor admits erasure');
 const archiveResponse=await call('/api/archive',undefined,{cookie});assert.equal(archiveResponse.status,200,archiveResponse.status===200?'':await archiveResponse.clone().text());const archive=await archiveResponse.text();assert.ok(!archive.includes(state.secret));for(const value of state.recoveryCodes)assert.ok(!archive.includes(value));assert.ok(!archive.includes('uptime_mfa_factors'));
 // Require-all revokes old factorless sessions. New email-only sessions can
 // enroll, including Base members who have not received a product role.
 const unverified=await emailSignIn(origin,{bindings,secondFactor:false});
 const required=await mfa('/policy',{required:true});assert.equal(required.status,200);assert.ok((await required.json()).revokedSessions>=1);assert.equal((await call('/api/overview',undefined,{cookie:unverified})).status,401);
 const latest=await emailSignIn(origin,{bindings,secondFactor:false});assert.equal((await call('/api/overview',undefined,{cookie:latest})).status,403);const latestMfa=factorRequest(origin,latest);assert.equal((await latestMfa('/recovery/verify',{code:state.recoveryCodes.shift()})).status,200);assert.equal((await call('/api/overview',undefined,{cookie:latest})).status,200,'last owner recovers with a single-use code');
 // Base role membership comes through real invitation + confirmation.
 const email='synthetic-mfa-member@example.test';assert.equal((await call('/auth/invite',{email,displayName:'Synthetic MFA member',role:'member'},{cookie})).status,202);
 const delivered=(await readDeliveredMessages()).findLast(m=>m.origin===origin&&m.message.subject.startsWith("You're invited")&&m.message.personalizations.some(p=>p.to.some(t=>t.email===email)));assert.ok(delivered);const link=new URL(delivered.text.match(/https?:\/\/[^\s]+/)[0]);
 const memberCookie=sessionCookie(await call('/auth/confirm',{token:link.searchParams.get('token')})),memberMfa=factorRequest(origin,memberCookie);assert.equal((await call('/api/overview',undefined,{cookie:memberCookie})).status,403);const memberState=await completeSecondFactor(origin,memberCookie);assert.ok(memberState);assert.equal((await call('/api/overview',undefined,{cookie:memberCookie})).status,401,'enrollment does not grant a product role');
 const memberId=(await DB.prepare('SELECT id FROM oa_operators WHERE email=?').bind(email).first()).id;assert.equal((await mfa('/reset',{operatorId:memberId})).status,200);assert.equal((await memberMfa('/status')).status,401,'owner reset revokes the member session');assert.equal((await DB.prepare('SELECT COUNT(*) n FROM uptime_mfa_factors WHERE operator_id=?').bind(memberId).first()).n,0);
 // Reset/erasure have no residual factor authority. Erasure keeps opaque audit.
 assert.equal((await call(`/api/operators/${memberId}/erase`,{},{cookie})).status,200);for(const name of ['factors','challenges','proofs','recovery','limits','notices'])assert.equal((await DB.prepare(`SELECT COUNT(*) n FROM uptime_mfa_${name} WHERE operator_id=?`).bind(memberId).first()).n,0);
 const actions=(await DB.prepare("SELECT action,actor_ref,subject_ref FROM uptime_audit WHERE action LIKE 'mfa_%'").all()).results;assert.ok(actions.some(a=>a.action==='mfa_enrolled_totp'));assert.ok(actions.some(a=>a.action==='mfa_recovery_used'));assert.ok(actions.some(a=>a.action==='mfa_policy_changed'));assert.ok(!JSON.stringify(actions).includes(state.secret));assert.ok(!JSON.stringify(actions).includes(code));
 const notices=(await readDeliveredMessages()).filter(m=>m.origin===origin&&m.message.subject==='Uptime second-factor security change');assert.ok(notices.length>0,'existing Base mail edge receives member notices');for(const notice of notices){assert.ok(!JSON.stringify(notice.message).includes(state.secret));assert.ok(!JSON.stringify(notice.message).includes(code))}
 const outcomeRows=(await DB.prepare('SELECT outcome FROM uptime_mfa_notices').all()).results;assert.ok(outcomeRows.every(r=>r.outcome==='accepted'),'provider outcomes are retained without provider bodies');
 assert.equal((await mfaCommand(['status','--origin',origin],{UPTIME_ACCESS_COOKIE:cookie})).fresh,true,'CLI uses the same authenticated API');
 // One durable limiter covers enrollment, removal, recovery and policy writes.
 const pending=await emailSignIn(origin,{bindings,secondFactor:false}),limited=factorRequest(origin,pending);let count=0,response;do{response=await limited('/recovery/verify',{code:'invalid'});count++}while(response.status!==429&&count<=31);assert.equal(response.status,429);assert.ok(response.headers.get('retry-after'));assert.equal((await limited('/policy',{required:false})).status,429);assert.equal((await limited('/totp/enroll',{})).status,429);
 console.log('ACCESS-003 API/CLI TOTP, recovery consumption, enforced private doors/revocation, fresh erasure/rotation/export, member enrollment/reset/erasure, opaque audit/notices and durable limits. Console and provider-MFA assertion remain open.');
}
