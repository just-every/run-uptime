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
 notification_destinations:['id','name','kind','enabled','created_at','deleted_at','address'],
 notification_jobs:['id','event_id','destination_id','destination_name','kind','event','created_at','state','code','finished_at','attempts'],
 integration_deliveries:['namespace','id','envelope','state','attempts','created_at','next_at','max_attempts','retry_delays'],
 integration_attempts:['namespace','id','delivery_id','number','started_at','finished_at','outcome'],
 integration_resolutions:['namespace','id','delivery_id','at','outcome'],
 integration_replays:['namespace','id','envelope','received_at'],
 archive_history:['id','table_name','record'],
 uptime_erasure_receipts:['id','entity_kind','counts','completed_at'],
 uptime_audit:['id','actor_kind','actor_ref','occurred_at','action','subject_kind','subject_ref'],
 definition_batches:['id','created_at','actor_kind','actor_ref','source','plan_digest','counts','undone_at','restored_at'],
 definition_batch_entries:['batch_id','monitor_id','action','revision','previous_revision','undo_outcome'],
};
export const TABLES=Object.keys(columns);
// Product tables each extension version carries: 1 predates the audit, 2 predates definition batches.
export const EXTENSION_VERSION=3;
export const EXTENSION_TABLES:Record<number,string[]>={1:['uptime_audit','uptime_erasure_receipts','definition_batches','definition_batch_entries'],2:['definition_batches','definition_batch_entries'],3:[]};
export const extensionTables=(version:number)=>TABLES.filter(name=>!LEGACY_TABLES.includes(name)&&!EXTENSION_TABLES[version].includes(name));
export const notificationNamespace='uptime-notifications';
export type Tables=Record<string,any[]>;
export const object=(v:any)=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export function shape(row:any,keys:string[],label:string){if(!object(row)||Object.keys(row).sort().join(',')!==keys.slice().sort().join(','))throw Error(`Invalid archive ${label} row shape`)}
export function clock(v:any,label:string){if(!Number.isSafeInteger(v)||v<0)throw Error(`Invalid archive ${label} time`)}
export function identity(v:any,label:string){if(typeof v!=='string'||!v||v.length>512||/[\x00-\x1f\x7f]/.test(v))throw Error(`Invalid archive ${label} identity`)}
export function unique(rows:any[],key:(r:any)=>string,label:string){const map=new Map<string,any>();for(const r of rows){const id=key(r);identity(id,label);if(map.has(id))throw Error(`Duplicate archive ${label}`);map.set(id,r)}return map}
export async function digest(value:string){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join('')}
export function assertBytes(value:any,reservedBytes=0){if(new TextEncoder().encode(JSON.stringify(value)).byteLength+reservedBytes>ARCHIVE_BYTES)throw Error('Archive exceeds 2 MiB (byte bound exceeded: 2 MiB)')}
export async function portableArchive(t:Tables,createdAt=Date.now(),erasureFence?:any){
 const payload={schemaVersion:ARCHIVE_VERSION,target:'uptime-worker-d1',createdAt,tables:Object.fromEntries(LEGACY_TABLES.map(name=>[name,t[name]])),extensionVersion:EXTENSION_VERSION,...(erasureFence?{erasureFence}:{}),productTables:Object.fromEntries(TABLES.filter(name=>!LEGACY_TABLES.includes(name)).map(name=>[name,t[name]]))};
 return {payload,sha256:await digest(JSON.stringify(payload))};
}
export function portableDefinition(text:string){const value=JSON.parse(text);if(value.request!==undefined){delete value.request;return JSON.stringify(value)}return text}
