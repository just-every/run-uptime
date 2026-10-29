import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {phaseState, rememberDiscovery} from './state.mjs';

const snapshots = new Map();
async function result(tool, name, args) {
 const answer = await tool(name, args);
 assert.equal(answer.result?.isError, false, 'Native journey call completes through the shared door.');
 return answer.result.structuredContent;
}
export async function beforeStep({origin, phase, step, tool}) {
 if (!step.tool.startsWith('uptime.incidents.')) return;
 const state = phaseState.get(origin);
 snapshots.set(origin + phase, await result(tool, 'uptime.monitors.history', {id: state.observedMonitor.id}));
}
export async function afterStep({origin, phase, step, result: output, tool}) {
 if (step.tool === 'uptime.discovery.start') rememberDiscovery(origin, output.id);
 if (!step.tool.startsWith('uptime.incidents.')) return;
 const state = phaseState.get(origin);
 const history = await result(tool, 'uptime.monitors.history', {id: state.observedMonitor.id});
 assert.deepEqual(history, snapshots.get(origin + phase), 'Incident coordination never rewrites independently observed scheduled evidence.');
}
export default async function nativeJourney({origin, tool}) {
 const state = phaseState.get(origin), args = {id: state.check.id, version: state.check.revision, idempotency_key: randomUUID()};
 const first = await result(tool, 'uptime.checks.run', args);
 assert.equal(first.policyAdvanced, false, 'A manual request does not advance scheduled incident policy.');
 assert.deepEqual(await result(tool, 'uptime.checks.run', args), first, 'Exact-key manual replay retains one native queue effect.');
 const monitor = await result(tool, 'uptime.monitors.read', {id: state.check.id});
 assert.equal(monitor.current.state, 'Unknown', 'Unobserved manual work cannot establish scheduled health.');
 const history = await result(tool, 'uptime.monitors.history', {id: state.observedMonitor.id});
 const observed = history.items.filter(row => row.manual === 0 && row.observation);
 assert.deepEqual(new Set(observed.map(row => row.observation.probe)), new Set(['local-a', 'local-b']), 'Both independently enrolled vantages remain visible.');
 assert.ok(observed.every(row => row.observation.outcome === 'target_failure'), 'Only signed, independently observed failures establish this outage.');
}
