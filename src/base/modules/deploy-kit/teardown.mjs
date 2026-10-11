import { assert, hexId, uuid } from './validation.mjs';
import { workerConsumerScript } from './queue-consumer.mjs';

function checked(rows, key, valid) {
  assert(Array.isArray(rows) && rows.every(row => row && valid(row[key])),'teardown-invalid-list-identity');
  assert(new Set(rows.map(row => row[key])).size === rows.length,'teardown-duplicate-list-identity');
  return rows;
}
const listedName = value => typeof value === 'string' && value.length > 0;
const name = value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,62}$/.test(value);

/** Read every account list. Post-delete callers restart this entire snapshot. */
async function inventory(api) {
  const reads = await Promise.allSettled([
    api.list('/workers/scripts',{pagination:'single'}), api.list('/d1/database'),
    api.list('/r2/buckets',{field:'buckets',pagination:'r2-bounded'}), api.list('/queues'),
    api.list('/workers/durable_objects/namespaces'),
  ]);
  const failure = reads.find(result => result.status === 'rejected');
  if (failure) throw failure.reason;
  const [workers,d1,r2,queues,durableObjects] = reads.map(result => result.value);
  checked(workers,'id',listedName); checked(d1,'uuid',uuid); checked(r2,'name',listedName); checked(queues,'queue_id',hexId); checked(durableObjects,'id',hexId);
  assert(d1.every(row=>listedName(row.name)) && queues.every(row=>listedName(row.queue_name)) && durableObjects.every(row=>listedName(row.script)),'teardown-invalid-list-name');
  const consumers = [];
  // The provider's global request budget bounds consumer reads as well.
  for (const queue of queues) {
    const rows = checked(await api.list(`/queues/${queue.queue_id}/consumers`,{pagination:'single'}),'consumer_id',hexId);
    assert(rows.every(row=>row.type !== 'worker' || workerConsumerScript(row)),'teardown-invalid-worker-consumer');
    consumers.push(...rows.map(row=>({...row,queueId:queue.queue_id,queueName:queue.queue_name})));
  }
  return {workers,d1,r2,queues,consumers,durableObjects};
}

/** Read-only verification. It never deletes, repairs or authorizes deletion. */
export async function verifyTeardown({api,plan,receipt,prefix=plan?.worker,maxAttempts=4,clock=()=>performance.now(),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),onAttempt=()=>{}}) {
  assert(receipt?.version === 1 && receipt.accountId === api.accountId && receipt.worker === plan?.worker,'teardown-receipt-target-mismatch');
  assert(name(prefix) && (prefix.startsWith('rer-seedproof-') || /^rer-base-stage-[0-9]{1,20}$/.test(prefix)) && plan.worker === prefix,'teardown-disposable-prefix-required');
  assert(Number.isSafeInteger(maxAttempts) && maxAttempts >= 1 && maxAttempts <= 8,'teardown-invalid-attempt-bound');
  assert(Array.isArray(receipt.resources?.d1) && Array.isArray(receipt.resources.r2) && Array.isArray(receipt.resources.queues) && Array.isArray(receipt.durableObjects),'teardown-invalid-receipt');
  assert(receipt.resources.d1.every(row=>uuid(row.id) && listedName(row.name)) && receipt.resources.r2.every(row=>listedName(row.name)) && receipt.resources.queues.every(row=>hexId(row.id) && listedName(row.name)) && receipt.durableObjects.every(row=>hexId(row.id)),'teardown-invalid-receipt-identity');
  const attempts = []; const start = clock();
  const prefixed = value => typeof value === 'string' && value.startsWith(prefix);
  for (let number=1; number<=maxAttempts; number++) {
    const attempt = {number,offsetMs:Math.round(clock()-start),errorClass:null}; attempts.push(attempt);
    try {
      const listing = await inventory(api);
      const remaining = {
        workers:listing.workers.filter(row=>row.id === receipt.worker || prefixed(row.id)),
        d1:listing.d1.filter(row=>receipt.resources.d1.some(owned=>owned.id === row.uuid) || prefixed(row.name)),
        r2:listing.r2.filter(row=>receipt.resources.r2.some(owned=>owned.name === row.name) || prefixed(row.name)),
        queues:listing.queues.filter(row=>receipt.resources.queues.some(owned=>owned.id === row.queue_id) || prefixed(row.queue_name)),
        consumers:listing.consumers.filter(row=>receipt.resources.queues.some(owned=>owned.id === row.queueId) || prefixed(row.queueName) || workerConsumerScript(row) === receipt.worker || prefixed(workerConsumerScript(row))),
        durableObjects:listing.durableObjects.filter(row=>receipt.durableObjects.some(owned=>owned.id === row.id) || prefixed(row.script) || prefixed(row.name) || prefixed(row.class)),
      };
      attempt.counts = Object.fromEntries(Object.entries(listing).map(([type,rows])=>[type,rows.length]));
      const survivors = Object.entries(remaining).flatMap(([type,rows])=>rows.map(row=>({type,name:row.name ?? row.queue_name ?? row.script ?? row.id,id:row.uuid ?? row.queue_id ?? row.consumer_id ?? row.id})));
      if (survivors.length) {
        const error = new Error('teardown-resources-remain'); error.remaining = survivors; error.listing = remaining; throw error;
      }
      await onAttempt(attempt);
      // The scoped view is the empty listing that was seen; foreign rows stay out of the evidence.
      return {ok:true,scope:'authenticated-scoped-teardown-verification',prefix,accountId:api.accountId,attempts,listing:remaining};
    } catch (error) {
      attempt.errorClass = error.message;
      await onAttempt(attempt);
      // Partial snapshots can accompany concurrent removal as well. They may
      // be retried here, but never accepted, inferred empty, or relaxed.
      if (number === maxAttempts || !['provider-pagination-changed','provider-partial-list'].includes(error.message)) {
        error.attempts = attempts;
        throw error;
      }
      await sleep(Math.min(250 * 2 ** (number-1),2000));
    }
  }
}
