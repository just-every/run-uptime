import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {phaseState, rememberDiscovery} from './state.mjs';
import {nativeHttp} from './http.mjs';
import {errorCode} from '../../src/base/modules/agent-door/conformance/protocol.mjs';

const snapshots = new Map();
const deletionSnapshots = new Map();
const sponsorAccess = new Map();
const recordAuthority = new Set(['uptime.access.update', 'uptime.destinations.update', 'uptime.monitors.create', 'uptime.monitors.update', 'uptime.routes.update']);
async function result(tool, name, args) {
 const answer = await tool(name, args);
 assert.equal(answer.result?.isError, false, 'Native journey call completes through the shared door.');
 return answer.result.structuredContent;
}
export async function beforeStep(context) {
 const {origin, phase, step, tool} = context;
 if (recordAuthority.has(step.tool)) sponsorAccess.set(origin + phase + step.id, await nativeHttp(context).json('/api/access/self'));
 if (!step.tool.startsWith('uptime.incidents.')) return;
 const state = phaseState.get(origin);
 if(step.id==='delete-incident-comment'){
  const view=await nativeHttp(context).json('/api/v1/incidents/'+encodeURIComponent(state.incident.id));
  const saved=view.comments.find(row=>row.id===state.commentDelete.id);
  assert.equal(saved.text,state.commentDelete.text);assert.equal(saved.version,state.commentDelete.version);
  assert.deepEqual(saved.history.map(row=>({version:row.version,text:row.text})),[{version:1,text:state.commentDelete.original}]);
  deletionSnapshots.set(origin+phase,view);
 }
 snapshots.set(origin + phase, await result(tool, 'uptime.monitors.history', {id: state.observedMonitor.id}));
}
export async function afterStep(context) {
 const {origin, phase, step, result: output, tool} = context;
 if (recordAuthority.has(step.tool)) assert.deepEqual(await nativeHttp(context).json('/api/access/self'), sponsorAccess.get(origin + phase + step.id), 'Record operations leave the current sponsor’s native role and grants unchanged.');
 if(step.id==='rename-paused-monitor'){
  const record=phaseState.get(origin).pausedUpdate;
  const rows=await nativeHttp(context).json('/api/monitors/'+record.id+'/revisions');
  assert.equal(rows.length,2,'the standard fixture saves exactly one native revision');
  assert.deepEqual(rows.find(row=>row.revision===record.revision).definition,record.definition);
  assert.deepEqual(rows.find(row=>row.revision===record.revision+1).definition,{...record.definition,name:'Native conformance paused name edited'});
  assert.equal(output.revision,record.revision+1);assert.equal(output.definition.enabled,false);
 }
 if (step.tool === 'uptime.discovery.start') rememberDiscovery(origin, output.id);
 if (!step.tool.startsWith('uptime.incidents.')) return;
 const state = phaseState.get(origin);
 if(step.id==='delete-incident-comment'){
  const before=deletionSnapshots.get(origin+phase),comment=state.commentDelete;
  const view=await nativeHttp(context).json('/api/v1/incidents/'+encodeURIComponent(state.incident.id));
  const tombstone=view.comments.find(row=>row.id===comment.id);
  assert.equal(output.incidentId,state.incident.id);assert.equal(output.id,comment.id);assert.equal(output.deleted,true);
  assert.equal(tombstone.text,null);assert.equal(tombstone.version,comment.version+1);assert.ok(tombstone.deletedAt);
  assert.deepEqual(tombstone.history,[]);assert.deepEqual(tombstone.mentions,[]);
  assert.ok(!JSON.stringify(view).includes(comment.original));assert.ok(!JSON.stringify(view).includes(comment.text));
  assert.deepEqual(view.comments.filter(row=>row.id!==comment.id),before.comments.filter(row=>row.id!==comment.id));
  const deletion=view.timeline.filter(row=>row.kind==='comment_deleted'&&row.data.commentId===comment.id);
  assert.equal(deletion.length,1);assert.equal(deletion[0].data.version,comment.version+1);
  assert.equal(deletion[0].actor.kind,'agent');
  for(const key of ['machineState','status','version','nextDue','nextDueKind','deliveries','trigger','recovery'])assert.deepEqual(view[key],before[key]);
  console.log('PROBE SURFACE-004 published-Base-'+phase+': native comment with edit history -> one attributed deletion, null text, empty history and unchanged native incident state');
 }
 const history = await result(tool, 'uptime.monitors.history', {id: state.observedMonitor.id});
 assert.deepEqual(history, snapshots.get(origin + phase), 'Incident coordination never rewrites independently observed scheduled evidence.');
}
export default async function nativeJourney(context) {
 const {origin, tool} = context;
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
 const http = nativeHttp(context), self = await http.json('/api/access/self');
 const inventory = await http.json('/agents/api/agents');
 const agent = inventory.agents.find(item => item.specialist === 'monitoring-operator' && !item.revoked);
 assert.ok(agent, 'The native person door identifies the current conformance agent.');
 const change = {id: self.id, version: self.revision, role: 'admin', scopes: []};
 const proof = await http.json('/agents/native-proof', {agent_id: agent.id, tool: 'uptime.access.update', arguments: change});
 const denied = await tool('uptime.access.update', {...change, idempotency_key: randomUUID()}, {proofReference: proof.reference});
 assert.equal(errorCode(denied), 'another_administrator_required', 'Even a proved owner cannot edit its own native assignment.');
 assert.deepEqual(await http.json('/api/access/self'), self, 'The refused self-edit changes no native role or scope.');
 // Report only public error codes and operation names from this disposable
 // installation, so upstream refusal attribution has runtime evidence.
 let after;
 do {
  const page = await http.json('/agents/api/audit' + (after ? '?after=' + encodeURIComponent(after) : ''));
  for (const row of page.rows) if (row.door === 'embedded' || row.code && row.ignored_arguments?.includes('instruction')) {
   console.log('Native conformance refusal ' + JSON.stringify({tool: row.tool, door: row.door, code: row.code, outcome: row.outcome}));
  }
  if (page.cursor === after) break;
  after = page.cursor;
 } while (after);
}
