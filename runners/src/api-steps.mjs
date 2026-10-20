// API-004: the one engine for API transaction steps and for the setup/teardown fixtures around a browser flow. Setup and cleanup
// steps make bounded attempts; cleanup runs after a failure and after a cancellation, inside its reserved budget and outside the
// cancelled signal; a live effect is refused before anything is sent unless an exact grant covers it, rechecked on every attempt.
// Extracted values stay in `ctx.variables` on this runner and never enter a step's evidence.
import http from 'node:http';
import {httpAssertions} from '../../src/domain/http-assertions.mjs';
import {API_FIXTURE_ATTEMPTS,API_FIXTURE_BACKOFF_MS,apiRequirementCheck,apiErrorCheck,apiSkippedCheck} from '../../src/domain/api-transaction-evidence.mjs';
import {templateVariables} from '../../src/domain/api-transaction-template.mjs';
import {activeGrant,declaredEffect,liveCredentialShape,responseLivemode,stepSpend} from '../../src/domain/api-effects.mjs';
import {RUNNER_VERSION,MAX_BODY} from '../../src/domain/policy.mjs';
import {apiRequestValues,extractedApiValues} from './api-transaction-values.mjs';
import {ProbeError} from './probe-error.mjs';
const runnerErrors = new Set(['custody','runner','network','dns','credential','grant','cancelled']);
const categories = new Set([...runnerErrors,'timeout','connection','transport','unresolved','tls','redirect','body-limit','encoding']);
// A fixture attempt is repeated only after a failure another attempt could change.
const retryable = entry => entry.checks.length === 1 && ['timeout','connection','transport','runner'].includes(entry.checks[0].assertion) || [408,429].includes(entry.status) || entry.status >= 500;
const sleep = (ms,signal) => new Promise(resolve => {const timer = setTimeout(resolve,ms);signal?.addEventListener('abort',() => {clearTimeout(timer);resolve()},{once:true})});
const names = step => [...templateVariables(step.url),...Object.values(step.headers??{}).flatMap(templateVariables),...[...(step.body??'').matchAll(/\{\{([A-Za-z][A-Za-z0-9_]{0,39})\}\}/g)].map(m => m[1])];

export const fixtureContext = variables => ({variables:{...variables},pending:new Set(),failed:false,cancelled:false,entries:[]});

/** Run `steps` in order into `ctx.entries`. `send(step,values,options)` makes one request and returns {status,headers,body}. */
export async function runApiSteps(steps,ctx,{origin,send,deadline,requestDeadline=deadline,signal,grants=[],now=Date.now}) {
  for (const step of steps) {
    const at = Date.now(), cleanup = step.phase === 'cleanup';
    const entry = {name:step.name,phase:step.phase,startedAt:at,completedAt:at,durationMs:0,outcome:'skipped',checks:[apiSkippedCheck()],attempts:0};
    ctx.entries.push(entry);
    const done = (outcome,check) => {entry.outcome = outcome;entry.checks = [check];entry.completedAt = Date.now();entry.durationMs = entry.completedAt-at};
    // A cancellation stops the journey at the next step that is not cleanup; cleanup still runs.
    if (!cleanup && !ctx.failed && signal?.aborted) {ctx.cancelled = ctx.failed = true;done('runner_error',apiErrorCheck('cancelled'));continue}
    if (ctx.failed && !cleanup) continue;
    let values;
    try {values = apiRequestValues(step,ctx.variables,origin)} catch {
      // A value that a step reported creating but that never reached this runner is a visible cleanup failure, never a
      // second fabricated request. A value whose step created nothing leaves nothing to clean up.
      if (ctx.failed) {if (cleanup && names(step).some(name => ctx.pending.has(name))) done('target_failure',apiErrorCheck('variable'));continue}
      done('target_failure',apiErrorCheck('variable'));ctx.failed = true;continue;
    }
    const stepDeadline = cleanup ? deadline : requestDeadline, limit = step.phase === 'request' ? 1 : API_FIXTURE_ATTEMPTS, declared = declaredEffect(step);
    for (;;) {
      if (Date.now() >= stepDeadline) {if (!entry.attempts) done('target_failure',apiErrorCheck('timeout'));break}
      entry.attempts++;delete entry.status;
      await attempt(step,values,entry,ctx,{send,stepDeadline,signal:cleanup?undefined:signal,declared,grants,now});
      const wait = API_FIXTURE_BACKOFF_MS*entry.attempts;
      if (entry.outcome === 'pass' || entry.attempts >= limit || !retryable(entry) || !cleanup && signal?.aborted || Date.now()+wait >= stepDeadline) break;
      await sleep(wait,cleanup?undefined:signal);
    }
    entry.completedAt = Date.now();entry.durationMs = entry.completedAt-at;
    const latency = entry.checks.find(check => check.assertion === 'latency');
    if (latency) {Object.assign(latency,apiRequirementCheck('latency',entry.durationMs <= step.assertions.latencyMs));entry.outcome = entry.checks.every(check => check.pass) ? 'pass' : 'target_failure'}
    if (entry.checks[0].assertion === 'cancelled') ctx.cancelled = true;
    ctx.failed ||= entry.outcome !== 'pass';
  }
  return ctx;
}

async function attempt(step,values,entry,ctx,{send,stepDeadline,signal,declared,grants,now}) {
  const started = Date.now(), abort = new AbortController();
  let active, timer, phase = 'target';
  const executionSignal = AbortSignal.any([...(signal ? [signal] : []),abort.signal]);
  const timeout = new Promise((_,reject) => {timer = setTimeout(() => {abort.abort();active?.destroy();reject({category:phase === 'authentication' ? 'credential' : 'timeout'})},Math.max(1,stepDeadline-Date.now()))});
  // Spend is taken from the grant before the request leaves, so an exhausted or expired grant sends nothing.
  const charge = (effect,amount) => {
    const grant = activeGrant(grants,effect,now());
    if (!grant || grant.remaining < amount) throw new ProbeError('grant','No active grant covers this live effect');
    grant.remaining -= amount;entry.effect = effect;entry.spend = (entry.spend ?? 0)+amount;
  };
  const beforeSend = ({headers,body}) => {
    const effect = declared ?? (liveCredentialShape([...Object.values(headers ?? {}),body]) ? 'live-payment' : null);
    if (effect) charge(effect,stepSpend(body));
  };
  try {
    const response = await Promise.race([timeout,send(step,values,{signal:executionSignal,onRequest:request => active = request,onPhase:value => phase = value,beforeSend})]);
    // A response that says it is live mode is a live effect even when nothing sent showed it.
    if (!entry.effect && responseLivemode(response.body)) try {charge('live-payment',stepSpend(values.requestValues.body))} catch {
      // What the live response created is never cleaned up without a grant either: its cleanup stays visible as debt.
      for (const name of Object.keys(step.extract ?? {})) ctx.pending.add(name);
      entry.outcome = 'runner_error';entry.checks = [apiErrorCheck('grant')];return;
    }
    entry.status = response.status;
    // The ordinary JSON assertion diagnostic can mention values. Keep only fixed result text here.
    entry.checks = httpAssertions({assertions:step.assertions,request:{credentialRef:'transaction'}},response,Date.now()-started).map(check => apiRequirementCheck(check.assertion,check.pass));
    if ([401,403].includes(response.status)) entry.checks.push(apiRequirementCheck('authentication',false));
    if (step.extract) {
      let extracted;
      try {extracted = extractedApiValues(step.extract,response.body);Object.assign(ctx.variables,extracted)} catch {}
      entry.checks.push(apiRequirementCheck('extract',Boolean(extracted)));
      // The target reported success but its identifier never arrived: whatever it created still needs cleanup.
      if (!extracted && entry.checks.find(check => check.assertion === 'status')?.pass) for (const name of Object.keys(step.extract)) ctx.pending.add(name);
    }
    entry.outcome = entry.checks.every(check => check.pass) ? 'pass' : 'target_failure';
  } catch (error) {
    const category = signal?.aborted ? 'cancelled' : categories.has(error?.category) ? error.category : error?.code === 'credential' ? 'credential' : 'runner';
    entry.outcome = runnerErrors.has(category) ? 'runner_error' : 'target_failure';
    entry.checks = [apiErrorCheck(category)];
    // A request that left and never answered may have created what its extraction names.
    if (active && step.extract && ['cancelled','timeout','connection','transport'].includes(category)) for (const name of Object.keys(step.extract)) ctx.pending.add(name);
  } finally {clearTimeout(timer);abort.abort();active?.destroy()}
}

/** One fixture request to the granted local synthetic endpoint: plain HTTP, no redirects, every response proving its identity. */
export function syntheticSend(grant) {
  return (step,values,{signal,onRequest,beforeSend}) => new Promise((resolve,reject) => {
    const url = new URL(values.url), body = values.requestValues.body, headers = {'user-agent':RUNNER_VERSION,accept:'application/json',...values.requestValues.headers};
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || Number(url.port) !== grant.port) {reject(new ProbeError('network'));return}
    try {beforeSend({headers,body})} catch (error) {reject(error);return}
    let size = 0;const chunks = [], fail = category => reject(new ProbeError(category));
    const request = http.request(url,{method:step.method,agent:new http.Agent({keepAlive:false,proxyEnv:{}}),signal,headers:{...headers,...(body !== undefined ? {'content-length':Buffer.byteLength(body)} : {})}},response => {
      if (response.headers['x-uptime-fixture'] !== grant.identity) {fail('custody');response.destroy();return}
      if (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity') {fail('encoding');response.destroy();return}
      if (response.statusCode >= 300 && response.statusCode < 400) {fail('redirect');response.destroy();return}
      response.on('data',chunk => {size += chunk.length;if (size > MAX_BODY) {fail('body-limit');response.destroy()} else chunks.push(chunk)});
      response.on('end',() => resolve({status:response.statusCode,headers:response.headers,body:Buffer.concat(chunks).toString('utf8'),bytes:size}));
      response.on('error',() => fail('transport'));
    });
    request.on('error',() => fail(signal.aborted ? 'timeout' : 'connection'));request.on('close',() => request.agent.destroy());onRequest(request);request.end(body);
  });
}
