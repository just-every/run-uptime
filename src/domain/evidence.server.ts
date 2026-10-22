// @ts-ignore Shared native mail evidence.
import {validateMailFacts} from './mail-probe/facts.mjs'
// @ts-ignore
import {mailChecks} from './mail-probe/evaluate.mjs'
// @ts-ignore Shared transaction facts contain no extracted values.
import {validateApiTransactionEvidence,apiTransactionChecks,apiTransactionOutcome,validateFixtureEvidence} from './api-transaction.mjs'
import {normalizeFailureSnapshot,FAILURE_SNAPSHOT_LIMITS} from './failure-snapshot.mjs'
// @ts-ignore Shared monitor-scoped certificate trust facts.
import {validateTlsTrustEvidence,TLS_EVIDENCE_MAX_BYTES} from './tls-trust.mjs'
// @ts-ignore Shared signed job snapshot evaluation.
import {heartbeatEvaluation} from './heartbeat-job.mjs'
// Signed completion and portable history share the same evidence contract.
// @ts-ignore HTTP bundle identities and status semantics are shared with both probes.
import {httpAssertionNames} from './http-assertions/config.mjs'
// @ts-ignore Portable status sets and ranges.
import {statusMatches} from './http-assertions/status.mjs'
// @ts-ignore Provider claims can be absent without proving target failure.
import {validDependencyMissingCheck} from './dependency-status.mjs'
// @ts-ignore A followed service's claim is recomputed by the catalog's shared evidence rules.
import {validateClaimEvidence} from './service-catalog/followed.mjs'
// @ts-ignore Edition flow vocabulary is JavaScript shared with the runner.
import {FLOW_LIMITS,FLOW_REASONS,validateFlowEvidence} from './flow.mjs'
// @ts-ignore PERF-001 page-speed facts and budget decision are JavaScript shared with the runner.
import {PAGESPEED_LIMITS,validatePageSpeedEvidence,pageSpeedChecks} from './pagespeed.mjs'
// @ts-ignore Bounded non-secret diagnostics are shared with the runner.
import {validBindingDiagnostic, bindingReason, BINDING_DIAGNOSTIC_BYTES} from './credential-binding.mjs'
// @ts-ignore Protocol evidence is evaluated by the same JavaScript in the Worker, the runner and here.
import {isProtocol} from './protocol/settings.mjs'
// @ts-ignore
import {protocolChecks} from './protocol/evaluate.mjs'
// @ts-ignore
import {validateFacts} from './protocol/facts.mjs'
const fields = new Set(['id', 'probe', 'outcome', 'completedAt', 'startedAt', 'durationMs', 'runnerVersion', 'status', 'bytes', 'checks', 'attempt', 'heartbeatReceivedAt', 'heartbeatJob', 'tlsTrust', 'canary', 'flow', 'credentialBinding', 'protocol','apiTransaction','failureSnapshot','fixtures','claim','pagespeed'])
// unresolved: the public resolver answered NXDOMAIN or no address. budget: a Worker run spent its outbound requests first.
// refused: the target's port refused the connection; tls: the TLS handshake failed before a certificate could be read.
// vantage: this vantage cannot run the check (a Worker socket to a Cloudflare address); registry: RDAP data unavailable.
const targetErrors = new Set(['encoding', 'redirect', 'body-limit', 'transport', 'timeout', 'connection', 'unresolved', 'refused', 'tls', 'response_limit'])
// debt: API-004 refused new setup while three cleanup debts of the monitor are open.
const runnerErrors = new Set(['custody', 'runner', 'network', 'dns', 'browser', 'credential', 'grant', 'budget', 'vantage', 'registry', 'capacity', 'debt'])
const responseErrors = new Set(['encoding', 'redirect', 'body-limit'])
/** Live completion accepts runner clocks up to this far ahead of control-plane time. */
export const COMPLETION_CLOCK_ALLOWANCE_MS = 1000
const timestamp = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0

interface Check { assertion: string; pass: boolean; reason: string }
type ValidationMode = 'live-completion' | 'historical-restore'

function validateChecks(value: any, binding = false): Map<string, Check> {
  if (!Array.isArray(value) || !value.length || value.length > 10) throw Error('Invalid assertion evidence')
  const checks = new Map<string, Check>()
  for (const check of value) {
    if (!check || typeof check !== 'object' || Array.isArray(check) ||
        Object.keys(check).sort().join(',') !== 'assertion,pass,reason' ||
        typeof check.assertion !== 'string' || checks.has(check.assertion) ||
        typeof check.pass !== 'boolean' || typeof check.reason !== 'string' ||
        !check.reason || check.reason.length > (binding ? 1200 : 300)) throw Error('Invalid assertion evidence')
    checks.set(check.assertion, check)
  }
  return checks
}

function validateError(o: any, checks: Map<string, Check>, heartbeat = false) {
  const [check] = checks.values()
  if (checks.size !== 1 || check.pass || o.heartbeatReceivedAt !== undefined) throw Error('Invalid error evidence')
  // Earlier HTTP runners retained the response status when rejecting encoding,
  // redirects or body size. These are incomplete responses, not assertion bundles.
  if (o.status !== undefined || o.bytes !== undefined) {
    if (heartbeat || !responseErrors.has(check.assertion) || !Number.isInteger(o.status) ||
        o.status < 100 || o.status > 599 ||
        (o.bytes !== undefined && (!Number.isInteger(o.bytes) || o.bytes < 0 || o.bytes > 65536))) {
      throw Error('Invalid error transport evidence')
    }
  }
  const outcome = heartbeat
    ? check.assertion === 'runner' ? 'runner_error' : undefined
    : runnerErrors.has(check.assertion) ? 'runner_error'
      : targetErrors.has(check.assertion) ? 'target_failure' : undefined
  if (!outcome || o.outcome !== outcome) throw Error('Invalid error outcome')
}

// A flow observation carries its sanitized step trace. It passes only when every step passed and every required outcome was
// observed; it fails with a reason the runner could not have chosen for itself (a runner-side reason is a runner_error, Unknown).
// API-004: a flow with fixtures carries their step facts. Setup that did not pass ends the run before the browser
// (setup_failed, or Unknown for a runner-side refusal); teardown never changes the browser's verdict, and one that did not
// complete becomes cleanup debt. A cancelled run is Unknown and still carries the teardown it ran.
function validateFixtures(o: any, definition: any) {
  if (o.fixtures === undefined) return null
  if (!definition.flow?.fixtures) throw Error('Unexpected flow fixture evidence')
  const facts = validateFixtureEvidence(o.fixtures, definition)
  if (facts.steps.some((step: any) => step.outcome !== 'skipped' && (step.startedAt < o.startedAt || step.completedAt > o.completedAt))) throw Error('Invalid flow fixture timing')
  return facts
}
function validateFlowObservation(o: any, definition: any, checks: Map<string, Check>) {
  const fixtures = validateFixtures(o, definition)
  if (o.outcome === 'runner_error') {
    if (o.flow !== undefined) throw Error('Invalid flow error evidence')
    if (fixtures?.cancelled && (checks.size !== 1 || !checks.has('runner'))) throw Error('Invalid cancelled flow evidence')
    return validateError(o, checks)
  }
  if (o.status !== undefined || o.bytes !== undefined || o.heartbeatReceivedAt !== undefined || checks.size !== 1 || !checks.has('flow') || !o.flow) throw Error('Invalid flow evidence')
  if (definition.flow.fixtures && (!fixtures || fixtures.cancelled)) throw Error('Flow fixture evidence required')
  const flow = validateFlowEvidence(o.flow, definition), passed = !flow.failure && flow.outcomes.every((x: any) => x.observed) && flow.trace.every((x: any) => x.outcome !== 'fail')
  if (o.outcome !== (passed ? 'pass' : 'target_failure') || checks.get('flow')!.pass !== passed) throw Error('Inconsistent flow outcome')
  if (!passed && (!flow.failure || FLOW_REASONS[flow.failure.reason as keyof typeof FLOW_REASONS].runner)) throw Error('Inconsistent flow outcome')
  const setupFailed = Boolean(fixtures?.steps.some((step: any) => step.phase === 'setup' && step.outcome !== 'pass'))
  if (setupFailed !== (flow.failure?.reason === 'setup_failed') || setupFailed && (flow.trace.length || fixtures!.steps.some((step: any) => step.outcome === 'runner_error' && step.phase === 'setup'))) throw Error('Inconsistent flow setup evidence')
}

// PERF-001: a page-speed observation either ended before the page loaded (one error check) or carries bounded facts whose
// budget checks and outcome the shared decision must reproduce exactly.
function validatePageSpeedObservation(o: any, definition: any) {
  if (o.status !== undefined || o.bytes !== undefined || o.heartbeatReceivedAt !== undefined) throw Error('Invalid page-speed evidence')
  if (o.pagespeed === undefined) return validateError(o, validateChecks(o.checks))
  validatePageSpeedEvidence(o.pagespeed, definition)
  const expected = pageSpeedChecks(definition, o.pagespeed)
  if (o.outcome !== (expected.every((c: Check) => c.pass) ? 'pass' : 'target_failure') || JSON.stringify(o.checks) !== JSON.stringify(expected)) throw Error('Inconsistent page-speed evidence')
}

// A protocol observation either ended before it had facts (one error check) or carries bounded facts whose checks and
// outcome the shared evaluation must reproduce exactly at the observation's completion time.
function validateProtocol(o: any, definition: any) {
  if (o.status !== undefined || o.bytes !== undefined || o.heartbeatReceivedAt !== undefined) throw Error('Invalid protocol evidence')
  if (o.protocol === undefined) return validateError(o, validateChecks(o.checks))
  validateFacts(definition, o.protocol)
  const expected = protocolChecks(definition, o.protocol, o.completedAt)
  if (o.outcome !== expected.outcome || JSON.stringify(o.checks) !== JSON.stringify(expected.checks)) throw Error('Inconsistent protocol evidence')
}

function validateHeartbeat(o: any, definition: any, checks: Map<string, Check>) {
  if(o.heartbeatJob!==undefined){
    const expected=heartbeatEvaluation(definition,o.heartbeatJob,o.completedAt);
    if(o.status!==undefined||o.bytes!==undefined||(o.heartbeatReceivedAt??null)!==o.heartbeatJob.receivedAt||o.outcome!==expected.outcome||JSON.stringify(o.checks)!==JSON.stringify(expected.checks))throw Error('Inconsistent heartbeat job evidence');
    return;
  }
  if (o.outcome === 'runner_error') return validateError(o, checks, true)
  if (o.status !== undefined || o.bytes !== undefined || checks.size !== 1 || !checks.has('heartbeat') ||
      (o.heartbeatReceivedAt !== undefined && !timestamp(o.heartbeatReceivedAt))) throw Error('Invalid heartbeat evidence')
  const fresh = timestamp(o.heartbeatReceivedAt) && o.heartbeatReceivedAt <= o.startedAt &&
    o.completedAt - o.heartbeatReceivedAt <= definition.heartbeat.maxAgeMs
  if (checks.get('heartbeat')!.pass !== fresh || o.outcome !== (fresh ? 'pass' : 'target_failure')) {
    throw Error('Inconsistent heartbeat evidence')
  }
  // Active completions additionally match the installation-local claim snapshot.
  // Portable history has no receipt authority and is restored paused/quarantined.
}

function validateHttp(o: any, definition: any, checks: Map<string, Check>, duration: { min: number; max: number } | null) {
  if (o.heartbeatReceivedAt !== undefined) throw Error('Unexpected heartbeat evidence')
  if(checks.has('dependency')){
    if(checks.size!==1||o.outcome!=='runner_error'||o.status!==undefined||o.bytes!==undefined||
      !validDependencyMissingCheck(definition,checks.get('dependency')))throw Error('Invalid dependency evidence');
    return;
  }
  // DEPENDENCY-002: a followed service's read carries the provider's claim, never an assertion bundle over the document.
  if(o.claim!==undefined)return validateClaimEvidence(o,definition);
  if(definition.catalog&&o.outcome!=='runner_error')throw Error('A followed service observation carries its provider claim');
  // Transport/runner errors have a category instead of a completed response's
  // assertion bundle, including the bounded metadata on historical rejections.
  if ([...checks.keys()].some(name => targetErrors.has(name) || runnerErrors.has(name)) ||
      (o.status === undefined && o.bytes === undefined)) return validateError(o, checks)
  if (!Number.isInteger(o.status) || o.status < 100 || o.status > 599 ||
      !Number.isInteger(o.bytes) || o.bytes < 0 || o.bytes > 65536) throw Error('Invalid observation transport evidence')
  const assertions = definition.assertions
  const expected: string[] = httpAssertionNames(assertions)
  if (checks.size !== expected.length || expected.some(name => !checks.has(name))) throw Error('Incomplete HTTP assertion evidence')
  const latencyConsistent = duration === null || assertions.latencyMs === undefined || (checks.get('latency')!.pass
    ? duration.min <= assertions.latencyMs
    : duration.max > assertions.latencyMs)
  if (checks.get('status')!.pass !== statusMatches(o.status, assertions.status) || !latencyConsistent) {
    throw Error('Inconsistent HTTP assertion evidence')
  }
  // Body/header/JSON content is deliberately not retained. Their signed booleans
  // still have to form the complete configured bundle with a matching outcome.
  const passing = [...checks.values()].every(check => check.pass)
  if (o.outcome !== (passing ? 'pass' : 'target_failure')) throw Error('Inconsistent HTTP outcome')
}

function validateTrust(o:any,definition:any){
  if(o.tlsTrust!==undefined){
    if(!['http','keyword'].includes(definition.type??'http'))throw Error('Unexpected TLS trust evidence');
    validateTlsTrustEvidence(o.tlsTrust,definition);
    if(o.status!==undefined&&o.tlsTrust.some((fact:any)=>fact.errors.length&&!fact.bypassed||definition.request&&!fact.credentialsAllowed))throw Error('Unverified TLS exchange cannot carry an HTTP response');
    const mismatch=o.tlsTrust.some((fact:any)=>fact.errors.includes('TLS_FINGERPRINT_MISMATCH'));
    if(mismatch&&(o.outcome!=='target_failure'||o.status!==undefined||o.checks?.length!==1||o.checks[0].assertion!=='tls'))throw Error('Certificate pin mismatch cannot pass');
  }
  if(definition.tlsTrust&&o.status!==undefined&&(!o.tlsTrust?.length||!o.tlsTrust.some((fact:any)=>fact.mode===definition.tlsTrust.mode)))throw Error('Configured TLS trust evidence required');
}

export function validateEvidence(o: any, definition: any, dueAt: number, now: number, mode: ValidationMode = 'live-completion') {
  if(o?.failureSnapshot!==undefined){
    const snapshot=normalizeFailureSnapshot(o.failureSnapshot),flow=definition.type==='flow';
    if(!['http','keyword','flow'].includes(definition.type??'http')||o.outcome==='pass')throw Error('Invalid failure snapshot evidence');
    if(!('unavailable' in snapshot)){
      const statusValid=flow?snapshot.status===null:o.status!==undefined?snapshot.status===o.status:snapshot.status===null||o.checks?.some((c:any)=>['timeout','connection','transport','encoding','body-limit'].includes(c.assertion));
      if(!statusValid||snapshot.durationMs!==o.durationMs||snapshot.diagnostics&&snapshot.diagnostics.category!==o.checks?.[0]?.assertion||!flow&&snapshot.artifacts)throw Error('Invalid failure snapshot evidence');
    }
  }
  const binding = o?.credentialBinding;
  if (binding !== undefined && (!validBindingDiagnostic(binding) || o.outcome !== 'runner_error' || o.checks?.length !== 1 || o.checks[0].assertion !== 'credential' || o.checks[0].reason !== bindingReason(binding) ||
      !(definition.request?.credentialRef === binding.reference || definition.flow?.steps.some((step: any) => step.kind === 'fill' && step.credentialRef === binding.reference)))) throw Error('Invalid credential binding diagnostic');
  if (!o || typeof o !== 'object' || Array.isArray(o) || Object.keys(o).some(key => !fields.has(key)) ||
      typeof o.id !== 'string' || !o.id || o.id.length > 100 || !definition.probes.includes(o.probe) ||
      !Number.isInteger(o.attempt) || o.attempt < 0 || o.attempt > definition.retries ||
      !['uptime-node/0.1.0','uptime-worker/0.1.0'].includes(o.runnerVersion) || !timestamp(o.startedAt) || !timestamp(o.completedAt) ||
      o.startedAt < dueAt || o.completedAt < o.startedAt || o.completedAt > now + COMPLETION_CLOCK_ALLOWANCE_MS ||
      !timestamp(o.durationMs) || !['pass', 'target_failure', 'runner_error'].includes(o.outcome) ||
      JSON.stringify(o).length > ((definition.type === 'flow' ? 4000 + FLOW_LIMITS.traceBytes + (o.fixtures ? 12000 : 0) : definition.type === 'pagespeed' ? 4000 + PAGESPEED_LIMITS.evidenceBytes : isProtocol(definition.type)||['api','mail'].includes(definition.type) ? 16000 : 4000) + (o.tlsTrust ? TLS_EVIDENCE_MAX_BYTES : 0) + (binding ? BINDING_DIAGNOSTIC_BYTES : 0) + (o.failureSnapshot ? FAILURE_SNAPSHOT_LIMITS.totalBytes : 0))) throw Error('Invalid observation evidence')
  validateTrust(o,definition);
  if(o.heartbeatJob!==undefined&&definition.type!=='heartbeat')throw Error('Unexpected heartbeat job evidence');
  if (o.protocol !== undefined && !isProtocol(definition.type)&&definition.type!=='mail') throw Error('Unexpected protocol evidence')
  if(definition.assignments?.[o.probe]?.canaryUrl&&o.canary===undefined)throw Error('Configured canary evidence required');
  if(o.canary!==undefined){
    if(!definition.assignments?.[o.probe]?.canaryUrl||o.canary?.canary!==undefined||o.canary?.failureSnapshot!==undefined)throw Error('Unexpected canary evidence');
    validateEvidence(o.canary,{...definition,type:'http',network:'public',url:definition.assignments[o.probe].canaryUrl,tlsTrust:undefined,assignments:undefined,request:undefined,catalog:undefined,retries:0,assertions:{status:200}},dueAt,now,mode);
    if(o.canary.probe!==o.probe||o.canary.attempt!==0)throw Error('Invalid canary identity');
  }
  const elapsed = o.completedAt - o.startedAt
  // Historical runners sampled completion and duration separately. Preserve a
  // single millisecond clock tick without relaxing any of the clock bounds.
  if (Math.abs(o.durationMs - elapsed) > 1) throw Error('Inconsistent observation timing')
  if(definition.type==='mail'){
    if(o.status!==undefined||o.bytes!==undefined||o.flow!==undefined||o.apiTransaction!==undefined)throw Error('Invalid mail observation');
    if(!o.protocol)return validateError(o,validateChecks(o.checks));
    if(!validateMailFacts(o.protocol,definition.mail))throw Error('Invalid mail facts');
    const expected=mailChecks(definition,o.protocol);
    if(o.outcome!==expected.outcome||JSON.stringify(o.checks)!==JSON.stringify(expected.checks))throw Error('Inconsistent mail evidence');
    for(const key of ['acceptedAt','receivedAt','cleanedAt']){const stamp=o.protocol.transaction?.[key];if(stamp!==undefined&&(stamp<o.startedAt||stamp>o.completedAt))throw Error('Invalid mail transaction timing')}
    return;
  }
  if(o.apiTransaction!==undefined&&definition.type!=='api')throw Error('Unexpected API transaction evidence');
  if(o.fixtures!==undefined&&definition.type!=='flow')throw Error('Unexpected flow fixture evidence');
  if(o.pagespeed!==undefined&&definition.type!=='pagespeed')throw Error('Unexpected page-speed evidence');
  if(definition.type==='pagespeed')return validatePageSpeedObservation(o,definition);
  if(definition.type==='api'){
    if(!o.apiTransaction)return validateError(o,validateChecks(o.checks));
    if(o.status!==undefined||o.bytes!==undefined||o.flow!==undefined)throw Error('Invalid API transaction observation');
    validateApiTransactionEvidence(o.apiTransaction,definition);
    if(o.apiTransaction.steps.some((step:any)=>step.startedAt<o.startedAt||step.completedAt>o.completedAt))throw Error('Invalid API transaction timing');
    if(o.outcome!==apiTransactionOutcome(o.apiTransaction)||JSON.stringify(o.checks)!==JSON.stringify(apiTransactionChecks(definition,o.apiTransaction)))throw Error('Inconsistent API transaction evidence');
    return;
  }
  if (isProtocol(definition.type)) return validateProtocol(o, definition)
  const checks = validateChecks(o.checks, binding !== undefined)
  if (definition.type === 'heartbeat') validateHeartbeat(o, definition, checks)
  else if (definition.type === 'flow') validateFlowObservation(o, definition, checks)
  else {
    const max = Math.max(o.durationMs, elapsed)
    // Pre-type/network runners sampled the latency assertion before both saved
    // clocks. Its unrecorded instant cannot be reconstructed from completion:
    // scheduler/GC delay or a wall-clock adjustment can change either truth.
    // Only inactive restore retains that signed boolean as historical evidence,
    // like body/header/JSON assertions; all other evidence checks still apply.
    const legacyLatency = mode === 'historical-restore' &&
      !Object.hasOwn(definition, 'type') && !Object.hasOwn(definition, 'network')
    // Typed history keeps only the documented one-tick sampling ambiguity.
    // Live completion always uses the larger measure, including legacy slots.
    const min = mode === 'historical-restore' ? Math.min(o.durationMs, elapsed) : max
    validateHttp(o, definition, checks, legacyLatency ? null : { min, max })
  }
}
