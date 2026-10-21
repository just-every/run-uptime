import {api} from './api.mjs';
import {liveRunners,locationLimit,assignmentsFor} from './check-from.mjs';
// Starting what the owner ticked: each new monitor checks from every live location, up to the most a monitor has, with one
// POST per monitor exactly as the full form would send it. From one location the server adds the External check URL in Settings.
export function networkPlan(overview){
 // Where the Worker answers website checks (a hosted demo), no private runner exists, so only the Worker can run what it found.
 return {active:overview.runner?.workerDiscovery?(overview.runner.runners??[]).filter(runner=>!runner.revokedAt&&runner.hosted):liveRunners(overview)};
}
export function assignmentFor(plan,definition){
 if(!plan.active.length)throw Error('No location is available to run this monitor. Add a location, then start it again.');
 return assignmentsFor({},plan.active.slice(0,locationLimit(definition.type)).map(runner=>runner.runnerId));
}
// Starts each ticked row in turn. A row that fails keeps the server's own message and stays ticked.
export async function startRows({rows,plan,onRow=()=>{}}){
 const started=[];
 for(const row of rows){
  row.setOutcome('working');onRow(row);
  try{
   const definition=row.read(),saved=await api('/api/monitors','POST',{...definition,...assignmentFor(plan,definition)});
   row.setOutcome('done',{id:saved.id});started.push(saved.id);
  }catch(error){row.setOutcome('error',error.message)}
  onRow(row);
 }
 return started;
}
