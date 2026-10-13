import { assert, uuid, hexId, kvOf } from './validation.mjs';
import { workerConsumerScript } from './queue-consumer.mjs';
function unique(rows, key, name) { const found = rows.filter(x => x?.[key] === name); assert(found.length <= 1,'ambiguous-resource-name'); return found[0]; }
/** Account-level resources found or created by name. Durable Object namespaces
 * belong to their Worker and are created by its upload migration instead. */
export const resourceKinds = Object.freeze({
  d1: {items:plan => plan.d1, key:'name',
    list:api => api.list('/d1/database'),
    create:(api,item) => api.request('/d1/database',{method:'POST',body:{name:item.name}})},
  r2: {items:plan => plan.r2, key:'name',
    list:api => api.list('/r2/buckets',{field:'buckets',pagination:'r2-bounded'}),
    create:(api,item) => api.request('/r2/buckets',{method:'POST',body:{name:item.name,...(item.locationHint ? {locationHint:item.locationHint}: {})}})},
  kv: {items:kvOf, key:'title',
    list:api => api.list('/storage/kv/namespaces'),
    create:(api,item) => api.request('/storage/kv/namespaces',{method:'POST',body:{title:item.name}})},
  queues: {items:plan => plan.queues, key:'queue_name',
    list:api => api.list('/queues'),
    create:(api,item) => api.request('/queues',{method:'POST',body:{queue_name:item.name}})},
});
export function findResource(rows, kind, name) { return unique(rows,resourceKinds[kind].key,name); }
export async function reconcileResources(api, plan, { create = true } = {}) {
  const resources = { d1:[], r2:[], queues:[] };
  if (plan.d1.length) {
    const rows = await resourceKinds.d1.list(api);
    for (const item of plan.d1) {
      let row = unique(rows,'name',item.name);
      if (!row) { assert(create,'missing-d1'); row = await resourceKinds.d1.create(api,item); }
      assert(row.name === item.name && uuid(row.uuid), 'invalid-d1-identity');
      const read = await api.request(`/d1/database/${row.uuid}`);
      assert(read.uuid === row.uuid && read.name === item.name && (!item.readReplication || read.read_replication?.mode === item.readReplication), 'incompatible-d1');
      resources.d1.push({binding:item.binding,name:item.name,id:row.uuid});
    }
  }
  if (plan.r2.length) {
    const rows = await resourceKinds.r2.list(api);
    for (const item of plan.r2) {
      let row = unique(rows,'name',item.name);
      if (!row) { assert(create,'missing-r2'); row = await resourceKinds.r2.create(api,item); }
      const read = await api.request(`/r2/buckets/${item.name}`);
      assert(row.name === item.name && read.name === item.name && (!item.jurisdiction || read.jurisdiction === item.jurisdiction) && (!item.storageClass || read.storage_class === item.storageClass), 'incompatible-r2');
      resources.r2.push({binding:item.binding,name:item.name});
    }
  }
  // Only plans that declare KV carry the key, so earlier receipts compare unchanged.
  if (kvOf(plan).length) {
    resources.kv = [];
    const rows = await resourceKinds.kv.list(api);
    for (const item of kvOf(plan)) {
      let row = unique(rows,'title',item.name);
      if (!row) { assert(create,'missing-kv'); row = await resourceKinds.kv.create(api,item); }
      assert(row.title === item.name && hexId(row.id), 'invalid-kv-identity');
      const read = await api.request(`/storage/kv/namespaces/${row.id}`);
      assert(read.id === row.id && read.title === item.name, 'incompatible-kv');
      resources.kv.push({binding:item.binding,name:item.name,id:row.id});
    }
  }
  if (plan.queues.length) {
    const rows = await resourceKinds.queues.list(api);
    for (const item of plan.queues) {
      let row = unique(rows,'queue_name',item.name);
      if (!row) { assert(create,'missing-queue'); row = await resourceKinds.queues.create(api,item); }
      assert(row.queue_name === item.name && hexId(row.queue_id), 'invalid-queue-identity');
      const read = await api.request(`/queues/${row.queue_id}`);
      assert(read.queue_name === item.name && read.queue_id === row.queue_id && read.settings?.delivery_paused !== true, 'incompatible-or-paused-queue');
      resources.queues.push({binding:item.binding,name:item.name,id:row.queue_id});
    }
  }
  return resources;
}
export async function reconcileTriggers(api, plan, resources, { mutate = true, reapplyCrons = false } = {}) {
  // PUT replaces the entire schedule set. Inspect it before any trigger write,
  // and never remove a schedule that the requested plan does not own.
  const crons = await checkCronOwnership(api, plan);
  const updates = [];
  for (const item of plan.queues.filter(x => x.consumer)) {
    const id = resources.queues.find(x => x.binding === item.binding).id;
    const consumers = await api.request(`/queues/${id}/consumers`);
    assert(Array.isArray(consumers), 'invalid-queue-consumers');
    const wanted = {type:'worker',script_name:plan.worker,settings:item.consumer,...(item.deadLetterQueue ? {dead_letter_queue:item.deadLetterQueue} : {})};
    const matches = consumers.filter(x => workerConsumerScript(x) === plan.worker);
    assert(consumers.length === matches.length && matches.length <= 1, 'queue-consumer-conflict');
    const row = matches[0];
    if (!row || (row.dead_letter_queue || '') !== (item.deadLetterQueue || '') || Object.entries(item.consumer).some(([k,v]) => row.settings?.[k] !== v)) {
      assert(mutate,'queue-consumer-drift');
      if (row) assert(hexId(row.consumer_id),'invalid-consumer-id');
      updates.push({path:`/queues/${id}/consumers${row ? `/${row.consumer_id}`:''}`,options:{method:row ? 'PUT':'POST',body:wanted}});
    }
  }
  // Validate every consumer's ownership before applying any trigger update.
  for (const {path,options} of updates) await api.request(path,options);
  const desired = JSON.stringify([...plan.crons].sort());
  if (JSON.stringify(crons) !== desired || reapplyCrons && plan.crons.length > 0) {
    assert(mutate,'cron-drift');
    await api.request(`/workers/scripts/${plan.worker}/schedules`,{method:'PUT',body:plan.crons.map(cron => ({cron}))});
    assert(JSON.stringify(await checkCronOwnership(api,plan)) === desired,'cron-drift');
  }
}

export async function checkCronOwnership(api, plan) {
  const result = await api.request(`/workers/scripts/${plan.worker}/schedules`);
  assert(result && !Array.isArray(result) && Array.isArray(result.schedules) && result.schedules.every(x => typeof x?.cron === 'string' && x.cron.trim()), 'invalid-cron-list');
  const crons = result.schedules.map(x => x.cron).sort();
  assert(new Set(crons).size === crons.length, 'invalid-cron-list');
  assert(crons.every(cron => plan.crons.includes(cron)), 'cron-drift');
  return crons;
}
