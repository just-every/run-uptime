import {readGrant} from './grants.mjs';
import {probeHttp,probeHeartbeat} from './probes.mjs';
import {validateDefinition} from '../../src/domain/policy.mjs';
import {runFlow} from './flow/run-flow.mjs';
export async function executeTaskProbe(task,probe,{grantPath,controlPort,flowWorkspace,statusOnly=false}){
 const definition=task.definition;
 if(definition.type==='heartbeat'){
  validateDefinition(definition,[]);
  return probeHeartbeat(definition,probe,task.heartbeatReceipt);
 }
 if(definition.type==='flow'){
  // The runner never executes a flow the control plane would not accept, and a synthetic flow only where a live grant covers it.
  const grants=definition.network==='synthetic'?[(await readGrant(grantPath,controlPort).catch(()=>({port:0}))).port]:[];
  validateDefinition(definition,grants);
  return runFlow(definition,probe,{grantPath,controlPort,workspace:flowWorkspace});
 }
 if(definition.network==='public')return probeHttp(definition,probe,[],{statusOnly});
 const grant=await readGrant(grantPath,controlPort),target=new URL(definition.url);
 if(Number(target.port)!==grant.port||!grant.paths.includes(target.pathname))throw Error('Grant mismatch');
 return probeHttp({...definition,fixtureIdentity:grant.identity},probe,[grant.port]);
}
