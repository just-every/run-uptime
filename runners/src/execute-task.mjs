import {randomUUID} from 'node:crypto';
import {readGrant} from './grants.mjs';
import {probeHttp,probeHeartbeat} from './probes.mjs';
import {validateDefinition} from '../../src/domain/policy.mjs';
import {runFlow} from './flow/run-flow.mjs';
export async function executeTaskProbe(task,probe,{grantPath,controlPort,flowWorkspace,statusOnly=false,signal,now=Date.now}){
 const definition=task.definition;
 // Only the authenticated claim envelope supplies local credential authority; editor fields never do.
 const needsCredential=Boolean(definition.request)||definition.flow?.steps?.some(step=>step.kind==='fill');
 if(needsCredential&&(typeof task.monitorId!=='string'||!task.monitorId||typeof task.id!=='string'||!task.id||!task.probes?.includes(probe)||!definition.probes?.includes(probe)||!Number.isSafeInteger(task.acceptUntil)||task.acceptUntil<=now()))throw Error('Credential claim unavailable');
 const monitorId=needsCredential?task.monitorId:undefined;
 // Preparation and network work must not outlive the claim's Worker-clock authority either.
 if(needsCredential)signal=AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(Math.max(1,task.acceptUntil-now()))]);
 signal?.throwIfAborted();
 if(definition.type==='heartbeat'){
  validateDefinition(definition,[]);
  return probeHeartbeat(definition,probe,task.heartbeatReceipt);
 }
 if(definition.type==='flow'){
  // The runner never executes a flow the control plane would not accept, and a synthetic flow only where a live grant covers it.
  const grants=definition.network==='synthetic'?[(await readGrant(grantPath,controlPort).catch(()=>({port:0}))).port]:[];
  validateDefinition(definition,grants);
  return runFlow(definition,probe,{grantPath,controlPort,workspace:flowWorkspace,monitorId,signal});
 }
 if(definition.network==='public')return probeHttp(definition,probe,[],{statusOnly,monitorId,signal});
 const grant=await readGrant(grantPath,controlPort),target=new URL(definition.url);
 if(Number(target.port)!==grant.port||!grant.paths.includes(target.pathname))throw Error('Grant mismatch');
 return probeHttp({...definition,fixtureIdentity:grant.identity},probe,[grant.port],{signal});
}
