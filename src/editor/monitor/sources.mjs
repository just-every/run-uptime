import {api} from './api.mjs';
import {followCheck} from './discovery-poll.mjs';
import {assignmentFor,networkPlan} from './discovery-launch.mjs';
// DISCOVERY-001 on the new-monitor page, after the website check and the service catalog: the owner authorizes a source (a domain,
// robots and sitemap, an OpenAPI document, a Route 53 or Cloudflare zone, or GitHub Actions, Vercel, Netlify or CodeDeploy
// deployments), runs it when they choose, and reviews what the runner proposes: where each proposal was found, its intended
// outcome, duplicates, expected traffic and cost, locations and credential needs. Rejecting records a decision; starting adopts
// through the monitor door like any new monitor. Nothing is started, paused or removed any other way.
const FIELD={domain:'Domain',origin:'Site address',url:'Specification address',zoneId:'Zone ID',owner:'Repository owner',repo:'Repository',projectId:'Project ID',siteId:'Site ID',application:'Application',deploymentGroup:'Deployment group',region:'Region',siteUrl:'Site address it serves',credentialRef:'Credential reference on your runner'};
const PLACEHOLDER={domain:'example.com',origin:'https://www.example.com',url:'https://api.example.com/openapi.json',zoneId:'',owner:'acme',repo:'shop',projectId:'prj_…',siteId:'',application:'shop',deploymentGroup:'production',region:'us-east-1',siteUrl:'https://www.example.com',credentialRef:'acme-dns'};
const CHANGE={first:'First run',new:'New',unchanged:'Unchanged'};
const element=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node};
const plural=(count,word)=>`${count.toLocaleString('en-US')} ${word}${count===1?'':'s'}`;
const at=value=>new Date(value).toLocaleString();
const MARKUP=`<section id="discovery-sources" class="sources-panel ui-card" aria-labelledby="sources-heading">
 <h2 id="sources-heading">Discover from your DNS, spec and deploys</h2>
 <p class="helper ui-helper">Authorize a source, then run it when you choose. Your runner reads it read-only and proposes monitors, each with where it was found, what it would cost and what it needs. Nothing starts until you start it.</p>
 <form id="source-form" class="sources-form" novalidate>
  <label for="source-kind">Source</label><select id="source-kind"></select>
  <p id="source-access" class="helper ui-helper"></p>
  <label for="source-label">Name</label><input id="source-label" maxlength="100" autocomplete="off">
  <div id="source-fields" class="sources-fields"></div>
  <p id="source-credential" class="helper ui-helper" hidden></p>
  <p><button type="submit" class="primary">Authorize</button></p>
  <p id="source-feedback" class="sources-feedback" role="status"></p>
 </form>
 <h3 id="sources-list-heading">Authorized sources</h3>
 <p id="sources-empty" class="sources-empty">No sources yet. An authorized source is read only when you run it.</p>
 <ul id="sources-list" class="sources-list" aria-labelledby="sources-list-heading"></ul>
 <section id="source-review" class="sources-review" aria-labelledby="source-review-heading" hidden>
  <h3 id="source-review-heading" tabindex="-1"></h3>
  <p id="source-run-line" class="helper ui-helper"></p>
  <ul id="source-notes" class="discovery-notes"></ul>
  <ul id="source-proposals" class="sources-proposals"></ul>
  <div id="source-removed-section" hidden><h4>Removed since the previous run</h4><ul id="source-removed" class="sources-removed"></ul></div>
  <div class="sources-start"><p id="source-review-feedback" class="sources-feedback" role="status"></p><button id="source-start" class="primary" type="button" disabled>Start 0 monitors</button></div>
 </section>
</section>`;
function styles(){if(!document.querySelector('link[href="/editor/sources.css"]'))document.head.append(Object.assign(document.createElement('link'),{rel:'stylesheet',href:'/editor/sources.css'}))}
export function mountDiscoverySources({overview,opened}){
 if(opened)return ()=>{};
 styles();
 if(!document.querySelector('#discovery-sources'))(document.querySelector('#service-catalog')??document.querySelector('#discovery'))?.insertAdjacentHTML('afterend',MARKUP);
 const root=document.querySelector('#discovery-sources');if(!root)return ()=>{};
 const $=selector=>root.querySelector(selector),control=new AbortController(),plan=networkPlan(overview);
 const form=$('#source-form'),kind=$('#source-kind'),label=$('#source-label'),fields=$('#source-fields'),feedback=$('#source-feedback'),list=$('#sources-list'),review=$('#source-review'),start=$('#source-start');
 let kinds=[],shown=null,busy=false;
 const tell=(node,text,state)=>{node.textContent=text;if(state)node.dataset.state=state;else node.removeAttribute('data-state')};
 function drawFields(){
  const spec=kinds.find(item=>item.kind===kind.value);if(!spec)return;
  $('#source-access').textContent=spec.access;
  fields.replaceChildren(...spec.fields.map(name=>{const wrap=element('label','sources-field');wrap.append(FIELD[name]);const input=element('input');input.name=name;input.autocomplete='off';input.spellcheck=false;if(PLACEHOLDER[name])input.placeholder=PLACEHOLDER[name];wrap.append(input);return wrap}));
  const credential=$('#source-credential');credential.hidden=!spec.provider;
  credential.textContent=spec.provider?`The credential never leaves your runner: put it in provider-<reference>.json in the runner's credential folder, naming "${spec.provider}" and this source's identifiers. See Discovering endpoints in the monitor docs.`:'';
 }
 async function load(){
  const document_=await api('/api/discovery-sources','GET',undefined,{signal:control.signal});
  if(!kinds.length){kinds=document_.kinds;kind.replaceChildren(...kinds.map(item=>Object.assign(element('option',undefined,item.label),{value:item.kind})));drawFields()}
  $('#sources-empty').hidden=document_.sources.length>0;
  list.replaceChildren(...document_.sources.map(sourceRow));
  if(shown&&document_.sources.some(item=>item.id===shown))await open(shown);else{shown=null;review.hidden=true}
 }
 function sourceRow(item){
  const row=element('li','sources-item');row.dataset.key=`source-${item.id}`;
  const head=element('div','sources-item-head');head.append(element('strong',undefined,item.label),element('span','ui-pill',item.kindLabel));if(item.state==='inactive')head.append(element('span','ui-pill sources-inactive','Restored, not authorized'));
  row.append(head,element('p','sources-identifiers ui-mono',Object.entries(item.identifiers).map(([name,value])=>`${FIELD[name]??name}: ${value}`).join(' · ')));
  if(item.running)row.append(element('p','sources-status',item.running.status==='queued'?'Waiting for your runner…':'Your runner is reading this source…'));
  else if(item.latestRun)row.append(element('p','sources-status',`Last run ${at(item.latestRun.finishedAt)} · ${plural(item.latestRun.candidates,'candidate')}`));
  else row.append(element('p','sources-status','Not run yet.'));
  if(item.failure&&(!item.latestRun||item.failure.finishedAt>item.latestRun.finishedAt))row.append(Object.assign(element('p','sources-failure ui-callout error',`The last run failed: ${item.failure.error}`),{role:'note'}));
  const actions=element('div','sources-actions'),button=(text,run,cls)=>{const node=element('button',cls,text);node.type='button';node.addEventListener('click',run);actions.append(node);return node};
  if(item.state==='inactive')button('Authorize again',()=>act(()=>api(`/api/discovery-sources/${item.id}/authorize`,'POST',{}),`${item.label} is authorized again.`));
  else button('Run discovery',()=>runSource(item),'primary');
  if(item.latestRun)button('Review proposals',()=>open(item.id).then(()=>$('#source-review-heading').focus()));
  button('Revoke',()=>{if(confirm(`Revoke ${item.label}? Its runs and decisions are removed; monitors you started stay.`))act(()=>api(`/api/discovery-sources/${item.id}`,'DELETE'),`${item.label} is revoked.`)});
  row.append(actions);return row;
 }
 async function act(work,done){
  if(busy)return;busy=true;
  try{await work();tell(feedback,done,'done');await load()}catch(error){if(!control.signal.aborted)tell(feedback,error.message,'error')}finally{busy=false}
 }
 async function runSource(item){
  if(busy)return;busy=true;tell(feedback,`Asking your runner to read ${item.label}…`,'checking');
  try{
   const {id}=await api(`/api/discovery-sources/${item.id}/runs`,'POST',{});await load();
   const job=await followCheck({id,signal:control.signal,onJob:()=>{}});
   if(job.status==='done'){tell(feedback,`${item.label} was read. Review its proposals below.`,'done');shown=item.id}
   else tell(feedback,job.error||'The run did not finish. Run it again.','error');
   await load();if(job.status==='done')$('#source-review-heading').focus();
  }catch(error){if(!control.signal.aborted)tell(feedback,error.message,'error')}finally{busy=false}
 }
 async function open(id){
  const document_=await api(`/api/discovery-sources/${id}`,'GET',undefined,{signal:control.signal});
  if(!document_.review){review.hidden=true;return}
  shown=id;review.hidden=false;
  const {run,proposals,removed}=document_.review;
  $('#source-review-heading').textContent=`Proposals from ${document_.source.label}`;
  $('#source-run-line').textContent=`Read ${at(run.finishedAt)} · ${plural(run.requests,'request')}${run.previousRunId?' · compared with the previous run and your monitors':' · first run, compared with your monitors'}`;
  $('#source-notes').replaceChildren(...run.notes.map(note=>element('li',undefined,note)));
  $('#source-proposals').replaceChildren(...proposals.map(proposal=>proposalRow(id,proposal)));
  $('#source-removed-section').hidden=!removed.length;
  $('#source-removed').replaceChildren(...removed.map(item=>{
   const row=element('li');row.dataset.key=`removed-${item.key}`;row.append(element('p','ui-mono',item.url));
   row.append(element('p',undefined,`${item.answered?'No longer listed by this source':'No longer answering'}; last found ${at(item.lastSeenAt)} (${item.identifier}).`));
   if(item.monitors.length){const line=element('p',undefined,'Still checked by ');item.monitors.forEach((monitor,index)=>{if(index)line.append(', ');line.append(Object.assign(element('a','ui-link',monitor.name),{href:`/app/monitors/${encodeURIComponent(monitor.id)}`}))});line.append('. Review it there; nothing was paused or removed.');row.append(line)}
   else row.append(element('p',undefined,'No monitor checks it.'));
   return row;
  }));
  update();
 }
 function fact(list,term,value){const wrap=element('div');wrap.append(element('dt',undefined,term));const dd=element('dd');if(value instanceof Node)dd.append(value);else dd.textContent=value;wrap.append(dd);list.append(wrap)}
 function proposalRow(sourceId,proposal){
  const row=element('li','source-proposal');row.dataset.key=proposal.key;
  if(proposal.refused){row.classList.add('is-refused');row.append(element('p','ui-mono',proposal.url),element('p','source-refused',`Not proposed: ${proposal.refused}`),element('p','helper ui-helper',`Found: ${proposal.identifier}`));return row}
  const head=element('div','source-proposal-head'),pick=element('input');pick.type='checkbox';pick.id=`source-pick-${proposal.key}`;pick.dataset.adopt=proposal.key;
  const name=element('label',undefined,proposal.name);name.htmlFor=pick.id;
  const decided=proposal.decision?.decision,duplicate=proposal.duplicates.monitors.length>0;
  head.append(pick,name,element('span','ui-pill',decided==='adopted'?'Started':decided==='rejected'?'Rejected':duplicate?'Already monitored':CHANGE[proposal.change]));
  pick.disabled=Boolean(decided)||duplicate;
  const facts=element('dl','source-facts');
  fact(facts,'Address',proposal.url);
  fact(facts,'Found',`${proposal.identifier} · ${at(proposal.seenAt)}`);
  fact(facts,'Intended outcome',proposal.outcome??'Not stated');
  fact(facts,'Checks',proposal.checks.join(' · '));
  const dupes=element('span');
  if(!proposal.duplicates.monitors.length&&!proposal.duplicates.proposals.length)dupes.textContent='None';
  proposal.duplicates.monitors.forEach((monitor,index)=>{if(index)dupes.append(', ');dupes.append('Your monitor ',Object.assign(element('a','ui-link',monitor.name),{href:`/app/monitors/${encodeURIComponent(monitor.id)}`}))});
  if(proposal.duplicates.proposals.length)dupes.append(`${proposal.duplicates.monitors.length?'; ':''}also proposed by ${[...new Set(proposal.duplicates.proposals.map(item=>item.label))].join(', ')}`);
  fact(facts,'Duplicates',dupes);
  const t=proposal.traffic;fact(facts,'Expected traffic',t.locations?`${plural(t.perDay,t.unit.slice(0,-1))} a day (${t.perLocationPerDay.toLocaleString('en-US')} from each of ${plural(t.locations,'location')}), about ${t.perMonth.toLocaleString('en-US')} a month`:'None until a location is available');
  fact(facts,'Expected cost',`Unknown: ${proposal.cost.reason} Projected use: ${plural(proposal.cost.monitorRunsPerDay,'monitor run')} a day on ${plural(proposal.cost.probes,'probe')}${proposal.cost.browserMinutes?`; browser-minutes Unknown: ${proposal.cost.browserMinutes.reason}`:''}`);
  fact(facts,'Locations',proposal.locations.length?proposal.locations.map(item=>item.networkLabel).join(', '):'No location is available yet');
  fact(facts,'Credentials',proposal.credentials);
  const outcome=element('p','source-outcome');outcome.setAttribute('role','status');
  row.append(head,facts);
  if(!decided){const reject=element('button',undefined,'Reject');reject.type='button';reject.dataset.reject=proposal.key;reject.addEventListener('click',()=>decide(sourceId,proposal,reject,outcome));row.append(reject)}
  row.append(outcome);pick.addEventListener('change',update);row.proposal=proposal;return row;
 }
 async function decide(sourceId,proposal,button,outcome){
  button.disabled=true;
  try{await api(`/api/discovery-sources/${sourceId}/decisions`,'POST',{key:proposal.key,decision:'rejected'});await open(sourceId)}
  catch(error){button.disabled=false;tell(outcome,error.message,'error')}
 }
 const chosen=()=>[...$('#source-proposals').querySelectorAll('[data-adopt]:checked')].map(box=>box.closest('.source-proposal'));
 function update(){const count=chosen().length;start.textContent=`Start ${plural(count,'monitor')}`;start.disabled=busy||!count}
 // Each chosen proposal becomes a monitor through the monitor door, from the locations the console assigns, then is recorded as adopted.
 start.addEventListener('click',async()=>{
  const rows=chosen();if(!rows.length||busy||!shown)return;busy=true;update();const status=$('#source-review-feedback');tell(status,'Starting monitors…','checking');
  let started=0;
  for(const row of rows){
   const outcome=row.querySelector('.source-outcome'),proposal=row.proposal;
   try{const saved=await api('/api/monitors','POST',{...proposal.definition,...assignmentFor(plan,proposal.definition)});await api(`/api/discovery-sources/${shown}/decisions`,'POST',{key:proposal.key,decision:'adopted',monitorId:saved.id});started++}
   catch(error){tell(outcome,error.message,'error')}
  }
  busy=false;tell(status,started?`${plural(started,'monitor')} started.`:'Nothing was started.',started?'done':'error');await open(shown);
 });
 kind.addEventListener('change',drawFields);
 form.addEventListener('submit',event=>{
  event.preventDefault();
  const identifiers=Object.fromEntries([...fields.querySelectorAll('input')].map(input=>[input.name,input.value.trim()]));
  act(async()=>{await api('/api/discovery-sources','POST',{kind:kind.value,label:label.value.trim(),identifiers});form.reset();drawFields()},'Authorized. Run it when you are ready.');
 });
 load().catch(error=>{if(!control.signal.aborted)tell(feedback,error.message,'error')});
 return ()=>{control.abort()};
}
