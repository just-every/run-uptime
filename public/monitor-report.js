import {escape} from './console-format.js';
import {renderReport,renderSeries,renderIncidents} from './report-render.js';
import {renderJobRuns} from './report-jobs.js';

const zones=['America/Chicago','America/New_York','America/Denver','America/Los_Angeles','America/Phoenix','America/Anchorage','Pacific/Honolulu','America/Detroit','America/Indiana/Indianapolis','UTC'];
const probeName=id=>({'local-a':'Check 1','local-b':'Check 2','local-c':'Check 3'}[id]??id);
const options=values=>values.map(([value,label])=>`<option value="${escape(value)}">${escape(label)}</option>`).join('');

function formMarkup(monitor){
 const locations=['all',...new Set(monitor.definition.probes??[])];
 return `<h2 id="report-heading">Period report</h2><p>Generate a snapshot from scheduled evidence. It changes only when you choose Generate report; the console refresh does not update it. <a href="/docs/read-api">Monitoring API and CSV guide</a>.</p>
 <form id="monitor-report-form" class="report-form">
 <label for="report-period">Period<select id="report-period" name="period">${options([['24h','Last 24 hours'],['7d','Last 7 days'],['30d','Last 30 days'],['90d','Last 90 days'],['mtd','Month to date'],['qtd','Quarter to date'],['ytd','Year to date'],['last-month','Last month'],['custom','Custom range']])}</select></label>
 <label for="report-zone">Time zone<input id="report-zone" name="timeZone" list="report-zones" value="America/Chicago" required aria-describedby="report-zone-help"><datalist id="report-zones">${options(zones.map(zone=>[zone,zone]))}</datalist></label>
 <p id="report-zone-help" class="report-help">US zones are offered first. Enter any IANA zone. Custom times use this zone; for a repeated daylight-saving time, include its UTC offset.</p>
 <div id="report-custom-range" class="report-custom-range" hidden>
 <label for="report-from">From (inclusive)<input id="report-from" name="from" type="text" placeholder="2026-10-01T00:00" required disabled aria-describedby="report-zone-help"></label>
 <label for="report-to">To (exclusive)<input id="report-to" name="to" type="text" placeholder="2026-10-08T00:00" required disabled aria-describedby="report-zone-help"></label></div>
 <label for="report-location">Response-time location<select id="report-location" name="location">${options(locations.map(id=>[id,id==='all'?'All checks':`${probeName(id)} (${id})`]))}</select></label>
 <label for="report-bucket">Response-time resolution<select id="report-bucket" name="bucket">${options([['5m','5 minutes'],['raw','Raw samples'],['1m','1 minute'],['1h','1 hour'],['1d','1 day']])}</select></label>
 <label for="report-root-cause">Incident root-cause category<select id="report-root-cause" name="rootCause"><option value="">All categories</option></select></label>
 <label for="report-use-sla" class="report-sla-toggle"><input id="report-use-sla" type="checkbox">Include an SLA target</label>
 <label for="report-sla" id="report-sla-label" hidden>SLA target (%)<input id="report-sla" name="sla" type="number" min="0.000001" max="100" step="any" value="99.9" required disabled></label>
 <p class="report-help">Location filters response times. Availability and SLA always use all configured checks.</p>
 <button id="report-generate" class="primary" type="submit">Generate report</button></form>
 <p id="report-status" role="status" aria-live="polite"></p><p id="report-error" role="alert" hidden></p>
 <div id="report-results"></div>`;
}

// Keep the actual form and result nodes, including open disclosures, edits and caret, across console polling.
export function retainReportPanel(area,id){
 const panel=area.querySelector('#monitor-report');
 if(!panel||panel.dataset.monitorId!==id)return null;
 const focused=panel.contains(document.activeElement)?document.activeElement:null;
 const selection=focused&&typeof focused.selectionStart==='number'?[focused.selectionStart,focused.selectionEnd,focused.selectionDirection]:null;
 panel.remove();
 return {panel,focused,selection};
}

function saveBlob(blob,name){
 const url=URL.createObjectURL(blob),link=document.createElement('a');
 link.href=url;link.download=name;document.body.append(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function focusReportPage(results,action){
 const requested=results.querySelector(`#report-${action}`);
 (requested?.disabled?requested.parentElement.querySelector('button:not(:disabled)'):requested)?.focus({preventScroll:true});
}

function bindReport(panel,monitor,api){
 let snapshot=null,seriesPage=0,incidentPage=0,jobsPage=0;
 const form=panel.querySelector('form'),results=panel.querySelector('#report-results');
 const status=panel.querySelector('#report-status'),error=panel.querySelector('#report-error');
 const endpoint=`/api/v1/monitors/${encodeURIComponent(monitor.id)}/report`;
 const showError=problem=>{error.textContent=problem instanceof Error?problem.message:String(problem);error.hidden=false};
 const field=name=>form.elements.namedItem(name);
 api('/api/incident-settings').then(settings=>{for(const category of settings.categories)field('rootCause').add(new Option(category.label,category.id))},problem=>showError(problem));
 const resetError=()=>{error.hidden=true;error.textContent=''};
 panel.querySelector('#report-period').addEventListener('change',()=>{
  const custom=field('period').value==='custom';panel.querySelector('#report-custom-range').hidden=!custom;
  for(const name of ['from','to'])field(name).disabled=!custom;
 });
 panel.querySelector('#report-use-sla').addEventListener('change',event=>{
  panel.querySelector('#report-sla-label').hidden=!event.target.checked;field('sla').disabled=!event.target.checked;
 });
 form.addEventListener('submit',async event=>{
  event.preventDefault();resetError();const button=panel.querySelector('#report-generate');button.disabled=true;
  status.textContent='Generating report…';
  try{
   const params=new URLSearchParams(new FormData(form));if(!params.get('rootCause'))params.delete('rootCause');
   const report=await api(`${endpoint}?${params}`);
   const markup=renderReport(report);
   snapshot=report;seriesPage=0;incidentPage=0;jobsPage=0;results.innerHTML=markup;
   for(const id of report.latency.availableLocations){
    if(!Array.from(field('location').options).some(option=>option.value===id))field('location').add(new Option(`${probeName(id)} (${id})`,id));
   }
   status.textContent='Report generated. The snapshot below stays fixed until you generate another report.';
  }catch(problem){status.textContent=snapshot?'The previous snapshot is still shown.':'No report generated.';showError(problem)}
  finally{button.disabled=false}
 });
 results.addEventListener('click',async event=>{
  const button=event.target.closest('button[data-report-action]');if(!button||!snapshot)return;
  const action=button.dataset.reportAction;
  if(action==='series-prev'||action==='series-next'){
   seriesPage+=action==='series-next'?1:-1;results.querySelector('#report-series').innerHTML=renderSeries(snapshot,seriesPage);
   focusReportPage(results,action);return;
  }
  if(action==='incidents-prev'||action==='incidents-next'){
   incidentPage+=action==='incidents-next'?1:-1;results.querySelector('#report-period-incidents').innerHTML=renderIncidents(snapshot,incidentPage);
   focusReportPage(results,action);return;
  }
  if(action==='jobs-prev'||action==='jobs-next'){
   jobsPage+=action==='jobs-next'?1:-1;results.querySelector('#report-job-runs').innerHTML=renderJobRuns(snapshot,jobsPage);
   focusReportPage(results,action);return;
  }
  resetError();button.disabled=true;
  try{
   const filename=`uptime-report-${snapshot.period.from}-${snapshot.period.to}`;
   if(action==='json')saveBlob(new Blob([JSON.stringify(snapshot,null,2)+'\n'],{type:'application/json'}),filename+'.json');
   if(action==='csv'||action==='pdf'){
    const {period,latency}=snapshot;
    const params=new URLSearchParams({period:'custom',from:String(period.from),to:String(period.to),timeZone:period.timeZone,bucket:latency.bucket,location:latency.location,format:action});
    if(snapshot.rootCauseFilter)params.set('rootCause',snapshot.rootCauseFilter);
    if(period.slaTargetPercent!==null)params.set('sla',String(period.slaTargetPercent));
    const response=await fetch(`${endpoint}?${params}`,{headers:{Accept:action==='pdf'?'application/pdf':'text/csv'},signal:AbortSignal.timeout(30000)});
    if(!response.ok){const problem=await response.json();throw Error(problem.error??`Download failed (${response.status})`)}
    saveBlob(await response.blob(),filename+'.'+action);
   }
  }catch(problem){showError(problem)}finally{button.disabled=false}
 });
}

export function mountReportPanel(area,monitor,api,retained){
 if(!document.querySelector('link[data-period-report]')){
  const css=document.createElement('link');css.rel='stylesheet';css.href='/report.css';css.dataset.periodReport='';document.head.append(css);
 }
 const slot=area.querySelector('#monitor-report-slot');
 if(retained){
  slot.replaceWith(retained.panel);
  if(retained.focused){retained.focused.focus({preventScroll:true});if(retained.selection)retained.focused.setSelectionRange(...retained.selection)}
  return;
 }
 const panel=document.createElement('section');panel.className='ui-card panel period-report';panel.id='monitor-report';
 panel.dataset.monitorId=monitor.id;panel.setAttribute('aria-labelledby','report-heading');panel.innerHTML=formMarkup(monitor);
 slot.replaceWith(panel);bindReport(panel,monitor,api);
}
