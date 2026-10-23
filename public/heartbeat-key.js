import {confirmDestination} from './notification-dialogs.js';

// POSIX single quoting: each value reaches the command as one literal word, whatever characters a monitor id holds.
const shellQuote=value=>`'${String(value).replaceAll("'","'\\''")}'`;

// Keep the revision-scoped credential only in this one-time dialog. Polling and
// navigation must never retain it in the console's overview or history.
function showHeartbeatKey(m,result){
 let token=result.token;
 const dialog=document.createElement('dialog');dialog.className='editor notification-dialog secret-dialog heartbeat-key-dialog';dialog.setAttribute('aria-labelledby','heartbeat-key-title');
 const title=document.createElement('h2');title.id='heartbeat-key-title';title.textContent=`Heartbeat key · ${m.definition.name}`;
 const note=document.createElement('p');note.textContent=`Shown once. Save this key privately. It replaces every previous key and starts revision ${result.revision}; send increasing sequences starting at 1.`;
 const label=document.createElement('p');label.textContent='Heartbeat key';
 const key=document.createElement('code');key.className='one-time-secret';key.textContent=token;
 const command=document.createElement('pre');command.className='one-time-secret';command.tabIndex=0;command.setAttribute('aria-label','Heartbeat command');
 command.textContent=`curl -X POST ${shellQuote(location.origin+result.receiptPath)} \\\n  -H 'Content-Type: application/json' \\\n  -H ${shellQuote(`Authorization: Bearer ${token}`)} \\\n  -H 'X-Heartbeat-Sequence: 1' --data '{}'`;
 const choice=document.createElement('select');choice.setAttribute('aria-label','Heartbeat command or scheduler');
 let original=command.textContent,snippets=result.snippets??[];choice.add(new Option('Sequence-protected curl', 'header'));for(const snippet of snippets)choice.add(new Option(snippet.name,snippet.id));
 const guidance=document.createElement('p');choice.onchange=()=>{const snippet=snippets.find(s=>s.id===choice.value);command.textContent=snippet?.code??original;guidance.textContent=snippet?'Replay-unprotected URL capability. '+snippet.instructions:'';hint.textContent=snippet?'This wrapper uses its private URL capability and needs no sequence header. Scheduled evaluation determines health.':headerHint};
 const warning=document.createElement('p');warning.textContent='The scheduler examples use a separate URL capability, shown once and stored hashed. It is replay-unprotected; keep the URL private. Rotating this key retires both forms. Examples run a harmless sample command; replace it with your job.';
 const hint=document.createElement('p'),headerHint='Run this command from your job, increasing X-Heartbeat-Sequence each time. A scheduled check evaluates receipts; receipt ingestion alone does not change health.';hint.textContent=headerHint;
 const copy=document.createElement('button');copy.textContent='Copy heartbeat command';
 const status=document.createElement('p');status.setAttribute('role','status');
 copy.onclick=async()=>{try{await navigator.clipboard.writeText(command.textContent);status.textContent='Copied. Save the command privately.'}catch{status.textContent='Select and copy the command above.'}};
 const close=document.createElement('button');close.className='primary';close.textContent='I saved it — close';close.onclick=()=>dialog.close();
 const clear=()=>{token='';original='';key.textContent='';command.textContent='';copy.onclick=null;choice.onchange=null;snippets.forEach(s=>s.code='');result.token='';result.urlToken='';result.capabilityPath='';result.snippets=[]};
 dialog.oncancel=clear;dialog.onclose=()=>{clear();dialog.remove();document.getElementById('issue-heartbeat-key')?.focus()};
 window.addEventListener('pagehide',clear,{once:true});window.addEventListener('uptime:auth-lost',()=>{clear();dialog.remove()},{once:true});
 dialog.append(title,note,label,key,warning,choice,command,guidance,hint,copy,status,close);document.body.append(dialog);dialog.showModal();
}
export function bindHeartbeatKey(area,m,{api,action}){
 const button=area.querySelector('#issue-heartbeat-key');if(!button)return;
 button.onclick=()=>confirmDestination({title:'Issue a new heartbeat key?',explanation:'The previous key stops working immediately. Existing receipts are cleared and scheduled checks need new receipts before they can pass.',button:'Issue key',onConfirm:()=>action(()=>api(`/api/monitors/${encodeURIComponent(m.id)}/heartbeat-key`,'POST',{}),{pending:'Issuing heartbeat key…',success:'Heartbeat key issued. Save it before closing.',onSuccess:result=>showHeartbeatKey(m,result)})});
}
