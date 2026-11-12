import {escape} from './console-format.js';
import {deliveryLabel,simulatedDelivery,simulationNotice} from './delivery-chain.js';
const runLabel=code=>({drill_queued:'Scheduled drill',destination_disabled:'Destination disabled',credential_rotated:'Credentials changed',credential_expired:'Credentials expired',credential_unavailable:'Credentials unavailable'})[code]??'Drill could not start';
const confirmationLabel=state=>({confirmed:'Confirmed by recipient',missing:'Not confirmed in time',pending:'Waiting for confirmation'})[state]??'Confirmation unavailable';

const dateFields=['windowStart','windowEnd','credentialExpiresAt'];
const numberFields=['intervalMs','maxDrills','confirmationWaitMs','reminderIntervalMs','maxReminders'];
const localDate=value=>{
 if(value==null)return '';
 const date=new Date(value);
 return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,19);
};
const when=value=>value==null?'Not set':new Date(value).toLocaleString();
const describe=value=>typeof value==='object'?(value.text??JSON.stringify(value)):String(value);
const input=(name,label,type,attributes='')=>`<label>${label}<input form="drill-consent-fields" data-config="${name}" type="${type}" ${attributes}></label>`;
const numeric=(name,label,min,max,value)=>input(name,label,'number',`min="${min}" ${max?`max="${max}"`:''} step="1" value="${value}"`);

function runsMarkup(runs,destination,notes){
 if(!runs.length)return '<p>No scheduled drills have run.</p>';
 return runs.map(run=>`<section class="drill-result" aria-label="Scheduled drill ${escape(runLabel(run.code))}">
 <h4>${escape(runLabel(run.code))}</h4><dl class="drill-lines">
 <div><dt>Provider</dt><dd>${escape(run.providerState==='not_sent'?'Not sent':simulatedDelivery({state:run.providerState,code:run.providerCode},notes)?simulationNotice(destination,notes):deliveryLabel(run.providerState))}</dd></div>
 <div><dt>Recipient confirmation</dt><dd>${escape(confirmationLabel(run.confirmation))}</dd></div>
 </dl>${run.proposedRoute!=null?`<p>Suggested route correction: ${escape(describe(run.proposedRoute))}</p>`:''}
 ${run.proposedOncall!=null?`<p>Suggested Oncall escalation: ${escape(describe(run.proposedOncall))}</p>`:''}
 ${run.proposal==='open'?`<p>Suggestions await review. Recipients, secrets and phone settings stay under your control.</p><button type="button" class="secondary" data-decline="${escape(run.id)}">Decline proposal</button>`:run.proposal==='declined'?'<p>Proposal declined.</p>':''}
 <p>${run.reminders.length?`Owner reminders: ${run.reminders.map(reminder=>`${escape(when(reminder.at))} · ${escape(reminder.ownerName??reminder.ownerId)}`).join('; ')}`:'No owner reminders sent.'}</p></section>`).join('');
}

// These fields deliberately have no form owner: destination Save must not validate or submit consent configuration.
export function mountDrillSchedule(form,{destination,api,notes={}}){
 if(!destination)return;
 const panel=document.createElement('details');panel.className='latest-test drill-schedule';panel.style.fontSize='14px';
 panel.innerHTML=`<summary>Scheduled drills</summary><div style="display:grid;gap:14px;min-width:0">
 <p>Authorize a limited window of test notifications. Your agent uses the consent ID to create the schedule.</p>
 <div class="webhook-preview-controls"><button type="button" class="secondary" data-refresh>Refresh</button><span role="status" data-message></span></div>
 <div data-status style="overflow-wrap:anywhere"></div><p class="form-error" role="alert" data-error></p>
 <div data-fields style="display:grid;gap:14px">
 <div class="webhook-pair">${input('windowStart','Window starts (local time)','datetime-local','step="1"')}${input('windowEnd','Window ends (local time)','datetime-local','step="1"')}</div>
 <div class="webhook-pair">${numeric('intervalMs','Drill interval (milliseconds)',60000,null,3600000)}${numeric('maxDrills','Maximum drills',1,24,3)}</div>
 ${input('credentialExpiresAt','Credentials expire (local time, optional)','datetime-local','step="1"')}
 <div class="webhook-pair">${numeric('confirmationWaitMs','Confirmation wait (milliseconds)',60000,null,3600000)}${numeric('reminderIntervalMs','Reminder interval (milliseconds)',60000,null,3600000)}</div>
 ${numeric('maxReminders','Maximum owner reminders',1,10,3)}
 <label>Reminder owner<select form="drill-consent-fields" data-config="ownerId"></select></label>
 <label>Phone budget (USD)<input form="drill-consent-fields" data-config="phoneBudgetUsd" type="number" min="0" step="0.01" value="0"></label><p>Email, webhook and Slack drills incur no phone charge. Phone calls are unavailable.</p>
 <label class="enabled-control"><input form="drill-consent-fields" data-config="consent" type="checkbox"> I consent on behalf of this company to these scheduled drills and owner reminders within these limits.</label>
 <div class="webhook-preview-controls"><button type="button" data-save>Save consent</button><button type="button" class="danger" data-revoke hidden>Revoke consent</button></div>
 </div><div data-runs style="overflow-wrap:anywhere"></div></div>`;
 form.querySelector('form > .form-error').before(panel);
 const path=`/api/notifications/destinations/${encodeURIComponent(destination.id)}/drill-schedule`;
 const get=selector=>panel.querySelector(selector),field=name=>get(`[data-config="${name}"]`);
 const error=message=>{get('[data-error]').textContent=message};
 let busy=false,loaded=false,disposed=false;
 const setBusy=value=>{
  busy=value;
  for(const control of panel.querySelectorAll('button,input,select'))control.disabled=value||(!loaded&&!control.matches('[data-refresh]'));
 };
 function render(data,fill){
  const consent=data.consent,schedule=data.schedule,active=consent&&consent.revokedAt==null;
  get('[data-status]').innerHTML=`<p>${consent?`${active?'Consent active':'Consent revoked'} · ID: <code>${escape(consent.id)}</code>`:'No consent saved.'}</p>${consent?`<p>Consent window: ${escape(when(consent.windowStart))} – ${escape(when(consent.windowEnd))}</p>`:''}
  <p>${schedule?`Schedule: ${escape({active:'Active',complete:'Finished',cancelled:'Cancelled'}[schedule.state]??'Schedule status unavailable')} · Next due: ${escape(when(schedule.nextDue))} · Drills: ${escape(describe(schedule.drills))}`:'No schedule created.'}</p>`;
  get('[data-revoke]').hidden=!active;
  get('[data-runs]').innerHTML=`<h3>Scheduled drill history</h3>${runsMarkup(data.runs,destination,notes)}`;
  if(fill){
   for(const name of dateFields)field(name).value=localDate(consent?.[name]);
   for(const name of numberFields)if(consent)field(name).value=consent[name];
   field('ownerId').innerHTML=data.eligibleOwners.map(owner=>`<option value="${escape(owner.id)}">${escape(owner.name)}</option>`).join('');
   field('ownerId').value=consent?.ownerId??data.currentOwnerId;
   field('phoneBudgetUsd').value=consent?.phoneBudgetUsd??0;
   field('consent').checked=false;
  }
  loaded=true;
 }
 async function refresh(fill=false){
  const data=await api(path);
  if(!disposed)render(data,fill||!loaded);
 }
 async function perform(task,message){
  if(busy)return;
  error('');setBusy(true);get('[data-message]').textContent='Working…';
  try{await task();if(!disposed)get('[data-message]').textContent=message}
  catch(cause){if(!disposed){error(cause.message||'Scheduled drills could not be updated.');get('[data-message]').textContent=''}}
  finally{if(!disposed)setBusy(false)}
 }
 function config(){
  const values={consent:true,phoneBudgetUsd:Number(field('phoneBudgetUsd').value)};
  if(!field('phoneBudgetUsd').value||!Number.isFinite(values.phoneBudgetUsd)||values.phoneBudgetUsd<0||Math.abs(values.phoneBudgetUsd*100-Math.round(values.phoneBudgetUsd*100))>0.00001)throw Error('Enter a nonnegative USD phone budget with at most two decimal places.');
  for(const name of dateFields){
   const raw=field(name).value;
   if(!raw&&name==='credentialExpiresAt'){values[name]=null;continue}
   const value=new Date(raw).getTime();
   if(!raw||!Number.isSafeInteger(value))throw Error('Enter a valid start and end for the scheduling window.');
   values[name]=value;
  }
  if(values.windowEnd<=values.windowStart)throw Error('The scheduling window must end after it starts.');
  for(const name of numberFields){
   const control=field(name),value=Number(control.value);
   if(!control.value||!Number.isSafeInteger(value)||value<Number(control.min)||(control.max&&value>Number(control.max))){control.focus();throw Error(`Enter a valid ${control.closest('label').firstChild.textContent.toLowerCase()}.`)}
   values[name]=value;
  }
  values.ownerId=field('ownerId').value;
  if(!values.ownerId)throw Error('Choose an eligible workspace owner for reminders.');
  if(!field('consent').checked)throw Error('Explicit company consent is required before saving.');
  return values;
 }
 get('[data-refresh]').onclick=()=>perform(()=>refresh(),'Status refreshed.');
 get('[data-save]').onclick=()=>{
  let values;try{values=config()}catch(cause){error(cause.message);return}
  perform(async()=>{const result=await api(path,'POST',values);if(!disposed){render(result,true);field('consent').checked=false}},'Consent saved. Give the consent ID to your agent to create the schedule.');
 };
 get('[data-revoke]').onclick=()=>perform(async()=>{await api(path,'DELETE');await refresh(true)},'Consent revoked and schedule cancelled.');
 get('[data-runs]').onclick=event=>{
  const button=event.target.closest('[data-decline]');if(!button)return;
  perform(async()=>{await api(`${path}/runs/${encodeURIComponent(button.dataset.decline)}/decline`,'POST',{});await refresh()},'Proposal declined.');
 };
 panel.addEventListener('toggle',()=>{if(panel.open)perform(()=>refresh(),'')});
 form.closest('dialog').addEventListener('close',()=>{disposed=true},{once:true});
 setBusy(false);
}
