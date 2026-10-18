import {HTTP_ASSERTIONS,assertionObject} from './http-assertions/config.mjs';
import {validateStatus} from './http-assertions/status.mjs';
import {compileBodyRegex} from './http-assertions/regex.mjs';
import {validateJsonPath} from './http-assertions/json.mjs';
export function apiAssertions(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !Object.hasOwn(HTTP_ASSERTIONS,key))) throw Error('Invalid API step assertions');
  const a = {...input,status:input.status??200};
  validateStatus(a.status);
  for (const key of ['bodyIncludes','bodyExcludes']) if (a[key] !== undefined && (typeof a[key] !== 'string' || a[key].length > 200)) throw Error('Invalid API body assertion');
  if (a.bodyRegex !== undefined) compileBodyRegex(assertionObject(a.bodyRegex,'bodyRegex'));
  if (a.header !== undefined && (!assertionObject(a.header,'header') || !/^[a-zA-Z0-9-]{1,80}$/.test(a.header.name) || typeof a.header.equals !== 'string' || a.header.equals.length > 200)) throw Error('Invalid API header assertion');
  if (a.json !== undefined) {
    const json = assertionObject(a.json,'json');
    validateJsonPath(json.path);
    if (!['string','number','boolean'].includes(typeof json.equals) || typeof json.equals === 'number' && !Number.isFinite(json.equals)) throw Error('Invalid API JSON assertion');
  }
  if (a.latencyMs !== undefined && (!Number.isInteger(a.latencyMs) || a.latencyMs < 1 || a.latencyMs > 60000)) throw Error('Invalid API latency assertion');
  return a;
}
