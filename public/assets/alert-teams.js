import {escape} from '/console-format.js';
import {dialogFocusReturn} from '/notification-dialogs.js';
// Alert teams (Settings › Alerts, ROUTING-001): a team is a named group of people an alert route can select (GET and POST
// /api/routing/teams). Membership opts nobody in. A member is told only after choosing to receive alerts at the email
// destination that matches their own verified account email (GET and POST /api/routing/recipient); that opt-in is theirs
// alone, so it sits below the team list for whoever is signed in. An owner or administrator manages teams.
const styles=()=>{if(document.querySelector('link[href="/assets/alert-route.css"]'))return;const link=document.createElement('link');link.rel='stylesheet';link.href='/assets/alert-route.css';document.head.append(link)};
const person=p=>p.displayName||p.email||p.id;
export function mountTeams(card,{api}){
 styles();
 card.innerHTML=`<div class="card-head"><h2 id="alert-teams-heading">Alert teams</h2><button type="button" id="new-team">New team</button></div><p class="ui-helper">A route can tell a whole team. Members are told only after they opt in below, with their own verified email, and only for monitors their access covers.</p><ul class="team-list" aria-labelledby="alert-teams-heading"><li class="rows-note">Reading teams…</li></ul><h3>Your opt-in</h3><div class="team-optin" role="status">Reading your opt-in…</div><p class="settings-failure" id="alert-teams-failure" role="alert" hidden></p>`;
 const list=card.querySelector('.team-list'),optin=card.querySelector('.team-optin'),failure=card.querySelector('#alert-teams-failure');
 let teams=[],members=[],directoryError='';
 const say=text=>{failure.textContent=text;failure.hidden=!text};
 const name=id=>{const found=members.find(m=>m.id===id);return found?person(found):directoryError?'Member (names unavailable)':'Former member'};
 const drawTeams=()=>{list.innerHTML=teams.map(t=>`<li class="team-row" data-team="${escape(t.id)}"><div><strong>${escape(t.name)}</strong> · ${t.members.length} member${t.members.length===1?'':'s'}${t.enabled?'':' · disabled'}<p class="ui-helper">${t.members.length?escape(t.members.map(m=>name(m.operatorId)).join(', ')):'No members yet'}</p></div><button type="button" id="edit-team-${escape(t.id)}" data-edit-team="${escape(t.id)}" aria-label="Edit ${escape(t.name)}">Edit</button></li>`).join('')||'<li class="rows-note">No teams yet. Create one to route alerts to a group.</li>'};
 const drawOptin=async()=>{
  try{
   const self=await api('/api/routing/recipient');
   optin.innerHTML=self.destinations.length?self.destinations.map((d,i)=>`<label class="route-contact" for="team-optin-${i}"><input id="team-optin-${i}" type="checkbox" data-optin="${escape(d.id)}" ${d.optedIn?'checked':''}><span>Send me team alerts at <strong>${escape(d.name)}</strong>${d.enabled?'':' (disabled)'}${d.consentCurrent||!d.optedIn?'':' — renew: your access changed or the address was rotated'}</span></label>`).join(''):'<p>No email destination matches your account email. Add it under Destinations first; it is the only address team alerts can use for you.</p>';
  }catch(error){optin.textContent=`Your opt-in could not be read: ${error.message}`}
 };
 async function load(){
  try{
   const [read,people]=await Promise.all([api('/api/routing/teams'),api('/api/access/members').then(value=>({value}),error=>({error}))]);
   teams=read.teams;members=people.value??[];directoryError=people.error?.message??'';drawTeams();say(directoryError?`The member directory could not be read: ${directoryError}. Saved members are kept as they are.`:'');
  }catch(error){list.innerHTML='';say(`Teams could not be read: ${error.message}`)}
  await drawOptin();
 }
 optin.addEventListener('change',async event=>{
  const box=event.target.closest('[data-optin]');if(!box)return;box.disabled=true;
  try{await api('/api/routing/recipient','POST',{destinationId:box.dataset.optin,enabled:box.checked});say('')}catch(error){box.checked=!box.checked;say(`Your opt-in was not saved: ${error.message}`)}finally{box.disabled=false;await drawOptin()}
 });
 function edit(team){
  const returnFocus=dialogFocusReturn(team?`edit-team-${team.id}`:'new-team'),dialog=document.createElement('dialog');
  dialog.className='editor notification-dialog alert-team-dialog';dialog.setAttribute('aria-labelledby','team-dialog-heading');
  const chosen=new Set((team?.members??[]).map(m=>m.operatorId));
  dialog.innerHTML=`<h2 id="team-dialog-heading">${team?`Edit ${escape(team.name)}`:'New team'}</h2><form id="team-form"><label for="team-name">Team name<input id="team-name" name="name" required maxlength="100" value="${escape(team?.name??'')}"></label><label class="route-contact" for="team-enabled"><input id="team-enabled" name="enabled" type="checkbox" ${team?.enabled??true?'checked':''}><span>Team is active; a disabled team is told nothing</span></label><fieldset><legend>Members</legend>${[...members.filter(m=>m.status==='active'||chosen.has(m.id)),...[...chosen].filter(id=>!members.some(m=>m.id===id)).map(id=>({id,displayName:'Saved member (name unavailable)'}))].map((m,i)=>`<label class="route-contact" for="team-member-${i}"><input id="team-member-${i}" type="checkbox" name="member" value="${escape(m.id)}" ${chosen.has(m.id)?'checked':''}><span>${escape(person(m))}${m.assignmentCurrent===false?' · needs an access role':''}</span></label>`).join('')||'<p>Members could not be read.</p>'}${directoryError?'<p>The member directory could not be read, so only saved members are listed. Saving keeps them.</p>':''}</fieldset><p id="team-error" class="form-error" role="alert"></p><div class="buttons"><button type="submit" class="primary">Save team</button><button type="button" id="team-close">Close</button></div></form>`;
  dialog.querySelector('#team-close').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{dialog.remove();returnFocus()},{once:true});
  dialog.querySelector('form').onsubmit=async event=>{
   event.preventDefault();const form=event.target,error=dialog.querySelector('#team-error');error.textContent='';
   try{
    await api('/api/routing/teams','POST',{...(team?{id:team.id}:{}),name:form.elements.name.value.trim(),enabled:form.elements.enabled.checked,memberIds:[...form.querySelectorAll('[name=member]:checked')].map(i=>i.value),expectedRevision:team?.revision??0});
    dialog.close();await load();
   }catch(problem){error.textContent=problem.message}
  };
  document.body.append(dialog);dialog.showModal();dialog.querySelector('#team-name').focus();
 }
 card.querySelector('#new-team').onclick=()=>edit(null);
 list.addEventListener('click',event=>{const button=event.target.closest('[data-edit-team]');if(button)edit(teams.find(t=>t.id===button.dataset.editTeam))});
 void load();
}
