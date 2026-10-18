import {randomUUID} from 'node:crypto';
import {validateDefinition,RUNNER_VERSION} from '../../src/domain/policy.mjs';
import {httpAssertions} from '../../src/domain/http-assertions.mjs';
import {apiRequirementCheck,apiErrorCheck,apiSkippedCheck,apiCleanupSummary,validateApiTransactionEvidence,apiTransactionChecks,apiTransactionOutcome} from '../../src/domain/api-transaction-evidence.mjs';
import {apiRequestValues,extractedApiValues} from './api-transaction-values.mjs';
import {publicHttp} from './public-http.mjs';
const runnerErrors = new Set(['custody','runner','network','dns','credential','grant']);
const categories = new Set([...runnerErrors,'timeout','connection','transport','unresolved','tls','redirect','body-limit','encoding']);
export async function probeApiTransaction(input,probe,{monitorId,signal,privateAccess}={}) {
  const def = validateDefinition(input,[]), startedAt = Date.now(), deadline = startedAt+def.timeoutMs;
  if (def.type !== 'api') throw Error('API transaction definition required');
  const origin = new URL(def.url).origin, variables = {...def.api.variables}, steps = [];
  const cleanupCount = def.api.steps.filter(step=>step.phase==='cleanup').length;
  const reserve = cleanupCount?Math.min(Math.floor(def.timeoutMs/2),Math.max(1000,cleanupCount*1000)):0;
  const requestDeadline = deadline-reserve;
  let failed = false;
  for (const step of def.api.steps) {
    const at = Date.now();
    const entry = {name:step.name,phase:step.phase,startedAt:at,completedAt:at,durationMs:0,outcome:'skipped',checks:[apiSkippedCheck()]};
    steps.push(entry);
    if (failed && step.phase !== 'cleanup') continue;
    let values;
    try {values=apiRequestValues(step,variables,origin)} catch {
      // Missing extracted values are a visible unavailable cleanup, never a second fabricated request.
      if (failed) continue;
      entry.outcome='target_failure';entry.checks=[apiErrorCheck('variable')];failed=true;continue;
    }
    const stepDeadline = step.phase === 'cleanup'?deadline:requestDeadline;
    if (Date.now() >= stepDeadline) {entry.outcome='target_failure';entry.checks=[apiErrorCheck('timeout')];failed=true;continue}
    const abort = new AbortController();let active;
    const remaining = Math.max(1,stepDeadline-Date.now());
    const executionSignal = AbortSignal.any([...(signal?[signal]:[]),abort.signal]);
    let timer, phase = 'target';
    const timeout = new Promise((_,reject)=>{timer=setTimeout(()=>{abort.abort();active?.destroy();reject({category:phase==='authentication'?'credential':'timeout'})},remaining)});
    try {
      // A runtime authentication header replaces local login authority after extraction.
      const runtimeAuth = Object.keys(values.requestValues.headers).some(name=>['authorization','cookie','x-api-key','api-key'].includes(name));
      const response = await Promise.race([timeout,publicHttp({...def,url:values.url,method:step.method,request:runtimeAuth?undefined:def.request},executionSignal,request=>active=request,{monitorId,privateAccess,requestValues:values.requestValues,onPhase:value=>phase=value})]);
      entry.status=response.status;
      // The ordinary JSON assertion diagnostic can mention values. Keep only fixed result text here.
      entry.checks=httpAssertions({assertions:step.assertions,request:{credentialRef:'transaction'}},response,Date.now()-at).map(check=>apiRequirementCheck(check.assertion,check.pass));
      if ([401,403].includes(response.status)) entry.checks.push(apiRequirementCheck('authentication',false));
      if (step.extract) {
        let extracted;
        try {extracted=extractedApiValues(step.extract,response.body);Object.assign(variables,extracted)} catch {}
        entry.checks.push(apiRequirementCheck('extract',Boolean(extracted)));
      }
      entry.outcome=entry.checks.every(check=>check.pass)?'pass':'target_failure';
    } catch (error) {
      const category = categories.has(error.category)?error.category:error.code==='credential'?'credential':'runner';
      entry.outcome=runnerErrors.has(category)?'runner_error':'target_failure';
      entry.checks=[apiErrorCheck(category)];
    } finally {
      clearTimeout(timer);abort.abort();active?.destroy();
      entry.completedAt=Date.now();entry.durationMs=entry.completedAt-at;
      const latency=entry.checks.find(check=>check.assertion==='latency');
      if (latency) {Object.assign(latency,apiRequirementCheck('latency',entry.durationMs<=step.assertions.latencyMs));entry.outcome=entry.checks.every(check=>check.pass)?'pass':'target_failure'}
    }
    failed ||= entry.outcome !== 'pass';
  }
  const completedAt=Date.now(),apiTransaction={steps,cleanup:apiCleanupSummary(steps)};
  validateApiTransactionEvidence(apiTransaction,def);
  return {id:randomUUID(),probe,startedAt,completedAt,durationMs:completedAt-startedAt,runnerVersion:RUNNER_VERSION,outcome:apiTransactionOutcome(apiTransaction),checks:apiTransactionChecks(def,apiTransaction),apiTransaction};
}
