export const credentialError = () => Object.assign(new Error('Credential unavailable or invalid'), {code: 'credential'});
export const object = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
export function fields(value, required, optional = []) {
  if (!object(value) || required.some(key => !Object.hasOwn(value, key)) || Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) throw credentialError();
}
export function text(value, max = 4096, empty = false) {
  if (typeof value !== 'string' || (!empty && !value.length) || Buffer.byteLength(value) > max || /[\x00-\x1f\x7f]/.test(value)) throw credentialError();
  return value;
}
export function active(signal) { signal?.throwIfAborted(); }
export function integer(value, min, max) { if (!Number.isSafeInteger(value) || value < min || value > max) throw credentialError(); return value; }
