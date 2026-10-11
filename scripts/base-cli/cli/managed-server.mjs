import {fileURLToPath} from 'node:url';
import { createServer } from 'node:net';
import { serverRegistry } from './server-registry.mjs';
import { activityClock } from './server-activity.mjs';
import { trafficProxy } from './server-proxy.mjs';
import {serverResources} from './server-resources.mjs';
import { productionBuild } from './preview-cache.mjs';
import {localSettingKeys} from './settings.mjs';
import { shared } from './shared.mjs';
import { availablePort,selectedOrigin,stateSafety,refuseLegacyProcess } from './local.mjs';
import { tools } from './inspect.mjs';
import { invalid,missing,refuse,RerError,lifecycleError } from './errors.mjs';
import { processInfo } from '../modules/job-queue/processes.mjs';
import { declaredCrons,runScheduled } from './scheduled.mjs';
import { readDevKey,requireDevKey,refuseManagedInstallation,resolvePersona,openUrl } from './dev-identity.mjs';

// Seeds without devIdentity keep the outbox sign-in unchanged. With it, dev
// opens signed in (RER_SIGNED_IN, RER_OPEN); --login and preview keep the
// outbox, reached through RER_OPEN's one-time key exchange.
export function ready(out,url,dev,json=false){
 const signInUrl=url+'/__dev/outbox';
 if(json){out.event('ready',{url,signInUrl,...(dev?{signedInAs:dev.signedInAs??null,openUrl:dev.openUrl}:{})});return;}
 out.human(`RER_READY ${url}`);
 if(dev?.identity){if(dev.signedInAs)out.human(`RER_SIGNED_IN ${dev.signedInAs}`);out.human(`RER_OPEN ${dev.openUrl}`);out.human('Open that link on this computer. Its fragment holds this checkout\'s dev key, which the page keeps only as a cookie; never share the link.');return;}
 out.human(`RER_SIGN_IN ${signInUrl}`);
 if(dev)out.human(`RER_OPEN ${dev.openUrl}`);
 out.human(`Open ${dev?'the last link on this computer (it carries the dev key; never share it)':'the outbox'}, choose the newest sign-in message and follow its link. No email was sent.`);
}
async function runtimePort(){const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;}
export async function managedServer(project,options,out,{clock={}}={}){
 const registry=await serverRegistry(project.root),controller=new AbortController();
 let store,operation,proxy,activity,app,termination,reason,cleanupPromise,finished,selected,cleaned;
 const scheduling=new AbortController();
 let activityWrites=Promise.resolve(),pendingActivity,activityWriting=false,infrastructureFailure;
 function recordActivity(fields){
  pendingActivity=fields;if(activityWriting)return;activityWriting=true;
  activityWrites=(async()=>{while(pendingActivity){const latest=pendingActivity;pendingActivity=undefined;await registry.updateActivity(latest);}})().catch(error=>{infrastructureFailure=error;void stop('activity bookkeeping failed');}).finally(()=>{activityWriting=false;if(pendingActivity)recordActivity(pendingActivity);});
 }
 const stopped=new Promise(resolve=>{finished=resolve;});
 const cleanupDone=new Promise(resolve=>{cleaned=resolve;});
 const cleanup=()=>cleanupPromise??=(async()=>{scheduling.abort();activity?.close();await store?.closeCommands();await proxy?.close();await operation?.release();})();
 const stop=async why=>{reason??=why;controller.abort();finished();await cleanupDone;return {};};
 const handlers=new Map(['SIGINT','SIGTERM'].map(name=>[name,()=>{termination=name;void stop(name);} ]));
 for(const [name,handler]of handlers)process.on(name,handler);
 try{
  if(options.stop){await registry.stop(options.verb,options);return {};}
  controller.signal.throwIfAborted();
  const devIdentity=project.adapter.devIdentity;
  if(options.as!==undefined&&!(devIdentity&&options.verb==='dev'))throw invalid('--as needs a seed that declares devIdentity.');
  let devKey=devIdentity?await readDevKey(project.root):null;
  let current=await registry.existing(options.verb,options);
  if(!current){
   const reservation=await registry.reserve(options.verb,options);
   current=reservation.existing;
  }
  if(current){
   // Resolve a competing reservation through the same explicit-option check.
   current=await registry.existing(options.verb,options);
   const running=await registry.waitReady(current,controller.signal);
   await registry.existing(options.verb,options);
   if(options.verb==='dev'&&Boolean(running.login)!==Boolean(options.login))throw refuse(`The running dev server ${running.login?'uses':'does not use'} --login. Stop it with rer dev --stop to change sign-in mode.`);
   const response=await fetch(running.url+'/health',{headers:{'x-rer-probe':running.probe},signal:AbortSignal.timeout(5000)});
   if(!response.ok || (await response.json()).status!=='ok')throw refuse('Registered application failed health verification. Stop it before retrying.');
   if(devIdentity)devKey=await requireDevKey(project.root);
   emitReady(out,options,running.url,devIdentity&&await devReady(running.url,devKey,options,controller.signal));return {reused:true};
  }
  await registry.serve(async action=>{
   if(action==='status')return {...activity?.snapshot(),url:selected?.url,probe:proxy?.probe};
   if(action==='stop')return stop('explicit stop');
   throw Error('Unknown management operation');
  });
  await stateSafety(project);
  await refuseLegacyProcess(project);
  const {localOperation}=await shared('local/operation.mjs');
  try{operation=await localOperation(project.root);}catch(error){throw refuse(error.message);}
  const {recoverInterrupted}=await shared('local/recovery.mjs');await recoverInterrupted(project.root,operation);
  const {loadInstallerSeed}=await shared('setup-manifest.mjs');
  const seed=project.adapter.setup?await loadInstallerSeed(project.root,project.adapter):undefined;project.setupManifest=seed?.manifest;
  const keys=localSettingKeys(project);
  selected=await selectedOrigin(project,options);
  await availablePort(selected.host,selected.port);
  if(!selected.vars[keys.email])throw missing('Private owner settings are missing. Run rer setup first.');
  if(devIdentity&&!devKey)devKey=await requireDevKey(project.root);
  if(devIdentity&&options.verb==='dev'&&!options.login)refuseManagedInstallation(selected.vars,process.env);
  if(project.adapter.localPrerequisites&&!await project.adapter.localPrerequisites({root:project.root,vars:selected.vars,email:selected.vars[keys.email]}))throw missing('Local migrations, owner or local authentication/mail settings are missing. Run rer setup first.');
  await registry.update({url:selected.url,host:selected.host,port:selected.port,login:Boolean(options.login)});
  const {privateDirectory}=await shared('private-files.mjs');
  await privateDirectory(project.root,['.wrangler','state']);
  const directory=await privateDirectory(project.root,['.seed','installer',...(process.env.RER_ONBOARDING_PROCESS_OWNER?[`commands-${process.pid}`]:[])]);
  const {createCommands}=await shared('commands.mjs');const state={logs:[]};
  store=await createCommands(directory,state,{terminal:text=>out.progress(text),onWaiting:options.json?details=>out.event('waiting',details):undefined,custodyToken:registry.custodyToken(),queue:{verb:options.verb,originalCI:process.env.CI==='true'}});
  store.state=state;store.step=async label=>store.report(label);store.phase=async phase=>{state.phase=phase;};store.setCommandSignal(controller.signal);
  store.setupManifest=seed?.manifest;if(devKey)store.addSecrets([devKey]);
  await tools(project.root,store,controller.signal);
  activity=activityClock({...clock,seconds:options.idleTimeout,onIdle:()=>void stop('idle timeout'),onChange:recordActivity});
  const crons=options.verb==='dev'&&project.adapter.scheduled!==false?await declaredCrons(project.root).catch(error=>{throw refuse(`The declared scheduled triggers cannot run locally: ${error.message}`);}):[];
  const internal=await runtimePort();proxy=await trafficProxy({host:selected.host,port:selected.port,target:internal,activity});
  const adapterOptions={selectedOrigin:selected.url,operationToken:operation.token,privateSettings:project.adapter.settings,runtimePort:internal,devKey:devKey??undefined,devLogin:Boolean(options.login)};
  const input={[keys.email]:selected.vars[keys.email]};
  if(options.verb==='preview')await productionBuild(project,()=>store.run('Building fixed production output',process.execPath,[fileURLToPath(new URL('../bin/rer.mjs',import.meta.url)),'build','--cwd',project.root,'--json'],{cwd:project.root,phase:'build',signal:controller.signal,env:{...process.env,RER_LOCAL_OPERATION:operation.token},afterCommand:()=>recoverInterrupted(project.root,operation)}),text=>store.report(text));
  await serverResources(project.root);
  await project.adapter.run(project.root,input,store,async child=>{
   app=child;
   child.once('exit',code=>{if(!reason){reason='unexpected application exit';void cleanup().then(()=>finished({code:code||1}));}});
   const identity=await processInfo(child.pid);
   if(!identity)throw Error('Runtime exited before custody registration.');
   await registry.update({runtimeProcess:{pid:identity.pid,start:identity.start}});
  },controller.signal,{...adapterOptions,verb:options.verb,dev:project.adapter.dev,preview:project.adapter.preview});
  const dev=devIdentity&&await devReady(selected.url,devKey,options,controller.signal);
  activity.ready();emitReady(out,options,selected.url,dev);
  if(crons.length){
   out.progress(`Running ${crons.length===1?'the scheduled trigger':'the scheduled triggers'} locally: ${crons.join(' | ')}\n`);
   void runScheduled({crons,url:`http://127.0.0.1:${internal}`,signal:scheduling.signal,report:run=>reportScheduled(out,options,run)});
  }
  const result=await stopped;
  if(termination)throw new RerError('cancelled',`Stopped by ${termination} after owned children were stopped.`,termination==='SIGINT'?130:143);
  if(infrastructureFailure)throw new RerError('server_bookkeeping_failed','Server bookkeeping failed; owned serving was stopped.',1);
  if(result?.code)throw new RerError('app_exited','The application stopped unexpectedly.',result.code);
  out.progress(`Server stopped: ${reason}.\n`);return {};
 }catch(error){if(termination)throw new RerError('cancelled',`Stopped by ${termination} after owned children were stopped.`,termination==='SIGINT'?130:143);if(['idle timeout','explicit stop'].includes(reason))return {};throw await lifecycleError(error,store);}finally{await cleanup();cleaned();while(activityWriting)await activityWrites;await registry.close();for(const [name,handler]of handlers)process.off(name,handler);}
}
function reportScheduled(out,options,run){
 const at=new Date().toISOString().replace(/\.\d+Z$/,'Z'),outcome=run.skipped?`skipped (${run.error})`:run.ok?`ok ${run.ms}ms`:`failed (${run.status?`HTTP ${run.status}`:run.error}) ${run.ms}ms`;
 if(options.json)out.event('scheduled',{at,cron:run.cron,ok:run.ok,skipped:Boolean(run.skipped),status:run.status,ms:run.ms});else out.human(`RER_SCHEDULED ${at} "${run.cron}" ${outcome}`);
}
function emitReady(out,options,url,dev){ready(out,url,dev||undefined,options.json);}
async function devReady(url,key,options,signal){
 if(options.verb==='preview')return {openUrl:openUrl(url,key,{path:'/__dev/key',next:'/__dev/outbox'})};
 if(options.login)return {openUrl:openUrl(url,key,{next:'/__dev/outbox'})};
 const as=options.as??'owner',persona=await resolvePersona(url,key,as,signal);
 return {identity:true,signedInAs:persona.email??null,openUrl:openUrl(url,key,{as})};
}
