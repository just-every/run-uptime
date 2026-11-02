import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
import {agentDocument,checkAgentDocs} from '../scripts/agent-docs.mjs';
import {autonomousPolicy,heldPolicy,accessToken} from '../src/base/modules/agent-door/conformance/crypto.mjs';
import {allDeliveredMessages} from './mail-provider-fixture.mjs';

// Part of the existing native-door journey, after actual private records exist.
export async function proveAgentDocs({c,db,origin,monitorId,providerRequests,privateValues,directory}){
 const checked=await readFile('docs/agents.md','utf8');
 const generated=await agentDocument();
 assert.equal(await agentDocument(),generated,'native registry generation is deterministic');
 assert.equal(checked,generated,'the published source matches the current native registry');
 await checkAgentDocs();
 const stale=await mkdtemp(join(tmpdir(),'uptime-stale-docs-'));
 try{
  const path=join(stale,'agents.md');
  await writeFile(path,checked.replace('`uptime.monitors.list`','`uptime.stale.list`'));
  await assert.rejects(checkAgentDocs(path),/Stale agent catalogue/,'freshness check refuses a stale callable inventory');
 }finally{await rm(stale,{recursive:true,force:true})}
 const snapshot=async()=>{
  const tables=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT GLOB '_cf*' ORDER BY name").all()).results;
  return Object.fromEntries(await Promise.all(tables.filter(({name})=>!['public_rate_limits','oa_limits'].includes(name)).map(async({name})=>[name,(await db.prepare(`SELECT * FROM "${name.replaceAll('"','""')}"`).all()).results.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))])));
 };
 const request=()=>fetch(origin+'/docs/agents',{redirect:'manual'});
 const first=await request();
 assert.equal(first.status,200,'the emitted Worker serves agent documentation without credentials');
 assert.ok(first.headers.get('content-type').includes('text/html'));
 const html=await first.text();
 // Read only the explicit inventory in the document, never navigation or JSON
 // hydration data. Each table row names exactly one callable tool.
 const prose=html.match(/<div class="docs-prose"[^>]*>([\s\S]*?)<\/article>/)?.[1];
 assert.ok(prose,'the existing documentation renderer serves the generated page');
 const names=[...prose.matchAll(/<tr>\s*<td>\s*<code>(uptime\.[a-z.]+)<\/code>\s*<\/td>/g)].map(match=>match[1]).sort();
 assert.equal(names.length,34,'the complete current callable inventory is explicit');
 assert.equal(new Set(names).size,names.length,'no duplicate aliases in the document');
 const templates=[...prose.matchAll(/<code>(uptime:\/\/[^<]+)<\/code>/g)].map(match=>match[1]).sort();
 assert.match(prose,/Resources are undeclared and unavailable/);
 assert.match(prose,/Internal templates[\s\S]*not callable resources/);
 for(const policy of [autonomousPolicy(),heldPolicy()]){
  await c.adopt(policy);
  for(const version of ['2026-07-28','2025-11-25']){
   const listed=await c.mcp('tools/list',{}, {version});
   assert.equal(listed.status,200);
   assert.deepEqual(names,listed.result.tools.map(tool=>tool.name).sort(),'served inventory equals authenticated discovery under each policy and version');
   const resources=await c.mcp('resources/templates/list',{}, {version});
   assert.equal(resources.status,200);
   assert.deepEqual(templates,resources.result.resourceTemplates.map(item=>item.uriTemplate).sort(),'served resource inventory equals declared discovery');
  }
 }
 await c.adopt(autonomousPolicy());
 const token=await accessToken(c);
 for(const value of [monitorId,c.agentId,c.business,c.person.sub,c.person.email,c.consent,token,...privateValues]){
  assert.ok(typeof value==='string'&&value.length>0,'privacy probe uses populated private canaries');
  assert.ok(!html.includes(value),'public document exposes no private identifier or credential');
 }
 const before=await snapshot(),networkBefore=structuredClone(providerRequests),mailBefore=allDeliveredMessages().length;
 assert.ok(before.monitors.some(row=>row.id===monitorId),'no-effect read protects populated product data');
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{}),args:['--no-sandbox']});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
  const output=process.env.UPTIME_AGENT_PROOF_DIR??join(directory,'browser-proof');await mkdir(output,{recursive:true});
  const response=await page.goto(origin+'/docs/agents',{waitUntil:'networkidle'});
  assert.equal(response.status(),200);
  assert.deepEqual(await context.cookies(),[],'the public page creates no credential');
  assert.deepEqual((await page.locator('.docs-prose tbody tr td:first-child code').allTextContents()).sort(),names);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'catalogue reflows at the assertion width');
  const require=createRequire(import.meta.url);await page.evaluate(await readFile(require.resolve('axe-core/axe.min.js'),'utf8'));
  const axe=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));
  assert.deepEqual(axe.violations.filter(item=>['serious','critical'].includes(item.impact)).map(item=>item.id),[],'public catalogue has no serious accessibility findings');
  await page.screenshot({path:join(output,'agent-catalogue-1440.png'),fullPage:true});
  await page.setViewportSize({width:390,height:1000});
  await page.screenshot({path:join(output,'agent-catalogue-390.png'),fullPage:true});
  await context.close();
 }finally{await browser.close()}
 assert.deepEqual(await snapshot(),before,'unauthenticated document and asset reads change no product, authority, audit, queue or custody rows');
 assert.deepEqual(providerRequests,networkBefore,'public documentation causes no provider request');
 assert.equal(allDeliveredMessages().length,mailBefore,'public documentation sends no mail');
 console.log('PROBE BASE-AGENT-013 acceptance-1-tools: unsigned GET /docs/agents -> 34 names equal authenticated tools discovery under two policies and both versions; no worker admissions or aliases');
 console.log('PROBE BASE-AGENT-013 acceptance-1-resources: unsigned document -> empty inventory equals resource-template discovery; resources explicitly undeclared and unavailable');
 console.log('PROBE BASE-AGENT-013 freshness: deterministic native generation and check -> current source accepted, stale tool inventory refused');
 console.log('PROBE BASE-AGENT-013 privacy-effects: unsigned document and assets -> private canaries absent, complete durable state and provider traffic unchanged');
}
