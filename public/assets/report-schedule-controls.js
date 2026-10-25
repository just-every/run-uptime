import {firstMount} from '../dom-patch.js';
export function reportScheduleControls(host,{data,api}){
 if(!firstMount(host))return;
 host.innerHTML='<h3>Scheduled reports</h3><details><summary>Schedule a one-time report</summary><form class="notification-form"><label><span id="report-schedule-monitor-label">Monitor</span><select name="monitor" aria-labelledby="report-schedule-monitor-label" required></select></label><label><span id="report-schedule-destination-label">Destination</span><select name="destination" aria-labelledby="report-schedule-destination-label" required></select></label><label>Send at (local time)<input name="due" type="datetime-local" required></label><label>Report time zone<input name="zone" value="UTC" required></label><p>Send a snapshot of the last 24 hours, calculated when scheduled.</p><button class="primary">Schedule report</button></form></details><p role="status" data-report-status></p><div data-report-list></div>';
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
  try{await api(`/api/monitors/${encodeURIComponent(form.elements.monitor.value)}/report-schedules`,'POST',{destinationId:form.elements.destination.value,dueAt:new Date(form.elements.due.value).getTime(),period:{period:'24h',timeZone:form.elements.zone.value}});status.textContent='Report scheduled.';await load()}catch(error){status.textContent=error.message}finally{button.disabled=false}
 };
 void load();
}
