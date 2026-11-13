// DELIVERY-002 delivery outcomes in Sent alerts (public/sent-alerts.js): a quiet hold, a retry and its limits replace a
// send's plain reason, and the fallback chain's lines follow it, naming both outcomes of an escalation.
export const deliveryLabel=state=>({accepted:'Accepted',rejected:'Failed',uncertain:'Uncertain',queued:'Queued',sending:'Sending','imported-inactive':'Imported, sending held'})[state]??'Status unavailable';
// The recorded outcome identifies a simulated send even after changing the installation's mail provider.
export const simulatedDelivery=(d,notes={})=>d.state==='accepted'&&(d.code==='mail_development'||notes.demo===true);
export const simulationNotice=(d,notes={})=>d.kind==='email'||d.code==='mail_development'?'Simulated. No email left this machine.':'Simulated. No message left this machine.';
const problem=code=>({destination_disabled:'destination disabled',destination_deleted:'destination deleted',credential_rotated:'credentials changed',credential_unavailable:'credentials unavailable',claim_expired:'delivery timed out',retry_window_exhausted:'retry window ended',retry_attempts_exhausted:'attempt limit reached',mail_not_configured:'email is not set up'})[code]??'acceptance was not confirmed';
const label=deliveryLabel;
export function retryNote(d){
 const next=(d.attemptHistory??[]).at(-1);
 return d.code==='waiting_for_contact_quiet'?`Quiet hours: waiting${d.quietUntil?` until ${new Date(d.quietUntil).toLocaleString()}`:''}.`:d.code==='retry_window_exhausted'?'Retry window exhausted. No further automatic retry.':d.code==='retry_attempts_exhausted'?'Attempt limit reached. No further automatic retry.':d.state==='queued'&&d.attempts>0&&next?.started_at===null?`Retry scheduled: ${new Date(next.scheduled_at).toLocaleString()}.`:null;
}
export function chainLines(chain){
 const lines=(chain.after??[]).map(p=>`Fallback ${chain.step} after ${p.destinationName}: ${p.outcome==='failed'?'Failed':'Uncertain'} (${problem(p.code)})${p.stateNow&&label(p.stateNow)!==(p.outcome==='failed'?'Failed':'Uncertain')?`; now ${label(p.stateNow)}`:''}.`);
 for(const f of chain.fallbacks)lines.push(`Fallback to ${f.destinationName}: ${label(f.state)}.`);
 if(chain.ended==='exhausted')lines.push('Chain ended: no contact accepted. Follow up manually.');
 return lines;
}
