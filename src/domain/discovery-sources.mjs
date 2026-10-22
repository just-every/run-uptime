// DISCOVERY-001: the kinds of source an owner authorizes, what the Worker may keep about one, and the one shape a runner may
// post for an owner-started run. The Worker keeps identifiers only (a domain, a zone id, a repository, an address and the name
// of a runner-local credential file); provider credentials never leave the runner. Shared by the Worker and the runner so both
// refuse the same things.
import {validateDefinition} from './policy.mjs';
import {publicTarget, isLoopbackHostname} from './public-target.mjs';
// For each kind: what it reads, the identifiers it takes, whether it reads deployment events (since the last run), and for a
// provider account the documented read-only access its runner-local credential needs.
export const SOURCE_KINDS = Object.freeze({
  domain: {label: 'Domain (DNS lookups)', deploy: false, provider: null, fields: ['domain'], access: 'Public DNS lookups of the domain and its usual host names; no account.'},
  'website-files': {label: 'Robots and sitemap', deploy: false, provider: null, fields: ['origin'], access: 'Public robots.txt and sitemap files; no account.'},
  openapi: {label: 'OpenAPI specification', deploy: false, provider: null, fields: ['url'], access: 'A published OpenAPI or Swagger document; no account.'},
  route53: {label: 'Amazon Route 53 zone', deploy: false, provider: 'route53', fields: ['zoneId', 'domain', 'credentialRef'], access: 'An IAM key allowed only route53:GetHostedZone and route53:ListResourceRecordSets.'},
  cloudflare: {label: 'Cloudflare zone', deploy: false, provider: 'cloudflare', fields: ['zoneId', 'domain', 'credentialRef'], access: 'An API token with Zone Read and DNS Read for this zone only.'},
  'github-actions': {label: 'GitHub Actions deployments', deploy: true, provider: 'github', fields: ['owner', 'repo', 'credentialRef'], access: 'A fine-grained token for this repository with Deployments and Actions read-only.'},
  vercel: {label: 'Vercel deployments', deploy: true, provider: 'vercel', fields: ['projectId', 'credentialRef'], access: 'An access token scoped to the project’s team. Vercel tokens cannot be limited to reading, so the runner makes only the listed read requests.'},
  netlify: {label: 'Netlify deploys', deploy: true, provider: 'netlify', fields: ['siteId', 'credentialRef'], access: 'A personal access token. Netlify tokens cannot be limited to reading, so the runner makes only the listed read requests.'},
  codedeploy: {label: 'AWS CodeDeploy deployments', deploy: true, provider: 'codedeploy', fields: ['application', 'deploymentGroup', 'region', 'siteUrl', 'credentialRef'], access: 'An IAM key allowed only codedeploy:ListDeployments and codedeploy:BatchGetDeployments.'},
});
// The identifiers a provider credential file must name, so one file is used only for the zone, repository, project or site it was made for.
export const CREDENTIAL_BINDING = Object.freeze({route53: ['zoneId'], cloudflare: ['zoneId'], github: ['owner', 'repo'], vercel: ['projectId'], netlify: ['siteId'], codedeploy: ['application', 'region']});
export const SOURCE_LIMITS = Object.freeze({sources: 12, candidates: 40, notes: 10, requests: 200, known: 40, hosts: 10});
export const PRIVATE_ADDRESS_MESSAGE = 'That is a private, loopback or link-local address, so it was not contacted. Use a private-network monitor to check it.';
const fail = message => { throw Error(message); };
const plain = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const pattern = (value, expression, label) => { if (typeof value !== 'string' || !expression.test(value)) fail(`Invalid ${label}`); return value; };
const HOST = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const REF = /^[a-zA-Z0-9_-]{1,80}$/;
export function publicAddress(value, label) {
  let url;
  try {
    url = publicTarget(typeof value === 'string' ? value : '');
    if (isLoopbackHostname(url.hostname)) throw Error('Public target address forbidden');
  } catch (error) {
    if (/forbidden/.test(error.message)) fail(PRIVATE_ADDRESS_MESSAGE);
    fail(`Invalid ${label}: use a full http or https address such as https://example.com`);
  }
  return url;
}
// What the owner may authorize. Only the listed identifiers exist, each strictly shaped; a credential reference names a file on the runner.
export function validateSourceInput(input) {
  if (!plain(input) || Object.keys(input).some(key => !['kind', 'label', 'identifiers'].includes(key))) fail('Invalid discovery source');
  const spec = Object.hasOwn(SOURCE_KINDS, input.kind) ? SOURCE_KINDS[input.kind] : null;
  if (!spec) fail('Choose a source kind: ' + Object.keys(SOURCE_KINDS).join(', '));
  if (typeof input.label !== 'string' || !input.label.trim() || input.label.length > 100 || /[\x00-\x1f\x7f]/.test(input.label)) fail('A source label is 1 to 100 characters');
  const given = input.identifiers;
  if (!plain(given) || Object.keys(given).some(key => !spec.fields.includes(key))) fail(`A ${spec.label} source takes only ${spec.fields.join(', ')}`);
  const identifiers = {};
  for (const field of spec.fields) {
    const value = given[field];
    if (value === undefined || value === '') fail(`A ${spec.label} source needs ${field}`);
    if (field === 'domain') identifiers.domain = pattern(String(value).trim().toLowerCase(), HOST, 'domain');
    else if (field === 'origin') identifiers.origin = publicAddress(value, 'address').origin;
    else if (field === 'url') identifiers.url = publicAddress(value, 'specification address').href;
    else if (field === 'siteUrl') identifiers.siteUrl = publicAddress(value, 'site address').origin + '/';
    else if (field === 'zoneId') identifiers.zoneId = pattern(value, input.kind === 'route53' ? /^Z[A-Z0-9]{1,40}$/ : /^[a-f0-9]{32}$/, 'zone id');
    else if (field === 'owner' || field === 'repo') identifiers[field] = pattern(value, /^[A-Za-z0-9._-]{1,100}$/, field);
    else if (field === 'projectId') identifiers.projectId = pattern(value, /^[A-Za-z0-9_-]{1,100}$/, 'project id');
    else if (field === 'siteId') identifiers.siteId = pattern(value, /^[A-Za-z0-9-]{1,100}$/, 'site id');
    else if (field === 'application' || field === 'deploymentGroup') identifiers[field] = pattern(value, /^[A-Za-z0-9._+=,@-]{1,100}$/, field === 'application' ? 'application name' : 'deployment group');
    else if (field === 'region') identifiers.region = pattern(value, /^[a-z]{2}(-[a-z]+)+-[0-9]$/, 'region');
    else if (field === 'credentialRef') identifiers.credentialRef = pattern(value, REF, 'credential reference');
  }
  if (input.kind === 'domain') publicAddress(`https://${identifiers.domain}/`, 'domain');
  return {kind: input.kind, label: input.label.trim(), identifiers};
}
export const isDeploy = kind => SOURCE_KINDS[kind]?.deploy === true;
// The job the owner's runner receives: identifiers, when the previous run started and the addresses it found. Never a credential.
export function runSpec(source, previous) {
  return {source: source.id, kind: source.kind, identifiers: source.identifiers, since: previous?.started_at ?? null, known: previous ? previousUrls(previous) : []};
}
const previousUrls = previous => [...new Set(JSON.parse(previous.result).candidates.filter(candidate => candidate.proposal && ['page', 'api', 'host'].includes(candidate.kind)).map(candidate => candidate.url))].slice(0, SOURCE_LIMITS.known);
export function validateRunSpec(value) {
  if (!plain(value) || Object.keys(value).sort().join() !== 'identifiers,kind,known,since,source') fail('Invalid source run');
  const checked = validateSourceInput({kind: value.kind, label: 'run', identifiers: value.identifiers});
  if (typeof value.source !== 'string' || !/^[0-9a-f-]{36}$/.test(value.source) || !(value.since === null || Number.isSafeInteger(value.since)) || !Array.isArray(value.known) || value.known.length > SOURCE_LIMITS.known) fail('Invalid source run');
  return {...value, identifiers: checked.identifiers, known: value.known.map(url => publicAddress(url, 'known address').href)};
}
const KEYS = ['source', 'startedAt', 'requests', 'durationMs', 'notes', 'candidates', 'gone'];
const CANDIDATE_KEYS = ['key', 'url', 'kind', 'identifier', 'seenAt', 'reason', 'proposal'];
const PROPOSAL_KEYS = ['name', 'reason', 'checks', 'definition'];
// What each candidate kind proposes: an HTTP page or host, an API route, a published specification, a protocol check (certificate
// or DNS record) or a browser check of a page.
export const CANDIDATE_KINDS = Object.freeze({page: ['http', 'keyword'], api: ['http', 'keyword'], spec: ['http', 'keyword'], host: ['http', 'keyword'], tls: ['tls'], dns: ['dns'], browser: ['flow']});
const text = (value, max, where) => { if (typeof value !== 'string' || !value.length || value.length > max || /[\x00-\x1f\x7f]/.test(value)) fail(`${where} must be non-empty text of at most ${max} characters`); return value; };
const exact = (value, keys, where) => { if (!plain(value) || Object.keys(value).sort().join() !== keys.slice().sort().join()) fail(`${where} has the wrong fields`); };
// What the Worker accepts from the runner for an owner-started run: derived facts only, every proposed definition a new public
// monitor that passes the editor's own validation and names no runner.
export function validateSourceRun(value, spec) {
  const bad = where => { throw Error(`Invalid source run result: ${where}`); };
  try {
    exact(value, KEYS, 'result');
    if (value.source !== spec.source) bad('source');
    if (!Number.isSafeInteger(value.startedAt) || !Number.isInteger(value.requests) || value.requests < 0 || value.requests > SOURCE_LIMITS.requests + 20 || !Number.isInteger(value.durationMs) || value.durationMs < 0) bad('counts');
    if (!Array.isArray(value.notes) || value.notes.length > SOURCE_LIMITS.notes) bad('notes');
    value.notes.forEach((note, index) => text(note, 200, `notes[${index}]`));
    if (!Array.isArray(value.candidates) || value.candidates.length > SOURCE_LIMITS.candidates || !Array.isArray(value.gone) || value.gone.length > SOURCE_LIMITS.known) bad('lists');
    const keys = new Set();
    const candidates = value.candidates.map((candidate, index) => {
      const where = `candidates[${index}]`;
      exact(candidate, CANDIDATE_KEYS, where);
      text(candidate.key, 80, `${where}.key`);
      if (!/^[a-z0-9-]+$/.test(candidate.key) || keys.has(candidate.key)) bad(`${where}.key`);
      keys.add(candidate.key);
      if (!Object.hasOwn(CANDIDATE_KINDS, candidate.kind)) bad(`${where}.kind`);
      if (typeof candidate.url !== 'string' || candidate.url.length > 2048) bad(`${where}.url`);
      text(candidate.identifier, 200, `${where}.identifier`);
      if (!Number.isSafeInteger(candidate.seenAt)) bad(`${where}.seenAt`);
      if ((candidate.reason === null) === (candidate.proposal === null)) bad(`${where} needs exactly one of a reason or a proposal`);
      if (candidate.reason !== null) { text(candidate.reason, 200, `${where}.reason`); return candidate; }
      publicAddress(candidate.url, `${where}.url`);
      exact(candidate.proposal, PROPOSAL_KEYS, `${where}.proposal`);
      text(candidate.proposal.name, 100, `${where}.proposal.name`); text(candidate.proposal.reason, 200, `${where}.proposal.reason`);
      if (!Array.isArray(candidate.proposal.checks) || candidate.proposal.checks.length > 6) bad(`${where}.proposal.checks`);
      candidate.proposal.checks.forEach((check, i) => text(check, 120, `${where}.proposal.checks[${i}]`));
      const proposed = candidate.proposal.definition;
      if (!plain(proposed) || proposed.assignments !== undefined || (proposed.network !== undefined && proposed.network !== 'public')) bad(`${where}.proposal.definition`);
      const normal = validateDefinition(proposed, []);
      const dropped = Object.keys(proposed).filter(k => !(k in normal));
      if (dropped.length || normal.network !== 'public' || !CANDIDATE_KINDS[candidate.kind].includes(normal.type)) bad(`${where}.proposal.definition`);
      return {...candidate, proposal: {...candidate.proposal, definition: normal}};
    });
    return {...value, candidates, gone: value.gone.map((url, index) => publicAddress(url, `gone[${index}]`).href)};
  } catch (error) {
    if (String(error.message).startsWith('Invalid source run result')) throw error;
    throw Error(`Invalid source run result: ${String(error.message).slice(0, 160)}`);
  }
}
