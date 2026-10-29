import assert from 'node:assert/strict';
import {authRequest,deliveredLink,sessionCookie} from './auth-test-support.mjs';
import {completeSecondFactor} from './mfa-auth-support.mjs';
import {main as incidentCommand} from '../scripts/incidents.mjs';
import {proveMentionRecovery} from './incident-mention-recovery-support.mjs';

export function incidentMailEdge(){
 const edge={mode:'accepted',mentions:[]};
 edge.fetch=async request=>{
  if(new URL(request.url).hostname==='api.sendgrid.com'){
   const message=await request.json();
   if(message.subject==='Uptime incident mention'){
    edge.mentions.push(message);
    if(edge.mode==='held'){edge.held();return new Promise(()=>{})}
    if(edge.mode==='uncertain')throw Error('Synthetic connection loss after submission');
    if(edge.mode==='rejected')return new Response(null,{status:400});
   }
   return new Response(null,{status:202});
  }
  assert.match(new URL(request.url).hostname,/^(watch|heartbeat)\.example\.test$/);return new Response('',{status:200});
 };
 return edge;
}
export async function proveIncidentMembers(f,monitor,id,edge,restart){
 const path='/api/incidents/'+encodeURIComponent(id),call=authRequest(f.origin);
 const ok=async(suffix,options={})=>{const result=await f.request(suffix,options);assert.ok(result.status>=200&&result.status<300,`${suffix}: ${result.status} ${JSON.stringify(result.data)}`);return result.data};
 const invite=async(role,scopes=[],label=role)=>{
  const email=`incident-${label}@example.test`;
  await ok('/api/access/invitations',{body:{email,displayName:`Incident ${label}`,role,scopes}});
  const link=await deliveredLink(call,{email,kind:'invite'}),cookie=sessionCookie(await call('/auth/confirm',{token:link.searchParams.get('token')}));
  await completeSecondFactor(f.origin,cookie);
  const identity=await ok('/api/access/self',{headers:{cookie}});return {...identity,cookie};
 };
 const responder=await invite('responder',[{kind:'service',value:monitor.definition.service}]),editor=await invite('editor'),admin=await invite('admin'),reader=await invite('read-only'),outside=await invite('responder',[{kind:'service',value:'inaccessible-service'}],'outside');
 const machine=async()=>Object.fromEntries(await Promise.all(['monitors','revisions','slots','observations','outbox'].map(async table=>[table,(await f.DB.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results]))),before=await machine();
 const suggestions=await ok(path+'/mention-members',{headers:{cookie:responder.cookie}});
 assert.ok(suggestions.some(person=>person.id===reader.id));assert.ok(!suggestions.some(person=>person.id===outside.id));
 assert.ok(suggestions.every(person=>Object.keys(person).sort().join(',')==='displayName,id'),'member suggestions contain no email or authority metadata');
 assert.equal((await f.request(path,{headers:{cookie:outside.cookie}})).status,403);
 assert.equal((await f.request(path+'/mention-members',{headers:{cookie:outside.cookie}})).status,403);
 const comment=await incidentCommand(['--origin',f.origin,'comment','--id',id],{UPTIME_ACCESS_COOKIE:responder.cookie},fetch,{text:'restarted php-fpm; private responder account',mentions:[reader.id]});
 assert.equal(edge.mentions.length,1);const email=edge.mentions[0].content.find(part=>part.type==='text/plain').value;
 assert.ok(email.includes('restarted php-fpm'));assert.ok(email.includes(path));assert.ok(email.length<1500);
 let detail=await ok(path,{headers:{cookie:reader.cookie}}),visible=detail.comments.find(row=>row.id===comment.id);assert.equal(visible.mentions[0].outcome,'accepted');
 // Responder ownership follows live Base membership and the monitor scope.
 const assignment=async(cookie,ownerId)=>{const current=await ok(path,{headers:{cookie}});return incidentCommand(['--origin',f.origin,'assign','--id',id],{UPTIME_ACCESS_COOKIE:cookie},fetch,{ownerId,version:current.version})};
 await assignment(responder.cookie,responder.id);await assignment(responder.cookie,editor.id);
 let assigned=await ok('/api/v1/incidents/'+encodeURIComponent(id),{headers:{cookie:responder.cookie}});
 const changes=assigned.timeline.filter(row=>row.kind==='owner_assigned').slice(-2);
 assert.deepEqual(changes.map(row=>row.data.owner.id),[responder.id,editor.id]);assert.ok(changes.every(row=>row.actor.id===responder.id&&row.at>0));
 assert.equal(assigned.owner.id,editor.id);
 assert.equal((await f.request(path+'/actions',{body:{kind:'assign',ownerId:outside.id,version:assigned.version},headers:{cookie:responder.cookie}})).status,400,'out-of-scope responder cannot own this incident');
 assert.equal((await f.request(path+'/actions',{body:{kind:'assign',ownerId:reader.id,version:assigned.version},headers:{cookie:responder.cookie}})).status,400,'read-only members cannot own response work');
 const readKey=await ok('/api/credentials',{body:{name:'synthetic-uptime-301',scopes:['monitoring:read'],expiresAt:Date.now()+3600000,resources:{mode:'selection',monitorIds:[monitor.id],tags:[]}}});
 const deniedSnapshot=async()=>Object.fromEntries(await Promise.all(['incident_comments','incident_comment_history','incident_work','incident_mentions','incident_timeline'].map(async table=>[table,(await f.DB.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results])));
 const metrics=await ok('/api/metrics/keys',{body:{name:'Incident read-only refusal'}}),deniedBefore=await deniedSnapshot();
 for(const headers of [{cookie:reader.cookie},{cookie:outside.cookie},{cookie:'',authorization:'Bearer '+metrics.token},{cookie:'',authorization:'Bearer '+readKey.token},{cookie:''}]){
  for(const [method,suffix,body] of [['POST','/actions',{kind:'assign',ownerId:responder.id,version:assigned.version}],['POST','/comments',{text:'refused'}],['PATCH','/comments/'+comment.id,{text:'refused',version:1}],['DELETE','/comments/'+comment.id+'?version=1',undefined],['PATCH','/root-cause',{categoryId:'unknown',text:'refused',version:detail.rootCause.version}]]){
   const result=await f.request(path+suffix,{method,body,headers});assert.ok([401,403].includes(result.status),'read-only/scoped/bearer/signed-out writes refused');
  }
 }
 assert.deepEqual(await deniedSnapshot(),deniedBefore,'refused writes create no incident work');
 assert.equal((await f.request(path+'/comments/'+comment.id,{method:'PATCH',body:{text:'other author',version:1},headers:{cookie:editor.cookie}})).status,403);
 await ok(path+'/comments/'+comment.id,{method:'PATCH',body:{text:'Own edit, no repeated mention',version:1},headers:{cookie:responder.cookie}});assert.equal(edge.mentions.length,1);
 await ok(path+'/comments/'+comment.id,{method:'PATCH',body:{text:'Administrator correction',version:2},headers:{cookie:admin.cookie}});
 assert.equal((await f.request(path+'/comments/'+comment.id,{method:'PATCH',body:{text:'stale',version:2},headers:{cookie:responder.cookie}})).status,409);
 await ok(path+'/root-cause',{method:'PATCH',body:{categoryId:'hosting-provider',text:'Provider disk full',version:detail.rootCause.version},headers:{cookie:responder.cookie}});
 const own=await ok(path+'/comments',{body:{text:'Editor own removable note'},headers:{cookie:editor.cookie}});
 await ok(path+'/comments/'+own.id+'?version=1',{method:'DELETE',headers:{cookie:editor.cookie}});
 const adminDelete=await ok(path+'/comments',{body:{text:'Admin may remove another author'},headers:{cookie:responder.cookie}});
 await ok(path+'/comments/'+adminDelete.id+'?version=1',{method:'DELETE',headers:{cookie:admin.cookie}});
 edge.mode='uncertain';const uncertain=await ok(path+'/comments',{body:{text:'Unknown handoff is never replayed',mentions:[responder.id]},headers:{cookie:editor.cookie}});edge.mode='accepted';
 detail=await ok(path);assert.equal(detail.comments.find(row=>row.id===uncertain.id).mentions[0].outcome,'uncertain');const sent=edge.mentions.length;
 await ok(path);await ok(path+'/comments/'+uncertain.id,{method:'PATCH',body:{text:'Edited without explicit new mention',version:1},headers:{cookie:editor.cookie}});assert.equal(edge.mentions.length,sent);
 assert.equal((await f.request(path+'/comments',{body:{text:'Cannot notify outside reader',mentions:[outside.id]}})).status,403);
 await ok('/api/access/members/'+editor.id,{body:{role:'read-only'}});
 assert.equal((await f.request(path+'/comments',{body:{text:'Stale responder authority'},headers:{cookie:editor.cookie}})).status,403);
 await ok('/auth/operator/status',{body:{operatorId:admin.id,status:'inactive'}});
 assert.equal((await f.request(path+'/comments',{body:{text:'Stale Base session'},headers:{cookie:admin.cookie}})).status,401);
 assert.deepEqual(await machine(),before,'collaboration never changes monitoring evidence');
 await proveMentionRecovery(f,{...monitor,incidentId:id},{responder,reader,invite},edge,restart);
 return {responder,reader,commentId:comment.id,sent:edge.mentions.length,ownership:changes};
}
export async function proveMentionErasure(f,path,members){
 for(const member of [members.responder,members.reader]){
  const response=await f.request('/api/operators/'+member.id+'/erase',{body:{}});assert.equal(response.status,200,JSON.stringify(response.data));
  assert.equal((await f.DB.prepare('SELECT COUNT(*) n FROM incident_mentions WHERE recipient_id=?').bind(member.id).first()).n,0);
 }
 const detail=(await f.request(path)).data;assert.equal(detail.comments.find(row=>row.id===members.commentId).author.displayName,'Former member');assert.equal(detail.comments.find(row=>row.id===members.commentId).text,'Administrator correction');
}
