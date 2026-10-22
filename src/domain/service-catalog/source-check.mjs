// DEPENDENCY-002: the live check that runs before a catalog entry is followed. The owner's runner (or, in a hosted demo,
// the Worker) reads each source address the catalog names with one read-only GET and reports derived facts only: whether
// the source answered, whether it still has the shape the catalog expects, what it states now, and, for a Statuspage
// component, the provider's own id for it. No body, header or address other than the catalog's own leaves the reader.
import {jsonClaimPresent} from '../http-assertions/json.mjs';
import {compileBodyRegex} from '../http-assertions/regex.mjs';
import {CATALOG_VERSION, SOURCE_READ_LIMIT, catalogEntry, claimFor, feedShape, targetUrl, targetsFor} from './index.mjs';
export const CHECK_PROBLEMS = ['unreachable', 'moved', 'shape', 'too-large', 'component-missing'];
export const CATALOG_USER_AGENT = 'UptimeCatalogCheck/0.1 (+https://github.com/just-every/run-uptime; one read-only GET per catalog status source)';
const ACCEPT = 'application/json, application/rss+xml, application/atom+xml, text/xml;q=0.9, */*;q=0.1';
const label = value => String(value).replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
const short = (value, max = 60) => label(value).slice(0, max);
const fail = (problem, detail) => ({problem, detail: detail.slice(0, 200)});
const readableCategory = {timeout: 'did not answer in time', connection: 'refused the connection', unresolved: 'has no DNS address', dns: 'could not be looked up', network: 'resolves to a private address', redirect: 'redirected in a way that cannot be followed', encoding: 'compressed its answer', transport: 'broke the connection'};
// The owner's selection as a job spec: only the catalog entry and which of its parts, never an address.
export function catalogSpec(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['entry', 'scope', 'components'].includes(key))) throw Error('Invalid catalog check');
  const entry = catalogEntry(input.entry);
  if (!entry) throw Error('That provider is not in the catalog.');
  const spec = {entry: entry.id, scope: input.scope, ...(input.components !== undefined ? {components: input.components} : {})};
  targetsFor(entry, spec);
  return spec;
}
async function read(transport, url, signal) {
  try {
    const response = await transport(url, {signal, accept: ACCEPT, userAgent: CATALOG_USER_AGENT, maxBody: SOURCE_READ_LIMIT + 1, maxHops: 0, followRedirect: () => false});
    if (response.redirect || [301, 302, 303, 307, 308].includes(response.status)) return fail('moved', `The source answered ${response.status} and now points elsewhere.`);
    if (response.truncated || response.bytes > SOURCE_READ_LIMIT) return fail('too-large', `The source is larger than the ${SOURCE_READ_LIMIT / 1024} KiB a check can read.`);
    if (response.status !== 200) return fail('unreachable', `The source answered ${response.status}.`);
    return {body: response.body};
  } catch (error) {
    if (signal?.aborted) throw error;
    return fail('unreachable', `The source ${readableCategory[error?.category] ?? 'did not answer'}.`);
  }
}
const shapeProblem = what => fail('shape', `The source answered, but no longer looks like ${what}.`);
// One target, read from the document its address returned.
function understand(entry, target, body) {
  const kind = entry.source.kind;
  if (kind === 'statuspage') {
    let document;
    try { document = JSON.parse(body); } catch { return shapeProblem('a Statuspage JSON document'); }
    if (target.scope === 'whole') {
      if (typeof document?.status?.indicator !== 'string' || !document.page || typeof document.page !== 'object') return shapeProblem('a Statuspage status document');
      return {scope: 'whole', key: null, name: null, id: null, state: document.status.indicator === 'none' ? 'operational' : 'issue', stated: short(document.status.description ?? document.status.indicator)};
    }
    const matches = Array.isArray(document?.components) ? document.components.filter(item => label(item?.name) === target.component.name) : null;
    if (matches === null) return shapeProblem('a Statuspage component list');
    if (matches.length !== 1 || typeof matches[0].id !== 'string' || !matches[0].id.length || /[\x00-\x1f\x7f]/.test(matches[0].id) || typeof matches[0].status !== 'string')
      return fail('component-missing', `The source no longer lists exactly one component named “${target.component.name}”.`);
    const id = matches[0].id, path = claimFor(entry, target, {id, name: target.component.name}).json.path;
    if (path.length > 120) return shapeProblem('a Statuspage component list');
    return {scope: 'component', key: target.component.key, name: target.component.name, id, state: matches[0].status === 'operational' ? 'operational' : 'issue', stated: short(matches[0].status)};
  }
  if (kind === 'json') {
    const claim = claimFor(entry, target).json;
    if (!jsonClaimPresent(claim.path, body)) return shapeProblem('the provider’s status document');
    const value = JSON.parse(body), parts = claim.path.split('.'), found = parts.reduce((current, part) => current?.[part], value);
    return {scope: target.scope, key: target.component?.key ?? null, name: target.component?.name ?? null, id: null, state: found === claim.equals ? 'operational' : 'issue', stated: short(found)};
  }
  const regex = claimFor(entry, target).bodyRegex, signal = target.scope === 'component' ? 'rss-newest-item' : entry.source.signal, shape = feedShape(signal);
  if (!shape.every(token => body.includes(token.replace('>', '')))) return shapeProblem('an RSS or Atom feed');
  const operational = compileBodyRegex(regex).matcher(body).find();
  return {scope: target.scope, key: target.component?.key ?? null, name: target.component?.name ?? null, id: null, state: operational ? 'operational' : 'issue', stated: operational ? 'no current impact listed' : 'the newest feed entry reports an impact'};
}
export async function checkCatalogSource(spec, {transport, signal, now = Date.now}) {
  const started = now(), entry = catalogEntry(spec.entry), targets = targetsFor(entry, spec), documents = new Map(), found = [];
  let requests = 0;
  const done = (extra = {}) => ({entry: entry.id, catalogVersion: CATALOG_VERSION, checkedAt: now(), ok: false, problem: null, detail: null, requests, durationMs: now() - started, targets: [], ...extra});
  for (const target of targets) {
    const url = targetUrl(entry, target);
    if (!documents.has(url)) {requests++; documents.set(url, await read(transport, url, signal))}
    const document = documents.get(url);
    if (document.problem) return done(document);
    const outcome = understand(entry, target, document.body);
    if (outcome.problem) return done(outcome);
    found.push(outcome);
  }
  return done({ok: true, targets: found});
}
const KEYS = ['entry', 'catalogVersion', 'checkedAt', 'ok', 'problem', 'detail', 'requests', 'durationMs', 'targets'], TARGET_KEYS = ['scope', 'key', 'name', 'id', 'state', 'stated'];
const plain = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = (value, max) => value === null || typeof value === 'string' && value.length <= max && !/[\x00-\x1f\x7f]/.test(value);
// What the Worker accepts back from a runner for a catalog check.
export function validateCatalogCheck(value, spec) {
  const bad = where => { throw Error(`Invalid catalog check result: ${where}`); };
  if (!plain(value) || Object.keys(value).sort().join() !== KEYS.slice().sort().join()) bad('fields');
  if (value.entry !== spec.entry || value.catalogVersion !== CATALOG_VERSION) bad('entry or catalog version');
  if (!Number.isSafeInteger(value.checkedAt) || !Number.isInteger(value.requests) || value.requests < 0 || value.requests > 13 || !Number.isInteger(value.durationMs) || value.durationMs < 0) bad('counts');
  if (typeof value.ok !== 'boolean' || !(value.problem === null || CHECK_PROBLEMS.includes(value.problem)) || (value.problem === null) !== value.ok || !text(value.detail, 200) || (value.ok ? value.detail !== null : !value.detail)) bad('outcome');
  const entry = catalogEntry(spec.entry), wanted = targetsFor(entry, spec);
  if (!Array.isArray(value.targets) || value.targets.length !== (value.ok ? wanted.length : 0)) bad('targets');
  for (const [index, target] of value.targets.entries()) {
    if (!plain(target) || Object.keys(target).sort().join() !== TARGET_KEYS.slice().sort().join() || !['whole', 'component'].includes(target.scope) || !['operational', 'issue'].includes(target.state)) bad('target');
    if (!text(target.key, 80) || !text(target.name, 100) || !text(target.id, 100) || !text(target.stated, 60)) bad('target text');
    const expected = wanted[index];
    if (target.scope !== expected.scope || (expected.component ? target.key !== expected.component.key : target.key !== null)) bad('target identity');
    if (entry.source.kind === 'statuspage' && expected.component && !target.id) bad('component id');
  }
  return value;
}
