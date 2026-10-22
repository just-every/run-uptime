import {revisionStatements,grants,type Bindings} from './control.server.ts'
import {assignRunners,ensureFirstRunner,type Runner} from './runner-registration.server.ts'
import {externalCheck,externalCheckMode,externalCheckOf} from './external-check.server.ts'
import {classifyStorage} from './storage-error.ts'
import type {AuditActor} from './audit.server.ts'
// @ts-ignore Shared edition policy is JavaScript.
import {validateDefinition} from './policy.mjs'
// @ts-ignore Shared bounded runner capability vocabulary.
import {runnerCapabilities} from './runner-capabilities.mjs'
const PROBES=['local-a','local-b','local-c']
// "Check all monitors from here too" (Locations, once a location joins): every monitor that does not check from this location
// yet gets it as one more check, exactly as if the owner ticked it in each monitor's form, and all of them in one batch: a new
// revision each, its history, heartbeat token and other locations kept. A monitor already checking from the most locations a
// monitor has (three, two for a browser flow) is left as it is, and so is one this location cannot run; the answer names both.
export async function checkAllFrom(env:Bindings,runnerId:string,actor:AuditActor){
 const first=await ensureFirstRunner(env)
 const [runners,monitors,external]=await Promise.all([
  env.DB.prepare('SELECT * FROM runners ORDER BY registered_at,runner_id').all<Runner>(),
  env.DB.prepare('SELECT id,revision,definition,next_due,state FROM monitors ORDER BY rowid').all<any>(),externalCheck(env)])
 const runner=runners.results.find(row=>row.runner_id===runnerId&&row.revoked_at===null)
 if(!runner)throw Error('Active location not found')
 const added:{id:string;name:string}[]=[],full:string[]=[],refused:{name:string;reason:string}[]=[],statements:D1PreparedStatement[]=[],now=Date.now()
 for(const row of monitors.results){
  const old={id:row.id as string,revision:row.revision as number,definition:JSON.parse(row.definition),nextDue:row.next_due as number,storedState:JSON.parse(row.state)},d=old.definition
  const assigned=d.assignments??Object.fromEntries(d.probes.map((probe:string)=>[probe,{runnerId:first.runner_id}]))
  if(Object.values(assigned).some((a:any)=>a.runnerId===runnerId))continue
  if(d.probes.length>=(['flow','pagespeed'].includes(d.type)?2:PROBES.length)){full.push(d.name);continue}
  if(['flow','pagespeed'].includes(d.type)&&!runnerCapabilities(runner.capabilities).browser){refused.push({name:d.name,reason:'A browser flow needs a browser on that machine.'});continue}
  // The monitor keeps its external check, read from its revision before the new check joins: one following Settings (an older
  // revision's copies of the installation's URL included) still follows it, and one with its own URL keeps that URL.
  const probe=PROBES.find(p=>!d.probes.includes(p))!,mode=externalCheckMode(d,external.legacyUrl),own=externalCheckOf(d,external).own
  try{
   const requested={...assigned,[probe]:{runnerId}}
   const definition=assignRunners(runners.results,first.runner_id,validateDefinition({...d,probes:[...d.probes,probe].sort(),assignments:requested,...(mode?{externalCheck:mode}:{})},grants(env)),{assignments:requested,...(own?{canaryUrl:own}:{})},external,env.RER_DEMO!=='1',env.UPTIME_ORIGIN)
   statements.push(...(await revisionStatements(env,definition,old,old.id,now,actor,{keepHeartbeatToken:true})).statements)
   added.push({id:old.id,name:d.name})
  }catch(error){refused.push({name:d.name,reason:(error as Error).message})}
 }
 if(statements.length)try{await env.DB.batch(statements)}catch(error){
  if(classifyStorage(error)?.class==='guard_conflict')throw Object.assign(Error('A monitor changed while this was being applied, so nothing changed. Try again.'),{status:409})
  throw error
 }
 return {runnerId,added,full,refused}
}
