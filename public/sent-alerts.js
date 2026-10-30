import {escape} from './console-format.js';
// Sent alerts (Settings › Alerts): what Uptime sent, newest first. The newest five are rows; the rest of the history (up to
// 200) wait inside All sent alerts, a <details> the console's refresh keeps open (public/dom-patch.js). Each row is its own
// disclosure: why the send ended as it did, the HTTP status with the receiver's response excerpt, and any retry or fallback.
// The pill keeps acceptance apart from receipt: Accepted means the provider or endpoint took it, not that anyone read it.
const NEWEST=5;
const label=state=>({accepted:'Accepted',rejected:'Failed',uncertain:'Uncertain',queued:'Queued',sending:'Sending'})[state]??state;
// A refused send that was never attempted was held back by Uptime (disabled, rotated, cancelled, no sender): Not sent.
const pill=d=>d.state==='rejected'?(d.attempts>0?['rejected',`Failed${d.status?` · ${d.status}`:''}`]:['not-sent','Not sent']):[d.state,label(d.state)];
export function deliveryReason(d,{workerSends=false,demo=false,cronStarted=true}={}){return d.state==='queued'?(workerSends?`Queued — waiting to send.${demo||cronStarted?'':' Scheduled sending is starting up; this can take up to two hours.'}`:'Queued — waiting for your server to send it.'):d.state==='sending'?'The request has started; waiting for its response.':d.state==='accepted'?'Send completed.':d.state==='uncertain'?(d.code==='claim_expired'?`The delivery timed out before completion. Check ${workerSends?'Worker':'runner'} timing; delivery is uncertain and will not be automatically resent.`:'Unsuccessful confirmation: delivery is uncertain. It will not be automatically resent.'):d.code==='report_cancelled'?'Not sent: the owner cancelled this scheduled report.':d.code==='destination_disabled'?'Not sent: the destination was disabled before delivery.':d.code==='destination_deleted'?'Not sent: the destination was deleted before delivery.':d.code==='credential_rotated'?'Not sent: webhook credentials were rotated before delivery.':d.code==='credential_unavailable'?'Not sent: credentials are unavailable. Edit the destination to re-enter them.':d.code==='runner_clock_ahead'?'Not sent: the runner clock is ahead of Uptime. Synchronize the server clock. This event will not be resent.':d.code==='mail_not_configured'?'Not sent: email is not set up. Configure the installation sender, then send a new test.':d.code==='mail_input_invalid'?'Not sent: the sender or message failed validation.':'The request was not accepted. It will not be automatically resent.'}
// DELIVERY-002: quiet holds, retries and the fallback chain replace or follow the plain reason.
function reasonText(d,notes){
 const next=(d.attemptHistory??[]).at(-1);
 return d.code==='waiting_for_contact_quiet'?`Quiet hours: waiting${d.quietUntil?` until ${new Date(d.quietUntil).toLocaleString()}`:''}.`:d.code==='retry_window_exhausted'?'Retry window exhausted. No further automatic retry.':d.code==='retry_attempts_exhausted'?'Attempt limit reached. No further automatic retry.':d.state==='queued'&&d.attempts>0&&next?.started_at===null?`Retry scheduled: ${new Date(next.scheduled_at).toLocaleString()}.`:deliveryReason(d,notes);
}
function chainLines(chain){
 const lines=(chain.after??[]).map(p=>`Fallback ${chain.step} after ${p.destinationName}: ${p.outcome==='failed'?'Failed':'Uncertain'} (${p.code})${p.stateNow&&label(p.stateNow)!==(p.outcome==='failed'?'Failed':'Uncertain')?`; now ${label(p.stateNow)}`:''}.`);
 for(const f of chain.fallbacks)lines.push(`Fallback to ${f.destinationName}: ${label(f.state)}.`);
 if(chain.ended==='exhausted')lines.push('Chain ended: no contact accepted. Follow up manually.');
 return lines;
}
// One short date style: the time today, "Yesterday" and the time, else the date and the time.
function when(t){
 const at=new Date(t),day=new Date(at).setHours(0,0,0,0),today=new Date().setHours(0,0,0,0),clock=at.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
 return day===today?clock:day===today-86400000?`Yesterday ${clock}`:`${at.toLocaleDateString([],{month:'short',day:'numeric',...(at.getFullYear()===new Date().getFullYear()?{}:{year:'numeric'})})}, ${clock}`;
}
const excerpt=text=>escape(text.replace(/&(amp|lt|gt|quot|#39);/g,(_,name)=>({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'"}[name])));
function row(d,notes){
 const [tone,word]=pill(d),title=d.event.eventType==='uptime.notification.drill'||d.event.kind==='test'?'Test message':d.event.title;
 return `<li class="sent-row" data-key="delivery-${escape(d.id)}"><details><summary><span class="sent-what"><strong>${escape(title)}</strong><small><time datetime="${escape(new Date(d.createdAt).toISOString())}">${escape(when(d.createdAt))}</time> · ${escape(d.destinationName)}</small></span><span class="ui-pill ${escape(tone)}">${escape(word)}</span></summary><div class="sent-body"><p>${escape(reasonText(d,notes))}</p>${d.status?`<p>HTTP ${escape(d.status)}</p>`:''}${d.responseExcerpt?`<pre class="webhook-response">${excerpt(d.responseExcerpt)}</pre>`:''}${d.chain?chainLines(d.chain).map(line=>`<p>${escape(line)}</p>`).join(''):''}${d.code==='mail_not_configured'?'<a href="/docs/notifications#add-a-destination">Set up email</a>':''}</div></details></li>`;
}
export function sentAlertsMarkup(notes){
 const sent=notes.deliveries,rest=sent.slice(NEWEST);
 return `<h2 id="sent-alerts-heading">Sent alerts</h2>${sent.length?`<ul class="sent-list">${sent.slice(0,NEWEST).map(d=>row(d,notes)).join('')}</ul>`:'<p class="rows-note">No alerts sent yet.</p>'}${rest.length?`<details class="all-sent" id="all-sent-alerts"><summary>All sent alerts</summary><ul class="sent-list">${rest.map(d=>row(d,notes)).join('')}</ul></details>`:''}<details class="scheduled-reports" id="scheduled-reports"><summary>Scheduled reports</summary><div id="report-schedule-controls" data-owned="report-schedules"></div></details><a class="sent-guide" href="/docs/notifications">Notification guide</a>`;
}
