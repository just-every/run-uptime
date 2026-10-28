import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium} from 'playwright';
import {startLocalWorker} from './mail-provider-fixture.mjs';
import {testAuthBindings,emailSignIn,sessionCookie,authRequest} from './auth-test-support.mjs';
import {factorRequest} from './mfa-auth-support.mjs';
import {splitSql} from './migration-support.mjs';

// A Chromium CTAP2 authenticator creates and signs the real WebAuthn payloads.
// The only fake is the authorized authenticator/provider edge, never verification.
async function credentialResponse(page,options,enroll){
 return page.evaluate(async({options,enroll})=>{
  const decode=text=>Uint8Array.from(atob(text.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
  const encode=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
  const publicKey={...options,challenge:decode(options.challenge)};
  if(enroll){publicKey.user={...options.user,id:decode(options.user.id)};publicKey.excludeCredentials=options.excludeCredentials?.map(c=>({...c,id:decode(c.id)}))}
  else publicKey.allowCredentials=options.allowCredentials?.map(c=>({...c,id:decode(c.id)}));
  const value=await navigator.credentials[enroll?'create':'get']({publicKey}),response=value.response;
  return {id:value.id,rawId:encode(value.rawId),type:value.type,clientExtensionResults:value.getClientExtensionResults(),authenticatorAttachment:value.authenticatorAttachment,
   response:{clientDataJSON:encode(response.clientDataJSON),...(enroll?{attestationObject:encode(response.attestationObject),transports:response.getTransports()}:{authenticatorData:encode(response.authenticatorData),signature:encode(response.signature),userHandle:response.userHandle?encode(response.userHandle):null})}};
 },{options,enroll});
}
export async function proveMfaWebAuthn(){
 const directory=await mkdtemp(join(tmpdir(),'uptime-passkey-')),origin='http://localhost:15503',bindings={...testAuthBindings,UPTIME_ORIGIN:origin};
 let worker,browser;
 try{
  worker=await startLocalWorker({port:15503,persist:directory,bindings});const DB=await worker.getD1Database('DB');
  for(const file of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())for(const sql of splitSql(await readFile(join('migrations',file),'utf8')))await DB.prepare(sql).run();
  const cookie=sessionCookie(await authRequest(origin)('/auth/bootstrap',{token:bindings.SETUP_TOKEN,displayName:'Synthetic passkey owner'})),mfa=factorRequest(origin,cookie);
  browser=await chromium.launch({...(process.env.UPTIME_BROWSER_EXECUTABLE?{executablePath:process.env.UPTIME_BROWSER_EXECUTABLE}:{}),headless:true,args:['--no-sandbox','--use-mock-keychain','--password-store=basic'],...(process.env.UPTIME_BROWSER_EXECUTABLE?{executablePath:process.env.UPTIME_BROWSER_EXECUTABLE}:{})});
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();await page.goto(origin+'/login');
  const cdp=await context.newCDPSession(page);await cdp.send('WebAuthn.enable');
  const {authenticatorId}=await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'usb',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}});
  const enrollment=await mfa('/webauthn/enroll',{});assert.equal(enrollment.status,200);const pending=await enrollment.json();
  const credential=await credentialResponse(page,pending.options,true);
  const accepted=await mfa('/webauthn/confirm',{challengeId:pending.challengeId,credential});assert.equal(accepted.status,200);const factor=await accepted.json();assert.equal(new Set(factor.recoveryCodes).size,10);
  assert.equal((await mfa('/webauthn/confirm',{challengeId:pending.challengeId,credential})).status,400,'registration challenge is one use');
  const signed=await emailSignIn(origin,{bindings,secondFactor:false}),verify=factorRequest(origin,signed),call=authRequest(origin);
  assert.equal((await call('/api/overview',undefined,{cookie:signed})).status,403);
  const challengeResponse=await verify('/webauthn/options',{});assert.equal(challengeResponse.status,200);const challenge=await challengeResponse.json();
  const assertion=await credentialResponse(page,challenge.options,false);
  const foreign=structuredClone(assertion),client=JSON.parse(Buffer.from(foreign.response.clientDataJSON,'base64url'));client.origin='https://foreign.example.test';foreign.response.clientDataJSON=Buffer.from(JSON.stringify(client)).toString('base64url');
  assert.equal((await verify('/webauthn/verify',{challengeId:challenge.challengeId,credential:foreign})).status,400,'foreign-origin assertion is refused');
  assert.equal((await verify('/webauthn/verify',{challengeId:challenge.challengeId,credential:assertion})).status,200,'real authenticator signature completes email-link sign-in');
  assert.equal((await verify('/webauthn/verify',{challengeId:challenge.challengeId,credential:assertion})).status,400,'assertion challenge cannot be replayed');
  assert.equal((await call('/api/overview',undefined,{cookie:signed})).status,200);
  const sessions=(await DB.prepare('SELECT session_id FROM uptime_mfa_proofs').all()).results;assert.equal(sessions.length,2,'proofs bind the two live Base session IDs independently');
  const boundResponse=await mfa('/webauthn/options',{});assert.equal(boundResponse.status,200);const bound=await boundResponse.json(),boundCredential=await credentialResponse(page,bound.options,false);
  assert.equal((await verify('/webauthn/verify',{challengeId:bound.challengeId,credential:boundCredential})).status,400,'another live session cannot redeem the challenge');
  assert.equal((await mfa('/webauthn/verify',{challengeId:bound.challengeId,credential:boundCredential})).status,200);
  const expiredResponse=await mfa('/webauthn/options',{});assert.equal(expiredResponse.status,200);const expired=await expiredResponse.json();
  await DB.prepare('UPDATE uptime_mfa_challenges SET expires_at=? WHERE id=?').bind(Date.now()-1,expired.challengeId).run();
  assert.equal((await mfa('/webauthn/verify',{challengeId:expired.challengeId,credential:await credentialResponse(page,expired.options,false)})).status,400,'expired challenge refuses a genuine signature');
  await cdp.send('WebAuthn.removeVirtualAuthenticator',{authenticatorId});await context.close();
  console.log('ACCESS-003 real Chromium CTAP2 enrollment and email-link second factor; origin, expiry, session binding and replay refusals.');
 }finally{await browser?.close();await worker?.dispose();await rm(directory,{recursive:true,force:true})}
}
