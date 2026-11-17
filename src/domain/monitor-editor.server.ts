import type {Bindings} from './control.server.ts'
import {firstRunnerStatements,runnerListQuery,describeRunners} from './runner-registration.server.ts'
import {runnerRuntime} from './private-runner.ts'
import {externalCheckOf} from './external-check.server.ts'

const PROPOSAL_KEPT_MS=24*60*60*1000
// The editor needs current configuration, never status projections or history.
export async function monitorEditor(env:Bindings,id?:string){
 const initialize=firstRunnerStatements(env)
 const rows=await env.DB.batch([
  ...initialize,env.DB.prepare(runnerListQuery),
  env.DB.prepare('SELECT url,legacy_url FROM external_check WHERE id=1'),
  ...(id?[env.DB.prepare('SELECT definition FROM monitors WHERE id=?').bind(id)]:[env.DB.prepare('SELECT 1 FROM monitors LIMIT 1'),
   // The newest finished look at a website (setup's or the owner's own): with no monitor yet, the proposal stays reachable.
   env.DB.prepare("SELECT id FROM discovery_jobs WHERE kind='site' AND status='done' AND finished_at>? ORDER BY finished_at DESC,rowid DESC LIMIT 1").bind(Date.now()-PROPOSAL_KEPT_MS)]),
 ])
 const runners=describeRunners(rows[initialize.length].results),row=rows[initialize.length+1].results[0] as {url:string;legacy_url:string|null}|undefined
 const settings={url:row?.url??null,legacyUrl:row?.legacy_url??null},monitor=rows[initialize.length+2]?.results[0] as {definition:string}|undefined
 const definition=id&&monitor?JSON.parse(monitor.definition):null
 // The edited monitor's own external check URL, if it has one; empty means it follows Settings.
 const first=!id&&!rows[initialize.length+2]?.results.length,proposal=rows[initialize.length+3]?.results[0] as {id:string}|undefined
 return {now:Date.now(),runner:{...runnerRuntime(env,runners),runners,externalCheckUrl:settings.url},...(id?{definition,externalCheck:definition?externalCheckOf(definition,settings):null}:{first,...(first&&proposal?{proposalJob:proposal.id}:{})})}
}
