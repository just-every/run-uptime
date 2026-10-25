import {firstMount} from '../dom-patch.js';
export function reportScheduleControls(host,{data,api}){
 if(!firstMount(host))return;
 host.innerHTML='<h3>Scheduled reports</h3><details><summary>Schedule a report</summary><form class="notification-form"><label><span id="report-schedule-monitor-label">Monitor</span><select name="monitor" aria-labelledby="report-schedule-monitor-label" required></select></label><label><span id="report-schedule-destination-label">Destination</span><select name="destination" aria-labelledby="report-schedule-destination-label" required></select></label><label>Send at (local time)<input name="due" type="datetime-local" required></label><label>Report time zone<input name="zone" value="UTC" required></label><label><span id="report-frequency-label">Frequency</span><select name="frequency" aria-labelledby="report-frequency-label"><option value="once">One time</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label><label><input name="aggregate" type="checkbox"> Aggregate this monitor’s service</label><p>Last 24 hours. Recurring reports freeze figures at each due time in the selected zone.</p><button class="primary">Schedule report</button></form></details><p role="status" data-report-status></p><div data-report-list></div>';
 const form=host.querySelector('form'),status=host.querySelector('[data-report-status]'),list=host.querySelector('[data-report-list]');
 const option=(select,value,label)=>{const node=document.createElement('option');node.value=value;node.textContent=label;select.append(node)};
 for(const monitor of data.monitors)option(form.elements.monitor,monitor.id,monitor.definition.name);
 for(const destination of data.notifications.destinations.filter(d=>d.enabled&&['email','slack'].includes(d.kind)))option(form.elements.destination,destination.id,destination.name);
 async function load(){
  try{
   const monitor=form.elements.monitor.value;if(!monitor)return;
   const reports=await api(`/api/monitors/${encodeURIComponent(monitor)}/report-schedules`);
   if(!host.isConnected)return;list.replaceChildren();
   for(const report of reports){
    const row=document.createElement('p'),label=document.createElement('span');row.dataset.reportId=report.id;
    if(report.kind==='recurring'){label.textContent=`${report.frequency} · ${report.service?'Service '+report.service:'Monitor'} · ${report.timeZone} · ${report.nextDueAt?new Date(report.nextDueAt).toLocaleString():report.code} `;row.append(label);
     const show=document.createElement('button');show.type='button';show.textContent='Show report runs';const runs=document.createElement('div');show.onclick=async()=>{try{const saved=await api(`/api/monitors/${encodeURIComponent(monitor)}/report-schedules/${encodeURIComponent(report.id)}`);runs.replaceChildren();for(const run of saved.runs){const line=document.createElement('p'),download=document.createElement('button');line.textContent=`${new Date(run.dueAt).toLocaleString()} · ${run.state} · ${run.code??''} `;download.type='button';download.textContent='Download report JSON';download.onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(run.report,null,2)+'\n'],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='uptime-report.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};line.append(download);runs.append(line)}if(!saved.runs.length)runs.textContent='No runs yet.'}catch(error){status.textContent=error.message}};row.append(show,runs);
     if(report.state==='active'){const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancel recurring report';cancel.onclick=async()=>{cancel.disabled=true;try{await api(`/api/monitors/${encodeURIComponent(monitor)}/report-schedules/${encodeURIComponent(report.id)}`,'DELETE');await load();status.textContent='Recurring report cancelled.'}catch(error){status.textContent=error.message;cancel.disabled=false}};row.append(cancel)}
     list.append(row);continue;
    }
    label.textContent=`${data.notifications.destinations.find(d=>d.id===report.destinationId)?.name??'Unavailable destination'} · ${new Date(report.dueAt).toLocaleString()} · ${report.code==='report_cancelled'?'Cancelled by owner':report.state} `;row.append(label);
    if(report.state==='queued'){
     const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancel scheduled report';
     cancel.onclick=async()=>{cancel.disabled=true;try{await api(`/api/monitors/${encodeURIComponent(monitor)}/report-schedules/${encodeURIComponent(report.id)}`,'DELETE');status.textContent='Report cancelled. No delivery will start.';await load()}catch(error){status.textContent=error.message;cancel.disabled=false}};row.append(cancel);
    }
    list.append(row);
   }
  }catch(error){status.textContent=error.message}
 }
 form.elements.monitor.onchange=()=>void load();
 form.onsubmit=async event=>{
  event.preventDefault();const button=form.querySelector('button');button.disabled=true;
  try{await api(`/api/monitors/${encodeURIComponent(form.elements.monitor.value)}/report-schedules`,'POST',{destinationId:form.elements.destination.value,dueAt:new Date(form.elements.due.value).getTime(),period:{period:'24h',timeZone:form.elements.zone.value},...(form.elements.frequency.value!=='once'?{recurrence:{frequency:form.elements.frequency.value,timeZone:form.elements.zone.value}}:{}),...(form.elements.aggregate.checked?{service:data.monitors.find(m=>m.id===form.elements.monitor.value)?.definition.service??''}:{})});status.textContent='Report scheduled.';await load()}catch(error){status.textContent=error.message}finally{button.disabled=false}
 };
 void load();
}
