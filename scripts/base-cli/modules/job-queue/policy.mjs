import { createServer,createConnection } from 'node:net';
import { chmod,unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { identity,alive } from './identity.mjs';
import { descendantOf } from './membership.mjs';

async function inherited(value) {
 if(!value)return null;
 try {
  const claim=JSON.parse(value);
  if(!await alive(claim.owner)||!await descendantOf(claim.owner.pid))return null;
  return await new Promise((resolve,reject)=>{
   const socket=createConnection(claim.path);let text='';
   socket.setTimeout(3000,()=>socket.destroy(Error('Policy probe timed out')));
   socket.on('data',data=>{text+=data;if(text.length>4096)socket.destroy();});
   socket.on('error',reject);socket.on('end',()=>{try{const policy=JSON.parse(text);resolve(policy.token===claim.token?policy:null);}catch{resolve(null);}});
  });
 }catch{return null;}
}
export async function callerPolicy(env=process.env) {
 const value=env.RER_JOB_POLICY, policy=await inherited(value);
 if(policy)return {ci:policy.ci,environment:{RER_JOB_POLICY:value},close:async()=>{}};
 const lifetime=await identity(),token=randomUUID(),path=`/tmp/rer-policy-${token}.sock`;
 // An invalid inherited claim fails closed even when the child changes CI.
 const ci=!value&&env.CI==='true';
 const server=createServer(socket=>socket.end(JSON.stringify({token,ci})));
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(path,resolve);});await chmod(path,0o600);
 return {ci,environment:{RER_JOB_POLICY:JSON.stringify({path,token,owner:lifetime.info})},async close(){await new Promise(resolve=>server.close(resolve));await unlink(path).catch(error=>{if(error.code!=='ENOENT')throw error;});await lifetime.close();}};
}
