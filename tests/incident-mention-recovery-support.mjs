import assert from 'node:assert/strict';
import {main as incidentCommand} from '../scripts/incidents.mjs';

// Exercise the emitted Worker and durable D1 at the committed-comment boundary.
// A real SQLite fault aborts reservation, not the preceding comment transaction;
// stopping that Worker then restarting its persisted installation loses the request.
export async function proveMentionRecovery(f,source,members,edge,restart){
 const priorMode=f.modes.target;f.modes.target=503;
 const monitor=await f.monitor({service:source.definition.service});
 await f.run(f.first);await f.run(f.second);
 const incident=(await f.request(`/api/monitors/${monitor.id}/incidents`)).data[0];
 const path='/api/incidents/'+encodeURIComponent(incident.id);
 assert.equal((await f.request(path)).data.machineState,'open');
 const machine=async()=>Object.fromEntries(await Promise.all(['monitors','revisions','slots','observations','outbox'].map(async table=>[table,(await f.DB.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results])));
 const before=await machine(),sentBefore=edge.mentions.length;
 const ok=async(suffix,options={})=>{const result=await f.request(suffix,options);assert.ok(result.status>=200&&result.status<300,`${suffix}: ${result.status} ${JSON.stringify(result.data)}`);return result.data};
 const hold=()=>f.DB.prepare("CREATE TRIGGER synthetic_mention_interruption BEFORE UPDATE OF outcome ON incident_mentions WHEN OLD.outcome='pending' AND NEW.outcome='submitting' BEGIN SELECT RAISE(ABORT,'synthetic-uptime-501'); END").run();
 const release=()=>f.DB.prepare('DROP TRIGGER synthetic_mention_interruption').run();
 const pending=async(text,recipient=members.reader.id,door=path)=>{
  const response=await f.request(door+'/comments',{body:{text,mentions:[recipient]},headers:{cookie:members.responder.cookie}});
  assert.ok(response.status>=500,'reservation interruption reaches the caller');
  const detail=await ok(door),comment=detail.comments.find(row=>row.text===text);
  assert.ok(comment,'the responder comment committed before interruption');
  assert.equal(comment.author.id,members.responder.id);assert.equal(comment.mentions[0].outcome,'pending');
  return {comment,id:comment.mentions[0].id};
 };
 const schedule=async()=>assert.equal((await (await f.worker.getWorker()).scheduled()).outcome,'ok');
 await hold();
 const recovered=await pending('synthetic-uptime-502');
 const queued=await f.DB.prepare('SELECT * FROM incident_mentions WHERE id=?').bind(recovered.id).first();
 assert.equal(queued.outcome,'pending');assert.equal(queued.submitted_at,null);assert.equal(queued.finished_at,null);
 assert.equal(edge.mentions.length,sentBefore,'interrupted request submitted no email');
 await restart();await release();await schedule();
 let detail=await incidentCommand(['--origin',f.origin,'read','--id',incident.id],{UPTIME_ACCESS_COOKIE:members.responder.cookie});
 assert.equal(detail.comments.find(row=>row.id===recovered.comment.id).mentions[0].outcome,'accepted');
 const message=edge.mentions.at(-1),excerpt=message.content.find(part=>part.type==='text/plain').value;
 assert.equal(edge.mentions.length,sentBefore+1);assert.equal(message.custom_args.rer_delivery_id,recovered.id);
 assert.ok(excerpt.includes('synthetic-uptime-502'));assert.ok(excerpt.includes(path));assert.ok(excerpt.length<1500);
 await restart();await schedule();assert.equal(edge.mentions.length,sentBefore+1,'completed recovery never resubmits');

 // Request dispatch and the real Cron handler compete for the same reservation.
 const concurrentBefore=edge.mentions.length;
 const [concurrent]=await Promise.all([ok(path+'/comments',{body:{text:'synthetic-uptime-503',mentions:[members.reader.id]},headers:{cookie:members.responder.cookie}}),schedule()]);
 await schedule();detail=await ok(path);
 const concurrentMention=detail.comments.find(row=>row.id===concurrent.id).mentions[0];
 assert.equal(concurrentMention.outcome,'accepted');assert.equal(edge.mentions.length,concurrentBefore+1);
 assert.equal(edge.mentions.filter(message=>message.custom_args.rer_delivery_id===concurrentMention.id).length,1);

 const revoked=await members.invite('read-only',[],'recovery-revoked'),outside=await members.invite('read-only',[],'recovery-outside'),erased=await members.invite('read-only',[],'recovery-erased');
 await hold();
 const edited=await pending('synthetic-uptime-504'),deleted=await pending('synthetic-uptime-505');
 const revokedMention=await pending('synthetic-uptime-506',revoked.id),outsideMention=await pending('synthetic-uptime-507',outside.id),erasedMention=await pending('synthetic-uptime-508',erased.id);
 await ok(path+'/comments/'+edited.comment.id,{method:'PATCH',body:{text:'synthetic-uptime-509',version:1},headers:{cookie:members.responder.cookie}});
 await ok(path+'/comments/'+deleted.comment.id+'?version=1',{method:'DELETE',headers:{cookie:members.responder.cookie}});
 await ok('/auth/operator/status',{body:{operatorId:revoked.id,status:'inactive'}});
 await ok('/api/access/members/'+outside.id,{body:{role:'read-only',scopes:[{kind:'service',value:'inaccessible-service'}]}});
 await ok('/api/operators/'+erased.id+'/erase',{body:{}});
 // Retain a never-submitted reservation as a crash-boundary fixture. A sweep
 // must not acquire it even though there is no recorded provider submission.
 const reserved=await pending('synthetic-uptime-510');
 await release();
 await f.DB.prepare("UPDATE incident_mentions SET outcome='submitting' WHERE id=?").bind(reserved.id).run();
 const reservedBefore=await f.DB.prepare('SELECT * FROM incident_mentions WHERE id=?').bind(reserved.id).first();
 const blockedBefore=edge.mentions.length;
 await restart();await schedule();await schedule();
 assert.equal(edge.mentions.length,blockedBefore,'edit, deletion, revoked membership, scope removal and erasure cannot resurrect sends');
 assert.deepEqual(await f.DB.prepare('SELECT * FROM incident_mentions WHERE id=?').bind(reserved.id).first(),reservedBefore);
 detail=await ok(path);
 for(const row of [edited,revokedMention,outsideMention])assert.equal(detail.comments.find(comment=>comment.id===row.comment.id).mentions[0].outcome,'cancelled');
 for(const row of [deleted,erasedMention])assert.deepEqual(detail.comments.find(comment=>comment.id===row.comment.id).mentions,[]);
 assert.equal(detail.comments.find(row=>row.id===reserved.comment.id).mentions[0].outcome,'uncertain');

 // More committed comments than one sweep can submit: the remainder survives
 // unreserved, and two simultaneous Cron invocations still submit each ID once.
 await hold();const backlog=[];
 for(let index=0;index<11;index++)backlog.push(await pending(`synthetic-uptime-${520+index}`));
 await release();const boundedBefore=edge.mentions.length;
 await schedule();assert.ok(edge.mentions.length>boundedBefore&&edge.mentions.length<boundedBefore+backlog.length,'one sweep leaves excess work pending');
 await Promise.all([schedule(),schedule()]);
 assert.equal(edge.mentions.length,boundedBefore+backlog.length);
 for(const row of backlog)assert.equal(edge.mentions.filter(message=>message.custom_args.rer_delivery_id===row.id).length,1);

 // Kill an actual Worker after provider handover, while its request is pending.
 let reached;const boundary=new Promise(resolve=>reached=resolve);
 edge.mode='held';edge.held=reached;
 const inFlight=f.request(path+'/comments',{body:{text:'synthetic-uptime-540',mentions:[members.reader.id]},headers:{cookie:members.responder.cookie}}).catch(()=>null);
 await boundary;
 const submitted=(await f.DB.prepare("SELECT * FROM incident_mentions WHERE outcome='submitting' AND submitted_at IS NOT NULL").all()).results;
 assert.equal(submitted.length,1);
 const interruptedBefore=edge.mentions.length;
 await restart();await inFlight;edge.mode='accepted';delete edge.held;
 await schedule();await restart();await schedule();
 assert.equal(edge.mentions.length,interruptedBefore,'an interrupted provider handover never replays');
 assert.deepEqual((await f.DB.prepare('SELECT * FROM incident_mentions WHERE id=?').bind(submitted[0].id).first()),submitted[0]);
 assert.equal((await ok(path)).comments.find(row=>row.text==='synthetic-uptime-540').mentions[0].outcome,'uncertain');
 assert.deepEqual(await machine(),before,'recovered human mentions never change monitoring evidence');
 await ok('/api/monitors/'+monitor.id+'/erase',{body:{name:monitor.definition.name}});
 const erasedBefore=edge.mentions.length;await schedule();assert.equal(edge.mentions.length,erasedBefore,'monitor erasure removes pending and reserved dispatch work');
 // Leave an actually committed, never-reserved mention in the original incident
 // for the existing owner archive journey to restore without dispatch authority.
 await hold();await pending('synthetic-uptime-541',members.reader.id,'/api/incidents/'+encodeURIComponent(source.incidentId));await release();
 f.modes.target=priorMode;
 console.log('Incident mention recovery PASS: committed responder comment, reservation interruption, persisted Worker restarts, bounded Cron sweep, API and CLI outcomes, competing dispatch, current authority, erasure and no reserved-send replay.');
}
