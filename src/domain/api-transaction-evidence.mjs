import {statusMatches} from './http-assertions/status.mjs';
import {httpAssertionNames} from './http-assertions/config.mjs';
import {API_EFFECTS} from './api-effects.mjs';
// API-004: setup and cleanup steps make up to this many attempts, a short backoff apart, inside the transaction's wall and
// cleanup reserve. A request step is never replayed.
export const API_FIXTURE_ATTEMPTS = 3, API_FIXTURE_BACKOFF_MS = 200;
const runnerErrors = new Set(['custody','runner','network','dns','credential','grant','cancelled']);
const transportErrors = new Set([...runnerErrors,'timeout','connection','transport','unresolved','tls','redirect','body-limit','encoding','variable']);
const own = (value,keys) => {if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) throw Error('Invalid API transaction evidence')};
export const apiRequirementCheck = (assertion,pass) => ({assertion,pass,reason:pass?'API requirement passed':'API requirement failed'});
export const apiErrorCheck = category => ({assertion:category,pass:false,reason:`API ${category} check failed`});
export const apiSkippedCheck = () => ({assertion:'dependency',pass:false,reason:'API step unavailable after an earlier failure'});
export function apiTransactionOutcome(facts) {
  return facts.cancelled || facts.steps.some(step => step.outcome === 'runner_error') ? 'runner_error' : facts.steps.some(step => step.outcome !== 'pass') ? 'target_failure' : 'pass';
}
export function apiTransactionChecks(def,facts) {
  return def.api.steps.map((_step,i) => ({assertion:`api-step-${i+1}`,pass:facts.steps[i].outcome==='pass',reason:facts.steps[i].outcome==='pass'?'API step passed':facts.steps[i].outcome==='skipped'?'API step skipped after an earlier failure':'API step failed'}));
}
export function apiCleanupSummary(steps) {
  const cleanup = steps.filter(step => step.phase === 'cleanup');
  return {attempted:cleanup.filter(step => step.outcome !== 'skipped').length,passed:cleanup.filter(step => step.outcome === 'pass').length,failed:cleanup.filter(step => ['target_failure','runner_error'].includes(step.outcome)).length,skipped:cleanup.filter(step => step.outcome === 'skipped').length};
}
/** The cleanup steps a run could not complete: each becomes one retained cleanup debt. */
export const incompleteCleanup = steps => steps.map((step,index) => ({step,index})).filter(({step}) => step.phase === 'cleanup' && ['target_failure','runner_error'].includes(step.outcome));
export const failureCategory = step => step.checks.find(check => !check.pass)?.assertion ?? 'cleanup';
function validateSteps(facts,expected,timeoutMs) {
  if (!Array.isArray(facts.steps) || facts.steps.length !== expected.length) throw Error('API step evidence differs from the revision');
  let failed = false, previous = 0;
  for (const [i,entry] of facts.steps.entries()) {
    const step = expected[i];
    own(entry,['name','phase','startedAt','completedAt','durationMs','status','outcome','checks','attempts','effect','spend']);
    if (entry.name !== step.name || entry.phase !== step.phase || !['pass','target_failure','runner_error','skipped'].includes(entry.outcome)) throw Error('API step evidence differs from the revision');
    if (![entry.startedAt,entry.completedAt,entry.durationMs].every(Number.isSafeInteger) || entry.startedAt < previous || entry.completedAt < entry.startedAt || entry.durationMs !== entry.completedAt-entry.startedAt || entry.durationMs > timeoutMs) throw Error('Invalid API step timing');
    previous = entry.completedAt;
    // Earlier runners made one attempt and did not record the count.
    if (entry.attempts !== undefined && (!Number.isInteger(entry.attempts) || entry.attempts < 0 || entry.attempts > (step.phase === 'request' ? 1 : API_FIXTURE_ATTEMPTS) || entry.outcome === 'skipped' && entry.attempts !== 0)) throw Error('Invalid API step attempts');
    if (entry.effect !== undefined && !API_EFFECTS.includes(entry.effect) || entry.spend !== undefined && (entry.effect === undefined || !Number.isSafeInteger(entry.spend) || entry.spend < 1)) throw Error('Invalid API step effect');
    if (entry.status !== undefined && (!Number.isInteger(entry.status) || entry.status < 100 || entry.status > 599)) throw Error('Invalid API step status');
    if (!Array.isArray(entry.checks) || !entry.checks.length || entry.checks.length > 10) throw Error('Invalid API step checks');
    for (const check of entry.checks) {own(check,['assertion','pass','reason']);if (typeof check.pass !== 'boolean') throw Error('Invalid API step check')}
    if (entry.outcome === 'skipped') {
      if (!failed || entry.status !== undefined || entry.durationMs !== 0 || entry.effect !== undefined || JSON.stringify(entry.checks)!==JSON.stringify([apiSkippedCheck()])) throw Error('Invalid skipped API step');
      continue;
    }
    if (failed && step.phase !== 'cleanup') throw Error('API request continued after failure');
    const error = entry.checks.length === 1 && transportErrors.has(entry.checks[0].assertion) && entry.checks[0].reason === apiErrorCheck(entry.checks[0].assertion).reason;
    if (error) {
      const check = entry.checks[0];
      if (check.pass || entry.status !== undefined || entry.outcome !== (runnerErrors.has(check.assertion)?'runner_error':'target_failure')) throw Error('Invalid API transport evidence');
      if (check.assertion === 'cancelled' && (!facts.cancelled || step.phase === 'cleanup')) throw Error('Invalid API cancellation evidence');
    } else {
      if (entry.status === undefined) throw Error('API response evidence needs a status');
      const names = [...httpAssertionNames(step.assertions),...([401,403].includes(entry.status)?['authentication']:[]),...(step.extract?['extract']:[])];
      if (entry.checks.length !== names.length || entry.checks.some((check,j) => check.assertion !== names[j] || check.reason !== apiRequirementCheck(names[j],check.pass).reason)) throw Error('API checks differ from the revision');
      if (entry.checks.find(check=>check.assertion==='status')?.pass !== statusMatches(entry.status,step.assertions.status)) throw Error('API status contradicts its assertion');
      if (step.assertions.latencyMs !== undefined && entry.checks.find(check=>check.assertion==='latency')?.pass !== (entry.durationMs<=step.assertions.latencyMs)) throw Error('API latency contradicts its timing');
      if ([401,403].includes(entry.status) && entry.checks.find(check => check.assertion === 'authentication')?.pass !== false) throw Error('Rejected API authentication cannot pass');
      if (entry.outcome !== (entry.checks.every(check => check.pass)?'pass':'target_failure')) throw Error('API outcome contradicts its checks');
    }
    failed ||= entry.outcome !== 'pass';
  }
  const summary = apiCleanupSummary(facts.steps);
  own(facts.cleanup,Object.keys(summary));
  if (Object.keys(summary).some(key => facts.cleanup[key] !== summary[key])) throw Error('Invalid API cleanup evidence');
  if (facts.cancelled !== undefined && facts.cancelled !== true) throw Error('Invalid API cancellation evidence');
}
export function validateApiTransactionEvidence(facts,definition) {
  own(facts,['steps','cleanup','cancelled']);
  validateSteps(facts,definition.api.steps,definition.timeoutMs);
  // A cancelled transaction names the step the cancellation stopped.
  if (facts.cancelled && !facts.steps.some(step => step.checks[0]?.assertion === 'cancelled')) throw Error('Invalid API cancellation evidence');
  if (facts.steps.at(-1).completedAt - facts.steps[0].startedAt > definition.timeoutMs + 1000) throw Error('API transaction exceeded its time bound');
  return facts;
}
/** A browser flow's setup and teardown evidence: the same step facts, in revision order, around the browser run. */
export function validateFixtureEvidence(facts,definition) {
  own(facts,['steps','cleanup','cancelled']);
  const fixtures = definition.flow.fixtures;
  validateSteps(facts,[...fixtures.setup,...fixtures.teardown],definition.timeoutMs);
  if (facts.steps.at(-1).completedAt - facts.steps[0].startedAt > definition.timeoutMs + 1000) throw Error('Flow fixtures exceeded their time bound');
  return facts;
}
