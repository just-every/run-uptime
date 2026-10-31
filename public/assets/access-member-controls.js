import {securityControls,securityRequest} from './security-controls.js';
import {confirmErasure,showErasureReceipt} from '../notification-dialogs.js';
// Settings › People's two cards (public/settings-people.js). Accounts lists everyone who can sign in, each once: the name,
// then email · role · You, Invited or Removed. Opening a person shows their role and service or team scope (Save assignment,
// Remove member) and, to the owner, Erase… for anyone but the last active owner (the typed-name confirm), never for an
// invitation. Invite someone takes a role: Member, the default, sees failure evidence on the monitors that share it
// (Base's own invitation, which returns to / since a member does not open the console); a product role is invited with its
// scopes through the member door. Security and keys is mounted beside it: a member write that needs a fresh second factor
// asks for it there, then completes once.
let nextField=0;
const roles=['admin','editor','responder','read-only'];
const ROLE_NAMES={owner:'Owner',admin:'Admin',editor:'Editor',responder:'Responder','read-only':'Read-only',member:'Member'};
const roleName=person=>ROLE_NAMES[person.productRole??person.role]??person.productRole??person.role;
const scopes=form=>['service','team'].flatMap(kind=>form.elements[kind].value.split('\n').map(value=>value.trim()).filter(Boolean).map(value=>({kind,value})));
function fields(form,person){
 const field=(text,name,tag='input')=>{const label=document.createElement('label'),input=document.createElement(tag);const caption=document.createElement('span');caption.id='access-member-field-'+(++nextField);caption.textContent=text;input.setAttribute('aria-labelledby',caption.id);label.append(caption,input);input.name=name;form.append(label);return input};
 const role=field('Role','role','select');for(const value of (person.productRole==='owner'?['owner',...roles]:roles)){const option=document.createElement('option');option.value=value;option.textContent=ROLE_NAMES[value];role.append(option)}role.value=person.productRole??'read-only';
 for(const kind of ['service','team']){const input=field(kind==='service'?'Service scope (blank = all)':'Team scope (blank = all)',kind,'textarea');input.rows=2;input.maxLength=3100;input.value=(person.scopes??[]).filter(s=>s.kind===kind).map(s=>s.value).join('\n')}
}
export function accessMemberControls({accounts,security,api,action,closeConsole,navigateToLogin,closed}){
 accounts.innerHTML=`<div class="card-head"><h2 id="accounts-heading">Accounts</h2></div><div class="rows member-rows" data-member-list></div><p role="status" data-member-status></p>
 <form class="invite-form" data-member-invite novalidate aria-labelledby="invite-heading"><h3 id="invite-heading">Invite someone</h3><div class="field-row"><label>Email<input type="email" id="invite-email" name="email" required maxlength="254" autocomplete="off"></label><label>Name<input id="invite-name" name="displayName" required maxlength="100" autocomplete="off"></label><label class="invite-role"><span id="invite-role-label">Role</span><select name="role" aria-labelledby="invite-role-label"><option value="member">Member</option><option value="read-only">Read-only</option><option value="responder">Responder</option><option value="editor">Editor</option><option value="admin">Admin</option></select></label><button type="submit" class="primary">Send invite</button></div>
 <details class="invite-scopes" hidden><summary>Limit to services or teams</summary><div class="member-access"><label>Service scope (blank = all)<textarea name="service" rows="2" maxlength="3100"></textarea></label><label>Team scope (blank = all)<textarea name="team" rows="2" maxlength="3100"></textarea></label></div></details>
 <p class="ui-helper">A member sees failure evidence on the monitors that share it.</p></form>`;
 const list=accounts.querySelector('[data-member-list]'),status=accounts.querySelector('[data-member-status]'),invite=accounts.querySelector('[data-member-invite]'),send=invite.querySelector('button[type=submit]'),scopeFold=invite.querySelector('.invite-scopes'),helper=invite.querySelector('.ui-helper');
 const {request}=securityControls(security,api);
 // Scopes narrow a product role; a member's evidence is granted per monitor instead.
 const showScopes=()=>{scopeFold.hidden=invite.elements.role.value==='member'};
 invite.elements.role.onchange=showScopes;
 const say=(text,target)=>{target.after(status);status.textContent=text;status.scrollIntoView({block:'nearest'})};
 const refused=error=>error.message||'This action was refused.';
 function row(person,{self,owners}){
  const item=document.createElement('details'),summary=document.createElement('summary'),who=document.createElement('span'),name=document.createElement('strong'),line=document.createElement('small'),form=document.createElement('form'),buttons=document.createElement('div');
  item.className='operator-row';item.dataset.memberId=person.id;who.className='who';form.className='member-access';buttons.className='btn-row';
  name.textContent=person.displayName;
  line.textContent=[person.email,roleName(person),person.id===self.id?'You':'',person.status==='invited'?'Invited':person.status==='inactive'?'Removed':''].filter(Boolean).join(' · ');
  who.append(name,line);summary.append(who);item.append(summary,form);fields(form,person);
  const save=document.createElement('button'),remove=document.createElement('button');save.textContent='Save assignment';remove.type='button';remove.textContent='Remove member';buttons.append(save,remove);form.append(buttons);
  form.onsubmit=async event=>{event.preventDefault();save.disabled=true;try{const result=await request(`/api/access/members/${encodeURIComponent(person.id)}`,'POST',{role:form.elements.role.value,scopes:scopes(form)});await load(result.unchanged?'Assignment unchanged.':'Assignment saved.',person.id)}catch(error){form.append(status);status.textContent=refused(error);status.scrollIntoView({block:'nearest'})}finally{save.disabled=false}};
  remove.onclick=async()=>{remove.disabled=true;try{await request(`/api/access/members/${encodeURIComponent(person.id)}`,'DELETE');await load('Member removed.',person.id)}catch(error){form.append(status);status.textContent=refused(error);status.scrollIntoView({block:'nearest'});remove.disabled=false}};
  // Erasure is the owner's. Nobody can erase the last active owner, and an invitation is not an account to erase yet.
  const lastOwner=person.role==='owner'&&person.status==='active'&&owners===1;
  if(self.role==='owner'&&person.status!=='invited'&&!lastOwner){
   const erase=document.createElement('button'),hidden=document.createElement('span');erase.type='button';erase.className='ui-link quiet-action';hidden.className='ui-visually-hidden';hidden.textContent=' '+person.displayName;erase.append('Erase',hidden,'…');buttons.append(erase);
   erase.onclick=()=>confirmErasure({kind:'operator',name:person.email,onConfirm:()=>eraseOperator(person)});
  }
  return item;
 }
 // A completion line sits beside what it speaks about: under the person's row, or under the invite.
 async function load(message,memberId){
  try{
   const self=await securityRequest('/api/access/self');
   if(!['owner','admin'].includes(self.role)){invite.hidden=true;list.replaceChildren();say('An owner or administrator manages members.',list);return}
   const members=await securityRequest('/api/access/members');if(!accounts.isConnected)return;
   const owners=members.filter(person=>person.role==='owner'&&person.status==='active').length;
   // Only the owner invites an administrator.
   invite.elements.role.querySelector('option[value="admin"]').hidden=self.role!=='owner';
   list.replaceChildren(...members.map(person=>row(person,{self,owners})));
   if(message){const item=memberId&&list.querySelector(`[data-member-id="${CSS.escape(memberId)}"]`);if(item)say(message,item);else say(message,helper)}
  }catch(error){say(`Accounts could not be read: ${refused(error).replace(/\.$/,'')}.`,list)}
 }
 async function eraseOperator(person){
  const result=await action(()=>api(`/api/operators/${encodeURIComponent(person.id)}/erase`,'POST',{}),{pending:'Erasing operator…',success:'Operator and local sign-in records erased.',onSuccess:result=>{
   if(result.selfErased){closeConsole();showErasureReceipt(result.receipt,{onClose:navigateToLogin})}
  }});
  if(result.ok&&!closed()){showErasureReceipt(result.result.receipt);await load()}
 }
 // An invitation keeps what was typed when it is refused, says why, and Send invite stays the way to try again.
 invite.onsubmit=async event=>{
  event.preventDefault();if(!invite.reportValidity())return;
  const email=invite.elements.email.value.trim(),displayName=invite.elements.displayName.value.trim(),role=invite.elements.role.value;
  send.disabled=true;say('Sending invite…',helper);
  try{
   if(role==='member')await request('/auth/invite','POST',{email,displayName,role:'member',returnTo:'/'});
   else await request('/api/access/invitations','POST',{email,displayName,role,scopes:scopes(invite),returnTo:'/app'});
   invite.reset();showScopes();await load(`Invitation sent to ${email}.`);
  }catch(error){say(`Not sent: ${refused(error).replace(/\.$/,'')}.`,helper)}
  finally{send.disabled=false}
 };
 void load();
}
