import {confirmDestination} from './notification-dialogs.js';

// Keep the revision-scoped credential only in this one-time dialog. Polling and
// navigation must never retain it in the console's overview or history.
function showHeartbeatKey(m,result){
 let token=result.token;
 const dialog=document.createElement('dialog');dialog.className='editor notification-dialog secret-dialog heartbeat-key-dialog';dialog.setAttribute('aria-labelledby','heartbeat-key-title');
 const title=document.createElement('h2');title.id='heartbeat-key-title';title.textContent=`Heartbeat key · ${m.definition.name}`;
 const note=document.createElement('p');note.textContent=`Shown once. Save this key privately. It replaces every previous key and starts revision ${result.revision}; send increasing sequences starting at 1.`;
 const label=document.createElement('p');label.textContent='Heartbeat key';
 const key=document.createElement('code');key.className='one-time-secret';key.textContent=token;
 const command=document.createElement('pre');command.className='one-time-secret';
 command.textContent=`curl -X POST '${location.origin}${result.receiptPath}' \\\n  -H 'Content-Type: application/json' \\\n  -H 'Authorization: Bearer ${token}' \\\n  -H 'X-Heartbeat-Sequence: 1' --data '{}'`;
 const hint=document.createElement('p');hint.textContent='Run this command from your job, increasing X-Heartbeat-Sequence each time. A scheduled check evaluates receipts; receipt ingestion alone does not change health.';
 const copy=document.createElement('button');copy.textContent='Copy heartbeat command';
 const status=document.createElement('p');status.setAttribute('role','status');
 copy.onclick=async()=>{try{await navigator.clipboard.writeText(command.textContent);status.textContent='Copied. Save the command privately.'}catch{status.textContent='Select and copy the command above.'}};
 const close=document.createElement('button');close.className='primary';close.textContent='I saved it — close';close.onclick=()=>dialog.close();
 const clear=()=>{token='';key.textContent='';command.textContent='';copy.onclick=null};
 dialog.oncancel=clear;dialog.onclose=()=>{clear();dialog.remove();document.getElementById('issue-heartbeat-key')?.focus()};
 window.addEventListener('pagehide',clear,{once:true});window.addEventListener('uptime:auth-lost',()=>{clear();dialog.remove()},{once:true});
 dialog.append(title,note,label,key,command,hint,copy,status,close);document.body.append(dialog);dialog.showModal();
}
export function bindHeartbeatKey(area,m,{api,action}){
 const button=area.querySelector('#issue-heartbeat-key');if(!button)return;
 button.onclick=()=>confirmDestination({title:'Issue a new heartbeat key?',explanation:'The previous key stops working immediately. Existing receipts are cleared and scheduled checks need new receipts before they can pass.',button:'Issue key',onConfirm:()=>action(()=>api(`/api/monitors/${encodeURIComponent(m.id)}/heartbeat-key`,'POST',{}),{pending:'Issuing heartbeat key…',success:'Heartbeat key issued. Save it before closing.',onSuccess:result=>showHeartbeatKey(m,result)})});
}
