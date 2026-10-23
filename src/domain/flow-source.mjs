// Source custody is part of the ordinary immutable flow revision and its signed
// flowDigest, never executable runner input. No separate authority or store.
export function validateFlowSource(source) {
 if (!source || typeof source !== 'object' || Object.keys(source).join(',') !== 'files' || !Array.isArray(source.files) || source.files.length !== 3) throw Error('Invalid imported flow source');
 const names = new Set(), kinds = new Set();
 const files = source.files.map(file => {
  if (!file || typeof file !== 'object' || Object.keys(file).sort().join(',') !== 'kind,path,text' || !['suite','fixture','lock'].includes(file.kind) || typeof file.path !== 'string' || !/^[A-Za-z0-9_.-]{1,100}$/.test(file.path) || ['.','..'].includes(file.path) || names.has(file.path) || kinds.has(file.kind) || typeof file.text !== 'string' || new TextEncoder().encode(file.text).length > 65536) throw Error('Invalid imported flow source file');
  names.add(file.path); kinds.add(file.kind);
  return {path:file.path,kind:file.kind,text:file.text};
 });
 return {files};
}
