import {archiveInserts} from './archive-inserts.server.ts'
import {exportJournal,productFence} from './archive-fence.server.ts'
import {auditStatement,mutationGuard,type AuditActor} from './audit.server.ts'
import {assertArchiveInventory} from './archive-inventory.ts'
import type {Bindings} from './control.server.ts'
import {readCredential,sealCredential} from './notification-credentials.server.ts'
import {ARCHIVE_ROWS,TABLES,columns,assertBytes,digest,portableArchive,portableDefinition,type Tables} from './archive-schema.ts'
import {validateArchive} from './archive-validation.ts'
import {projectRestore} from './archive-restore-projection.ts'
/** Explicit projections prevent future credential columns silently becoming portable. */
export async function archive(env:Bindings){
 await assertArchiveInventory(env.DB);
 const queries=TABLES.map(name=>{
  if(name==='notification_destinations')return env.DB.prepare(`SELECT d.id,d.name,d.kind,d.enabled,d.created_at,d.deleted_at,c.id credential_id,c.destination_id,c.created_at credential_created_at,c.endpoint,c.signing_secret,c.ciphertext,c.retired_at,c.unavailable_at FROM notification_destinations d LEFT JOIN notification_credentials c ON c.id=d.credential_id ORDER BY d.rowid LIMIT ${ARCHIVE_ROWS+1}`);
  return env.DB.prepare(`SELECT ${columns[name].join(',')} FROM ${name}${name.startsWith('integration_')?" WHERE namespace='uptime-notifications'":''} ORDER BY rowid LIMIT ${ARCHIVE_ROWS+1}`);
 });
 const results=await env.DB.batch(queries),t:Tables={};
 for(let i=0;i<TABLES.length;i++){const name=TABLES[i],rows=results[i].results;if(rows.length>ARCHIVE_ROWS)throw Error(`Archive row bound exceeded: ${name} (${ARCHIVE_ROWS})`);t[name]=rows}
 for(const row of t.notification_destinations){
  let address=null;
  const unavailableDefinition=row.ciphertext===null&&row.endpoint===null&&row.signing_secret===null&&row.retired_at===null&&row.unavailable_at!==null;
  if(row.kind==='email'&&row.deleted_at===null&&!unavailableDefinition){
   try{address=(await readCredential(env,{...row,id:row.credential_id,created_at:row.credential_created_at})).endpoint}
   catch{throw Error('Archive email definition unavailable: restore notification credential custody before export')}
  }
  const value={...Object.fromEntries(columns.notification_destinations.filter(k=>k!=='address').map(k=>[k,row[k]])),address};Object.keys(row).forEach(k=>delete row[k]);Object.assign(row,value);
 }
 for(const name of ['monitors','revisions','slots'])for(const row of t[name])row.definition=portableDefinition(row.definition);
 for(const row of t.slots){row.lease_owner='restored-inactive';row.lease_until=0}
 for(const row of t.integration_deliveries){const e=JSON.parse(row.envelope),job=t.notification_jobs.find(j=>j.id===row.id);if(!job)throw Error('Archive notification delivery is orphaned');if(e.destinationId!==job.destination_id){e.destinationId=job.destination_id;row.envelope=JSON.stringify(e)}}
 for(const row of t.integration_replays){const envelope=JSON.parse(row.envelope);if(!t.notification_destinations.some(d=>d.id===envelope.destinationId)){const credential=await env.DB.prepare('SELECT destination_id FROM notification_credentials WHERE id=?').bind(envelope.destinationId).first<{destination_id:string}>();if(!credential)throw Error('Archive notification replay destination unavailable');envelope.destinationId=credential.destination_id;row.envelope=JSON.stringify(envelope)}}
 const result=await portableArchive(t,Date.now(),await exportJournal(env));assertBytes(result,1);await validateArchive(result);return result;
}

export async function restore(env:Bindings,input:any,receipt?:{id:string;sha256:string},options:{laterJournal?:any;actor?:AuditActor;manifest?:any}={}){
 const inputTables=await validateArchive(input),now=Date.now();
 const fenceStatements=await productFence(env,inputTables,input.payload.erasureFence??options.manifest,options.laterJournal);
 await assertArchiveInventory(env.DB);
 const empty=TABLES.filter(n=>n!=='migrations'&&n!=='uptime_audit'&&n!=='uptime_erasure_receipts');
 // Installation auth/migration ledgers and runner registration/contact may
 // exist. Contact is recorded even by an idle fresh runner, not product data.
 // Every product/history table, including orphan observations and retired
 // credentials, must be empty; restore leaves local runner authority intact.
 const checks=[...empty,'notification_credentials','notification_claim_custody','heartbeat_authority','heartbeat_claims'];
 const counts=await env.DB.batch(checks.map(n=>env.DB.prepare(`SELECT COUNT(*) n FROM ${n}`)));
 if(counts.some(r=>Number((r.results[0] as any).n)>0))throw Error('Restore requires empty installation');
 const migrations=await env.DB.prepare('SELECT version,applied_at FROM migrations ORDER BY rowid').all();
 const t=await projectRestore(inputTables,migrations.results,now),statements:D1PreparedStatement[]=[],groups=new Map<string,any[]>();
 const collect=(name:string,row:any)=>{if(!groups.has(name))groups.set(name,[]);groups.get(name)!.push(row)};
 const actor=options.actor??{kind:'feature',ref:'archive-transfer'},auditReceipt=crypto.randomUUID();
 t.uptime_audit.push({id:auditReceipt,actor_kind:actor.kind,actor_ref:actor.ref,occurred_at:now,action:'archive_restore',subject_kind:'archive',subject_ref:auditReceipt});
 if(t.uptime_audit.length>ARCHIVE_ROWS)throw Error('Archive audit row bound exceeded');
 assertBytes(await portableArchive(t,Number.MAX_SAFE_INTEGER,input.payload.erasureFence??options.manifest),1);
 for(const name of TABLES)for(const original of t[name]){
  if(name==='uptime_audit'&&original.id===auditReceipt)continue;
  const row={...original};
  if(name==='notification_destinations'){
   const credentialId=crypto.randomUUID(),address=row.address;delete row.address;row.credential_id=credentialId;
   const credential:any={id:credentialId,destination_id:row.id,created_at:now};
   if(row.kind==='email'&&address!==null&&row.deleted_at===null)credential.ciphertext=await sealCredential(env,credential,{endpoint:address,signing_secret:null});else credential.unavailable_at=now;
   collect('notification_credentials',credential);
  }
  if(name==='notification_jobs'){row.credential_id='restored-inactive';row.claim=null;row.claim_until=null}
  if(name==='integration_deliveries'){
   row.fingerprint='restored-inactive';row.destination_hash='unavailable:restored-inactive';row.claim=null;row.claim_until=null;
  }
  if(name==='integration_replays')row.fingerprint=await digest(row.envelope);
  if(['uptime_audit','uptime_erasure_receipts'].includes(name)){
   const keys=Object.keys(row).filter(k=>name!=='uptime_audit'||!['actor_kind','actor_ref'].includes(k));
   const actor=name==='uptime_audit'?` AND ((actor_kind IS ? AND actor_ref IS ?) OR (actor_kind IN ('operator','anonymized') AND ? IN ('operator','anonymized') AND (actor_kind='anonymized' OR ?='anonymized')))`:'';
   const values=name==='uptime_audit'?[row.actor_kind,row.actor_ref,row.actor_kind,row.actor_kind]:[];
   statements.push(mutationGuard(env,`NOT EXISTS(SELECT 1 FROM ${name} WHERE id=? AND NOT (${keys.map(k=>`${k} IS ?`).join(' AND ')}${actor}))`,[row.id,...keys.map(k=>row[k]),...values]));
  }
  collect(name,row);
 }
 statements.push(...archiveInserts(env,groups));
 statements.push(auditStatement(env,actor,'archive_restore','archive',auditReceipt,'1',[],now));
 // Guard inside the transaction as well: a concurrent product insertion must
 // make the entire restore fail rather than combine two installations.
 const guard=checks.map(n=>`(SELECT COUNT(*) FROM ${n})`).join('+');
 statements.unshift(env.DB.prepare(`INSERT INTO archive_history(id,table_name,record) SELECT 'restore-guard','restore-guard',NULL WHERE (${guard})>0`));
 statements.push(env.DB.prepare('INSERT OR IGNORE INTO evidence_generation(monitor_id) SELECT id FROM monitors'));
 statements.unshift(...fenceStatements);
 if(receipt)statements.push(env.DB.prepare('INSERT INTO rer_portability_product_restore(id,sha256) VALUES(?,?)').bind(receipt.id,receipt.sha256));
 if(statements.length)await env.DB.batch(statements);return {restored:true,enabled:false,executionReauthorizationRequired:true};
}
