export function additionalAssertions(assertions) {
  return Object.fromEntries(['json','latencyMs'].filter(key=>assertions[key]!==undefined).map(key=>[key,assertions[key]]));
}

// Status/body/header have one visible owner. Never silently replace a second
// value entered through JSON, including one that would relax a failing check.
export function assembleAssertions({status,body='',headerName='',headerValue='',additional='{}'}) {
  const extra=JSON.parse(additional||'{}');
  if(!extra||typeof extra!=='object'||Array.isArray(extra))throw Error('Additional checks must be a JSON object.');
  if(['status','bodyIncludes','header'].some(key=>Object.hasOwn(extra,key)))throw Error('Set status, body and headers using the fields above.');
  if(Object.keys(extra).some(key=>!['json','latencyMs'].includes(key)))throw Error('Additional checks support json and latencyMs.');
  return {...extra,status:Number(status),...(body?{bodyIncludes:body}:{}),...(headerName?{header:{name:headerName,equals:headerValue}}:{})};
}
