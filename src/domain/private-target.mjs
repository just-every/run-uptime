// Portable policy only: resolving DNS and pinning the approved socket belong to
// the runner. A hostname alone never establishes private-network authority.
const MANAGEMENT_PORTS = new Set([22, 23, 2375, 2376, 3389, 5900, 5985, 5986, 6443, 10250, 10255]);
const GRANT_KEYS = ['runnerId', 'monitorId', 'hosts', 'cidrs', 'ports', 'expiresAt'];
const RUNNER_ID = /^self-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const forbidden = message => { throw Error(message); };

function addressParts(raw) {
  if (typeof raw !== 'string' || raw.length > 45) return null;
  if ((raw.includes('[') || raw.includes(']')) && !(raw.startsWith('[') && raw.endsWith(']') && raw.includes(':'))) return null;
  const host = raw.startsWith('[') && raw.endsWith(']') ? raw.slice(1, -1).toLowerCase() : raw.toLowerCase();
  if (!host.includes(':')) {
    const parts = host.split('.');
    if (parts.length !== 4 || parts.some(p => !/^(0|[1-9]\d{0,2})$/.test(p) || Number(p) > 255)) return null;
    return {bits: 32, value: parts.reduce((n, p) => (n << 8n) | BigInt(p), 0n)};
  }
  // Dotted IPv6, mapped IPv6 and scoped addresses cannot acquire authority.
  if (!/^[0-9a-f:]+$/.test(host)) return null;
  const halves = host.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves[1] ? halves[1].split(':') : [];
  if ([...left, ...right].some(p => !/^[0-9a-f]{1,4}$/.test(p))) return null;
  const missing = 8 - left.length - right.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const words = [...left, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...right];
  return {bits: 128, value: words.reduce((n, p) => (n << 16n) | BigInt(parseInt(p, 16)), 0n)};
}

function inside(address, base, prefix) {
  if (!address || address.bits !== base.bits) return false;
  const shift = BigInt(address.bits - prefix);
  return address.value >> shift === base.value >> shift;
}
const PRIVATE_RANGES = [
  ['10.0.0.0', 8], ['172.16.0.0', 12], ['192.168.0.0', 16], ['fc00::', 7],
].map(([ip, prefix]) => ({base: addressParts(ip), prefix}));
const MANAGEMENT_RANGES = [
  // AWS's reserved ULA service space includes metadata, DNS and time services.
  ['fd00:ec2::', 32], ['fd20:ce::254', 128],
].map(([ip, prefix]) => ({base: addressParts(ip), prefix}));

/** True only for ordinary RFC1918/ULA addresses, excluding provider services. */
export function privateAddress(ip) {
  const address = addressParts(ip);
  if (!address || !PRIVATE_RANGES.some(r => inside(address, r.base, r.prefix))) return false;
  if (MANAGEMENT_RANGES.some(r => inside(address, r.base, r.prefix))) return false;
  // ISATAP can route through the IPv4 address embedded in its interface ID.
  const interfacePrefix = address.bits === 128 ? (address.value >> 32n) & 0xffffffffn : null;
  return interfacePrefix !== 0x00005efen && interfacePrefix !== 0x02005efen;
}

function normalizedHost(raw) {
  if (typeof raw !== 'string' || !raw || raw.length > 255 || /[\s\\/%?#@]/.test(raw)) forbidden('Invalid private hostname');
  let host = raw.toLowerCase();
  if (host.includes(':')) {
    if (!privateAddress(host)) forbidden('Private target address forbidden');
    return new URL(`http://[${host.replace(/^\[|\]$/g, '')}]/`).hostname.slice(1, -1);
  }
  if (host.endsWith('.')) host = host.slice(0, -1);
  if (host.length > 253) forbidden('Invalid private hostname');
  const labels = host.split('.');
  if (labels.some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) forbidden('Invalid private hostname');
  if (labels.some(label => ['metadata', 'instance-data', 'localhost', 'localdomain'].includes(label)) ||
      host === 'kubernetes' || host === 'kubernetes.default' || host === 'kubernetes.default.svc' ||
      host.startsWith('kubernetes.default.svc.') ||
      ['host.docker.internal', 'gateway.docker.internal'].includes(host)) forbidden('Private management hostname forbidden');
  // WHATWG recognizes short, hexadecimal and octal IPv4 literals. Never let
  // these masquerade as DNS names or bypass the numeric-address policy.
  let parsed;
  try { parsed = new URL(`http://${host}/`).hostname; } catch { forbidden('Invalid private hostname'); }
  if (/^[0-9.]+$/.test(parsed)) {
    if (!privateAddress(parsed)) forbidden('Private target address forbidden');
    return parsed;
  }
  return host;
}

/** Returns the normalized HTTP(S) URL; never resolves or authorizes a socket. */
export function privateTarget(value) {
  if (typeof value !== 'string' || value.length > 2048 || /[\s\\]/.test(value)) forbidden('Invalid private target');
  const authority = /^https?:\/\/([^/?#]*)/i.exec(value)?.[1];
  if (!authority || authority.includes('@')) forbidden('Private target requires HTTP(S) without URL credentials');
  let url; try { url = new URL(value); } catch { forbidden('Invalid private target'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || value.includes('#')) {
    forbidden('Private target requires HTTP(S) without URL credentials or fragment');
  }
  const host = normalizedHost(url.hostname);
  url.hostname = host.includes(':') ? `[${host}]` : host;
  if (MANAGEMENT_PORTS.has(Number(url.port || (url.protocol === 'https:' ? 443 : 80)))) forbidden('Private management port forbidden');
  if (url.href.length > 2048) forbidden('Invalid private target');
  return url;
}

function privateCidr(value) {
  if (typeof value !== 'string' || value.length > 49 || /[\[\]]/.test(value)) forbidden('Invalid private CIDR');
  const parts = value.split('/'), address = addressParts(parts[0]);
  if (parts.length !== 2 || !address || !/^(0|[1-9]\d{0,2})$/.test(parts[1])) forbidden('Invalid private CIDR');
  const prefix = Number(parts[1]);
  if (prefix > address.bits || !PRIVATE_RANGES.some(r => prefix >= r.prefix && inside(address, r.base, r.prefix))) forbidden('CIDR must stay within RFC1918 or ULA');
  if (!privateAddress(parts[0])) forbidden('Private management CIDR forbidden');
  const shift = BigInt(address.bits - prefix), network = address.value >> shift << shift;
  if (network !== address.value) forbidden('Private CIDR must name its network address');
  const host = address.bits === 128 ? new URL(`http://[${parts[0]}]/`).hostname.slice(1, -1) : parts[0];
  return {text: `${host}/${prefix}`, base: address, prefix};
}

function boundedList(input, key, normalize) {
  const items = input[key];
  if (!Array.isArray(items) || items.length < 1 || items.length > 20) forbidden(`Private grant requires 1–20 ${key}`);
  const result = Array.from(items, normalize);
  if (new Set(result).size !== result.length) forbidden(`Duplicate private grant ${key}`);
  return result;
}

/** Normalize an explicit installation-local, single-runner/single-monitor grant. */
export function normalizePrivateGrant(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Reflect.ownKeys(input).length !== GRANT_KEYS.length || GRANT_KEYS.some(k => !Object.hasOwn(input, k))) forbidden('Invalid private grant fields');
  if (typeof input.runnerId !== 'string' || !RUNNER_ID.test(input.runnerId)) forbidden('Private grant requires a self runner UUID');
  if (typeof input.monitorId !== 'string' || !input.monitorId.length || input.monitorId.length > 512) forbidden('Invalid private grant monitor');
  if (!Number.isSafeInteger(input.expiresAt) || input.expiresAt <= 0) forbidden('Invalid private grant expiry');
  const hosts = boundedList(input, 'hosts', normalizedHost);
  const cidrs = boundedList(input, 'cidrs', value => privateCidr(value).text);
  const ports = boundedList(input, 'ports', port => {
    if (!Number.isInteger(port) || port < 1 || port > 65535 || MANAGEMENT_PORTS.has(port)) forbidden('Private grant port forbidden');
    return port;
  });
  return {runnerId: input.runnerId, monitorId: input.monitorId, hosts, cidrs, ports, expiresAt: input.expiresAt};
}

/** Every call revalidates untrusted grants and checks all scopes conjunctively. */
export function privateGrantAllows(grant, request) {
  try {
    const {host, address, port, runnerId, monitorId, now = Date.now()} = request;
    const normalized = normalizePrivateGrant(grant);
    if (runnerId !== normalized.runnerId || monitorId !== normalized.monitorId ||
        !Number.isSafeInteger(now) || now < 0 || now >= normalized.expiresAt ||
        !normalized.ports.includes(port) || !privateAddress(address)) return false;
    const hostname = normalizedHost(host);
    if (!normalized.hosts.includes(hostname)) return false;
    const numeric = addressParts(address), literal = addressParts(hostname);
    if (literal && (literal.bits !== numeric.bits || literal.value !== numeric.value)) return false;
    return normalized.cidrs.some(value => { const cidr = privateCidr(value); return inside(numeric, cidr.base, cidr.prefix); });
  } catch { return false; }
}
