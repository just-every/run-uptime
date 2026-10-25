const reasons={
 invalid_factor_response:"That code didn't match. Use the newest code from your app.",
 fresh_second_factor_required:'Verify a second factor within the last five minutes',
 second_factor_required:'Verify a second factor to continue.',
 webauthn_requires_https_or_localhost:'Passkeys need a secure address.',
 no_passkey_enrolled:'Enroll a passkey before verifying with it.',
 factor_limit:'Remove a passkey before adding another.',
 factor_already_enrolled:'An authenticator is already enrolled.',
 factor_not_found:'This factor is no longer available. Refresh and try again.',
 owner_policy_required:'Only the owner manages the factor policy.',
 owner_reset_other_member_required:'Only the owner can reset another member.',
 member_not_found:'This member is no longer available.',
 required_boolean:'Choose whether second factors are required.',
 mfa_rate_limited:'Too many attempts. Wait ten minutes and try again.',
 mfa_authority_changed:'Your access changed. Refresh and try again.',
 session_required:'Sign in again to continue.',
 same_origin_required:'Refresh this page before trying again.',
 unexpected_query:'Refresh this page before trying again.',
 json_required:'Refresh this page before trying again.',
 payload_too_large:'This request is too large. Reduce the selection.',
 invalid_json:'Refresh this page before trying again.',
 invalid_factor_fields:'Check the factor details and try again.',
 not_found:'This item is no longer available.'
};
const keyReasons={
 'Another administrator must change your product assignment':'Another administrator must change your product assignment',
 'Choose a product role':'Choose a role for this member.',
 'Use distinct service/team scopes, at most 30':'Choose up to 30 distinct service and team scopes.',
 'Owners retain workspace authority':'Owners need access to the whole workspace.',
 'Email and display name required':'Enter the member’s name and email.',
 'Operator not found':'This member is no longer available.',
 'Provide a future expiry within 366 days':'Choose a future expiry within the next 366 days.',
 'Provide a printable credential name':'Enter a name for this key.',
 'CI credentials require one explicit environment':'Enter the CI environment.',
 'CI credentials require selected tags and no monitor IDs':'Select at least one tag for this CI key.',
 'Monitor not found':'A selected monitor is no longer available.',
 'Key not found':'This key is no longer available.',
 'Choose workspace or explicit selection resources':'Choose which monitors this key can use.',
 'Use distinct bounded monitor IDs and tags':'Choose distinct monitors and tags.',
 'Workspace resources cannot also name selections':'Choose all monitors or a selection.',
 'Choose monitoring:read or definitions:preview with optional definitions:apply':'Choose a key scope.'
};
function securityReason(result,status){return reasons[result.code]??keyReasons[result.error]??(status===401?'Sign in again to continue.':status===403?'Only the owner manages keys and factor policy.':status===429?'Too many requests. Wait and try again.':'This action could not finish. Check the values and try again.')}
export async function securityRequest(path,method='GET',body){
 const response=await fetch(path,{method,headers:{'content-type':'application/json'},cache:'no-store',...(body===undefined?{}:{body:JSON.stringify(body)})});
 const result=await response.json();if(!response.ok)throw Object.assign(Error(securityReason(result,response.status)),{status:response.status,code:result.code});return result;
}
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
 const api=securityRequest;
 if(!firstMount(host))return;
 const style=document.createElement('link');style.rel='stylesheet';style.href='/assets/security-controls.css';document.head.append(style);
 host.innerHTML='<h3>Security and keys</h3><p role="status" data-security-status></p><div data-factor-state></div><p data-passkey-unavailable hidden>Passkeys need a secure address.</p><details><summary>Manage second factors</summary><div class="notification-form"><button type="button" data-enroll-totp>Enroll authenticator</button><button type="button" data-enroll-passkey>Enroll passkey</button><button type="button" data-recovery>Replace recovery codes</button></div><div data-enrollment></div><div data-factors></div></details><details><summary>Verify a second factor</summary><form data-stepup class="notification-form"><label>Authenticator or recovery code<input name="code" required autocomplete="one-time-code"></label><button>Verify code</button><button type="button" data-verify-passkey>Verify passkey</button></form></details><form data-mfa-policy class="notification-form"><label><input type="checkbox" name="required"> Require second factors for all members</label><button>Save factor policy</button></form><div data-secret-once></div><details><summary>Create a monitoring or CI key</summary><form data-key-create class="notification-form"><label>Name<input name="name" maxlength="100" required></label><label><span id="security-key-scope-label">Key scope</span><select name="scope" aria-labelledby="security-key-scope-label"><option value="monitoring:read">Monitoring read</option><option value="ci-preview">CI preview</option><option value="ci-apply">CI preview and apply</option></select></label><label><span id="security-key-resources-label">Resource selection</span><select name="mode" aria-labelledby="security-key-resources-label"><option value="selection">Selected monitors and tags</option><option value="workspace">All monitors</option></select></label><label data-monitor-selection><span id="security-monitor-label">Monitors</span><select multiple name="monitorIds" aria-labelledby="security-monitor-label"></select></label><label data-tag-selection>Tags (one per line)<textarea name="tags" rows="2"></textarea></label><label data-ci-environment>CI environment<input name="environment" maxlength="100"></label><label>Expires at (local time)<input name="expiry" type="datetime-local" required></label><button>Create key</button></form></details><div data-key-list></div>';
 const status=host.querySelector('[data-security-status]'),once=host.querySelector('[data-secret-once]'),enrollment=host.querySelector('[data-enrollment]');let pendingAction=null,busy=false,owner=false,monitors=[];
 const place=control=>{const target=control?.closest('form')??control?.parentElement??host;target.append(status);status.textContent=''};
 host.addEventListener('click',event=>{const button=event.target.closest('button');if(button)place(button)},true);
 host.addEventListener('submit',event=>place(event.target.querySelector('button')),true);
 const outcome=text=>{status.textContent=text;status.scrollIntoView({block:'nearest'})};
 const error=problem=>{outcome(problem.message||'This action could not finish. Try again.')};
 const run=async action=>{if(busy)return;busy=true;try{await action()}catch(problem){error(problem)}finally{busy=false}};
 const shownOnce=(title,value)=>{once.replaceChildren();const heading=document.createElement('h4'),text=document.createElement('pre'),done=document.createElement('button');heading.textContent=title;text.textContent=Array.isArray(value)?value.join('\n'):value;done.type='button';done.textContent='I saved this';done.onclick=()=>once.replaceChildren();once.append(heading,text,done);once.scrollIntoView({block:'nearest'});done.focus()};
 const showCodes=result=>{if(result.recoveryCodes)shownOnce('Save these ten recovery codes once',result.recoveryCodes)};
 async function factorState(){
  const state=await api(prefix+'/status');if(!host.isConnected)return state;
  host.querySelector('[data-factor-state]').textContent=`Second factors: ${state.factors.length} · ${state.fresh?'Fresh verification':'Verification needed for sensitive actions'} · Require all: ${state.required?'On':'Off'}`;
  owner=state.owner;
  host.querySelector('[data-mfa-policy]').hidden=!owner;
  host.querySelector('[data-key-create]').closest('details').hidden=!owner;
  host.querySelector('[data-mfa-policy] input').checked=state.required;
  host.querySelector('[data-enroll-passkey]').hidden=!state.passkeysAvailable;
  host.querySelector('[data-passkey-unavailable]').hidden=state.passkeysAvailable;
  host.querySelector('[data-recovery]').hidden=!state.factors.length;
  host.querySelector('[data-stepup]').closest('details').hidden=!state.factors.length;
  host.querySelector('[data-verify-passkey]').hidden=!state.passkeysAvailable||!state.factors.some(f=>f.kind==='webauthn');
  const factors=host.querySelector('[data-factors]');if(factors.contains(status))factors.before(status);factors.replaceChildren();
  for(const factor of state.factors){const row=document.createElement('p'),remove=document.createElement('button');row.textContent=`${factor.kind==='totp'?'Authenticator':'Passkey'} · ${new Date(factor.createdAt).toLocaleString()} `;remove.type='button';remove.textContent='Remove factor';remove.onclick=()=>run(()=>fresh(async()=>{await api(prefix+'/factors/'+factor.id,'DELETE');status.textContent='Factor removed.';await factorState()}));row.append(remove);factors.append(row)}
  return state;
 }
 async function fresh(action){
  const state=await factorState();if(state.fresh)return action();
  const target=status.parentElement;pendingAction=async()=>{if(target?.isConnected)target.append(status);await action()};
  if(!state.factors.length){outcome('Enroll an authenticator before continuing.');const button=host.querySelector('[data-enroll-totp]');button.closest('details').open=true;button.focus();return}
  outcome('Verify a second factor within the last five minutes');const form=host.querySelector('[data-stepup]');form.closest('details').open=true;form.elements.code.focus();
 }
 async function verified(){status.textContent='Second factor verified.';await factorState();const action=pendingAction;pendingAction=null;if(action){await action();host.querySelector('[data-stepup]').closest('details').open=false}}
 host.querySelector('[data-stepup]').onsubmit=event=>{event.preventDefault();const form=event.currentTarget;void run(async()=>{const code=form.elements.code.value;await api(prefix+(code.length===32?'/recovery/verify':'/totp/verify'),'POST',{code});form.reset();await verified()})};
 host.querySelector('[data-verify-passkey]').onclick=()=>run(async()=>{await passkey(api,false);await verified()});
 host.querySelector('[data-enroll-totp]').onclick=()=>run(async()=>{
  const state=await factorState();const begin=async()=>{const pending=await api(prefix+'/totp/enroll','POST',{});enrollment.innerHTML='<form class="notification-form"><label>Authenticator secret (shown once)<output data-totp-secret></output></label><label>Confirm authenticator code<input name="code" inputmode="numeric" autocomplete="one-time-code" required></label><button>Confirm authenticator</button></form>';enrollment.querySelector('[data-totp-secret]').textContent=pending.secret;enrollment.querySelector('input').focus();
   enrollment.querySelector('form').onsubmit=event=>{event.preventDefault();const code=event.currentTarget.elements.code.value;void run(async()=>{const result=await api(prefix+'/totp/confirm','POST',{challengeId:pending.challengeId,code});enrollment.replaceChildren();enrollment.append(status);showCodes(result);status.textContent='Authenticator enrolled.';await factorState();if(pendingAction)await verified()})};
  };if(state.factors.length)await fresh(begin);else await begin();
 });
 host.querySelector('[data-enroll-passkey]').onclick=()=>run(async()=>{const state=await factorState();const enroll=async()=>{showCodes(await passkey(api,true));status.textContent='Passkey enrolled.';await factorState()};if(state.factors.length)await fresh(enroll);else await enroll()});
 host.querySelector('[data-recovery]').onclick=()=>run(()=>fresh(async()=>{showCodes(await api(prefix+'/recovery/rotate','POST',{}));status.textContent='Recovery codes replaced.'}));
 host.querySelector('[data-mfa-policy]').onsubmit=event=>{event.preventDefault();const required=event.currentTarget.elements.required.checked;void run(()=>fresh(async()=>{await api(prefix+'/policy','POST',{required});status.textContent='Factor policy saved.';await factorState()}))};
 const lines=value=>value.split('\n').map(v=>v.trim()).filter(Boolean);
 const keyForm=host.querySelector('[data-key-create]');
 const scopeLabel=scopes=>scopes.includes('monitoring:read')?'Monitoring read':scopes.includes('definitions:apply')?'CI preview and apply':'CI preview';
 const fields=()=>{const ci=keyForm.elements.scope.value!=='monitoring:read';if(ci)keyForm.elements.mode.value='selection';keyForm.elements.mode.disabled=ci;const selected=keyForm.elements.mode.value==='selection';host.querySelector('[data-monitor-selection]').hidden=ci||!selected;host.querySelector('[data-tag-selection]').hidden=!ci||!selected;host.querySelector('[data-ci-environment]').hidden=!ci};
 keyForm.elements.scope.onchange=fields;keyForm.elements.mode.onchange=fields;fields();
 keyForm.onsubmit=event=>{event.preventDefault();const v=keyForm.elements;const ci=v.scope.value!=='monitoring:read',input={name:v.name.value,scopes:ci?v.scope.value==='ci-apply'?['definitions:preview','definitions:apply']:['definitions:preview']:['monitoring:read'],expiresAt:new Date(v.expiry.value).getTime(),resources:{mode:v.mode.value,monitorIds:ci||v.mode.value==='workspace'?[]:Array.from(v.monitorIds.selectedOptions,o=>o.value),tags:v.mode.value==='workspace'?[]:ci?lines(v.tags.value):[]},...(ci?{environment:v.environment.value}:{})};void run(()=>fresh(async()=>{const result=await api('/api/credentials','POST',input);shownOnce('Copy this key once',result.token);status.textContent='Key created. The token cannot be read again.';await keyList()}))};
 async function keyList(){
  const list=host.querySelector('[data-key-list]');
  try{if(!owner){list.textContent='Only the owner manages keys.';return}const keys=await api('/api/credentials');if(!host.isConnected)return;list.replaceChildren();
   for(const key of keys){const row=document.createElement('details'),summary=document.createElement('summary'),description=document.createElement('p');row.dataset.credentialId=key.id;summary.textContent=`${key.name} · ${scopeLabel(key.scopes)} · ${key.revokedAt?'Revoked':'Active'}`;description.textContent=`${key.resources.mode==='workspace'?'All monitors':[...key.resources.monitorIds.map(id=>monitors.find(m=>m.id===id)?.definition.name??'Unavailable monitor'),...key.resources.tags.map(tag=>'Tag '+tag)].join(', ')||'No monitors'}${key.environment?' · Environment '+key.environment:''} · Expires ${new Date(key.expiresAt).toLocaleString()} · Last use ${key.lastUsedAt?new Date(key.lastUsedAt).toLocaleString():'Never'}`;row.append(summary,description);
    if(!key.revokedAt){const revoke=document.createElement('button');revoke.type='button';revoke.textContent='Revoke key';revoke.onclick=()=>run(()=>fresh(async()=>{await api('/api/credentials/'+encodeURIComponent(key.id),'DELETE');await keyList();host.querySelector(`[data-credential-id="${key.id}"]`)?.after(status);outcome('Key revoked. Further operations are refused.')}));row.append(revoke)}
    if(key.environment){const jobs=document.createElement('button'),results=document.createElement('div');jobs.type='button';jobs.textContent='Show definition jobs';jobs.onclick=()=>run(async()=>{const records=await api('/api/credentials/'+encodeURIComponent(key.id)+'/jobs');results.replaceChildren();for(const job of records){const text=document.createElement('p');text.textContent=`Started by ${job.initiatingOwnerName??'Former member'} · ${job.authorizedOperations} of ${job.total} applied · ${job.stopReason==='credential_revoked'?'Stopped when the key was revoked at '+new Date(job.stoppedAt).toLocaleString()+': the rest refused':({completed:'Complete',failed:'Stopped because definitions could not be applied',queued:'Waiting to apply',applying:'In progress',undoing:'Undoing changes',undone:'Changes undone',rolling_back:'Undoing applied changes',rolled_back:'Applied changes undone',stopped:'Stopped; further operations refused'}[job.state]??'Job status unavailable')}`;results.append(text)}if(!records.length)results.textContent='No definition jobs.'});row.append(jobs,results)}
    list.append(row);
   }
  }catch(problem){list.textContent=problem.message}
 }
 void run(async()=>{await factorState();if(owner){monitors=(await api('/api/overview')).monitors;for(const monitor of monitors){const option=document.createElement('option');option.value=monitor.id;option.textContent=monitor.definition.name;keyForm.elements.monitorIds.append(option)}}await keyList()});
 return {request:async(path,method,body)=>{try{return await api(path,method,body)}catch(problem){if(!['fresh_second_factor_required','second_factor_required'].includes(problem.code))throw problem;return new Promise((resolve,reject)=>{void fresh(async()=>{try{resolve(await api(path,method,body))}catch(error){reject(error)}}).catch(reject)})}}};
}
