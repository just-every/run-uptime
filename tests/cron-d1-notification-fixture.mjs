import assert from 'node:assert/strict';
import {clientHeaders, migrate, minute, minutesPerDay, origin} from './cron-d1-history-fixture.mjs';

export async function proveNotificationIndexUpgrade(worker, db, migration, {cookie}, time) {
 const monitor = await db.prepare('SELECT id FROM monitors LIMIT 1').first();
 const response = await worker.dispatchFetch(origin + '/api/notifications/destinations', {
  method:'POST', headers:{...clientHeaders, cookie, origin, 'content-type':'application/json'},
  body:JSON.stringify({name:'Operations team',kind:'webhook',url:'https://receiver.example.com/uptime'}),
 });
 assert.equal(response.status, 201, await response.clone().text());
 const {id} = await response.json();
 const {credential_id} = await db.prepare('SELECT credential_id FROM notification_destinations WHERE id=?').bind(id).first();
 await db.batch([
  db.prepare(`WITH RECURSIVE samples(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM samples WHERE n<300)
   INSERT INTO notification_jobs(id,event_id,destination_id,destination_name,kind,credential_id,event,created_at,state,code,attempts)
   SELECT 'delivery-'||n,'trigger-'||n,?1,'Operations team','webhook',?2,
    json_object('id','trigger-'||n,'kind','trigger','monitorId',?3,'incidentKey','incident-'||n),
    ?4+(n/2)*60000,'accepted','webhook_accepted',1 FROM samples`)
   .bind(id, credential_id, monitor.id, time-7*minutesPerDay*minute),
  db.prepare(`INSERT INTO integration_deliveries(namespace,id,fingerprint,destination_hash,envelope,state,attempts,created_at,next_at,max_attempts,retry_delays)
   SELECT 'uptime-notifications',id,'fixture','hmac-v1:fixture',json_object('body',event),
    'accepted',1,created_at,created_at,3,'[]' FROM notification_jobs`),
 ]);
 const snapshot = async () => Promise.all([
  db.prepare('SELECT * FROM notification_jobs ORDER BY rowid').all(),
  db.prepare('SELECT * FROM integration_deliveries ORDER BY rowid').all(),
 ]).then(results => results.map(({results:rows}) => rows));
 const before = await snapshot();
 const writes = await migrate(db, [migration], {profile:true});
 assert.deepEqual(await snapshot(), before, 'installing indexes preserves populated notification history');
 assert.ok(writes < 2_000, 'populated index upgrade stays within the daily write allowance');
 assert.equal(await migrate(db, [migration], {profile:true}), 0, 'replaying the index upgrade writes nothing');
 assert.deepEqual(await snapshot(), before, 'replay preserves populated notification history');

 const overview = await worker.dispatchFetch(origin + '/api/overview', {
  headers:{...clientHeaders,cookie,'x-d1-meter-time':String(time)},
 });
 assert.equal(overview.status, 200);
 const {notifications} = await overview.json();
 const expected = before[0].sort((a,b) => b.created_at-a.created_at || (a.id < b.id ? 1 : -1)).slice(0,200);
 assert.deepEqual(notifications.deliveries.map(({id,state}) => ({id,state})), expected.map(({id,state}) => ({id,state})),
  'overview returns the same most recent deliveries in order, including timestamp ties');
 const report = await (await worker.dispatchFetch(origin+'/__d1_meter?summary=1')).json();
 assert.equal(report.door, '/api/overview');
 assert.deepEqual(report.unmetered, []);
 assert.ok(report.rows < 1_300, `overview read ${report.rows} rows with populated delivery history`);
 console.log(`Populated notification upgrade: ${writes} rows written, 0 on replay, ${report.rows} read by the overview`);
}
