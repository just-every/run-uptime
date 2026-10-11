import { createProcessScope } from './process-scope.mjs';
import { stopOwnedGroup } from './process-cleanup.mjs';
export async function recoverCommand(record) {
 if(!Number.isSafeInteger(record.pid)||record.pid<2||!/^([a-f0-9-]{36})$/.test(record.token))throw Error('Unverifiable abandoned server custody.');
 const ownership=[];
 Object.defineProperty(ownership,'scope',{value:createProcessScope(undefined,record.token)});
 await stopOwnedGroup({pid:record.pid,exitCode:1,signalCode:null},'SIGTERM',ownership);
}
