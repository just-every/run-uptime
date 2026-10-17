import {validateHeartbeatRuns} from './heartbeat-archive.ts'
import {validateIncidentArchive} from './incident-work/portability.server.ts'
import {installationLocalTables} from './archive-inventory.ts'
import {validateJournal} from './archive-fence.server.ts'
import {ARCHIVE_VERSION,ARCHIVE_ROWS,EXTENSION_TABLES,LEGACY_TABLES,TABLES,columns,extensionTables,assertBytes,shape,object,clock,digest,type Tables} from './archive-schema.ts'
import {validateMonitorTables} from './archive-monitor-validation.ts'
import {validateNotificationTables} from './archive-notification-validation.ts'
import {validateDefinitionBatches} from './archive-definition-validation.ts'
export async function validateArchive(input:any){
 try{assertBytes(input)}catch(error){if(error instanceof Error)throw Error(`Invalid archive integrity/version: ${error.message}`);throw error}
 if(!object(input)||Object.keys(input).sort().join(',')!=='payload,sha256'||!object(input.payload)||![1,ARCHIVE_VERSION].includes(input.payload.schemaVersion)||input.payload.target!=='uptime-worker-d1'||typeof input.sha256!=='string'||input.sha256!==await digest(JSON.stringify(input.payload)))throw Error('Invalid archive integrity/version');
 const p=input.payload,extended=p.extensionVersion!==undefined;
 shape(p,extended?['schemaVersion','target','createdAt','tables','extensionVersion','productTables',...(p.erasureFence!==undefined?['erasureFence']:[])]:['schemaVersion','target','createdAt','tables'],'payload');clock(p.createdAt,'creation');
 if(extended&&(!Object.hasOwn(EXTENSION_TABLES,p.extensionVersion)||p.schemaVersion!==2))throw Error('Unsupported archive extension');
 if(!object(p.tables)||Object.keys(p.tables).sort().join(',')!==LEGACY_TABLES.slice().sort().join(','))throw Error('Invalid archive tables');
 if(p.erasureFence!==undefined)validateJournal(p.erasureFence);
 const extra=TABLES.filter(t=>!LEGACY_TABLES.includes(t)),expected=extended?extensionTables(p.extensionVersion):[];
 if(extended&&(!object(p.productTables)||Object.keys(p.productTables).sort().join(',')!==expected.slice().sort().join(',')))throw Error('Invalid archive product tables');
 const t:Tables={...structuredClone(p.tables),...Object.fromEntries(extra.map(name=>[name,extended?structuredClone(p.productTables[name]??[]):[]]))};
 for(const name of TABLES){if(!Array.isArray(t[name])||t[name].length>ARCHIVE_ROWS)throw Error(`Archive row bound exceeded: ${name} (${ARCHIVE_ROWS})`);for(const row of t[name]){if(p.schemaVersion===1&&name==='slots'&&!Object.hasOwn(row,'manual'))row.manual=row.id?.includes(':manual:')?1:0;if((p.extensionVersion??0)<6&&['notification_destinations','notification_jobs'].includes(name)&&!Object.hasOwn(row,'webhook_template'))row.webhook_template=null;shape(row,columns[name],name)}}
 const receiptTables=new Set([...TABLES,...Object.keys(installationLocalTables)]);
 const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
 const receiptIds=new Set();
 for(const r of t.uptime_erasure_receipts){if(!uuid.test(r.id)||receiptIds.has(r.id)||!['monitor','destination','operator'].includes(r.entity_kind)||typeof r.counts!=='string')throw Error('Invalid archive erasure receipt');const counts=JSON.parse(r.counts);if(!object(counts)||Object.entries(counts).some(([name,n])=>!receiptTables.has(name)||!Number.isSafeInteger(n)||Number(n)<0))throw Error('Invalid archive erasure receipt counts');clock(r.completed_at,'receipt');receiptIds.add(r.id)}
 const auditIds=new Set();
 for(const r of t.uptime_audit){if(!uuid.test(r.id)||auditIds.has(r.id)||!uuid.test(r.subject_ref)||!['operator','feature','anonymized'].includes(r.actor_kind)||(r.actor_kind==='feature'?!['notification-dispatch','operator-auth-mail','cron-maintenance','archive-transfer','credential-maintenance'].includes(r.actor_ref):!uuid.test(r.actor_ref))||!['erase','credential_rotate','credential_retire','archive_restore','session_revoke','notification_send','maintenance_apply','maintenance_cancel','incident_comment_add','incident_comment_edit','incident_comment_delete','incident_root_cause_change','incident_categories_change','incident_assign','incident_acknowledge','incident_stop','incident_resolve','alert_route_change'].includes(r.action)||!['monitor','destination','operator','credential','archive','session','notification','incident','alert_route'].includes(r.subject_kind)||(['maintenance_apply','maintenance_cancel'].includes(r.action)&&r.subject_kind!=='monitor')||(r.action==='alert_route_change'&&r.subject_kind!=='alert_route')||(r.action.startsWith('incident_')&&r.subject_kind!=='incident'))throw Error('Invalid anonymized archive audit');clock(r.occurred_at,'audit');auditIds.add(r.id)}
 validateMonitorTables(t,Date.now());validateNotificationTables(t);validateDefinitionBatches(t);validateIncidentArchive(t);validateHeartbeatRuns(t);
 const seen=new Set<string>();
 // History is a flat set of sanitized originals, never archives inside archives.
 // Validate its oldest original view using the same complete referential checks.
 const original:Tables=Object.fromEntries(TABLES.map(n=>[n,t[n].slice()]));
 for(const h of t.archive_history){
  if(!['monitors','slots','outbox','notification_destinations','notification_jobs','integration_deliveries'].includes(h.table_name)||typeof h.record!=='string'||h.id!==await digest(`${h.table_name}\n${h.record}`)||seen.has(h.id))throw Error('Invalid archive original history');seen.add(h.id);
  const row=JSON.parse(h.record);if(['notification_destinations','notification_jobs'].includes(h.table_name)&&!Object.hasOwn(row,'webhook_template'))row.webhook_template=null;shape(row,columns[h.table_name],h.table_name);if(h.table_name==='slots'&&(row.lease_owner!=='restored-inactive'||row.lease_until!==0))throw Error('Archive execution references forbidden');const list=original[h.table_name];const i=list.findIndex(r=>r.id===row.id);if(i<0)throw Error('Orphan archive original history');list[i]=row;const variant={...t,[h.table_name]:t[h.table_name].map(r=>r.id===row.id?row:r)};if(['monitors','slots','outbox'].includes(h.table_name))validateMonitorTables(variant,Date.now());else validateNotificationTables(variant);
 }
 if(t.archive_history.length){validateMonitorTables(original,Date.now());validateNotificationTables(original)}
 return t;
}
