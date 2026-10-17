import {escape} from './console-format.js';

export function heartbeatJobsPanel(m){
 if(m.definition.type!=='heartbeat')return '';
 const h=m.definition.heartbeat??{};
 return `<section class="ui-card panel" id="heartbeat-jobs" data-monitor-id="${escape(m.id)}" data-revision="${m.revision}" aria-labelledby="heartbeat-jobs-title"><h2 id="heartbeat-jobs-title">Job schedule and runs</h2>
 <p>A success is expected each period, with the grace below. A start measures duration; failure requests an immediate scheduled evaluation. Only signed scheduled results change health.</p>
 <form id="heartbeat-job-settings"><label for="job-period">Expected period (seconds)<input id="job-period" name="period" type="number" min="5" max="2678400" required value="${escape((h.maxAgeMs??180000)/1000)}"></label>
 <label for="job-grace">Grace (seconds)<input id="job-grace" name="grace" type="number" min="0" max="86400" required value="${escape((h.graceMs??0)/1000)}"></label>
 <label for="job-maximum">Maximum run duration (seconds; 0 disables)<input id="job-maximum" name="maximum" type="number" min="0" max="2678400" required value="${escape((h.maxRunDurationMs??0)/1000)}"></label>
 <label for="job-masks">Output text to mask (one phrase per line; up to 20)<textarea id="job-masks" name="masks" rows="3">${escape((h.outputMasks??[]).join('\n'))}</textarea></label>
 <p>Saving creates a new revision and retires the heartbeat key. Issue a new key afterward. Standard secret patterns are always masked; only a bounded failure excerpt is retained.</p><button type="submit">Save job settings</button></form>
 <p>Report with <code>POST /api/heartbeats/${escape(m.id)}/start</code>, <code>/success</code>, or <code>/fail/3</code>, using the same key and increasing sequence. Failure JSON accepts an <code>output</code> string. Cron/time-zone schedules and GET/HEAD capability URLs are not available. <a href="/docs/heartbeat-jobs">Runnable curl and Bash instructions</a></p>
 <div class="buttons"><button type="button" id="load-heartbeat-runs">Load run history</button><button type="button" id="earlier-heartbeat-runs" hidden>Load earlier runs</button></div><p id="heartbeat-run-status" role="status"></p><div id="heartbeat-run-history" aria-live="polite"></div></section>`;
}
// Preserve the actual controls and results while the console polls this revision.
export function retainHeartbeatJobs(area,m){
 const panel=area.querySelector('#heartbeat-jobs');
 if(!panel||panel.dataset.monitorId!==m.id||panel.dataset.revision!==String(m.revision))return null;
 const focused=panel.contains(document.activeElement)?document.activeElement:null;
 const selection=focused&&typeof focused.selectionStart==='number'?[focused.selectionStart,focused.selectionEnd,focused.selectionDirection]:null;
 panel.remove();return {panel,focused,selection};
}
export function bindHeartbeatJobs(area,m,{api,action},retained){
 if(m.definition.type!=='heartbeat')return;
 if(!document.querySelector('link[data-heartbeat-jobs]')){const css=document.createElement('link');css.rel='stylesheet';css.href='/heartbeat-jobs.css';css.dataset.heartbeatJobs='';document.head.append(css)}
 if(retained){area.querySelector('#heartbeat-jobs')?.replaceWith(retained.panel);if(retained.focused){retained.focused.focus({preventScroll:true});if(retained.selection)retained.focused.setSelectionRange(...retained.selection)}return}
 const form=area.querySelector('#heartbeat-job-settings'),history=area.querySelector('#heartbeat-run-history'),load=area.querySelector('#load-heartbeat-runs'),earlier=area.querySelector('#earlier-heartbeat-runs'),status=area.querySelector('#heartbeat-run-status');
 if(!form)return;
 form.onsubmit=event=>{event.preventDefault();const fields=new FormData(form);action(()=>api(`/api/monitors/${encodeURIComponent(m.id)}/heartbeat-settings`,'POST',{maxAgeMs:Number(fields.get('period'))*1000,graceMs:Number(fields.get('grace'))*1000,maxRunDurationMs:Number(fields.get('maximum'))*1000,outputMasks:String(fields.get('masks')).split('\n').map(s=>s.trim()).filter(Boolean)}),{pending:'Saving job settings…',success:'Job settings saved. Issue a new heartbeat key.'})};
 let cursor=null,busy=false;
 const read=async append=>{
  if(busy)return;busy=true;load.disabled=earlier.disabled=true;status.textContent='Loading job runs…';
  try{const page=await api(`/api/monitors/${encodeURIComponent(m.id)}/heartbeat-runs${append&&cursor?'?before='+encodeURIComponent(cursor):''}`);
   if(!append)history.replaceChildren();
   if(!page.runs.length&&!append)history.textContent='No job receipts have been received.';
   for(const run of page.runs){const row=document.createElement('div');row.className='heartbeat-job-run';
    const summary=document.createElement('p');summary.textContent=`${new Date(run.receivedAt).toISOString()} · revision ${run.revision} · ${run.state}${run.late?' (late run)':''}${run.exitCode===null?'':' · exit '+run.exitCode}${run.durationMs===null?'':' · '+run.durationMs/1000+' seconds'}`;row.append(summary);
    if(run.output){const output=document.createElement('pre');output.textContent=run.output;row.append(output)}history.append(row)
   }
   cursor=page.nextCursor;earlier.hidden=!cursor;load.textContent='Refresh run history';status.textContent='Job run history loaded. Choose Refresh to read newer receipts.';
  }catch(problem){status.textContent='Job run history unavailable: '+problem.message}finally{busy=false;load.disabled=earlier.disabled=false}
 };
 load.onclick=()=>read(false);earlier.onclick=()=>read(true);
}
