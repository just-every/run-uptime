import {patch} from './dom-patch.js';
import {locationNamer} from './monitor-rules.js';
import {failureOf} from './monitor-status.js';
import {historyMarkup} from './monitor-recent-checks.js';
import {incidentMarkup} from './monitor-incidents.js';
import {buildTimeline,checkResultSummary} from './monitor-timeline.js';
import {followLink,openFold,settleLink} from './monitor-links.js';
// The reads a monitor's page makes on each refresh, beside the console's own overview: incidents, history and revisions, who
// is told, an open Slow notice, a followed service's review and cleanup debt. What they find is kept in page.seen, which every
// region renders from; a read that fails says so where its answer would show, with Retry (page.retry).
const fixtures=d=>d.type==='api'?d.api.steps.some(s=>s.phase==='cleanup'):Boolean(d.flow?.fixtures);
// One read of the page's own: its newest answer wins; an older answer that lands late is dropped. ui.reading holds the reads
// of the page's first round still unanswered, so a link waits for them before it gives up.
function read(page,name,start,apply,fail){
 const ticket=page.tickets[name]=(page.tickets[name]??0)+1,ui=page.ui;
 if(!ui.started)(ui.reading??=new Set()).add(name);
 const done=()=>{ui.reading?.delete(name);if(ui.reading&&!ui.reading.size)settleLink(page)};
 // An answer is drawn before a waiting link gives up, so a fold that this read adds (Cleanup debt) is there to open.
 start().then(value=>{if(page.tickets[name]!==ticket)return;page.seen.failed.delete(name);apply(value);done();page.draw()},problem=>{done();if(page.tickets[name]===ticket)fail(problem);if(ui.reading&&!ui.reading.size&&ui.hash)followLink(page)});
}
const readFailure=(host,what,retry)=>{
 if(!host?.isConnected)return;
 const button=Object.assign(document.createElement('button'),{type:'button',textContent:'Retry'});button.onclick=retry;
 host.replaceChildren(`Couldn’t load ${what}. `,button);
};
export function loadPage(page){
 const {m,api,seen,area}=page,d=m.definition,key=encodeURIComponent(m.id),runners=page.data.runner.runners??[];
 // A read the status card depends on: when it fails, the card says so with Retry (public/monitor-status-line.js).
 const optional=(name,path,apply)=>read(page,name,()=>api(path),apply,()=>{seen.failed.add(name);page.draw()});
 const readers={
  incidents:()=>read(page,'incidents',()=>api(`/api/monitors/${key}/incidents`),list=>{
   seen.incidents=list;seen.since=list.find(i=>i.endedAt===null)?.startedAt;
   const host=area.querySelector('#monitor-incidents');if(host)patch(host,incidentMarkup(list,page.name));
   // The Incidents fold opens itself while an incident is open (U21 D7), once for each incident, and stays closed once closed.
   const open=list.find(i=>i.endedAt===null);
   if(open&&page.ui.incident!==open.key){page.ui.incident=open.key;openFold(page,'incidents')}
  },()=>readFailure(area.querySelector('#monitor-incidents'),'incident history',readers.incidents)),
  history:()=>read(page,'history',()=>Promise.all([api(`/api/monitors/${key}/history`),api(`/api/monitors/${key}/revisions`)]),([slots,revisions])=>{
   const now=Number.isSafeInteger(page.data.now)?page.data.now:Date.now(),timeline=buildTimeline({slots,now,monitor:page.m,revisions});
   seen.timeline=timeline;seen.revisions=revisions;
   const host=area.querySelector('#raw-history');if(host)patch(host,historyMarkup(timeline,page.m,runners));
   const failed=slots.filter(s=>!s.manual&&checkResultSummary(s).state==='failed').sort((a,b)=>b.due_at-a.due_at)[0];
   seen.failure=failed?failureOf(failed,locationNamer(failed.definition,runners)):null;
   seen.start=revisions.length?Math.min(...revisions.map(r=>r.start)):undefined;
   const complete=slots.filter(s=>!s.manual&&s.status==='complete').sort((a,b)=>b.due_at-a.due_at);
   seen.newest=complete.find(s=>s.revision===page.m.revision);seen.earlier=complete[0];
   if(d.type==='heartbeat'){
    seen.receipt=slots.some(s=>s.observations?.some(o=>o.heartbeatReceivedAt));
    // The Heartbeat fold opens by itself until the first receipt arrives.
    if(!page.ui.heartbeat){page.ui.heartbeat=true;if(!seen.receipt)queueMicrotask(()=>openFold(page,'heartbeat'))}
   }
  },()=>readFailure(area.querySelector('#raw-history'),'recent checks',readers.history)),
  route:()=>optional('route',`/api/monitors/${key}/alert-route`,route=>{seen.route=route}),
  slow:()=>optional('slow',`/api/monitors/${key}/slow-policy`,policy=>{seen.slow=policy.status}),
  followed:()=>optional('followed','/api/service-catalog',catalog=>{const item=catalog.followed.find(f=>f.monitorId===m.id);seen.followed=item?{review:item.review.state==='needs_review'}:null}),
  debt:()=>optional('debt',`/api/monitors/${key}/cleanup-debt`,debt=>{seen.debt=debt}),
 };
 page.retry=name=>{seen.failed.delete(name);page.draw();readers[name]?.()};
 readers.incidents();readers.history();readers.route();
 if(d.slow&&d.type!=='heartbeat')readers.slow();else{seen.slow=null;seen.failed.delete('slow')}
 if(d.tags?.includes('dependency'))readers.followed();
 if(fixtures(d))readers.debt();
}
