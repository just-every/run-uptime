import {escape} from './console-format.js';
import {patch,firstMount} from './dom-patch.js';
import {confirmErasure,showErasureReceipt} from './notification-dialogs.js';
// Settings › People: everyone who can sign in (Accounts), shown even with one owner, so inviting someone is always found
// here; Erase… for anyone but the last active owner, behind the typed-name confirm; and Invite someone, a member who sees
// failure evidence on the monitors that share it. Members' roles, scopes and second factors follow
// (public/assets/access-member-controls.js).
const ROLES={owner:'Owner',admin:'Admin',member:'Member'};
export function renderPeople({area,api,action,closeConsole,navigateToLogin,closed}){
 patch(area,'<div class="settings-area"><section class="ui-card set-card" id="people-accounts" data-owned="accounts" aria-labelledby="accounts-heading"></section><section class="ui-card set-card" id="access-member-controls" data-owned="access-members"></section></div>');
 const accounts=area.querySelector('#people-accounts');
 if(firstMount(accounts))mountAccounts(accounts,{api,action,closeConsole,navigateToLogin,closed});
 void import('./assets/access-member-controls.js').then(({accessMemberControls})=>accessMemberControls(area.querySelector('#access-member-controls'),api));
}
function mountAccounts(card,{api,action,closeConsole,navigateToLogin,closed}){
 card.innerHTML=`<div class="card-head"><h2 id="accounts-heading">Accounts</h2></div><ul class="rows" id="operators" aria-labelledby="accounts-heading"></ul><p class="rows-note" id="operators-status" role="status"></p>
 <form id="invite-someone" class="invite-form" novalidate aria-labelledby="invite-heading"><h3 id="invite-heading">Invite someone</h3><div class="field-row"><label>Email<input type="email" id="invite-email" name="email" required maxlength="254" autocomplete="off"></label><label>Name<input id="invite-name" name="displayName" required maxlength="100" autocomplete="off"></label><button type="submit" class="primary" id="send-invite">Send invite</button></div><p class="ui-helper">A member sees failure evidence on the monitors that share it.</p><p id="invite-status" role="status"></p></form>`;
 const list=card.querySelector('#operators'),listStatus=card.querySelector('#operators-status'),form=card.querySelector('#invite-someone'),send=form.querySelector('#send-invite'),status=form.querySelector('#invite-status');
 let people=[],self=null;
 // Each person once: name, then email · role · what else holds (You, Invited, Removed). Nobody can erase the last active
 // owner, and an invitation is not an account to erase yet.
 const row=(person,owners)=>{
  const lastOwner=person.role==='owner'&&person.status==='active'&&owners===1,erasable=person.status!=='invited'&&!lastOwner;
  const notes=[person.id===self?'You':'',person.status==='invited'?'Invited':person.status==='inactive'?'Removed':''].filter(Boolean);
  return `<li class="operator-row" data-key="operator-${escape(person.id)}"><div class="who"><strong>${escape(person.displayName)}</strong><small>${[escape(person.email),ROLES[person.role]??escape(person.role),...notes].join(' · ')}</small></div>${erasable?`<button type="button" class="ui-link quiet-action" id="erase-operator-${escape(person.id)}" data-erase-operator="${escape(person.id)}">Erase<span class="ui-visually-hidden"> ${escape(person.displayName)}</span>…</button>`:''}</li>`;
 };
 async function load(){
  try{
   const [operators,me]=await Promise.all([api('/auth/operators'),self?null:api('/api/access/self').catch(()=>null)]);
   if(me)self=me.id;people=operators;if(!list.isConnected)return;
   const owners=operators.filter(person=>person.role==='owner'&&person.status==='active').length;
   patch(list,operators.map(person=>row(person,owners)).join(''));listStatus.textContent='';
  }catch(error){if(list.isConnected)listStatus.textContent=`Accounts could not be read: ${error.message}`}
 }
 async function erase(person){
  const result=await action(()=>api(`/api/operators/${encodeURIComponent(person.id)}/erase`,'POST',{}),{pending:'Erasing operator…',success:'Operator and local sign-in records erased.',onSuccess:result=>{
   if(result.selfErased){closeConsole();showErasureReceipt(result.receipt,{onClose:navigateToLogin})}
  }});
  if(result.ok&&!closed()){showErasureReceipt(result.result.receipt);await load()}
 }
 list.addEventListener('click',event=>{const person=people.find(p=>p.id===event.target.closest('[data-erase-operator]')?.dataset.eraseOperator);if(person)confirmErasure({kind:'operator',name:person.email,onConfirm:()=>erase(person)})});
 // An invitation keeps what was typed when it is refused, says why, and Send invite stays the way to try again.
 form.onsubmit=async event=>{
  event.preventDefault();if(!form.reportValidity())return;
  const email=form.elements.email.value.trim(),displayName=form.elements.displayName.value.trim();
  send.disabled=true;status.className='';status.textContent='Sending invite…';
  try{await api('/auth/invite','POST',{email,displayName,role:'member',returnTo:'/'});form.reset();status.textContent=`Invitation sent to ${email}.`;await load()}
  catch(error){status.className='settings-failure';status.textContent=`Not sent: ${error.message.replace(/\.$/,'')}.`}
  finally{send.disabled=false}
 };
 void load();
}
