import {randomUUID} from 'node:crypto';
import {freshFactor, memberSessions, nativeHttp} from './http.mjs';
import {prepareIncident} from './incident.mjs';
import {discoveries, phaseState, rememberDiscovery} from './state.mjs';
import {pausedUpdateFixture} from './monitor-state.mjs';

const prefix = 'Native conformance ';
function publicDefinition(label, enabled = false) {
 return {name: prefix + label + ' ' + randomUUID().slice(0, 8), type: 'http', network: 'public',
  url: 'https://agent-native.example.test/health', method: 'GET', assertions: {status: 200},
  intervalMs: 60000, timeoutMs: 2000, retries: 0, probes: ['local-a'], failureQuorum: 1,
  confirmSlots: 1, recoverSlots: 1, freshnessMs: 120000, enabled, service: 'conformance', group: 'conformance'};
}

export default async function prepare(context) {
 const {phase, origin} = context;
 if (phase === 'initial') return {values: {}, clients: {}};
 await freshFactor(context);
 const http = nativeHttp(context), member = memberSessions.get(origin);
 if (!member) throw new Error('The declared native member lifecycle did not complete.');
 for (const id of discoveries.get(origin) ?? []) await http.json('/api/discoveries/' + id, undefined, {method: 'DELETE'});
 discoveries.set(origin, new Set());
 // Native teardown avoids exhausting the product's monitor cap across policy
 // rounds. It runs before the verifier takes each phase's no-effect witness.
 const previous = await http.json('/api/v1/monitors?limit=100');
 for (const record of previous.items.filter(record => record.name.startsWith(prefix))) {
  await http.json('/api/monitors/' + record.id + '/erase', {name: record.name});
 }
 await http.json('/api/access/members/' + member.id, {role: 'responder', scopes: []});
 const memberSelf = await nativeHttp({...context, cookie: member.cookie}).json('/api/access/self');
 const owner = await http.json('/api/access/self');
 const observed = await prepareIncident(http);
 // HTTP requests remain queued for an explicitly enrolled private vantage.
 // CORE exercises admission; native worker completion is its separate family.
 const definitionFor = (label, enabled) => ({...publicDefinition(label, enabled), assignments: {'local-a': {runnerId: observed.runner.id}}});
 const records = {};
 for (const [label, enabled] of [['monitor', false], ['update', true], ['pause', true], ['resume', false], ['maintenance', false], ['route', false], ['erase', false], ['check', true]]) {
  records[label] = await http.json('/api/monitors', definitionFor(label, enabled));
 }
 const destination = await http.json('/api/notifications/destinations', {
  name: prefix + 'webhook ' + randomUUID().slice(0, 8), kind: 'webhook',
  url: 'https://notifications.example.com/conformance/' + randomUUID(), enabled: true,
 });
 const discovery = await http.json('/api/discoveries', {url: 'https://agent-native.example.test/'});
 rememberDiscovery(origin, discovery.id);
 const definition = {...definitionFor('created', true), tlsTrust: {mode: 'fingerprint', sha256: 'a'.repeat(64)}};
 const startsAt = Date.now() + 86400000;
 const window = {id: 'conformance-' + randomUUID(), name: 'Native conformance maintenance',
  mode: 'suppress', timeZone: 'UTC', startsAt, endsAt: startsAt + 3600000};
 const values = {
  ...await pausedUpdateFixture(http,definitionFor('paused name edit',false)),
  ...records, erase: {...records.erase, name: records.erase.definition.name},
  ...observed, owner: {id: owner.id, revision: owner.revision}, member: {id: member.id, revision: memberSelf.revision},
  destination: {id: destination.id}, discovery: {id: discovery.id},
  route: {id: records.route.id, policy: {scope: 'monitor', mode: 'selected', destinationIds: [destination.id], expectedRevision: 0}},
  grant: {id: records.monitor.id, operatorId: member.id}, window, definition,
  definitionText: JSON.stringify({format: 'uptime.monitors', version: 1, monitors: [definitionFor('definition file', false)]}),
 };
 phaseState.set(origin, values);
 return {values, clients: {}};
}
