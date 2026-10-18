import {storeSnapshot,openSnapshot} from './failure-page-custody.server.ts'
import {createPortability} from '@runeditrun/rer/modules/portability'
import {TABLES} from './archive-schema.ts'
import {installationLocalTables} from './archive-inventory.ts'
import {findIncident} from './incident-work/common.server.ts'
import type {Bindings} from './control.server.ts'
import {get} from './control.server.ts'
import {auditStatement,mutationGuard,type AuditActor} from './audit.server.ts'
import {normalizeFailureSnapshot,captureFailureSnapshot,normalizeSafeValues} from './failure-snapshot.mjs'
function scrubSnapshot(value:any,masks:string[],safeValues?:any,policyVersion?:number,screenshotEnabled=true){const snapshot=normalizeFailureSnapshot(value);if('unavailable' in snapshot)return snapshot;if(snapshot.screenshot&&(!screenshotEnabled||policyVersion!==undefined&&snapshot.policyVersion!==policyVersion))snapshot.screenshot={unavailable:'policy_changed'};const scrubbed=captureFailureSnapshot({...snapshot,masks,safeValues});return {...scrubbed,bodyTruncated:snapshot.bodyTruncated||scrubbed.bodyTruncated}}
const day=86400000
const missing=()=>Object.assign(Error('Monitor not found'),{status:404})
export async function snapshotSettings(env:Bindings,id:string){
 const row=await env.DB.prepare('SELECT version,retention_days,masks,safe_values,screenshot FROM failure_snapshot_settings WHERE monitor_id=?').bind(id).first<any>()
 return {version:row?.version??0,retentionDays:row?.retention_days??90,masks:row?JSON.parse(row.masks):[],safeValues:row?normalizeSafeValues(JSON.parse(row.safe_values)):normalizeSafeValues(undefined),screenshot:Boolean(row?.screenshot)}
}
export async function readSnapshots(env:Bindings,id:string,before?:string){
 if(!await get(env,id))throw missing()
 const rows=await env.DB.prepare(`SELECT f.*,o.probe,o.attempt,s.revision FROM failure_snapshots f JOIN observations o ON o.id=f.observation_id JOIN slots s ON s.id=f.slot_id
 WHERE f.monitor_id=? AND f.expires_at>? ${before?'AND f.rowid < (SELECT rowid FROM failure_snapshots WHERE observation_id=? AND monitor_id=?)':''} ORDER BY f.rowid DESC LIMIT 21`).bind(id,Date.now(),...(before?[before,id]:[])).all<any>()
 return {settings:await snapshotSettings(env,id),items:await Promise.all(rows.results.slice(0,20).map(async row=>({...row,snapshot:await openSnapshot(env,row)}))),next:rows.results.length>20?rows.results[19].observation_id:null}
}
export async function saveSnapshotSettings(env:Bindings,id:string,input:any,actor:AuditActor){
 const monitor=await get(env,id);if(!monitor)throw missing()
 if(!input||Object.keys(input).some(k=>!['masks','retentionDays','version','safeValues','screenshot'].includes(k))||input.screenshot!==undefined&&typeof input.screenshot!=='boolean'||!Number.isSafeInteger(input.version)||input.version<0||!Number.isInteger(input.retentionDays)||input.retentionDays<1||input.retentionDays>365||!Array.isArray(input.masks)||input.masks.length>20||input.masks.some((m:any)=>typeof m!=='string'||!m.length||m.length>128||/[\x00-\x1f\x7f]/.test(m)))throw Error('Choose 1–365 retention days and up to 20 literal masks of 1–128 characters')
 const settings=await snapshotSettings(env,id);if(settings.version!==input.version)throw Object.assign(Error('Snapshot settings changed; reload before saving'),{status:409})
 const version=settings.version+1,safeValues=normalizeSafeValues(input.safeValues??settings.safeValues),screenshot=input.screenshot??settings.screenshot
 const statements=[mutationGuard(env,'EXISTS(SELECT 1 FROM monitors WHERE id=? AND revision=?) AND COALESCE((SELECT version FROM failure_snapshot_settings WHERE monitor_id=?),0)=?',[id,monitor.revision,id,input.version]),
 env.DB.prepare('INSERT INTO failure_snapshot_settings(monitor_id,version,retention_days,masks,safe_values,screenshot) VALUES(?,?,?,?,?,?) ON CONFLICT(monitor_id) DO UPDATE SET version=excluded.version,retention_days=excluded.retention_days,masks=excluded.masks,safe_values=excluded.safe_values,screenshot=excluded.screenshot').bind(id,version,input.retentionDays,JSON.stringify(input.masks),JSON.stringify(safeValues),Number(screenshot)),
 env.DB.prepare('UPDATE failure_snapshots SET expires_at=MIN(expires_at,captured_at+?) WHERE monitor_id=?').bind(input.retentionDays*day,id),auditStatement(env,actor,'snapshot_settings_change','monitor')]
 statements.push(mutationGuard(env,'(SELECT COUNT(*) FROM failure_snapshots WHERE monitor_id=?)=?',[id,(await env.DB.prepare('SELECT COUNT(*) n FROM failure_snapshots WHERE monitor_id=?').bind(id).first<{n:number}>())?.n??0]));
 // Newly added masks also scrub retained snapshots in the same guarded transaction.
 const rows=await env.DB.prepare('SELECT * FROM failure_snapshots WHERE monitor_id=?').bind(id).all<any>()
 for(const row of rows.results){const snapshot=await openSnapshot(env,row,true);if(!('unavailable' in snapshot)&&snapshot.screenshot&&(JSON.stringify(input.masks)!==JSON.stringify(settings.masks)||JSON.stringify(safeValues)!==JSON.stringify(settings.safeValues)))snapshot.screenshot={unavailable:'policy_changed'};statements.push(mutationGuard(env,'EXISTS(SELECT 1 FROM failure_snapshots WHERE monitor_id=? AND observation_id=?)',[id,row.observation_id]));statements.push(env.DB.prepare('UPDATE failure_snapshots SET snapshot=? WHERE observation_id=? AND monitor_id=?').bind(await storeSnapshot(env,row,scrubSnapshot(snapshot,input.masks,safeValues)),row.observation_id,id))}
 await env.DB.batch(statements)
 return snapshotSettings(env,id)
}
export async function eraseSnapshots(env:Bindings,id:string,actor:AuditActor){
 const monitor=await get(env,id);if(!monitor)throw missing()
 const rows=(await env.DB.prepare('SELECT observation_id FROM failure_snapshots WHERE monitor_id=?').bind(id).all<{observation_id:string}>()).results
 const service=await createPortability({db:env.DB,policy:{product:'just-every/uptime-monitor',excludeTables:[...TABLES,...Object.keys(installationLocalTables)]}})
 const fences=(await Promise.all(rows.map(row=>service.erasureStatements('failure_snapshots',{observation_id:row.observation_id})))).flat()
 const receipt={id:crypto.randomUUID(),entityKind:'failure_snapshots',counts:{failure_snapshots:rows.length},completedAt:Date.now()}
 await env.DB.batch([mutationGuard(env,'EXISTS(SELECT 1 FROM monitors WHERE id=? AND revision=?) AND (SELECT COUNT(*) FROM failure_snapshots WHERE monitor_id=?)=?',[id,monitor.revision,id,receipt.counts.failure_snapshots]),...rows.map(row=>mutationGuard(env,'EXISTS(SELECT 1 FROM failure_snapshots WHERE monitor_id=? AND observation_id=?)',[id,row.observation_id])),...fences,env.DB.prepare('DELETE FROM failure_snapshots WHERE monitor_id=?').bind(id),...await service.invalidateTransfersStatements(),auditStatement(env,actor,'snapshot_erase','monitor',receipt.id)])
 return {erased:true,receipt}
}
export async function snapshotStatements(env:Bindings,id:string,slotId:string,fresh:any[],guard:string,values:any[]){
 const settings=await snapshotSettings(env,id),statements:D1PreparedStatement[]=[]
 if(fresh.some(o=>o.failureSnapshot))statements.push(mutationGuard(env,'COALESCE((SELECT version FROM failure_snapshot_settings WHERE monitor_id=?),0)=?',[id,settings.version]))
 for(const observation of fresh){if(!observation.failureSnapshot)continue
  const snapshot=scrubSnapshot(observation.failureSnapshot,settings.masks,settings.safeValues,settings.version,settings.screenshot)
  statements.push(env.DB.prepare(`INSERT INTO failure_snapshots(observation_id,monitor_id,slot_id,captured_at,expires_at,snapshot) SELECT ?,?,?,?,?,? WHERE ${guard}`).bind(observation.id,id,slotId,observation.completedAt,observation.completedAt+settings.retentionDays*day,await storeSnapshot(env,{observation_id:observation.id,monitor_id:id,captured_at:observation.completedAt},snapshot),...values))
 }
 return statements
}

export async function incidentSnapshots(env:Bindings,id:string,all=false){
 const incident=await findIncident(env,id),end=incident.recovery?.observedAt??Date.now();
 const rows=await env.DB.prepare('SELECT f.*,o.probe,o.attempt,s.revision FROM failure_snapshots f JOIN observations o ON o.id=f.observation_id JOIN slots s ON s.id=f.slot_id WHERE f.monitor_id=? AND f.expires_at>? AND (f.slot_id=? OR f.captured_at BETWEEN ? AND ?) ORDER BY f.captured_at,f.observation_id LIMIT ?').bind(incident.monitor_id,Date.now(),incident.trigger.slotId,incident.trigger.observedAt,end,all?10001:21).all<any>();
 if(all&&rows.results.length>10000)throw Error('Incident report exceeds 10,000 snapshots; export a bounded selection');
 return {items:await Promise.all((all?rows.results:rows.results.slice(0,20)).map(async row=>({...row,snapshot:await openSnapshot(env,row)}))),more:!all&&rows.results.length>20};
}
