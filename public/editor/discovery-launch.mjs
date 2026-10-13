import {api} from './api.mjs';
// Starting what the owner ticked: which runners check it, and one POST per monitor, exactly as the full form would send it.
// A single network sends no external check URL: the server fills in the installation's External check URL.
export function networkPlan(overview){
 const active=(overview.runner?.runners??[]).filter(runner=>!runner.revokedAt);
 const labels=new Set(active.map(runner=>runner.networkLabel));
 return {active,labels:[...labels],singleNetwork:labels.size<2};
}
// One network: one check. Two or more: two checks, each from a different network, which is what lets a failure be agreed
// without an external check.
export function assignmentFor(plan){
 if(!plan.active.length)throw Error('No runner is available to run this monitor. Add a runner, then start it again.');
 if(plan.singleNetwork)return {probes:['local-a'],assignments:{'local-a':{runnerId:plan.active[0].runnerId}}};
 const firstOfEach=[...new Map(plan.active.map(runner=>[runner.networkLabel,runner])).values()].slice(0,2);
 const probes=['local-a','local-b'];
 return {probes,assignments:Object.fromEntries(probes.map((probe,index)=>[probe,{runnerId:firstOfEach[index].runnerId}]))};
}
// Starts each ticked row in turn. A row that fails keeps the server's own message and stays ticked.
export async function startRows({rows,plan,onRow=()=>{}}){
 const started=[];
 for(const row of rows){
  row.setOutcome('working');onRow(row);
  try{
   const definition=row.read(),saved=await api('/api/monitors','POST',{...definition,...assignmentFor(plan)});
   row.setOutcome('done',{id:saved.id});started.push(saved.id);
  }catch(error){row.setOutcome('error',error.message)}
  onRow(row);
 }
 return started;
}
