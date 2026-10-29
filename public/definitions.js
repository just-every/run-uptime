import {changeMarkup} from './definition-changes.js';
import {escape,icon} from './console-format.js';
import {confirmDestination} from './notification-dialogs.js';
// Monitor files and Past imports in Settings › Backup and files (public/settings-backup.js): choose a monitor file or an
// UptimeRobot export (or paste it instead), read the preview, apply exactly that preview, export the monitors, and undo a past
// import. Every import runs through the owner's import door (/api/operator/import/*): the file uploads, its request secrets
// withheld, as checked chunks, the server plans and validates, and this module only shows the plan it returns and applies it
// with the fingerprint shown. The source is detected from the file; only when that fails does Choose the source appear. Its
// state outlives the console's five-second refresh, which never re-renders an open preview.
const LIMIT=2*1024*1024,CHUNK=65536;
const ACTIONS={create:['Create','enabled'],unchanged:['Unchanged','queued'],change:['Change','stale'],refused:['Refused','rejected'],unsupported:['Unsupported','unknown']};
const OUTCOMES={paused:'Paused, history kept',restored:'Restored to its earlier settings','edited-since':'Edited since; left as is','enabled-since':'Enabled since; left running',missing:'No longer present'};
const MESSAGES={owner_required:'Sign in again as the owner to import.',review_fingerprint_mismatch:'The installation or the file changed since this preview. Nothing was applied; preview again.',
 import_door_apply_failed:'The installation changed since this preview, so nothing more was applied. Undo this batch, then preview again.',import_door_conflict:'The installation changed since this preview. Preview again.',
 import_attribution_missing:'A monitor this import created was edited since; undo stops there. Its edit was kept.',import_door_too_large:'This file is too large for one import.',source_secrets_withheld:'This upload still carried request secrets, so it was discarded. Preview the file again.'};
let state={payload:null,preview:null,batches:null,opened:new Set(),paste:false};
// A past import's source in the owner's words; a definition file's own source carries the import's id after a colon.
// A batch from the monitor list (catalog.<action>) says what the list did.
const SOURCES={'uptime.monitors':'Uptime monitor file',uptimerobot:'UptimeRobot export','uptimerobot-log':'UptimeRobot log export',pingdom:'Pingdom checks','betterstack-heartbeats':'Better Stack heartbeats','betterstack-monitors':'Better Stack monitors',site24x7:'Site24x7 monitors',business:'Business import','catalog.add.urls':'Added from the monitor list','catalog.add.csv':'Added from the monitor list','catalog.edit':'Labels edited on the monitor list','catalog.pause':'Paused on the monitor list','catalog.resume':'Resumed on the monitor list','catalog.clone':'Cloned on the monitor list'};
const sourceName=source=>SOURCES[String(source)]??SOURCES[String(source).split(':')[0]]??String(source);
const when=time=>new Date(time).toLocaleString(undefined,{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}),day=time=>new Date(time).toLocaleDateString(undefined,{day:'numeric',month:'short'});

async function send(path,{body,type,headers={}}={}){
 const response=await fetch(path,{method:body===undefined&&!type?'GET':'POST',headers:{...(type?{'content-type':type}:{}),...headers},body}),result=await response.json().catch(()=>({error:`Request ${response.status}`}));
 if([401,403].includes(response.status)&&!result.error?.startsWith?.('review_'))window.dispatchEvent(new Event('uptime:auth-lost'));
 if(!response.ok)throw Object.assign(Error(response.status===413?'The file is larger than 2 MiB.':MESSAGES[result.error]??result.error??`Request ${response.status}`),{status:response.status,code:result.error});
 return result;
}
const query=(params)=>new URLSearchParams(Object.entries(params).filter(([,v])=>v)).toString();
const hex=bytes=>[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
const sha256=async bytes=>hex(await crypto.subtle.digest('SHA-256',bytes));
const base64=bytes=>{let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(text)};
// The owner's import door: every call names its source and carries the owner session and this origin.
const door=(namespace,step,body)=>send(`/api/operator/import/${step}`,{body:JSON.stringify(body),type:'application/json',headers:{'x-import-source':namespace}});
async function until(namespace,step,body,done){
 for(let call=0;call<100;call++){const result=await door(namespace,step,body),job=result.job;if(job?.state===done)return job;
  if(!['queued','applying','undoing'].includes(job?.state))throw Error(MESSAGES[job?.error]??`The import stopped (${job?.error??job?.state}).`)}
 throw Error('The import did not finish; choose the action again to continue.');
}
// The file goes to the door as the server recognised it, with its request secrets withheld: one NDJSON line holding its
// text, in checked 64 KiB chunks. An unapplied plan with nothing to apply (a log export, or no create or change) is shown,
// then cancelled at once, so the door keeps nothing of it.
async function plan(namespace,text){
 const bytes=new TextEncoder().encode(JSON.stringify(text)+'\n'),bundleSha256=await sha256(bytes),totalChunks=Math.ceil(bytes.length/CHUNK);let uploadId;
 for(let index=0;index<totalChunks;index++){const chunk=bytes.subarray(index*CHUNK,(index+1)*CHUNK);
  uploadId=(await door(namespace,'uploads',{...(uploadId?{uploadId}:{}),name:'definitions.ndjson',bundleSha256,totalBytes:bytes.length,totalChunks,index,chunkSha256:await sha256(chunk),base64:base64(chunk)})).uploadId}
 // A source the installation imported before is compared with that import (a catch-up).
 const planned=await door(namespace,'plan',{uploadId}).catch(error=>{if(error.code==='catchup_required')return door(namespace,'plan',{uploadId,catchup:true});throw error});
 const view=await send(`/api/definitions/plans/${encodeURIComponent(planned.planId)}`);
 if(!view.applied&&(view.kind==='history'||!(view.counts.create+view.counts.change)))await door(namespace,'undo',{planId:planned.planId});
 return view;
}

function countsMarkup(preview){
 if(preview.kind==='history')return `<p class="ui-callout">${escape(preview.note)}</p>`;
 const c=preview.counts;
 return `<dl class="definition-counts" aria-label="Preview counts">${Object.entries(ACTIONS).map(([key,[label]])=>`<div><dt>${label}</dt><dd>${c[key]}</dd></div>`).join('')}</dl>
 <p class="definition-source">${escape(preview.sourceLabel)}: ${c.create} to create, ${c.unchanged} unchanged, ${c.change} to change, ${c.refused} refused, ${c.unsupported} unsupported. New monitors arrive paused.</p>`;
}
function criteriaMarkup(definition){
 if(definition?.type==='flow')return `<p><strong>Reviewed browser journey</strong></p><ul><li>Browser: ${escape(definition.flow.browser)}</li><li>Device: ${escape(definition.flow.device)}</li><li>Intent: ${escape(definition.flow.intent)}</li><li>${definition.flow.steps} steps; ${definition.flow.outcomes} required outcomes. Each browser/device combination is a separate monitor.</li></ul>`;
 if(!definition||!['http','keyword'].includes(definition.type))return '';
 const a=definition.assertions,items=[['HTTP status',Array.isArray(a.status)?a.status.join(', '):String(a.status)]];
 if(definition.tlsTrust)items.push(['HTTPS trust',definition.tlsTrust.mode==='fingerprint'?'Pinned leaf SHA-256 '+definition.tlsTrust.sha256:definition.tlsTrust.mode==='ca'?'Owner-supplied CA; private runner required':'Certificate errors ignored for initial origin; private runner required']);
 if(a.bodyIncludes!==undefined)items.push(['Body contains',a.bodyIncludes]);
 if(a.bodyExcludes!==undefined)items.push(['Body must not contain',a.bodyExcludes]);
 if(a.bodyRegex)items.push(['Body expression','/'+a.bodyRegex.pattern+'/'+(a.bodyRegex.flags??'')]);
 if(a.header)items.push(['Header',a.header.name+' = '+a.header.equals]);
 if(a.json)items.push(['JSON',a.json.path+' = '+JSON.stringify(a.json.equals)]);
 if(a.latencyMs!==undefined)items.push(['Response time','At most '+a.latencyMs+' ms']);
 return '<p><strong>Reviewed check criteria</strong></p><ul>'+items.map(([label,text])=>`<li>${escape(label)}: <code>${escape(text)}</code></li>`).join('')+'</ul>';
}
function rowMarkup(e){
 const [label,pill]=ACTIONS[e.action],details=[
  ...(e.reason?[`<p>${escape(e.reason)}</p>`]:[]),
  ...(e.target?.network==='private'?[`<p><strong>Private network</strong> · runner-local grant <code>${escape(e.target.privateGrantRef)}</code>. A new local grant is required before execution.</p>`]:[]),
  criteriaMarkup(e.target),
  ...(e.changes??[]).map(changeMarkup),
  ...(e.differences.length?[`<ul>${e.differences.map(d=>`<li>${escape(d)}</li>`).join('')}</ul>`]:[]),
 ];
 const target=e.target?(e.target.url?`<span class="url">${escape(e.target.url)}</span>`:'<span class="url url-prose">Incoming heartbeat</span>'):'';
 return `<tr><td data-label="Action"><span class="ui-pill ${pill}">${label}</span></td><td data-label="Monitor"><span class="monitor-name">${escape(e.name??e.label)}</span>${target}</td><td data-label="Details" class="definition-details">${details.join('')||'<p>No differences.</p>'}</td></tr>`;
}
function previewMarkup(preview){
 if(!preview)return '';
 if(preview.kind==='history')return countsMarkup(preview);
 const c=preview.counts,applying=c.create+c.change;
 return `${countsMarkup(preview)}<p><button id="definition-apply" class="primary"${applying?'':' disabled'}>${icon('check')}Apply: create ${c.create}, change ${c.change}</button></p>
 <div class="table-scroll" tabindex="0" role="region" aria-label="Preview entries"><table class="ui-table ui-table--stack-md" aria-label="Preview entries"><thead><tr><th scope="col">Action</th><th scope="col">Monitor</th><th scope="col">Details</th></tr></thead><tbody>${preview.entries.map(rowMarkup).join('')}</tbody></table></div>`;
}
// One row per past import: its source, then one quiet line (what it did, when, where it stands), its monitors one click away
// and Undo. An import just applied or undone opens its monitors, so what happened to each is in view.
function batchesMarkup(batches){
 if(!batches)return '<p class="rows-note">Reading past imports…</p>';
 if(!batches.length)return '<p class="rows-note">No imports yet.</p>';
 return `<ul class="rows definition-batches">${batches.map(b=>{const created=b.entries.filter(e=>e.action==='create').length,changed=b.entries.length-created,status=b.withdrawn?'import custody erased (history only)':b.restoredAt?'from an archive (history only)':b.failed?'apply failed':b.undoneAt?`undone ${day(b.undoneAt)}`:b.undone?'undone':'applied',name=sourceName(b.source);
  return `<li data-key="batch-${escape(b.id)}"><div class="who"><strong>${escape(name)}</strong><small>${b.withdrawn?'':`${created} created, ${changed} changed · `}${escape(day(b.createdAt))} · ${escape(status)}</small>${b.businessApproval?`<small>Approved ${b.businessApproval.via==='owner'?'':'via Business '}by ${escape(b.businessApproval.owner)} at ${escape(when(b.businessApproval.approvedAt))}${b.failed?`, then failed (${escape(b.failed)})`:''}</small>`:''}
  ${b.entries.length?`<details class="batch-entries" data-batch="${escape(b.id)}"${state.opened.has(b.id)?' open':''}><summary>${b.entries.length===1?'1 monitor':`${b.entries.length} monitors`}</summary><ul>${b.entries.map(e=>`<li>${escape(e.name??e.monitorId)} — ${e.action==='create'?'created':'changed'}${e.undoOutcome?`; ${escape(OUTCOMES[e.undoOutcome]??e.undoOutcome)}`:''}</li>`).join('')}</ul></details>`:''}</div>
  ${!b.withdrawn&&!b.undone&&!b.undoneAt&&!b.restoredAt?`<button type="button" class="ui-link quiet-action definition-undo" data-batch="${escape(b.id)}">Undo<span class="ui-visually-hidden"> ${escape(name)} from ${escape(when(b.createdAt))}</span></button>`:''}</li>`}).join('')}</ul>`;
}
export function renderDefinitions({area,action}){
 if(area.querySelector('.definitions-panel'))return;
 area.innerHTML=`<section class="ui-card set-card definitions-panel" aria-labelledby="monitor-files-heading"><div class="card-head"><h2 id="monitor-files-heading">Monitor files</h2></div>
 <div class="set-split"><section class="definition-input" aria-labelledby="definition-input-heading"><h3 id="definition-input-heading">Import</h3>
 <label id="definition-file-field">A file from UptimeRobot, Pingdom, Better Stack, Site24x7 or Uptime<input type="file" id="definition-file" accept=".json,.csv,application/json,text/csv"></label>
 <label id="definition-text-field" hidden>Paste it<textarea id="definition-text" rows="5" spellcheck="false"></textarea></label>
 <details id="definition-choose" hidden><summary>Choose the source</summary><label>Source<select id="definition-source"><option value="auto">Detect from the file</option><option value="uptime.monitors">Uptime monitor file</option><option value="uptimerobot">UptimeRobot v3 monitor list</option><option value="pingdom">Pingdom HTTP check details</option><option value="betterstack-heartbeats">Better Stack heartbeat, monitor or status page pages</option><option value="site24x7">Site24x7 monitor list or StatusIQ third-party components</option><option value="uptimerobot-log">UptimeRobot log export (CSV)</option></select></label></details>
 <div class="btn-row"><button type="button" class="ui-link" id="definition-paste" aria-controls="definition-text-field">Paste it instead</button><button type="button" id="definition-preview" class="primary">Preview</button></div></section>
 <section aria-labelledby="definition-export-heading"><h3 id="definition-export-heading">Export</h3><button type="button" id="definition-export">${icon('export')}Export monitors</button></section></div>
 <section id="definition-preview-area" aria-labelledby="definition-preview-heading" hidden><h3 id="definition-preview-heading">Preview</h3><div id="definition-result"></div></section><p id="definition-applied" role="status"></p></section>
 <section class="ui-card set-card" aria-labelledby="definition-batches-heading"><div class="card-head"><h2 id="definition-batches-heading">Past imports</h2></div><div id="definition-batches"></div></section>`;
 const $=s=>area.querySelector(s);
 const showPreview=()=>{$('#definition-preview-area').hidden=!state.preview;$('#definition-result').innerHTML=state.preview?previewMarkup(state.preview):'';const apply=$('#definition-apply');if(apply)apply.onclick=applyPreview};
 const showBatches=()=>{$('#definition-batches').innerHTML=batchesMarkup(state.batches);for(const button of area.querySelectorAll('.definition-undo'))button.onclick=()=>confirmUndo(button.dataset.batch);for(const fold of area.querySelectorAll('.batch-entries'))fold.ontoggle=()=>{if(fold.open)state.opened.add(fold.dataset.batch);else state.opened.delete(fold.dataset.batch)}};
 const loadBatches=async()=>{state.batches=await send('/api/definitions/batches');showBatches()};
 // A file or, in its place, the pasted text: one way at a time.
 const showWay=()=>{$('#definition-file-field').hidden=state.paste;$('#definition-text-field').hidden=!state.paste;$('#definition-paste').textContent=state.paste?'Choose a file instead':'Paste it instead'};
 $('#definition-paste').onclick=()=>{state.paste=!state.paste;showWay();(state.paste?$('#definition-text'):$('#definition-file')).focus()};
 async function preview(){
  const file=state.paste?null:$('#definition-file').files[0],text=state.paste?$('#definition-text').value:'',source=$('#definition-source').value;
  await action(async()=>{
   if(!file&&!text.trim())throw Error(state.paste?'Paste a file first.':'Choose a file first, or paste it instead.');
   if(file&&file.size>LIMIT)throw Error(`The file is ${file.size.toLocaleString()} bytes; files are limited to 2 MiB.`);
   const body=file??text,csv=file?/\.csv$/i.test(file.name)||file.type==='text/csv':!/^\s*[[{]/.test(text);
   // The server names the file's source, or says why no importer reads it; this writes nothing. Only then is the source
   // offered as a choice.
   const recognised=await send(`/api/definitions/recognise?${query({source})}`,{body,type:csv?'text/csv':'application/json'}).catch(error=>{$('#definition-choose').hidden=false;throw error});
   // A definition file is this installation's own source: each preview is its own import, and replaces any earlier one.
   state.preview=await plan(recognised.source==='uptime.monitors'?`uptime.monitors:${crypto.randomUUID()}`:recognised.source,recognised.text);state.payload={source:recognised.source};showPreview();
  },{pending:'Previewing…',success:'Preview ready. Nothing has changed yet.'});
 }
 async function applyPreview(){
  const {payload,preview}=state;if(!payload||!preview)return;
  const result=await action(async()=>{
   await until(preview.namespace,'apply',{planId:preview.planId,reviewedFingerprint:preview.digest},'completed');
   const report=await door(preview.namespace,'reconcile',{planId:preview.planId});
   if(!report.ok)throw Error('The import finished, but Uptime does not hold what it reviewed. Undo this batch.');
  },{pending:'Applying…',success:`Applied: ${preview.counts.create} created (paused), ${preview.counts.change} changed.`});
  if(result.ok){if(preview.counts.create){const created=preview.entries.filter(e=>e.action==='create');$('#definition-applied').innerHTML=`${preview.counts.create} created and paused. <a class="ui-link" href="${created.length===1?'/app/monitors/'+encodeURIComponent(created[0].monitorId):'/app/monitors'}">Review and start them →</a>`}state.preview=null;state.payload=null;showPreview();await loadBatches();if(state.batches?.[0]){state.opened.add(state.batches[0].id);showBatches()}}
 }
 // Undo says what it does in its confirm.
 function confirmUndo(id){confirmDestination({title:'Undo this import?',explanation:'Undo pauses what this import added and puts back what it changed, unless edited or enabled since.',button:'Undo import',onConfirm:()=>undo(id)})}
 async function undo(id){
  const batch=state.batches?.find(b=>b.id===id);
  // Undo of a door import keeps each monitor edited or enabled since and undoes the rest. A newer batch from the same
  // source still holding these monitors is undone first.
  const doorUndo=()=>until(batch.namespace,'undo',{planId:id.slice('business:'.length)},'undone').catch(error=>{throw error.status===409?Error('A newer batch from this source still holds these monitors. Undo that batch first.'):error});
  const result=await action(()=>batch?.namespace?doorUndo():send(`/api/definitions/batches/${encodeURIComponent(id)}/undo`,{body:'{}',type:'application/json'}),{pending:'Undoing batch…',success:'Batch undone. Anything edited or enabled since was left as is.'});
  if(result.ok){state.opened.add(id);await loadBatches()}
 }
 $('#definition-preview').onclick=preview;
 $('#definition-export').onclick=()=>action(async()=>{const file=await send('/api/definitions/export'),url=URL.createObjectURL(new Blob([JSON.stringify(file,null,2)+'\n'],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='uptime.monitors.json';a.click();URL.revokeObjectURL(url)},{success:'Monitors exported.'});
 showWay();showPreview();showBatches();loadBatches().catch(error=>{$('#definition-batches').innerHTML=`<p>${escape(error.message)}</p>`});
}
