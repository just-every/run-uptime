// DEPENDENCY-002: the live check that runs before a catalog entry is followed. The owner's runner (or, in a hosted demo,
// the Worker) reads each source address the catalog names with the catalog's status-source reader (reader/read.mjs) and
// reports derived facts only: whether the source answered, whether it still has the shape the catalog expects, what it states
// now, and the provider's own id for a component or product. No body, header or address other than the catalog's own leaves it.
import {CATALOG_VERSION, catalogEntry, needsProviderId, targetsFor} from './index.mjs';
import {readParts} from './parts.mjs';
import {CHECK_PROBLEMS, statusSourceReader} from './reader/read.mjs';
export {CHECK_PROBLEMS};
// The owner's selection as a job spec: only the catalog entry and which of its parts, never an address.
export function catalogSpec(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['entry', 'scope', 'components'].includes(key))) throw Error('Invalid catalog check');
  const entry = catalogEntry(input.entry);
  if (!entry) throw Error('That provider is not in the catalog.');
  const spec = {entry: entry.id, scope: input.scope, ...(input.components !== undefined ? {components: input.components} : {})};
  targetsFor(entry, spec);
  return spec;
}
export async function checkCatalogSource(spec, {transport, signal, now = Date.now}) {
  const started = now(), entry = catalogEntry(spec.entry), targets = targetsFor(entry, spec), reader = statusSourceReader({transport, signal});
  let requests = 0;
  const outcome = await readParts(entry, targets, (...document) => { requests++; return reader(...document); });
  const done = extra => ({entry: entry.id, catalogVersion: CATALOG_VERSION, checkedAt: now(), ok: false, problem: null, detail: null, requests, durationMs: now() - started, targets: [], ...extra});
  return outcome.problem ? done({problem: outcome.problem, detail: outcome.detail}) : done({ok: true, targets: outcome.targets});
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
    if (needsProviderId(entry, expected) && !target.id) bad('component id');
  }
  return value;
}
