import {HOSTED_RUNNER_ID,hostedInstallation,workerDiscovery} from './hosted-runner.ts'
import type {Bindings} from './control.server.ts'
export const privateRunnerReady=(runners:any[],now=Date.now(),staleMs=120000)=>runners.some(r=>r.runnerId!==HOSTED_RUNNER_ID&&r.revokedAt===null&&r.lastContactAt!==null&&r.lastContactAt<=now&&now-r.lastContactAt<=staleMs)
export function runnerRuntime(env:Bindings,runners:any[]){
 return {hosted:hostedInstallation(env),demo:env.RER_DEMO==='1',workerDiscovery:workerDiscovery(env),privateRunnerReady:privateRunnerReady(runners,Date.now(),Number(env.UPTIME_RUNNER_STALE_MS??120000)),
 privateRunnerCommand:`UPTIME_CONTROL_ORIGIN=${env.UPTIME_ORIGIN} node scripts/runner-start.mjs${env.UPTIME_DEPLOY_ENVIRONMENT?` --environment ${env.UPTIME_DEPLOY_ENVIRONMENT}`:''}`}
}
