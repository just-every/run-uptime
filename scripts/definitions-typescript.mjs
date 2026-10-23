// Buyer-machine execution only. The Worker receives the resulting native JSON,
// never the module or a request to evaluate source.
import {spawn} from 'node:child_process';
import {extname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {decodeDefinitionBytes, DEFINITION_BYTES} from '../src/domain/definitions/format.ts';

const childPath=fileURLToPath(new URL('./definitions-typescript-child.mjs',import.meta.url));
const evaluationMs=10000;
const evaluationError=()=>Object.assign(new Error('The TypeScript definition file could not be evaluated. Use a default native definition export and supported Node TypeScript syntax.'),{exitCode:2});

/** Evaluate the exact bytes already opened by the CLI's bounded O_NOFOLLOW read. */
export async function loadTypeScriptDefinitions(path,alreadyOpenedBytes){
 let bytes;
 try{
  if(!['.ts','.mts'].includes(extname(path)))throw evaluationError();
  bytes=typeof alreadyOpenedBytes==='string'?new TextEncoder().encode(alreadyOpenedBytes):alreadyOpenedBytes;
  if(!(bytes instanceof Uint8Array))throw evaluationError();
  decodeDefinitionBytes(bytes);
 }catch{throw evaluationError()}
 return new Promise((done,fail)=>{
  // Buyer source is trusted local code, not a sandbox. A separate result pipe
  // prevents its logging and exception text from entering CLI output.
  const child=spawn(process.execPath,[childPath,resolve(path)],{stdio:['pipe','ignore','ignore','pipe']});
  const chunks=[];let size=0,refused=false;
  const refuse=()=>{refused=true;child.kill('SIGKILL')};
  const timer=setTimeout(refuse,evaluationMs);
  child.once('error',()=>{clearTimeout(timer);fail(evaluationError())});
  child.stdin.on('error',()=>{}); // A refused module may exit before consuming input.
  child.stdio[3].on('error',refuse);
  child.stdio[3].on('data',chunk=>{
   size+=chunk.byteLength;
   if(size>DEFINITION_BYTES){refuse();return}
   chunks.push(chunk);
  });
  child.once('close',code=>{
   clearTimeout(timer);
   if(refused||code!==0||!size){fail(evaluationError());return}
   try{done(decodeDefinitionBytes(Buffer.concat(chunks)))}catch{fail(evaluationError())}
  });
  child.stdin.end(bytes);
 });
}
