// Every class of D1 error a runner's notification poll can meet, injected under the running Worker and observed at its HTTP door.
// A trigger makes the write each poll performs fail with the message that class of D1 error carries. Racing writers and guard failures
// answer 409 conflict, every other fault answers 503 storage_unavailable with Retry-After, each names the operation that failed, and the
// next poll succeeds. (The Worker's log line for each is captured in the evidence run, which reads the Worker process's output.)
// An email whose pre-send write and claim release both fail is never lost: its claim expires back to the queue and it is sent once.
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {testAuthBindings} from './auth-test-support.mjs';
import {availablePorts, cleanupDirectory, migratedWorker, ownerAPI, runtimeDirectory} from './notify-acceptance-runtime.mjs';

const classes = {
  guard: ['NOT NULL constraint failed: uptime_audit.id', 409, 'guard_conflict'],
  unique: ['UNIQUE constraint failed: notification_jobs.id', 409, 'constraint'],
  overloaded: ['D1 DB is overloaded. Requests queued for too long.', 503, 'transient'],
  reset: ['Durable Object reset because its code was updated.', 503, 'transient'],
  network: ['Network connection lost', 503, 'transient'],
  schema: ['no such table: notification_jobs_missing', 503, 'schema'],
  other: ['SQL logic error injected for classification', 503, 'other'],
};
const directory = await runtimeDirectory(), [port] = await availablePorts(1), origin = `http://127.0.0.1:${port}`;
let worker;
try {
  let DB;
  ({worker, DB} = await migratedWorker({port, persist: join(directory, 'worker'), bindings: {UPTIME_SYNTHETIC_PORT: String(port - 1)}}));
  const poll = () => fetch(`${origin}/api/runner/notifications`, {method: 'POST', headers: {'content-type': 'application/json', 'x-runner-key': testAuthBindings.UPTIME_RUNNER_KEY}, body: JSON.stringify({operation: 'poll'})});
  assert.equal((await poll()).status, 200);
  {
    for (const [name, [message, status, klass]] of Object.entries(classes)) {
      await DB.exec(`CREATE TRIGGER storage_fault BEFORE UPDATE ON runner_contact BEGIN SELECT RAISE(ABORT, '${message}'); END`);
      const response = await poll(), body = await response.json();
      await DB.exec('DROP TRIGGER storage_fault');
      assert.equal(response.status, status, name);
      assert.equal(body.class, klass, name);
      assert.match(body.operation, /^notifications\.poll\./, `${name} names the failing operation`);
      assert.equal(body.code, status === 409 ? 'conflict' : 'storage_unavailable');
      assert.equal(response.headers.get('retry-after'), status === 503 ? '5' : null);
      assert.equal((await poll()).status, 200, `${name}: the next poll succeeds`);
    }
  }
  // A D1 fault that starts on the write handing an email to the sender and lasts across the claim release: the poll names the
  // write that failed first, the job waits in its claim, and once the claim expires the next poll sends it, exactly once.
  const owner = ownerAPI(origin); await owner.signIn();
  const destination = (await owner.api('/api/notifications/destinations', 'POST', {kind: 'email', name: 'Fault inbox', address: 'fault-inbox@example.test'})).data;
  const {deliveryId} = (await owner.api(`/api/notifications/destinations/${destination.id}/drill`, 'POST', {})).data;
  const overloaded = classes.overloaded[0];
  await DB.exec(`CREATE TRIGGER handoff_fault BEFORE UPDATE OF submitted_at ON alert_drills WHEN NEW.submitted_at IS NOT NULL BEGIN SELECT RAISE(ABORT, '${overloaded}'); END`);
  await DB.exec(`CREATE TRIGGER release_fault BEFORE UPDATE OF state ON notification_jobs WHEN OLD.state='sending' AND NEW.state='queued' BEGIN SELECT RAISE(ABORT, '${overloaded}'); END`);
  const faulted = await poll(), fault = await faulted.json();
  await DB.exec('DROP TRIGGER handoff_fault'); await DB.exec('DROP TRIGGER release_fault');
  assert.equal(faulted.status, 503);
  assert.equal(fault.operation, 'notifications.mail.markSubmitted', 'the answer names the write that failed first, not the release');
  const job = () => DB.prepare('SELECT state, claim_until FROM notification_jobs WHERE id=?').bind(deliveryId).first();
  const sent = async () => (await DB.prepare('SELECT message FROM rer_mail_development_outbox').all()).results.filter(r => r.message.includes('fault-inbox@example.test')).length;
  assert.equal((await job()).state, 'sending');
  assert.equal((await poll()).status, 200); assert.equal(await sent(), 0, 'nothing is sent while the claim lasts');
  // The claim's minute passes.
  await DB.prepare('UPDATE notification_jobs SET claim_until=? WHERE id=?').bind(Date.now() - 1, deliveryId).run();
  for (let i = 0; i < 3; i++) assert.equal((await poll()).status, 200);
  assert.equal((await job()).state, 'accepted', 'the expired claim went back to the queue and was sent');
  assert.equal(await sent(), 1, 'the email was sent exactly once');
  console.log('STORAGE-FAULTS passed: guard and constraint faults answer 409 conflict, transient, schema and other D1 faults answer 503 storage_unavailable with Retry-After, each naming its operation, and the next poll succeeds; an email whose hand-off and release both failed was sent once after its claim expired.');
} finally { await worker?.dispose(); await cleanupDirectory(directory); }
