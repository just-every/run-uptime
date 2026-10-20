// A JSON rule's value as typed: true, 12 or "12" are typed JSON; anything else (ok) is text.
export function parseJsonValue(text) {
  const value=String(text).trim();let parsed;
  try{parsed=JSON.parse(value)}catch{return value}
  if(!['string','number','boolean'].includes(typeof parsed))throw Error('JSON value: use text, a number, true or false.');
  return parsed;
}
// The field's text for a saved value: text that would read as JSON keeps its quotes.
export function showJsonValue(value) {
  if(typeof value!=='string')return JSON.stringify(value);
  try{JSON.parse(value);return JSON.stringify(value)}catch{return value}
}

export function parseStatus(value) {
  const parts=String(value).split(',').map(part=>part.trim());
  if(parts.some(part=>!(/^[1-5][0-9]{2}$/.test(part)||/^[1-5]xx$/.test(part)||/^[1-5][0-9]{2}-[1-5][0-9]{2}$/.test(part))))throw Error('Expected status: use codes or ranges separated by commas, such as 200, 201, 2xx or 200-299.');
  const codes=parts.map(part=>/^\d{3}$/.test(part)?Number(part):part);
  return codes.length===1&&typeof codes[0]==='number'?codes[0]:codes;
}

// Each assertion has one field; an empty field is no rule.
export function assembleAssertions({status,body='',bodyExcludes='',regexPattern='',regexFlags='',headerName='',headerValue='',jsonPath='',jsonEquals='',latencyMs=''}) {
  if(regexFlags&&!regexPattern)throw Error('Enter a pattern before its flags.');
  if(headerValue&&!headerName)throw Error('Header: enter the header name.');
  const path=jsonPath.trim(),equals=String(jsonEquals).trim(),latency=String(latencyMs).trim();
  if(Boolean(path)!==Boolean(equals))throw Error('JSON value: enter both the path and the value it must equal.');
  if(latency&&!/^\d+$/.test(latency))throw Error('Responds within: whole milliseconds, such as 3000.');
  return {status:parseStatus(status),...(body?{bodyIncludes:body}:{}),...(bodyExcludes?{bodyExcludes}:{}),...(regexPattern?{bodyRegex:{pattern:regexPattern,flags:regexFlags}}:{}),...(headerName?{header:{name:headerName,equals:headerValue}}:{}),...(path?{json:{path,equals:parseJsonValue(equals)}}:{}),...(latency?{latencyMs:Number(latency)}:{})};
}
