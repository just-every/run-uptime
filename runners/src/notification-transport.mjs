import https from 'node:https';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {checkServerIdentity} from 'node:tls';
import {isPublicAddress,validateDestination} from '../../src/base/modules/integrations/core/destination.ts';
/** Edition webhook methods over the same strict boundary as Base delivery:
 * validate every DNS answer, pin a numeric socket, verify the original TLS
 * identity, bypass proxies, never follow redirects and bound the entire send. */
export class NotificationTransport {
  async send(wire) {
    const url=validateDestination(wire.url),method=wire.method??'POST',body=wire.body??'';
    if(!['GET','POST','PUT','PATCH'].includes(method)||typeof body!=='string'||Buffer.byteLength(body)>65536||method==='GET'&&body!=='')throw Error('Invalid webhook request');
    for(const name of Object.keys(wire.headers))if(/^(host|connection|transfer-encoding|content-length|proxy-authorization)$/i.test(name))throw Error('Forbidden transport header');
    const host=url.hostname.replace(/^\[|\]$/g,''),signal=AbortSignal.timeout(15000);
    let stop;
    const addresses=isIP(host)?[{address:host,family:isIP(host)}]:await Promise.race([
      lookup(host,{all:true,verbatim:true}),
      new Promise((_,reject)=>{stop=()=>reject(Error('Webhook DNS unavailable'));signal.addEventListener('abort',stop,{once:true});}),
    ]).finally(()=>{if(stop)signal.removeEventListener('abort',stop)});
    signal.throwIfAborted();
    if(!addresses.length||addresses.some(value=>!isPublicAddress(value.address)||isIP(value.address)!==value.family))throw Error('Webhook DNS is not public');
    const pin=addresses[0];
    return new Promise((resolve,reject)=>{
      let settled=false,size=0;const chunks=[];
      const agent=new https.Agent({keepAlive:false,proxyEnv:{},maxCachedSessions:0});
      const req=https.request({protocol:'https:',hostname:pin.address,port:url.port||443,path:url.pathname+url.search,method,agent,signal,maxHeaderSize:16384,
        servername:isIP(host)?'':host,rejectUnauthorized:true,checkServerIdentity:(_hostname,certificate)=>checkServerIdentity(host,certificate),
        headers:{...wire.headers,host:url.host,...(method==='GET'?{}:{'content-length':Buffer.byteLength(body)})}},response=>{
        response.on('data',chunk=>{if(settled)return;size+=chunk.length;if(size>65536){fail();response.destroy()}else chunks.push(chunk)});
        response.on('end',()=>{if(!settled){settled=true;resolve({status:response.statusCode,headers:response.headers,body:Buffer.concat(chunks).toString('utf8')})}});
        response.on('error',fail);response.on('aborted',fail);response.on('close',()=>{if(!response.complete)fail()});
      });
      function fail(){if(!settled){settled=true;req.destroy();reject(Error('Webhook response unavailable'))}}
      req.on('error',fail);req.on('close',()=>agent.destroy());req.end(method==='GET'?undefined:body);
    });
  }
}
