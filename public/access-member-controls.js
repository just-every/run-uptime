import {firstMount} from './dom-patch.js';
const roles=['admin','editor','responder','read-only'];
const scopes=form=>['service','team'].flatMap(kind=>form.elements[kind].value.split('\n').map(value=>value.trim()).filter(Boolean).map(value=>({kind,value})));
function fields(form,person={}){
 const field=(text,name,tag='input')=>{const label=document.createElement('label'),input=document.createElement(tag);label.append(text,input);input.name=name;form.append(label);return input};
 const role=field('Role','role','select');for(const value of (person.productRole==='owner'?['owner',...roles]:roles)){const option=document.createElement('option');option.value=value;option.textContent=value;role.append(option)}role.value=person.productRole??'read-only';
 for(const kind of ['service','team']){const input=field(kind==='service'?'Service scope (blank = all)':'Team scope (blank = all)',kind,'textarea');input.rows=2;input.maxLength=3100;input.value=(person.scopes??[]).filter(s=>s.kind===kind).map(s=>s.value).join('\n')}
}
export function accessMemberControls(host,api){
 if(!firstMount(host))return;
 host.innerHTML='<h3>Members and roles</h3><details><summary>Invite a member</summary><form data-member-invite><label>Name<input name="displayName" required maxlength="100"></label><label>Email<input name="email" type="email" required></label><p>Invitations use the emailed sign-in link.</p></form></details><p role="status" data-member-status></p><div data-member-list></div>';
 const invite=host.querySelector('[data-member-invite]'),status=host.querySelector('[data-member-status]'),list=host.querySelector('[data-member-list]');fields(invite);
 const inviteButton=document.createElement('button');inviteButton.textContent='Send invitation';inviteButton.className='primary';invite.append(inviteButton);
 const showError=error=>{status.textContent=error.message||'This action was refused.'};
 async function load(){
  try{
   const members=await api('/api/access/members');if(!host.isConnected)return;list.replaceChildren();
   for(const member of members){
    const row=document.createElement('details'),summary=document.createElement('summary'),form=document.createElement('form');row.dataset.memberId=member.id;summary.textContent=`${member.displayName} · ${member.email} · ${member.productRole??'Unassigned'} · ${member.status}`;row.append(summary,form);fields(form,member);
    const save=document.createElement('button'),remove=document.createElement('button');save.textContent='Save assignment';remove.textContent='Remove member';remove.type='button';form.append(save,remove);
    form.onsubmit=async event=>{event.preventDefault();save.disabled=true;try{const result=await api(`/api/access/members/${encodeURIComponent(member.id)}`,'POST',{role:form.elements.role.value,scopes:scopes(form)});status.textContent=result.unchanged?'Assignment unchanged.':'Assignment saved.';await load()}catch(error){showError(error)}finally{save.disabled=false}};
    remove.onclick=async()=>{remove.disabled=true;try{await api(`/api/access/members/${encodeURIComponent(member.id)}`,'DELETE');status.textContent='Member removed.';await load()}catch(error){showError(error);remove.disabled=false}};
    list.append(row);
   }
  }catch(error){showError(error)}
 }
 invite.onsubmit=async event=>{event.preventDefault();inviteButton.disabled=true;try{await api('/api/access/invitations','POST',{email:invite.elements.email.value,displayName:invite.elements.displayName.value,role:invite.elements.role.value,scopes:scopes(invite),returnTo:'/app'});status.textContent='Invitation sent. The member can accept the emailed link.';await load()}catch(error){showError(error)}finally{inviteButton.disabled=false}};
 void load();
}
