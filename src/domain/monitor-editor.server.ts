import type {Bindings} from './control.server.ts'
import {firstRunnerStatements,runnerListQuery,describeRunners} from './runner-registration.server.ts'
import {runnerRuntime} from './private-runner.ts'
import {externalCheckOf} from './external-check.server.ts'

// The editor needs current configuration, never status projections or history.
export async function monitorEditor(env:Bindings,id?:string){
 const initialize=firstRunnerStatements(env)
 const rows=await env.DB.batch([
  ...initialize,env.DB.prepare(runnerListQuery),
  env.DB.prepare('SELECT url,legacy_url FROM external_check WHERE id=1'),
  ...(id?[env.DB.prepare('SELECT definition FROM monitors WHERE id=?').bind(id)]:[env.DB.prepare('SELECT 1 FROM monitors LIMIT 1')]),
 ])
 const runners=describeRunners(rows[initialize.length].results),row=rows[initialize.length+1].results[0] as {url:string;legacy_url:string|null}|undefined
 const settings={url:row?.url??null,legacyUrl:row?.legacy_url??null},monitor=rows[initialize.length+2]?.results[0] as {definition:string}|undefined
 const definition=monitor?JSON.parse(monitor.definition):null
 // The edited monitor's own external check URL, if it has one; empty means it follows Settings.
 return {now:Date.now(),runner:{...runnerRuntime(env,runners),runners,externalCheckUrl:settings.url},...(id?{definition,externalCheck:definition?externalCheckOf(definition,settings):null}:{first:!rows[initialize.length+2]?.results.length})}
}
