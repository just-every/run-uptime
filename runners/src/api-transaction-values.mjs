import {query} from 'jsonpathly';
import {apiTemplate} from '../../src/domain/api-transaction-template.mjs';
// Query work and output are bounded independently of the HTTP response byte bound.
function bounded(value) {
  let remaining = 250000;
  const seen = new WeakMap(), spend = amount => {remaining -= amount;if (remaining < 0) throw Error('API extraction work limit')};
  const wrap = entry => {
    if (!entry || typeof entry !== 'object') return entry;
    if (!seen.has(entry)) seen.set(entry,new Proxy(entry,{
      get(target,key){spend(1);return wrap(Reflect.get(target,key))},
      has(target,key){spend(1);return Object.hasOwn(target,key)},
      getOwnPropertyDescriptor(target,key){spend(1);return Reflect.getOwnPropertyDescriptor(target,key)},
      ownKeys(target){const keys=Reflect.ownKeys(target);spend(keys.length+1);return keys},
    }));
    return seen.get(entry);
  };
  return wrap(value);
}
export function extractedApiValues(extract,body) {
  const document = bounded(JSON.parse(body)), result = Object.create(null);
  for (const [name,path] of Object.entries(extract)) {
    const normalized = path.startsWith('$')?path:path.startsWith('[')?'$'+path:'$.'+path;
    const values = query(document,normalized,{returnArray:true});
    if (values.length !== 1 || !['string','number','boolean'].includes(typeof values[0]) || typeof values[0] === 'number' && !Number.isFinite(values[0]) || String(values[0]).length > 4096 || /[\x00-\x1f\x7f]/.test(String(values[0]))) throw Error('API extraction requires one bounded scalar');
    result[name] = values[0];
  }
  return result;
}
export function apiRequestValues(step,variables,origin) {
  const url = apiTemplate(step.url,variables,{url:true});
  const headers = Object.fromEntries(Object.entries(step.headers??{}).map(([name,value]) => [name,apiTemplate(value,variables)]));
  if (Object.values(headers).some(value => value.length > 4096 || /[^\t\x20-\x7e\x80-\xff]/.test(value))) throw Error('Invalid expanded API header');
  let body;
  if (step.body !== undefined) {
    // JSON string substitution preserves JSON quoting, so extracted strings cannot inject fields.
    let json;
    try {json=JSON.parse(step.body)} catch {}
    if (json !== undefined) {
      const replace = value => typeof value === 'string'?apiTemplate(value,variables):Array.isArray(value)?value.map(replace):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[apiTemplate(key,variables),replace(item)])):value;
      body=JSON.stringify(replace(json));
    } else body=apiTemplate(step.body,variables);
    if (Buffer.byteLength(body)>16384) throw Error('Expanded API body exceeds its bound');
  }
  if (url.length > 2048 || new URL(url).origin !== origin) throw Error('Expanded API URL exceeds its scope');
  return {url,requestValues:{origin,headers,...(body!==undefined?{body}:{})}};
}
