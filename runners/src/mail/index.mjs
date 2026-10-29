import {diagnosticCapture,attachProtocolDiagnostics} from '../protocol-diagnostics.mjs';
import {randomUUID} from 'node:crypto';
import {RUNNER_VERSION} from '../../../src/domain/policy.mjs';
import {validateMailSettings} from '../../../src/domain/mail-probe/schema.mjs';
import {mailChecks} from '../../../src/domain/mail-probe/evaluate.mjs';
import {MailError,mailError} from './transport.mjs';
import {openMailSession} from './session.mjs';
import {sendAndReceive} from './transaction.mjs';

/** Native pinned mail execution. resolveCredential is a network/test boundary; production uses protected local files. */
export async function mailFacts(input,{signal,privateAccess,network='public',timeoutMs=30000,capture,...options}={}){
 const settings=validateMailSettings(input,{network}),deadline=Date.now()+timeoutMs;
 const execution=AbortSignal.any([AbortSignal.timeout(timeoutMs),...(signal?[signal]:[])]);
 const facts={protocol:settings.protocol,steps:[]};let session;
 const step=async(name,fn)=>{
  const started=Date.now();
  try{await fn();facts.steps.push({step:name,pass:true,durationMs:Date.now()-started})}
  catch(error){const category=mailError(error,execution).category;facts.steps.push({step:name,pass:false,durationMs:Date.now()-started,category});throw new MailError(category)}
 };
 try{
  if(network==='private'&&!privateAccess)await step('connection',()=>{throw new MailError('grant')});
  const context={...options,capture,signal:execution,deadline,budget:{receivedBytes:0},privateAccess:network==='private'?privateAccess:undefined};
  session=await openMailSession(settings,context,step);facts.address=session.address;
  if(settings.transaction){
   facts.transaction={messageId:`<uptime-${randomUUID()}@synthetic.uptime.invalid>`,smtpAccepted:false,received:false,cleanup:false};
   await sendAndReceive(session,settings.transaction,context,step,facts.transaction);
  }
 }catch(error){if(!facts.steps.some(s=>!s.pass))facts.steps.push({step:'connection',pass:false,durationMs:0,category:'runner'})}
 finally{session?.channel.destroy()}
 return facts;
}
/** Standard signed-runner observation, matching the other native protocol probes' call shape. */
export async function probeMail(definition,probe,grants=[],options={}){
 const startedAt=Date.now(),capture=diagnosticCapture();
 const facts=await mailFacts(definition.mail,{...options,capture,timeoutMs:definition.timeoutMs,network:definition.network});
 const completedAt=Date.now();
 return attachProtocolDiagnostics(definition,{id:randomUUID(),probe,startedAt,completedAt,durationMs:completedAt-startedAt,runnerVersion:RUNNER_VERSION,...mailChecks(definition,facts),protocol:facts},capture,options);
}
