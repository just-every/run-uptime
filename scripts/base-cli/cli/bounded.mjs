import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {shared} from './shared.mjs';
import {RerError} from './errors.mjs';

// Admit the complete bounded workflow before it can acquire checkout custody.
// The child re-enters the same dispatcher with validated live queue membership.
// Its ordinary CLI stdout retains the semantic result; child diagnostics remain
// captured/redacted on stderr. Long-lived servers never enter this boundary.
export async function boundedCommand(project,options,argv,out){
 if(!['install','setup','build','verify','deploy','export','import'].includes(options.verb))return null;
 const {commandPolicy,queuedCommand,queueLabel}=await shared('queue.mjs');
 const policy=await commandPolicy();
 const childArgs=[...argv];const cwdIndex=childArgs.indexOf('--cwd');if(cwdIndex>=0&&(childArgs.indexOf('--')<0||cwdIndex<childArgs.indexOf('--')))childArgs[cwdIndex+1]=project.root;
 const directory=await mkdtemp(join(tmpdir(),'rer-bounded-'));
 let store;
 try{
  const {createCommands}=await shared('commands.mjs');
  store=await createCommands(directory,{logs:[]},{terminal:()=>{}});
  let resultSeen=false,buffer='';
  const result=await queuedCommand(process.execPath,[fileURLToPath(new URL('../bin/rer.mjs',import.meta.url)),...childArgs],{
   cwd:project.root,stdio:[!options.json&&!options.nonInteractive?'inherit':'ignore','pipe','pipe'],originalCI:policy.ci,env:{...process.env,...policy.environment},
   label:await queueLabel(project.root,options.verb,'workflow'),report:text=>out.progress(store.redact(text)+'\n'),onWaiting:options.json?details=>out.event('waiting',details):undefined,
   spawn:(command,args,native)=>{
    const child=store.spawn('Running bounded workflow',command,args,native);
    const stderr=store.redactionStream(text=>out.progress(text));
    child.stderr.on('data',chunk=>stderr.write(chunk));child.stderr.once('end',()=>stderr.end());
    child.stdout.on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);
     if(options.json){try{const event=JSON.parse(line);if(event.version===1&&event.verb===options.verb){if(event.event==='result')resultSeen=true;out.human(store.redact(JSON.stringify(event)));}}catch{}}
     else out.human(store.redact(line));
    }});
    child.stdout.once('end',()=>{if(buffer&&!options.json)out.human(store.redact(buffer));buffer='';});return child;
   },
   cleanup:async child=>{
    await store.stop(child);
    if(project.profile==='first-party'){
     const {recoverInterrupted}=await shared('local/recovery.mjs');
     const held=await recoverInterrupted(project.root);await held?.release();
    }
   }
  });
  if(!result)return null;
  if(options.json&&!resultSeen){const error=new RerError('command_failed','Bounded command ended before its result; owned children and private files were recovered.',result.code||1);out.error(error);out.result(false,error.exitCode);}
  return {exitCode:result.code};
 }finally{await store?.closeCommands();await policy.close();await rm(directory,{recursive:true,force:true});}
}
