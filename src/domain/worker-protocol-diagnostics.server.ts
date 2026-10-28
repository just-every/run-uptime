import {workerProtocolProbe as originalProbe} from './worker-protocols.server.ts'
export {protocolRequests} from './worker-protocols.server.ts'
import type {Allowance} from './worker-budget.ts'
import {protocolDiagnosticCategory,normalizeNetworkDiagnostics} from './network-diagnostics.mjs'
import {tryCaptureFailureSnapshot} from './failure-snapshot.mjs'

// Worker transports expose no pinned socket phases or native route utility.
// Do not infer timings from higher-level facts or make a diagnostic request.
export async function workerProtocolProbe(def:any,probe:string,allowance:Allowance,snapshotPolicy?:any){
 const observation=await originalProbe(def,probe,allowance),category=protocolDiagnosticCategory(def,observation)
 if(!category||!snapshotPolicy)return observation
 const phases={dnsMs:null,connectMs:null,tlsMs:null,ttfbMs:null,totalMs:observation.durationMs}
 const diagnostics=normalizeNetworkDiagnostics({version:1,category,phases,route:{tool:'unavailable',reason:'hosted-transport',hops:[]}})
 return {...observation,failureSnapshot:tryCaptureFailureSnapshot({method:def.type.toUpperCase(),url:def.url,durationMs:observation.durationMs,phases,diagnostics,masks:snapshotPolicy.masks,policyVersion:snapshotPolicy.version})}
}
