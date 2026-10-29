export {diagnosticCapture,resolveDiagnosticPin,measurePhase,socketPhases} from './network-phase-capture.mjs';
import {collectNetworkDiagnostics} from './network-diagnostics.mjs';
import {tryCaptureFailureSnapshot} from '../../src/domain/failure-snapshot.mjs';
import {protocolDiagnosticCategory} from '../../src/domain/network-diagnostics.mjs';

export async function attachProtocolDiagnostics(definition,observation,capture,{signal,snapshotPolicy}={}){
 const category=protocolDiagnosticCategory(definition,observation);
 if(!category||!snapshotPolicy)return observation;
 capture.phases.totalMs=observation.durationMs;
 const diagnostics=await collectNetworkDiagnostics({category,phases:capture.phases,pin:capture.pin,privateNetwork:definition.network==='private',
  signal:AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(Math.max(1,Math.floor(snapshotPolicy.artifactBudgetMs??3000)))])});
 // A protocol failure has no HTTP response, transcript or credentials. Reuse
 // snapshot custody/retention with the monitor's real protocol URL and method.
 const failureSnapshot=tryCaptureFailureSnapshot({method:definition.type.toUpperCase(),url:definition.url,durationMs:observation.durationMs,
  diagnostics,phases:capture.phases,masks:snapshotPolicy.masks,policyVersion:snapshotPolicy.version});
 return {...observation,failureSnapshot};
}
