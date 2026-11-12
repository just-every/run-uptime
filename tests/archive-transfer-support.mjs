import {proveLocalArchiveResume} from './archive-local-resume-support.mjs';
import {invalidReferenceArchive} from './archive-corruption-support.mjs';
import {emailSignIn} from './auth-test-support.mjs';
import {populateArchiveFixture} from './archive-fixture.mjs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readArchive} from '@runeditrun/rer/modules/portability';

const base='/api/archive-transfer';
const hash=text=>createHash('sha256').update(text).digest('hex');
const tableRows=archive=>({...archive.payload.tables,...archive.payload.productTables});

/** Public-door transfer at a useful engineering load. Synthetic definition and
 * revision population is explicitly not the full monitoring-scale acceptance. */
export async function proveArchiveTransfer(installation){
 const source=await installation('chunk-source');
 const native=async(site,path,method='GET',body)=>site.owner.api(base+path,method,body,{origin:(await site.worker.ready).origin});
 const request=async(site,path,method='GET',body)=>{
  const result=await native(site,path,method,body);
  assert.ok(result.status>=200&&result.status<300,`${path}: ${result.status} ${JSON.stringify(result.data)}`);return result.data;
 };
 await source.ok('/api/overview');
 const input={format:'urls',text:Array.from({length:119},(_,n)=>`https://93.184.216.34/synthetic-uptime-${n}`).join('\n'),enableAfterCreate:false};
 const plan=await source.ok('/api/catalog/add/preview','POST',input);assert.equal(plan.counts.create,119);
 const applied=await source.owner.api('/api/catalog/add/apply','POST',{...input,digest:plan.digest});assert.equal(applied.status,201);
 await populateArchiveFixture({...source.bindings,DB:source.DB});
 const full=await source.ok('/api/archive');assert.equal(full.payload.tables.monitors.length,120,'full public export lifts the former installation and archive cap');
 const selected=full.payload.tables.monitors.slice(0,105).map(m=>m.id);
 const subset=await source.ok('/api/archive?'+selected.map(id=>'monitor='+id).join('&'));
 assert.deepEqual(new Set(subset.payload.tables.monitors.map(m=>m.id)),new Set(selected),'selected exports pass the former 100-monitor bound');
 // Test-only synthetic archive load: old immutable revisions have no manufacture API.
 const revision=full.payload.tables.revisions[0];
 await source.DB.prepare(`INSERT INTO revisions(monitor_id,revision,definition,created_at)
  WITH RECURSIVE n(x) AS (SELECT 0 UNION ALL SELECT x+1 FROM n WHERE x<10000)
  SELECT ?,1000+x,?,? FROM n`).bind(revision.monitor_id,revision.definition,revision.created_at).run();
 const beforeCounts=Object.fromEntries(await Promise.all(Object.keys(tableRows(full)).map(async name=>[name,(await source.DB.prepare(`SELECT COUNT(*) n FROM ${name}`).first()).n])));
 const bounds=await request(source,'/exports');assert.equal(bounds.counts.monitors,120);assert.ok(bounds.bounds.chunkBytes<bounds.bounds.workingSetBytes);
 const {id}=await request(source,'/exports','POST',{});
 let status=await request(source,`/exports/${id}/advance`,'POST',{maxParts:1});
 assert.equal(status.phase,'building');assert.equal(status.completed,1);
 await source.restart();
 assert.equal((await request(source,`/exports/${id}`)).completed,1,'native worker restart retains progress');
 while(status.phase==='building')status=await request(source,`/exports/${id}/advance`,'POST',{expectedPart:status.completed,maxParts:16});
 assert.equal(status.phase,'complete');
 const progress=await request(source,`/exports/${id}`);
 assert.equal((await source.owner.api(base+`/exports/${id}`, 'GET',undefined,{cookie:''})).status,401);
 const staleCookie=await emailSignIn((await source.worker.ready).origin,{bindings:source.bindings,secondFactor:false});
 assert.equal((await source.owner.api(base+`/exports/${id}`,'GET',undefined,{cookie:staleCookie})).status,403);
 assert.equal((await native(source,`/exports/${id}`)).data.completed,progress.completed,'refused authority cannot change progress');
 const text=await request(source,`/exports/${id}/download`);
 const records=[];for await(const record of readArchive(new Response(text).body))records.push(record);
 const manifest=records[0],closing=records.at(-1),payload=manifest.payloads.find(p=>p.name==='uptime');
 const payloadBytes=Buffer.alloc(payload.size);let offset=0;
 for(const part of records.filter(r=>r.kind==='part'))for(const item of part.items)if(item.kind==='payload'){
  assert.equal(item.name,'uptime');assert.equal(item.offset,offset);const bytes=Buffer.from(item.data,'base64');bytes.copy(payloadBytes,offset);offset+=bytes.length;
 }
 assert.equal(offset,payload.size);assert.equal(hash(payloadBytes),payload.sha256);
 const lines=payloadBytes.toString('utf8').trimEnd().split('\n'),inner=JSON.parse(lines.shift());
 assert.equal(inner.kind,'uptime-chunks');assert.ok(inner.chunks.length>16,'bounded chunks replace the obsolete refusal at this load');
 const originals=Object.fromEntries(Object.keys(inner.counts).map(name=>[name,[]]));
 for(const [index,line]of lines.entries()){
  const chunk=JSON.parse(line),expected=inner.chunks[index];
  assert.equal(chunk.index,index);assert.equal(expected.table,chunk.table);assert.equal(Buffer.byteLength(line),expected.bytes);assert.equal(hash(line),expected.sha256,'independent node digest verifies every chunk');assert.equal(chunk.rows.length,expected.rows);assert.ok(Buffer.byteLength(line)<=128*1024);
  originals[chunk.table].push(...chunk.rows);
 }
 assert.equal(lines.length,inner.chunks.length);
 for(const [name,count]of Object.entries(beforeCounts))if(name==='uptime_audit')assert.ok(inner.counts[name]>=count);else assert.equal(inner.counts[name],count,name+' is complete');
 for(const secret of [source.bindings.SESSION_SECRET,source.bindings.SETUP_TOKEN,source.bindings.UPTIME_RUNNER_KEY])assert.ok(!text.includes(secret));
 const corruptReceiver=await installation('chunk-invalid-reference'),forged=await invalidReferenceArchive(manifest,payloadBytes);
 const invalid=await request(corruptReceiver,'/imports','POST',{confirmed:true,manifest:forged.manifest});
 for(const part of forged.parts)await request(corruptReceiver,`/imports/${invalid.id}/parts/${part.index}`,'PUT',part);
 const corruptBefore=Object.fromEntries(await Promise.all(Object.keys(originals).map(async name=>[name,(await corruptReceiver.DB.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()).results])));
 const invalidResult=await native(corruptReceiver,`/imports/${invalid.id}/finalize`,'POST',forged.closing);assert.equal(invalidResult.status,400);assert.match(invalidResult.data.error,/definition mismatch|revision reference/i);
 for(const [name,rows]of Object.entries(corruptBefore))assert.deepEqual((await corruptReceiver.DB.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()).results,rows,name+' rehashed invalid reference writes no product');
 await request(corruptReceiver,`/imports/${invalid.id}/abort`,'POST',{});await corruptReceiver.worker.dispose();
 const receiving=await installation('chunk-receiver');
 const product=async site=>Object.fromEntries(await Promise.all(Object.keys(originals).map(async name=>[name,(await site.DB.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()).results])));
 const receive=await request(receiving,'/imports','POST',{confirmed:true,manifest});
 const parts=records.filter(r=>r.kind==='part');
 await request(receiving,`/imports/${receive.id}/parts/0`,'PUT',parts[0]);
 await receiving.restart();
 assert.equal((await request(receiving,`/imports/${receive.id}`)).completed,1,'receiving worker restart retains staged parts');
 await request(receiving,`/imports/${receive.id}/parts/0`,'PUT',parts[0]);
 assert.equal((await request(receiving,`/imports/${receive.id}`)).completed,1,'replayed upload is idempotent');
 const foreign=await installation('chunk-stranger'),foreignBefore=await product(foreign);
 assert.equal((await native(foreign,`/imports/${receive.id}`)).status,404);assert.deepEqual(await product(foreign),foreignBefore,'foreign handle cannot restore product');
 const beforeCorrupt=await product(receiving),corrupt=structuredClone(parts[1]);corrupt.items[0].data='Y29ycnVwdA==';
 assert.equal((await native(receiving,`/imports/${receive.id}/parts/1`,'PUT',corrupt)).status,400);assert.deepEqual(await product(receiving),beforeCorrupt,'corrupt chunk cannot write product data');
 for(const part of parts.slice(1))await request(receiving,`/imports/${receive.id}/parts/${part.index}`,'PUT',part);
 const beforeFinalize=await product(receiving);
 const finalized=await request(receiving,`/imports/${receive.id}/finalize`,'POST',{contentHash:closing.contentHash,archiveHash:closing.archiveHash});assert.equal(finalized.phase,'complete');
 const restored=await product(receiving);
 const changedMonitors=originals.monitors.filter(m=>{const definition={...JSON.parse(m.definition),enabled:false};return JSON.stringify(definition)!==m.definition||m.state!==JSON.stringify({state:'Unknown',confirmedFailure:false,notificationOpen:false})});
 const changedOriginals=[];
 for(const name of ['monitors','slots','outbox','notification_destinations','notification_jobs','integration_deliveries'])for(const row of originals[name]){
  let changed=false;
  if(name==='monitors')changed=changedMonitors.some(m=>m.id===row.id);
  if(name==='slots')changed=['queued','running'].includes(row.status);
  if(name==='outbox')changed=row.status!=='imported-inactive'||row.lease_until!==0||row.receipt!==null;
  if(name==='notification_destinations')changed=row.enabled!==0||row.deleted_at!==null&&row.address!==null;
  if(name==='notification_jobs')changed=row.state!=='imported-inactive'||row.code!=='imported_inactive';
  if(name==='integration_deliveries')changed=['queued','sending'].includes(row.state);
  if(changed)changedOriginals.push({table:name,row});
 }
 const auditIds=new Set([...originals.uptime_audit,...beforeFinalize.uptime_audit].map(row=>row.id));
 const addedAudits=restored.uptime_audit.filter(row=>!auditIds.has(row.id));
 assert.deepEqual(addedAudits.map(row=>row.action).sort(),['access_archive_restore','access_archive_restore','archive_restore']);
 for(const row of [...originals.uptime_audit,...beforeFinalize.uptime_audit])assert.deepEqual(restored.uptime_audit.find(r=>r.id===row.id),row);
 for(const [name,rows]of Object.entries(originals)){
  const extra=name==='archive_history'?changedOriginals.filter(({table,row})=>!rows.some(h=>h.table_name===table&&JSON.parse(h.record).id===row.id)).length:name==='revisions'?changedMonitors.length:name==='uptime_audit'?beforeFinalize.uptime_audit.filter(row=>!originals.uptime_audit.some(r=>r.id===row.id)).length+3:name==='auxiliary_attempts'?beforeFinalize.auxiliary_attempts.filter(row=>row.scope==='auth-mail'&&!rows.some(r=>r.id===row.id)).length:0;
  assert.equal(restored[name].length,rows.length+extra,name+' restore count includes only documented transformations');
 }
 for(const name of ['observations','integration_attempts','integration_resolutions','integration_replays'])assert.deepEqual(restored[name].map(row=>Object.fromEntries(Object.keys(originals[name][0]??{}).map(key=>[key,row[key]]))),originals[name],name+' historical records remain exact');
 for(const row of originals.revisions)assert.deepEqual(restored.revisions.find(r=>r.monitor_id===row.monitor_id&&r.revision===row.revision),row,'immutable revision remains exact');
 for(const {table,row}of changedOriginals)assert.ok(restored.archive_history.some(h=>h.table_name===table&&JSON.parse(h.record).id===row.id),'changed originals remain in flat history');
 assert.ok(restored.monitors.every(m=>JSON.parse(m.definition).enabled===false&&JSON.parse(m.state).state==='Unknown'));
 assert.ok(restored.slots.filter(s=>['queued','running'].includes(originals.slots.find(r=>r.id===s.id).status)).every(s=>s.status==='interrupted'&&s.lease_owner==='restored-inactive'&&s.lease_until===0));
 assert.ok(restored.notification_destinations.every(d=>d.enabled===0));assert.ok(restored.notification_jobs.every(j=>j.state==='imported-inactive'&&j.claim===null));assert.ok(restored.outbox.every(j=>j.status==='imported-inactive'));
 assert.ok(restored.definition_batches.every(b=>b.restored_at!==null));
 for(const row of beforeFinalize.auxiliary_attempts.filter(row=>row.scope==='auth-mail'))assert.deepEqual(restored.auxiliary_attempts.find(r=>r.id===row.id),row,'receiving sign-in mail ledger remains local');
 const after=await product(receiving);
 assert.equal((await native(receiving,'/imports','POST',{confirmed:true,manifest})).status,400);assert.deepEqual(await product(receiving),after,'nonempty transfer refuses without product writes');
 await proveLocalArchiveResume(source,installation);await source.restart();
 // Erasure invalidates the durable source capture; resume must never replay it.
 const erased=originals.monitors[0];await source.ok(`/api/monitors/${erased.id}/erase`,'POST',{name:JSON.parse(erased.definition).name});
 const afterErase=await product(source);
 assert.equal((await native(source,`/exports/${id}/advance`,'POST',{maxParts:1})).status,404);assert.deepEqual(await product(source),afterErase,'stale erased capture cannot resume');
 console.log('PASS native chunk archive: 120 monitors, 105 selected, synthetic revision load, independent digests, interrupted export and restore, complete counts, immutable history and no-write corrupt, foreign and erased-resume refusals');
 for(const site of [source,receiving,foreign])await site.worker.dispose();
}
