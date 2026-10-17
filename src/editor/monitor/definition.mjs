export function additionalAssertions(assertions) {
  return Object.fromEntries(['json','latencyMs'].filter(key=>assertions[key]!==undefined).map(key=>[key,assertions[key]]));
}

export function parseStatus(value) {
  const parts=String(value).split(',').map(part=>part.trim());
  if(parts.some(part=>!(/^[1-5][0-9]{2}$/.test(part)||/^[1-5]xx$/.test(part)||/^[1-5][0-9]{2}-[1-5][0-9]{2}$/.test(part))))throw Error('Expected status: use codes or ranges separated by commas, such as 200, 201, 2xx or 200-299.');
  const codes=parts.map(part=>/^\d{3}$/.test(part)?Number(part):part);
  return codes.length===1&&typeof codes[0]==='number'?codes[0]:codes;
}

// Each assertion has one visible owner; JSON cannot silently replace a field.
export function assembleAssertions({status,body='',bodyExcludes='',regexPattern='',regexFlags='',headerName='',headerValue='',additional='{}'}) {
  const extra=JSON.parse(additional||'{}');
  if(!extra||typeof extra!=='object'||Array.isArray(extra))throw Error('Additional checks must be a JSON object.');
  if(['status','bodyIncludes','bodyExcludes','bodyRegex','header'].some(key=>Object.hasOwn(extra,key)))throw Error('Set status, body and headers using the fields above.');
  if(Object.keys(extra).some(key=>!['json','latencyMs'].includes(key)))throw Error('Additional checks support json and latencyMs.');
  if(regexFlags&&!regexPattern)throw Error('Enter a body regular expression before its flags.');
  return {...extra,status:parseStatus(status),...(body?{bodyIncludes:body}:{}),...(bodyExcludes?{bodyExcludes}:{}),...(regexPattern?{bodyRegex:{pattern:regexPattern,flags:regexFlags}}:{}),...(headerName?{header:{name:headerName,equals:headerValue}}:{})};
}
