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
