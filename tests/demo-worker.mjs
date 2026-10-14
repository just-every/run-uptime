import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readdir,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomBytes,createHmac} from 'node:crypto';
import {hostedRuntime} from './hosted-auth-runtime.mjs';
import {splitSql} from './migration-support.mjs';
import {claimKeys,signClaim} from '@runeditrun/rer/internal/modules/demo-host/claim.mjs';

function demoBarEntries(html){
 const marker=html.match(/<aside\b(?:[^>"']|"[^"]*"|'[^']*')*?\s+id="rer-demo-bar"[^>]*>([\s\S]*?)<\/aside>/);
 assert.ok(marker,'signed-in app exposes the demo marker');
 return [...marker[1].matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map(([,entry])=>entry.replace(/<[^>]*>/g,'').replace(/&(amp|lt|gt|quot|#39);/g,(_,entity)=>({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'"})[entity]));
}

test('HTTPS demo signed claim uses exact bound origin, captures mail and blocks scheduled heartbeat without egress',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'uptime-demo-worker-')),origin='https://demo.example.test',keys=await claimKeys(),installationId=crypto.randomUUID();
 const settings={RER_DEMO:'1',RER_DEMO_EXPIRES:new Date(Date.now()+3600000).toISOString(),UPTIME_ORIGIN:origin,OWNER_EMAIL:'owner@demo.invalid',SESSION_SECRET:randomBytes(32).toString('hex'),SETUP_TOKEN:randomBytes(32).toString('hex'),
  MAIL_PROVIDER:'development',MAIL_FROM:'Demo <demo@demo.invalid>',UPTIME_SYNTHETIC_PORT:'18081',UPTIME_RUNNER_STALE_MS:'1',UPTIME_HEARTBEAT_URL:'https://heartbeat.example.test/ping',
  RER_OWNER_CLAIM_ISSUER:origin,RER_OWNER_CLAIM_INSTALLATION_ID:installationId,RER_OWNER_CLAIM_PUBLIC_KEYS:JSON.stringify(keys.publicKeys)};
 let worker,network=0;
 try{
  worker=await hostedRuntime(directory,settings,()=>{network++;throw Error('Demo reached external network')});
  const db=await worker.getD1Database('DB');for(const file of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())for(const sql of splitSql(await readFile(join('migrations',file),'utf8')))await db.prepare(sql).run();
  const call=(path,{method='GET',body,headers={}}={})=>worker.dispatchFetch('http://127.0.0.1:15504/',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:origin+path,method,headers:{host:'demo.example.test',origin,'cf-connecting-ip':'192.0.2.1',...headers},...(body===undefined?{}:{body})}),redirect:'manual'});
  assert.equal((await call('/health')).status,200,'health before the visitor claims');
  const token=await signClaim(keys,{origin,installationId,email:settings.OWNER_EMAIL,now:Date.now()});
  const claim=await call('/auth/owner-claim',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token}).toString()});
  assert.equal(claim.status,303,await claim.clone().text());const cookie=claim.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');assert.match(cookie,/__Host-operator_session=/);
  const app=await call('/app',{headers:{cookie}});assert.equal(app.status,200);demoBarEntries(await app.text());
  const counts=async()=>({monitors:(await db.prepare('SELECT COUNT(*) n FROM monitors').first()).n,revisions:(await db.prepare('SELECT COUNT(*) n FROM revisions').first()).n,firstRun:(await db.prepare('SELECT COUNT(*) n FROM uptime_first_run').first()).n});
  assert.deepEqual(await counts(),{monitors:3,revisions:3,firstRun:1});await call('/app',{headers:{cookie}});assert.deepEqual(await counts(),{monitors:3,revisions:3,firstRun:1});
  assert.equal((await call('/auth/magic-link',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:settings.OWNER_EMAIL,returnTo:'/app'})})).status,503,'Base refuses hosted development auth delivery; it must not claim delivery');
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM oa_tokens WHERE revoked_at IS NULL').first()).n,0,'captured unavailable auth link is revoked');
  const runnerKey=createHmac('sha256',settings.SESSION_SECRET).update('uptime-demo-runner-v1').digest('hex');
  assert.equal((await call('/api/runner/claim',{method:'POST',headers:{'content-type':'application/json','x-runner-key':runnerKey},body:'{}'})).status,200);
  await (await worker.getWorker()).scheduled({cron:'* * * * *',scheduledTime:Date.now()});
  const mail=(await db.prepare('SELECT message FROM rer_mail_development_outbox').all()).results;assert.ok(mail.length>=1);
  assert.equal((await db.prepare("SELECT outcome FROM monitoring_watch WHERE id='external-heartbeat'").first()).outcome,'failed');
  assert.ok((await db.prepare("SELECT COUNT(*) n FROM rer_demo_outbound WHERE host='heartbeat.example.test'").first()).n>0);
  const visible=await call('/app',{headers:{cookie}});assert.equal(visible.status,200);const entries=demoBarEntries(await visible.text());
  for(const row of mail){
   const message=JSON.parse(row.message),recipients=[message.to].flat().map(recipient=>typeof recipient==='string'?recipient:recipient.email);
   assert.ok(message.subject?.length&&recipients.length&&recipients.every(recipient=>typeof recipient==='string'&&recipient.length),'captured mail has a subject and recipients');
   assert.ok(entries.some(entry=>entry.includes(message.subject)&&recipients.every(recipient=>entry.includes(recipient))),'demo marker lists the captured subject and recipients together');
  }
  const blocked=(await db.prepare("SELECT DISTINCT method, host FROM rer_demo_outbound WHERE host='heartbeat.example.test'").all()).results;
  for(const operation of blocked)assert.ok(entries.some(entry=>entry.split(/\W+/).includes(operation.method)&&entry.includes(operation.host)),'demo marker lists the blocked operation and destination together');
  assert.equal(network,0);
 }finally{await worker?.dispose();await rm(directory,{recursive:true,force:true});}
});
