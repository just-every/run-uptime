import {publicTarget} from './public-target.mjs';
import {privateTarget} from './private-target.mjs';
import {validateJsonPath} from './http-assertions/json.mjs';
import {apiAssertions} from './api-transaction-assertions.mjs';
import {API_VARIABLE,templateVariables,apiUrlTemplate} from './api-transaction-template.mjs';
import {API_EFFECTS} from './api-effects.mjs';
export {validateApiTransactionEvidence,apiTransactionChecks,apiTransactionOutcome,validateFixtureEvidence} from './api-transaction-evidence.mjs';
export const API_TRANSACTION_LIMITS = Object.freeze({maxSteps:10,maxVariables:24,maxHeaders:20,maxValueChars:4096,maxBodyBytes:16384,wallMs:60000,minTimeoutMs:1000,minIntervalMs:60000});
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const only = (value,keys,label) => {if (!object(value) || Object.keys(value).some(key => !keys.includes(key))) throw Error(`Invalid API ${label}`)};
const forbiddenHeaders = new Set(['host','connection','upgrade','content-length','transfer-encoding','te','trailer','expect','accept-encoding','proxy-authorization','proxy-connection']);
const scalar = value => ['string','boolean','number'].includes(typeof value) && (typeof value !== 'number' || Number.isFinite(value));
const size = value => new TextEncoder().encode(value).length;
function scope(network,startUrl,synthetic) {
  if (network === 'synthetic' && typeof synthetic === 'function') {const target = value => new URL(synthetic(value));return {target,origin:target(startUrl).origin,loopback:true}}
  if (!['public','private'].includes(network)) throw Error('API transactions require public or private network scope');
  const target = network === 'private' ? privateTarget : publicTarget;
  return {target,origin:target(startUrl).origin};
}
function validateVariables(input) {
  const variables = input ?? {};
  if (!object(variables) || Object.keys(variables).length > API_TRANSACTION_LIMITS.maxVariables) throw Error('Invalid API variables');
  for (const [name,value] of Object.entries(variables)) if (!API_VARIABLE.test(name) || !scalar(value) || String(value).length > API_TRANSACTION_LIMITS.maxValueChars || /[\x00-\x1f\x7f]/.test(String(value))) throw Error('Invalid API variable');
  return variables;
}
// One closed step vocabulary for API transactions and for the setup/teardown fixtures around a browser flow.
function validateSteps(input,variables,{origin,target,loopback=false}) {
  const known = new Set(Object.keys(variables)), extracted = new Set(), names = new Set();
  const references = value => {for (const name of templateVariables(value)) if (!known.has(name)) throw Error('API template references an unavailable variable')};
  if (!input.length || input.length > API_TRANSACTION_LIMITS.maxSteps) throw Error('An API transaction requires 1 to 10 steps');
  let phase = 0;
  return input.map(step => {
    only(step,['name','phase','url','method','headers','body','assertions','extract','effect'],'step');
    if (typeof step.name !== 'string' || !step.name.trim() || step.name.length > 80 || /[\x00-\x1f\x7f{}]/.test(step.name) || names.has(step.name.trim())) throw Error('API step names must be unique and contain up to 80 plain characters');
    names.add(step.name.trim());
    const current = ['setup','request','cleanup'].indexOf(step.phase??'request');
    if (current < 0 || current < phase) throw Error('API steps must order setup, requests and cleanup');
    phase = current;
    if (step.effect !== undefined && !API_EFFECTS.includes(step.effect)) throw Error(`An API step effect is one of ${API_EFFECTS.join(', ')}`);
    const url = apiUrlTemplate(step.url,origin,target); references(url);
    const method = step.method??'GET';
    if (!['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS'].includes(method)) throw Error('Invalid API request method');
    let headers;
    if (step.headers !== undefined) {
      if (!object(step.headers) || Object.keys(step.headers).length > API_TRANSACTION_LIMITS.maxHeaders) throw Error('Invalid API headers');
      headers = {};
      for (const [name,value] of Object.entries(step.headers)) {
        const key = name.toLowerCase();
        if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,80}$/.test(name) || forbiddenHeaders.has(key) || Object.hasOwn(headers,key) || typeof value !== 'string' || value.length > 4096 || /[^\t\x20-\x7e\x80-\xff]/.test(value)) throw Error('Invalid API header');
        // Authentication is installation-local or extracted at runtime, never literal editor content.
        if (/^(?:authorization|cookie|x-api-key|api-key)$/i.test(key) && (!templateVariables(value).length || templateVariables(value).some(name=>!extracted.has(name)))) throw Error('API authentication requires a runtime variable or local credential');
        // A synthetic flow's fixtures reach only the granted loopback fixture, which serves plain HTTP and proves its identity.
        if (/^(?:authorization|cookie|x-api-key|api-key)$/i.test(key) && !origin.startsWith('https:') && !loopback) throw Error('API authentication requires HTTPS');
        references(value); headers[key] = value;
      }
    }
    if (step.body !== undefined) {
      if (['GET','HEAD'].includes(method) || typeof step.body !== 'string' || size(step.body) > API_TRANSACTION_LIMITS.maxBodyBytes) throw Error('Invalid API request body');
      // JSON braces are literal. Only double braces name variables.
      for (const match of step.body.matchAll(/\{\{([^{}]*)\}\}/g)) if (!API_VARIABLE.test(match[1]) || !known.has(match[1])) throw Error('API body references an unavailable variable');
      if (/\{\{|\}\}/.test(step.body.replace(/\{\{[A-Za-z][A-Za-z0-9_]{0,39}\}\}/g,''))) throw Error('Invalid API body variable template');
    }
    const assertions = apiAssertions(step.assertions??{status:200});
    // Expectations are saved criteria; they cannot contain extracted values or secret diagnostics.
    let extract;
    if (step.extract !== undefined) {
      if (!object(step.extract) || !Object.keys(step.extract).length) throw Error('Invalid API extraction');
      extract = {};
      for (const [name,path] of Object.entries(step.extract)) {
        if (!API_VARIABLE.test(name) || known.has(name) || known.size >= API_TRANSACTION_LIMITS.maxVariables) throw Error('API extraction names must be unique variables');
        validateJsonPath(path); known.add(name); extracted.add(name); extract[name] = path;
      }
    }
    return {name:step.name.trim(),phase:step.phase??'request',url,method,...(headers?{headers}:{}),...(step.body!==undefined?{body:step.body}:{}),assertions,...(extract?{extract}:{}),...(step.effect?{effect:step.effect}:{})};
  });
}
export function validateApiTransaction(input,{network='public',startUrl}={}) {
  only(input,['variables','steps'],'transaction');
  const variables = validateVariables(input.variables);
  if (!Array.isArray(input.steps)) throw Error('An API transaction requires 1 to 10 steps');
  const steps = validateSteps(input.steps,variables,scope(network,startUrl));
  if (!steps.some(step => step.phase === 'request')) throw Error('An API transaction requires a request phase');
  if (size(JSON.stringify({variables,steps})) > 65536) throw Error('API transaction exceeds its configuration bound');
  return {variables:{...variables},steps};
}
/** API-004: the setup steps a browser flow runs before its first page and the teardown steps it runs after, whatever happened. */
export function validateFlowFixtures(input,{network,startUrl,synthetic}) {
  only(input,['variables','setup','teardown'],'flow fixtures');
  const variables = validateVariables(input.variables);
  const lists = [['setup','setup'],['teardown','cleanup']].map(([key,phase]) => {
    const list = input[key] ?? [];
    if (!Array.isArray(list)) throw Error(`Invalid flow ${key} fixtures`);
    return list.map(step => {if (!object(step) || (step.phase !== undefined && step.phase !== phase)) throw Error(`Flow ${key} fixtures take the ${phase} phase`);return {...step,phase}});
  });
  if (!lists[1].length) throw Error('Flow fixtures need at least one teardown step');
  const steps = validateSteps([...lists[0],...lists[1]],variables,scope(network,startUrl,synthetic));
  if (size(JSON.stringify({variables,steps})) > 65536) throw Error('Flow fixtures exceed their configuration bound');
  return {variables:{...variables},setup:steps.filter(step=>step.phase==='setup'),teardown:steps.filter(step=>step.phase==='cleanup')};
}
