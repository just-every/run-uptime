// The Worker and private runner evaluate exactly the same HTTP assertions.
// Retain only a bounded scalar diagnostic, never a JSON subtree or parse error
// (which can include response content). Sensitive paths and credentialed
// responses reveal no value, including credentials echoed by the target.
function jsonEvidence(value,redact){
 if(value===undefined)return 'missing';
 if(value===null)return 'null';
 if(typeof value==='object')return Array.isArray(value)?'array':'object';
 if(redact)return '[redacted]';
 const text=typeof value==='string'?JSON.stringify(value.replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g,' ')):String(value);
 return text.length>50?text.slice(0,49)+'…':text;
}
function jsonAssertion(assertion,body,credentialed){
 const {path,equals}=assertion;
 let value,invalid=false;
 try{
  value=JSON.parse(body);
  for(const key of path.replace(/^\$\./,'').split('.'))value=value!==null&&typeof value==='object'&&Object.hasOwn(value,key)?value[key]:undefined;
 }catch{invalid=true}
 const pass=!invalid&&value===equals,redact=credentialed||/(?:password|secret|token|authorization|cookie|credential|api[-_]?key)/i.test(path);
 return {assertion:'json',pass,reason:pass?'JSON value matches assertion':`JSON assertion failed at ${path}: actual ${invalid?'invalid JSON':jsonEvidence(value,redact)}; expected ${jsonEvidence(equals,redact)}`};
}
export function httpAssertions(def,response,durationMs){
 const a=def.assertions,{body,headers,status}=response;
 const checks=[{assertion:'status',pass:status===a.status,reason:'Expected HTTP status'}];
 if(a.bodyIncludes!==undefined)checks.push({assertion:'body',pass:body.includes(a.bodyIncludes),reason:'Body contains required text'});
 if(a.header)checks.push({assertion:'header',pass:headers[a.header.name.toLowerCase()]===a.header.equals,reason:'Header equals required value'});
 if(a.json)checks.push(jsonAssertion(a.json,body,Boolean(def.request)));
 if(a.latencyMs)checks.push({assertion:'latency',pass:durationMs<=a.latencyMs,reason:'Response within required time'});
 return checks;
}
