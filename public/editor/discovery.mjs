import {followCheck,requestCheck} from './discovery-poll.mjs';
import {networkPlan} from './discovery-launch.mjs';
import {checkedLine,createResults} from './discovery-results.mjs';
// The first step of a new monitor: paste a website address, the owner's runner checks it and looks around the site,
// and the proposed monitors arrive already filled in. States: start, checking, result, problem.
const SCHEME=/^[a-z][a-z0-9+.-]*:\/\//i;
const hostOf=url=>{try{return new URL(url).hostname}catch{return ''}};
export function mountDiscovery({form,overview,openCheck,showManualForm}){
 const root=document.querySelector('#discovery'),$=selector=>root.querySelector(selector);
 const panel=$('#discovery-form'),input=$('#discovery-url'),button=$('#discovery-check'),status=$('#discovery-status'),elapsed=$('#discovery-elapsed'),help=$('#discovery-help'),manual=$('#discovery-manual'),problem=$('#discovery-problem'),result=$('#discovery-result'),feedback=$('#discovery-feedback');
 const plan=networkPlan(overview);
 const results=createResults({root,form,plan,onFeedback:text=>{feedback.textContent=text},onStarted:id=>{location.href=id?`/app/monitors/${encodeURIComponent(id)}`:'/app'}});
 let control,timer,state;
 const stopTimer=()=>{clearInterval(timer);timer=undefined};
 const setCheckParam=id=>{const url=new URL(location.href);if(id)url.searchParams.set('discovery',id);else url.searchParams.delete('discovery');history.replaceState(null,'',url)};
 function show(next,label='Check'){
  state=next;root.dataset.state=next;
  const busy=next==='checking';
  input.readOnly=busy;panel.setAttribute('aria-busy',String(busy));
  button.textContent=busy?'Cancel':label;button.type=busy?'button':'submit';button.classList.toggle('is-secondary',busy||next==='result');
  help.hidden=next!=='start';manual.parentElement.hidden=next==='checking'||next==='result';
  result.hidden=next!=='result';problem.hidden=next!=='problem';
  if(!busy){stopTimer();status.replaceChildren();status.removeAttribute('data-state')}
 }
 function fail(message){
  show('problem','Check again');
  const text=document.createElement('p');text.textContent=message;problem.replaceChildren(text);
  problem.focus();
 }
 function succeed(job){
  show('result','Check again');
  status.textContent=checkedLine(job,job.result);
  results.render(job);results.focusHeading();
 }
 // The aria-live line: what is being checked and from which network, with the seconds so far beside it.
 function showProgress(url){
  const began=Date.now(),line=document.createTextNode('');
  status.dataset.state='checking';status.replaceChildren(line,elapsed);
  const tick=()=>{elapsed.textContent=` ${Math.floor((Date.now()-began)/1000)} s`};tick();
  stopTimer();timer=setInterval(tick,1000);
  return job=>{
   const host=hostOf(job?.url??url);
   if(job?.url&&!input.value)input.value=job.url;
   line.nodeValue=`Checking ${host||'your website'}${job?.networkLabel?` from ${job.networkLabel}`:''}…`;
  };
 }
 async function watch(id,say){
  try{
   const job=await followCheck({id,signal:control.signal,onJob:say});
   if(job.status==='done')succeed(job);else fail(job.error||'The check did not finish. Check again.');
  }catch(error){
   if(control.signal.aborted)return;
   fail(error.status===404?'That website check is no longer available. Check again.':error.message);
  }
 }
 const restart=()=>{control?.abort();control=new AbortController();show('checking')};
 async function begin(){
  const text=input.value.trim();
  if(!text){fail('Enter the address of your website, such as https://example.com.');input.focus();return}
  const url=SCHEME.test(text)?text:`https://${text}`;
  input.value=url;feedback.textContent='';
  restart();const say=showProgress(url);say();
  let id;
  try{({id}=await requestCheck(url))}catch(error){if(!control.signal.aborted)fail(error.message);return}
  setCheckParam(id);
  await watch(id,say);
 }
 panel.addEventListener('submit',event=>{event.preventDefault();if(state!=='checking')begin()});
 button.addEventListener('click',event=>{
  if(state!=='checking')return;
  // The button turns back into a submit button inside this handler; without this the same click would start a new check.
  event.preventDefault();
  control.abort();setCheckParam(null);show('start');input.focus();
 });
 for(const trigger of [manual,$('#discovery-empty-manual')])trigger.addEventListener('click',()=>showManualForm({url:input.value.trim()}));
 root.hidden=false;
 if(openCheck){restart();const say=showProgress('');say();watch(openCheck,say)}
 else{show('start');input.focus()}
}
