import {randomUUID} from 'node:crypto';
import {validateDefinition,RUNNER_VERSION} from '../../src/domain/policy.mjs';
import {apiCleanupSummary,validateApiTransactionEvidence,apiTransactionChecks,apiTransactionOutcome} from '../../src/domain/api-transaction-evidence.mjs';
import {publicHttp} from './public-http.mjs';
import {fixtureContext,runApiSteps} from './api-steps.mjs';
// Cleanup keeps a reserved share of the wall time, so a slow or cancelled request phase still leaves it room to run.
export const cleanupReserve = (timeoutMs,count) => count ? Math.min(Math.floor(timeoutMs/2),Math.max(1000,count*1000)) : 0;
export async function probeApiTransaction(input,probe,{monitorId,signal,privateAccess,grants,now}={}) {
  const def = validateDefinition(input,[]), startedAt = Date.now(), deadline = startedAt+def.timeoutMs;
  if (def.type !== 'api') throw Error('API transaction definition required');
  const origin = new URL(def.url).origin;
  const reserve = cleanupReserve(def.timeoutMs,def.api.steps.filter(step => step.phase === 'cleanup').length);
  // A runtime authentication header replaces local login authority after extraction.
  const send = (step,values,{signal:requestSignal,onRequest,onPhase,beforeSend}) => {
    const runtimeAuth = Object.keys(values.requestValues.headers).some(name => ['authorization','cookie','x-api-key','api-key'].includes(name));
    return publicHttp({...def,url:values.url,method:step.method,request:runtimeAuth?undefined:def.request},requestSignal,onRequest,{monitorId,privateAccess,requestValues:values.requestValues,onPhase,beforeSend});
  };
  const ctx = await runApiSteps(def.api.steps,fixtureContext(def.api.variables),{origin,send,deadline,requestDeadline:deadline-reserve,signal,grants,now});
  const steps = ctx.entries, completedAt = Date.now(), apiTransaction = {steps,cleanup:apiCleanupSummary(steps),...(ctx.cancelled?{cancelled:true}:{})};
  validateApiTransactionEvidence(apiTransaction,def);
  return {id:randomUUID(),probe,startedAt,completedAt,durationMs:completedAt-startedAt,runnerVersion:RUNNER_VERSION,outcome:apiTransactionOutcome(apiTransaction),checks:apiTransactionChecks(def,apiTransaction),apiTransaction};
}
