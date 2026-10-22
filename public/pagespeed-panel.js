// PERF-001 on a page-speed monitor's page: the latest check's budgets, DNS/connect/TLS/TTFB, Core Web Vitals, its resource waterfall
// and browser errors; then the synthetic report (page-speed checks) and the real-user report (sampled page views) side by side,
// never summed; then the beacon's privacy and sampling settings for the monitor's site. It mounts itself into its own placeholder
// and reads only the owner API with the page's session.
import {escape,ago} from './console-format.js';
import {firstMount} from './dom-patch.js';

export const PAGESPEED_KINDS={pagespeed:'Page speed'};
const labels={ttfbMs:'Time to first byte',fcpMs:'First contentful paint',lcpMs:'Largest contentful paint',cls:'Cumulative layout shift',tbtMs:'Total blocking time (lab proxy for INP)',loadMs:'Page load',transferBytes:'Transferred bytes',browserErrors:'Browser errors'};
const profiles={mobile:'Mobile · 390 × 844, touch, 4× CPU slowdown',desktop:'Desktop · 1350 × 940'};
const networks={'slow-4g':'slow 4G (150 ms round trip, 1.6 Mbit/s down)',none:'no network throttling'};
const shown=(key,value)=>value===null||value===undefined?'not observed':key==='cls'?Number(value).toFixed(3):key==='transferBytes'?`${Number(value).toLocaleString()} bytes`:key==='browserErrors'?String(value):`${Number(value).toLocaleString()} ms`;
const ms=value=>value===null||value===undefined?'—':`${Number(value).toLocaleString()} ms`;
const request=async(path,method='GET',body)=>{const response=await fetch(path,{method,credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data.error??`HTTP ${response.status}`);return data};
function styles(){
 if(document.getElementById('pagespeed-styles'))return;
 const style=document.createElement('style');style.id='pagespeed-styles';
 style.textContent=`.pagespeed .ps-table{width:100%;border-collapse:collapse;table-layout:fixed}.pagespeed .ps-table th,.pagespeed .ps-table td{text-align:left;padding:.25rem .4rem;border-bottom:1px solid var(--ui-border,#ddd);overflow-wrap:anywhere;vertical-align:top}
.pagespeed .ps-waterfall{list-style:none;padding:0;margin:0}.pagespeed .ps-waterfall li{padding:.3rem 0;border-bottom:1px solid var(--ui-border,#ddd)}.pagespeed .ps-url{overflow-wrap:anywhere;font-family:ui-monospace,monospace;font-size:.85em}
.pagespeed .ps-track{position:relative;height:.6rem;background:var(--ui-surface-muted,#eee);border-radius:3px;overflow:hidden;margin-top:.2rem}.pagespeed .ps-bar{position:absolute;top:0;bottom:0;background:var(--ui-accent,#2f6fdb);min-width:2px}
.pagespeed .ps-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(9rem,1fr));gap:.5rem;margin:0}.pagespeed .ps-grid div{min-width:0}.pagespeed dd{margin:0;font-weight:600}.pagespeed .ps-reports{display:grid;gap:1rem}
.pagespeed form label{display:block;margin-top:.5rem}.pagespeed form input[type=number],.pagespeed form textarea{width:100%;max-width:100%;box-sizing:border-box}.pagespeed code{overflow-wrap:anywhere;white-space:pre-wrap}`;
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
  return `<tr data-check="${escape(check.assertion)}"><th scope="row">${escape(check.assertion==='status'?'Page status':labels[key]??key)}</th><td>${escape(check.assertion==='status'?`HTTP ${latest.evidence.status}`:shown(key,latest.figures[key]))}</td><td>${escape(check.assertion==='status'?'2xx':shown(key,budget))}</td><td><span class="ui-result ${check.pass?'healthy':'failing'}">${check.pass?'Within budget':'Over budget'}</span></td></tr>`}).join('');
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
function rumMarkup(rum){
 if(!rum)return '<p>No real-user beacon is registered for this site.</p>';
 const r=rum.report,dropped=Object.entries(r.dropped).map(([reason,count])=>`${count} ${reason==='bot'?'from bots':'on excluded paths'}`).join(', ');
 const rows=r.rows.map(x=>`<tr data-route="${escape(x.route)}" data-device="${escape(x.device)}"><th scope="row">${escape(x.route)}</th><td>${escape(x.device)}</td><td>${escape(x.region)}</td><td>${x.views}</td><td>${x.availability?`${x.availability.percent}% of ${x.availability.of}`:'—'}</td><td>${x.lcpMs.average===null?'—':`${escape(ms(x.lcpMs.average))} (${x.lcpMs.poorPercent}% slow)`}</td><td>${x.inpMs.average===null?'—':escape(ms(x.inpMs.average))}</td><td>${x.cls.average===null?'—':escape(x.cls.average.toFixed(3))}</td></tr>`).join('');
 return `<p id="pagespeed-rum-denominator">${r.views} sampled page view${r.views===1?'':'s'} in the last ${r.hours} hours${dropped?`; not counted: ${escape(dropped)}`:''}.</p>${r.rows.length?`<table class="ps-table" id="pagespeed-rum"><caption class="ui-visually-hidden">Real users by route, device and country</caption><thead><tr><th scope="col">Route</th><th scope="col">Device</th><th scope="col">Country</th><th scope="col">Views</th><th scope="col">Loaded</th><th scope="col">LCP</th><th scope="col">INP</th><th scope="col">CLS</th></tr></thead><tbody>${rows}</tbody></table>`:''}`;
}
function settingsMarkup(report,origin){
 const site=report.realUser?.report.site;
 if(!site)return `<h3>Real-user beacon</h3><p>Off. Registering ${escape(origin)} keeps the beacon off until you enable it; it then samples 10% of consenting visitors.</p><button type="button" class="ui-button" id="pagespeed-register">Register ${escape(origin)}</button>`;
 return `<h3>Real-user beacon</h3><form id="pagespeed-beacon"><p>${escape(site.origin)} · ${site.enabled?'on':'off'}. Kept: anonymous hourly figures by route, device and country. Never kept: cookies, query strings, fragments, identifiers or IP addresses. Do Not Track, Global Privacy Control and automated browsers are never measured, and nothing is measured before the site records consent.</p>
<label><input type="checkbox" name="enabled"${site.enabled?' checked':''}> Collect real-user figures</label><label for="pagespeed-sample">Sample (% of consenting visitors)</label><input id="pagespeed-sample" name="samplePercent" type="number" min="1" max="100" step="1" value="${site.samplePercent}">
<label for="pagespeed-excluded">Excluded paths (one prefix per line)</label><textarea id="pagespeed-excluded" name="excludedPaths" rows="2">${escape(site.excludedPaths.join('\n'))}</textarea><p><button type="submit" class="ui-button">Save beacon settings</button></p>
<p>Add to the site's pages: <code id="pagespeed-snippet">${escape(site.snippet)}</code></p><p>Then record consent: add <code>data-consent="granted"</code> to the tag only on pages served to a visitor who consented, or call <code>uptimeRum.consent()</code> from your consent banner.</p></form>`;
}
async function mount(m){
 const host=document.getElementById('pagespeed-panel');if(!host||!firstMount(host))return;
 styles();
 const body=host.querySelector('#pagespeed-body'),status=host.querySelector('#pagespeed-status'),key=encodeURIComponent(m.id),origin=new URL(m.definition.url).origin;
 const load=async()=>{try{const report=await request(`/api/monitors/${key}/pagespeed`);if(!host.isConnected)return;
  body.innerHTML=`${latestMarkup(report)}<div class="ps-reports"><section aria-labelledby="pagespeed-synthetic-heading"><h3 id="pagespeed-synthetic-heading">Synthetic checks</h3><p id="pagespeed-synthetic-denominator">${report.checks} page-speed check${report.checks===1?'':'s'}, ${report.overBudget} over budget.</p></section><section aria-labelledby="pagespeed-rum-heading"><h3 id="pagespeed-rum-heading">Real users</h3>${rumMarkup(report.realUser)}</section></div>${settingsMarkup(report,origin)}`}
  catch(error){if(host.isConnected)body.textContent=error.message}};
 host.addEventListener('click',async event=>{
  if(event.target.closest('#pagespeed-refresh'))await load();
  if(event.target.closest('#pagespeed-register')){try{await request('/api/rum/sites','POST',{origin});status.textContent='Registered. The beacon stays off until you enable it.';await load()}catch(error){status.textContent=error.message}}
 });
 host.addEventListener('submit',async event=>{
  const form=event.target.closest('#pagespeed-beacon');if(!form)return;event.preventDefault();
  const report=await request(`/api/monitors/${key}/pagespeed`),site=report.realUser?.report.site;if(!site)return;
  try{await request(`/api/rum/sites/${encodeURIComponent(site.id)}`,'PATCH',{enabled:form.elements.enabled.checked,samplePercent:Number(form.elements.samplePercent.value),excludedPaths:form.elements.excludedPaths.value.split('\n').map(x=>x.trim()).filter(Boolean)});status.textContent='Beacon settings saved.';await load()}
  catch(error){status.textContent=error.message}
 });
 await load();
}
