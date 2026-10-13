import {open,realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {validateHeaderName,validateHeaderValue} from 'node:http';
const forbidden=new Set(['host','connection','upgrade','content-length','transfer-encoding','te','trailer','expect','accept-encoding','proxy-authorization','proxy-connection']);
export async function readCredentials(reference,url,method,directory=process.env.UPTIME_CREDENTIAL_DIR,monitorId) {
  if(typeof monitorId!=='string'||!monitorId||!directory||!/^[a-zA-Z0-9_-]{1,80}$/.test(reference))throw Error('Credential unavailable');
  let file;
  try{
    const root=await realpath(directory),path=resolve(root,`${reference}.json`);
    if(dirname(path)!==root)throw Error();
    file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
    const info=await file.stat();
    if(!info.isFile()||(info.mode&0o077)||info.uid!==process.getuid()||info.size>32768)throw Error();
    const input=JSON.parse(await file.readFile('utf8'));
    if(!input||Object.keys(input).some(k=>!['monitorId','origin','headers','body','auth'].includes(k))||input.monitorId!==monitorId||input.origin!==new URL(url).origin)throw Error();
    const headers={};
    if(input.headers!==undefined){
      if(!input.headers||Array.isArray(input.headers)||typeof input.headers!=='object'||Object.keys(input.headers).length>30)throw Error();
      for(const [name,value] of Object.entries(input.headers)){
        const key=name.toLowerCase();validateHeaderName(name);validateHeaderValue(name,value);
        if(forbidden.has(key)||key in headers||typeof value!=='string'||value.length>4096)throw Error();
        headers[key]=value;
      }
    }
    if(input.auth!==undefined){
      const a=input.auth;if(!a||headers.authorization)throw Error();
      if(a.type==='bearer'&&Object.keys(a).sort().join(',')==='token,type'&&typeof a.token==='string'&&a.token.length>0&&a.token.length<=4096)headers.authorization=`Bearer ${a.token}`;
      else if(a.type==='basic'&&Object.keys(a).sort().join(',')==='password,type,username'&&typeof a.username==='string'&&!a.username.includes(':')&&typeof a.password==='string')headers.authorization=`Basic ${Buffer.from(`${a.username}:${a.password}`).toString('base64')}`;
      else throw Error();
      validateHeaderValue('authorization',headers.authorization);
    }
    if(input.body!==undefined&&(typeof input.body!=='string'||Buffer.byteLength(input.body)>16384||['GET','HEAD'].includes(method)))throw Error();
    return {headers,body:input.body};
  }catch{throw Error('Credential unavailable or invalid')}finally{await file?.close()}
}
