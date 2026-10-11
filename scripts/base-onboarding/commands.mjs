import { queuedCommand, queueLabel, commandPolicy } from './queue.mjs';
import { spawn as spawnChild } from 'node:child_process';
import { writeSync } from 'node:fs';
import { join } from 'node:path';
import { createRedaction, credentialValues } from './redaction.mjs';
import { openPrivateLog } from './private-files.mjs';
import { commandFailure } from './failures.mjs';
import { waitForReadiness } from './readiness.mjs';
import { commandCustody } from './command-custody.mjs';
import { createProcessBaseline, createProcessScope, inheritedScopeTokens, processScopeEnvironment } from './process-scope.mjs';

export async function createCommands(directory,state,{terminal=text=>writeSync(1,text),spawn=spawnChild,queue:queuePolicy,custodyToken,onWaiting}={}) {
 let policy=queuePolicy?await commandPolicy():{environment:{},close:async()=>{}};
 const custodyBaseline=['darwin','linux'].includes(process.platform)?await createProcessBaseline():undefined;
 const logPath=join(directory,'install.log'), log=await openPrivateLog(logPath);
 const redaction=createRedaction();redaction.addSecrets(credentialValues(process.env));
 const registerCustody=environment=>{
  const secrets=[];
  for(const name of ['RER_JOB_POLICY','RER_JOB_MEMBERSHIP'])if(environment?.[name]){
   secrets.push(environment[name]);try{const value=JSON.parse(environment[name]);secrets.push(value.token,value.owner?.token);}catch{}
  }
  redaction.addSecrets(secrets.filter(value=>typeof value==='string'));
 };
 registerCustody(process.env);registerCustody(policy.environment);redaction.addSecrets([custodyToken].filter(Boolean));
 const ownershipRecords=new WeakMap();
 const captures=new WeakMap(), active=new Set(), managed=new Set();
 const cleanups=new Map();
 let signal, closed=false, terminalClosed=false;
 const writeTerminal=text=>{
  if(terminalClosed)return;
  try{terminal(text);}catch(error){
   // A reader may close stdout while detached children are still ours. Keep
   // capture and cleanup alive; nonblocking backpressure only loses this write.
   if(error.code==='EPIPE')terminalClosed=true;
   else if(error.code!=='EAGAIN'&&error.code!=='EWOULDBLOCK')throw error;
  }
 };
 const emit=text=>{
  if(!text)return;
  // Store a bounded text tail as lines; fragment writes do not multiply entries.
  const textTail=((state.logs||[]).join('\n')+text).slice(-65536);
  state.logs=textTail.split('\n').slice(-400);
  if(!closed)log.write(text);
  writeTerminal(text);
 };
 const report=text=>emit(redaction.redact(String(text))+'\n');
 const failure=(label,detail={},capture)=>{
  const outcome=`exit ${detail.code??'none'}, signal ${detail.signal??'none'}`;
  const status=detail.reason==='cancel'?`cancelled (${outcome})`:detail.reason==='deadline'?`readiness deadline exceeded (${outcome})`:detail.error?`could not start${detail.errorCode?` (${detail.errorCode})`:''} (${outcome})`:outcome;
  const lines=(capture?.snapshot()||'').split('\n');if(lines.at(-1)==='')lines.pop();
  return Object.assign(commandFailure(`${redaction.redact(String(label))}: ${status}.${detail.lastHealth?` Last health: ${redaction.redact(String(detail.lastHealth))}.`:''}\nLast output (up to 40 lines):\n${lines.length?lines.slice(-40).join('\n'):'(no output)'}\nLog: ${redaction.redact(logPath)}`,{childExitCode:detail.code,signal:detail.signal}),{childExitCode:detail.code,signal:detail.signal});
 };
 const track=(label,child,ownershipScope)=>{
  if(captures.has(child))return child;
  let resolveClose,resolveError,resolveExit;
  const capture={tail:'',scope:signal,closed:new Promise(resolve=>{resolveClose=resolve;}),failed:new Promise(resolve=>{resolveError=resolve;}),exited:new Promise(resolve=>{resolveExit=resolve;})};
  capture.custody=commandCustody(child,ownershipScope);
  // Redact in arrival order across both descriptors: their concatenation is what
  // reaches the shared page, disk and terminal sinks.
  const filter=redaction.stream(text=>{capture.tail=(capture.tail+text).slice(-32768);emit(text);});
  capture.snapshot=()=> (capture.tail+filter.snapshot()).slice(-32768);
  const sources=[child.stdout,child.stderr].filter(Boolean),data=chunk=>filter.write(chunk);
  for(const source of sources)source.on('data',data);
  let error,finished=false;
  child.once('error',cause=>{error=true;capture.errorCode=/^[A-Z_]{2,40}$/.test(cause?.code??'')?cause.code:undefined;resolveError({error:true,errorCode:capture.errorCode});});
  const exited=(code,terminationSignal)=>{capture.exitResult={code,signal:terminationSignal,error,errorCode:capture.errorCode};resolveExit(capture.exitResult);};
  child.once('exit',exited);
  const finish=(code,terminationSignal)=>{
   if(finished)return;finished=true;
   clearTimeout(capture.stopTimer);
   child.removeListener('exit',exited);if(!capture.exitResult)exited(code,terminationSignal);
   for(const source of sources)source.removeListener('data',data);
   filter.end();active.delete(child);if(!capture.custody)managed.delete(child);resolveClose({code,signal:terminationSignal,error,errorCode:capture.errorCode});
  };
  child.once('close',finish);
  captures.set(child,capture);
  if(child.exitCode!=null||child.signalCode!=null){
   // A late registration cannot rely on another close event or claim process
   // custody. Retain bytes already buffered at this observation boundary.
   for(const source of sources){let chunk;while((chunk=source.read())!==null){} }
   finish(child.exitCode,child.signalCode);
  }else {active.add(child);managed.add(child);}
  if(capture.custody)managed.add(child);
  return child;
 };
 const stopCommand=child=>{
  const capture=captures.get(child);
  if(!capture||!managed.has(child))return Promise.resolve();
  if(capture.stopping)return capture.stopping;
  capture.stopping=(async()=>{
   if(capture.custody)await capture.custody.stop();
   else if(active.has(child)){
    // Windows and injected non-process test children have no POSIX identities.
    // A direct ChildProcess handle remains the authority on Windows.
    child.kill?.('SIGTERM');
    capture.stopTimer=setTimeout(()=>{if(active.has(child))child.kill?.('SIGKILL');},1000);
    capture.stopTimer.unref();
   }
   await capture.closed;
   managed.delete(child);capture.removeCancellation?.();
  })();
  // Abort listeners cannot await. Preserve failures for run/stop/close callers.
  void capture.stopping.catch(()=>{});
  return capture.stopping;
 };
 const stopCommands=async commandScope=>{
  const children=[...managed].filter(child=>!commandScope||captures.get(child).scope===commandScope);
  await Promise.all(children.map(stopCommand));
  for(const [scope, actions] of [...cleanups])if(!commandScope||scope===commandScope){cleanups.delete(scope);for(const action of actions)await action();}
 };
 const spawnCommand=(label,command,args=[],options={})=>{
  if(closed)throw failure(label,{error:true});
  redaction.addSecrets(credentialValues(options.env));
  registerCustody(options.env);
  // An adapter that announces a step and then runs its command under the same
  // label must not show that label twice.
  const announced=redaction.redact(String(label)),repeated=state.step===announced;
  state.step=announced;if(!repeated)report(label);
  const {signal:providedSignal,afterCommand,onChild,heavy,phase,...native}=options;
  const commandSignal=signal&&providedSignal?AbortSignal.any([signal,providedSignal]):providedSignal||signal;
  if(commandSignal?.aborted)throw failure(label,{reason:'cancel'});
  const ownershipScope=createProcessScope(custodyBaseline);redaction.addSecrets([ownershipScope.token,...inheritedScopeTokens(process.env),...inheritedScopeTokens(native.env)]);
  const child=spawn(command,args,{...native,env:processScopeEnvironment(ownershipScope,{...(native.env??process.env),...policy.environment,...(custodyToken?{RER_ONBOARDING_PROCESS_OWNER:[...inheritedScopeTokens(native.env??process.env),custodyToken].join(',')}:{})}),shell:false,detached:process.platform!=='win32',stdio:[Array.isArray(native.stdio)?native.stdio[0]:'ignore','pipe','pipe',...(native.stdio?.includes('ipc')?['ipc']:[])]});
  onChild?.(child);
  ownershipRecords.set(child,{pid:child.pid,token:ownershipScope.token});
  track(label,child,ownershipScope);
  const cancel=()=>{void stopCommand(child);};
  commandSignal?.addEventListener('abort',cancel,{once:true});if(commandSignal?.aborted)cancel();
  const capture=captures.get(child);capture.removeCancellation=()=>commandSignal?.removeEventListener('abort',cancel);
  if(!capture.custody)void capture.closed.then(capture.removeCancellation);
  return child;
 };
 return {
  async configureQueue(value){if(!queuePolicy){queuePolicy=value;policy=await commandPolicy();registerCustody(policy.environment);}},
  ownership:child=>ownershipRecords.get(child),
  addSecrets:redaction.addSecrets, redact:redaction.redact, redactionStream:redaction.stream, report, logPath, track, stopCommands,
  ownCleanup(scope,action){const actions=cleanups.get(scope)??[];actions.push(action);cleanups.set(scope,actions);},
  setCommandSignal(value){signal=value;},
  spawn:spawnCommand,
  async stop(child){await stopCommand(child);await captures.get(child)?.closed;const scope=captures.get(child)?.scope;if(![...managed].some(other=>captures.get(other).scope===scope)){const actions=cleanups.get(scope)??[];cleanups.delete(scope);for(const action of actions)await action();}},
  async run(label,command,args=[],options={}) {
   if(queuePolicy && options.heavy !== false) {
    let queuedChild;
    const result = await queuedCommand(command,args,{...options,originalCI:policy.ci,
     label:await queueLabel(options.cwd??process.cwd(),queuePolicy.verb,options.phase??'command'),report,onWaiting,
     spawn:(program,argv,native)=>(queuedChild=spawnCommand(label,program,argv,{...native,onChild:options.onChild})),cleanup:async(child,result)=>{await stopCommand(child);await options.afterCommand?.(result);}});
    if(result){if(result.code!==0)throw failure(label,result,captures.get(queuedChild));return result;}
   }
   let child;try{child=spawnCommand(label,command,args,options);}catch{throw failure(label,options.signal?.aborted||signal?.aborted?{reason:'cancel'}:{error:true});}
   const capture=captures.get(child);
   // Start cleanup at exit: inherited pipes can hold close open indefinitely.
   // Only run's bounded command ends here; spawn's app stays owned until stop.
   if(capture.custody){await capture.exited;await stopCommand(child);}
   const result=await capture.closed;
   const cancelled=options.signal?.aborted||capture.scope?.aborted;
   if(result.code!==0||result.signal||result.error||cancelled)throw failure(label,{...result,...(cancelled?{reason:'cancel'}:{})},capture);
   return child;
  },
  async waitForReady(label,child,health,options={}) {
   state.step=redaction.redact(String(label));track(label,child);const capture=captures.get(child);
   const readinessSignal=signal&&options.signal?AbortSignal.any([signal,options.signal]):options.signal||signal;
   return waitForReadiness(label,child,health,{...options,signal:readinessSignal},capture,report,(step,detail)=>failure(step,detail,capture));
  },
  async closeCommands(){await stopCommands();if(!closed){closed=true;await log.close();await policy.close();}}
 };
}
