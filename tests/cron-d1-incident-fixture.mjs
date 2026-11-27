import assert from 'node:assert/strict';
import {dispatchCron, minute, origin} from './cron-d1-history-fixture.mjs';

// Finished incidents keep their schedule rows as history. Cron must not read them again.
export async function proveFinishedIncidentsStayOffCron(worker, db, tick) {
 const service = await worker.getWorker();
 const cronReads = async time => {
  await dispatchCron(service, time);
  const report = await (await worker.dispatchFetch(origin + '/__d1_meter?summary=1')).json();
  assert.deepEqual(report.unmetered, []);
  return report.rows;
 };
 const {id:monitor} = await db.prepare('SELECT id FROM monitors LIMIT 1').first();
 // About one run in thirty also stores its monitors' pending checks. The quietest of three runs never does.
 const quietest = async first => Math.min(await cronReads(first), await cronReads(first + minute), await cronReads(first + 2 * minute));
 await cronReads(tick);
 const before = await quietest(tick + minute);
 const past = 300, statements = [];
 for (let i = 0; i < past; i++) {
  const at = tick - (past - i + 10) * 3_600_000, key = `past-${i}`;
  for (const [kind, observedAt] of [['trigger', at], ['recovery', at + 600_000]]) {
   const id = `${kind}-${key}`, event = JSON.stringify({id, kind, monitorId:monitor, incidentKey:key, slotId:'past', observedAt});
   statements.push(
    db.prepare(`INSERT INTO outbox(id,monitor_id,slot_id,kind,event,status) VALUES(?,?,'past',?,?,'done')`).bind(id, monitor, kind, event),
    db.prepare(`INSERT INTO notification_jobs(id,event_id,destination_id,destination_name,kind,credential_id,event,created_at,state,code,attempts,finished_at)
     VALUES(?,?,'past-destination','Operations team','webhook','past-credential',?,?,'accepted','webhook_accepted',1,?)`).bind(`${id}:job`, id, event, observedAt, observedAt));
  }
  statements.push(db.prepare(`INSERT INTO alert_contact_schedules(trigger_job_id,monitor_id,incident_key,due_at,repeat_ms,emitted_repeats,next_at,recovery,stop_on_ack)
   VALUES(?,?,?,?,0,0,NULL,1,0)`).bind(`trigger-${key}:job`, monitor, key, at));
 }
 for (let i = 0; i < statements.length; i += 400) await db.batch(statements.slice(i, i + 400));
 await cronReads(tick + 4 * minute);
 const after = await quietest(tick + 5 * minute);
 assert.ok(after <= before + 30, `Cron read ${after} rows with ${past} finished incidents, against ${before} with none`);
 console.log(`Cron with ${past} finished incidents: ${after} D1 rows read, ${before} before them`);
}
