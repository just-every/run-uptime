// Fresh signed-task execution process; the only fake is the authorized TLS/DNS socket edge.
import {socketEdge} from './tls-auth-support.mjs';
import {executeTaskProbe} from '../runners/src/execute-task.mjs';
let input='';for await(const chunk of process.stdin)input+=chunk;
const {task,port,ca,controlPort}=JSON.parse(input),restore=socketEdge(port,ca);
try{const result=await executeTaskProbe(task,task.probes[0],{controlPort});process.stdout.write(JSON.stringify(result))}finally{restore()}
