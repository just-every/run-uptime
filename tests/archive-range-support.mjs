import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const tables=archive=>({...archive.payload.tables,...archive.payload.productTables});
const hash=payload=>createHash('sha256').update(JSON.stringify(payload)).digest('hex');
const inside=(value,range)=>value>=range.from&&value<range.to;

/** The history an independent reader expects a time range to own, computed from the whole export in plain JavaScript. */
function expectedHistory(full,ids,range){
 const slots=full.slots.filter(s=>ids.has(s.monitor_id)&&inside(s.due_at,range)),slotIds=new Set(slots.map(s=>s.id));
 const outbox=full.outbox.filter(r=>slotIds.has(r.slot_id)),triggers=new Set(outbox.filter(r=>r.kind==='trigger').map(r=>r.id));
 const jobs=new Set(full.notification_jobs.filter(j=>{const event=JSON.parse(j.event);return event.monitorId===null||slotIds.has(event.slotId)||full.scheduled_reports.some(r=>r.delivery_id===j.id&&ids.has(r.monitor_id)&&inside(r.due_at,range))}).map(j=>j.id));
 return {slotIds,triggers,jobs,expected:{
  monitors:full.monitors.filter(m=>ids.has(m.id)),revisions:full.revisions.filter(r=>ids.has(r.monitor_id)),slots,
  observations:full.observations.filter(o=>slotIds.has(o.slot_id)),outbox,
  notification_jobs:full.notification_jobs.filter(j=>jobs.has(j.id)),integration_deliveries:full.integration_deliveries.filter(d=>jobs.has(d.id)),
  notification_delivery_attempts:full.notification_delivery_attempts.filter(a=>jobs.has(a.delivery_id)),integration_attempts:full.integration_attempts.filter(a=>jobs.has(a.delivery_id)),integration_resolutions:full.integration_resolutions.filter(a=>jobs.has(a.delivery_id)),
  incident_work:full.incident_work.filter(r=>triggers.has(r.incident_id)),incident_comments:full.incident_comments.filter(r=>triggers.has(r.incident_id)),incident_timeline:full.incident_timeline.filter(r=>triggers.has(r.incident_id)),
  failure_snapshots:full.failure_snapshots.filter(r=>slotIds.has(r.slot_id)),cleanup_debt:full.cleanup_debt.filter(r=>slotIds.has(r.slot_id)),
  heartbeat_runs:full.heartbeat_runs.filter(r=>ids.has(r.monitor_id)&&inside(r.received_at,range)),scheduled_reports:full.scheduled_reports.filter(r=>ids.has(r.monitor_id)&&inside(r.due_at,range)),
  // Shared records are unchanged by a range.
  notification_destinations:full.notification_destinations,integration_replays:full.integration_replays,uptime_erasure_receipts:full.uptime_erasure_receipts,incident_settings:full.incident_settings,
 }};
}

/** A time range keeps selected definitions whole and owns only the history of the slots due inside it. */
export async function proveArchiveRange({f,ok,refuse,installation,monitors,fullArchive,destination}){
 const full=tables(fullArchive),all=new Set(monitors.map(m=>m.id)),dues=[...new Set(full.slots.filter(s=>all.has(s.monitor_id)).map(s=>s.due_at))].sort((a,b)=>a-b);
 const split=dues.find(due=>due-dues[0]>=2000);assert.ok(split,'two genuinely scheduled rounds');
 const late={from:split,to:dues.at(-1)+1},early={from:0,to:split},query=(range,ids=[])=>'/api/archive?'+[...ids.map(id=>'monitor='+encodeURIComponent(id)),`from=${range.from}`,`to=${range.to}`].join('&');
 const lateArchive=await ok(query(late)),earlyArchive=await ok(query(early));
 assert.deepEqual(lateArchive.payload.selection,{kind:'monitors',monitorIds:[...all].sort(),sharedRecords:'installation-history-v1',range:late},'a range without monitors selects every monitor explicitly');
 assert.equal(hash(lateArchive.payload),lateArchive.sha256,'range metadata is inside the integrity envelope');
 const exportsSeen={};
 for(const [label,archive,range] of [['late',lateArchive,late],['early',earlyArchive,early]]){
  const projected=tables(archive),{expected}=expectedHistory(full,all,range);
  for(const [name,rows] of Object.entries(expected))assert.deepEqual(projected[name],rows,`${label} range owns ${name}`);
  assert.deepEqual(archive.payload.erasureFence,fullArchive.payload.erasureFence,'every erasure journal entry survives a range');
  exportsSeen[label]=projected;
 }
 const lateRows=exportsSeen.late,earlyRows=exportsSeen.early;
 assert.ok(lateRows.slots.length&&earlyRows.slots.length&&lateRows.slots.length+earlyRows.slots.length===full.slots.filter(s=>all.has(s.monitor_id)).length,'two ranges partition the scheduled slots without overlap or loss');
 assert.ok(earlyRows.outbox.some(r=>r.kind==='trigger')&&!earlyRows.outbox.some(r=>r.kind==='recovery')&&lateRows.outbox.some(r=>r.kind==='recovery')&&!lateRows.outbox.some(r=>r.kind==='trigger'),'each range shows only the alerts its own checks raised');
 assert.equal(earlyRows.incident_comments.length,1,'incident work follows the trigger inside the range');assert.equal(lateRows.incident_comments.length,0);
 assert.deepEqual(lateRows.revisions,earlyRows.revisions,'every selected revision stays complete in every range');
 // Monitor and range together.
 const one=tables(await ok(query(late,[monitors[0].id])));
 assert.deepEqual(one.monitors.map(m=>m.id),[monitors[0].id]);assert.deepEqual(one.slots,lateRows.slots.filter(s=>s.monitor_id===monitors[0].id));assert.ok(one.slots.length>0);
 // Restore through the receiving owner, then compare exact history without any live authority.
 const receiving=await installation('range-receiving-owner');
 const corrupt=structuredClone(lateArchive);corrupt.payload.selection.range={from:late.to-1,to:late.to};corrupt.sha256=hash(corrupt.payload);
 assert.equal((await receiving.owner.api('/api/restore','POST',corrupt)).status,400,'history outside the declared range is refused even with a recomputed digest');
 assert.equal((await receiving.ok('/api/overview')).monitors.length,0);
 await receiving.ok('/api/restore','POST',earlyArchive);
 const restored=tables(await receiving.ok('/api/archive'));
 const ids=rows=>rows.map(m=>m.id).sort(),inactive=rows=>rows.map(r=>({...r,status:'imported-inactive'}));
 assert.deepEqual(ids(restored.monitors),ids(earlyRows.monitors));assert.deepEqual(restored.outbox,inactive(earlyRows.outbox),'alerts restore inactive');
 for(const name of ['slots','observations','incident_comments','incident_timeline','integration_attempts'])assert.deepEqual(restored[name],earlyRows[name],name+' restores exactly');
 assert.ok(restored.monitors.every(m=>!JSON.parse(m.definition).enabled)&&restored.outbox.every(e=>e.status==='imported-inactive')&&restored.notification_jobs.every(j=>j.state==='imported-inactive'),'restored range history is inactive');
 // Invalid, unsupported and out-of-bound ranges emit nothing and change nothing.
 for(const bad of ['from=1','to=9','from=9&to=9','from=9&to=1','from=-1&to=9','from=abc&to=9','from=0&to=99999999999999999','from=0&to=9&monitor=','from=0&to=9&other=1'])assert.ok(!(await refuse('/api/archive?'+bad)).data.payload);
 // Imported source history has no safe range owner: refuse rather than clip or widen.
 await f.DB.prepare('INSERT INTO source_history_batches(id,monitor_id,source,source_monitor_id,file_digest,extracted_at,coverage_from,coverage_to,imported_at,restored_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind('synthetic-uptime-batch',monitors[0].id,'synthetic-uptime-source','synthetic-uptime-origin','0'.repeat(64),null,0,1,1,null).run();
 assert.match((await refuse(query(late))).data.error,/source history/);
 await f.DB.prepare('DELETE FROM source_history_batches WHERE id=?').bind('synthetic-uptime-batch').run();
 assert.equal(destination.kind,'email');
}
