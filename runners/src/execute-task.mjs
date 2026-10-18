import {createPrivateAccess} from './private-network.mjs';
import {randomUUID} from 'node:crypto';
import {readGrant} from './grants.mjs';
import {probeHttp,probeHeartbeat} from './probes.mjs';
import {validateDefinition} from '../../src/domain/policy.mjs';
import {runFlow} from './flow/run-flow.mjs';
import {probeProtocol} from './protocol-probes.mjs';
import {isProtocol} from '../../src/domain/protocol/settings.mjs';
export async function executeTaskProbe(task,probe,{grantPath,controlPort,flowWorkspace,statusOnly=false,signal,now=Date.now,runnerId,controlOrigin,privateGrantDirectory}){
 const definition=task.definition;
 // Only the authenticated claim envelope supplies local credential authority; editor fields never do.
 const needsCredential=Boolean(definition.request)||definition.flow?.steps?.some(step=>step.kind==='fill');
 if(needsCredential&&(typeof task.monitorId!=='string'||!task.monitorId||typeof task.id!=='string'||!task.id||!task.probes?.includes(probe)||!definition.probes?.includes(probe)||!Number.isSafeInteger(task.acceptUntil)||task.acceptUntil<=now()))throw Error('Credential claim unavailable');
 const privateCheck=definition.network==='private';
 const monitorId=needsCredential||privateCheck?task.monitorId:undefined;
 if(privateCheck&&runnerId!==definition.assignments?.[probe]?.runnerId)throw Error('Private runner identity mismatch');
 const privateAccess=privateCheck?createPrivateAccess(task,probe,{directory:privateGrantDirectory,now,controlOrigin}):undefined;
 // Preparation and network work must not outlive the claim's Worker-clock authority either.
 if(needsCredential||privateCheck)signal=AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(Math.max(1,task.acceptUntil-now()))]);
 signal?.throwIfAborted();
 if(definition.type==='heartbeat'){
  validateDefinition(definition,[]);
  return probeHeartbeat(definition,probe,task.heartbeatReceipt);
 }
 if(definition.type==='flow'){
  // The runner never executes a flow the control plane would not accept, and a synthetic flow only where a live grant covers it.
  const grants=definition.network==='synthetic'?[(await readGrant(grantPath,controlPort).catch(()=>({port:0}))).port]:[];
  validateDefinition(definition,grants);
  if(privateAccess)try{await privateAccess(new URL(definition.url),signal)}catch(error){const at=Date.now();return {id:randomUUID(),probe,startedAt:at,completedAt:at,durationMs:0,runnerVersion:'uptime-node/0.1.0',outcome:'runner_error',checks:[{assertion:'grant',pass:false,reason:error.reason??'Private network grant unavailable'}]}}
  return runFlow(definition,probe,{privateAccess,grantPath,controlPort,workspace:flowWorkspace,monitorId,signal});
 }
 if(isProtocol(definition.type))return probeProtocol(definition,probe,{signal,privateAccess});
 if(['public','private'].includes(definition.network))return probeHttp(definition,probe,[],{statusOnly,monitorId,signal,privateAccess,snapshotPolicy:task.snapshotPolicy});
 const grant=await readGrant(grantPath,controlPort),target=new URL(definition.url);
 if(Number(target.port)!==grant.port||!grant.paths.includes(target.pathname))throw Error('Grant mismatch');
 return probeHttp({...definition,fixtureIdentity:grant.identity},probe,[grant.port],{signal});
}
