#!/usr/bin/env node
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
class KeyCommandError extends Error {}
export async function main(argv=process.argv.slice(2),env=process.env,fetcher=fetch,input){
 const flags={};let command;
 for(let i=0;i<argv.length;i++){const value=argv[i];if(value==='--')continue;if(!value.startsWith('--')){if(command)throw new KeyCommandError('Use one key command');command=value;continue}const name=value.slice(2),next=argv[++i];if(!['origin','id'].includes(name)||!next||next.startsWith('--')||Object.hasOwn(flags,name))throw new KeyCommandError('Unknown, repeated or incomplete option');flags[name]=next}
 let origin;try{const url=new URL(flags.origin);if(url.username||url.password||url.pathname!=='/'||url.search||url.hash||!['https:','http:'].includes(url.protocol)||url.protocol==='http:'&&!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw Error();origin=url.origin}catch{throw new KeyCommandError('Use --origin with the exact HTTPS app origin or local loopback origin')}
 const cookie=env.UPTIME_ACCESS_COOKIE;if(typeof cookie!=='string'||!cookie||/[\r\n]/.test(cookie))throw new KeyCommandError('UPTIME_ACCESS_COOKIE must hold a live native Base session cookie');
 let method='GET',path='/api/credentials';
 if(command==='create'){method='POST';if(!input||typeof input!=='object'||Array.isArray(input))throw new KeyCommandError('Supply the key specification JSON on standard input')}
 else if(command==='revoke'){method='DELETE';if(!flags.id)throw new KeyCommandError('Use --id with the credential ID');path+='/'+encodeURIComponent(flags.id)}
 else if(command!=='list')throw new KeyCommandError('Use list, create or revoke');
 const response=await fetcher(origin+path,{method,redirect:'manual',headers:{origin,cookie,'content-type':'application/json'},...(command==='create'?{body:JSON.stringify(input)}:{})});
 if(!response.ok)throw new KeyCommandError(`Credential operation refused (HTTP ${response.status})`);return response.json();
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{let input;if(process.argv.includes('create')){let text='';for await(const chunk of process.stdin){text+=chunk;if(Buffer.byteLength(text)>131072)throw new KeyCommandError('Key specification is too large')}try{input=JSON.parse(text)}catch{throw new KeyCommandError('Supply valid JSON on standard input')}}console.log(JSON.stringify(await main(undefined,undefined,undefined,input),null,2))}catch(error){console.error(error instanceof KeyCommandError?error.message:'Credential operation failed');process.exitCode=1}
}
