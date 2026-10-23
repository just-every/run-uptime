import type {Bindings} from './control.server.ts'
import {get} from './control.server.ts'
import {permission,accessResponse} from './access.server.ts'
import {authenticatedSession} from './operator-auth.server.ts'
import {auditStatement,mutationGuard,type AuditActor} from './audit.server.ts'
import {readSnapshots} from './failure-snapshots.server.ts'
export async function evidencePrincipal(env:Bindings,request:Request,id:string){
 try{return (await permission(env,request,undefined,{action:'evidence',workspace:false,monitorIds:[id]})).session}catch(error){if(accessResponse(error))return null;throw error}
}
export async function evidenceAccess(env:Bindings,id:string){
 if(!await get(env,id))throw Object.assign(Error('Monitor not found'),{status:404})
 const rows=await env.DB.prepare("SELECT o.id,o.display_name AS displayName,o.role,EXISTS(SELECT 1 FROM failure_evidence_grants g WHERE g.monitor_id=? AND g.operator_id=o.id) AS granted FROM oa_operators o WHERE o.status='active' AND o.role<>'owner' ORDER BY o.display_name,o.id").bind(id).all<any>()
 return {members:rows.results.map(row=>({...row,granted:Boolean(row.granted)})),viewerPath:`/app/evidence/${encodeURIComponent(id)}`}
}
export async function saveEvidenceAccess(env:Bindings,id:string,input:any,actor:AuditActor){
 if(!input||Object.keys(input).sort().join(',')!=='granted,operatorId'||typeof input.operatorId!=='string'||input.operatorId.length>512||typeof input.granted!=='boolean')throw Error('Choose a current member and evidence access')
 const monitor=await get(env,id);if(!monitor)throw Object.assign(Error('Monitor not found'),{status:404})
 await env.DB.batch([mutationGuard(env,"EXISTS(SELECT 1 FROM monitors WHERE id=? AND revision=?) AND EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND status='active' AND role<>'owner')",[id,monitor.revision,input.operatorId]),input.granted?env.DB.prepare('INSERT INTO failure_evidence_grants(monitor_id,operator_id,granted_at) VALUES(?,?,?) ON CONFLICT(monitor_id,operator_id) DO UPDATE SET granted_at=excluded.granted_at').bind(id,input.operatorId,Date.now()):env.DB.prepare('DELETE FROM failure_evidence_grants WHERE monitor_id=? AND operator_id=?').bind(id,input.operatorId),auditStatement(env,actor,input.granted?'evidence_access_grant':'evidence_access_revoke','monitor')])
 return evidenceAccess(env,id)
}
export async function evidenceSelection(env:Bindings,id:string,before?:string){
 const monitor=await get(env,id);if(!monitor)throw Object.assign(Error('Monitor not found'),{status:404})
 const {items,next}=await readSnapshots(env,id,before)
 return {monitor:{id,name:monitor.definition.name},items,next}
}
