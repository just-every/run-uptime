#!/usr/bin/env node
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
class IncidentCommandError extends Error {}
// Comment/root-cause JSON arrives on stdin; native session authority only in env.
export async function main(argv=process.argv.slice(2),env=process.env,fetcher=fetch,input){
 const flags={};let command;
 for(let i=0;i<argv.length;i++){
  const value=argv[i];if(value==='--')continue;
  if(!value.startsWith('--')){if(command)throw new IncidentCommandError('Use one incident command');command=value;continue}
  const name=value.slice(2),next=argv[++i];
  if(!['origin','id','comment','version','query'].includes(name)||!next||next.startsWith('--')||Object.hasOwn(flags,name))throw new IncidentCommandError('Unknown, repeated or incomplete option');flags[name]=next;
 }
 let origin;try{const url=new URL(flags.origin);if(url.username||url.password||url.pathname!=='/'||url.search||url.hash||!['https:','http:'].includes(url.protocol)||url.protocol==='http:'&&!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw Error();origin=url.origin}catch{throw new IncidentCommandError('Use --origin with the exact HTTPS app origin or local loopback origin')}
 if(!flags.id)throw new IncidentCommandError('Use --id with an incident ID');
 const cookie=env.UPTIME_ACCESS_COOKIE;if(typeof cookie!=='string'||!cookie||/[\r\n]/.test(cookie))throw new IncidentCommandError('UPTIME_ACCESS_COOKIE must hold a live Base session cookie');
 let path='/api/incidents/'+encodeURIComponent(flags.id),method='GET',body;
 if(command==='members')path+='/mention-members?q='+encodeURIComponent(flags.query??'');
 else if(command==='comment'){path+='/comments';method='POST';body=input}
 else if(command==='edit'||command==='delete'){
  if(!flags.comment)throw new IncidentCommandError('Use --comment with a comment ID');path+='/comments/'+encodeURIComponent(flags.comment);method=command==='edit'?'PATCH':'DELETE';
  if(command==='edit')body=input;
  else {if(!/^[1-9]\d*$/.test(flags.version??''))throw new IncidentCommandError('Use --version with the current comment version');path+='?version='+flags.version}
 }else if(command==='root-cause'){path+='/root-cause';method='PATCH';body=input}
 else if(command!=='read')throw new IncidentCommandError('Use read, members, comment, edit, delete or root-cause');
 if(['POST','PATCH'].includes(method)&&(!body||typeof body!=='object'||Array.isArray(body)))throw new IncidentCommandError('Supply the operation JSON on standard input');
 const response=await fetcher(origin+path,{method,redirect:'manual',headers:{origin,cookie,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 if(!response.ok)throw new IncidentCommandError(`Incident operation refused (HTTP ${response.status})`);
 return response.json();
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  let input;if(process.argv.slice(2).some(value=>['comment','edit','root-cause'].includes(value))){let text='';for await(const chunk of process.stdin){text+=chunk;if(Buffer.byteLength(text)>32768)throw new IncidentCommandError('Input exceeds the operation limit')}try{input=JSON.parse(text)}catch{throw new IncidentCommandError('Supply valid JSON on standard input')}}
  console.log(JSON.stringify(await main(undefined,undefined,undefined,input),null,2));
 }catch(error){console.error(error instanceof IncidentCommandError?error.message:'Incident operation failed');process.exitCode=1}
}
