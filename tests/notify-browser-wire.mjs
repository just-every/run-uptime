import assert from 'node:assert/strict';
import {createHmac,timingSafeEqual,randomBytes} from 'node:crypto';
import {createServer} from 'node:http';
import {availablePorts} from './notify-acceptance-runtime.mjs';
import {runRunner} from '../runners/src/private-runner.mjs';
export function notificationMailFake(){
 const records=[],authMessages=[];
 return {records,authMessages,outboundService:async request=>{
  assert.equal(request.url,'https://api.sendgrid.com/v3/mail/send','only Base SendGrid outbound is allowed');
  assert.equal(request.method,'POST');
  const body=await request.json();
  if(body.personalizations[0].to[0]?.email==='operator@example.test'){authMessages.push(body);return new Response(null,{status:202})}
  assert.deepEqual(body.personalizations[0].to,[{email:'qa-inbox@example.test'}]);
  assert.ok(body.custom_args.rer_delivery_id,'Base sends delivery correlation');
  assert.deepEqual(body.tracking_settings.click_tracking,{enable:false,enable_text:false});
  assert.equal(body.tracking_settings.open_tracking.enable,false);
  records.push(body);
  return new Response(null,{status:202,headers:{'x-message-id':'local-browser-mail'}});
 }};
}
export async function notificationWireFake(){
 let signingSecret='',mode='accepted';const records=[];
 const webhook='https://notifications.example.com/receive';
 const slack='https://hooks.slack.com/services/'+[0,1,2].map(()=>randomBytes(8).toString('hex')).join('/');
 const errors=[];
 const server=createServer(async(req,res)=>{try{
  const parts=[];for await(const part of req)parts.push(part);
  const raw=Buffer.concat(parts),body=JSON.parse(raw.toString());
  if(req.url==='/webhook'){
   const timestamp=req.headers['x-lamp-timestamp'];
   assert.ok(timestamp,'real webhook timestamp present');
   const actual=Buffer.from(req.headers['x-lamp-signature']??'');
   const expected=Buffer.from(createHmac('sha256',signingSecret).update(timestamp+'.').update(raw).digest('base64url'));
   assert.ok(actual.length===expected.length&&timingSafeEqual(actual,expected),'real webhook signature verifies');
  }else{
   assert.equal(req.url,'/slack');assert.equal(body.mrkdwn,false);assert.equal(body.unfurl_links,false);assert.equal(body.unfurl_media,false);
  }
  records.push({kind:req.url,eventType:body.eventType});
  if(mode==='uncertain'){req.socket.destroy();return}
  res.writeHead(mode==='rejected'?400:200,{'content-type':'text/plain'});res.end(mode==='rejected'?'invalid_payload':'ok');
 }catch(error){errors.push(error);res.writeHead(422);res.end('Invalid test wire')} });
 const [port]=await availablePorts(1);
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve)});

 class TESTTrustedTransport {async send(wire){
  assert.ok(wire.url===webhook||wire.url===slack,'injected transport accepts only exact test destinations');
  const response=await fetch(`http://127.0.0.1:${port}${wire.url===webhook?'/webhook':'/slack'}`,{method:'POST',headers:wire.headers,body:wire.body,redirect:'error',signal:AbortSignal.timeout(3000)});
  return {status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()};
 }}
 const transport=new TESTTrustedTransport();
 return {webhook,slack,records,setSecret(secret){assert.ok(secret!==signingSecret,'rotation generates a different one-time secret');signingSecret=secret},setMode(next){mode=next},async dispatch(origin,key,grantPath){
  await runRunner({origin,key,grantPath,localReview:true,transport,once:true});
  assert.equal(errors.length,0,errors[0]?.message);
 },async close(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}};
}
