import type {Mapping} from './types.ts'
export function pingdomProtocol(kind:string,s:any,check:any,common:Record<string,unknown>,differences:string[]):Mapping{
 const finish=(definition:Record<string,unknown>):Mapping=>({definition:{...common,...definition},differences})
 if(kind==='tcp'){
  if(s.stringtosend)return {unsupported:'Pingdom TCP stringtosend requires a request/response protocol check; it is not reduced to a connection-only TCP port monitor.'}
  return finish({type:'tcp',tcp:{host:check.hostname,port:s.port,...(s.stringtoexpect?{bannerIncludes:s.stringtoexpect}:{})},timeoutMs:3000,assertions:{}})
 }
 if(kind==='smtp'){
  if(typeof s.encryption!=='boolean')return {refused:'Pingdom SMTP detail must explicitly name encryption.'}
  if(s.username||s.password)return {unsupported:'Pingdom SMTP credentials are not copied; review the mail monitor and re-enter its credential on this installation.'}
  differences.push('SMTP encryption uses STARTTLS on submission ports and implicit TLS on port 465; the native runner verifies the TLS identity and greeting, without sending mail.')
  return finish({type:'mail',mail:{protocol:'smtp',host:check.hostname,port:s.port??(s.encryption?587:25),security:s.encryption?(s.port===465?'tls':'starttls'):'none'},timeoutMs:30000,assertions:{}})
 }
 if(kind==='ping'){
  differences.push('Actual ICMP requires a Linux/macOS Node runner with the native ping executable and permission. Workers cannot perform ICMP; missing capacity stays Unknown, with no TCP substitute.')
  return finish({type:'ping',ping:{host:check.hostname},timeoutMs:10000,assertions:{}})
 }
 if(kind==='dns'){
  if(typeof s.nameserver!=='string'||!s.nameserver||typeof s.expectedip!=='string'||!s.expectedip)return {refused:'Pingdom DNS detail needs nameserver and expectedip.'}
  differences.push('The exact named server is queried over bounded DNS/TCP port 53. A server that only accepts UDP needs TCP enabled; no other resolver substitutes for it.')
  return finish({type:'dns',dns:{name:check.hostname,recordType:s.expectedip.includes(':')?'AAAA':'A',nameserver:s.nameserver,resolvers:['nameserver'],expect:{values:[s.expectedip],match:'includes'}},timeoutMs:3000,assertions:{}})
 }
 return {unsupported:'Unsupported Pingdom protocol.'}
}
