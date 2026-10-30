import {escape,icon,ago} from './console-format.js';
import {cannotSend} from './alert-health.js';
// Destinations (Settings › Alerts): one row per destination, its line icon, its name and one quiet line (kind, the email
// address, then what it last did or why it cannot send), with Send test and Edit. Everything else a destination has (Enabled,
// the request preview, Rotate secret, the latest test and Delete) is in its Edit dialog (public/destination-dialog.js).
export const kindName=d=>d.kind==='email'?'Email':d.kind==='slack'?'Slack':d.webhookTemplate?'Custom webhook':d.webhookSigning===false?'Webhook':'Signed webhook';
const kindIcon=d=>d.kind==='webhook'?'braces':d.kind==='slack'?'chat':'mail';
// What the destination last did: a recipient's confirmed receipt first, then its newest send that ended.
function lastWord(d,notes,blocked){
 if(!d.enabled)return 'disabled';
 if(blocked)return 'cannot send';
 if(d.proof?.state==='proven')return `receipt confirmed ${ago(d.proof.lastProvenAt)}`;
 const newest=notes.deliveries.find(x=>x.destinationId===d.id);
 if(newest?.state==='queued'||newest?.state==='sending')return 'sending';
 if(newest?.state==='accepted')return `sent ${ago(newest.createdAt)}`;
 if(newest?.state==='uncertain')return 'last send uncertain';
 return d.proof?.state==='stale'?`receipt last confirmed ${ago(d.proof.lastProvenAt)}`:'nothing sent yet';
}
function row(d,notes,blocked){
 const id=escape(d.id),name=`destination-name-${id}`;
 const meta=[kindName(d),...(d.kind==='email'&&d.address?[d.address]:[]),lastWord(d,notes,blocked)].map(escape).join(' · ');
 const warnings=(d.webhookWarnings??[]).map(w=>`<small class="destination-warning">${escape(w.variable)}: ${escape(w.reason)}</small>`).join('');
 return `<li class="destination-row" data-key="destination-${id}"><span class="destination-icon">${icon(kindIcon(d))}</span><div class="who"><strong id="${name}">${escape(d.name)}</strong><small>${meta}</small>${warnings}</div><div class="row-actions"><button type="button" class="ui-compact" id="destination-test-${id}" data-send-test="${id}" aria-describedby="${name}"${d.credentialsAvailable===false?' disabled':''}>Send test</button><button type="button" class="ui-compact" id="destination-edit-${id}" data-edit-destination="${id}" aria-describedby="${name}">Edit</button></div></li>`;
}
export function destinationsMarkup(notes){
 const blocked=new Set(cannotSend(notes).map(b=>b.destination.id));
 return `<h2 id="destinations-heading">Destinations</h2>${notes.destinations.length?`<ul class="rows destination-rows">${notes.destinations.map(d=>row(d,notes,blocked.has(d.id))).join('')}</ul>`:'<p class="rows-note">No destinations yet. Add email, a signed JSON webhook, or Slack.</p>'}`;
}
