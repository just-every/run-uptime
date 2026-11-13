import {escape} from './console-format.js';
import {firstMount} from './dom-patch.js';
import {confirmDestination} from './notification-dialogs.js';
import {heartbeatRuleDetails} from './heartbeat-rules.js';

// POSIX single quoting: each value reaches the command as one literal word, whatever characters a monitor id holds.
const shellQuote=value=>`'${String(value).replaceAll("'","'\\''")}'`;

// Keep the revision-scoped credential only in this one-time dialog. Polling and
// navigation must never retain it in the console's overview or history.
function showHeartbeatKey(m,result){
 let token=result.token;
 const dialog=document.createElement('dialog');dialog.className='editor notification-dialog secret-dialog heartbeat-key-dialog';dialog.setAttribute('aria-labelledby','heartbeat-key-title');
 const title=document.createElement('h2');title.id='heartbeat-key-title';title.textContent=`Heartbeat key · ${m.definition.name}`;
 const note=document.createElement('p');note.textContent=`Shown once. Save this key privately. It replaces every previous key and clears earlier receipts. Send increasing sequences starting at 1.`;
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

// A capability is shown only for this visit. The server retains its hash; a
// reload offers explicit rotation instead of recovering or persisting authority.
export function heartbeatCheckInPanel(m){
 if(m.definition.type!=='heartbeat')return '';
 return `<section class="ui-card panel heartbeat-checkin" id="heartbeat-checkin" data-owned="${escape(m.id)}:${m.revision}" aria-labelledby="heartbeat-checkin-heading"><h2 id="heartbeat-checkin-heading">Connect your job</h2>
 <p>Send a check-in after your job succeeds. If no success arrives by its deadline, a scheduled check marks it down. A start measures run duration. Only signed scheduled checks change health. A private runner must be running.</p>
 <dl class="heartbeat-details ui-dl">${heartbeatRuleDetails(m.definition.heartbeat)}</dl>
 <div id="heartbeat-checkin-secret" hidden><label>Check-in URL<input id="heartbeat-checkin-url" class="ui-mono" readonly autocomplete="off" spellcheck="false"></label><button type="button" id="copy-heartbeat-url">Copy check-in URL</button>
 <p>Add this line to the end of your job, after it succeeds:</p><pre id="heartbeat-checkin-command" tabindex="0" aria-label="Job check-in command"></pre><button type="button" id="copy-heartbeat-line">Copy command</button>
 <p>Save it privately now; the URL is shown only for this visit. Anyone with it can send repeated check-ins. It is replay-unprotected. Replacing it retires the old URL and key.</p></div>
 <button type="button" id="create-heartbeat-url">Create or replace check-in URL…</button><p id="heartbeat-checkin-status" role="status"></p><a href="/docs/heartbeat-jobs">Job heartbeat instructions</a></section>`;
}
export function bindHeartbeatCheckIn(area,m,{api,action}){
 const panel=area.querySelector('#heartbeat-checkin');if(!firstMount(panel))return;
 const secret=panel.querySelector('#heartbeat-checkin-secret'),url=panel.querySelector('#heartbeat-checkin-url'),command=panel.querySelector('#heartbeat-checkin-command'),status=panel.querySelector('#heartbeat-checkin-status');
 const clear=()=>{url.value='';command.textContent='';secret.hidden=true};
 const lifetime=new AbortController(),detached=new MutationObserver(()=>{if(!panel.isConnected){clear();lifetime.abort();detached.disconnect()}});
 detached.observe(document.body,{childList:true,subtree:true});
 window.addEventListener('pagehide',clear,{once:true,signal:lifetime.signal});window.addEventListener('uptime:auth-lost',clear,{once:true,signal:lifetime.signal});
 for(const [id,value] of [['copy-heartbeat-url',()=>url.value],['copy-heartbeat-line',()=>command.textContent]])panel.querySelector('#'+id).onclick=async()=>{try{await navigator.clipboard.writeText(value());status.textContent='Copied. Save it privately.'}catch{status.textContent='Select and copy the text above.'}};
 const issue=()=>action(async()=>{
  try{
   const result=await api(`/api/monitors/${encodeURIComponent(m.id)}/heartbeat-key`,'POST',{});
   if(panel.isConnected){
    clear();panel.dataset.owned=`${m.id}:${result.revision}`;
    url.value=new URL(result.capabilityPath,location.origin).href;command.textContent=`curl -fsS ${shellQuote(url.value)}`;secret.hidden=false;status.textContent='Check-in URL ready. Copy it before leaving this page.';
   }
   // Neither form of raw authority is retained beyond the rendered capability.
   result.token='';result.urlToken='';result.capabilityPath='';result.snippets=[];
  }catch(error){status.textContent=error.message;throw error}
 },{pending:'Creating check-in URL…',success:'Check-in URL ready. Save it privately.'});
 panel.querySelector('#create-heartbeat-url').onclick=()=>confirmDestination({title:'Replace the check-in URL?',explanation:'The previous URL and key stop working immediately. Save the new URL in your job. Scheduled checks need a new success before they can pass.',button:'Create check-in URL',onConfirm:issue});
 if(sessionStorage.getItem('uptime-heartbeat-created')===m.id){sessionStorage.removeItem('uptime-heartbeat-created');queueMicrotask(issue)}
}
