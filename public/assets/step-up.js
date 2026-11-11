import {securityRequest,passkey} from './security-controls.js';
import {authenticatorEnrollment} from './authenticator-enrollment.js';
import {containModalKeyboard} from '../notification-dialogs.js';
export const needsStepUp=result=>['fresh_second_factor_required','second_factor_required'].includes(result.code);
// Only a server refusal opens this flow. The caller retains its original request,
// and retries it once after real verification; the server rechecks every rule.
export async function recoverStepUp(refusal){
 if(!document.querySelector('link[href="/assets/security-controls.css"]')){const style=document.createElement('link');style.rel='stylesheet';style.href='/assets/security-controls.css';document.head.append(style)}
 const state=await securityRequest('/api/access/mfa/status'),guidance=refusal.stepUp??state.stepUp;
 const opener=document.activeElement,dialog=document.createElement('dialog');dialog.className='editor notification-dialog stepup-dialog';dialog.dataset.stepupDialog='';
 dialog.innerHTML='<h2 id="stepup-heading">Verify to continue</h2><p data-stepup-guidance></p><div data-stepup-controls></div><p role="status" data-stepup-status></p><div class="buttons"><button type="button" class="secondary" data-stepup-cancel>Cancel</button></div>';
 dialog.setAttribute('aria-labelledby','stepup-heading');const controls=dialog.querySelector('[data-stepup-controls]'),status=dialog.querySelector('[data-stepup-status]');dialog.querySelector('[data-stepup-guidance]').textContent=guidance.message;
 let busy=false,finished=false;
 return new Promise((resolve,reject)=>{
  const finish=()=>{finished=true;dialog.close();resolve()};
  dialog.addEventListener('close',()=>{dialog.replaceChildren();dialog.remove();if(opener?.isConnected)opener.focus();if(!finished)reject(Object.assign(Error('Verification cancelled. Your entries are still here.'),{readable:true}))},{once:true});
  const run=async action=>{if(busy)return;busy=true;status.textContent='';try{await action()}catch(problem){status.textContent=problem.readable?problem.message:'This could not finish. Try again.'}finally{busy=false}};
  const enrolled=result=>{
   controls.replaceChildren();
   if(!result.recoveryCodes){finish();return}
   const heading=document.createElement('h3'),codes=document.createElement('pre'),saved=document.createElement('button');heading.textContent='Save these ten recovery codes once';codes.textContent=result.recoveryCodes.join('\n');codes.dataset.recoveryCodes='';saved.type='button';saved.textContent='I saved this';saved.onclick=finish;controls.append(heading,codes,saved);saved.focus();
  };
  const enroll=()=>run(async()=>{const pending=await securityRequest('/api/access/mfa/totp/enroll','POST',{}),form=authenticatorEnrollment(controls,pending);form.onsubmit=event=>{event.preventDefault();void run(async()=>enrolled(await securityRequest('/api/access/mfa/totp/confirm','POST',{challengeId:pending.challengeId,code:form.elements.code.value.replace(/\s+/g,'')})))}});
  if(!state.factors.length){
   const link=document.createElement('a');link.href=guidance.enrollmentUrl;link.textContent='Add an authenticator';link.onclick=event=>{if(event.button||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();void enroll()};controls.append(link);
   if(state.passkeysAvailable){const button=document.createElement('button');button.type='button';button.textContent='Enroll passkey';button.onclick=()=>run(async()=>enrolled(await passkey(securityRequest,true)));controls.append(button)}
  }else{
   controls.innerHTML='<form class="notification-form" data-stepup><label>Authenticator or recovery code<input name="code" required autocomplete="one-time-code"></label><button>Verify code</button></form>';
   const form=controls.querySelector('form');form.onsubmit=event=>{event.preventDefault();void run(async()=>{const code=form.elements.code.value.replace(/\s+/g,'');await securityRequest('/api/access/mfa'+(code.length===32?'/recovery/verify':'/totp/verify'),'POST',{code});finish()})};
   if(state.passkeysAvailable&&state.factors.some(f=>f.kind==='webauthn')){const button=document.createElement('button');button.type='button';button.textContent='Verify passkey';button.onclick=()=>run(async()=>{await passkey(securityRequest,false);finish()});form.append(button)}
  }
  dialog.querySelector('[data-stepup-cancel]').onclick=()=>dialog.close();document.body.append(dialog);containModalKeyboard(dialog);dialog.showModal();(dialog.querySelector('input')??controls.querySelector('a,button'))?.focus();
 });
}
