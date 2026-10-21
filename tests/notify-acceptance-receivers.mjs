import assert from 'node:assert/strict';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {verifyWebhook} from '../src/base/modules/integrations/core/webhook.ts';
import {validateSlackMessage} from '../src/base/modules/integrations/slack/message.ts';

// These receivers observe production wire bytes. They never construct a product
// delivery, update product state, or return a manufactured production receipt.
export async function acceptanceReceiver(port,inspect){
 const records=[],errors=[],stalled=new Set();let disposition='accepted';
 const server=createServer(async(req,res)=>{
  try{
   const chunks=[];for await(const chunk of req)chunks.push(chunk);
   const raw=Buffer.concat(chunks),headers=new Headers();
   for(const [name,value]of Object.entries(req.headers))if(value!==undefined)headers.set(name,Array.isArray(value)?value.join(', '):value);
   const record={raw,headers,body:JSON.parse(raw.toString('utf8')),path:req.url,receivedAt:performance.now()};
   await inspect(record);records.push(record);
   if(disposition==='lost'){req.socket.destroy();return}
   if(disposition==='stalled'){
    // Hold validated production bytes past the client deadline; the later safety bound only prevents leaked test sockets.
    record.stalled=true;record.safetyTimeout=false;stalled.add(res);
    const timer=setTimeout(()=>{record.safetyTimeout=true;res.destroy()},30000);timer.unref();
    res.once('close',()=>{clearTimeout(timer);stalled.delete(res)});return;
   }
   const slack=req.url==='/slack';
   res.writeHead(disposition==='accepted'?(slack?200:202):disposition==='rejected'?400:disposition==='rate_limited'?429:500,{'content-type':slack?'text/plain':'application/json',...(disposition==='rate_limited'?{'retry-after':'1'}:{})});
   res.end(slack?(disposition==='accepted'?'ok':disposition==='rejected'?'invalid_payload':'fatal_error'):JSON.stringify({ok:disposition==='accepted'}));
  }catch(error){errors.push(error);res.writeHead(422);res.end('invalid wire')}
 });
 server.listen(port,'127.0.0.1');await once(server,'listening');
 return {records,errors,setDisposition(value){assert.ok(['accepted','rejected','failed','lost','stalled','rate_limited'].includes(value));disposition=value},releaseStalled(){for(const response of stalled)response.destroy()},assertValid(){assert.equal(errors.length,0,errors[0]?.message)},async close(){for(const response of stalled)response.destroy();server.closeAllConnections();await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()))}};
}

export function verifySendGrid(record){
 assert.equal(record.path,'/v3/mail/send');
 assert.equal(record.headers.get('content-type'),'application/json');
 const body=record.body;
 assert.deepEqual(body.personalizations[0].to,[{email:'qa-inbox@example.test'}]);
 assert.ok(body.custom_args.rer_delivery_id,'Base mail retains delivery correlation');
 assert.deepEqual(body.tracking_settings.click_tracking,{enable:false,enable_text:false});
 assert.equal(body.tracking_settings.open_tracking.enable,false);
 const html=body.content.find(item=>item.type==='text/html')?.value;
 assert.ok(html,'actual Base mail includes the incident HTML');
 assert.ok(!html.includes('<script>'),'monitor HTML cannot become an active element');
 if(body.subject.includes('<script>'))assert.ok(html.includes('&lt;script&gt;'),'monitor HTML remains visible escaped text');
}

export function signedReceiverVerifier({secret,tenant,destinationId}){
 return async record=>{
  await verifyWebhook({body:new Uint8Array(record.raw),headers:record.headers,key:new TextEncoder().encode(secret),tenant,destinationId:typeof destinationId==='function'?destinationId():destinationId});
  const timestamp=record.headers.get('x-lamp-timestamp');
  assert.equal(new Date(timestamp).toISOString(),timestamp,'Lamp timestamp is exact ISO text');
  assert.ok(Math.abs(Date.now()-Date.parse(timestamp))<300000,'Lamp timestamp is fresh');
  const expected=createHmac('sha256',Buffer.from(secret,'utf8')).update(timestamp+'.').update(record.raw).digest('base64url');
  const actual=record.headers.get('x-lamp-signature')??'';
  assert.equal(actual.length,expected.length,'Lamp signature length');
  assert.ok(timingSafeEqual(Buffer.from(actual),Buffer.from(expected)),'independent Node HMAC accepts original UTF8 wire bytes');
 };
}

export function verifySlack(record){
 validateSlackMessage(record.body);
 assert.equal(record.body.mrkdwn,false);
 assert.equal(record.body.unfurl_links,false);
 assert.equal(record.body.unfurl_media,false);
 assert.ok(!record.body.text.includes('<!channel>'),'Slack monitor text cannot page a channel');
 assert.ok(!record.body.text.includes('<script>'),'Slack raw markup cannot escape');
 if(record.body.text.includes('channel'))assert.ok(record.body.text.includes('&lt;!channel&gt;'),'Slack retains the inert monitor name');
}

// Only exact reviewed HTTPS wire destinations can reach owned loopback ports.
// This test boundary is injected into the real runner; production has no switch.
export function loopbackWireTransport(routes){
 // Require a real three-second stall with timer-resolution margin, without relaxing the elapsed-time assertion.
 const timeoutMs=3500,timeouts=[];
 return {timeouts,async send(wire,beforeRequest){await beforeRequest();
  const route=routes.get(wire.url);assert.ok(route,'unapproved wire destination');
  const startedAt=performance.now(),signal=AbortSignal.timeout(timeoutMs);
  try{
   const response=await fetch(`http://127.0.0.1:${route.port}${route.path}`,{method:'POST',headers:wire.headers,body:wire.body,redirect:'error',signal});
   return {status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()};
  }catch(error){if(signal.aborted&&signal.reason?.name==='TimeoutError')timeouts.push({elapsedMs:performance.now()-startedAt});throw error}
 }};
}
