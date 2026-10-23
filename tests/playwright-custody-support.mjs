import assert from 'node:assert/strict';
import {join} from 'node:path';
import {availablePorts, migratedWorker} from './notify-acceptance-runtime.mjs';
import {signInOwner, testAuthBindings} from './auth-test-support.mjs';
import {flowDigest} from '../src/domain/flow.mjs';

export async function proveImportedCustody({directory, id, ok}) {
 const original = (await ok(`/api/monitors/${id}/revisions`));
 const sourceRows = original.filter(row => row.definition.flow?.source);
 assert.ok(sourceRows.length > 1);
 const archive = await ok('/api/archive');
 const [port] = await availablePorts(1), origin = `http://127.0.0.1:${port}`;
 const {worker} = await migratedWorker({port, persist: join(directory, 'imported-restore'), bindings: {UPTIME_ORIGIN: origin}});
 try {
  const cookie = await signInOwner(origin, {bindings: {...testAuthBindings, UPTIME_ORIGIN: origin}});
  const call = async (path, body) => {
   const response = await fetch(origin + path, {method: body === undefined ? 'GET' : 'POST', headers: {origin, cookie, 'content-type': 'application/json'}, body: body === undefined ? undefined : JSON.stringify(body)});
   assert.equal(response.status, 200); return response.json();
  };
  await call('/api/restore', archive);
  const restored = (await call('/api/overview')).monitors.find(m => m.id === id);
  assert.equal(restored.definition.enabled, false); assert.equal(restored.state.state, 'Paused');
  const revisions = await call(`/api/monitors/${id}/revisions`);
  for (const row of sourceRows) {
   const copy = revisions.find(r => r.revision === row.revision);
   assert.deepEqual(copy.definition.flow.source, row.definition.flow.source);
   assert.equal(await flowDigest(copy.definition.flow), await flowDigest(row.definition.flow));
  }
  const exported = (await call('/api/definitions/export')).monitors.find(m => m.name === restored.definition.name);
  assert.deepEqual(exported.flow.source, restored.definition.flow.source);
  const erased = await call(`/api/monitors/${id}/erase`, {name: restored.definition.name});
  assert.ok(erased.receipt.counts.revisions >= sourceRows.length);
  const after = await call('/api/archive');
  for (const table of ['monitors', 'revisions', 'slots']) assert.ok(!after.payload.tables[table].some(row => row.id === id || row.monitor_id === id), `${table}: erased imported source is absent`);
  assert.ok(!JSON.stringify(after).includes(sourceRows[0].definition.flow.source.files[0].text), 'neither imported source nor archive-history copies survive erasure');
 } finally { await worker.dispose(); }
}
