#!/usr/bin/env node
// Member administration uses the app's public doors and a live Base session.
// The session is read only from the environment, never argv, files or output.
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
class AccessCommandError extends Error {}
export async function main(argv=process.argv.slice(2),env=process.env,fetcher=fetch){
 const flags={},scopes=[];let command
 for(let i=0;i<argv.length;i++){
  const value=argv[i]
  if(value==='--')continue
  if(!value.startsWith('--')){if(command)throw new AccessCommandError('Use one access command');command=value;continue}
  const name=value.slice(2),next=argv[++i]
  if(!next||next.startsWith('--'))throw new AccessCommandError('Every option requires a value')
  if(name==='scope'){const colon=next.indexOf(':');scopes.push({kind:next.slice(0,colon),value:next.slice(colon+1)});continue}
  if(!['origin','id','role','email','name','workspace'].includes(name)||Object.hasOwn(flags,name))throw new AccessCommandError('Unknown or repeated option')
  flags[name]=next
 }
 let origin;try{const url=new URL(flags.origin);if(url.username||url.password||url.pathname!=='/'||url.search||url.hash||!['https:','http:'].includes(url.protocol)||url.protocol==='http:'&&!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw new AccessCommandError();origin=url.origin}catch{throw new AccessCommandError('Use --origin with the exact HTTPS app origin or local loopback origin')}
 const cookie=env.UPTIME_ACCESS_COOKIE
 if(typeof cookie!=='string'||!cookie||/[\r\n]/.test(cookie))throw new AccessCommandError('UPTIME_ACCESS_COOKIE must hold a live Base session cookie')
 let method='GET',path,body
 if(command==='list')path='/api/access/members'
 else if(command==='self')path='/api/access/self'
 else if(command==='invite'){method='POST';path='/api/access/invitations';body={email:flags.email,displayName:flags.name,role:flags.role,scopes}}
 else if(command==='role'){method='POST';path='/api/access/members/'+encodeURIComponent(flags.id??'');body={role:flags.role,...(scopes.length||flags.workspace==='true'?{scopes}:{})}}
 else if(command==='remove'){method='DELETE';path='/api/access/members/'+encodeURIComponent(flags.id??'')}
 else if(command==='cancel'){method='POST';path='/auth/invite/cancel';body={operatorId:flags.id}}
 else if(command==='activate'){method='POST';path='/auth/operator/status';body={operatorId:flags.id,status:'active'}}
 else throw new AccessCommandError('Use list, self, invite, role, remove, cancel or activate')
 if(['role','remove','cancel','activate'].includes(command)&&!flags.id)throw new AccessCommandError('Use --id with a live Base operator ID')
 const response=await fetcher(origin+path,{method,redirect:'manual',headers:{origin,cookie,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})})
 // Never print arbitrary response text: sign-in redirects, provider messages and
 // transport exceptions could carry credentials. Report only bounded metadata.
 if(!response.ok)throw new AccessCommandError(`Access operation refused (HTTP ${response.status})`)
 const value=response.status===204?{ok:true}:await response.json()
 if(command==='invite')return {status:value.status}
 const safe=person=>({id:person.id??person.operatorId,displayName:person.displayName,role:person.productRole??person.role,status:person.status,scopes:person.scopes,assignmentCurrent:person.assignmentCurrent})
 return Array.isArray(value)?value.map(safe):safe(value)
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{console.log(JSON.stringify(await main(),null,2))}catch(error){console.error(error instanceof AccessCommandError?error.message:'Access operation failed');process.exitCode=1}
}
