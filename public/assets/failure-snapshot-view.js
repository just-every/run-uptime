// Every evidence value is rendered through native DOM text/attributes, never parsed as markup.
const node=(tag,text,parent)=>{const value=document.createElement(tag);if(text!==undefined)value.textContent=String(text);parent?.append(value);return value};
const paragraph=(parent,text)=>node('p',text,parent);
function table(parent,caption,columns,rows){
 const wrap=node('div',undefined,parent);wrap.style.overflow='auto';if(columns.length>4){wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label',caption)}const value=node('table',undefined,wrap);if(columns.length>4)value.style.minWidth='42rem';node('caption',caption,value);const head=node('tr',undefined,node('thead',undefined,value));
 for(const column of columns)node('th',column,head).scope='col';const body=node('tbody',undefined,value);
 for(const row of rows){const tr=node('tr',undefined,body);for(const [index,text]of row.entries()){const td=node('td',text,tr);td.style.overflowWrap='anywhere';if(columns.length>4&&index>0)td.style.whiteSpace='nowrap'}}
}
function excerpt(parent,label,text){node('h3',label,parent);const pre=node('pre',text,parent);pre.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;max-height:24rem;overflow:auto';return pre}
function diagnostics(parent,s,label){
 const phases=s.phases??s.diagnostics?.phases,d=s.diagnostics;
 if(!phases&&!d){paragraph(parent,'Connection diagnostics unavailable: this attempt predates phase capture.');return}
 const area=node('section',undefined,parent);area.setAttribute('aria-label',`Connection diagnostics · ${label}`);node('h3','Connection phases',area);
 table(area,'Measured final exchange',['Phase','Duration'],Object.entries({DNS:phases.dnsMs,'TCP connect':phases.connectMs,'TLS handshake':phases.tlsMs,'Time to response headers':phases.ttfbMs,'Original check':phases.totalMs}).map(([name,ms])=>[name,ms===null?'Unavailable':`${ms} ms`]));
 paragraph(area,'Phases describe the final exchange at this location. Unmeasured phases are unavailable. Diagnostic collection is separate from the check duration and never changes its outcome.');
 if(d){node('h3',`Route diagnostics · ${d.category}`,area);if(d.route.reason)paragraph(area,`Route diagnostic unavailable: ${d.route.reason}. A blocked hop does not prove a target outage.`);if(d.route.hops.length)table(area,`Bounded ${d.route.tool} · at most five hops, one packet per hop`,['Hop','Address','Loss','Round trip'],d.route.hops.map(h=>[h.hop,h.address??'No reply',`${h.lossPercent}%`,h.rttMs===null?'Unavailable':`${h.rttMs} ms`]))}
}
function unavailable(parent,label,reason){paragraph(parent,`${label} unavailable: ${reason}. Artifact capture failure is separate from the failed check; its verdict remains recorded.`)}
function browserArtifacts(parent,s){
 const a=s.artifacts;if(!a)return;
 node('h3','Browser replay video',parent);
 if(a.video.unavailable)unavailable(parent,'Video',a.video.unavailable);else{
  paragraph(parent,'Replay of redacted step frames. It omits activity between captured frames.');
  const video=node('video',undefined,parent);video.controls=true;video.muted=true;video.preload='metadata';video.setAttribute('aria-label','Redacted browser step replay');video.style.cssText='display:block;width:100%;max-width:1000px';video.src=`data:video/webm;base64,${a.video.data}`;
 }
 node('h3','Native browser trace',parent);
 if(a.trace.unavailable)unavailable(parent,'Trace',a.trace.unavailable);else{paragraph(parent,'Sanitized native action and timing metadata. DOM snapshots, network payloads, credentials and source files are omitted.');const link=node('a','Download sanitized trace ZIP',parent);link.href=`data:application/zip;base64,${a.trace.data}`;link.download='uptime-browser-trace.zip'}
 node('h3','Network waterfall',parent);
 if(a.waterfall.length)table(parent,'Bounded requests · query strings and fragments removed',['Request','Method','Status','Start','Duration'],a.waterfall.map(r=>[r.url,r.method,r.status??'Unavailable',`${r.startMs} ms`,`${r.durationMs} ms`]));else paragraph(parent,'No retained waterfall requests. Capture may be unavailable or removed by policy.');
 node('h3','Browser console errors and warnings',parent);
 if(a.console.length){const list=node('ul',undefined,parent);for(const line of a.console){const item=node('li',`${line.type}: ${line.text}`,list);item.style.overflowWrap='anywhere'}}else paragraph(parent,'No retained console errors or warnings. Capture may be unavailable or removed by policy.');
}
export function renderSnapshots(target,items,name=probe=>probe){
 target.replaceChildren();
 if(!items.length){paragraph(target,'No retained failure snapshots in this selection. Missing snapshots are not evidence of success.');return}
 for(const row of items){
  const s=row.snapshot;
  if(s.unavailable){paragraph(target,`Snapshot unavailable: capture failed its safety checks. The failed attempt remains recorded (${name(row.probe)}).`);continue}
  const protocol=['TCP','TLS','DNS','UDP','PING','MAIL'].includes(s.method),flow=Boolean(s.artifacts||row.flow),details=node('details',undefined,target);details.className='failure-snapshot';
  node('summary',`${protocol?`${s.method} failure`:flow?'Browser flow failure':`HTTP ${s.status??'unavailable'}`} · ${name(row.probe)} · ${new Date(row.captured_at).toLocaleString()}`,details);
  paragraph(details,`Revision ${row.revision} · attempt ${row.attempt+1} · ${s.durationMs} ms`);
  const reference=paragraph(details,`Immutable reference: observation ${row.observation_id} · slot ${row.slot_id}`);reference.style.overflowWrap='anywhere';
  paragraph(details,`${s.method} ${s.url}`).style.overflowWrap='anywhere';
  paragraph(details,`Expires ${new Date(row.expires_at).toLocaleString()}. Diagnostic context; monitoring evidence and verdict are unchanged.`);
  if(row.healthyPeers?.length)table(details,'Healthy locations in the same check',['Location','Healthy evidence'],row.healthyPeers.map(peer=>[name(peer.probe),`${peer.outcome} · ${peer.durationMs} ms · ${peer.checks.map(check=>check.reason).join('; ')}`]));
  if(row.flow){paragraph(details,`Flow digest: ${row.flow.digest}`).style.overflowWrap='anywhere';table(details,'Step duration from the signed observation',['Step','Action','Outcome','Duration'],row.flow.trace.map(step=>[step.i+1,step.kind,step.outcome,`${step.ms} ms`]))}
  if(s.redirects.length){node('h3','Redirects',details);const list=node('ul',undefined,details);for(const url of s.redirects)node('li',url,list).style.overflowWrap='anywhere'}
  const headers=values=>Object.entries(values).map(([name,value])=>`${name}: ${value}`).join('\n');
  if(!flow){if(!protocol){excerpt(details,'Request headers',headers(s.requestHeaders));excerpt(details,'Response headers',headers(s.responseHeaders))}diagnostics(details,s,`${name(row.probe)} · ${new Date(row.captured_at).toLocaleString()} · attempt ${row.attempt+1}`)}
  if(s.screenshot){node('h3','Redacted page screenshot',details);if(s.screenshot.unavailable)unavailable(details,'Screenshot',s.screenshot.unavailable);else{
   paragraph(details,flow?'Redacted browser failure frame. Masked fields and known credentials are removed before capture.':'Sanitized rendering of the received excerpt; scripts, styles and media removed. No additional target request.');
   const img=node('img',undefined,details);img.className='failure-page-image';img.src=`data:image/png;base64,${s.screenshot.data}`;img.width=1000;img.height=700;img.style.cssText='display:block;width:100%;height:auto;border:1px solid #d9deea';img.alt='Redacted failure page received by this attempt';
  }}
  browserArtifacts(details,s);
  if(!protocol){const pre=excerpt(details,`${flow?'Failure and steps':'Response excerpt'}${s.bodyTruncated?' · truncated at capture bound':''}`,s.body||'(empty response)');pre.className='failure-excerpt';pre.tabIndex=0;pre.setAttribute('role','region');pre.setAttribute('aria-label',`${flow?'Redacted browser failure excerpt':'Redacted response excerpt'} · ${name(row.probe)} · ${new Date(row.captured_at).toLocaleString()} · attempt ${row.attempt+1}`);}
 }
}
