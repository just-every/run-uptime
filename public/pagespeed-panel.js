// PERF-001 on a page-speed monitor's page: the latest check's budgets, DNS/connect/TLS/TTFB, Core Web Vitals, its resource waterfall
// and browser errors; then the synthetic report (page-speed checks) and the real-user report (sampled page views, public/pagespeed-rum.js)
// side by side, never summed; then the beacon's sampling settings, its snippet with what it measures and keeps, and erasing the site's
// data. It mounts itself into its own placeholder, reads only the owner API with the page's session and patches each read into place,
// so an open fold, a typed value and the scroll stay through a refresh.
import {escape,ago} from './console-format.js';
import {patch,firstMount} from './dom-patch.js';
import {rumMarkup,RUM_STYLES} from './pagespeed-rum.js';

export const PAGESPEED_KINDS={pagespeed:'Page speed'};
const labels={ttfbMs:'Time to first byte',fcpMs:'First contentful paint',lcpMs:'Largest contentful paint',cls:'Cumulative layout shift',tbtMs:'Total blocking time (lab proxy for INP)',loadMs:'Page load',transferBytes:'Transferred bytes',browserErrors:'Browser errors'};
const profiles={mobile:'Mobile · 390 × 844, touch, 4× CPU slowdown',desktop:'Desktop · 1350 × 940'};
const networks={'slow-4g':'slow 4G (150 ms round trip, 1.6 Mbit/s down)',none:'no network throttling'};
const shown=(key,value)=>value===null||value===undefined?'not observed':key==='cls'?Number(value).toFixed(3):key==='transferBytes'?`${Number(value).toLocaleString()} bytes`:key==='browserErrors'?String(value):`${Number(value).toLocaleString()} ms`;
const ms=value=>value===null||value===undefined?'—':`${Number(value).toLocaleString()} ms`;
const request=async(path,method='GET',body)=>{const response=await fetch(path,{method,credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const data=await response.json().catch(()=>({}));if(!response.ok)throw Object.assign(Error(data.error??`HTTP ${response.status}`),{status:response.status});return data};
const SAVE_FAILURE="Couldn't save. Your change is kept; it will be sent again when you leave the field.";
const saveFailure=error=>error.status===400&&['Sampling is a whole percentage from 1 to 100','Excluded paths are up to 20 path prefixes that start with /'].includes(error.message)?error.message:SAVE_FAILURE;
function styles(){
 if(document.getElementById('pagespeed-styles'))return;
 const style=document.createElement('style');style.id='pagespeed-styles';
 style.textContent=`.pagespeed .ps-table{width:100%;border-collapse:collapse;table-layout:fixed}.pagespeed .ps-table th,.pagespeed .ps-table td{text-align:left;padding:.25rem .4rem;border-bottom:1px solid var(--ui-border,#ddd);overflow-wrap:anywhere;vertical-align:top}
.pagespeed .ps-waterfall{list-style:none;padding:0;margin:0}.pagespeed .ps-waterfall li{padding:.3rem 0;border-bottom:1px solid var(--ui-border,#ddd)}.pagespeed .ps-url{overflow-wrap:anywhere;font-family:ui-monospace,monospace;font-size:13px}
.pagespeed .ps-track{position:relative;height:.6rem;background:var(--ui-surface-muted,#eee);border-radius:3px;overflow:hidden;margin-top:.2rem}.pagespeed .ps-bar{position:absolute;top:0;bottom:0;background:var(--ui-accent,#2f6fdb);min-width:2px}
.pagespeed .ps-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(9rem,1fr));gap:.5rem;margin:0}.pagespeed .ps-grid div{min-width:0}.pagespeed dd{margin:0;font-weight:600}.pagespeed .ps-reports{display:grid;gap:1rem}
.pagespeed #pagespeed-beacon>p{margin-top:12px}.pagespeed .ps-setting-heading{display:flex;align-items:center;justify-content:space-between;gap:.5rem;margin-top:.5rem}.pagespeed .ps-setting-heading label{margin:0;min-width:0}.pagespeed .ps-save-status{flex:none;min-width:4.75em;height:1.5em;line-height:1.5;text-align:right;font-size:14px}.pagespeed .ps-save-error{margin:.25rem 0 0;font-size:14px;line-height:1.4;overflow-wrap:anywhere}.pagespeed .ps-save-error:has(>span:empty){display:none}.pagespeed form label{display:block;margin-top:.5rem}.pagespeed form input[type=number],.pagespeed form textarea{width:100%;max-width:100%;box-sizing:border-box}.pagespeed code{overflow-wrap:anywhere;white-space:pre-wrap}
${RUM_STYLES}`;
 document.head.append(style);
}
/** The placeholder on the monitor's page; it fills itself once the page has been patched. */
export function pageSpeedPanel(m){
 if(m.definition.type!=='pagespeed')return '';
 queueMicrotask(()=>mount(m));
 return `<section class="ui-card panel pagespeed" id="pagespeed-panel" aria-labelledby="pagespeed-heading" data-owned="${escape(m.id)}"><div class="panel-head"><h2 id="pagespeed-heading">Page speed</h2><button type="button" class="ui-button" id="pagespeed-refresh">Refresh</button></div><div id="pagespeed-body">Loading page speed…</div><p id="pagespeed-status" role="status"></p></section>`;
}
function budgets(latest,settings){
 const rows=latest.checks.map(check=>{const key=check.assertion.replace(/^budget:/,'');const budget=settings.budgets[key];
  return `<tr data-check="${escape(check.assertion)}"><th scope="row">${escape(check.assertion==='status'?'Page status':labels[key]??key)}</th><td>${escape(check.assertion==='status'?`HTTP ${latest.evidence.status}`:shown(key,latest.figures[key]))}</td><td>${escape(check.assertion==='status'?'2xx':shown(key,budget))}</td><td><span class="ui-result ${check.pass?'passed':'failed'}">${check.pass?'Within budget':'Over budget'}</span></td></tr>`}).join('');
 return `<table class="ps-table" id="pagespeed-budgets"><caption class="ui-visually-hidden">Budgets of the latest check</caption><thead><tr><th scope="col">Figure</th><th scope="col">Latest</th><th scope="col">Budget</th><th scope="col">Result</th></tr></thead><tbody>${rows}</tbody></table>`;
}
function waterfall(e){
 const end=Math.max(1,...e.resources.map(r=>r.startMs+r.durationMs));
 const rows=e.resources.map((r,i)=>`<li data-resource="${i}"><div class="ps-url">${escape(r.url)}</div><div>${escape(r.type)} · starts ${escape(ms(r.startMs))} · takes ${escape(ms(r.durationMs))} · ${escape(Number(r.bytes).toLocaleString())} bytes${r.status?` · HTTP ${escape(r.status)}`:''}</div><div class="ps-track" aria-hidden="true"><span class="ps-bar" style="left:${(r.startMs/end*100).toFixed(2)}%;width:${(r.durationMs/end*100).toFixed(2)}%"></span></div></li>`).join('');
 return `<h3 id="pagespeed-waterfall-heading">Resource waterfall</h3><p>${e.resourceCount} request${e.resourceCount===1?'':'s'}${e.resourceCount>e.resources.length?`, the first ${e.resources.length} shown`:''}; times from the start of navigation.</p><ol class="ps-waterfall" id="pagespeed-waterfall" aria-labelledby="pagespeed-waterfall-heading">${rows}</ol>`;
}
function latestMarkup(report){
 const latest=report.latest,s=report.settings;
 if(!latest)return `<p>No page-speed check has finished yet. ${escape(profiles[s.device])} · ${escape(networks[s.throttle])}.</p>`;
 const e=latest.evidence,t=e.timings,v=e.vitals;
 const errors=e.errorCount?`<h3>Browser errors</h3><ul id="pagespeed-errors">${e.errors.map(x=>`<li data-kind="${escape(x.kind)}"><strong>${escape(x.kind)}</strong> · ${escape(x.text)}</li>`).join('')}</ul>${e.errorCount>e.errors.length?`<p>${e.errorCount-e.errors.length} more not kept.</p>`:''}`:'<p id="pagespeed-errors">The page produced no browser errors.</p>';
 return `<p>Latest check ${escape(ago(latest.completedAt))} from ${escape(latest.probe)} · ${escape(profiles[e.device])} · ${escape(networks[e.throttle])}.</p>${budgets(latest,s)}
<h3>Connection and vitals</h3><dl class="ps-grid" id="pagespeed-timings"><div><dt>DNS</dt><dd>${ms(t.dnsMs)}</dd></div><div><dt>Connect</dt><dd>${ms(t.connectMs)}</dd></div><div><dt>TLS</dt><dd>${t.tlsMs===null?'— (plain HTTP)':ms(t.tlsMs)}</dd></div><div><dt>TTFB</dt><dd>${ms(t.ttfbMs)}</dd></div>
<div><dt>FCP</dt><dd>${ms(v.fcpMs)}</dd></div><div><dt>LCP</dt><dd>${ms(v.lcpMs)}</dd></div><div><dt>CLS</dt><dd>${escape(v.cls.toFixed(3))}</dd></div><div><dt>TBT</dt><dd>${ms(v.tbtMs)}</dd></div></dl>
<p>Interaction to Next Paint needs a person's input, so a synthetic load reports total blocking time as its lab proxy; the real-user report shows INP.</p>${waterfall(e)}${errors}`;
}
// What the beacon measures and keeps (src/domain/rum/beacon-script.ts, door.server.ts and privacy.mjs); docs/monitors.md says the same.
const PRIVACY="The snippet measures page-load timings, layout shift and script errors, with each page's path, mobile or desktop, the country and, for US visitors, the state. It uses no cookies, and Uptime keeps no IP addresses, query strings or ID-like parts of paths. Nothing is sent without the visitor's consent, or when their browser sends Do Not Track or Global Privacy Control. You can erase all of this site's data.";
const statusId=name=>name==='samplePercent'?'pagespeed-save-status':`pagespeed-${name}-status`;
const saveStatus=(name,id)=>`<span class="ps-save-status" id="${statusId(name)}" role="status" data-owned="${escape(id)}"></span>`;
const saveError=(name,id)=>`<p class="ps-save-error" id="pagespeed-${name}-error" role="status" data-owned="${escape(id)}"><span></span></p>`;
function settingsMarkup(report,origin){
 const site=report.realUser?.report.site;
 if(!site)return `<h3>Real-user beacon</h3><p>Off. Registering ${escape(origin)} keeps the beacon off until you enable it; it then samples 10% of consenting visitors.</p><button type="button" class="ui-button" id="pagespeed-register">Register ${escape(origin)}</button>`;
 return `<h3>Real-user beacon</h3><form id="pagespeed-beacon"><p id="pagespeed-beacon-state">${escape(site.origin)} · ${site.enabled?'on':'off'}.</p>
<div class="ps-setting"><div class="ps-setting-heading"><label><input type="checkbox" name="enabled"${site.enabled?' checked':''} aria-describedby="pagespeed-enabled-status pagespeed-enabled-error"> Collect real-user figures</label>${saveStatus('enabled',site.id)}</div>${saveError('enabled',site.id)}</div>
<div class="ps-setting"><div class="ps-setting-heading"><label for="pagespeed-sample">Sample (% of consenting visitors)</label>${saveStatus('samplePercent',site.id)}</div><input id="pagespeed-sample" name="samplePercent" type="number" min="1" max="100" step="1" value="${site.samplePercent}" required aria-describedby="pagespeed-save-status pagespeed-samplePercent-error">${saveError('samplePercent',site.id)}</div>
<div class="ps-setting"><div class="ps-setting-heading"><label for="pagespeed-excluded">Excluded paths (one prefix per line)</label>${saveStatus('excludedPaths',site.id)}</div><textarea id="pagespeed-excluded" name="excludedPaths" rows="2" aria-describedby="pagespeed-excludedPaths-status pagespeed-excludedPaths-error">${escape(site.excludedPaths.join('\n'))}</textarea>${saveError('excludedPaths',site.id)}</div>
<p>Add to the site's pages: <code id="pagespeed-snippet">${escape(site.snippet)}</code></p><p>Then record consent: add <code>data-consent="granted"</code> to the tag only on pages served to a visitor who consented, or call <code>uptimeRum.consent()</code> from your consent banner.</p>
<p id="pagespeed-privacy">${escape(PRIVACY)}</p><details class="ps-erase" id="pagespeed-erase"><summary>Erase this site's data</summary><p>This erases the registration of ${escape(site.origin)} and every figure kept for it. The snippet on your pages then collects nothing. The anonymous audit remains.</p>
<p><button type="button" class="primary danger" id="pagespeed-erase-confirm" data-site="${escape(site.id)}">Erase all data</button></p></details></form>`;
}
async function mount(m){
 const host=document.getElementById('pagespeed-panel');if(!host||!firstMount(host))return;
 styles();
 const body=host.querySelector('#pagespeed-body'),status=host.querySelector('#pagespeed-status'),key=encodeURIComponent(m.id),origin=new URL(m.definition.url).origin;
 const settings=site=>({enabled:site.enabled,samplePercent:site.samplePercent,excludedPaths:site.excludedPaths});
 const values=form=>({enabled:form.elements.enabled.checked,samplePercent:Number(form.elements.samplePercent.value),excludedPaths:[...new Set(form.elements.excludedPaths.value.split('\n').map(x=>x.trim()).filter(Boolean))]});
 const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const say=(name,text='')=>{
  const feedback=host.querySelector(`#${statusId(name)}`),error=host.querySelector(`#pagespeed-${name}-error>span`);
  if(feedback)feedback.textContent=text==='Saved'?'Saved':text?'Not saved':'';
  if(error)error.textContent=text==='Saved'?'':text;
 };
 // Only owner input can authorize a field in a PATCH, including a retry after failure.
 const edited=new Set();
 let siteId,saved,saving=false,pending=false,timer;
 const load=async()=>{try{const report=await request(`/api/monitors/${key}/pagespeed`);if(!host.isConnected)return;
  const site=report.realUser?.report.site;
  // dom-patch preserves live controls; refresh only values with no unconfirmed edit.
  const previous=saved,form=host.querySelector('#pagespeed-beacon'),live=form?values(form):null;
  const clean=Object.keys(previous??{}).filter(name=>equal(live?.[name],previous[name]));
  if(siteId!==site?.id)edited.clear();
  siteId=site?.id;saved=site?settings(site):null;
  if(previous&&saved)for(const name of clean)if(!equal(previous[name],saved[name]))say(name);
  patch(body,`${latestMarkup(report)}<div class="ps-reports"><section aria-labelledby="pagespeed-synthetic-heading"><h3 id="pagespeed-synthetic-heading">Synthetic checks</h3><p id="pagespeed-synthetic-denominator">${report.checks} page-speed check${report.checks===1?'':'s'}, ${report.overBudget} over budget.</p></section><section aria-labelledby="pagespeed-rum-heading"><h3 id="pagespeed-rum-heading">Real users</h3>${rumMarkup(report.realUser)}</section></div>${settingsMarkup(report,origin)}`);
  const refreshed=host.querySelector('#pagespeed-beacon');
  if(saved&&refreshed)for(const name of clean){
   const control=refreshed.elements[name];
   if(name==='enabled')control.checked=saved[name];
   else control.value=name==='excludedPaths'?saved[name].join('\n'):saved[name];
   edited.delete(name);
  }}
  catch(error){if(host.isConnected)body.textContent="Couldn't load page speed. Try Refresh again."}};
 host.addEventListener('click',async event=>{
  if(event.target.closest('#pagespeed-refresh'))await load();
  if(event.target.closest('#pagespeed-register')){try{await request('/api/rum/sites','POST',{origin});status.textContent='Registered. The beacon stays off until you enable it.';await load()}catch(error){status.textContent="Couldn't register this site. Try again."}}
  const erase=event.target.closest('#pagespeed-erase-confirm');
  if(erase){erase.disabled=true;try{await request(`/api/rum/sites/${encodeURIComponent(erase.dataset.site)}`,'DELETE');status.textContent=`Erased all real-user data for ${origin}.`;await load()}catch(error){if(error.status===404){await load();status.textContent='Already erased.'}else{status.textContent="Couldn't erase this site's data. Try again.";erase.disabled=false}}}
 });
 // One write at a time: an edit made during a request is compared with its confirmed response next.
 // Patch only the saved state line; the live controls and focus stay in place, including after errors.
 const save=async()=>{
  clearTimeout(timer);pending=true;if(saving)return;
  saving=true;
  try{while(pending&&host.isConnected){
   pending=false;
   const form=host.querySelector('#pagespeed-beacon');if(!form||!siteId)break;
   const next=values(form),changes=Object.fromEntries([...edited].filter(name=>!equal(next[name],saved[name])).map(name=>[name,next[name]]));
   for(const name of [...edited])if(equal(next[name],saved[name])){
    edited.delete(name);if(host.querySelector(`#${statusId(name)}`).textContent!=='Saved')say(name);
   }
   if(!Object.keys(changes).length)continue;
   if(!form.checkValidity()){say('samplePercent',form.elements.samplePercent.validity.valid?form.querySelector(':invalid').validationMessage:'Sampling is a whole percentage from 1 to 100');continue}
   try{
    const site=await request(`/api/rum/sites/${encodeURIComponent(siteId)}`,'PATCH',changes);
    saved=settings(site);
    const live=values(form);
    for(const name of Object.keys(changes))if(equal(live[name],next[name])){edited.delete(name);say(name,'Saved')}
    if(!host.isConnected)return;
    form.querySelector('#pagespeed-beacon-state').textContent=`${site.origin} · ${site.enabled?'on':'off'}.`;
   }catch(error){if(host.isConnected){
    const live=values(form);
    for(const name of Object.keys(changes))if(equal(live[name],next[name]))say(name,saveFailure(error));
   }}
  }}finally{saving=false}
 };
 host.addEventListener('submit',event=>{if(event.target.matches('#pagespeed-beacon')){event.preventDefault();void save()}});
 host.addEventListener('input',event=>{
  const form=event.target.closest('#pagespeed-beacon');if(!form)return;
  edited.add(event.target.name);say(event.target.name);
  clearTimeout(timer);if(event.target.type!=='checkbox')timer=setTimeout(save,500);
 });
 host.addEventListener('change',event=>{if(event.target.matches('#pagespeed-beacon input,#pagespeed-beacon textarea')){edited.add(event.target.name);void save()}});
 host.addEventListener('focusout',event=>{if(event.target.matches('#pagespeed-beacon input,#pagespeed-beacon textarea'))void save()});
 await load();
}
