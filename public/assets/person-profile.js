import {savedLine,failureLine,saveAsYouGo} from '../settings-save.js';

// Base changes only the current account. Other People's roles remain separate.
export function personProfile(person,{request,updated}){
 const host=document.createElement('details');host.className='member-profile';
 host.innerHTML=`<summary>Change</summary><div class="member-access"><div><label>Your name<input name="displayName" required maxlength="120" autocomplete="name"></label>${savedLine('profile-name-saved')}${failureLine('profile-name-failure')}</div><div><label>Your email<input name="email" type="email" required maxlength="254" autocomplete="email"></label>${savedLine('profile-email-saved')}${failureLine('profile-email-failure')}</div></div><button type="button" data-confirm-email hidden>Email me a confirmation link</button><p role="status" data-profile-status></p>`;
 const name=host.querySelector('[name=displayName]'),email=host.querySelector('[name=email]'),confirm=host.querySelector('[data-confirm-email]'),status=host.querySelector('[data-profile-status]');
 name.value=person.displayName;email.value=person.email;
 for(const [input,key] of [[name,'displayName'],[email,'email']]){
  const kind=key==='email'?'email':'name';
  const save=saveAsYouGo({saved:host.querySelector(`#profile-${kind}-saved`),failure:host.querySelector(`#profile-${kind}-failure`),send:async value=>{
   if(!input.reportValidity())throw Error('Check this field before continuing.');
   try{const account=await request('/api/profile','POST',{[key]:value});Object.assign(person,{displayName:account.displayName,email:account.email});updated()}
   catch(error){if(error.code==='step_up_required')confirm.hidden=false;throw error}
  }});
  input.onchange=()=>{void save(input.value)};
 }
 confirm.onclick=async()=>{confirm.disabled=true;try{await request('/api/profile','POST',{confirm:true});status.textContent='Open the confirmation link sent to your current sign-in email, then change your email here.'}catch(error){status.textContent=error.message}finally{confirm.disabled=false}};
 return host;
}
