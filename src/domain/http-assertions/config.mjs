export const HTTP_ASSERTIONS = {
  status: 'status', bodyIncludes: 'body', bodyExcludes: 'body-absent', bodyRegex: 'body-regex',
  header: 'header', json: 'json', latencyMs: 'latency',
};
export const ASSERTION_FIELDS = {header: ['name', 'equals'], json: ['path', 'equals'], bodyRegex: ['pattern', 'flags']};
export const httpAssertionNames = assertions => Object.entries(HTTP_ASSERTIONS)
  .filter(([key]) => key === 'status' || assertions[key] !== undefined).map(([, name]) => name);

export function assertionObject(value, kind) {
  const label = kind === 'json' ? 'JSON' : kind;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(`Invalid ${label} assertion`);
  const unknown = Object.keys(value).filter(key => !ASSERTION_FIELDS[kind].includes(key));
  if (unknown.length) throw Error(`Invalid ${label} assertion: unknown field${unknown.length > 1 ? 's' : ''} ${unknown.map(key => `“${key.slice(0, 60)}”`).join(', ')}; it takes only ${ASSERTION_FIELDS[kind].join(' and ')}`);
  return value;
}
