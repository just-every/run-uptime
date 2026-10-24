#!/usr/bin/env node
// All routing commands use the authenticated, audited product API. The cookie
// stays in the environment and is never placed in argv or output.
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
class RoutingCommandError extends Error {}
export async function main(argv=process.argv.slice(2),env=process.env,fetcher=fetch){
 const flags={};let command;
 for(let i=0;i<argv.length;i++){const arg=argv[i];if(arg==='--')continue;if(!arg.startsWith('--')){if(command)throw new RoutingCommandError('Use one routing command');command=arg;continue}const key=arg.slice(2),value=argv[++i];if(!['origin','monitor','input'].includes(key)||Object.hasOwn(flags,key)||!value||value.startsWith('--'))throw new RoutingCommandError('Use --origin, --monitor and --input once each');flags[key]=value}
 let origin;try{const url=new URL(flags.origin);if(url.username||url.password||url.pathname!=='/'||url.search||url.hash||!['https:','http:'].includes(url.protocol)||url.protocol==='http:'&&!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw Error();origin=url.origin}catch{throw new RoutingCommandError('Use the exact HTTPS app origin or loopback origin')}
 const cookie=env.UPTIME_ACCESS_COOKIE;if(typeof cookie!=='string'||!cookie||/[\r\n]/.test(cookie))throw new RoutingCommandError('UPTIME_ACCESS_COOKIE must hold a live Base session cookie')
 const commands={named:['GET','/api/routing/named-routes'],'name-route':['POST','/api/routing/named-routes'],'preview-batch':['POST','/api/catalog/routes/preview'],'apply-batch':['POST','/api/catalog/routes/apply'],'undo-batch':['POST','/api/catalog/routes/undo'],teams:['GET','/api/routing/teams'],'save-team':['POST','/api/routing/teams'],self:['GET','/api/routing/recipient'],consent:['POST','/api/routing/recipient'],route:['GET',''],preview:['POST','/preview'],apply:['POST','/apply'],sample:['POST','/sample']};
 if(!Object.hasOwn(commands,command))throw new RoutingCommandError('Use named, name-route, preview-batch, apply-batch, undo-batch, teams, save-team, self, consent, route, preview, apply or sample')
 let [method,path]=commands[command];if(['route','preview','apply','sample'].includes(command)){if(!flags.monitor)throw new RoutingCommandError('Use --monitor with the monitor ID');path='/api/monitors/'+encodeURIComponent(flags.monitor)+'/alert-route'+path}
 let body;if(method==='POST'){if(!flags.input)throw new RoutingCommandError('Use --input with a JSON file');try{body=JSON.parse(await readFile(flags.input,'utf8'));if(!body||typeof body!=='object'||Array.isArray(body))throw Error()}catch{throw new RoutingCommandError('Input must contain a JSON object')}}else if(flags.input)throw new RoutingCommandError('Read commands do not accept input')
 const response=await fetcher(origin+path,{method,redirect:'manual',headers:{origin,cookie,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});if(!response.ok)throw new RoutingCommandError(`Routing operation refused (HTTP ${response.status})`)
 return response.json()
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{console.log(JSON.stringify(await main(),null,2))}catch(error){console.error(error instanceof RoutingCommandError?error.message:'Routing operation failed');process.exitCode=1}}
