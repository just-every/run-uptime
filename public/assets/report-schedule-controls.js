import {firstMount} from '../dom-patch.js';
const stopLabel=code=>({report_cancelled:'Cancelled by owner',report_initiator_revoked:'Stopped: owner authority changed',report_destination_revoked:'Stopped: destination unavailable',report_snapshot_limit:'Stopped: snapshot limit reached',report_snapshot_refused:'Stopped: report could not be created'}[code]??'Stopped: report could not be sent');
export function reportScheduleControls(host,{data,api}){
 if(!firstMount(host))return;
 host.innerHTML='<h3>Scheduled reports</h3><details><summary>Schedule a report</summary><form class="notification-form"><label><span id="report-schedule-monitor-label">Monitor</span><select name="monitor" aria-labelledby="report-schedule-monitor-label" required></select></label><label><span id="report-schedule-destination-label">Destination</span><select name="destination" aria-labelledby="report-schedule-destination-label" required></select></label><label>Send at (local time)<input name="due" type="datetime-local" required></label><label>Report time zone<input name="zone" value="UTC" required></label><label><span id="report-frequency-label">Frequency</span><select name="frequency" aria-labelledby="report-frequency-label"><option value="once">One time</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label><label data-report-service hidden><input name="aggregate" type="checkbox"><span></span></label><p>Last 24 hours. Recurring reports freeze figures at each due time in the selected zone.</p><button type="button" data-preview-report>Preview schedule dates</button><p data-report-preview></p><button class="primary">Schedule report</button></form></details><p role="status" data-report-status></p><div data-report-list></div>';
 const form=host.querySelector('form'),status=host.querySelector('[data-report-status]'),list=host.querySelector('[data-report-list]');
 const option=(select,value,label)=>{const node=document.createElement('option');node.value=value;node.textContent=label;select.append(node)};
 for(const monitor of data.monitors)option(form.elements.monitor,monitor.id,monitor.definition.name);
 for(const destination of data.notifications.destinations.filter(d=>d.enabled&&['email','slack'].includes(d.kind)))option(form.elements.destination,destination.id,destination.name);
 const selectedMonitor=()=>data.monitors.find(m=>m.id===form.elements.monitor.value);
 const serviceField=()=>{const service=selectedMonitor()?.definition.service,label=form.querySelector('[data-report-service]');label.hidden=!service;label.querySelector('span').textContent=service?'Include all of '+service:'';if(!service)form.elements.aggregate.checked=false};
 const clock=(at,report)=>new Date(at).toLocaleString('en-US',{timeZone:report.timeZone})+' '+report.timeZone;
 const cadence=report=>({daily:'Daily',weekly:'Weekly',monthly:'Monthly'}[report.frequency]??'One time')+' '+new Date(report.anchorAt??report.dueAt??report.nextDueAt??report.createdAt).toLocaleTimeString([], {timeZone:report.timeZone,hour:'numeric',minute:'2-digit'})+' '+report.timeZone;
 const outcome=run=>run.state==='accepted'?'Sent '+new Date(run.finishedAt??run.dueAt).toLocaleString():run.state==='queued'?'Waiting to send':run.state==='sending'?'Sending report':run.state==='uncertain'?'Delivery could not be confirmed':run.code==='report_cancelled'?'Not sent: cancelled by owner':run.code==='report_destination_revoked'?'Not sent: destination unavailable':run.code==='report_initiator_revoked'?'Not sent: owner authority changed':'Not sent: delivery could not finish';
 async function load(){
  try{
   const monitor=form.elements.monitor.value;if(!monitor)return;
   const reports=await api(`/api/monitors/${encodeURIComponent(monitor)}/report-schedules`);
   if(!host.isConnected)return;list.replaceChildren();
   for(const report of reports){
    const row=document.createElement('div'),label=document.createElement('span');row.dataset.reportId=report.id;
    if(report.kind==='recurring'){label.textContent=`${cadence(report)} · ${report.service?'Service '+report.service:selectedMonitor()?.definition.name??'Unavailable monitor'} → ${data.notifications.destinations.find(d=>d.id===report.destinationId)?.name??'Unavailable destination'} · ${report.nextDueAt?'Next '+clock(report.nextDueAt,report):stopLabel(report.code)} `;row.append(label);
     const show=document.createElement('button');show.type='button';show.textContent='Show report runs';const runs=document.createElement('div');show.onclick=async()=>{try{const saved=await api(`/api/monitors/${encodeURIComponent(monitor)}/report-schedules/${encodeURIComponent(report.id)}`);runs.replaceChildren();for(const run of saved.runs){const line=document.createElement('p'),download=document.createElement('button');line.textContent=`${outcome(run)} `;download.type='button';download.textContent='Download report JSON';download.onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(run.report,null,2)+'\n'],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='uptime-report.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};line.append(download);runs.append(line)}if(!saved.runs.length)runs.textContent='No runs yet.'}catch(error){status.textContent=error.message}};row.append(show,runs);
     if(report.state==='active'){const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancel recurring report';cancel.onclick=async()=>{cancel.disabled=true;try{await api(`/api/monitors/${encodeURIComponent(monitor)}/report-schedules/${encodeURIComponent(report.id)}`,'DELETE');await load();status.textContent='Recurring report cancelled.'}catch(error){status.textContent=error.message;cancel.disabled=false}};row.append(cancel)}
     list.append(row);continue;
    }
    label.textContent=`One time · ${report.service?'Service '+report.service:selectedMonitor()?.definition.name??'Unavailable monitor'} → ${data.notifications.destinations.find(d=>d.id===report.destinationId)?.name??'Unavailable destination'} · ${clock(report.dueAt,report)} · ${report.code==='report_cancelled'?'Cancelled by owner':outcome(report)} `;row.append(label);
    if(report.state==='queued'){
     const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancel scheduled report';
     cancel.onclick=async()=>{cancel.disabled=true;try{await api(`/api/monitors/${encodeURIComponent(monitor)}/report-schedules/${encodeURIComponent(report.id)}`,'DELETE');status.textContent='Report cancelled. No delivery will start.';await load()}catch(error){status.textContent=error.message;cancel.disabled=false}};row.append(cancel);
    }
    list.append(row);
   }
  }catch(error){status.textContent=error.message}
 }
 let previewVersion=0;
 const clearPreview=()=>{previewVersion++;form.querySelector('[data-report-preview]').textContent='';status.textContent=''};
 for(const name of ['monitor','due','zone','frequency'])for(const event of ['input','change'])form.elements[name].addEventListener(event,clearPreview);
 form.querySelector('[data-preview-report]').onclick=async()=>{const version=previewVersion;try{if(form.elements.frequency.value==='once')throw Error('Choose a recurring frequency to preview dates.');const result=await api(`/api/monitors/${encodeURIComponent(form.elements.monitor.value)}/report-schedules/preview`,'POST',{dueAt:new Date(form.elements.due.value).getTime(),recurrence:{frequency:form.elements.frequency.value,timeZone:form.elements.zone.value}});if(version!==previewVersion)return;status.textContent='';form.querySelector('[data-report-preview]').textContent=result.times.map(at=>new Date(at).toLocaleString('en-US',{timeZone:result.timeZone})).join(' · ')+' · '+result.timeZone}catch(error){if(version===previewVersion)status.textContent=error.message}};
 form.elements.monitor.onchange=()=>{serviceField();void load()};
 form.onsubmit=async event=>{
  event.preventDefault();const button=form.querySelector('button.primary');button.disabled=true;
  try{await api(`/api/monitors/${encodeURIComponent(form.elements.monitor.value)}/report-schedules`,'POST',{destinationId:form.elements.destination.value,dueAt:new Date(form.elements.due.value).getTime(),period:{period:'24h',timeZone:form.elements.zone.value},...(form.elements.frequency.value!=='once'?{recurrence:{frequency:form.elements.frequency.value,timeZone:form.elements.zone.value}}:{}),...(form.elements.aggregate.checked?{service:data.monitors.find(m=>m.id===form.elements.monitor.value)?.definition.service??''}:{})});clearPreview();status.textContent='Report scheduled.';await load()}catch(error){status.textContent=error.message}finally{button.disabled=false}
 };
 serviceField();void load();
}
