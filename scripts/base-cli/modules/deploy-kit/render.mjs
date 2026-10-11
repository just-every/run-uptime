import { assert, stable } from './validation.mjs';
export function renderConfig(plan, resources, accountId, sourceSha, fingerprint, main, hasAssets = false) {
  return { name:plan.worker, account_id:accountId, main, compatibility_date:plan.compatibilityDate, compatibility_flags:plan.compatibilityFlags ?? [], workers_dev:true,
    ...(hasAssets ? {assets:{directory:'__static',binding:'ASSETS',run_worker_first:true}} : {}),
    vars:{...plan.vars,RER_DEPLOY_SOURCE:sourceSha,RER_DEPLOY_FINGERPRINT:fingerprint}, version_metadata:{binding:'RER_VERSION'},
    d1_databases:resources.d1.map(x => ({binding:x.binding,database_name:x.name,database_id:x.id})), r2_buckets:resources.r2.map(x => ({binding:x.binding,bucket_name:x.name})),
    queues:{producers:resources.queues.map(x => ({binding:x.binding,queue:x.name})), consumers:plan.queues.filter(x => x.consumer).map(x => ({queue:x.name,...(x.deadLetterQueue ? {dead_letter_queue:x.deadLetterQueue} : {}),max_batch_size:x.consumer.batch_size,max_retries:x.consumer.max_retries,...(x.consumer.max_wait_time_ms === undefined ? {} : {max_batch_timeout:x.consumer.max_wait_time_ms/1000}),...(x.consumer.max_concurrency === undefined ? {} : {max_concurrency:x.consumer.max_concurrency}),...(x.consumer.retry_delay === undefined ? {} : {retry_delay:x.consumer.retry_delay})}))},
    durable_objects:{bindings:plan.durableObjects.map(x => ({name:x.binding,class_name:x.className}))}, triggers:{crons:plan.crons},
    // Only plans that declare KV add the key, so earlier fingerprints are unchanged.
    ...(resources.kv ? {kv_namespaces:resources.kv.map(x => ({binding:x.binding,id:x.id}))} : {}) };
}
export function bindingsFor(config, resources, plan) {
  return [ ...(config.assets ? [{type:'assets',name:'ASSETS'}] : []), ...Object.entries(config.vars).map(([name,text]) => ({type:'plain_text',name,text})), {type:'version_metadata',name:'RER_VERSION'},
    ...resources.d1.map(x => ({type:'d1',name:x.binding,id:x.id})), ...resources.r2.map(x => ({type:'r2_bucket',name:x.binding,bucket_name:x.name})),
    ...(resources.kv ?? []).map(x => ({type:'kv_namespace',name:x.binding,namespace_id:x.id})),
    ...resources.queues.map(x => ({type:'queue',name:x.binding,queue_name:x.name})), ...plan.durableObjects.map(x => ({type:'durable_object_namespace',name:x.binding,class_name:x.className})) ];
}
export function verifyBindings(actual, expected) {
  assert(Array.isArray(actual),'invalid-provider-bindings');
  for (const desired of expected) {
    const rows = actual.filter(x => x.name === desired.name); assert(rows.length === 1,'binding-readback-mismatch');
    for (const [key,value] of Object.entries(desired)) assert(stable(rows[0][key]) === stable(value),'binding-readback-mismatch');
  }
}
