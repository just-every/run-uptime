import {createRow} from './discovery-row.mjs';
import {startRows} from './discovery-launch.mjs';
// What the runner found, as the owner sees it: notes, the proposed monitors with ticks and the button that starts what is ticked.
const plural=(count,word)=>`${count} ${word}${count===1?'':'s'}`;
export const checkedLine=(job,result)=>{
 const seconds=Math.max(1,Math.round(result.durationMs/1000));
 return `Checked from ${job.networkLabel??'your runner'} · ${plural(result.requests,'request')} · ${plural(seconds,'second')}`;
};
export function createResults({root,form,plan,onFeedback,onStarted}){
 const $=selector=>root.querySelector(selector);
 const list=$('#discovery-proposals'),notes=$('#discovery-notes'),empty=$('#discovery-empty'),proposals=$('#discovery-proposal-section'),start=$('#discovery-start'),summary=$('#discovery-summary');
 let rows=[],busy=false;
 const chosen=()=>rows.filter(row=>row.selected&&!row.started);
 function update(){
  const count=chosen().length;
  start.textContent=`Start ${plural(count,'monitor')}`;start.disabled=busy||!count;
  const failed=rows.filter(row=>row.selected&&!row.started&&row.element.querySelector('.proposal-outcome[data-state=error]')).length;
  summary.textContent=failed?`${plural(failed,'monitor')} could not be started. Fix ${failed===1?'it':'them'} or untick ${failed===1?'it':'them'}, then start again.`:'';
 }
 async function launch(){
  const ready=chosen();if(!ready.length||busy)return;
  for(const row of ready){
   const problem=row.problem();
   if(problem){row.element.scrollIntoView({block:'nearest'});problem.control?.focus();row.setOutcome('error',problem.message);update();return}
   row.clearOutcome();
  }
  busy=true;update();start.textContent='Starting…';onFeedback('Starting monitors…');
  const ids=await startRows({rows:ready,plan,onRow:update});
  busy=false;update();
  const left=chosen().length;
  if(!left){onFeedback('');onStarted(rows.filter(row=>row.started).length===1&&ids.length===1?ids[0]:null);return}
  if(ids.length)$('.editor-cancel').textContent='Go to monitors';
  onFeedback(ids.length?`${plural(ids.length,'monitor')} started.`:'');
  summary.focus();
 }
 start.addEventListener('click',launch);
 return {
  render(job){
   const {result}=job;
   rows=[];list.replaceChildren();notes.replaceChildren();
   empty.querySelector('a')?.remove();
   const visibleNotes=result.notes.filter(note=>!/^robots\.txt was read on /.test(note));
   for(const note of visibleNotes){const line=document.createElement('li');line.textContent=note;notes.append(line)}
   notes.hidden=!visibleNotes.length;
   result.proposals.forEach((proposal,index)=>{const row=createRow({proposal,index,form,plan,onChange:update});rows.push(row);list.append(row.element)});
   const any=rows.length>0;
   proposals.hidden=!any;empty.hidden=any;start.hidden=!any;update();
  },
  update,
  focusHeading(){($('#discovery-proposals-heading').offsetParent?$('#discovery-proposals-heading'):$('#discovery-empty-heading')).focus()},
 };
}
