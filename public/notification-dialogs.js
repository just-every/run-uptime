// One-time credentials stay in this dialog only, and are erased on every exit.
export const verificationHelp=`<details class="verification-help"><summary>How to verify a signed request</summary><p>Use the signing secret as literal UTF-8 text; do not hex-decode it. Read <code>x-lamp-timestamp</code> and <code>x-lamp-signature</code>.</p><p>Reject timestamps more than five minutes from the current time. The timestamp is ISO 8601 UTC, ending in .000Z. Compute HMAC-SHA256 over the exact UTF-8 timestamp, a dot, and the exact request body bytes. Compare its unprefixed, unpadded base64url signature with the signature header using a constant-time comparison.</p><p>Receivers using the <code>webhook-*</code> headers should follow their matching verification scheme. <code>incidentKey</code> identifies an incident, <code>title</code> names it, and <code>state</code> is firing or recovered. Test requests use a separate test identity.</p></details>`;
export function confirmDestination({title,explanation,button,tone,onConfirm}){
 const dialog=document.createElement('dialog');dialog.className='editor notification-dialog confirmation-dialog';
 const heading=document.createElement('h2');heading.id='confirmation-heading';heading.textContent=title;dialog.setAttribute('aria-labelledby',heading.id);
 const text=document.createElement('p');text.textContent=explanation;
 const buttons=document.createElement('div');buttons.className='buttons';
 const cancel=document.createElement('button');cancel.className='secondary';cancel.textContent='Cancel';
 const confirm=document.createElement('button');confirm.className=tone==='danger'?'primary danger':'primary';confirm.textContent=button;
 const mark=document.createElement('span');mark.className='dialog-mark'+(tone==='danger'?' danger':'');mark.setAttribute('aria-hidden','true');mark.innerHTML=`<span class="ui-icon" data-icon="${tone==='danger'?'alert':'restore'}"></span>`;
 const close=()=>{dialog.close();dialog.remove()};cancel.onclick=close;dialog.oncancel=()=>dialog.remove();
 confirm.onclick=()=>{close();onConfirm()};buttons.append(cancel,confirm);dialog.append(mark,heading,text,buttons);document.body.append(dialog);dialog.showModal();cancel.focus();
}
export function showSecret(secret,destinationName){
 const dialog=document.createElement('dialog');dialog.className='editor notification-dialog secret-dialog';
 const title=document.createElement('h2');title.id='secret-heading';title.textContent=`Save the signing secret for ${destinationName}`;dialog.setAttribute('aria-labelledby',title.id);
 const explanation=document.createElement('p');explanation.textContent='This secret is shown once. Save it in your receiver now; it cannot be retrieved after closing. Use it as literal UTF-8 text.';
 const code=document.createElement('code');code.className='one-time-secret';code.textContent=secret;
 const copy=document.createElement('button');copy.className='copy-secret';copy.innerHTML='<span class="ui-icon" data-icon="copy" aria-hidden="true"></span>Copy signing secret';
 const status=document.createElement('p');status.className='copy-feedback';status.setAttribute('role','status');
 copy.onclick=async()=>{try{await navigator.clipboard.writeText(secret);if(dialog.isConnected){status.dataset.state='success';status.textContent='Copied — save it in your receiver.'}}catch{if(dialog.isConnected){status.dataset.state='error';status.textContent='Copy could not complete. Select and copy the secret above.'}}};
 const help=document.createElement('div');help.innerHTML=verificationHelp;
 const close=document.createElement('button');close.className='primary secret-close';close.textContent='I saved it — close';
 const clear=()=>{code.textContent='';secret='';status.textContent='';copy.onclick=null;dialog.remove()};close.onclick=()=>{dialog.close();clear()};dialog.oncancel=clear;dialog.onclose=clear;
 dialog.append(title,explanation,code,copy,status,help,close);document.body.append(dialog);dialog.showModal();
}

export function showErasureReceipt(receipt,{onClose=()=>{}}={}){
 const dialog=document.createElement('dialog');dialog.className='editor notification-dialog erasure-receipt';dialog.setAttribute('aria-labelledby','erasure-receipt-heading');
 const heading=document.createElement('h2');heading.id='erasure-receipt-heading';heading.textContent='Erasure complete';
 const description=document.createElement('p');description.textContent=`${receipt.entityKind} erased at ${new Date(receipt.completedAt).toLocaleString()}.`;
 const reference=document.createElement('p');reference.textContent=`Receipt: ${receipt.id}`;reference.style.overflowWrap='anywhere';
 const counts=document.createElement('dl');for(const [table,count] of Object.entries(receipt.counts)){const row=document.createElement('div'),label=document.createElement('dt'),value=document.createElement('dd');label.textContent=table;value.textContent=String(count);row.append(label,value);counts.append(row)}
 const close=document.createElement('button');close.className='primary';close.textContent='Close receipt';close.onclick=()=>dialog.close();dialog.onclose=()=>{dialog.onclose=null;dialog.remove();onClose()};
 dialog.append(heading,description,reference,counts);
 if(receipt.counts.oa_bootstrap){const claim=document.createElement('p');claim.textContent='The original setup claim remains closed. Its counted row was anonymised.';dialog.append(claim)}
 if(receipt.entityKind==='operator'){
  const guidance=document.createElement('p');guidance.textContent='If this was the configured owner, stop local dev and change only OWNER_EMAIL in data/local-secrets.json to an existing active owner, preserving every key and other setting. Then run rer setup --owner-email EMAIL --non-interactive with that email. Supplying a different setup email alone is refused. Hosted OWNER_EMAIL must be updated separately by the deployment owner. ';
  const help=document.createElement('a');help.href='/docs/data';help.textContent='Owner settings after erasure';guidance.append(help);dialog.append(guidance);
 }
 dialog.append(close);document.body.append(dialog);dialog.showModal();
}
export function confirmErasure({kind,name,onConfirm}){
 const dialog=document.createElement('dialog');dialog.className='editor notification-dialog confirmation-dialog';dialog.setAttribute('aria-labelledby','erase-heading');
 const heading=document.createElement('h2');heading.id='erase-heading';heading.textContent=`Erase ${kind}?`;
 const explanation=document.createElement('p');explanation.textContent=`This permanently erases ${name} and its dependent records. The anonymous audit remains. Requests already sent cannot be recalled.`;
 const label=document.createElement('label');label.textContent=`Type ${name} to confirm`;const input=document.createElement('input');input.autocomplete='off';label.append(input);
 const buttons=document.createElement('div');buttons.className='buttons';const cancel=document.createElement('button');cancel.textContent='Cancel';const confirm=document.createElement('button');confirm.className='primary danger';confirm.textContent=`Erase ${kind}`;confirm.disabled=true;
 input.oninput=()=>confirm.disabled=input.value!==name;cancel.onclick=()=>dialog.close();confirm.onclick=()=>{dialog.close();onConfirm(input.value)};dialog.onclose=()=>dialog.remove();buttons.append(cancel,confirm);dialog.append(heading,explanation,label,buttons);document.body.append(dialog);dialog.showModal();input.focus();
}
