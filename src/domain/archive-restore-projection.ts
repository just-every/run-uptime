import {ARCHIVE_ROWS,TABLES,assertBytes,digest,portableArchive,portableDefinition,type Tables} from './archive-schema.ts'
import {validateArchive} from './archive-validation.ts'

const inactiveState=JSON.stringify({state:'Unknown',confirmedFailure:false,notificationOpen:false});
/** Plan the complete portable result before generating credentials or SQL writes.
 * The same rows are then installed and exported; sanitized originals are flat,
 * content-addressed history, including records already paused or quarantined. */
export async function projectRestore(input:Tables,migrations:any[],now=Date.now()){
 const t:Tables=structuredClone(input);
 const history=new Map(t.archive_history.map(row=>[row.id,row]));
 const currentMigrations=new Map(migrations.map(row=>[row.version,row]));
 for(const row of t.migrations)currentMigrations.set(row.version,row);
 t.migrations=[...currentMigrations.values()].sort((a,b)=>a.version-b.version);
 async function remember(name:string,row:any){const record=JSON.stringify(row),id=await digest(`${name}\n${record}`);if(!history.has(id))history.set(id,{id,table_name:name,record})}
 for(const name of ['monitors','revisions','slots'])for(const row of t[name])row.definition=portableDefinition(row.definition);
 for(const name of ['monitors','slots','outbox','notification_destinations','notification_jobs','integration_deliveries'])for(const row of t[name]){
  const original={...row};
  if(name==='monitors'){
   const definition=JSON.parse(row.definition);definition.enabled=false;
   row.definition=JSON.stringify(definition);row.state=inactiveState;
   // An already inactive current revision is itself the paused revision. This
   // makes restore/export/restore stable without losing a paused original.
   if(row.definition!==original.definition||row.state!==original.state){
    row.revision=Math.max(...t.revisions.filter(r=>r.monitor_id===row.id).map(r=>r.revision))+1;
    t.revisions.push({monitor_id:row.id,revision:row.revision,definition:row.definition,created_at:now});
   }
  }
  if(name==='slots'){
   // Lease credentials are excluded even from historical originals.
   original.lease_owner=row.lease_owner='restored-inactive';original.lease_until=row.lease_until=0;
   if(['running','queued'].includes(row.status))row.status='interrupted';
  }
  if(name==='outbox'){row.status='imported-inactive';row.lease_until=0;row.receipt=null}
  if(name==='notification_destinations'){row.enabled=0;if(row.deleted_at!==null)row.address=null}
  if(name==='notification_jobs'){row.state='imported-inactive';row.code='imported_inactive'}
  if(name==='integration_deliveries'&&['queued','sending'].includes(row.state))row.state='rejected';
  if(JSON.stringify(row)!==JSON.stringify(original))await remember(name,original);
 }
 t.archive_history=[...history.values()];
 for(const name of TABLES)if(t[name].length>ARCHIVE_ROWS)throw Error(`Archive row bound exceeded: ${name} (${ARCHIVE_ROWS})`);
 // Reserve the largest allowed export timestamp and the CLI's final newline.
 // Bounds include extension metadata, every new revision, and all history.
 const projected=await portableArchive(t,Number.MAX_SAFE_INTEGER);assertBytes(projected,1);
 await validateArchive(projected);
 return t;
}
