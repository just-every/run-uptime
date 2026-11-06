// PERF-001's real-user report inside a page-speed monitor's Page speed section (public/pagespeed-panel.js). Visits by country and,
// beside them, by US state. Then each route, device and country with LCP, INP and CLS as the typical value (p50) and the slow end
// (p75), each rated Good, Needs work or Poor, and the metric's own sample count. Older figures that kept only sums show their
// average, never an invented percentile; a metric with no sample says so. Each list shows the top few by views and folds the rest
// behind one control. A US visit without a state and a visit from outside the US are never given a state.
import {escape} from './console-format.js';

// Core Web Vitals thresholds (web.dev/articles/vitals): Good up to the first, Poor above the second.
const RATINGS={lcpMs:[2500,4000],inpMs:[200,500],cls:[0.1,0.25]};
const METRICS=['lcpMs','inpMs','cls'],TOP=5;
// ISO 3166-2:US, the codes the edge gives for a US visitor's state (src/domain/rum/door.server.ts).
const STATES={AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',
 HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',
 MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',
 NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',
 SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',
 DC:'District of Columbia',AS:'American Samoa',GU:'Guam',MP:'Northern Mariana Islands',PR:'Puerto Rico',UM:'U.S. Minor Outlying Islands',VI:'U.S. Virgin Islands'};
const regions=new Intl.DisplayNames(['en'],{type:'region'});
// The door keeps "unknown" when the edge named no country, and the edge's own XX (unknown) and T1 (Tor) as they came; any other
// code the browser cannot name shows as it is.
const UNNAMED={unknown:'Not known',XX:'Not known',T1:'Tor network'};
const countryName=code=>{if(UNNAMED[code])return UNNAMED[code];try{return regions.of(code)}catch{return code}};
const devices={mobile:'Mobile',desktop:'Desktop'};
const count=(n,word)=>`${n.toLocaleString()} ${word}${n===1?'':'s'}`;
const shown=(metric,value)=>metric==='cls'?Number(value).toFixed(3):`${Math.round(value).toLocaleString()} ms`;
function rated(metric,value){
 const [good,poor]=RATINGS[metric],[tone,word]=value<=good?['good','Good']:value<=poor?['needs-work','Needs work']:['poor','Poor'];
 return `<span class="ui-result ps-rating ${tone}">${word}</span>`;
}
const figure=(metric,key,value)=>`<span class="ps-value" data-figure="${metric}:${key}">${escape(shown(metric,value))}</span>`;
// The cells of one value row (Typical, Slow end or Samples) for the three metrics. A metric without percentiles fills its column
// once: its average across the two value rows, or "No samples" across all three.
function cells(x,line){
 return METRICS.map(metric=>{const m=x[metric],p=m.percentiles;
  if(p.of)return line==='p50'||line==='p75'?`<td>${figure(metric,line,p[line])} ${rated(metric,p[line])}</td>`:`<td>${p.of.toLocaleString()}</td>`;
  if(m.average!==null)return line==='p50'?`<td rowspan="2">${figure(metric,'average',m.average)} <span class="ps-quiet">average</span></td>`:line==='of'?`<td>${m.of.toLocaleString()}</td>`:'';
  return line==='p50'?'<td rowspan="3" class="ps-none">No samples</td>':'';
 }).join('');
}
// Figures kept before percentiles existed: one Average row, and "No samples" for a metric they never measured.
const averages=x=>`<tr><th scope="row">Average</th>${METRICS.map(metric=>x[metric].average===null?'<td rowspan="2" class="ps-none">No samples</td>':`<td>${figure(metric,'average',x[metric].average)}</td>`).join('')}</tr>`
 +`<tr><th scope="row">Samples</th>${METRICS.map(metric=>x[metric].average===null?'':`<td>${x[metric].of.toLocaleString()}</td>`).join('')}</tr>`;
function group(x){
 const loaded=x.availability?`${x.availability.percent}% of ${x.availability.of.toLocaleString()} loaded`:'loaded: not known';
 return `<tbody data-key="${escape(JSON.stringify([x.route,x.device,x.region]))}" data-route="${escape(x.route)}" data-device="${escape(x.device)}" data-region="${escape(x.region)}">`
  +`<tr><th colspan="4" scope="rowgroup"><span class="ps-page">${escape(x.route)}</span> <span class="ps-meta">${escape(devices[x.device]??x.device)} · ${escape(countryName(x.region))} · <span data-figure="views">${x.views.toLocaleString()}</span> view${x.views===1?'':'s'} · ${escape(loaded)}</span></th></tr>`
  +(METRICS.some(metric=>x[metric].percentiles.of)?`<tr><th scope="row">Typical</th>${cells(x,'p50')}</tr><tr><th scope="row">Slow end</th>${cells(x,'p75')}</tr><tr><th scope="row">Samples</th>${cells(x,'of')}</tr>`:averages(x))+'</tbody>';
}
const vitals=(id,groups)=>`<table class="ps-rum" id="${id}"><caption class="ui-visually-hidden">Real users by page, device and country</caption><thead><tr><td></td><th scope="col">LCP</th><th scope="col">INP</th><th scope="col">CLS</th></tr></thead>${groups.map(group).join('')}</table>`;
// Views summed by place, most first; equal counts in name order.
function tally(entries){
 const views=new Map();for(const [name,n] of entries)views.set(name,(views.get(name)??0)+n);
 return [...views].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
}
function places(id,heading,ranked,note){
 const item=([name,n])=>`<li data-key="${escape(name)}"><span>${escape(name)}</span><span class="ps-views">${count(n,'view')}</span></li>`;
 const rest=ranked.slice(TOP);
 return `<section class="ps-places-list" aria-labelledby="${id}-heading"><h4 id="${id}-heading">${heading}</h4><ol id="${id}">${ranked.slice(0,TOP).map(item).join('')}</ol>`
  +(rest.length?`<details id="${id}-more"><summary>and ${rest.length} more</summary><ol>${rest.map(item).join('')}</ol></details>`:'')+(note?`<p class="ps-note">${note}</p>`:'')+'</section>';
}
function where(r){
 const states=tally(r.subdivisions.filter(s=>s.region==='US'&&s.subdivision).map(s=>[STATES[s.subdivision]??s.subdivision,s.views]));
 const us=r.rows.filter(x=>x.region==='US').reduce((sum,x)=>sum+x.views,0),stateless=us-states.reduce((sum,[,n])=>sum+n,0);
 return `<div class="ps-places">${places('pagespeed-rum-countries','Countries',tally(r.rows.map(x=>[countryName(x.region),x.views])))}`
  +(states.length?places('pagespeed-rum-states','US states',states,stateless>0?`${count(stateless,'US view')} without a state`:''):'')+'</div>';
}
// Added to the panel's own stylesheet. The value tables keep their columns at every width; below the monitor page's one-column
// width each rating sits under its value, without its mark, so the three columns fit a phone.
export const RUM_STYLES=`.pagespeed .ps-places{display:grid;grid-template-columns:repeat(auto-fill,minmax(13rem,20rem));gap:12px 32px;margin:12px 0 16px}
.pagespeed .ps-places h4{margin-bottom:2px;font-size:15px}.pagespeed .ps-places li{display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px solid var(--line)}
.pagespeed .ps-views{color:var(--muted);white-space:nowrap}.pagespeed .ps-note{margin-top:4px;color:var(--muted);font-size:13px}
.pagespeed .ps-rum{width:100%;max-width:54rem;border-collapse:collapse;table-layout:fixed}.pagespeed .ps-rum thead td{width:6.5rem}
.pagespeed .ps-rum :is(th,td){padding:6px 12px 6px 0;text-align:left;vertical-align:top;overflow-wrap:anywhere}
.pagespeed .ps-rum td{overflow-wrap:break-word}
.pagespeed .ps-rum thead th{color:var(--muted);font-size:13px;font-weight:600}.pagespeed .ps-rum th[scope=row]{color:var(--muted);font-size:13px;font-weight:600}
.pagespeed .ps-rum th[scope=rowgroup]{padding-top:14px;border-top:1px solid var(--line);font-weight:400}.pagespeed .ps-page{color:var(--ink);font-weight:700}
.pagespeed .ps-meta{color:var(--muted);font-size:14px}.pagespeed .ps-value{color:var(--ink);font-weight:600}.pagespeed .ps-quiet{color:var(--muted)}.pagespeed .ps-none{color:var(--muted)}
.pagespeed .ps-rating{font-size:14px}.pagespeed .ps-rating.good{--mark:var(--mark-dot);--mark-color:var(--green);color:var(--green-text)}
.pagespeed .ps-rating.needs-work{--mark:var(--mark-triangle);--mark-color:var(--amber);color:var(--amber-text)}.pagespeed .ps-rating.poor{--mark:var(--mark-cross);--mark-color:var(--rose);color:var(--rose-text)}
.pagespeed #pagespeed-rum-more{max-width:54rem;margin-top:4px}.pagespeed #pagespeed-privacy{margin-top:12px}.pagespeed .ps-erase>summary{color:var(--rose-text)}.pagespeed .ps-erase>p+p{margin-top:8px}
@container table-wrap (max-width:719px){.pagespeed .ps-rum thead td{width:4rem}.pagespeed .ps-rum :is(th,td){padding-right:4px}.pagespeed .ps-rating{display:flex;font-size:13px}.pagespeed .ps-rating::before{display:none}}
@media(max-width:359px){.pagespeed .ps-rum thead td{width:3.75rem}.pagespeed .ps-rum :is(th,td){padding-right:3px}.pagespeed .ps-rum td{font-size:13px}}`;
/** The Real users section's body for the monitor's site, or the one line saying no beacon is registered. */
export function rumMarkup(rum){
 if(!rum)return '<p>No real-user beacon is registered for this site.</p>';
 const r=rum.report,dropped=Object.entries(r.dropped).map(([reason,n])=>`${n} ${reason==='bot'?'from bots':'on excluded paths'}`).join(', ');
 // Busiest first; equal views keep the report's order (route, device, country).
 const ranked=r.rows.map((x,i)=>[x,i]).sort((a,b)=>b[0].views-a[0].views||a[1]-b[1]).map(([x])=>x),rest=ranked.slice(TOP);
 return `<p id="pagespeed-rum-denominator">${r.views} sampled page view${r.views===1?'':'s'} in the last ${r.hours} hours${dropped?`; not counted: ${escape(dropped)}`:''}.</p>`
  +(r.rows.length?where(r)+vitals('pagespeed-rum',ranked.slice(0,TOP))+(rest.length?`<details id="pagespeed-rum-more"><summary>and ${rest.length} more</summary>${vitals('pagespeed-rum-rest',rest)}</details>`:''):'');
}
