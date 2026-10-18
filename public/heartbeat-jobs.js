import {escape} from './console-format.js';

export function heartbeatJobsPanel(m){
 if(m.definition.type!=='heartbeat')return '';
 const h=m.definition.heartbeat??{};
 return `<section class="ui-card panel" id="heartbeat-jobs" data-monitor-id="${escape(m.id)}" data-revision="${m.revision}" aria-labelledby="heartbeat-jobs-title"><h2 id="heartbeat-jobs-title">Job schedule and runs</h2>
 <p>A success is expected each period, with the grace below. A start measures duration; failure requests an immediate scheduled evaluation. Only signed scheduled results change health.</p>
 <form id="heartbeat-job-settings"><label for="job-mode">Schedule type<select id="job-mode" name="mode"><option value="period" ${h.cron?'':'selected'}>Expected period</option><option value="cron" ${h.cron?'selected':''}>Cron in a time zone</option></select></label>
 <label for="job-cron">Five-field cron expression<input id="job-cron" name="cron" value="${escape(h.cron??'0 2 * * *')}" maxlength="120"></label>
 <label for="job-zone">IANA time zone<input id="job-zone" name="zone" list="job-zones" value="${escape(h.timeZone??'America/New_York')}"></label><datalist id="job-zones">${['America/New_York','America/Chicago','America/Denver','America/Los_Angeles','America/Phoenix','America/Anchorage','Pacific/Honolulu','UTC'].map(z=>`<option value="${z}">`).join('')}</datalist>
 <p>Cron skips times that do not exist during spring DST and uses only the first occurrence of repeated fall times. Early success does not satisfy the next scheduled run.</p><label for="job-period">Expected period (seconds)<input id="job-period" name="period" type="number" min="5" max="2678400" required value="${escape((h.maxAgeMs??180000)/1000)}"></label>
 <label for="job-grace">Grace (seconds)<input id="job-grace" name="grace" type="number" min="0" max="86400" required value="${escape((h.graceMs??0)/1000)}"></label>
 <label for="job-maximum">Maximum run duration (seconds; 0 disables)<input id="job-maximum" name="maximum" type="number" min="0" max="2678400" required value="${escape((h.maxRunDurationMs??0)/1000)}"></label>
 <label for="job-masks">Output text to mask (one phrase per line; up to 20)<textarea id="job-masks" name="masks" rows="3">${escape((h.outputMasks??[]).join('\n'))}</textarea></label>
 <p>Saving creates a new revision and retires the heartbeat key. Issue a new key afterward. Standard secret patterns are always masked; only a bounded failure excerpt is retained.</p><button type="submit">Save job settings</button><p id="heartbeat-settings-status" role="status"></p></form>
 <p>Report with <code>POST /api/heartbeats/${escape(m.id)}/start</code>, <code>/success</code>, or <code>/fail/3</code>, using the same key and increasing sequence. Failure JSON accepts an <code>output</code> string. GET, HEAD and POST work with the sequence header or the separately issued URL capability. Capability URLs are replay-unprotected: anyone holding one can report a receipt. <a href="/docs/heartbeat-jobs">Runnable curl and Bash instructions</a></p>
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
 const mode=form.querySelector('#job-mode'),toggle=()=>{form.querySelector('#job-period').closest('label').hidden=mode.value==='cron';for(const id of ['job-cron','job-zone']){const field=form.querySelector('#'+id);field.closest('label').hidden=mode.value!=='cron';field.required=mode.value==='cron'}};mode.onchange=toggle;toggle();
 form.onsubmit=event=>{event.preventDefault();const fields=new FormData(form);area.querySelector('#heartbeat-settings-status').textContent='';action(()=>api(`/api/monitors/${encodeURIComponent(m.id)}/heartbeat-settings`,'POST',{maxAgeMs:Number(fields.get('period'))*1000,graceMs:Number(fields.get('grace'))*1000,maxRunDurationMs:Number(fields.get('maximum'))*1000,...(fields.get('mode')==='cron'?{cron:String(fields.get('cron')),timeZone:String(fields.get('zone'))}:{}),outputMasks:String(fields.get('masks')).split('\n').map(s=>s.trim()).filter(Boolean)}).catch(problem=>{area.querySelector('#heartbeat-settings-status').textContent=problem.message;throw problem}),{pending:'Saving job settings…',success:'Job settings saved. Issue a new heartbeat key.'})};
 let cursor=null,busy=false;
 const read=async append=>{
  if(busy)return;busy=true;load.disabled=earlier.disabled=true;status.textContent='Loading job runs…';
  try{const page=await api(`/api/monitors/${encodeURIComponent(m.id)}/heartbeat-runs${append&&cursor?'?before='+encodeURIComponent(cursor):''}`);
   if(!append){history.replaceChildren();if(page.schedule?.upcoming?.length){const preview=document.createElement('p');preview.textContent='Next expected runs ('+page.schedule.timeZone+'): '+page.schedule.upcoming.map(item=>{const format=at=>new Intl.DateTimeFormat('en-US',{timeZone:page.schedule.timeZone,dateStyle:'medium',timeStyle:'long'}).format(at);return format(item.expectedAt)+'; missed after '+format(item.deadlineAt)}).join(' · ');history.append(preview)}}
   if(!page.runs.length&&!append){const empty=document.createElement('p');empty.textContent='No job receipts have been received.';history.append(empty)}
   for(const run of page.runs){const row=document.createElement('div');row.className='heartbeat-job-run';
    const summary=document.createElement('p');summary.textContent=`${new Date(run.receivedAt).toISOString()} · revision ${run.revision} · ${run.state}${run.late?' (late run)':''}${run.exitCode===null?'':' · exit '+run.exitCode}${run.durationMs===null?'':' · '+run.durationMs/1000+' seconds'}`;row.append(summary);
    if(run.output){const output=document.createElement('pre');output.textContent=run.output;row.append(output)}history.append(row)
   }
   cursor=page.nextCursor;earlier.hidden=!cursor;load.textContent='Refresh run history';status.textContent='Job run history loaded. Choose Refresh to read newer receipts.';
  }catch(problem){status.textContent='Job run history unavailable: '+problem.message}finally{busy=false;load.disabled=earlier.disabled=false}
 };
 load.onclick=()=>read(false);earlier.onclick=()=>read(true);
}
