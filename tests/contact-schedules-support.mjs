import assert from 'node:assert/strict';
import {acceptanceReceiver,verifySlack,loopbackWireTransport} from './notify-acceptance-receivers.mjs';
import {availablePorts} from './notify-acceptance-runtime.mjs';

// Only the reviewed Slack HTTPS edge is redirected; dispatch, rendering,
// classification and durable acceptance use the production notification path.
export async function contactSlackEdge(){
 const url='https://hooks.slack.com/services/synthetic-uptime-21/synthetic-uptime-22/synthetic-uptime-23';
 const [port]=await availablePorts(1);
 const receiver=await acceptanceReceiver(port,record=>{
  verifySlack(record);
  assert.equal(record.path,'/slack');
  assert.equal(record.headers.get('content-type'),'application/json; charset=utf-8');
  record.receivedAtEpoch=Date.now();
 });
 return {url,receiver,transport:loopbackWireTransport(new Map([[url,{port,path:'/slack'}]]))};
}

export function assertSlackConfirmation(receiver,delivery,history,delayedDue){
 assert.ok(delivery,'the native Slack destination has a durable trigger delivery');
 assert.equal(delivery.kind,'slack');assert.equal(delivery.event.kind,'trigger');
 assert.equal(delivery.state,'accepted');assert.equal(delivery.code,'slack_webhook_accepted');
 assert.equal(delivery.status,200);assert.equal(delivery.attempts,1);
 const event=delivery.event,slot=history.find(row=>row.id===event.slotId);
 assert.ok(slot,'Slack refers to the retained signed confirmation slot');
 assert.equal(slot.manual,0);assert.equal(slot.status,'complete');
 assert.equal(slot.monitor_id,event.monitorId);assert.equal(slot.revision,event.monitorRevision);
 assert.equal(slot.observations.length,1);
 assert.equal(slot.observations[0].outcome,'target_failure');assert.equal(slot.observations[0].status,503);
 assert.ok(event.incidentKey);assert.equal(event.incidentContext.confirmedStartedAt,event.observedAt);
 const records=receiver.records.filter(record=>record.body.blocks.some(block=>block.text.text.split('\n').includes(`Monitor: ${event.monitorId}`)));
 receiver.assertValid();assert.equal(records.length,1,'one Slack wire request for this confirmed incident');
 const record=records[0],text=record.body.blocks.map(block=>block.text.text).join('\n');
 assert.equal(record.body.text,`Down: ${event.monitorName}`);
 for(const line of [`Incident: ${event.incidentKey}`,`State: firing`,`Time: ${new Date(event.observedAt).toISOString()}`,`Why: ${event.explanation}`])assert.ok(text.split('\n').includes(line),'Slack wire retains this confirmation and incident');
 assert.ok(record.receivedAtEpoch>=event.observedAt,'the send follows confirmation');
 assert.ok(record.receivedAtEpoch<delayedDue,'Slack sends on the first dispatch before the delayed contact is due');
 assert.equal(delivery.attemptHistory.length,1);
 const attempt=delivery.attemptHistory[0];
 assert.equal(attempt.delivery_id,delivery.id);assert.equal(attempt.destination_id,delivery.destinationId);
 assert.equal(attempt.key_reference,event.id);assert.equal(attempt.number,1);
 assert.equal(attempt.outcome_category,'accepted');assert.equal(attempt.code,'slack_webhook_accepted');
 assert.ok(attempt.started_at>=event.observedAt&&attempt.started_at<delayedDue);
 assert.ok(attempt.finished_at>=attempt.started_at&&attempt.finished_at<delayedDue);
}
