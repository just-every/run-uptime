import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
import {browserSignIn} from './auth-test-support.mjs';
import {dispatchNotifications} from '../runners/src/notification-dispatch.mjs';
const require=createRequire(import.meta.url);
const decode=text=>text.replace(/&(amp|lt|gt|quot|#39);/g,(_,name)=>({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'"}[name]));
// Independent exhaustive comparison against the wire text, not the sanitizer.
function safeExcerpt(excerpt,body,secret){
 assert.equal(typeof excerpt,'string');assert.ok(!excerpt.includes(secret),'no signing credential');
 for(const text of [excerpt,decode(excerpt)])for(const forbidden of [body,JSON.stringify(body).slice(1,-1)]){
  assert.ok(!text.includes(forbidden),'no complete request body');
  for(let i=0;i+9<=forbidden.length;i++)assert.ok(!text.includes(forbidden.slice(i,i+9)),'no request-derived substring longer than eight UTF-16 units');
 }
}
// Extends the existing DELIVERY-002 journey; no separate permanent test case.
export async function proveEchoCustody({f,ok,rpc,database,inspectEcho}){
 const contact=await ok('/api/notifications/destinations',{name:'Echo custody receiver',kind:'webhook',url:'https://echo.example.com/receiver',webhookTemplate:{version:1,method:'POST',mode:'json',template:'{"event_id":"{{event.id}}","detail":"Echo \\"quoted\\" request"}'},webhookSigning:true});
 const records=[];let signingSecret=contact.signingSecret;
 for(const mode of ['full','prefix','interior','json','canonical','older-runner','marker-collision','drill']){
  if(mode==='marker-collision')signingSecret=(await ok(`/api/notifications/destinations/${contact.id}`,{name:contact.name,enabled:false,webhookTemplate:{version:1,method:'POST',mode:'json',template:'{"id":"{{event.id}}","detail":"[redacted: echoed request]"}'},webhookSigning:true},'PATCH')).signingSecret;
  if(mode==='drill')signingSecret=(await ok(`/api/notifications/destinations/${contact.id}`,{name:contact.name,enabled:false,webhookTemplate:null},'PATCH')).signingSecret;
  assert.ok(signingSecret,'each credential version returns its signing key');
  const queued=await ok(`/api/notifications/destinations/${contact.id}/${mode==='drill'?'drill':'test'}`,{});let sent;
  const edge={async send(wire,start){await start();assert.equal(wire.url,'https://echo.example.com/receiver');
   assert.equal(wire.headers['x-lamp-signature'],createHmac('sha256',signingSecret).update(wire.headers['x-lamp-timestamp']+'.'+wire.body).digest('base64url'),'receiver verifies exact signed request');
   const canonical=JSON.stringify(['integrations.webhook.v1',wire.headers['webhook-tenant'],wire.headers['webhook-destination'],wire.headers['webhook-event'],wire.headers['webhook-id'],wire.headers['webhook-timestamp'],wire.body]);
   const echo=mode==='prefix'?wire.body.slice(0,52):mode==='interior'?wire.body.slice(17,57):mode==='json'?JSON.stringify({echo:wire.body}):mode==='canonical'?canonical:wire.body;
   sent={mode,id:queued.deliveryId,body:wire.body,response:echo+' '+signingSecret,signingSecret,omitted:['marker-collision','drill'].includes(mode)};
   return {status:202,headers:{},body:sent.response};
  }};
  // An older dispatcher can report raw text; the authoritative finish door
  // must independently scrub it using the stored immutable envelope.
  const finish=async(path,input)=>rpc(path,['older-runner','drill'].includes(mode)&&input.operation==='finish'?{...input,outcome:{...input.outcome,responseExcerpt:sent.response.slice(0,512)}}:input);
  await dispatchNotifications(finish,edge);assert.ok(sent,mode+' reached the validating receiver');records.push(sent);
 }
 const check=async()=>{
  const overview=await ok('/api/notifications'),archive=await ok('/api/archive');
  for(const record of records){
   const row=overview.deliveries.find(d=>d.id===record.id);assert.equal(row.state,'accepted');assert.equal(row.status,202);assert.equal(row.attempts,1);
   safeExcerpt(row.responseExcerpt,record.body,record.signingSecret);if(record.omitted)assert.equal(row.responseExcerpt,'','unsafe excerpts are omitted');
   const attempts=(await database.prepare('SELECT outcome FROM integration_attempts WHERE delivery_id=?').bind(record.id).all()).results;
   assert.equal(attempts.length,1);for(const attempt of attempts)safeExcerpt(JSON.parse(attempt.outcome).responseExcerpt,record.body,record.signingSecret);
   const archived=archive.payload.productTables.integration_attempts.filter(a=>a.delivery_id===record.id);assert.equal(archived.length,1);
   for(const attempt of archived)safeExcerpt(JSON.parse(attempt.outcome).responseExcerpt,record.body,record.signingSecret);
  }
 };
 await check();
 if(inspectEcho)await inspectEcho({f,records});
 return {contact,secrets:[...new Set(records.map(r=>r.signingSecret))],bodies:records.map(r=>r.body),assertArchive(archive){for(const record of records){const rows=archive.payload.productTables.integration_attempts.filter(a=>a.delivery_id===record.id);assert.equal(rows.length,1);for(const row of rows)safeExcerpt(JSON.parse(row.outcome).responseExcerpt,record.body,record.signingSecret)}}};
}

// The delivery case owns this outcome-only browser proof; the separate browser
// case keeps its existing dialogs, route editor and outcome journey.
export async function inspectEchoCustody({f,records}){
 let browser;
 try{
  browser=await chromium.launch({...(process.env.UPTIME_BROWSER_EXECUTABLE?{executablePath:process.env.UPTIME_BROWSER_EXECUTABLE}:{}),headless:true,args:['--no-sandbox','--use-mock-keychain','--password-store=basic']});
  for(const width of [1440]){
   const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage();
   try{
    await context.route('**/*',route=>new URL(route.request().url()).origin===f.origin?route.continue():route.abort());
    await browserSignIn(page,f.origin,{bindings:f.bindings});await page.goto(f.origin+'/app/settings/alerts');await page.locator('html.signed-in').waitFor();
    for(const reload of [false,true]){
     if(reload){await page.reload();await page.locator('html.signed-in').waitFor()}
     for(const record of records){
      const card=page.locator(`[data-key="delivery-${record.id}"]`);await card.getByText('HTTP 202',{exact:true}).waitFor();
      const excerpt=card.locator('.webhook-response');if(record.omitted)assert.equal(await excerpt.count(),0);else{await excerpt.waitFor();const text=await excerpt.textContent();safeExcerpt(text,record.body,record.signingSecret);assert.ok(text.includes('[redacted: echoed request]'))}
      assert.ok(!(await page.locator('body').textContent()).includes(record.body),'rendered console has no request body');
     }
    }
    await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});const violations=(await page.evaluate(()=>axe.run(document))).violations.map(v=>v.id);assert.deepEqual(violations,[]);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'echo outcomes reflow');
    const evidence=process.env.UPTIME_ECHO_EVIDENCE;
    if(evidence){await mkdir(evidence,{recursive:true});await page.screenshot({path:join(evidence,`echo-outcomes-${width}.png`),fullPage:true});await writeFile(join(evidence,`echo-outcomes-${width}.json`),JSON.stringify({width,violations,overflow:false,modes:records.map(r=>r.mode),reload:true},null,2))}
    console.log(`ECHO_PROOF ${width}: eight echoes absent from rendered outcome text, reload, zero axe violations and no overflow`);
   }finally{await context.close()}
  }
 }finally{await browser?.close()}
}
