// The second-factor step of an owner's sign-in (src/domain/mfa/signin-document.server.ts). It verifies through the same
// factor door and readable refusals as Settings › People › Security and keys, then reloads the address the owner opened,
// which the console gate now admits.
import {securityRequest,passkey} from './security-controls.js';
const prefix='/api/access/mfa';
const step=document.querySelector('[data-factor-step]'),form=step.querySelector('[data-factor-form]'),status=step.querySelector('[data-factor-status]'),usePasskey=step.querySelector('[data-factor-passkey]');
let busy=false;
const run=async action=>{
 if(busy)return;busy=true;status.textContent='';
 try{await action()}catch(problem){
  // A session that ended meanwhile reloads into the sign-in the gate sends it to.
  if(problem.status===401){location.replace(location.href);return}
  status.textContent=problem.readable?problem.message:'This could not finish. Try again.';
 }finally{busy=false}
};
const verified=()=>{status.textContent='Second factor verified. Opening the console…';location.replace(location.href)};
form.onsubmit=event=>{event.preventDefault();const code=form.elements.code.value.replace(/\s+/g,'');void run(async()=>{await securityRequest(prefix+(code.length===32?'/recovery/verify':'/totp/verify'),'POST',{code});verified()})};
usePasskey.onclick=()=>run(async()=>{await passkey(securityRequest,false);verified()});
step.querySelector('[data-factor-signout]').onclick=()=>run(async()=>{
 const response=await fetch('/auth/signout',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
 if(!response.ok)throw Object.assign(Error('Sign-out could not finish. Try again.'),{readable:true});
 location.replace('/login');
});
step.hidden=false;form.elements.code.focus();
// A passkey is offered only when this account has one and this address can use it; the code entry never waits on this.
securityRequest(prefix+'/status').then(state=>{usePasskey.hidden=!(state.passkeysAvailable&&state.factors.some(factor=>factor.kind==='webauthn'))},problem=>{if(problem.status===401)location.replace(location.href)});
