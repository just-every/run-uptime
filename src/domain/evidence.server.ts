// Signed completion and portable history share the same evidence contract.
// @ts-ignore Edition flow vocabulary is JavaScript shared with the runner.
import {FLOW_LIMITS,FLOW_REASONS,validateFlowEvidence} from './flow.mjs'
// @ts-ignore Bounded non-secret diagnostics are shared with the runner.
import {validBindingDiagnostic, bindingReason, BINDING_DIAGNOSTIC_BYTES} from './credential-binding.mjs'
const fields = new Set(['id', 'probe', 'outcome', 'completedAt', 'startedAt', 'durationMs', 'runnerVersion', 'status', 'bytes', 'checks', 'attempt', 'heartbeatReceivedAt', 'canary', 'flow', 'credentialBinding'])
const targetErrors = new Set(['encoding', 'redirect', 'body-limit', 'transport', 'timeout', 'connection'])
const runnerErrors = new Set(['custody', 'runner', 'network', 'dns', 'browser', 'credential', 'grant'])
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
function validateFlowObservation(o: any, definition: any, checks: Map<string, Check>) {
  if (o.outcome === 'runner_error') {
    if (o.flow !== undefined) throw Error('Invalid flow error evidence')
    return validateError(o, checks)
  }
  if (o.status !== undefined || o.bytes !== undefined || o.heartbeatReceivedAt !== undefined || checks.size !== 1 || !checks.has('flow') || !o.flow) throw Error('Invalid flow evidence')
  const flow = validateFlowEvidence(o.flow, definition), passed = !flow.failure && flow.outcomes.every((x: any) => x.observed) && flow.trace.every((x: any) => x.outcome !== 'fail')
  if (o.outcome !== (passed ? 'pass' : 'target_failure') || checks.get('flow')!.pass !== passed) throw Error('Inconsistent flow outcome')
  if (!passed && (!flow.failure || FLOW_REASONS[flow.failure.reason as keyof typeof FLOW_REASONS].runner)) throw Error('Inconsistent flow outcome')
}

function validateHeartbeat(o: any, definition: any, checks: Map<string, Check>) {
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
  // Transport/runner errors have a category instead of a completed response's
  // assertion bundle, including the bounded metadata on historical rejections.
  if ([...checks.keys()].some(name => targetErrors.has(name) || runnerErrors.has(name)) ||
      (o.status === undefined && o.bytes === undefined)) return validateError(o, checks)
  if (!Number.isInteger(o.status) || o.status < 100 || o.status > 599 ||
      !Number.isInteger(o.bytes) || o.bytes < 0 || o.bytes > 65536) throw Error('Invalid observation transport evidence')
  const assertions = definition.assertions
  const expected = ['status', ...(assertions.bodyIncludes !== undefined ? ['body'] : []),
    ...(assertions.header ? ['header'] : []), ...(assertions.json ? ['json'] : []),
    ...(assertions.latencyMs !== undefined ? ['latency'] : [])]
  if (checks.size !== expected.length || expected.some(name => !checks.has(name))) throw Error('Incomplete HTTP assertion evidence')
  const latencyConsistent = duration === null || assertions.latencyMs === undefined || (checks.get('latency')!.pass
    ? duration.min <= assertions.latencyMs
    : duration.max > assertions.latencyMs)
  if (checks.get('status')!.pass !== (o.status === assertions.status) || !latencyConsistent) {
    throw Error('Inconsistent HTTP assertion evidence')
  }
  // Body/header/JSON content is deliberately not retained. Their signed booleans
  // still have to form the complete configured bundle with a matching outcome.
  const passing = [...checks.values()].every(check => check.pass)
  if (o.outcome !== (passing ? 'pass' : 'target_failure')) throw Error('Inconsistent HTTP outcome')
}

export function validateEvidence(o: any, definition: any, dueAt: number, now: number, mode: ValidationMode = 'live-completion') {
  const binding = o?.credentialBinding;
  if (binding !== undefined && (!validBindingDiagnostic(binding) || o.outcome !== 'runner_error' || o.checks?.length !== 1 || o.checks[0].assertion !== 'credential' || o.checks[0].reason !== bindingReason(binding) ||
      !(definition.request?.credentialRef === binding.reference || definition.flow?.steps.some((step: any) => step.kind === 'fill' && step.credentialRef === binding.reference)))) throw Error('Invalid credential binding diagnostic');
  if (!o || typeof o !== 'object' || Array.isArray(o) || Object.keys(o).some(key => !fields.has(key)) ||
      typeof o.id !== 'string' || !o.id || o.id.length > 100 || !definition.probes.includes(o.probe) ||
      !Number.isInteger(o.attempt) || o.attempt < 0 || o.attempt > definition.retries ||
      !['uptime-node/0.1.0','uptime-worker/0.1.0'].includes(o.runnerVersion) || !timestamp(o.startedAt) || !timestamp(o.completedAt) ||
      o.startedAt < dueAt || o.completedAt < o.startedAt || o.completedAt > now + COMPLETION_CLOCK_ALLOWANCE_MS ||
      !timestamp(o.durationMs) || !['pass', 'target_failure', 'runner_error'].includes(o.outcome) ||
      JSON.stringify(o).length > ((definition.type === 'flow' ? 4000 + FLOW_LIMITS.traceBytes : 4000) + (binding ? BINDING_DIAGNOSTIC_BYTES : 0))) throw Error('Invalid observation evidence')
  if(definition.assignments?.[o.probe]?.canaryUrl&&o.canary===undefined)throw Error('Configured canary evidence required');
  if(o.canary!==undefined){
    if(!definition.assignments?.[o.probe]?.canaryUrl||o.canary?.canary!==undefined)throw Error('Unexpected canary evidence');
    validateEvidence(o.canary,{...definition,type:'http',network:'public',assignments:undefined,request:undefined,retries:0,assertions:{status:200}},dueAt,now,mode);
    if(o.canary.probe!==o.probe||o.canary.attempt!==0)throw Error('Invalid canary identity');
  }
  const elapsed = o.completedAt - o.startedAt
  // Historical runners sampled completion and duration separately. Preserve a
  // single millisecond clock tick without relaxing any of the clock bounds.
  if (Math.abs(o.durationMs - elapsed) > 1) throw Error('Inconsistent observation timing')
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
