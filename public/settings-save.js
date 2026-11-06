import {icon} from './console-format.js';
// Settings save as you go (L15): a value saves as soon as it changes, and its card says so quietly beside its heading
// ("Saving…", then "✓ Saved" once the write answered). A refused save keeps the value in its field, names the reason under
// it and offers Retry there. Every save in flight is tracked here: leaving the area waits for them (public/app.js), and a
// refused value not saved since keeps the owner on the area once, with its failure and Retry in view, so an edit is never
// dropped without a word; leaving again goes.
const inFlight=new Set(),refused=new Map();
export const savePending=()=>inFlight.size>0;
export const refusalPending=()=>[...refused.keys()].some(failure=>failure.isConnected);
// Resolves once every save in flight answered.
export async function savesSettled(){await Promise.all([...inFlight])}
// True, once per refusal, when a refused value has not been saved since: the failure is brought into view and Retry focused.
export function holdRefused(){
 for(const [failure,held] of refused){
  if(!failure.isConnected){refused.delete(failure);continue}
  if(!held){refused.set(failure,true);failure.scrollIntoView({block:'center'});failure.querySelector('button')?.focus({preventScroll:true});return true}
 }
 return false;
}
// The quiet line beside a card's heading and the failure line under its field.
export const savedLine=id=>`<p class="saved" id="${id}" role="status"></p>`;
export const failureLine=id=>`<p class="settings-failure" id="${id}" role="alert" hidden></p>`;
// saved and failure are those two lines; send(value) writes the value and throws the server's refusal. Returns
// save(value). Retry sends the value refused last; a newer save replaces what an older one would have shown.
export function saveAsYouGo({saved,failure,send}){
 let latest;
 const retry=Object.assign(document.createElement('button'),{type:'button',className:'ui-link settings-retry',textContent:'Retry'});
 retry.onclick=()=>{void save(latest)};
 function show(state,reason=''){
  saved.dataset.state=state;saved.innerHTML=state==='saving'?'Saving…':state==='saved'?`${icon('check')}Saved`:'';
  failure.hidden=state!=='refused';
  if(state==='refused')failure.replaceChildren(`Not saved: ${reason.replace(/\.$/,'')}. `,retry);
 }
 function save(value){
  latest=value;show('saving');
  const attempt=Promise.resolve().then(()=>send(value)).then(()=>{if(latest===value){show('saved');refused.delete(failure)}return true},error=>{if(latest===value){show('refused',error.name==='TypeError'?'Uptime could not be reached':error.message||'the server refused it');refused.set(failure,false)}return false});
  inFlight.add(attempt);void attempt.finally(()=>inFlight.delete(attempt));
  return attempt;
 }
 return save;
}
