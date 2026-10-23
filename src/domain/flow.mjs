// FLOW-001: one isolated browser flow. A flow is a small, closed description of what a person does in a browser (go to a page,
// click, fill a field with a named runner-local credential, wait for or expect text, a URL or an element) and of the outcomes that
// must all be observed for a pass. It carries no script, no expression and no secret. Shared by the Worker (validation, revisions,
// evidence) and the runner (execution), so both read the same bounds.
import {privateTarget} from './private-target.mjs';
import {publicTarget} from './public-target.mjs';
import {flowProfile, profileLabel, validateProfileEvidence} from './flow-profile.mjs';
import {validateFlowFixtures} from './api-transaction.mjs';
import {validateFlowSource} from './flow-source.mjs';

export const FLOW_LIMITS = Object.freeze({
  minIntervalMs: 300000,       // a flow runs at most once every 5 minutes
  maxFlowsPerInstallation: 5,  // flow monitors in one installation
  wallMs: 60000,               // wall time of one run, browser start included
  minTimeoutMs: 10000,
  maxSteps: 20,
  maxOutcomes: 8,
  maxPages: 8,                 // top-level pages loaded in one run
  maxBytes: 5 * 1024 * 1024,   // response bytes through the proxy in one run
  traceBytes: 8192,            // the step trace stored with an observation
  intentChars: 300,
  valueChars: 200,
  selectorChars: 200,
});
export const FLOW_STEP_KINDS = Object.freeze(['goto', 'click', 'fill', 'waitFor', 'expect']);
export const FLOW_WHATS = Object.freeze(['text', 'url', 'element']);
export const FLOW_ROLES = Object.freeze(['button', 'link', 'textbox', 'checkbox', 'radio', 'combobox', 'heading', 'tab', 'menuitem', 'option']);
const TARGET_KEYS = ['css', 'text', 'label', 'role', 'name'];
const STEP_FIELDS = {goto: ['kind', 'url'], click: ['kind', 'target'], fill: ['kind', 'target', 'credentialRef'], waitFor: ['kind', 'what', 'value', 'match', 'target'], expect: ['kind', 'what', 'value', 'match', 'target']};
const OUTCOME_FIELDS = ['id', 'what', 'value', 'match', 'target'];
const REF = /^[a-zA-Z0-9_-]{1,80}$/, ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
// A CSS selector only: no chaining into another selector engine, no braces, backslashes or control characters.
const CSS = /^[\w\s#.\-[\]="'>+~:,*()/@^$|]{1,200}$/;

const fail = message => { throw Error(message); };
const text = (value, label, max = FLOW_LIMITS.valueChars) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x1f\x7f]/.test(value)) fail(`Invalid ${label}`);
  return value;
};
const only = (value, allowed, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`Invalid ${label}`);
  const unknown = Object.keys(value).filter(k => !allowed.includes(k));
  if (unknown.length) fail(`Invalid ${label}: unknown field${unknown.length > 1 ? 's' : ''} ${unknown.map(k => `“${k.slice(0, 60)}”`).join(', ')}`);
};

/** A locator the runner can build without evaluating anything: exactly one of css, text, label, or a role with its name. */
export function validateTarget(target, label) {
  only(target, TARGET_KEYS, label);
  const keys = Object.keys(target);
  if (target.role !== undefined) {
    if (keys.some(k => !['role', 'name'].includes(k)) || !FLOW_ROLES.includes(target.role)) fail(`Invalid ${label}: a role is one of ${FLOW_ROLES.join(', ')} with its name`);
    return {role: target.role, name: text(target.name, `${label} name`)};
  }
  if (keys.length !== 1) fail(`Invalid ${label}: give exactly one of css, text, label, or role with name`);
  const [key] = keys;
  if (key === 'css') {
    if (typeof target.css !== 'string' || !CSS.test(target.css) || target.css.includes('>>')) fail(`Invalid ${label}: css takes one plain CSS selector of up to ${FLOW_LIMITS.selectorChars} characters`);
    return {css: target.css};
  }
  if (key === 'name') fail(`Invalid ${label}: name belongs with role`);
  return {[key]: text(target[key], `${label} ${key}`)};
}

function expectation(item, label, startOrigin) {
  const what = item.what;
  if (!FLOW_WHATS.includes(what)) fail(`${label} needs what: one of ${FLOW_WHATS.join(', ')}`);
  if (what === 'element') {
    if (item.value !== undefined || item.match !== undefined) fail(`${label}: an element expectation takes a target, not a value`);
    return {what, target: validateTarget(item.target, `${label} target`)};
  }
  if (item.target !== undefined) fail(`${label}: only an element expectation takes a target`);
  if (what === 'url') {
    const value = text(item.value, `${label} URL path`);
    if (!value.startsWith('/') || value.includes('?') || value.includes('#')) fail(`${label}: a URL expectation is a path that starts with / and has no query or fragment`);
    if (item.match !== undefined && !['exact', 'prefix'].includes(item.match)) fail(`${label}: match is exact or prefix`);
    return {what, value, match: item.match ?? 'exact'};
  }
  if (item.match !== undefined) fail(`${label}: only a URL expectation takes match`);
  return {what, value: text(item.value, `${label} text`)};
}

/** Normalise a flow. Throws a plain reason for anything outside the closed vocabulary; the caller prefixes the entry's name. */
export function validateFlow(input, {network, startUrl, synthetic = u => u}) {
  // `origins` is derived from the steps on every save; a stored flow carries it, and it is recomputed, never trusted.
  only(input, ['intent', 'steps', 'outcomes', 'origins', 'browser', 'device', 'fixtures', 'source'], 'flow');
  const {browser, device} = flowProfile(input);
  const intent = text(input.intent, 'flow intent', FLOW_LIMITS.intentChars);
  if (!Array.isArray(input.steps) || !input.steps.length) fail('A flow needs at least one step');
  if (input.steps.length > FLOW_LIMITS.maxSteps) fail(`A flow has at most ${FLOW_LIMITS.maxSteps} steps (this one has ${input.steps.length})`);
  const origins = new Set([new URL(startUrl).origin]);
  const steps = input.steps.map((step, i) => {
    const label = `Step ${i + 1}`;
    if (!step || typeof step !== 'object' || Array.isArray(step)) fail(`${label} is not a step`);
    if (!FLOW_STEP_KINDS.includes(step.kind)) fail(`${label} has an unknown step kind “${String(step.kind).slice(0, 40)}”; a flow step is one of ${FLOW_STEP_KINDS.join(', ')}`);
    if (step.kind === 'fill' && 'value' in step) fail(`${label}: a fill step takes a credentialRef, never a value`);
    only(step, STEP_FIELDS[step.kind], label);
    if (step.kind === 'goto') {
      const url = network === 'synthetic' ? synthetic(step.url) : network==='private'?privateTarget(step.url).href:publicTarget(step.url).href;
      origins.add(new URL(url).origin);
      return {kind: 'goto', url};
    }
    if (step.kind === 'click') return {kind: 'click', target: validateTarget(step.target, `${label} target`)};
    if (step.kind === 'fill') {
      if (typeof step.credentialRef !== 'string' || !REF.test(step.credentialRef)) fail(`${label} needs credentialRef: the name of a runner-local credential`);
      return {kind: 'fill', target: validateTarget(step.target, `${label} target`), credentialRef: step.credentialRef};
    }
    return {kind: step.kind, ...expectation(step, label, startUrl)};
  });
  if (!Array.isArray(input.outcomes) || !input.outcomes.length) fail('A flow needs at least one required outcome');
  if (input.outcomes.length > FLOW_LIMITS.maxOutcomes) fail(`A flow has at most ${FLOW_LIMITS.maxOutcomes} required outcomes`);
  const ids = new Set();
  const outcomes = input.outcomes.map((outcome, i) => {
    const label = `Outcome ${i + 1}`;
    only(outcome, OUTCOME_FIELDS, label);
    if (typeof outcome.id !== 'string' || !ID.test(outcome.id)) fail(`${label} needs an id of lowercase letters, digits and dashes`);
    if (ids.has(outcome.id)) fail(`${label}: the id “${outcome.id}” is used twice`);
    ids.add(outcome.id);
    const {id, ...rest} = outcome;
    return {id, ...expectation(rest, label, startUrl)};
  });
  // API-004: setup and teardown fixtures run on the runner around the browser, through the API step engine and its controls.
  const fixtures = input.fixtures === undefined ? undefined : validateFlowFixtures(input.fixtures, {network, startUrl, synthetic});
  return {intent, browser, device, steps, outcomes, origins: [...origins].sort(), ...(fixtures ? {fixtures} : {}), ...(input.source ? {source:validateFlowSource(input.source)} : {})};
}

const keyOf = item => JSON.stringify(Object.fromEntries(Object.entries(item).filter(([k]) => k !== 'id' && k !== 'origins').sort(([a], [b]) => a < b ? -1 : 1)));
/** What a flow must observe to pass: each required outcome and each expect step, by content. Removing one weakens the flow. */
export function requirements(flow) {
  return [
    ...(flow?.source ? [{key:'strict-playwright-locators',label:'unique Playwright locators'}] : []),
    ...(flow ? [{key: `profile:${flowProfile(flow).browser}:${flowProfile(flow).device}`, label: `browser profile “${profileLabel(flow)}”`}] : []),
    ...(flow?.outcomes ?? []).map(o => ({key: `outcome:${o.id}:${keyOf(o)}`, label: `outcome “${o.id}”`})),
    ...(flow?.steps ?? []).filter(s => s.kind === 'expect').map(s => ({key: `expect:${keyOf(s)}`, label: `expectation ${describeExpectation(s)}`})),
  ];
}
export function describeExpectation(item) {
  if (item.what === 'text') return `text “${item.value}”`;
  if (item.what === 'url') return `URL ${item.match === 'prefix' ? 'starting with' : 'path'} ${item.value}`;
  const t = item.target ?? {};
  return `element ${t.css ?? t.text ?? t.label ?? `${t.role} “${t.name}”`}`;
}
/** How the set of required outcomes moved between two revisions of one flow. `shrank` means something the earlier revision required is gone. */
export function requirementChange(before, after) {
  const was = requirements(before), is = requirements(after), isKeys = new Set(is.map(r => r.key)), wasKeys = new Set(was.map(r => r.key));
  const removed = was.filter(r => !isKeys.has(r.key)).map(r => r.label), added = is.filter(r => !wasKeys.has(r.key)).map(r => r.label);
  return {change: removed.length ? 'shrank' : added.length ? 'grew' : 'same', removed, added, from: was.length, to: is.length};
}

const hex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
/** A digest of the flow exactly as stored in a revision; the runner echoes it so an observation names the definition it ran. */
export async function flowDigest(flow) {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(canonical(flow)))));
}

/** The URL of a page without its query string or fragment, uncut: whoever keeps it removes credentials first and only then cuts it
 * to 300 characters, so no value is ever cut into a part that no longer matches. */
export function plainUrl(value) {
  try { const u = new URL(value); return u.protocol === 'http:' || u.protocol === 'https:' ? `${u.origin}${u.pathname}` : ''; } catch { return ''; }
}

// Failure reasons a run can end in. `limit` names the bound that was exceeded; `runner` marks reasons that mean the runner
// could not run the flow at all (coverage Unknown), never that the flow failed.
export const FLOW_REASONS = Object.freeze({
  expectation_not_met: {runner: false}, element_missing: {runner: false}, outcome_missing: {runner: false}, http_status: {runner: false},
  wall_time_exceeded: {runner: false, limit: 'wallMs'}, steps_limit: {runner: false, limit: 'maxSteps'}, pages_limit: {runner: false, limit: 'maxPages'},
  bytes_limit: {runner: false, limit: 'maxBytes'}, trace_limit: {runner: false, limit: 'traceBytes'},
  blocked_request: {runner: false}, undeclared_origin: {runner: false}, extra_page: {runner: false}, navigation_failed: {runner: false}, navigation_timeout: {runner: false},
  credential_origin_mismatch: {runner: false}, setup_failed: {runner: false},
  browser_unavailable: {runner: true}, browser_failed: {runner: true}, credential_unavailable: {runner: true}, grant_unavailable: {runner: true},
});
export const FLOW_BLOCK_CLASSES = Object.freeze(['private_address', 'loopback_address', 'link_local_or_metadata_address', 'not_granted', 'unresolved_host', 'custody']);
export const FLOW_OUTCOMES = Object.freeze(['pass', 'fail', 'skipped']);

/** Validate the trace a runner reports, so an observation can only carry the fixed, sanitized shape. */
export function validateFlowEvidence(flow, definition) {
  const fields = ['digest', 'trace', 'outcomes', 'failure', 'finalUrl', 'pages', 'bytes', 'profile'];
  only(flow, fields, 'flow evidence');
  validateProfileEvidence(flow.profile, definition);
  if (typeof flow.digest !== 'string' || !/^[0-9a-f]{64}$/.test(flow.digest)) fail('Invalid flow evidence');
  if (!Array.isArray(flow.trace) || flow.trace.length > FLOW_LIMITS.maxSteps + FLOW_LIMITS.maxOutcomes) fail('Invalid flow trace');
  for (const entry of flow.trace) {
    only(entry, ['i', 'kind', 'outcome', 'ms', 'expect', 'matched', 'url', 'reason'], 'flow trace entry');
    if (!Number.isInteger(entry.i) || entry.i < 0 || !['goto', 'click', 'fill', 'waitFor', 'expect', 'outcome'].includes(entry.kind) || !FLOW_OUTCOMES.includes(entry.outcome) || !Number.isInteger(entry.ms) || entry.ms < 0 || entry.ms > 600000) fail('Invalid flow trace entry');
    if (entry.expect !== undefined && (typeof entry.expect !== 'string' || entry.expect.length > 300)) fail('Invalid flow trace entry');
    if (entry.matched !== undefined && typeof entry.matched !== 'boolean') fail('Invalid flow trace entry');
    if (entry.url !== undefined && (typeof entry.url !== 'string' || entry.url.length > 300 || /[?#]/.test(entry.url))) fail('A flow trace keeps no query string or fragment');
    if (entry.reason !== undefined && !Object.hasOwn(FLOW_REASONS, entry.reason)) fail('Invalid flow trace entry');
  }
  if (!Array.isArray(flow.outcomes) || flow.outcomes.length > FLOW_LIMITS.maxOutcomes || flow.outcomes.some(o => !o || typeof o.id !== 'string' || typeof o.observed !== 'boolean' || Object.keys(o).length !== 2)) fail('Invalid flow outcomes');
  if (flow.failure !== undefined) {
    only(flow.failure, ['step', 'reason', 'limit', 'blocked', 'status'], 'flow failure');
    if (!Object.hasOwn(FLOW_REASONS, flow.failure.reason) || (flow.failure.step !== undefined && !Number.isInteger(flow.failure.step))) fail('Invalid flow failure');
    if (flow.failure.limit !== undefined && flow.failure.limit !== FLOW_REASONS[flow.failure.reason].limit) fail('Invalid flow failure');
    if (flow.failure.blocked !== undefined && !FLOW_BLOCK_CLASSES.includes(flow.failure.blocked)) fail('Invalid flow failure');
    if (flow.failure.status !== undefined && !Number.isInteger(flow.failure.status)) fail('Invalid flow failure');
  }
  if (typeof flow.finalUrl !== 'string' || flow.finalUrl.length > 300 || /[?#]/.test(flow.finalUrl)) fail('A flow keeps no query string or fragment in its final URL');
  for (const key of ['pages', 'bytes']) if (!Number.isInteger(flow[key]) || flow[key] < 0) fail('Invalid flow evidence');
  if (JSON.stringify(flow).length > FLOW_LIMITS.traceBytes) fail(`A flow trace is limited to ${FLOW_LIMITS.traceBytes} bytes`);
  if (definition?.flow) {
    const ids = new Set(definition.flow.outcomes.map(o => o.id));
    if (flow.outcomes.length !== ids.size || flow.outcomes.some(o => !ids.has(o.id))) fail('Flow outcomes differ from the revision');
  }
  return flow;
}
