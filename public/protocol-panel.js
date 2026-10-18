import {escape} from './console-format.js';
// The TCP, DNS, TLS and domain parts of a monitor's page: what the check expects, a one-line summary of each attempt's
// facts, and the staged expiry warnings with their renewal follow-through (from the monitor's own outbox events).
export const PROTOCOL_KINDS={udp:'UDP request and response check',tcp:'TCP port check',dns:'DNS record check',tls:'TLS certificate check',domain:'Domain expiry check'};
export const isProtocol=definition=>Object.hasOwn(PROTOCOL_KINDS,definition?.type);
const RESOLVER_NAMES={cloudflare:'Cloudflare',google:'Google',authoritative:'Authoritative server'};
const day=at=>new Date(at).toISOString().slice(0,10);
const stages=list=>list.map(d=>`${d} days`).join(', ');
/** [label, value, monospace] rows for "What the check expects". */
export function protocolExpectations(definition){
 const s=definition[definition.type],rows=[],latency=definition.assertions?.latencyMs;
 if(definition.type==='tcp'){
  rows.push(['Connects to',`${s.host}:${s.port}`,true]);
  if(s.readBanner)rows.push(['Banner',s.bannerIncludes?`Contains ${s.bannerIncludes}`:'Read and shown',Boolean(s.bannerIncludes)]);
 }
 if(definition.type==='udp')rows.push(['Sends to',`${s.host}:${s.port}`,true],['Request bytes',s.payloadHex,true],['Expected response',`${s.match}: ${s.expectedHex}`,true],['Per attempt','One packet',false],['Packet bytes','256 out / 1,024 in',false],['Endpoint budget','6 packets / minute',false]);
 if(definition.type==='dns'){
  rows.push(['Record',`${s.name} ${s.recordType}`,true],['Resolvers',s.resolvers.map(r=>RESOLVER_NAMES[r]??r).join(' and '),false]);
  rows.push(['Expected',s.expect?.absent?'No such record':s.expect?`${s.expect.match==='includes'?'Includes ':''}${s.expect.values.join(', ')}`:'At least one record',Boolean(s.expect?.values)]);
  if(s.approved)rows.push(['Approved change',s.approved.values.join(', '),true]);
 }
 if(definition.type==='tls'){
  rows.push(['Certificate at',`${s.host}:${s.port}`,true],['Must be','Trusted, for this host name and in date',false],['Warnings before expiry',stages(s.warnDays),false]);
  if(s.owner)rows.push(['Accountable owner',s.owner,false]);
 }
 if(definition.type==='domain'){
  rows.push(['Registration',s.name,true],['Must be','Registered, with a published expiry date',false],['Warnings before expiry',stages(s.warnDays),false]);
  if(s.owner)rows.push(['Accountable owner',s.owner,false]);
 }
 if(latency!==undefined)rows.push(['Slowest answer',`At most ${latency} ms`,false]);
 return rows;
}
/** The attempt line's short fact in place of an HTTP status. */
export function protocolFact(o){
 const f=o.protocol;if(!f)return 'No result details';
 if(f.roundTripMs!==undefined)return `UDP response: ${f.receivedBytes} bytes in ${f.roundTripMs} ms`;
 if(f.connectMs!==undefined)return `Connected in ${f.connectMs} ms`;
 if(f.certificate)return `Expires ${day(f.certificate.notAfter)}`;
 if(f.resolvers)return f.resolvers.map(r=>`${RESOLVER_NAMES[r.id]??r.id} ${r.status==='answer'?`${r.answers.length} record${r.answers.length===1?'':'s'}`:r.status.toUpperCase()}`).join(' · ');
 if(f.registered===false)return 'Not registered';
 if(f.expiresAt)return `Expires ${day(f.expiresAt)}`;
 return 'Expiry date unknown';
}
/** Open warnings first, then renewals, newest first within each. */
export function expiryPanel(m,data){
 if(!['tls','domain'].includes(m.definition.type))return '';
 const events=(data.alerts??[]).filter(a=>a.monitor_id===m.id&&['expiry','renewal'].includes(a.kind)).map(a=>a.event);
 const renewed=new Set(events.filter(e=>e.kind==='renewal').map(e=>e.incidentKey));
 const open=events.filter(e=>e.kind==='expiry'&&!renewed.has(e.incidentKey)),closed=events.filter(e=>e.kind==='renewal');
 const what=m.definition.type==='tls'?'certificate':'registration';
 const item=(e,state)=>`<li><p><span class="ui-pill ${state==='Open'?'degraded':'healthy'}">${state}</span> <strong>${escape(e.title)}</strong></p><p>${escape(e.explanation)}</p><p class="muted"><time datetime="${escape(new Date(e.observedAt).toISOString())}">${escape(new Date(e.observedAt).toLocaleString())}</time></p></li>`;
 const body=open.length||closed.length?`<ul class="expiry-list">${open.map(e=>item(e,'Open')).join('')}${closed.map(e=>item(e,'Renewed')).join('')}</ul>`:`<p>No warnings yet. Each warning stage alerts once, and a warning stays open until a renewed ${what} is observed.</p>`;
 return `<section class="ui-card panel expiry" aria-labelledby="expiry-heading"><h2 id="expiry-heading">Expiry warnings</h2>${body}</section>`;
}
