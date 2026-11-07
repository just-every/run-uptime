import {escape} from '/console-format.js';
// Settings › Alerts › Alert teams (ROUTING-001): named teams of active members that a route can tell, and the signed-in
// person's own opt-in to be told at their verified email contact. Team and member names only: no address or credential is
// shown here. Membership never counts as consent; a member must opt in, and a paused, rotated or out-of-scope member is
// excluded when a route is previewed or sent (src/domain/alert-teams.server.ts).
export function mountAlertTeams(card,{api}){
 for(const href of ['/assets/alert-route.css','/assets/alert-route-targeting.css'])if(!document.querySelector(`link[href="${href}"]`)){const link=document.createElement('link');link.rel='stylesheet';link.href=href;document.head.append(link)}
 let teams=[],people=[],self=null,editing=null;
 card.innerHTML=`<div class="card-head"><h2 id="alert-teams-heading">Alert teams</h2><p class="saved" id="alert-teams-status" role="status"></p></div><div id="alert-teams-body"><p class="rows-note">Reading teams…</p></div>`;
 const body=card.querySelector('#alert-teams-body'),status=card.querySelector('#alert-teams-status');
 const say=text=>{status.textContent=text};
 const personName=id=>{const p=people.find(x=>x.id===id);return p?.displayName||p?.name||'A member'};
 function form(){
  const team=editing==='new'?{id:null,name:'',enabled:true,revision:0,members:[]}:teams.find(t=>t.id===editing);
  const chosen=new Set(team.members.map(m=>m.operatorId));
  return `<form id="alert-team-form" class="alert-team-form"><label for="alert-team-name">Team name<input id="alert-team-name" name="name" required maxlength="100" value="${escape(team.name)}"></label><label class="route-target-check" for="alert-team-enabled"><input id="alert-team-enabled" type="checkbox" name="enabled" ${team.enabled?'checked':''}>Team is active</label><fieldset><legend>Members</legend>${people.filter(p=>p.status==='active'&&p.productRole).map((p,i)=>`<label class="route-target-check" for="alert-team-member-${i}"><input id="alert-team-member-${i}" type="checkbox" name="member" value="${escape(p.id)}" ${chosen.has(p.id)?'checked':''}>${escape(p.displayName||p.name||'Member')} · ${escape(p.productRole)}</label>`).join('')||'<p>No active members yet.</p>'}</fieldset><div class="btn-row"><button type="submit" class="primary ui-compact">Save team</button><button type="button" class="ui-link" id="alert-team-cancel">Cancel</button></div></form>`;
 }
 function draw(){
  const consents=self?.destinations??[];
  body.innerHTML=`<p>A route can tell a team. Each member is told only at their own verified email contact, after they opt in below.</p><ul class="route-recipients" id="alert-team-list">${teams.map(t=>`<li data-team="${escape(t.id)}"><div><strong>${escape(t.name)}</strong> <span>${t.enabled?'Active':'Paused'}</span><p>${t.members.length?escape(t.members.map(m=>`${personName(m.operatorId)}${m.status==='active'?'':' (inactive)'}`).join(', ')):'No members'}</p></div><button type="button" class="ui-link" data-edit-team="${escape(t.id)}" aria-label="Edit team ${escape(t.name)}">Edit team</button></li>`).join('')||'<li>No teams yet.</li>'}</ul>${editing?form():'<button type="button" id="alert-team-add">Add team</button>'}<h3>Your alert email</h3>${consents.length?`<ul class="route-recipients" id="alert-consents">${consents.map((d,i)=>`<li><label class="route-target-check" for="alert-consent-${i}"><input id="alert-consent-${i}" type="checkbox" data-consent="${escape(d.id)}" ${d.optedIn?'checked':''}><span>Tell me at <strong>${escape(d.name)}</strong> when a team I belong to is routed an alert${d.enabled?'':' (contact is disabled)'}</span></label></li>`).join('')}</ul><p>${self.teams.length?`You are in ${escape(self.teams.map(t=>t.name).join(', '))}.`:'You are not in a team yet.'}</p>`:'<p>No email contact matches your verified account email. An owner can add one under Destinations.</p>'}`;
 }
 async function load(){
  try{
   [{teams},people,self]=await Promise.all([api('/api/routing/teams'),api('/api/access/members'),api('/api/routing/recipient')]);
   draw();
  }catch(problem){body.textContent=`Teams unavailable: ${problem.message}`}
 }
 card.addEventListener('click',event=>{
  const edit=event.target.closest('[data-edit-team]');
  if(edit){editing=edit.dataset.editTeam;draw();card.querySelector('#alert-team-name').focus();return}
  if(event.target.closest('#alert-team-add')){editing='new';draw();card.querySelector('#alert-team-name').focus();return}
  if(event.target.closest('#alert-team-cancel')){editing=null;draw()}
 });
 card.addEventListener('submit',async event=>{
  event.preventDefault();const f=event.target,team=teams.find(t=>t.id===editing);say('Saving…');
  try{
   await api('/api/routing/teams','POST',{...(team?{id:team.id}:{}),name:f.elements.name.value.trim(),enabled:f.elements.enabled.checked,memberIds:[...f.querySelectorAll('[name=member]:checked')].map(c=>c.value),expectedRevision:team?.revision??0});
   editing=null;await load();say('✓ Saved');
  }catch(problem){say(problem.message)}
 });
 card.addEventListener('change',async event=>{
  const consent=event.target.closest('[data-consent]');if(!consent)return;say('Saving…');
  try{self=await api('/api/routing/recipient','POST',{destinationId:consent.dataset.consent,enabled:consent.checked});draw();say('✓ Saved')}
  catch(problem){consent.checked=!consent.checked;say(problem.message)}
 });
 void load();
}
