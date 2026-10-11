import http from 'node:http';
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { refuse } from './errors.mjs';
import { fontResponseHeaders } from './font-cache.mjs';

// The public listener observes transport lifetime without buffering or replacing
// application responses. Preserve Host, Origin, cookies, status and streaming.
export async function trafficProxy({host,port,target,activity}) {
 const probe=randomUUID(),sockets=new Set();
 const server=http.createServer((req,res)=>{
  const internal=req.headers['x-rer-probe']===probe;delete req.headers['x-rer-probe'];
  const finish=internal?()=>{}:activity.begin();
  let requestEnded=req.complete,responseEnded=false;
  const completed=()=>{if(requestEnded&&responseEnded)finish();};
  req.once('end',()=>{requestEnded=true;completed();});req.once('aborted',finish);
  res.once('close',()=>{responseEnded=true;if(req.destroyed)finish();else completed();});res.once('finish',()=>{responseEnded=true;completed();});
  const upstream=http.request({host:'127.0.0.1',port:target,path:req.url,method:req.method,headers:req.headers},reply=>{
   res.writeHead(reply.statusCode,fontResponseHeaders(req.url,reply.statusCode,reply.rawHeaders,req.headers));reply.pipe(res);
  });
  req.once('aborted',()=>upstream.destroy());res.once('close',()=>upstream.destroy());
  upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});req.pipe(upstream);
 });
 server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
 server.on('upgrade',(req,socket,head)=>{
  const hmr=String(req.headers['sec-websocket-protocol']??'').split(',').map(s=>s.trim()).includes('vite-hmr');
  const upstream=net.connect(target,'127.0.0.1',()=>{
   upstream.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n${req.rawHeaders.reduce((lines,value,i)=>i%2?lines:lines+value+': '+req.rawHeaders[i+1]+'\r\n','')}\r\n`);
   if(head.length)upstream.write(head);socket.pipe(upstream);upstream.pipe(socket);
  });
  if(!hmr){
   const observeSafely=observer=>chunk=>{try{observer(chunk);}catch{socket.destroy();upstream.destroy();}};
   const finish=activity.begin(),observe=observeSafely(frameObserver(()=>activity.touch())),replyFrames=observeSafely(frameObserver(()=>activity.touch()));
   let handshake=Buffer.alloc(0),upgraded=false;
   if(head.length)observe(head);socket.on('data',observe);socket.once('close',finish);
   upstream.on('data',chunk=>{
    if(upgraded){replyFrames(chunk);return;}
    handshake=Buffer.concat([handshake,chunk]);const end=handshake.indexOf('\r\n\r\n');
    if(end<0){if(handshake.length>65536)upstream.destroy();return;}
    upgraded=/^HTTP\/1\.[01] 101 /.test(handshake.toString('latin1',0,end));
    if(upgraded)replyFrames(handshake.subarray(end+4));else finish();handshake=Buffer.alloc(0);
   });
  }
  upstream.on('error',()=>socket.destroy());socket.on('error',()=>upstream.destroy());socket.on('close',()=>upstream.destroy());upstream.on('close',()=>socket.destroy());
 });
 try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});}
 catch(error){
  if(['EADDRINUSE','EACCES'].includes(error.code))throw refuse(`Requested port ${port} is unavailable. Stop its owner or choose an explicit free port; rer does not drift.`);
  throw error;
 }
 return {probe,port:server.address().port,async close(){for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));}};
}
// Count application data frames, not protocol ping/pong or an open control
// socket. Parse lengths incrementally without retaining application payloads.
export function frameObserver(touch) {
 let buffer=Buffer.alloc(0),remaining=0;
 return chunk=>{
  buffer=Buffer.concat([buffer,chunk]);
  for(;;){
   if(remaining){const count=Math.min(remaining,buffer.length);remaining-=count;buffer=buffer.subarray(count);if(remaining)return;}
   if(buffer.length<2)return;
   const opcode=buffer[0]&15,masked=Boolean(buffer[1]&128);let length=buffer[1]&127,offset=2;
   if(length===126){if(buffer.length<4)return;length=buffer.readUInt16BE(2);offset=4;}
   else if(length===127){if(buffer.length<10)return;const big=buffer.readBigUInt64BE(2);if(big>BigInt(Number.MAX_SAFE_INTEGER))throw Error('WebSocket frame too large');length=Number(big);offset=10;}
   if(masked)offset+=4;if(buffer.length<offset)return;
   if(opcode<=2)touch();buffer=buffer.subarray(offset);remaining=length;
   if(!remaining&&!buffer.length)return;
  }
 };
}
