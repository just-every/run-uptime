import {createHmac, randomUUID} from 'node:crypto';
import {probeHeartbeat} from '../../runners/src/probes.mjs';

// The production heartbeat evaluator consumes the real claim's immutable
// receipt snapshot. No observation, incident, scheduled slot or clock is seeded.
export async function prepareIncident(http) {
 const runners = [];
 for (const vantage of ['east', 'west']) runners.push(await http.json('/api/runners', {networkLabel: 'Conformance ' + vantage + ' ' + randomUUID().slice(0, 8)}));
 const signed = async (runner, path, body, enrollment = false) => {
  const at = String(Date.now()), raw = JSON.stringify(body);
  const signature = createHmac('sha256', runner.key).update(at + '.' + (enrollment ? 'runner-enrolment.' : '') + raw).digest('hex');
  return http.json(path, body, {headers: {'x-runner-key': runner.key, 'x-runner-id': runner.runnerId, 'x-sent-at': at, 'x-runner-signature': signature}});
 };
 for (const runner of runners) await signed(runner, '/api/runner/enroll', {version: 1}, true);
 const monitor = await http.json('/api/monitors', {
  name: 'Native conformance heartbeat ' + randomUUID().slice(0, 8), type: 'heartbeat',
  heartbeat: {maxAgeMs: 60000}, probes: ['local-a', 'local-b'],
  assignments: {'local-a': {runnerId: runners[0].runnerId}, 'local-b': {runnerId: runners[1].runnerId}},
  intervalMs: 60000, timeoutMs: 2000, retries: 0, failureQuorum: 2, confirmSlots: 1, recoverSlots: 1,
  enabled: true, service: 'conformance', group: 'conformance',
 });
 const key = await http.json('/api/monitors/' + monitor.id + '/heartbeat-key', {});
 await http.json('/api/heartbeats/' + monitor.id + '/fail/1', {output: 'Native conformance scheduled job failed.'}, {
  headers: {authorization: 'Bearer ' + key.token, 'x-heartbeat-sequence': '1'},
 });
 for (const runner of runners) {
  const claim = await http.json('/api/runner/claim', {}, {headers: {'x-runner-key': runner.key, 'x-runner-id': runner.runnerId}});
  const task = claim.task;
  if (!task || task.monitorId !== monitor.id || task.definition.type !== 'heartbeat' || task.manual) throw new Error('Native scheduled heartbeat claim is unavailable.');
  const attempts = task.probes.map(probe => ({...probeHeartbeat(task.definition, probe, task.heartbeatReceipt), attempt: 0}));
  const accepted = await signed(runner, '/api/runner/results', {slotId: task.id, attempts});
  if (accepted.accepted !== true) throw new Error('Native scheduled heartbeat evidence was refused.');
 }
 const incidents = await http.json('/api/monitors/' + monitor.id + '/incidents');
 if (!Array.isArray(incidents) || incidents.length !== 1) throw new Error('Native scheduled heartbeat did not create its incident.');
 const incident = await http.json('/api/v1/incidents/' + encodeURIComponent(incidents[0].id));
 // Freeze the test's producer through its ordinary native scheduling control.
 await http.json('/api/monitors/' + monitor.id, {...monitor.definition, enabled: false}, {method: 'PATCH'});
 return {incident: {id: incident.id, version: incident.version}, observedMonitor: {id: monitor.id}, runner: {id: runners[0].runnerId}};
}
