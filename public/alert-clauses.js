import {escape} from './console-format.js';
import {cannotSend} from './alert-health.js';
// Delivery notices above Settings › Alerts' Destinations. Each is a keyed line, so the console refresh adds or drops
// notices independently as conditions change.
const setupEmail='<a href="/docs/notifications#add-a-destination">Set up email</a>';
const list=names=>names.length<2?names.join(''):`${names.slice(0,-1).join(', ')} and ${names.at(-1)}`;
const clause=(key,tone,text,fix='')=>`<p class="ui-callout${tone?' '+tone:''} alert-clause" data-key="clause-${escape(key)}"><span>${text}${fix?` ${fix}`:''}</span></p>`;
export function clausesMarkup(notes,readUnavailable){
 const blocked=cannotSend(notes),email=blocked.filter(b=>b.reason==='email').map(b=>escape(b.destination.name)),lines=[];
 if(notes.mailSuppressed)lines.push(clause('simulated-email','','Development email is simulated. No email leaves this machine, including test messages and incident alerts.'));
 if(notes.demo)lines.push(clause('simulated-messages','','Demo messages are simulated. No email or other notification leaves this machine.'));
 if(notes.mailOff)lines.push(clause('email','warning',`Email is off for this installation.${email.length?` ${list(email)} cannot send.`:''}`));
 else if(email.length)lines.push(clause('email','warning',`Email is not set up, so ${list(email)} cannot send.`,setupEmail));
 else if(!notes.mailConfigured&&!notes.demo&&!notes.mailSuppressed)lines.push(clause('email','warning','Email is not set up.',setupEmail));
 // With destinations but none enabled the count shows 1; with none at all the empty Destinations card says so instead.
 if(notes.destinations.length&&!notes.destinations.some(d=>d.enabled))lines.push(clause('none-enabled','warning','No destination is enabled, so nobody is told about an incident. Enable one in its Edit dialog.'));
 for(const {destination:d,reason,delivery} of blocked){
  const name=escape(d.name),stored=d.kind==='email'?'address':'URL',fix=label=>`<button type="button" class="ui-link" data-edit-destination="${escape(d.id)}">${label}</button>`;
  if(reason==='credentials')lines.push(clause('credentials-'+d.id,'warning',`The stored ${stored} for ${name} can no longer be read, so it cannot send.`,fix(`Re-enter the ${stored}`)));
  else if(reason==='failed')lines.push(clause('failed-'+d.id,'warning',`${name} cannot send: its last send was refused${delivery.status?` (HTTP ${escape(delivery.status)})`:''}.`,fix('Edit')));
 }
 if(notes.workerSends&&!notes.demo&&!notes.cronStarted)lines.push(clause('starting','','Uptime can send due alerts while this console is open. Cloudflare can take up to two hours to activate background sending.'));
 if(!notes.workerSends&&notes.runnerContact?.state!=='Fresh contact')lines.push(clause('server','warning',readUnavailable?'Sending status is unavailable.':'The checker is not reporting. Uptime can still send checker warnings while the app is running.'));
 return lines.join('');
}
