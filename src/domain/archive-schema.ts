import {sourceHistoryColumns} from './source-history/archive.ts'
import {incidentArchiveColumns} from './incident-work/portability.server.ts'
import {dependencyArchiveColumns} from './dependency-archive.ts'
import {discoveryArchiveColumns} from './discovery-sources-archive.ts'
/** Portable product records. Credential versions, claim tokens and deployment authority are never columns here. */
export const ARCHIVE_VERSION=2;
export const ARCHIVE_BYTES=2*1024*1024;
export const ARCHIVE_ROWS=10000;
export const LEGACY_TABLES=['migrations','monitors','revisions','slots','observations','outbox'];
export const columns:Record<string,string[]>={
 migrations:['version','applied_at'],monitors:['id','revision','definition','next_due','state'],
 revisions:['monitor_id','revision','definition','created_at'],
 slots:['id','monitor_id','revision','due_at','status','definition','lease_owner','lease_until','missed_count','manual'],
 observations:['id','slot_id','probe','attempt','evidence'],outbox:['id','monitor_id','slot_id','kind','event','status','lease_until','receipt'],
 scheduled_reports:['id','monitor_id','destination_id','actor_id','due_at','created_at','delivery_id','report'],
 ...incidentArchiveColumns,
 ...sourceHistoryColumns,
 notification_destinations:['id','name','kind','enabled','created_at','deleted_at','address','webhook_template'],
 notification_jobs:['id','event_id','destination_id','destination_name','kind','event','created_at','state','code','finished_at','attempts','webhook_template'],
 integration_deliveries:['namespace','id','envelope','state','attempts','created_at','next_at','max_attempts','retry_delays'],
 notification_delivery_attempts:['delivery_id','destination_id','number','phase','scheduled_at','started_at','finished_at','outcome_category','code','status','retry_after_seconds','key_reference'],
 integration_attempts:['namespace','id','delivery_id','number','started_at','finished_at','outcome'],
 integration_resolutions:['namespace','id','delivery_id','at','outcome'],
 integration_replays:['namespace','id','envelope','received_at'],
 archive_history:['id','table_name','record'],
 uptime_erasure_receipts:['id','entity_kind','counts','completed_at'],
 uptime_audit:['id','actor_kind','actor_ref','occurred_at','action','subject_kind','subject_ref'],
 failure_snapshots:['observation_id','monitor_id','slot_id','captured_at','expires_at','snapshot'],
 heartbeat_runs:['id','monitor_id','revision','sequence','state','received_at','started_at','duration_ms','exit_code','output','late'],
 definition_batches:['id','created_at','actor_kind','actor_ref','source','plan_digest','counts','undone_at','restored_at'],
 auxiliary_attempts:['id','scope','job_id','started_at','lease_until','submitted_at','finished_at','outcome','code'],
 definition_batch_entries:['batch_id','monitor_id','action','revision','previous_revision','undo_outcome'],
 cleanup_debt:['id','monitor_id','revision','slot_id','probe','attempt','observation_id','step_name','attempts','category','created_at','state','resolver_note','resolved_at'],
 ...dependencyArchiveColumns,
 ...discoveryArchiveColumns,
};
export const TABLES=Object.keys(columns);
// Product tables each extension version lacks: 1 predates the audit, 2 predates definition batches, 8 predates cleanup debt.
export const EXTENSION_VERSION=15;
export const EXTENSION_TABLES:Record<number,string[]>={1:['failure_snapshots','heartbeat_runs',...Object.keys(incidentArchiveColumns),'uptime_audit','uptime_erasure_receipts','definition_batches','definition_batch_entries'],2:['failure_snapshots','heartbeat_runs',...Object.keys(incidentArchiveColumns),'definition_batches','definition_batch_entries'],3:['failure_snapshots','heartbeat_runs',...Object.keys(incidentArchiveColumns)],4:['failure_snapshots','heartbeat_runs'],5:['failure_snapshots'],6:['failure_snapshots'],7:[],8:[],9:[],10:[],11:[],12:[],13:[],14:[],15:[]};
for(const version of [1,2,3,4,5,6,7])EXTENSION_TABLES[version].push('auxiliary_attempts');
for(const version of [1,2,3,4,5,6,7,8])EXTENSION_TABLES[version].push('cleanup_debt');
for(const version of [1,2,3,4,5,6,7,8,9])EXTENSION_TABLES[version].push('notification_delivery_attempts');
// Version 11 added the catalog's followed services and dependency notice acknowledgements.
for(const version of [1,2,3,4,5,6,7,8,9,10])EXTENSION_TABLES[version].push(...Object.keys(dependencyArchiveColumns));
// Version 12 added discovery sources, their run snapshots and the owner's decisions.
for(const version of [1,2,3,4,5,6,7,8,9,10,11])EXTENSION_TABLES[version].push(...Object.keys(discoveryArchiveColumns));
// Version 13 adds mention history; versions 1–3 already exclude the entire collaboration set.
for(const version of [4,5,6,7,8,9,10,11,12])EXTENSION_TABLES[version].push('incident_mentions');
for(const version of [1,2,3,4,5,6,7,8,9,10,11,12,13])EXTENSION_TABLES[version].push('scheduled_reports');
for(const version of [1,2,3,4,5,6,7,8,9,10,11,12,13,14])EXTENSION_TABLES[version].push(...Object.keys(sourceHistoryColumns));
export const extensionTables=(version:number)=>TABLES.filter(name=>!LEGACY_TABLES.includes(name)&&!EXTENSION_TABLES[version].includes(name));
export const notificationNamespace='uptime-notifications';
export type Tables=Record<string,any[]>;
export type ArchiveSelection={kind:'monitors';monitorIds:string[];sharedRecords:'installation-history-v1'};
export const object=(v:any)=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export function shape(row:any,keys:string[],label:string){if(!object(row)||Object.keys(row).sort().join(',')!==keys.slice().sort().join(','))throw Error(`Invalid archive ${label} row shape`)}
export function clock(v:any,label:string){if(!Number.isSafeInteger(v)||v<0)throw Error(`Invalid archive ${label} time`)}
export function identity(v:any,label:string){if(typeof v!=='string'||!v||v.length>512||/[\x00-\x1f\x7f]/.test(v))throw Error(`Invalid archive ${label} identity`)}
export function unique(rows:any[],key:(r:any)=>string,label:string){const map=new Map<string,any>();for(const r of rows){const id=key(r);identity(id,label);if(map.has(id))throw Error(`Duplicate archive ${label}`);map.set(id,r)}return map}
export async function digest(value:string){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join('')}
export function assertBytes(value:any,reservedBytes=0){const bytes=new TextEncoder().encode(JSON.stringify(value)).byteLength+reservedBytes;if(bytes>ARCHIVE_BYTES)throw Error(`Archive exceeds 2 MiB (byte bound exceeded: 2 MiB); ${bytes} bytes projected, limit ${ARCHIVE_BYTES}`)}
export async function portableArchive(t:Tables,createdAt=Date.now(),erasureFence?:any,selection?:ArchiveSelection){
 const payload={schemaVersion:ARCHIVE_VERSION,target:'uptime-worker-d1',createdAt,tables:Object.fromEntries(LEGACY_TABLES.map(name=>[name,t[name]])),extensionVersion:EXTENSION_VERSION,...(erasureFence?{erasureFence}:{}),...(selection?{selection}:{}),productTables:Object.fromEntries(TABLES.filter(name=>!LEGACY_TABLES.includes(name)).map(name=>[name,t[name]]))};
 return {payload,sha256:await digest(JSON.stringify(payload))};
}
