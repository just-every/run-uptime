import {readGrant} from './grants.mjs';
import {probeHttp,probeHeartbeat} from './probes.mjs';
import {validateDefinition} from '../../src/domain/policy.mjs';
export async function executeTaskProbe(task,probe,{grantPath,controlPort}){
 const definition=task.definition;
 if(definition.type==='heartbeat'){
  validateDefinition(definition,[]);
  return probeHeartbeat(definition,probe,task.heartbeatReceipt);
 }
 if(definition.network==='public')return probeHttp(definition,probe,[]);
 const grant=await readGrant(grantPath,controlPort),target=new URL(definition.url);
 if(Number(target.port)!==grant.port||!grant.paths.includes(target.pathname))throw Error('Grant mismatch');
 return probeHttp({...definition,fixtureIdentity:grant.identity},probe,[grant.port]);
}
