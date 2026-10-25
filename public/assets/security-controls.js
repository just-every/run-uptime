import {firstMount} from '../dom-patch.js';
const prefix='/api/access/mfa';
const decode=value=>Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
const encode=value=>btoa(String.fromCharCode(...new Uint8Array(value))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
async function passkey(api,enroll){
 const pending=await api(prefix+(enroll?'/webauthn/enroll':'/webauthn/options'),'POST',{}),options=pending.options;
 options.challenge=decode(options.challenge);
 if(enroll){options.user.id=decode(options.user.id);for(const key of options.excludeCredentials??[])key.id=decode(key.id)}else for(const key of options.allowCredentials??[])key.id=decode(key.id);
 const credential=await navigator.credentials[enroll?'create':'get']({publicKey:options});
 if(!credential)throw Error('Passkey verification was cancelled.');
 const response={clientDataJSON:encode(credential.response.clientDataJSON)};
 for(const name of ['attestationObject','authenticatorData','signature','userHandle'])if(credential.response[name])response[name]=encode(credential.response[name]);
 if(credential.response.getTransports)response.transports=credential.response.getTransports();
 return api(prefix+(enroll?'/webauthn/confirm':'/webauthn/verify'),'POST',{challengeId:pending.challengeId,credential:{id:credential.id,rawId:encode(credential.rawId),type:credential.type,response,clientExtensionResults:credential.getClientExtensionResults(),authenticatorAttachment:credential.authenticatorAttachment}});
}
export function securityControls(host,transport){
 // Factor challenges and permission refusals are recoverable within Settings.
 // The shell's general API helper treats every 403 as sign-out, so this bounded
 // console uses the same native routes with local readable errors instead.
 const api=async(path,method='GET',body)=>{const response=await fetch(path,{method,headers:{'content-type':'application/json'},cache:'no-store',...(body===undefined?{}:{body:JSON.stringify(body)})});const result=await response.json();if(!response.ok)throw Object.assign(Error(result.error??'Security action refused.'),{status:response.status,code:result.code});return result};
 if(!firstMount(host))return;
 const style=document.createElement('link');style.rel='stylesheet';style.href='/assets/security-controls.css';document.head.append(style);
 host.innerHTML='<h3>Security and keys</h3><p role="status" data-security-status></p><div data-factor-state></div><details><summary>Manage second factors</summary><div class="notification-form"><button type="button" data-enroll-totp>Enroll authenticator</button><button type="button" data-enroll-passkey>Enroll passkey</button><button type="button" data-recovery>Replace recovery codes</button></div><div data-enrollment></div><div data-factors></div></details><details><summary>Verify a second factor</summary><form data-stepup class="notification-form"><label>Authenticator or recovery code<input name="code" required autocomplete="one-time-code"></label><button>Verify code</button><button type="button" data-verify-passkey>Verify passkey</button></form></details><form data-mfa-policy class="notification-form"><label><input type="checkbox" name="required"> Require second factors for all members</label><button>Save factor policy</button></form><div data-secret-once></div><details><summary>Create a monitoring or CI key</summary><form data-key-create class="notification-form"><label>Name<input name="name" maxlength="100" required></label><label><span id="security-key-scope-label">Key scope</span><select name="scope" aria-labelledby="security-key-scope-label"><option value="monitoring:read">Monitoring read</option><option value="ci-preview">CI preview</option><option value="ci-apply">CI preview and apply</option></select></label><label><span id="security-key-resources-label">Resource selection</span><select name="mode" aria-labelledby="security-key-resources-label"><option value="selection">Selected monitors and tags</option><option value="workspace">All monitors</option></select></label><label>Monitor IDs (one per line)<textarea name="monitorIds" rows="2"></textarea></label><label>Tags (one per line)<textarea name="tags" rows="2"></textarea></label><label>CI environment<input name="environment" maxlength="100"></label><label>Expires at (local time)<input name="expiry" type="datetime-local" required></label><button>Create key</button></form></details><div data-key-list></div>';
 const status=host.querySelector('[data-security-status]'),once=host.querySelector('[data-secret-once]'),enrollment=host.querySelector('[data-enrollment]');let pendingAction=null,busy=false;
 const error=problem=>{status.textContent=problem.message||'Security action refused.'};
 const run=async action=>{if(busy)return;busy=true;try{await action()}catch(problem){error(problem)}finally{busy=false}};
 const shownOnce=(title,value)=>{once.replaceChildren();const heading=document.createElement('h4'),text=document.createElement('pre'),done=document.createElement('button');heading.textContent=title;text.textContent=Array.isArray(value)?value.join('\n'):value;done.type='button';done.textContent='I saved this';done.onclick=()=>once.replaceChildren();once.append(heading,text,done);once.scrollIntoView({block:'nearest'});done.focus()};
 const showCodes=result=>{if(result.recoveryCodes)shownOnce('Save these ten recovery codes once',result.recoveryCodes)};
 async function factorState(){
  const state=await api(prefix+'/status');if(!host.isConnected)return state;
  host.querySelector('[data-factor-state]').textContent=`Second factors: ${state.factors.length} · ${state.fresh?'Fresh verification':'Verification needed for sensitive actions'} · Require all: ${state.required?'On':'Off'}`;
  host.querySelector('[data-mfa-policy] input').checked=state.required;
  const factors=host.querySelector('[data-factors]');factors.replaceChildren();
  for(const factor of state.factors){const row=document.createElement('p'),remove=document.createElement('button');row.textContent=`${factor.kind==='totp'?'Authenticator':'Passkey'} · ${new Date(factor.createdAt).toLocaleString()} `;remove.type='button';remove.textContent='Remove factor';remove.onclick=()=>run(()=>fresh(async()=>{await api(prefix+'/factors/'+factor.id,'DELETE');status.textContent='Factor removed.';await factorState()}));row.append(remove);factors.append(row)}
  return state;
 }
 async function fresh(action){
  const state=await factorState();if(state.fresh)return action();
  pendingAction=action;status.textContent='Verify a second factor within the last five minutes';const form=host.querySelector('[data-stepup]');form.closest('details').open=true;form.elements.code.focus();
 }
 async function verified(){status.textContent='Second factor verified.';await factorState();const action=pendingAction;pendingAction=null;if(action)await action()}
 host.querySelector('[data-stepup]').onsubmit=event=>{event.preventDefault();const form=event.currentTarget;void run(async()=>{const code=form.elements.code.value;await api(prefix+(code.length===32?'/recovery/verify':'/totp/verify'),'POST',{code});form.reset();await verified()})};
 host.querySelector('[data-verify-passkey]').onclick=()=>run(async()=>{await passkey(api,false);await verified()});
 host.querySelector('[data-enroll-totp]').onclick=()=>run(async()=>{
  const state=await factorState();const begin=async()=>{const pending=await api(prefix+'/totp/enroll','POST',{});enrollment.innerHTML='<form class="notification-form"><label>Authenticator secret (shown once)<output data-totp-secret></output></label><label>Confirm authenticator code<input name="code" inputmode="numeric" autocomplete="one-time-code" required></label><button>Confirm authenticator</button></form>';enrollment.querySelector('[data-totp-secret]').textContent=pending.secret;enrollment.querySelector('input').focus();
   enrollment.querySelector('form').onsubmit=event=>{event.preventDefault();const code=event.currentTarget.elements.code.value;void run(async()=>{const result=await api(prefix+'/totp/confirm','POST',{challengeId:pending.challengeId,code});enrollment.replaceChildren();showCodes(result);status.textContent='Authenticator enrolled.';await factorState()})};
  };if(state.factors.length)await fresh(begin);else await begin();
 });
 host.querySelector('[data-enroll-passkey]').onclick=()=>run(async()=>{const state=await factorState();const enroll=async()=>{showCodes(await passkey(api,true));status.textContent='Passkey enrolled.';await factorState()};if(state.factors.length)await fresh(enroll);else await enroll()});
 host.querySelector('[data-recovery]').onclick=()=>run(()=>fresh(async()=>{showCodes(await api(prefix+'/recovery/rotate','POST',{}));status.textContent='Recovery codes replaced.'}));
 host.querySelector('[data-mfa-policy]').onsubmit=event=>{event.preventDefault();const required=event.currentTarget.elements.required.checked;void run(()=>fresh(async()=>{await api(prefix+'/policy','POST',{required});status.textContent='Factor policy saved.';await factorState()}))};
 const lines=value=>value.split('\n').map(v=>v.trim()).filter(Boolean);
 const keyForm=host.querySelector('[data-key-create]');
 keyForm.onsubmit=event=>{event.preventDefault();const v=keyForm.elements;const ci=v.scope.value!=='monitoring:read',input={name:v.name.value,scopes:ci?v.scope.value==='ci-apply'?['definitions:preview','definitions:apply']:['definitions:preview']:['monitoring:read'],expiresAt:new Date(v.expiry.value).getTime(),resources:{mode:v.mode.value,monitorIds:lines(v.monitorIds.value),tags:lines(v.tags.value)},...(ci?{environment:v.environment.value}:{})};void run(()=>fresh(async()=>{const result=await api('/api/credentials','POST',input);shownOnce('Copy this key once',result.token);status.textContent='Key created. The token cannot be read again.';await keyList()}))};
 async function keyList(){
  const list=host.querySelector('[data-key-list]');
  try{const keys=await api('/api/credentials');if(!host.isConnected)return;list.replaceChildren();
   for(const key of keys){const row=document.createElement('details'),summary=document.createElement('summary'),description=document.createElement('p');row.dataset.credentialId=key.id;summary.textContent=`${key.name} · ${key.scopes.join(', ')} · ${key.revokedAt?'Revoked':'Active'}`;description.textContent=`${key.resources.mode}; monitors: ${key.resources.monitorIds.join(', ')||'none selected'}; tags: ${key.resources.tags.join(', ')||'none selected'}${key.environment?'; environment: '+key.environment:''} · Expires ${new Date(key.expiresAt).toLocaleString()} · Last use ${key.lastUsedAt?new Date(key.lastUsedAt).toLocaleString():'Never'}`;row.append(summary,description);
    if(!key.revokedAt){const revoke=document.createElement('button');revoke.type='button';revoke.textContent='Revoke key';revoke.onclick=()=>run(async()=>{await api('/api/credentials/'+encodeURIComponent(key.id),'DELETE');status.textContent='Key revoked. Further operations are refused.';await keyList()});row.append(revoke)}
    if(key.environment){const jobs=document.createElement('button'),results=document.createElement('div');jobs.type='button';jobs.textContent='Show definition jobs';jobs.onclick=()=>run(async()=>{const records=await api('/api/credentials/'+encodeURIComponent(key.id)+'/jobs');results.replaceChildren();for(const job of records){const text=document.createElement('p');text.textContent=`Owner ${job.initiatingOwnerId} · ${job.state} · Authorized ${job.authorizedOperations}/${job.total} · Next operation: ${job.nextOperation}${job.stopReason?' · '+job.stopReason+' at '+new Date(job.stoppedAt).toLocaleString():''}`;results.append(text)}if(!records.length)results.textContent='No definition jobs.'});row.append(jobs,results)}
    list.append(row);
   }
  }catch(problem){list.textContent='Only an owner can manage monitoring and CI keys.';status.textContent=problem.message||list.textContent}
 }
 void run(async()=>{await factorState();await keyList()});
}
