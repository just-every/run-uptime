// What the console shows for a browser flow (FLOW-001) on the monitor's existing page: what the flow says it tests, the outcomes it
// requires, which revision is running and how the requirements moved between revisions, and each check's step trace in plain
// words. A passing flow is evidence of that flow only, and the wording here never says more.
import {escape,duration,humaneDuration} from './console-format.js';

const kinds={goto:'Opened a page',click:'Clicked',fill:'Filled a field from a runner credential',waitFor:'Waited for',expect:'Expected',outcome:'Required outcome'};
const reasons={
 expectation_not_met:'what the flow expects did not appear',element_missing:'no matching element was on the page',outcome_missing:'a required outcome was not observed',
 http_status:'the page answered with an error status',wall_time_exceeded:'the flow ran past its time limit',steps_limit:'the flow has more steps than the limit',pages_limit:'the flow loaded more pages than the limit',
 bytes_limit:'the flow downloaded more than the limit',trace_limit:'the step trace grew past its limit',blocked_request:'the page tried to reach a forbidden network address',undeclared_origin:'the page tried to leave the origins the flow declares',
 extra_page:'the page tried to open a second window',navigation_failed:'the page could not be loaded',credential_origin_mismatch:'the credential is bound to a different origin than the page',
};
const limitNames={wallMs:'time (wallMs)',maxSteps:'steps (maxSteps)',maxPages:'pages (maxPages)',maxBytes:'response bytes (maxBytes)',traceBytes:'trace size (traceBytes)'};
const blocked={private_address:'a private address',loopback_address:'a loopback address',link_local_or_metadata_address:'a link-local or metadata address',not_granted:'an address outside the local grant',unresolved_host:'an unresolvable host',custody:'a server that is not the granted fixture'};
const browsers={chromium:'Chromium',firefox:'Firefox',webkit:'WebKit'};
const devices={desktop:'Desktop · 1280 × 800',mobile:'Mobile · 390 × 844, touch'};
const profileText=f=>`${browsers[f?.browser??'chromium']} · ${devices[f?.device??'desktop']}`;

export const isFlow=definition=>definition?.type==='flow';
export function describeExpectation(item){
 if(item.what==='text')return `the text “${item.value}”`;
 if(item.what==='url')return `a URL ${item.match==='prefix'?'starting with':'at'} ${item.value}`;
 const t=item.target??{};
 return `an element: ${t.css??t.text??t.label??`${t.role} “${t.name}”`}`;
}
export function flowSummary(definition){
 const f=definition.flow;
 return '<dl class="assertion-summary flow-expectations">'
  +`<div><dt>Intent</dt><dd>${escape(f.intent)}</dd></div>`
  +`<div><dt>Required outcomes</dt><dd>${f.outcomes.map(o=>`<span class="expect-chip">${escape(o.id)}: ${escape(describeExpectation(o))}</span>`).join(' ')}</dd></div>`
  +`<div><dt>Steps</dt><dd>${f.steps.length}</dd></div></dl>`;
}
function noBrowser(m,data){
 const runners=data?.runner?.runners??[],assigned=Object.values(m.definition.assignments??{}).map(a=>runners.find(r=>r.runnerId===a.runnerId)).filter(Boolean);
 const selected=m.definition.flow.browser??'chromium';
 return assigned.some(r=>r.capabilities?.browsers?r.capabilities.browsers[selected]!==true:selected!=='chromium'||r.capabilities?.browser!==true);
}
export function flowPanel(m,data){
 const change=m.state?.definitionChange;
 return `<section class="ui-card panel flow" aria-labelledby="flow-heading"><h2 id="flow-heading">Browser flow</h2>`
  +`<p class="flow-limit">A pass is evidence of this flow only. It says nothing about pages or steps the flow does not visit.</p>`
  +`<dl class="detail-metrics ui-dl"><div><dt>Revision running</dt><dd id="flow-revision">${escape(m.revision)}</dd></div><div><dt>Browser and device</dt><dd id="flow-selected-profile">${escape(profileText(m.definition.flow))}</dd></div></dl>`
  +`<p>Each monitor checks one browser and device combination. Create separate monitors for other combinations; each keeps its own health, incidents and report. <a href="/docs/browser-flows">Browser journey instructions</a></p>`
  +`<form id="flow-profile-settings" data-monitor-id="${escape(m.id)}" data-revision="${m.revision}" aria-describedby="flow-profile-help"><p><label for="flow-browser">Browser</label><select id="flow-browser" name="browser">${Object.entries(browsers).map(([value,label])=>`<option value="${value}" ${value===(m.definition.flow.browser??'chromium')?'selected':''}>${label}</option>`).join('')}</select></p><p><label for="flow-device">Device profile</label><select id="flow-device" name="device">${Object.entries(devices).map(([value,label])=>`<option value="${value}" ${value===(m.definition.flow.device??'desktop')?'selected':''}>${label}</option>`).join('')}</select></p><p id="flow-profile-help">Saving creates a new revision. A pass with another profile does not prove the earlier profile recovered. Mobile is a browser viewport and touch profile, not a native device test.</p><button type="submit" id="save-flow-profile">Save browser and device</button><p id="flow-profile-feedback" role="status"></p></form>`
  +(change?`<p class="ui-callout" id="flow-changed" data-state="degraded">Changed definition: revision ${escape(change.toRevision)} no longer requires ${escape(change.removed.join('; '))}, which revision ${escape(change.fromRevision)} required when this incident began. A pass now does not show the original flow works.</p>`:'')
  +(noBrowser(m,data)?`<p class="ui-callout" id="flow-no-browser" data-state="unknown"><span>An assigned runner cannot run ${escape(browsers[m.definition.flow.browser??'chromium'])}, so its coverage is Unknown. Install the selected engine with <code>pnpm exec playwright install ${escape(m.definition.flow.browser??'chromium')}</code> and restart that runner.</span></p>`:'')
  +`<div id="flow-revisions" class="flow-revisions"></div></section>`;
}
export function flowRevisions(revisions){
 const rows=revisions.filter(r=>r.definition?.type==='flow');
 if(!rows.length)return '';
 const text=r=>{const c=r.flowChange;if(!c)return 'first revision';if(c.change==='shrank')return `requirements changed; no longer requires ${c.removed.join('; ')}`;if(c.change==='grew')return `required outcomes grew from ${c.from} to ${c.to}`;return 'required outcomes unchanged'};
 const weakened=rows[0]?.flowChange?.change==='shrank'?`<p class="ui-callout" id="flow-weakened" data-state="degraded">Compared with revision ${escape(rows[1]?.revision??'')}, ${escape(rows[0].flowChange.removed.join('; '))} ${rows[0].flowChange.removed.length===1?'is':'are'} no longer required. A pass under this changed definition does not prove the earlier requirements recovered.</p>`:'';
 return `${weakened}<h3 id="flow-revisions-heading">Revision history</h3><ol class="flow-history">${rows.map(r=>`<li data-change="${escape(r.flowChange?.change??'first')}"><span class="ui-mono">Revision ${escape(r.revision)}</span> · ${escape(profileText(r.definition.flow))} · ${escape(new Date(r.start).toLocaleString())} · ${escape(text(r))}</li>`).join('')}</ol>`;
}
const outcomeWords={pass:['passed','Passed'],fail:['failed','Failed'],skipped:['unknown','Skipped']};
export function traceMarkup(o){
 const f=o.flow;
 if(!f)return '';
 const failure=f.failure,limit=failure?.limit?` Limit: ${limitNames[failure.limit]??failure.limit}.`:'',why=failure?`${reasons[failure.reason]??failure.reason}${failure.blocked?` (${blocked[failure.blocked]??failure.blocked})`:''}${failure.status?` (HTTP ${failure.status})`:''}.${limit}`:'';
 return `<div class="flow-trace-wrap"><p class="flow-trace-head">${escape(profileText(f.profile))} · Step trace${failure?` · failed at step ${failure.step===undefined?'?':failure.step+1}: ${escape(why)}`:' · every step passed and every required outcome was observed'}</p>`
  +`<ol class="flow-trace">${f.trace.map(e=>{const [tone,label]=outcomeWords[e.outcome]??['unknown','Unknown'];
    return `<li data-step="${escape(e.i)}"><span class="ui-result ${tone}">${label}</span> ${escape(kinds[e.kind]??e.kind)}${e.expect?` ${escape(e.expect)}`:''}${e.url?` · <span class="ui-mono">${escape(e.url)}</span>`:''}${e.reason&&e.outcome==='fail'?` · ${escape(reasons[e.reason]??e.reason)}`:''} · ${escape(duration(e.ms))}</li>`}).join('')}</ol>`
  +`<p class="flow-trace-foot">Final page <span class="ui-mono">${escape(f.finalUrl||'none')}</span> · ${escape(f.pages)} page${f.pages===1?'':'s'} · ${escape(humaneDuration(Math.max(0,o.durationMs??0)))}</p></div>`;
}

export function retainFlowProfile(area,m){
 const form=area.querySelector('#flow-profile-settings');
 if(!form||form.dataset.monitorId!==m.id||form.dataset.revision!==String(m.revision))return null;
 const focused=form.contains(document.activeElement)?document.activeElement:null;
 form.remove();return {form,focused};
}
export function bindFlowProfile(area,m,{api,action},retained){
 const form=area.querySelector('#flow-profile-settings');if(!form)return;
 if(retained){form.replaceWith(retained.form);retained.focused?.focus({preventScroll:true});return}
 form.onsubmit=async event=>{
  event.preventDefault();
  const fields=new FormData(form),browser=fields.get('browser'),device=fields.get('device'),feedback=form.querySelector('#flow-profile-feedback');
  if(browser===(m.definition.flow.browser??'chromium')&&device===(m.definition.flow.device??'desktop')){feedback.textContent='This browser and device are already saved.';return}
  const result=await action(()=>api(`/api/monitors/${encodeURIComponent(m.id)}`,'PATCH',{...m.definition,flow:{...m.definition.flow,browser,device}}),{pending:'Saving browser and device…',success:'Browser and device saved in a new revision. New scheduled evidence is required.'});
  if(!result.ok&&form.isConnected)feedback.textContent='Browser and device were not saved. '+(result.error?.message??'Review the action error and try again.');
 };
}
