// Keep keyboard traversal inside an active modal at both ends of its controls.
export function containModalKeyboard(dialog){
 dialog.addEventListener('keydown',event=>{
  if(event.key!=='Tab'||!dialog.matches(':modal'))return;
  const controls=[...dialog.querySelectorAll('a[href],button,input,select,textarea,summary,[tabindex]')].filter(node=>!node.disabled&&node.tabIndex>=0&&node.getClientRects().length);
  const first=controls[0],last=controls.at(-1);
  if(!first){event.preventDefault();dialog.focus();return}
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
 });
}

// Periodic console redraws can replace the opener while a native dialog is
// open. Restore the current control with the same id when that happens.
// Closing has already returned focus to a connected opener, and the close
// event runs a frame later, when the owner may have moved on (Tab, another
// button): restore only focus that is still lost, on the page or in a closed
// dialog.
export function dialogFocusReturn(fallbackId) {
 const opener=document.activeElement,id=opener?.id||fallbackId;
 return ()=>{
  const active=document.activeElement;
  if(document.querySelector('dialog:modal')||active&&active!==document.body&&!active.closest('dialog:not([open])'))return;
  const control=opener?.isConnected&&opener!==document.body&&!opener.closest('dialog')?opener:id?document.getElementById(id):null;
  control?.focus({preventScroll:true});
 };
}

// One-time credentials stay in this dialog only, and are erased on every exit.
export const verificationHelp=`<details class="verification-help"><summary>How to verify a signed request</summary><p>Use the signing secret as literal UTF-8 text; do not hex-decode it. Read <code>x-lamp-timestamp</code> and <code>x-lamp-signature</code>.</p><p>Reject timestamps more than five minutes from the current time. The timestamp is ISO 8601 UTC, ending in .000Z. Compute HMAC-SHA256 over the exact UTF-8 timestamp, a dot, and the exact request body bytes. For a custom request with <code>x-uptime-signature-input: query</code>, use its raw percent-encoded query string after <code>?</code> instead of the body. Compare its unprefixed, unpadded base64url signature with the signature header using a constant-time comparison.</p><p>Receivers using the <code>webhook-*</code> headers should follow their matching verification scheme. <code>incidentKey</code> identifies an incident, <code>title</code> names it, and <code>state</code> is firing or recovered. Test requests use a separate test identity.</p></details>`;
export function confirmDestination({title,explanation,button,tone,onConfirm}){
 const returnFocus=dialogFocusReturn();
 const dialog=document.createElement('dialog');dialog.className='editor notification-dialog confirmation-dialog';
 const heading=document.createElement('h2');heading.id='confirmation-heading';heading.textContent=title;dialog.setAttribute('aria-labelledby',heading.id);
 const text=document.createElement('p');text.textContent=explanation;
 const buttons=document.createElement('div');buttons.className='buttons';
 const cancel=document.createElement('button');cancel.className='secondary';cancel.textContent='Cancel';
 const confirm=document.createElement('button');confirm.className=tone==='danger'?'primary danger':'primary';confirm.textContent=button;
 const mark=document.createElement('span');mark.className='dialog-mark'+(tone==='danger'?' danger':'');mark.setAttribute('aria-hidden','true');mark.innerHTML=`<span class="ui-icon" data-icon="${tone==='danger'?'alert':'restore'}"></span>`;
 const close=()=>dialog.close();cancel.onclick=close;dialog.addEventListener('close',()=>{dialog.remove();returnFocus()},{once:true});
 confirm.onclick=()=>{close();returnFocus();onConfirm()};buttons.append(cancel,confirm);dialog.append(mark,heading,text,buttons);document.body.append(dialog);containModalKeyboard(dialog);dialog.showModal();cancel.focus();
}
export function showSecret(secret,destinationName){
 const returnFocus=dialogFocusReturn("add-destination");
 const dialog=document.createElement('dialog');dialog.className='editor notification-dialog secret-dialog';
 const title=document.createElement('h2');title.id='secret-heading';title.textContent=`Save the signing secret for ${destinationName}`;dialog.setAttribute('aria-labelledby',title.id);
 const explanation=document.createElement('p');explanation.textContent='This secret is shown once. Save it in your receiver now; it cannot be retrieved after closing. Use it as literal UTF-8 text.';
 const code=document.createElement('code');code.className='one-time-secret';code.textContent=secret;
 const copy=document.createElement('button');copy.className='copy-secret';copy.innerHTML='<span class="ui-icon" data-icon="copy" aria-hidden="true"></span>Copy signing secret';
 const status=document.createElement('p');status.className='copy-feedback';status.setAttribute('role','status');
 copy.onclick=async()=>{try{await navigator.clipboard.writeText(secret);if(dialog.isConnected){status.dataset.state='success';status.textContent='Copied — save it in your receiver.'}}catch{if(dialog.isConnected){status.dataset.state='error';status.textContent='Copy could not complete. Select and copy the secret above.'}}};
 const help=document.createElement('div');help.innerHTML=verificationHelp;
 const close=document.createElement('button');close.className='primary secret-close';close.textContent='I saved it — close';
 const clear=()=>{code.textContent='';code.remove();secret='';status.textContent='';copy.onclick=null};close.onclick=()=>{clear();dialog.close()};dialog.oncancel=clear;dialog.onclose=()=>{clear();dialog.remove();returnFocus()};
 dialog.append(title,explanation,code,copy,status,help,close);document.body.append(dialog);containModalKeyboard(dialog);dialog.showModal();
}

// Group the stored inventory by what the owner erased, counting each record
// once. New dependent tables stay counted without exposing storage names.
const monitorErasureGroups=[
 ['Monitor and saved settings',['monitors','revisions','definition_batch_entries','catalog_route_batch_entries','failure_snapshot_settings']],
 ['Check results and supporting records',['slots','observations','failure_snapshots','evidence_generation','attempt_checkpoints','runner_assignments']],
 ['Incidents, comments and updates',['outbox','incident_work','incident_comments','incident_comment_history','incident_timeline','incident_mentions','incident_mention_authority']],
 ['Alerts and delivery history',['notification_jobs','notification_delivery_attempts','notification_retry_policy','integration_attempts','integration_resolutions','integration_deliveries','integration_replays','notification_claim_custody','uptime_agent_notifications','alert_team_deliveries','alert_contact_schedules','alert_recovery_matches','alert_fallback_chains','alert_routes','alert_route_changes','slow_acknowledgements','rer_mail_development_outbox']],
 ['Job reports and check-in access',['heartbeat_runs','heartbeat_claims','heartbeat_authority','heartbeat_limits']],
 ['Reports and schedules',['scheduled_reports','report_occurrences','report_recurrences']],
 ['Imported history and files',['source_history_rows','source_history_batches','source_history_cutovers','archive_history','ik_door_chunks','ik_door_uploads','ik_door_archive_chunks']],
 ['Connected services and discovery choices',['dependency_acks','followed_services','discovery_decisions']],
 ['Permissions and activity history',['failure_evidence_grants','effect_grants','agent_door_events']],
 ['Unfinished cleanup records',['cleanup_debt']],
];
function showMonitorErasureReceipt(receipt,{name,onClose}){
 const dialog=document.createElement('dialog');dialog.className='editor notification-dialog erasure-receipt monitor-erasure-receipt';dialog.setAttribute('aria-labelledby','erasure-receipt-heading');
 const heading=document.createElement('h2');heading.id='erasure-receipt-heading';heading.textContent='Erasure complete';
 const description=document.createElement('p');description.textContent=name?`“${name}” was erased.`:'The monitor was erased.';
 const scope=document.createElement('p');scope.textContent='Its saved settings, check results, incident history, and related alert and heartbeat records were removed. The anonymous audit and this receipt remain.';
 // A readable reference preserves every bit of the stored receipt ID. The
 // original receipt, including its ID and exact table counts, is never changed.
 const referenceValue='ER-'+receipt.id.replaceAll('-','').toUpperCase().match(/.{1,8}/g).join('-');
 const reference=document.createElement('p');reference.className='erasure-reference';reference.append('Receipt reference');
 const value=document.createElement('span');value.className='erasure-reference-value';value.textContent=referenceValue;reference.append(value);
 const copy=document.createElement('button');copy.textContent='Copy reference';
 const feedback=document.createElement('p');feedback.className='copy-feedback';feedback.setAttribute('role','status');
 copy.onclick=async()=>{try{await navigator.clipboard.writeText(referenceValue);if(dialog.isConnected){feedback.dataset.state='success';feedback.textContent='Receipt reference copied.'}}catch{if(dialog.isConnected){feedback.dataset.state='error';feedback.textContent='Copy could not complete. Select and copy the reference above.'}}};
 const download=document.createElement('button');download.textContent='Download receipt';
 download.onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(receipt,null,2)+'\n'],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=`uptime-erasure-${referenceValue}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),0)};
 const actions=document.createElement('div');actions.className='erasure-receipt-actions';actions.append(copy,download);
 const details=document.createElement('details');details.className='erasure-receipt-details';
 const summary=document.createElement('summary');summary.textContent='Receipt details';
 const completed=document.createElement('time');completed.dateTime=new Date(receipt.completedAt).toISOString();completed.textContent=new Date(receipt.completedAt).toLocaleString();
 const completion=document.createElement('p');completion.append('Completed ',completed,'.');
 const counts=document.createElement('dl');
 const totals=new Map();
 for(const [table,count] of Object.entries(receipt.counts)){
  const label=monitorErasureGroups.find(([,tables])=>tables.includes(table))?.[0]??'Other related records';
  totals.set(label,(totals.get(label)??0)+Number(count));
 }
 for(const [labelText,count] of [...totals].filter(([,count])=>count>0).sort((a,b)=>b[1]-a[1])){const row=document.createElement('div'),label=document.createElement('dt'),total=document.createElement('dd');row.dataset.erasureCategory='';label.textContent=labelText;total.textContent=String(count);row.append(label,total);counts.append(row)}
 const limits=document.createElement('p');limits.textContent='Downloaded backups and messages already sent are unchanged. Requests already in progress cannot be recalled.';
 details.append(summary,completion,counts,limits);
 const close=document.createElement('button');close.className='primary';close.textContent='Close receipt';close.onclick=()=>dialog.close();dialog.onclose=()=>{dialog.remove();onClose()};
 dialog.append(heading,description,scope,reference,actions,feedback,details,close);document.body.append(dialog);containModalKeyboard(dialog);dialog.showModal();heading.tabIndex=-1;heading.focus();dialog.scrollTop=0;
}

export function showErasureReceipt(receipt,{name,onClose=()=>{}}={}){
 if(receipt.entityKind==='monitor')return showMonitorErasureReceipt(receipt,{name,onClose});
 const dialog=document.createElement('dialog');dialog.className='editor notification-dialog erasure-receipt';dialog.setAttribute('aria-labelledby','erasure-receipt-heading');
 const heading=document.createElement('h2');heading.id='erasure-receipt-heading';heading.textContent='Erasure complete';
 const description=document.createElement('p'),completed=document.createElement('time');completed.dateTime=new Date(receipt.completedAt).toISOString();completed.textContent=new Date(receipt.completedAt).toLocaleString();description.append(`${receipt.entityKind} erased at `,completed,'.');
 const reference=document.createElement('p');reference.textContent=`Receipt: ${receipt.id}`;reference.style.overflowWrap='anywhere';
 const labels={notification_destinations:'Destinations',notification_credentials:'Stored credentials',notification_jobs:'Notification jobs',integration_attempts:'Delivery attempts',integration_deliveries:'Delivery records',integration_resolutions:'Delivery resolutions',integration_replays:'Replay records',notification_claim_custody:'Delivery authorizations',alert_drills:'Alert drills',archive_history:'Archived history copies',rer_mail_development_outbox:'Local development messages'};
 const totals={};for(const [table,count] of Object.entries(receipt.counts)){const label=receipt.entityKind==='monitor'?table:labels[table]??'Other dependent records';totals[label]=(totals[label]??0)+Number(count)}
 const entries=Object.entries(totals);if(receipt.entityKind==='monitor')entries.sort((a,b)=>b[1]-a[1]);
 const counts=document.createElement('dl');for(const [labelText,count] of entries){const row=document.createElement('div'),label=document.createElement('dt'),value=document.createElement('dd');if(receipt.entityKind==='monitor'){row.dataset.erasureTable=labelText;label.textContent=labelText.replaceAll('_',' ').replace(/^./,c=>c.toUpperCase())}else label.textContent=labelText;value.textContent=String(count);row.append(label,value);counts.append(row)}
 const close=document.createElement('button');close.className='primary';close.textContent='Close receipt';close.onclick=()=>dialog.close();dialog.onclose=()=>{dialog.onclose=null;dialog.remove();onClose();if(receipt.entityKind==='destination'&&!document.querySelector('dialog:modal'))document.getElementById('add-destination')?.focus({preventScroll:true})};
 dialog.append(heading,description,reference,counts);
 if(receipt.counts.oa_bootstrap){const claim=document.createElement('p');claim.textContent='The original setup claim remains closed. Its counted row was anonymised.';dialog.append(claim)}
 if(receipt.entityKind==='operator'){
  const guidance=document.createElement('p');guidance.textContent='If this was the configured owner, stop local dev and change only OWNER_EMAIL in data/local-secrets.json to an existing active owner, preserving every key and other setting. Then run rer setup --owner-email EMAIL --non-interactive with that email. Supplying a different setup email alone is refused. Hosted OWNER_EMAIL must be updated separately by the deployment owner. ';
  const help=document.createElement('a');help.href='/docs/data';help.textContent='Owner settings after erasure';guidance.append(help);dialog.append(guidance);
 }
 dialog.append(close);document.body.append(dialog);
 if(receipt.entityKind==='destination'){Object.assign(dialog.style,{position:'fixed',inset:'auto 16px 16px auto',maxWidth:'min(560px, calc(100vw - 32px))',maxHeight:'calc(100vh - 32px)',overflow:'auto',zIndex:'10'});dialog.show()}else{containModalKeyboard(dialog);dialog.showModal();if(receipt.entityKind==='monitor'){heading.tabIndex=-1;heading.focus();dialog.scrollTop=0}}
}
export function confirmErasure({kind,name,onConfirm}){
 const returnFocus=dialogFocusReturn();
 const dialog=document.createElement('dialog');dialog.className='editor notification-dialog confirmation-dialog';dialog.setAttribute('aria-labelledby','erase-heading');
 const heading=document.createElement('h2');heading.id='erase-heading';heading.textContent=`Erase ${kind}?`;
 const explanation=document.createElement('p');explanation.textContent=`This permanently erases ${name} and its dependent records. The anonymous audit remains. Requests already sent cannot be recalled.`;
 const label=document.createElement('label');label.textContent=`Type ${name} to confirm`;const input=document.createElement('input');input.autocomplete='off';label.append(input);
 const buttons=document.createElement('div');buttons.className='buttons';const cancel=document.createElement('button');cancel.textContent='Cancel';const confirm=document.createElement('button');confirm.className='primary danger';confirm.textContent=`Erase ${kind}`;confirm.disabled=true;
 input.oninput=()=>confirm.disabled=input.value!==name;cancel.onclick=()=>dialog.close();confirm.onclick=()=>{dialog.close();onConfirm(input.value)};dialog.onclose=()=>{dialog.remove();returnFocus()};buttons.append(cancel,confirm);dialog.append(heading,explanation,label,buttons);document.body.append(dialog);containModalKeyboard(dialog);dialog.showModal();input.focus();
}
