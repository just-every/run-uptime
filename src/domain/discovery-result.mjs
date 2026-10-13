// The one shape a runner may post for a discovery job, shared by the Worker and the runner so both refuse the same
// things. It holds derived facts only: no response body, no header, no credential. Every proposed definition is a NEW
// public-network monitor definition that must pass validateDefinition; the console assigns runners when it saves one.
import {validateDefinition} from './policy.mjs';
import {publicTarget} from './public-target.mjs';
export const DISCOVERY_LIMITS = Object.freeze({hosts:10,notes:10,noteLength:200,proposals:12,keyLength:80,nameLength:100,reasonLength:200,checks:6,checkLength:120,requests:1000,durationMs:600000});
export const PROPOSAL_KINDS = Object.freeze(['page','status-page','api','health','spec','subdomain']);
const RESULT_KEYS = ['input','finalUrl','requests','durationMs','hosts','notes','proposals'];
const PROPOSAL_KEYS = ['key','kind','selected','name','reason','checks','definition'];
const fail = where => { throw Error(`Invalid discovery result: ${where}`); };
const plain = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, keys, where) => {
  if (!plain(value)) fail(`${where} must be an object`);
  const unknown = Object.keys(value).filter(k => !keys.includes(k));
  if (unknown.length) fail(`${where} has unknown field${unknown.length > 1 ? 's' : ''} ${unknown.map(k => `“${k.slice(0, 40)}”`).join(', ')}`);
  const missing = keys.filter(k => value[k] === undefined);
  if (missing.length) fail(`${where} is missing ${missing.join(', ')}`);
};
const text = (value, max, where, {pattern} = {}) => {
  if (typeof value !== 'string' || !value.length || value.length > max || /[\x00-\x1f\x7f]/.test(value) || (pattern && !pattern.test(value))) fail(`${where} must be non-empty text of at most ${max} characters`);
  return value;
};
const integer = (value, max, where) => { if (!Number.isInteger(value) || value < 0 || value > max) fail(`${where} must be an integer from 0 to ${max}`); return value; };
const list = (value, max, where) => { if (!Array.isArray(value) || value.length > max) fail(`${where} must be a list of at most ${max}`); return value; };
// A discovered monitor is an http or keyword check of a public URL. It names no runner and carries no secret reference.
function definition(value, where) {
  if (!plain(value)) fail(`${where} must be an object`);
  if (value.assignments !== undefined) fail(`${where} must not carry assignments`);
  if (value.network !== undefined && value.network !== 'public') fail(`${where} must be a public network monitor`);
  let normal;
  try { normal = validateDefinition(value, []); } catch (error) { fail(`${where} is refused: ${String(error.message).slice(0, 120)}`); }
  if (normal.network !== 'public' || !['http', 'keyword'].includes(normal.type)) fail(`${where} must be a public http or keyword monitor`);
  // validateDefinition drops fields it does not know; a hostile result must not smuggle them past the boundary.
  const dropped = Object.keys(value).filter(k => !(k in normal));
  if (dropped.length) fail(`${where} has unknown field${dropped.length > 1 ? 's' : ''} ${dropped.map(k => `“${k.slice(0, 40)}”`).join(', ')}`);
  return normal;
}
export function validateDiscoveryResult(value) {
  const L = DISCOVERY_LIMITS;
  exactKeys(value, RESULT_KEYS, 'result');
  text(value.input, 2048, 'input');
  try { publicTarget(value.finalUrl); } catch { fail('finalUrl must be a public http(s) URL'); }
  const keys = new Set();
  const proposals = list(value.proposals, L.proposals, 'proposals').map((p, i) => {
    const where = `proposals[${i}]`;
    exactKeys(p, PROPOSAL_KEYS, where);
    text(p.key, L.keyLength, `${where}.key`, {pattern: /^[a-z0-9-]+$/});
    if (keys.has(p.key)) fail(`${where}.key repeats an earlier proposal`);
    keys.add(p.key);
    if (!PROPOSAL_KINDS.includes(p.kind)) fail(`${where}.kind is not a known kind`);
    if (typeof p.selected !== 'boolean') fail(`${where}.selected must be true or false`);
    return {key: p.key, kind: p.kind, selected: p.selected, name: text(p.name, L.nameLength, `${where}.name`), reason: text(p.reason, L.reasonLength, `${where}.reason`),
      checks: list(p.checks, L.checks, `${where}.checks`).map((c, j) => text(c, L.checkLength, `${where}.checks[${j}]`)), definition: definition(p.definition, `${where}.definition`)};
  });
  return {input: value.input, finalUrl: value.finalUrl, requests: integer(value.requests, L.requests, 'requests'), durationMs: integer(value.durationMs, L.durationMs, 'durationMs'),
    hosts: list(value.hosts, L.hosts, 'hosts').map((h, i) => text(h, 253, `hosts[${i}]`, {pattern: /^[^\s<>"'`\\]+$/})),
    notes: list(value.notes, L.notes, 'notes').map((n, i) => text(n, L.noteLength, `notes[${i}]`)), proposals};
}
