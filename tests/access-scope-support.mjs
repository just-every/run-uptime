import assert from 'node:assert/strict';
import {main as accessCommand} from '../scripts/access.mjs';
export async function proveScopedAccess({origin,call,fetcher,DB,cookie,editor,responder,reader,target,invite}){
 const assign=async(person,role,scopes)=>{const response=await call(`/api/access/members/${person.id}`,{role,scopes},{cookie});assert.equal(response.status,200,await response.clone().text())};
 const scopes=[{kind:'service',value:'synthetic-service-a'},{kind:'team',value:'synthetic-team-a'}];
 const other=await call('/api/monitors',{...target.definition,name:'synthetic-outside-scope',service:'synthetic-service-b',group:'synthetic-team-a'},{cookie});assert.equal(other.status,201);const outside=await other.json();
 for(const [person,role] of [[editor,'editor'],[responder,'responder'],[reader,'read-only']]){
  await assign(person,role,scopes);
  assert.equal((await call('/api/v1/monitors/'+target.id,undefined,{cookie:person.cookie})).status,200);
  for(const id of [outside.id,'missing-monitor']){const denied=await call('/api/v1/monitors/'+id,undefined,{cookie:person.cookie});assert.equal(denied.status,403);assert.ok(!JSON.stringify(await denied.json()).includes('synthetic-outside-scope'))}
  for(const path of ['/api/overview','/api/v1/monitors','/api/v1/uptime','/api/archive','/api/definitions/export','/api/discovery-sources','/api/notifications/destinations','/api/access/members'])assert.equal((await call(path,undefined,{cookie:person.cookie})).status,403,'scope cannot widen into '+path);
  const document=await call('/app/monitors',undefined,{cookie:person.cookie});assert.equal(document.status,403);
 }
 const patch=body=>fetcher(origin+'/api/monitors/'+target.id,{method:'PATCH',redirect:'manual',headers:{host:new URL(origin).host,origin,'content-type':'application/json',cookie:editor.cookie},body:JSON.stringify(body)});
 const current=JSON.parse((await DB.prepare('SELECT definition FROM monitors WHERE id=?').bind(target.id).first()).definition);
 assert.equal((await patch({...current,name:'synthetic-scoped-editor'})).status,200);
 for(const changed of [{service:'synthetic-service-b'},{group:'synthetic-team-b'},{dependencies:[outside.id]},{network:'private',privateGrantRef:'synthetic-grant'}])assert.equal((await patch({...current,...changed})).status,403,'check update cannot escape product scope');
 assert.equal((await call(`/api/monitors/${outside.id}/run`,{},{cookie:responder.cookie})).status,403);
 const maintenance={monitorIds:[target.id],window:{id:'synthetic-access-maintenance',name:'synthetic-access-maintenance',timeZone:'UTC',mode:'suppress',startsAt:Date.now()-1000,endsAt:Date.now()+60000}};
 const currentAssignment=await DB.prepare('SELECT * FROM uptime_member_roles WHERE operator_id=?').bind(responder.id).first(),auditBefore=(await DB.prepare('SELECT COUNT(*) n FROM uptime_audit').first()).n
 assert.equal((await call(`/api/access/members/${responder.id}`,{role:'responder',scopes:[...scopes].reverse()},{cookie})).status,200)
 assert.deepEqual(await DB.prepare('SELECT * FROM uptime_member_roles WHERE operator_id=?').bind(responder.id).first(),currentAssignment,'identical role/scopes are a no-op, including reordered scopes')
 assert.equal((await DB.prepare('SELECT COUNT(*) n FROM uptime_audit').first()).n,auditBefore,'no-op assignment creates no mutation audit')
 assert.equal((await call(`/api/access/members/${responder.id}`,{role:'unknown-role'},{cookie})).status,400)
 assert.deepEqual(await DB.prepare('SELECT * FROM uptime_member_roles WHERE operator_id=?').bind(responder.id).first(),currentAssignment,'unknown roles are refused without a write')
 const before=await DB.prepare('SELECT revision FROM monitors WHERE id=?').bind(target.id).first();
 assert.equal((await call('/api/maintenance/preview',maintenance,{cookie:reader.cookie})).status,403);
 assert.equal((await call('/api/maintenance/preview',{...maintenance,monitorIds:[target.id,outside.id]},{cookie:responder.cookie})).status,403,'mixed-scope bulk operation is entirely refused');
 assert.deepEqual(await DB.prepare('SELECT revision FROM monitors WHERE id=?').bind(target.id).first(),before);
 const preview=await call('/api/maintenance/preview',maintenance,{cookie:responder.cookie});assert.equal(preview.status,200);const review=await preview.json();
 assert.equal((await call('/api/maintenance/apply',{...maintenance,digest:review.digest},{cookie:responder.cookie})).status,201);
 assert.equal((await call('/api/maintenance/cancel',{monitorIds:[target.id],windowId:maintenance.window.id},{cookie:responder.cookie})).status,200);
 // A service and team must both match; changing just the team revokes access.
 await assign(reader,'read-only',[{kind:'service',value:'synthetic-service-a'},{kind:'team',value:'synthetic-team-b'}]);
 assert.equal((await call('/api/v1/monitors/'+target.id,undefined,{cookie:reader.cookie})).status,403);
 await assign(reader,'read-only',[]);
 assert.equal((await call('/api/v1/monitors',undefined,{cookie:reader.cookie})).status,200,'no scope rows means this role in its whole workspace');
 assert.equal((await call('/api/v1/monitors/'+outside.id,undefined,{cookie:reader.cookie})).status,200);
 // A stale product assignment cannot outlive Base's version fence.
 await DB.prepare('UPDATE uptime_member_roles SET base_version=base_version-1 WHERE operator_id=?').bind(reader.id).run();
 assert.equal((await call('/api/v1/monitors/'+target.id,undefined,{cookie:reader.cookie})).status,401);
 await assign(reader,'read-only',[]);
 const removed=await accessCommand(['--origin',origin,'remove','--id',reader.id],{UPTIME_ACCESS_COOKIE:cookie},fetcher);assert.equal(removed.status,'inactive');
 assert.equal((await call('/api/v1/monitors/'+target.id,undefined,{cookie:reader.cookie})).status,401);
 assert.equal((await call('/auth/operator/status',{operatorId:reader.id,status:'active'},{cookie})).status,200);
 // Reactivation does not revive either the old Base session or the old product assignment.
 assert.equal((await call('/api/v1/monitors/'+target.id,undefined,{cookie:reader.cookie})).status,401);
 const listed=await accessCommand(['--origin',origin,'list'],{UPTIME_ACCESS_COOKIE:cookie},fetcher);assert.ok(listed.some(p=>p.id===reader.id&&p.assignmentCurrent===false));
 // Erasure removes populated role/scope authority through the public door.
 await assign(reader,'read-only',scopes);
 const erased=await call(`/api/operators/${reader.id}/erase`,{},{cookie});assert.equal(erased.status,200);const receipt=(await erased.json()).receipt;
 assert.equal(receipt.counts.uptime_member_roles,1);assert.equal(receipt.counts.uptime_member_scopes,scopes.length);
 for(const table of ['uptime_member_roles','uptime_member_scopes'])assert.equal((await DB.prepare(`SELECT COUNT(*) n FROM ${table} WHERE operator_id=?`).bind(reader.id).first()).n,0);
 // Restore editor/responder workspace permissions for the remaining lifecycle assertions.
 await assign(editor,'editor',[]);await assign(responder,'responder',[]);
}
