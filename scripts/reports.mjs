#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
class ReportCommandError extends Error {}
export async function main(argv=process.argv.slice(2),env=process.env,fetcher=fetch){
 const [command,...rest]=argv,flags={};
 for(let i=0;i<rest.length;i+=2){const key=rest[i]?.slice(2),value=rest[i+1];if(!rest[i]?.startsWith('--')||!['origin','monitor','input','id'].includes(key)||!value||Object.hasOwn(flags,key))throw new ReportCommandError('Use schedule --origin ORIGIN --monitor ID --input FILE, or list/show with --id');flags[key]=value}
 let origin;try{const url=new URL(flags.origin);if(url.username||url.password||url.pathname!=='/'||url.search||url.hash||!['https:','http:'].includes(url.protocol)||url.protocol==='http:'&&!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw Error();origin=url.origin}catch{throw new ReportCommandError('Use the exact HTTPS app origin or local loopback origin')}
 if(!flags.monitor||!['schedule','list','show','cancel'].includes(command)||['show','cancel'].includes(command)&&!flags.id)throw new ReportCommandError('Use schedule, list, show or cancel with --monitor')
 const cookie=env.UPTIME_REPORT_COOKIE;if(!cookie||/[\r\n]/.test(cookie))throw new ReportCommandError('UPTIME_REPORT_COOKIE must hold a live Base owner session')
 const body=command==='schedule'?await readFile(flags.input,'utf8'):undefined;
 const response=await fetcher(origin+'/api/monitors/'+encodeURIComponent(flags.monitor)+'/report-schedules'+(['show','cancel'].includes(command)?'/'+encodeURIComponent(flags.id):''),{method:command==='cancel'?'DELETE':body?'POST':'GET',redirect:'manual',headers:{origin,cookie,'content-type':'application/json'},...(body?{body}:{})});
 if(!response.ok)throw new ReportCommandError(`Report operation refused (HTTP ${response.status})`);return response.json()
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{console.log(JSON.stringify(await main(),null,2))}catch(error){console.error(error instanceof ReportCommandError?error.message:'Report operation failed');process.exitCode=1}}
