import {createHash,createHmac} from 'node:crypto';
// AWS Signature Version 4 for a read-only call: the signed headers are exactly the ones sent. Pure; the time is passed in.
const sha=value=>createHash('sha256').update(value).digest('hex');
const hmac=(key,value)=>createHmac('sha256',key).update(value).digest();
export function signV4({method,host,path,query='',headers={},body='',region,service,credentials,now=new Date()}){
 const amzDate=now.toISOString().replace(/[:-]|\.\d{3}/g,''),day=amzDate.slice(0,8);
 const all={...Object.fromEntries(Object.entries(headers).map(([k,v])=>[k.toLowerCase(),String(v).trim()])),host,'x-amz-date':amzDate,...(credentials.sessionToken?{'x-amz-security-token':credentials.sessionToken}:{})};
 const names=Object.keys(all).sort(),canonicalHeaders=names.map(name=>`${name}:${all[name]}\n`).join(''),signed=names.join(';');
 const canonical=[method,path,query,canonicalHeaders,signed,sha(body)].join('\n'),scope=`${day}/${region}/${service}/aws4_request`;
 const toSign=['AWS4-HMAC-SHA256',amzDate,scope,sha(canonical)].join('\n');
 const key=hmac(hmac(hmac(hmac(`AWS4${credentials.secretAccessKey}`,day),region),service),'aws4_request');
 return {...all,authorization:`AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${scope}, SignedHeaders=${signed}, Signature=${createHmac('sha256',key).update(toSign).digest('hex')}`};
}
