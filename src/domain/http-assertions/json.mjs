import {parse, query} from 'jsonpathly';

const legacyPath = /^(?:\$\.)?[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*$/;
const sensitive = /(?:password|secret|token|authorization|cookie|credential|api[-_]?key)/i;
const normalize = path => path.startsWith('$') ? path : path.startsWith('[') ? '$' + path : '$.' + path;

export function validateJsonPath(path) {
  if (typeof path !== 'string' || !path.length || path.length > 120) throw Error('Invalid JSONPath: use up to 120 characters');
  // Retain every previously accepted dot path, including numeric and hyphenated
  // object keys. New expressions use the standard parser, never a script engine.
  if (legacyPath.test(path)) return;
  let ast;
  try { ast = parse(normalize(path)); } catch { throw Error('Invalid JSONPath expression'); }
  const pending = [ast];
  while (pending.length) {
    const node = pending.pop();
    if (!node || typeof node !== 'object') continue;
    if ((node.type === 'functionCall' && !['count', 'length', 'value'].includes(node.name)) ||
        (node.type === 'comparator' && node.operator === 'reg') || node.subtype === 'regex') {
      throw Error('Invalid JSONPath: only count, length and value functions are supported; use bodyRegex for regular expressions');
    }
    pending.push(...Object.values(node));
  }
}

// A bounded response can still be revisited exponentially by descendant/union
// selectors. Charge every data access, including intermediate non-matches.
function boundedDocument(document) {
  let remaining = 250000;
  const seen = new WeakMap();
  const spend = (amount = 1) => { remaining -= amount; if (remaining < 0) throw Error('JSONPath work limit'); };
  function wrap(value) {
    if (value === null || typeof value !== 'object') return value;
    if (!seen.has(value)) seen.set(value, new Proxy(value, {
      get(target, key) { spend(); return wrap(Reflect.get(target, key)); },
      has(target, key) { spend(); return Object.hasOwn(target, key); },
      getOwnPropertyDescriptor(target, key) { spend(); return Reflect.getOwnPropertyDescriptor(target, key); },
      ownKeys(target) { const keys = Reflect.ownKeys(target); spend(keys.length + 1); return keys; },
    }));
    return seen.get(value);
  }
  return wrap(document);
}

// Only a bounded scalar diagnostic survives; neither a JSON subtree nor a parse
// error may reach signed evidence. Query-selected scalars are redacted because
// their sensitive keys may be reached through wildcards or encoded selectors.
function jsonEvidence(value, redact) {
  if (value === undefined) return 'missing';
  if (value === null) return 'null';
  if (typeof value === 'object') return Array.isArray(value) ? 'array' : 'object';
  if (redact) return '[redacted]';
  const text = typeof value === 'string' ? JSON.stringify(value.replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, ' ')) : String(value);
  return text.length > 50 ? text.slice(0, 49) + '…' : text;
}
// What a path selects in a parsed document: every selected value with the keys that reached it.
function selectValues(document, path) {
  if (legacyPath.test(path)) {
    const keys = path.replace(/^\$\./, '').split('.');
    let value = document;
    for (const key of keys) value = value !== null && typeof value === 'object' && Object.hasOwn(value, key) ? value[key] : undefined;
    return value === undefined ? [] : [{value, actualPath: keys}];
  }
  validateJsonPath(path);
  return query(boundedDocument(document), normalize(path), {returnArray: true}).map(value => ({value, actualPath: []}));
}
// A provider's claim is present when the path selects something; absence is missing evidence, never a failed claim.
export function jsonClaimPresent(path, body) {
  let document;
  try { document = JSON.parse(body); } catch { return false; }
  try { return selectValues(document, path).length > 0; } catch { return false; }
}
// The one shape a dependency monitor's component claim takes (DEPENDENCY-001): its status is read for one provider id and shown.
const componentClaim = /^components\[\?\(@\.id=="[^"\\]{1,100}"\)\]\.status$/;
export function jsonAssertion({path, equals}, body, credentialed) {
  let document, count = 0, mismatch, problem;
  // A provider's component status is public and chosen by id, so its value stays readable in the evidence unless credentials were sent.
  let redact = credentialed || sensitive.test(path);
  try { document = JSON.parse(body); } catch { problem = 'invalid JSON'; }
  const selected = (value, actualPath) => {
    count++;
    if (value !== equals && !mismatch) {
      mismatch = {value};
      redact ||= sensitive.test(actualPath.join('.'));
    }
  };
  if (!problem) {
    try {
      const values = selectValues(document, path);
      if (!legacyPath.test(path) && !componentClaim.test(path)) redact = true;
      for (const {value, actualPath} of values) selected(value, actualPath);
    } catch { problem = 'query evaluation limit or invalid expression'; }
  }
  const pass = !problem && count > 0 && !mismatch;
  const actual = problem || (count === 0 ? 'missing' : jsonEvidence(mismatch?.value, redact));
  const displayPath = path.replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, ' ');
  return {assertion: 'json', pass, reason: pass ? 'All selected JSON values match assertion' :
    `JSON assertion failed at ${displayPath}: actual ${actual}; expected ${jsonEvidence(equals, redact)}`};
}
