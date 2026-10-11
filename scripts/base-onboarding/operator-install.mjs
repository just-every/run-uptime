import { randomUUID } from 'node:crypto';
import { readFile, unlink } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { chooseOrigin } from './adapter-settings.mjs';
import { privateDirectory, writePrivateFile } from './private-files.mjs';
import { installationFailure, installationFailureMessage } from './failures.mjs';
import { labels } from './adapter-labels.mjs';

// The browser and terminal use the same bounded setup journey. Its temporary
// runtime is gone before that lease releases. The foreground preview belongs
// to the installer process, outside the bounded job's descendant tree.
export async function installOperator(root,input,store,onApp,signal,hooks){
 let answer,app,step='setup';
 try{
  await store.configureQueue?.({verb:'installer'});
  const origin=await chooseOrigin({root,input,store},hooks),address=new URL(origin);
  const directory=await privateDirectory(root,['.seed','installer']);
  answer=join(directory,`answers-${randomUUID()}.json`);
  await writePrivateFile(answer,JSON.stringify(input));
  // The browser owns no local operation. A verifier may have launched it while
  // holding a different checkout's token; each public command takes its own.
  const env={...process.env};delete env.RER_LOCAL_OPERATION;
  const run=(label,args)=>store.run(label,process.execPath,['scripts/rer.mjs',...args,'--non-interactive','--json'],{cwd:root,signal,env,heavy:false});
  step='dependencies';await store.step(labels.dependencies);await run(labels.dependencies,['install']);
  step='setup';await store.step(labels.build);await run(labels.build,['setup','--answers',relative(root,answer),'--host',address.hostname.replace(/^\[|\]$/g,''),'--port',address.port]);
  await unlink(answer);answer=undefined;
  // Preview's ready event carries RER_OPEN; keep the checkout's dev key out of this log.
  const devKey=/^RER_DEV_KEY=(\S+)$/m.exec(await readFile(join(root,'.rer/local/dev-key.env'),'utf8').catch(()=>''))?.[1];if(devKey)store.addSecrets?.([devKey]);
  step='start';await store.step(labels.start);
  app=store.spawn(labels.start,process.execPath,['scripts/rer.mjs','preview','--non-interactive','--json'],{cwd:root,signal,env});onApp(app);
  let buffer='',ready=false,openUrl;
  app.stdout.on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);try{const event=JSON.parse(line);if(event.version===1&&event.verb==='preview'&&event.event==='ready'&&event.url===origin){ready=true;openUrl=event.openUrl;}}catch{}}});
  await store.waitForReady(labels.start,app,async probeSignal=>{
   if(!ready)return {ready:false,message:'Waiting for managed application readiness'};
   const response=await fetch(origin+'/health',{signal:probeSignal});
   return {ready:response.ok&&(await response.json()).status==='ok'};
  },{signal,timeoutMs:1200000});
  // A dev-identity seed's outbox needs the key exchange RER_OPEN carries. State
  // never holds the key: the installer page asks /api/open-app when it shows the link.
  store.state.appUrl=origin+'/__dev/outbox';store.state.devOpen=Boolean(openUrl?.startsWith(origin+'/'));await store.step(labels.complete);await store.phase('complete');
 }catch(error){
  if(app)await store.stop(app);await store.stopCommands?.(signal);
  store.state.error=installationFailureMessage(installationFailure('command_failed',{step,diagnostic:error}));await store.phase('failed');
 }finally{if(answer)await unlink(answer);}
}
