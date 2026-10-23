import {jsonValues} from './format.ts'

// Request secrets a source file can carry, withheld before anything is uploaded or stored. Each importer only asks
// whether these fields are present (a credential reference replaces them, or the entry is refused for them), so a
// present value becomes WITHHELD and every preview, plan and refusal reads the same:
// - UptimeRobot: httpUsername, httpPassword, customHttpHeaders and postValueData;
// - Pingdom: the values of requestheaders, and username, password and postdata;
// - Site24x7 and Better Stack request payloads, custom headers and authentication values;
// - an Uptime definition file: headers, body and auth;
// - any source: a field named as a credential (authorization, cookie, password, token, api key, secret), and the
//   userinfo of a URL.
export const WITHHELD='[withheld]'
const FIELDS=new Set(['httpUsername','httpPassword','customHttpHeaders','postValueData','username','password','postdata','headers','body','auth','request_param','custom_headers','client_certificate_password','auth_username','auth_password','request_headers','request_body','proxy_password'])
const CREDENTIAL=/^(?:access[_-]?token|refresh[_-]?token|token|authorization|proxy[_-]?authorization|cookie|set[_-]?cookie|password|passwd|api[_-]?key|x[_-]?api[_-]?key|secret|client[_-]?secret)$/i
const USERINFO=/^([a-z][a-z0-9+.-]*:\/\/)([^/?#]*)@/i
const present=(value:unknown)=>value!==null&&value!==undefined&&value!==''&&value!==false&&!(Array.isArray(value)&&!value.length)&&!(typeof value==='object'&&!Array.isArray(value)&&!Object.keys(value as object).length)

function text(value:string){
 const match=USERINFO.exec(value)
 return match&&match[2]!=='withheld'?match[1]+'withheld@'+value.slice(match[0].length):value
}
/** One source value with its request secrets withheld; anything else is unchanged. */
export function withholdValue(value:unknown):any{
 if(Array.isArray(value))return value.map(withholdValue)
 if(typeof value==='string')return text(value)
 if(!value||typeof value!=='object')return value
 return Object.fromEntries(Object.entries(value).map(([key,child])=>{
  if((FIELDS.has(key)||CREDENTIAL.test(key))&&present(child))return [key,WITHHELD]
  // Pingdom request headers keep their names; their values are the secrets.
  if(key==='requestheaders'&&child&&typeof child==='object'&&!Array.isArray(child))return [key,Object.fromEntries(Object.keys(child).map(name=>[name,present((child as any)[name])?WITHHELD:(child as any)[name]]))]
  if(key==='requestheaders'&&present(child))return [key,WITHHELD]
  return [key,withholdValue(child)]
 }))
}
/** A source file's text with its request secrets withheld: the file exactly as chosen when it carries none, otherwise
 * its JSON values written again. A CSV log export or text no importer reads is returned as is (the importer refuses it). */
export function withholdText(source:string):string{
 if(!/^\s*[[{]/.test(source))return source
 let values:unknown[]
 try{values=jsonValues(source,'file')}catch{return source}
 const withheld=values.map(withholdValue)
 if(JSON.stringify(withheld)===JSON.stringify(values))return source
 return withheld.map(value=>JSON.stringify(value)).join('\n')
}
