import {api} from './api.mjs';
import {followCheck} from './discovery-poll.mjs';
// DEPENDENCY-002: the third-party service catalog beside the website check. The owner searches the catalog, picks the whole
// provider or chosen components, and follows. Following first has the owner's runner read the provider's own status source;
// a source that fails is marked needs review and nothing is followed. A provider the catalog lacks, or one that publishes no
// status Uptime can read, goes through the website check's reviewed proposal instead.
const SOURCE={statuspage:'Statuspage-compatible JSON status API',json:'the provider’s own JSON status document',feed:'RSS/Atom status feed',page:'status page only (no status Uptime can read)'};
const element=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node};
const PROBLEM={unreachable:'did not answer',moved:'has moved',shape:'no longer has the shape the catalog expects','too-large':'is larger than a check can read','component-missing':'no longer lists that component'};
// The panel, placed after the website check; it stays hidden until mounted.
const MARKUP=`<section id="service-catalog" class="catalog-panel ui-card" aria-labelledby="service-catalog-heading" hidden>
 <h2 id="service-catalog-heading">Follow a third-party service</h2>
 <p class="helper ui-helper">Pick a provider you depend on. Uptime reads its own status source first, then watches what the provider states and sends a dependency notice through your alert route. A provider issue opens no Uptime incident and never changes your own monitors.</p>
 <label for="catalog-search">Search providers</label>
 <input id="catalog-search" type="search" autocomplete="off" spellcheck="false" placeholder="Stripe, AWS us-east-1, email…" aria-describedby="catalog-status">
 <p id="catalog-status" class="discovery-status" role="status" aria-atomic="true"></p>
 <ul id="catalog-results" class="catalog-list"></ul>
 <p class="helper ui-helper catalog-other">Not listed? <button id="catalog-other" class="ui-link" type="button">Add a provider by its status page address</button>. Uptime looks at that page and proposes monitors for you to review.</p>
</section>`;
export function mountServiceCatalog({overview,opened}){
 if(opened)return ()=>{};
 if(!document.querySelector('#service-catalog'))document.querySelector('#discovery')?.insertAdjacentHTML('afterend',MARKUP);
 const root=document.querySelector('#service-catalog');
 if(!root)return ()=>{};
 const search=root.querySelector('#catalog-search'),status=root.querySelector('#catalog-status'),list=root.querySelector('#catalog-results');
 const needsRunner=overview.runner.hosted&&!overview.runner.privateRunnerReady&&overview.runner.workerDiscovery!==true;
 let control=new AbortController(),timer,catalog=null,busy=false;
 // What the owner was last told about each provider survives the list being redrawn after a follow or a search.
 const told=new Map();
 const show=(node,note)=>{node.replaceChildren(note.text);if(note.href)node.append(Object.assign(element('a','ui-link',note.link),{href:note.href}));if(note.state)node.dataset.state=note.state;else node.removeAttribute('data-state')};
 const tell=(entry,node,note)=>{told.set(entry.id,note);show(node,note)};
 const say=(text,state)=>{status.textContent=text;if(state)status.dataset.state=state;else status.removeAttribute('data-state')};
 async function load(){
  try{
   catalog=await api('/api/service-catalog?q='+encodeURIComponent(search.value.trim()),'GET',undefined,{signal:control.signal});
   render();
  }catch(error){if(!control.signal.aborted)say(error.message)}
 }
 function entryCard(entry){
  const item=element('li','catalog-entry');item.dataset.entry=entry.id;
  const head=element('div','catalog-head'),title=element('h3','catalog-name',entry.name);
  head.append(title,element('span','catalog-kind ui-pill',entry.followable?'Followable':'Status page only'));
  item.append(head,element('p','catalog-summary',entry.summary));
  const source=element('p','catalog-source'),link=Object.assign(element('a','ui-link','status page'),{href:entry.source.page,target:'_blank',rel:'noopener noreferrer'});
  source.append(`Official source: ${SOURCE[entry.source.kind]} · catalog version ${catalog.version} · `,link);item.append(source);
  if(entry.note)item.append(element('p','catalog-note',entry.note));
  if(entry.review)item.append(Object.assign(element('p','catalog-review',`Needs review: the live check found this source ${PROBLEM[entry.review.problem]??'failing'}. ${entry.review.detail}`),{role:'note'}));
  for(const id of entry.followed){const current=catalog.followed.find(f=>f.monitorId===id);if(!current)continue;const row=element('p','catalog-followed'),open=Object.assign(element('a','ui-link',current.name),{href:`/app/monitors/${encodeURIComponent(id)}`});row.append('Following: ',open,current.review.state==='needs_review'?' · needs review':'');item.append(row)}
  if(!entry.followable){
   const add=element('button','ui-link','Add its status page by address');add.type='button';
   add.addEventListener('click',()=>useAddress(entry.source.page));item.append(add);return item;
  }
  const form=element('form','catalog-form');form.noValidate=true;
  const fieldset=element('fieldset','catalog-scope'),legend=element('legend',undefined,`What to follow for ${entry.name}`);fieldset.append(legend);
  const choice=(value,text,checked)=>{const label=element('label','check-row'),input=document.createElement('input');input.type='radio';input.name=`scope-${entry.id}`;input.value=value;input.checked=checked;label.append(input,text);return label};
  if(entry.whole)fieldset.append(choice('whole','The whole provider',true));
  if(entry.components.length){
   fieldset.append(choice('components','Chosen components',!entry.whole));
   const group=element('div','catalog-components');group.setAttribute('role','group');group.setAttribute('aria-label',`${entry.name} components`);
   for(const component of entry.components){const label=element('label','check-row catalog-component'),box=document.createElement('input');box.type='checkbox';box.value=component.key;box.name=`component-${entry.id}`;label.append(box,component.region?`${component.name} · ${component.region}`:component.name);group.append(label)}
   fieldset.append(group);
  }
  const feedback=element('p','catalog-feedback');feedback.setAttribute('role','status');if(told.has(entry.id))show(feedback,told.get(entry.id));
  const go=element('button','primary','Follow');go.type='submit';
  form.append(fieldset,go,feedback);
  form.addEventListener('submit',event=>{event.preventDefault();follow(entry,form,feedback,go)});
  item.append(form);return item;
 }
 function render(){
  list.replaceChildren(...catalog.entries.map(entryCard));
  say(catalog.entries.length?`${catalog.entries.length} provider${catalog.entries.length===1?'':'s'} in catalog version ${catalog.version}.`:'No provider matches. Add it by its status page address below.');
 }
 // The runner reads the source; only then does Uptime follow.
 async function follow(entry,form,feedback,button){
  if(busy)return;
  const scope=form.querySelector(`input[name="scope-${entry.id}"]:checked`)?.value,chosen=[...form.querySelectorAll(`input[name="component-${entry.id}"]:checked`)].map(box=>box.value);
  if(scope==='components'&&!chosen.length){tell(entry,feedback,{text:'Choose at least one component, or follow the whole provider.',state:'error'});return}
  const body={entry:entry.id,scope,...(scope==='components'?{components:chosen}:{})};
  busy=true;button.disabled=true;tell(entry,feedback,{text:`Checking ${entry.name}’s status source from your runner…`,state:'checking'});
  try{
   const {id}=await api('/api/service-catalog/checks','POST',body);
   const job=await followCheck({id,signal:control.signal,onJob:()=>{}});
   if(job.status!=='done'){tell(entry,feedback,{text:job.error||'The check did not finish. Try again.',state:'error'});return}
   if(!job.result.ok){tell(entry,feedback,{text:`${entry.name}’s status source ${PROBLEM[job.result.problem]??'failed its check'}: ${job.result.detail} It is marked needs review and was not followed.`,state:'error'});await load();return}
   const made=await api('/api/service-follows','POST',{check:id});
   tell(entry,feedback,{text:`Now following ${made.followed.map(item=>item.name).join(', ')}. `,state:'done',link:'Open the monitor',href:`/app/monitors/${encodeURIComponent(made.followed[0].monitorId)}`});
   await load();
  }catch(error){if(control.signal.aborted)return;tell(entry,feedback,{text:error.message,state:'error'});if(error.status===409)await load()}
  finally{busy=false;button.disabled=false}
 }
 // A provider the catalog cannot follow goes through the website check, which proposes monitors for review.
 function useAddress(address){
  const input=document.querySelector('#discovery-url');
  if(!input||input.disabled){say('The website check needs a runner. Start it, then add the status page by address.');return}
  input.value=address;input.focus();say('The website check below now has the status page address. Choose Check to review what it finds.');
 }
 root.querySelector('#catalog-other').addEventListener('click',()=>{const input=document.querySelector('#discovery-url');if(input&&!input.disabled){input.focus();say('Type the provider’s status page address in the website check, then choose Check.')}else say('The website check needs a runner. Start it, then add the status page by address.')});
 search.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(load,200)});
 root.hidden=false;
 if(needsRunner){search.disabled=true;say('Following a provider needs a private runner to read its status source. See the runner instructions above.');return ()=>{root.hidden=true}}
 load();
 return ()=>{control.abort();clearTimeout(timer);root.hidden=true};
}
