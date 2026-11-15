import type {Mapping,SourceEntry} from './types.ts'
export function pingdomHttp(entry:SourceEntry,tags:string[]|undefined,initialDifferences:string[]):Mapping{
 const check=entry.value,http=check.type.http
 const protocol=http.encryption?'https:':'http:',port=http.port??(http.encryption?443:80)
 if(!Number.isInteger(port)||port<1||port>65535)return {refused:'Pingdom HTTP port is invalid.'}
 const path=http.url??'/'
 if(typeof path!=='string'||!path.startsWith('/')||path.startsWith('//'))return {refused:'Pingdom HTTP URL must be an explicit path beginning with /.'}
 let url;try{url=new URL(`${protocol}//${check.hostname}:${port}${path}`);if(url.hostname.toLowerCase()!==check.hostname.toLowerCase()||url.username||url.password||url.hash)throw Error()}catch{return {refused:'Pingdom HTTP hostname or path is invalid.'}}
 const differences=[...initialDifferences]
 const assertions:Record<string,unknown>={status:['2xx','3xx']}
 if(http.shouldcontain!==undefined&&http.shouldcontain!=='')assertions.bodyIncludes=http.shouldcontain
 if(http.shouldnotcontain!==undefined&&http.shouldnotcontain!=='')assertions.bodyExcludes=http.shouldnotcontain
 if(http.useRegularExpression) return {unsupported:'Pingdom regular-expression check semantics need a reviewed expression conversion; this check was not reduced to a literal keyword.'}
 const hasSecrets=Boolean(http.username||http.password||http.postdata||http.requestheaders&&(typeof http.requestheaders!=='object'||Object.keys(http.requestheaders).length)),credentialRef=`pingdom-${String(check.id??entry.index+1).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,60)}`
 if(hasSecrets)differences.push(`Authentication, headers and request body are not imported. Re-enter them in the monitor-bound local credential file ${credentialRef}.`)
 if(http.verify_certificate===false)differences.push(http.encryption?'Certificate errors were ignored in Pingdom. The reviewed trust exception is preserved for the initial HTTPS origin only, requires a private runner, and grants no credential authority.':'The source disabled certificate verification on plain HTTP; there is no TLS connection to exempt.')
 if(http.ssl_down_days_before)differences.push('Certificate expiry is preserved by a separate TLS monitor in this reviewed plan; pause or resume both checks together.')
 const threshold=check.responsetime_threshold
 let slow
 if(threshold!==undefined&&threshold!==null&&threshold!==0){
  if(!Number.isInteger(threshold)||threshold<1)return {refused:'Pingdom responsetime_threshold must be a positive whole number of milliseconds, or 0 to disable it.'}
  if(threshold>=60000)return {refused:'Pingdom response-time threshold must be below the 60000 ms maximum request timeout.'}
  slow={thresholdMs:threshold,mode:'consecutive',slots:1,percentile:95,locations:'all',destinationIds:null,contactSettings:{}}
 }
 if(check.notifyagainevery||check.notifywhenbackup===false)differences.push('Pingdom repeat and disabled recovery-notice settings are not carried into contact routing. Review the notification policy before enabling.')
 if(tags?.length)differences.push('Pingdom tag names become monitor labels; tag type and source usage count carry no local routing authority.')
 return {definition:{name:check.name,...(tags===undefined?{}:{tags}),type:assertions.bodyIncludes||assertions.bodyExcludes?'keyword':'http',url:url.href,method:http.postdata?'POST':'GET',intervalMs:check.resolution*60000,freshnessMs:Math.min(86400000,Math.max(180000,check.resolution*180000)),timeoutMs:Math.max(10000,Math.min(60000,(slow?.thresholdMs??0)*2)),retries:0,confirmSlots:check.sendnotificationwhendown??2,recoverSlots:2,probes:['local-a'],enabled:check.status==='paused'?false:true,assertions,...(slow?{slow}:{}),...(hasSecrets?{request:{credentialRef}}:{}),...(http.encryption&&http.verify_certificate===false?{tlsTrust:{mode:'ignore',acknowledged:true}}:{})},differences}
}
