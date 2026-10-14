import {appendFile} from 'node:fs/promises';
import {readGrant} from './grants.mjs';
let reporter;
export const demoMode=()=>process.env.RER_DEMO==='1';
export const setDemoReporter=value=>{reporter=value;};
export async function demoRefusal(raw,method='GET'){
 let host='invalid';try{host=new URL(raw).host}catch{}
 const event={method,host};
 if(process.env.UPTIME_DEMO_LOG)await appendFile(process.env.UPTIME_DEMO_LOG,JSON.stringify({...event,at:Date.now()})+'\n',{mode:0o600}).catch(()=>{});
 // A failed control connection must not stop the independent watch's refusal.
 await reporter?.(event).catch(()=>{});
 return Object.assign(Error('Demo blocked outbound '+method+' '+host),{code:'demo_blocked'});
}
/** Before DNS or sockets: only the live custody grant, its exact paths and read-only methods. */
export async function assertDemoTarget(raw,{method='GET',grantPath=process.env.UPTIME_GRANT_FILE,controlPort=0,grant}={}){
 if(!demoMode())return;
 let url;try{url=new URL(raw);grant??=await readGrant(grantPath,controlPort)}catch{}
 if(!grant||!url||url.origin!==`http://127.0.0.1:${grant.port}`||url.username||url.password||url.search||url.hash||!grant.paths.includes(url.pathname)||!['GET','HEAD'].includes(method))throw await demoRefusal(raw,method);
 return grant;
}
/** Notifications and independent watches never use the synthetic target as a recipient. */
export async function blockDemoSend(raw,method='POST'){
 if(demoMode())throw await demoRefusal(raw,method);
}
