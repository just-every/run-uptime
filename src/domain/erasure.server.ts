import {incidentMonitorErasureTables,incidentOperatorErasureStatements} from './incident-work/portability.server.ts'
import {dependencyMonitorErasureTables} from './dependency-archive.ts'
import {discoveryMonitorErasureTables,discoveryOperatorErasure} from './discovery-sources-archive.ts'
import {createPortability} from '@runeditrun/rer/modules/portability'
import {erasureRelations,operatorMailRelated,dependencyAckErasure,dependencyTimelineErasure} from './erasure-relations.ts'
import {TABLES} from './archive-schema.ts'
import {installationLocalTables} from './archive-inventory.ts'
import {auditStatement,mutationGuard,type AuditActor} from './audit.server.ts'
import type {Bindings} from './control.server.ts'
import {businessErasureScope,eraseBusinessCustody} from './business-import/erasure.server.ts'
import {businessIdentityErasure} from './business-import/identity-erasure.server.ts'
type Selection={table:string;where:string;args:unknown[]};
// A fallback contact's alert names the earlier contacts it followed (DELIVERY-002): it is dependent history of each.
const serviceReportJobs="EXISTS(SELECT 1 FROM scheduled_reports sr JOIN json_each(json_extract(sr.report,'$.service.monitors')) member WHERE sr.delivery_id=notification_jobs.id AND json_extract(member.value,'$.id')=?)";
const scheduledMonitor="monitor_id=? OR EXISTS(SELECT 1 FROM json_each(json_extract(scheduled_reports.report,'$.service.monitors')) member WHERE json_extract(member.value,'$.id')=?)";
const fallbackJobs="EXISTS(SELECT 1 FROM json_each(json_extract(event,'$.fallbackContext.previous')) p WHERE json_extract(p.value,'$.destinationId')=?)";
const selection=(table:string,where:string,...args:unknown[]):Selection=>({table,where,args});
export async function erase(env:Bindings,kind:'monitor'|'destination'|'operator',id:string,actor:AuditActor,confirmation?:string){
 const table=kind==='monitor'?'monitors':kind==='destination'?'notification_destinations':'oa_operators';
 const entity=await env.DB.prepare(`SELECT * FROM ${table} WHERE id=?`).bind(id).first<any>();
 if(!entity)throw Error('Entity not found');
 if(kind==='monitor'&&confirmation!==JSON.parse(entity.definition).name)throw Error('Type the current monitor name to erase it');
 if(kind==='operator'&&entity.role==='owner'&&entity.status==='active'&&Number((await env.DB.prepare("SELECT COUNT(*) n FROM oa_operators WHERE role='owner' AND status='active'").first<any>())?.n)<=1)throw Error(env.UPTIME_LOCAL_REVIEW==='true'?'The last owner cannot be erased. Use rer reset --yes to erase the local installation.':'The last owner cannot be erased. Redeploy to replace the hosted installation.');
 const actingOwner=actor.kind==='operator'?await env.DB.prepare("SELECT version FROM oa_operators WHERE id=? AND role='owner' AND status='active'").bind(actor.ref).first<any>():null;
 if(actor.kind==='operator'&&!actingOwner)throw Error('Owner authorization required');
 const business=kind==='monitor'?await businessErasureScope(env,id,JSON.parse(entity.definition).name):{namespaces:[],uploads:[],archives:[]},businessNamespaces=business.namespaces;
 // Capture counts before discovering dependents: a job or credential arriving
 // while planning must invalidate the transaction, including uncaptured rows.
 const allNames=(await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'rer_portability_%' AND name NOT GLOB '_cf_*'").all<any>()).results;
 const initialCounts=await env.DB.batch(allNames.map(({name})=>env.DB.prepare(`SELECT COUNT(*) n FROM "${name}"`)));
 const incidentIds=kind==='monitor'?(await env.DB.prepare("SELECT id FROM outbox WHERE monitor_id=? AND kind='trigger'").bind(id).all<{id:string}>()).results.map(row=>row.id):[];
 const plans:Selection[]=[],discoveryGuards:D1PreparedStatement[]=[],jobIds:string[]=[],jobRows:{id:string;event:string}[]=[],destinationCredentials:string[]=[];
 if(kind==='monitor'||kind==='destination'){
  const jobs=await env.DB.prepare(kind==='monitor'?"SELECT id,event FROM notification_jobs WHERE event_id IN(SELECT id FROM outbox WHERE monitor_id=?) OR json_extract(event,'$.monitor.id')=? OR json_extract(event,'$.monitorId')=? OR "+serviceReportJobs:"SELECT id,event FROM notification_jobs WHERE destination_id=?").bind(...(kind==='monitor'?[id,id,id,id]:[id])).all<any>();
  if(kind==='destination')jobs.results.push(...(await env.DB.prepare(`SELECT id,event FROM notification_jobs WHERE ${fallbackJobs}`).bind(id).all<any>()).results);
  jobIds.push(...jobs.results.map(r=>r.id));jobRows.push(...jobs.results);
  discoveryGuards.push(mutationGuard(env,kind==='monitor'?"(SELECT COUNT(*) FROM notification_jobs WHERE event_id IN(SELECT id FROM outbox WHERE monitor_id=?) OR json_extract(event,'$.monitor.id')=? OR json_extract(event,'$.monitorId')=? OR "+serviceReportJobs+")=?":`(SELECT COUNT(*) FROM notification_jobs WHERE destination_id=? OR ${fallbackJobs})=?`,[...(kind==='monitor'?[id,id,id,id]:[id,id]),jobIds.length]));
  if(kind==='destination')destinationCredentials.push(...(await env.DB.prepare('SELECT id FROM notification_credentials WHERE destination_id=?').bind(id).all<any>()).results.map(r=>r.id));
  for(const job of jobIds){plans.push(selection('notification_delivery_attempts','delivery_id=?',job),selection('notification_retry_policy','delivery_id=?',job),selection('integration_attempts','namespace=? AND delivery_id=?','uptime-notifications',job),selection('integration_resolutions','namespace=? AND delivery_id=?','uptime-notifications',job),selection('notification_claim_custody','delivery_id=?',job),selection('integration_deliveries','namespace=? AND id=?','uptime-notifications',job));}
  const replays=await env.DB.prepare("SELECT * FROM integration_replays WHERE namespace='uptime-notifications'").all<any>();
  const relations=erasureRelations(kind,id,jobRows,destinationCredentials);
  for(const row of replays.results)if(relations.envelopeRelated(row.envelope))plans.push(selection('integration_replays','namespace=? AND id=?',row.namespace,row.id));
  const captures=await env.DB.prepare('SELECT sequence,message FROM rer_mail_development_outbox').all<any>();
  for(const capture of captures.results)if(jobIds.includes(JSON.parse(capture.message).deliveryId))plans.push(selection('rer_mail_development_outbox','sequence=?',capture.sequence));
  plans.push(selection('alert_team_deliveries','trigger_job_id IN(SELECT value FROM json_each(?))',JSON.stringify(jobIds)));
  plans.push(selection('alert_contact_schedules','trigger_job_id IN(SELECT value FROM json_each(?))',JSON.stringify(jobIds)));
  plans.push(selection('alert_recovery_matches','recovery_job_id IN(SELECT value FROM json_each(?)) OR trigger_job_id IN(SELECT value FROM json_each(?))',JSON.stringify(jobIds),JSON.stringify(jobIds)));
  for(const job of jobIds)plans.push(selection('notification_jobs','id=?',job));
 }
 if(['monitor','destination','operator'].includes(kind)){const column=kind==='monitor'?'monitor_id':kind==='destination'?'destination_id':'actor_id';plans.push(selection('report_occurrences',`recurrence_id IN(SELECT id FROM report_recurrences WHERE ${column}=?)`,id),selection('report_recurrences',`${column}=?`,id));}
 if(kind==='monitor'){
  plans.push(selection('report_occurrences',`report_id IN(SELECT id FROM scheduled_reports WHERE ${scheduledMonitor})`,id,id),selection('scheduled_reports',scheduledMonitor,id,id));
  plans.push(...['source_history_rows','source_history_batches','source_history_cutovers'].map(table=>selection(table,'monitor_id=?',id)));
  plans.push(selection('failure_snapshots','monitor_id=?',id),selection('failure_snapshot_settings','monitor_id=?',id),selection('failure_evidence_grants','monitor_id=?',id));
  plans.push(selection('slow_acknowledgements','monitor_id=?',id),selection('cleanup_debt','monitor_id=?',id),selection('effect_grants','monitor_id=?',id));
  // Uploads no import plan reads (an abandoned or interrupted preview) that name this monitor go with it.
  if(business.uploads.length)plans.push(selection('ik_door_chunks','upload_id IN(SELECT value FROM json_each(?))',JSON.stringify(business.uploads)),selection('ik_door_uploads','id IN(SELECT value FROM json_each(?))',JSON.stringify(business.uploads)));
  // So do the bytes of an archive outside the erased namespaces that names this monitor; its header stays.
  if(business.archives.length)plans.push(selection('ik_door_archive_chunks','archive_id IN(SELECT value FROM json_each(?))',JSON.stringify(business.archives)));
  plans.push(selection('dependency_acks',dependencyAckErasure,id,JSON.stringify(incidentIds)));
  // Provider erasure also removes the surviving application's timeline reference to its notice.
  plans.push(selection('incident_timeline',dependencyTimelineErasure,id,id));
  plans.push(...incidentMonitorErasureTables.map(table=>selection(table,'monitor_id=?',id)),...dependencyMonitorErasureTables.map(table=>selection(table,'monitor_id=?',id)),...discoveryMonitorErasureTables.map(table=>selection(table,'monitor_id=?',id)));
  plans.push(selection('alert_fallback_chains','monitor_id=?',id),selection('catalog_route_batch_entries','monitor_id=?',id));
  plans.push(selection('alert_routes',"scope_kind='monitor' AND scope_value=?",id),selection('alert_route_changes',"scope_kind='monitor' AND scope_value=?",id));
  plans.push(selection('heartbeat_runs','monitor_id=?',id),selection('definition_batch_entries','monitor_id=?',id),selection('attempt_checkpoints','monitor_id=?',id),selection('runner_assignments','slot_id IN(SELECT id FROM slots WHERE monitor_id=?)',id),selection('evidence_generation','monitor_id=?',id),selection('heartbeat_claims','slot_id IN(SELECT id FROM slots WHERE monitor_id=?)',id),selection('heartbeat_authority','monitor_id=?',id),selection('heartbeat_limits','monitor_id=?',id),selection('observations','slot_id IN(SELECT id FROM slots WHERE monitor_id=?)',id),selection('outbox','monitor_id=?',id),selection('slots','monitor_id=?',id),selection('revisions','monitor_id=?',id));
 }
 if(kind==='destination')plans.push(selection('scheduled_reports','destination_id=?',id),selection('alert_recipient_consents','destination_id=?',id),selection('alert_drills','destination_id=?',id),selection('notification_credentials','destination_id=?',id));
 if(kind==='operator'){
  for(const table of ['integration_token_usage','integration_token_events','integration_tokens'])plans.push(selection(table,'namespace IN(SELECT namespace FROM uptime_credential_grants WHERE issuer_id=?)',id));
  plans.push(selection('uptime_credential_limits','grant_id IN(SELECT id FROM uptime_credential_grants WHERE issuer_id=?)',id),selection('uptime_credential_grants','issuer_id=?',id));
  plans.push(selection('incident_mention_authority','id IN(SELECT id FROM incident_mentions WHERE recipient_id=?)',id),selection('incident_mentions','recipient_id=?',id));
  plans.push(selection('alert_team_members','operator_id=?',id),selection('alert_recipient_consents','operator_id=?',id));
  // Erasing an invitation issuer also removes sessions derived from its tokens.
  // Their session-bound MFA proof/challenge rows must go first, including rows for surviving operators.
  plans.push(...['challenges','proofs'].map(name=>selection('uptime_mfa_'+name,'operator_id=? OR session_id IN(SELECT id FROM oa_sessions WHERE operator_id=? OR source_token_id IN(SELECT id FROM oa_tokens WHERE issuer_id=?))',id,id,id)));
  plans.push(...['recovery','factors','limits','notices'].map(name=>selection('uptime_mfa_'+name,'operator_id=?',id)));
  plans.push(selection('auxiliary_attempts',"scope='auth-mail' AND (job_id IN(SELECT id FROM oa_tokens WHERE operator_id=? OR issuer_id=?) OR job_id IN(SELECT id FROM oa_step_up_challenges WHERE operator_id=? OR session_id IN(SELECT id FROM oa_sessions WHERE operator_id=?)))",id,id,id,id));
  plans.push(selection('uptime_member_scopes','operator_id=?',id),selection('uptime_member_roles','operator_id=?',id),selection('failure_evidence_grants','operator_id=?',id),selection('oa_owner_signins','operator_id=?',id),selection('oa_step_up_challenges','operator_id=? OR session_id IN(SELECT id FROM oa_sessions WHERE operator_id=?)',id,id),selection('oa_dev_credentials',"id IN(SELECT id FROM oa_sessions WHERE operator_id=?) OR id IN(SELECT id FROM oa_tokens WHERE operator_id=? OR issuer_id=?)",id,id,id),selection('oa_provider_session_pins','session_id IN(SELECT id FROM oa_sessions WHERE operator_id=?)',id),selection('oa_provider_sessions','session_id IN(SELECT id FROM oa_sessions WHERE operator_id=?)',id),selection('oa_setup_links','owner_id=? OR session_id IN(SELECT id FROM oa_sessions WHERE operator_id=?)',id,id),selection('oa_credentials','operator_id=?',id),selection('oa_auth_audit','actor_id=?',id),selection('oc_idp_grants','EXISTS(SELECT 1 FROM oa_external_identities e WHERE e.operator_id=? AND e.issuer=oc_idp_grants.issuer AND e.subject=oc_idp_grants.subject)',id),selection('oa_sessions','operator_id=? OR source_token_id IN(SELECT id FROM oa_tokens WHERE issuer_id=?)',id,id),selection('oa_tokens','operator_id=? OR issuer_id=?',id,id),selection('oa_external_identities','operator_id=?',id),selection('oa_invitation_cancellations','operator_id=?',id),selection('oa_domain_rules','created_by=?',id),selection('oc_owner_claims','operator_id=? OR email=?',id,entity.email));
  const tokenIds=new Set((await env.DB.prepare('SELECT id FROM oa_tokens WHERE operator_id=? OR issuer_id=?').bind(id,id).all<any>()).results.map(row=>row.id));
  const messages=await env.DB.prepare('SELECT * FROM rer_mail_development_outbox').all<any>();
  for(const row of messages.results)if(operatorMailRelated(row.message,entity.email,tokenIds))plans.push(selection('rer_mail_development_outbox','sequence=?',row.sequence));
 }
 const relations=erasureRelations(kind,id,jobRows,destinationCredentials);
 const history=await env.DB.prepare('SELECT * FROM archive_history').all<any>();
 for(const row of history.results)if(relations.historyRelated(row.table_name,row.record))plans.push(selection('archive_history','id=?',row.id));
 plans.push(selection(table,'id=?',id));
 const service=await createPortability({db:env.DB,policy:{product:'just-every/uptime-monitor',excludeTables:[...TABLES,...Object.keys(installationLocalTables)]}});
 const statements:D1PreparedStatement[]=actor.kind==='operator'?[mutationGuard(env,"EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND role='owner' AND status='active' AND version=?)",[actor.ref,actingOwner.version])]:[],counts:Record<string,number>={};
 statements.push(...discoveryGuards);
 // Snapshot every selected record and guard it in the same transaction. New
 // dependent rows or edits invalidate the plan instead of leaving unfenced data.
 for(const [index,{name}] of allNames.entries())statements.push(mutationGuard(env,`(SELECT COUNT(*) FROM "${name}")=?`,[(initialCounts[index].results[0] as {n:number}).n]));
 for(const plan of plans){
  const rows=(await env.DB.prepare(`SELECT rowid AS _rowid_,* FROM ${plan.table} WHERE ${plan.where}`).bind(...plan.args).all<any>()).results;
  const info=(await env.DB.prepare(`PRAGMA table_info(${plan.table})`).all<any>()).results.filter(r=>r.pk).sort((a,b)=>a.pk-b.pk);
  statements.push(mutationGuard(env,`(SELECT COUNT(*) FROM ${plan.table} WHERE ${plan.where})=?`,[...plan.args,rows.length]));
  counts[plan.table]=(counts[plan.table]??0)+rows.length;
  for(const row of rows){const key=info.length?Object.fromEntries(info.map(c=>[c.name,row[c.name]])):{rowid:row._rowid_};statements.push(mutationGuard(env,`EXISTS(SELECT 1 FROM ${plan.table} WHERE ${Object.keys(key).map(column=>`"${column}"=?`).join(" AND ")})`,Object.values(key)),...await service.erasureStatements(plan.table,key));}
 }
 // Keep the permanent claimed marker, but remove its original owner's identity.
 // Fence the source row without deleting or transferring bootstrap authority.
 const bootstrap=kind==='operator'?await env.DB.prepare('SELECT singleton,claim_id,claimed_at FROM oa_bootstrap WHERE claim_id=?').bind(id).first<{singleton:number;claim_id:string;claimed_at:number}>():null;
 if(kind==='operator'){
  for(const table of ['integration_token_usage','integration_token_events','integration_tokens'])plans.push(selection(table,'namespace IN(SELECT namespace FROM uptime_credential_grants WHERE issuer_id=?)',id));
  plans.push(selection('uptime_credential_limits','grant_id IN(SELECT id FROM uptime_credential_grants WHERE issuer_id=?)',id),selection('uptime_credential_grants','issuer_id=?',id));
  counts.alert_team_deliveries=Number((await env.DB.prepare('SELECT COUNT(*) n FROM alert_team_deliveries WHERE operator_id=?').bind(id).first<{n:number}>())?.n??0);
  statements.push(mutationGuard(env,'(SELECT COUNT(*) FROM alert_team_deliveries WHERE operator_id=?)=?',[id,counts.alert_team_deliveries]));
  counts.oa_bootstrap=bootstrap?1:0;
  statements.push(mutationGuard(env,'(SELECT COUNT(*) FROM oa_bootstrap WHERE claim_id=?)=?',[id,counts.oa_bootstrap]));
  if(bootstrap)statements.push(mutationGuard(env,'EXISTS(SELECT 1 FROM oa_bootstrap WHERE singleton=? AND claim_id=? AND claimed_at=?)',[bootstrap.singleton,bootstrap.claim_id,bootstrap.claimed_at]),...await service.erasureStatements('oa_bootstrap',{singleton:bootstrap.singleton}));
 }
 statements.push(mutationGuard(env,`EXISTS(SELECT 1 FROM ${table} WHERE id=? AND ${kind==='monitor'?'definition':kind==='destination'?'name':'version'}=?)`,[id,kind==='monitor'?entity.definition:kind==='destination'?entity.name:entity.version]));
 if(kind==='operator'&&entity.role==='owner'&&entity.status==='active')statements.push(mutationGuard(env,"(SELECT COUNT(*) FROM oa_operators WHERE role='owner' AND status='active')>1"));
 if(bootstrap)statements.push(env.DB.prepare('UPDATE oa_bootstrap SET claim_id=? WHERE singleton=? AND claim_id=?').bind(crypto.randomUUID(),bootstrap.singleton,id));
 for(const plan of plans)statements.push(env.DB.prepare(`DELETE FROM ${plan.table} WHERE ${plan.where}`).bind(...plan.args));
 if(kind==='operator'||kind==='destination'){
  const custody=await businessIdentityErasure(env)
  Object.assign(counts,custody.counts)
  // Door custody is installation-local and never exported. The native entity's
  // existing row fences and transfer invalidation retain their restore semantics.
  statements.push(...custody.statements)
 }
 const receipt={id:crypto.randomUUID(),entityKind:kind,counts,completedAt:Date.now()};
 if(kind==='operator')statements.push(env.DB.prepare("UPDATE discovery_jobs SET status=CASE WHEN status IN ('queued','running') THEN 'failed' ELSE status END,finished_at=CASE WHEN status IN ('queued','running') THEN ? ELSE finished_at END,stopped_at=CASE WHEN status IN ('queued','running') THEN ? ELSE stopped_at END,stop_reason=CASE WHEN status IN ('queued','running') THEN 'initiator_erased' ELSE stop_reason END,error=CASE WHEN status IN ('queued','running') THEN 'Initiating owner erased; discovery stopped.' ELSE error END,initiator_id=NULL,initiator_version=NULL,initiator_role=NULL,initiator_revision=NULL,initiator_base_role=NULL WHERE initiator_id=?").bind(receipt.completedAt,receipt.completedAt,id),env.DB.prepare('UPDATE scheduled_reports SET actor_id=NULL WHERE actor_id=?').bind(id),env.DB.prepare("UPDATE catalog_route_batches SET actor_kind='anonymized',actor_ref=? WHERE actor_kind='operator' AND actor_ref=?").bind(crypto.randomUUID(),id),env.DB.prepare('UPDATE alert_team_deliveries SET operator_id=NULL WHERE operator_id=?').bind(id),...incidentOperatorErasureStatements(env,id),env.DB.prepare("UPDATE uptime_audit SET actor_kind='anonymized',actor_ref=? WHERE actor_kind='operator' AND actor_ref=?").bind(crypto.randomUUID(),id),env.DB.prepare("UPDATE definition_batches SET actor_kind='anonymized',actor_ref=? WHERE actor_kind='operator' AND actor_ref=?").bind(crypto.randomUUID(),id),env.DB.prepare('UPDATE slow_acknowledgements SET actor_id=NULL WHERE actor_id=?').bind(id),env.DB.prepare('UPDATE dependency_acks SET actor_id=NULL WHERE actor_id=?').bind(id),...discoveryOperatorErasure.map(sql=>env.DB.prepare(sql).bind(id)),env.DB.prepare('UPDATE alert_route_changes SET actor_ref=NULL WHERE actor_ref=?').bind(id),env.DB.prepare('UPDATE alert_drills SET started_by=NULL WHERE started_by=?').bind(id));
 // An erased monitor leaves no import marker, so a later import of the same source record starts afresh.
 if(kind==='monitor')statements.push(env.DB.prepare('DELETE FROM uptime_business_import_targets WHERE monitor_id=?').bind(id),env.DB.prepare('DELETE FROM uptime_business_import_writes WHERE monitor_id=?').bind(id));
 statements.push(env.DB.prepare('INSERT INTO uptime_erasure_receipts(id,entity_kind,counts,completed_at) VALUES(?,?,?,?)').bind(receipt.id,kind,JSON.stringify(counts),receipt.completedAt),...await service.invalidateTransfersStatements(),auditStatement(env,kind==='operator'&&actor.ref===id?{kind:'anonymized',ref:crypto.randomUUID()}:actor,'erase',kind,receipt.id,'1',[],receipt.completedAt));
 try{
  if(businessNamespaces.length)await eraseBusinessCustody(env,id,actor,actingOwner.version,businessNamespaces,statements,await service.redactionStatements());
  else await env.DB.batch(statements);
 }catch(error){if(String(error).includes('last_owner')||(kind==='operator'&&entity.role==='owner'&&entity.status==='active'&&Number((await env.DB.prepare("SELECT COUNT(*) n FROM oa_operators WHERE role='owner' AND status='active'").first<any>())?.n)<=1))throw Error('The last owner cannot be erased. Use rer reset --yes locally or redeploy hosted.');if(String(error).includes('uptime_audit.id'))throw Object.assign(Error('Installation changed during erasure. No data was erased; try again.'),{status:409});throw error}
 return {erased:true,receipt,selfErased:kind==='operator'&&actor.kind==='operator'&&actor.ref===id};
}
