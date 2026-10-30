import {escape} from './console-format.js';
import {contactScheduleMarkup,readContactSchedule} from './assets/alert-route-markup.js';
import {quietMarkup,syncQuiet} from './assets/contact-quiet.js';
import {saveAsYouGo,savedLine,failureLine} from './settings-save.js';
// Who is told by default (Settings › Alerts): the installation's alert route, which every monitor without a route of its
// own uses (GET /api/alert-route; POST /api/alert-route/preview and /apply, src/domain/alert-routes.server.ts). All enabled
// destinations, or only the ticked ones, each with its own schedule behind Change. A change shows who would be told under
// the choices and Apply saves it against the revision this card read; a route changed elsewhere meanwhile is refused (409),
// and the card keeps the owner's choice, says why and offers Retry against the current revision. The card fills itself
// (data-owned), so a choice not yet applied survives the console's refresh.
const list=names=>names.length<2?names.join(''):`${names.slice(0,-1).join(', ')} and ${names.at(-1)}`;
const skipped={disabled:'disabled',credentials_missing:'credentials missing',mail_not_configured:'email not set up',destination_missing:'erased'};
// "now · repeats every 30 min": when a contact is told and what follows.
function scheduleLine(s){
 const parts=[s.delayMinutes?`after ${s.delayMinutes} min`:'now'];
 if(s.repeatMinutes)parts.push(`repeats every ${s.repeatMinutes} min${s.maxRepeats?`, up to ${s.maxRepeats} times`:''}`);
 if(s.recovery===false)parts.push('no recovery');
 if(s.stopOnAck)parts.push('stops on acknowledgement');
 if(s.quietHours)parts.push(`quiet ${s.quietHours.start}–${s.quietHours.end}`);
 return parts.join(' · ');
}
const sameSettings=(a={},b={})=>JSON.stringify(a)===JSON.stringify(b);
export function mountDefaultRoute(card,{api,notes}){
 let saved=null,draft=null,preview=null,ticket=0,timer,mail=notes.mailConfigured,signature=signatureOf(notes);
 card.innerHTML=`<div class="card-head"><h2 id="default-route-heading">Who is told by default</h2>${savedLine('default-route-saved')}</div><div class="default-route-body"><p class="rows-note">Reading who is told…</p></div>${failureLine('default-route-failure')}<p class="route-foot" hidden></p>`;
 const body=card.querySelector('.default-route-body'),foot=card.querySelector('.route-foot');
 const save=saveAsYouGo({saved:card.querySelector('#default-route-saved'),failure:card.querySelector('#default-route-failure'),send:apply});
 const fromSaved=()=>({mode:saved.mode,ids:new Set(saved.destinationIds),settings:Object.fromEntries(saved.destinations.map(d=>[d.id,saved.contactSettings[d.id]??d.contactSettings]))});
 const changed=()=>draft.mode!==saved.mode||draft.mode==='selected'&&([...draft.ids].sort().join()!==[...saved.destinationIds].sort().join()||[...draft.ids].some(id=>!sameSettings(draft.settings[id],saved.contactSettings[id]??saved.destinations.find(d=>d.id===id)?.contactSettings)));
 // The reviewed route: the owner's choice, keeping the saved fallback chain (less any contact now ticked) and teams.
 function input(){
  if(draft.mode==='all')return {mode:'all',destinationIds:[],expectedRevision:saved.revision};
  const ids=[...draft.ids].sort(),fallback={...saved.fallback,destinationIds:saved.fallback.destinationIds.filter(id=>!draft.ids.has(id))};
  return {mode:'selected',destinationIds:ids,contactSettings:Object.fromEntries([...fallback.destinationIds.filter(id=>saved.contactSettings[id]).map(id=>[id,saved.contactSettings[id]]),...ids.map(id=>[id,draft.settings[id]])]),fallback,teamIds:saved.teamIds,expectedRevision:saved.revision};
 }
 async function read(){saved=await api('/api/alert-route')}
 function build(){
  body.innerHTML=`<div class="route-modes" role="radiogroup" aria-labelledby="default-route-heading"><label><input type="radio" name="default-route-mode" value="all"> All enabled destinations</label><label><input type="radio" name="default-route-mode" value="selected"> Only these</label></div><ul class="route-picks" id="default-route-picks">${saved.destinations.map((d,index)=>{const id=escape(d.id),prefix=`default-route-${index}`;return `<li data-pick="${id}"><label class="route-pick"><input type="checkbox" value="${id}"><span><strong id="${prefix}-name">${escape(d.name)}</strong><small></small></span></label><button type="button" class="ui-link route-change" aria-expanded="false" aria-controls="${prefix}-schedule" aria-describedby="${prefix}-name">Change</button><div class="route-schedule" id="${prefix}-schedule" hidden>${contactScheduleMarkup(d,draft.settings[d.id]??{},prefix,{extra:quietMarkup(prefix,draft.settings[d.id]??{})})}</div></li>`}).join('')}</ul><div class="route-review" hidden><p role="status"></p><div class="btn-row"><button type="button" class="primary ui-compact" data-apply-route>Apply</button><button type="button" class="ui-link" data-keep-route>Keep current</button></div></div>`;
  for(const pick of body.querySelectorAll('[data-pick]'))syncQuiet(pick);
 }
 // Every visible state from the draft, without replacing a node: the console's refresh and the owner's focus both survive.
 function sync(){
  for(const radio of body.querySelectorAll('[name=default-route-mode]'))radio.checked=radio.value===draft.mode;
  body.querySelector('.route-picks').hidden=draft.mode!=='selected';
  for(const pick of body.querySelectorAll('[data-pick]')){
   const d=saved.destinations.find(x=>x.id===pick.dataset.pick),told=draft.ids.has(d.id),box=pick.querySelector('input[type=checkbox]'),change=pick.querySelector('.route-change');
   box.checked=told;change.hidden=!told;if(!told){change.setAttribute('aria-expanded','false');pick.querySelector('.route-schedule').hidden=true}
   const issue=d.reason==='destination_missing'?'erased':!d.enabled?'disabled':d.credentialsAvailable===false?'cannot send':d.kind==='email'&&!mail?'email not set up':null;
   const line=[...(d.kind==='email'&&d.address?[d.address]:[]),...(issue?[issue]:[]),told?scheduleLine(draft.settings[d.id]??{}):saved.fallback.destinationIds.includes(d.id)?'fallback contact':'not told'].join(' · ');
   const small=pick.querySelector('small');if(small.textContent!==line)small.textContent=line;
  }
  const own=saved.overrides.map(o=>o.name),shown=own.length>3?[...own.slice(0,2),`${own.length-2} more`]:own;
  foot.textContent=own.length?`${list(shown)} ${own.length===1?'chooses its own':'choose their own'}.`:'';foot.hidden=!own.length;
  review();
 }
 function review(problem){
  const box=body.querySelector('.route-review'),text=box.querySelector('p'),apply=box.querySelector('[data-apply-route]');
  box.hidden=!problem&&!changed();if(box.hidden)return;
  apply.disabled=!preview;
  if(problem){text.textContent=`Not previewed: ${problem}`;return}
  if(!preview){text.textContent='Checking who would be told…';return}
  const ready=preview.recipients.filter(r=>r.selected&&r.eligible).map(r=>r.name),missed=preview.recipients.filter(r=>r.selected&&!r.eligible),using=preview.affected.filter(m=>m.effective.scope==='installation').length,monitors=`${using} monitor${using===1?'':'s'}`;
  text.textContent=`${ready.length?`Alerts for ${monitors} would go to ${list(ready)}.`:`Nobody would be told about ${monitors}.`}${missed.length?` ${list(missed.map(r=>`${r.name} (${skipped[r.reason]??r.reason})`))} would be skipped.`:''}${preview.fallback.length?` Fallback: ${preview.fallback.map(f=>f.name).join(', then ')}.`:''}`;
 }
 // The preview follows the draft; a stale revision is read again and previewed once more, keeping the draft.
 async function previewDraft(retried=false){
  const mine=++ticket;preview=null;
  if(!changed()){review();return}
  review();
  try{const result=await api('/api/alert-route/preview','POST',input());if(mine===ticket){preview=result;review()}}
  catch(error){if(mine!==ticket)return;if(error.status===409&&!retried){await refreshSaved();return previewDraft(true)}review(error.message)}
 }
 // A new choice is not saved yet, so the last apply's Saved gives way to the preview and Apply.
 const later=()=>{clearTimeout(timer);ticket++;preview=null;const line=card.querySelector('#default-route-saved');if(line.dataset.state==='saved'){line.dataset.state='';line.textContent=''}review();timer=setTimeout(()=>void previewDraft(),300)};
 async function refreshSaved(){const names=saved.destinations.map(d=>d.id+d.name).join();await read();if(saved.destinations.map(d=>d.id+d.name).join()!==names){for(const d of saved.destinations)draft.settings[d.id]??=d.contactSettings;build()}sync()}
 // Apply sends the preview shown; refused as stale, the card reads the route again, previews the kept choice and says so.
 async function apply(){
  const reviewed=preview;if(!reviewed)throw Error('there is nothing previewed to apply yet');
  body.setAttribute('aria-busy','true');
  try{saved=await api('/api/alert-route/apply','POST',{...reviewed.input,digest:reviewed.digest});draft=fromSaved();preview=null;sync()}
  catch(error){if(error.status===409){await refreshSaved();if(!changed()){draft=fromSaved();sync();return}await previewDraft(true);throw Error('who is told by default changed elsewhere since this page read it. Your choice is kept; Retry applies it to the current route')}throw error}
  finally{body.removeAttribute('aria-busy')}
 }
 body.addEventListener('change',event=>{
  const target=event.target;
  if(target.name==='default-route-mode'){draft.mode=target.value;if(draft.mode==='selected'&&!draft.ids.size)for(const d of saved.destinations)if(d.enabled&&d.kind)draft.ids.add(d.id);sync();later();return}
  const pick=target.closest('[data-pick]');if(!pick)return;
  if(target.type==='checkbox'&&target.closest('.route-pick')){if(target.checked)draft.ids.add(pick.dataset.pick);else draft.ids.delete(pick.dataset.pick);sync();later();return}
  syncQuiet(pick);draft.settings[pick.dataset.pick]=readContactSchedule(pick.querySelector('.route-schedule'));sync();later();
 });
 body.addEventListener('input',event=>{const pick=event.target.closest('.route-schedule')?.closest('[data-pick]');if(!pick||!event.target.checkValidity())return;draft.settings[pick.dataset.pick]=readContactSchedule(pick.querySelector('.route-schedule'));sync();later()});
 body.addEventListener('click',event=>{
  const change=event.target.closest('.route-change');
  if(change){const open=change.getAttribute('aria-expanded')!=='true';change.setAttribute('aria-expanded',String(open));body.querySelector('#'+change.getAttribute('aria-controls')).hidden=!open;return}
  if(event.target.closest('[data-apply-route]'))void save(Symbol('apply'));
  if(event.target.closest('[data-keep-route]')){draft=fromSaved();ticket++;preview=null;build();sync()}
 });
 read().then(()=>{draft=fromSaved();build();sync()},error=>{body.innerHTML=`<p class="settings-failure">Who is told by default could not be read: ${escape(error.message)}</p>`});
 return {
  // A destination added, renamed, enabled or broken elsewhere shows here once the card holds no choice of the owner's.
  update(next){mail=next.mailConfigured;const now=signatureOf(next);if(now===signature||!saved||changed()||body.hasAttribute('aria-busy'))return;signature=now;void refreshSaved().catch(()=>{})},
 };
}
const signatureOf=notes=>JSON.stringify([notes.mailConfigured,notes.destinations.map(d=>[d.id,d.name,d.enabled,d.credentialsAvailable])]);
