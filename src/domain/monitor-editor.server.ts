import type {Bindings} from './control.server.ts'
import {firstRunnerStatements,runnerListQuery,describeRunners} from './runner-registration.server.ts'
import {runnerRuntime} from './private-runner.ts'

// The editor needs current configuration, never status projections or history.
export async function monitorEditor(env:Bindings,id?:string){
 const initialize=firstRunnerStatements(env)
 const rows=await env.DB.batch([
  ...initialize,env.DB.prepare(runnerListQuery),
  env.DB.prepare('SELECT url FROM external_check WHERE id=1'),
  ...(id?[env.DB.prepare('SELECT definition FROM monitors WHERE id=?').bind(id)]:[]),
 ])
 const runners=describeRunners(rows[initialize.length].results),external=(rows[initialize.length+1].results[0] as {url:string}|undefined)?.url??null
 const monitor=rows[initialize.length+2]?.results[0] as {definition:string}|undefined
 return {now:Date.now(),runner:{...runnerRuntime(env,runners),runners,externalCheckUrl:external},...(id?{definition:monitor?JSON.parse(monitor.definition):null}:{})}
}
