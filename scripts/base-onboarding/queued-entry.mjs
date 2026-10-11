import { fileURLToPath,pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCommands } from './commands.mjs';
import { commandPolicy,queuedCommand,queueLabel } from './queue.mjs';

// Called by real suite entrypoints before their runtime imports/side effects.
// The admitted child runs the original file/argv, retaining its own stack.
export async function queuedEntrypoint(url,verb='verify') {
 const directory=await mkdtemp(join(tmpdir(),'rer-heavy-'));
 let store;
 try{
  store=await createCommands(directory,{logs:[]},{terminal:text=>process.stderr.write(text),queue:{verb}});
  const policy=await commandPolicy();
  try{
   const result=await queuedCommand(process.execPath,[...process.execArgv,fileURLToPath(url),...process.argv.slice(2)],{
    cwd:process.cwd(),originalCI:policy.ci,label:await queueLabel(process.cwd(),verb,'suite'),report:text=>store.report(text),env:{...process.env,...policy.environment},
    spawn:(command,args,options)=>store.spawn(verb,command,args,options),cleanup:child=>store.stop(child)});
   return result?.code??null;
  }finally{await policy.close();}
 }finally{await store?.closeCommands();await rm(directory,{recursive:true,force:true});}
}

if(process.argv[1] && pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 const [verb,separator,command,...args]=process.argv.slice(2);
 if(separator!=='--'||!command)throw Error('Usage: queued-entry VERB -- COMMAND ARGS');
 const directory=await mkdtemp(join(tmpdir(),'rer-heavy-'));
 const store=await createCommands(directory,{logs:[]},{terminal:text=>process.stdout.write(text),queue:{verb}});
 try{await store.run(verb,command,args,{cwd:process.cwd()});}
 catch(error){process.exitCode=error.childExitCode??1;}
 finally{await store.closeCommands();await rm(directory,{recursive:true,force:true});}
}
