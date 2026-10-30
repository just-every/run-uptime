import {escape} from './console-format.js';
import {cannotSend} from './alert-health.js';
// The clauses above Settings › Alerts' Destinations, one for each thing that stops an alert and only while it is true: email
// not set up, a destination that cannot send (which and why, with its fix), sending still starting up and the server not
// connected. Each is one keyed line, so the console's refresh adds or drops a clause without touching the others.
const setupEmail='<a href="/docs/notifications#add-a-destination">Set up email</a>';
const list=names=>names.length<2?names.join(''):`${names.slice(0,-1).join(', ')} and ${names.at(-1)}`;
const clause=(key,tone,text,fix='')=>`<p class="ui-callout${tone?' '+tone:''} alert-clause" data-key="clause-${escape(key)}"><span>${text}${fix?` ${fix}`:''}</span></p>`;
export function clausesMarkup(notes,readUnavailable){
 const blocked=cannotSend(notes),email=blocked.filter(b=>b.reason==='email').map(b=>escape(b.destination.name)),lines=[];
 if(email.length)lines.push(clause('email','warning',`Email is not set up, so ${list(email)} cannot send.`,setupEmail));
 else if(!notes.mailConfigured&&!notes.demo&&!notes.mailSuppressed)lines.push(clause('email','warning','Email is not set up.',setupEmail));
 for(const {destination:d,reason,delivery} of blocked){
  const name=escape(d.name),stored=d.kind==='email'?'address':'URL',fix=label=>`<button type="button" class="ui-link" data-edit-destination="${escape(d.id)}">${label}</button>`;
  if(reason==='credentials')lines.push(clause('credentials-'+d.id,'warning',`The stored ${stored} for ${name} can no longer be read, so it cannot send.`,fix(`Re-enter the ${stored}`)));
  else if(reason==='failed')lines.push(clause('failed-'+d.id,'warning',`${name} cannot send: its last send was refused${delivery.status?` (HTTP ${escape(delivery.status)})`:''}.`,fix('Edit')));
 }
 if(notes.workerSends&&!notes.demo&&!notes.cronStarted)lines.push(clause('starting','','Sending is starting up; this can take up to two hours. Queued alerts wait under Sent alerts until then.'));
 if(!notes.workerSends&&notes.runnerContact?.state!=='Fresh contact')lines.push(clause('server','warning',readUnavailable?'Sending status is unavailable.':'Sending is waiting for your server to connect.'));
 return lines.join('');
}
