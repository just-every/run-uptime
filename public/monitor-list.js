import {escape,ago,monitorHref,shownState} from './console-format.js';
import {checkedFrom,locationNamer} from './monitor-rules.js';
import {activeLocations} from './locations.js';
// The monitor list's markup (public/catalog.js mounts the rows, public/app.js the summary): one quiet line under the
// heading that counts the monitors by state, and one row per monitor that leads with its name over one quiet line,
// with its last 24 hours as a bar and a share. The monitor's own page holds everything else.

const joinNames=names=>names.length<3?names.join(' and '):`${names.slice(0,-1).join(', ')} and ${names.at(-1)}`;
const clock=t=>new Date(t).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});

// "14 monitors · 11 healthy · 1 failing · from Brisbane and Sydney": only the states some monitor is in. With one
// location it offers a second (two places agree on an outage before it counts).
const STATES=[['Healthy','healthy'],['Failing','failing'],['Degraded','degraded'],['Recovering','recovering'],['Unknown','unknown'],['Maintenance','in maintenance'],['Paused','paused']];
export function listSummary(data,readUnavailable){
 const shown=data.monitors.map(m=>shownState(m,readUnavailable)),places=[...new Set(activeLocations(data).map(r=>r.networkLabel))];
 const parts=[`${shown.length} ${shown.length===1?'monitor':'monitors'}`,...STATES.map(([state,word])=>[shown.filter(s=>s===state).length,word]).filter(([count])=>count).map(([count,word])=>`${count} ${word}`)];
 if(places.length)parts.push(`from ${joinNames(places)}`);
 return escape(parts.join(' · '))+(places.length<2?' · <a href="/app/locations">Add a location</a>':'');
}

// What a monitor checks, as its line starts: the address without its scheme, after the kind unless it is a plain
// website or API check.
const KINDS={api:'API',flow:'Browser flow',pagespeed:'Page speed',mail:'Mail',tcp:'TCP',udp:'UDP',ping:'Ping',dns:'DNS',tls:'TLS',domain:'Domain'};
function target(d){
 if(d.type==='heartbeat')return 'Heartbeat';
 const where=d.type==='dns'?`${d.dns.name} ${d.dns.recordType}`:String(d.url).replace(/^[a-z]+:\/\//i,'').replace(/^([^/?#]+)\/$/,'$1'),kind=d.catalog?'Service status':KINDS[d.type];
 return kind?`${kind} · ${where}`:where;
}
// The first label and how many more; the monitor's Labels hold them all.
function labels(d){
 const all=[d.project,d.environment,d.service,d.group,d.owner,...(d.tags??[])].filter(Boolean);
 return all.length>1?`${escape(all[0])} <span aria-hidden="true">+${all.length-1}</span><span class="ui-visually-hidden">and ${all.length-1} more labels</span>`:escape(all[0]??'');
}
// The line's last part: where a failing monitor fails, when maintenance ends, or how long ago the last check ran.
function latest(m,state,runners){
 const d=m.definition,t=m.availability?.lastCheckAt;
 if(state==='Failing'||state==='Degraded'){
  const name=locationNamer(d,runners),where=[...new Set((m.state.regions??[]).filter(region=>region.state==='Failing').map(region=>name(region.probe)))];
  if(where.length)return `<span class="monitor-note failing">failing from ${escape(joinNames(where))}</span>`;
 }
 if(state==='Maintenance'&&m.maintenanceEndsAt>Date.now())return `<span class="monitor-note maintenance">until ${escape(clock(m.maintenanceEndsAt))}</span>`;
 if(state==='Paused')return '';
 return `<span class="monitor-checked">${Number.isSafeInteger(t)&&t>=0&&t<=Date.now()?`checked ${escape(ago(t))}`:'no check yet'}</span>`;
}
// The address, then the rest of the line. Each part after the address carries its separator, so a part a phone leaves
// out takes its dot with it.
function meta(m,state,runners){
 const d=m.definition,places=checkedFrom(d,runners),rest=[labels(d)&&`<span class="monitor-labels">${labels(d)}</span>`,places.length&&`<span class="monitor-places">from ${escape(places.join(', '))}</span>`,latest(m,state,runners)].filter(Boolean);
 return `<p class="monitor-meta"><span class="monitor-target">${escape(target(d))}</span>${rest.length?`<span class="monitor-rest">${rest.map(part=>part.replace('>','><span class="monitor-sep"> · </span>')).join('')}</span>`:''}</p>`;
}

// The last 24 hours: the bar's parts as the monitor page draws them (monitor-coverage.js), and the passing share of
// observed time, rounded as that module rounds it: down, and never to 0% or 100% unless exact.
const PARTS=[['passed','upMs'],['failing','notPassingMs'],['unknown','unknownMs'],['maintenance','maintenanceMs'],['paused','pausedMs']];
const valid=metrics=>Boolean(metrics)&&['upMs','notPassingMs','unknownMs','observedMs','windowMs'].every(key=>Number.isFinite(metrics[key]))&&metrics.windowMs>0;
function passing({upMs,observedMs}){
 const hundredths=upMs*10000/observedMs;
 return hundredths>0&&hundredths<1?'under 0.01%':hundredths>9999&&hundredths<10000?'over 99.99%':`${Math.floor(hundredths)/100}%`;
}
function day(metrics,enabled){
 const known=valid(metrics),observed=known&&metrics.observedMs>0,share=observed?passing(metrics):enabled?'Unknown':'Paused';
 const parts=known?PARTS.filter(([,key])=>metrics[key]>0).map(([kind,key])=>`<span class="coverage-segment ${kind}" style="flex-grow:${metrics[key]}"></span>`).join(''):'<span class="coverage-segment unknown" style="flex-grow:1"></span>';
 return `<div class="monitor-day"><div class="coverage-bar" aria-hidden="true">${parts}</div><p class="monitor-share"><span class="ui-visually-hidden">Last 24 hours: </span>${escape(share)}${observed?'<span class="ui-visually-hidden"> passing</span>':''}</p></div>`;
}

// The tick is named for its job; aria-describedby adds which monitor. Healthy is a quiet dot, any other state its pill.
export function monitorRow(m,{runners,readUnavailable,selected}){
 const d=m.definition,state=shownState(m,readUnavailable),id=escape(m.id),href=escape(monitorHref(m.id));
 const mark=state==='Healthy'?'<span class="monitor-dot"><span class="ui-visually-hidden">Healthy</span></span>':'',pill=state==='Healthy'?'':`<span class="ui-pill state ${escape(state.toLowerCase())}">${escape(state)}</span>`;
 const warning=m.configurationWarning?`<a class="ui-link monitor-warning" href="${href}/edit">Needs a second location or an external check</a>`:'';
 return `<li class="monitor-row${selected?' is-selected':''}" data-key="${id}"><input type="checkbox" id="catalog-select-${id}" data-monitor-select="${id}" aria-label="Select monitor" aria-describedby="monitor-link-${id}"${selected?' checked':''}><div class="monitor-main"><div class="monitor-title">${mark}<a class="monitor-link" id="monitor-link-${id}" href="${href}"><span class="monitor-name">${escape(d.name)}</span></a>${pill}</div>${meta(m,state,runners)}${warning}</div>${day(m.availability?.last24h,d.enabled)}</li>`;
}
