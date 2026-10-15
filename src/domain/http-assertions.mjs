// The Worker and private runner evaluate exactly the same HTTP assertions.
export function httpAssertions(def,response,durationMs){
 const a=def.assertions,{body,headers,status}=response;
 const checks=[{assertion:'status',pass:status===a.status,reason:'Expected HTTP status'}];
 if(a.bodyIncludes!==undefined)checks.push({assertion:'body',pass:body.includes(a.bodyIncludes),reason:'Body contains required text'});
 if(a.header)checks.push({assertion:'header',pass:headers[a.header.name.toLowerCase()]===a.header.equals,reason:'Header equals required value'});
 if(a.json){let value;try{value=a.json.path.split('.').reduce((obj,key)=>obj?.[key],JSON.parse(body))}catch{}checks.push({assertion:'json',pass:value===a.json.equals,reason:'JSON value matches assertion'})}
 if(a.latencyMs)checks.push({assertion:'latency',pass:durationMs<=a.latencyMs,reason:'Response within required time'});
 return checks;
}
