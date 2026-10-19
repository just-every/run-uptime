// Templates have no expression language and never select an authority or a header name.
export const API_VARIABLE = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const token = /\{\{([A-Za-z][A-Za-z0-9_]{0,39})\}\}/g;
export function templateVariables(value) {
  if (typeof value !== 'string') return [];
  const names = [...value.matchAll(token)].map(match => match[1]);
  if (/\{\{|\}\}/.test(value.replace(token, ''))) throw Error('Invalid API variable template');
  return names;
}
export function apiTemplate(value, variables, {url = false} = {}) {
  if (typeof value !== 'string') return value;
  templateVariables(value);
  return value.replace(token, (_match, name) => {
    if (!Object.hasOwn(variables, name)) throw Error('API variable unavailable');
    return url ? encodeURIComponent(String(variables[name])) : String(variables[name]);
  });
}
export function apiUrlTemplate(value, origin, target) {
  if (typeof value !== 'string' || value.length > 2048) throw Error('Invalid API step URL');
  const authority = value.match(/^https?:\/\/[^/?#]*/)?.[0];
  if (!authority || /[{}]/.test(authority)) throw Error('API URL authority cannot contain variables');
  templateVariables(value);
  const url = target(value.replace(token, 'api-value'));
  if (url.origin !== origin) throw Error('API steps must use the monitor origin');
  return value;
}
