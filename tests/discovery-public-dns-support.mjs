// Public DNS qualification uses the real runner and unchanged system resolvers.
// No controlled DNS listener, provider credential or transport substitution is used.
import assert from 'node:assert/strict';
import {resolve4,resolve6,resolveCname} from 'node:dns/promises';
import {isIP} from 'node:net';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {fixture} from './resilience/support.mjs';
import {browserSignIn} from './auth-test-support.mjs';
import {runRunner} from '../runners/src/private-runner.mjs';
import {SOURCE_LIMITS} from '../src/domain/discovery-sources.mjs';
import {publicAddress} from '../src/domain/public-target.mjs';

const DOMAIN='run-uptime.com';
const waitUntil=async(read,label)=>{
 const deadline=Date.now()+100_000;
 for(;;){const value=await read();if(value)return value;assert.ok(Date.now()<deadline,`${label} did not finish`);await new Promise(resolve=>setTimeout(resolve,100))}
};
// An independent read of current published answers. Resolution failure is a test
// failure, never a skipped qualification or an empty successful expectation.
async function published(host){
 const optional=async read=>{try{return await read(host)}catch(error){if(['ENODATA','ENOTFOUND'].includes(error.code))return [];throw error}};
 const [A,AAAA,CNAME]=await Promise.all([optional(resolve4),optional(resolve6),optional(resolveCname)]);
 assert.ok(A.length+AAAA.length>0,`Public DNS unavailable for ${host}`);
 assert.ok([...A,...AAAA].every(value=>isIP(value)&&publicAddress(value)),`${host} has public DNS answers`);
 return {A,AAAA,CNAME:CNAME.map(value=>value.replace(/\.$/,''))};
}
async function screen(page,target,evidence,name){
 // The same real populated review is inspected at both release widths.
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});await target.scrollIntoViewIfNeeded();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'public DNS review reflows');
  if(evidence){await mkdir(evidence,{recursive:true});await page.screenshot({path:join(evidence,`${name}-${width}.png`)});await target.screenshot({path:join(evidence,`${name}-details-${width}.png`)})}
 }
}

export async function provePublicDnsDiscovery({launch,evidence}){
 const g=await fixture(),stop=new AbortController();let browser,running;
 const ok=async(path,body,options={})=>{
  const answer=await g.request(path,{body,...options});assert.ok(answer.status<300,`${path}: ${answer.status} ${JSON.stringify(answer.data)}`);return answer.data;
 };
 const rows=async sql=>(await g.DB.prepare(sql).all()).results;
 const noMonitoring=async()=>{
  assert.deepEqual((await ok('/api/overview')).monitors,[],'unadopted DNS proposals create no monitors');
  for(const table of ['monitors','revisions','slots','observations','outbox','notification_jobs'])assert.deepEqual(await rows(`SELECT * FROM ${table}`),[],`${table} stays empty without adoption`);
  assert.equal((await g.request('/api/runner/claim',{runner:g.first,body:{}})).data.task,null,'there is no scheduled work to claim');
 };
 try{
  await ok('/api/runners/'+g.second.runnerId,undefined,{method:'DELETE'});
  // The owner has authorized only this existing RER domain, with no provider account.
  // Read once before and once after to allow DNS answer rotation during the run.
  const hosts=[DOMAIN,`www.${DOMAIN}`],before=await Promise.all(hosts.map(published));
  browser=await launch();const page=await (await browser.newContext({viewport:{width:1440,height:1000}})).newPage();
  await browserSignIn(page,g.origin,{bindings:g.bindings});await page.goto(g.origin+'/app/monitors/new');
  const panel=page.locator('#discovery-sources');await panel.locator('#sources-empty').waitFor();
  await panel.getByLabel('Source',{exact:true}).selectOption('domain');
  await panel.getByLabel('Name',{exact:true}).fill('RER public domain');await panel.getByLabel('Domain',{exact:true}).fill(DOMAIN);
  await panel.getByRole('button',{name:'Authorize',exact:true}).click();
  const sourceRow=panel.locator('.sources-item').filter({hasText:'RER public domain'});await sourceRow.waitFor();
  const [source]=await rows('SELECT * FROM discovery_sources');
  const owner=await g.DB.prepare("SELECT id FROM oa_operators WHERE role='owner' AND status='active'").first();
  assert.equal(source.authorized_by,owner.id);assert.equal(source.state,'active');assert.deepEqual(JSON.parse(source.identifiers),{domain:DOMAIN});
  const authorized=await ok(`/api/discovery-sources/${source.id}`);
  assert.equal(authorized.review,null,'authorization alone does not read the source');
  assert.equal(authorized.source.running,null);assert.deepEqual(await rows('SELECT id FROM discovery_jobs'),[],'authorization never queues an automatic source run');
  await noMonitoring();
  await sourceRow.getByRole('button',{name:'Run discovery',exact:true}).click();
  const queued=await waitUntil(async()=>(await rows("SELECT * FROM discovery_jobs WHERE kind='source'"))[0],'owner-started source job');
  assert.equal(queued.status,'queued');
  running=runRunner({origin:g.origin,key:g.first.key,runnerId:g.first.runnerId,localReview:true,grantPath:join(g.directory,'public-dns-grant.json'),signal:stop.signal,pollMs:100});
  const job=await waitUntil(async()=>{const read=await ok(`/api/discoveries/${queued.id}`);return ['done','failed','expired'].includes(read.status)&&read},'public DNS runner completion');
  assert.equal(job.status,'done',`Public DNS discovery failed: ${job.error}`);assert.equal(job.networkLabel,g.first.networkLabel);
  const snapshot=await g.DB.prepare('SELECT * FROM discovery_source_runs WHERE id=?').bind(job.id).first();
  assert.equal(snapshot.source_id,source.id);assert.equal(snapshot.status,'done');assert.deepEqual(JSON.parse(snapshot.result),job.result,'signed completion retains the actual runner result');
  const document=await ok(`/api/discovery-sources/${source.id}`),view=document.review;
  assert.equal(view.run.id,job.id);assert.ok(view.run.requests>0&&view.run.requests<=SOURCE_LIMITS.requests,'the real read stays within discovery traffic bounds');
  assert.ok(view.proposals.length>0&&view.proposals.length<=SOURCE_LIMITS.candidates,'real DNS produces a bounded nonempty review');
  const after=await Promise.all(hosts.map(published));
  for(const [index,host] of hosts.entries()){
   const dns=view.proposals.find(item=>!item.refused&&item.kind==='dns'&&item.definition.dns.name===host);
   assert.ok(dns,`A public DNS proposal for ${host} is retained`);
   const {recordType,expect}=dns.definition.dns,answers=new Set([...before[index][recordType],...after[index][recordType]]);
   assert.ok(expect.values.length>0&&expect.values.every(value=>answers.has(value)),`${host} retains independently resolved ${recordType} answers`);
   assert.ok(dns.identifier.startsWith(`DNS lookup of ${host}: `),'DNS provenance names the actual lookup');
   assert.ok(expect.values.some(value=>dns.identifier.includes(value)),'provenance retains a published answer');
  }
  for(const proposal of view.proposals.filter(item=>!item.refused)){
   assert.ok(new URL(proposal.url).hostname===DOMAIN||new URL(proposal.url).hostname.endsWith('.'+DOMAIN),'proposals stay on the authorized domain');
   assert.ok(proposal.seenAt>=job.result.startedAt&&proposal.seenAt<=snapshot.finished_at&&proposal.outcome,'retained provenance has a time and intended outcome');
   assert.deepEqual(proposal.locations,[{runnerId:g.first.runnerId,networkLabel:g.first.networkLabel}]);
   assert.ok(proposal.traffic.perDay>0&&proposal.traffic.perMonth===proposal.traffic.perDay*30);
   assert.equal(proposal.cost.state,'unknown');assert.equal(proposal.cost.usd,null);assert.ok(proposal.cost.reason);
   assert.ok(proposal.credentials.startsWith('None:'));assert.deepEqual(proposal.duplicates.monitors,[]);
   // Public aliases can redirect to the same address. Their duplicate links
   // must identify the other retained proposal, never a nonexistent monitor.
   for(const duplicate of proposal.duplicates.proposals){
    const other=view.proposals.find(item=>item.key===duplicate.key);assert.ok(other&&!other.refused&&other.key!==proposal.key);
    assert.equal(duplicate.sourceId,null);assert.equal(other.definition.url,proposal.definition.url);
   }
   assert.equal(proposal.decision,null);
  }
  const review=panel.locator('#source-review');await review.locator('.source-proposal').first().waitFor({timeout:100_000});
  const reject=view.proposals.find(item=>!item.refused&&item.kind==='dns');
  const rejected=review.locator(`[data-key="${reject.key}"]`);
  await screen(page,rejected,evidence,'public-dns-review');
  await review.locator(`[data-reject="${reject.key}"]`).click();
  await waitUntil(async()=>{const current=(await ok(`/api/discovery-sources/${source.id}`)).review;return current.proposals.find(item=>item.key===reject.key)?.decision?.decision==='rejected'&&current},'reviewed DNS rejection');
  const decision=await g.DB.prepare('SELECT * FROM discovery_decisions WHERE source_id=? AND candidate_key=?').bind(source.id,reject.key).first();
  assert.equal(decision.actor_id,owner.id);assert.equal(decision.run_id,job.id);assert.equal(decision.monitor_id,null);
  await rejected.getByText('Rejected',{exact:true}).waitFor();
  await page.reload();await sourceRow.getByRole('button',{name:'Review proposals',exact:true}).click();
  await rejected.getByText('Rejected',{exact:true}).waitFor();assert.equal(await rejected.locator('[data-adopt]').isDisabled(),true,'rejection survives reload and cannot be started');
  await screen(page,rejected,evidence,'public-dns-rejected');
  await noMonitoring();
  const replay=await g.request(`/api/runner/discoveries/${job.id}/result`,{runner:g.first,signed:true,body:{result:job.result}});
  assert.equal(replay.status,409,'a replayed completion cannot change the finished review');
  assert.deepEqual((await ok(`/api/discovery-sources/${source.id}`)).review.proposals.find(item=>item.key===reject.key).decision,{decision:'rejected',monitorId:null,decidedAt:decision.decided_at});
  assert.equal((await rows('SELECT id FROM discovery_source_runs')).length,1,'a replay cannot create a second source snapshot');
  await noMonitoring();
 }finally{
  stop.abort();try{await running}finally{try{await browser?.close()}finally{await g.close()}}
 }
}
