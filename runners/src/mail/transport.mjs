import {resolveDiagnosticPin,measurePhase} from '../network-phase-capture.mjs';
import net from 'node:net';
import tls from 'node:tls';
import {resolvePublic} from '../public-http.mjs';
import {mailOrigin} from '../../../src/domain/mail-probe/schema.mjs';
import {MAIL_ERROR_CATEGORIES} from '../../../src/domain/mail-probe/evaluate.mjs';

export class MailError extends Error{constructor(category){super(category);this.category=category}}
export function mailError(error,signal){
 if(error instanceof MailError)return error;
 if(signal?.aborted)return new MailError('timeout');
 if(error?.category)return new MailError(MAIL_ERROR_CATEGORIES.includes(error.category)?error.category:'runner');
 if(error?.code==='ECONNREFUSED')return new MailError('refused');
 if(/^ERR_(TLS|SSL)|^CERT_|SELF_SIGNED|UNABLE_TO_(VERIFY|GET_ISSUER)|^DEPTH_ZERO/.test(String(error?.code))||error?.code==='EPROTO')return new MailError('tls');
 return new MailError('connection');
}
export class MailChannel{
 constructor(socket,signal,budget={receivedBytes:0}){
  this.socket=socket;this.signal=signal;this.budget=budget;this.buffer=Buffer.alloc(0);this.failure=null;this.wake=null;
  this.data=chunk=>{budget.receivedBytes+=chunk.length;if(budget.receivedBytes>4194304||this.buffer.length+chunk.length>1048576){this.failure=new MailError('response_limit');socket.destroy()}else this.buffer=Buffer.concat([this.buffer,chunk]);this.wake?.()};
  this.error=error=>{this.failure=mailError(error,this.signal);this.wake?.()};
  this.end=()=>{this.failure??=new MailError('connection');this.wake?.()};
  socket.on('data',this.data);socket.on('error',this.error);socket.on('end',this.end);socket.on('close',this.end);
 }
 detach(){for(const [event,listener]of [['data',this.data],['error',this.error],['end',this.end],['close',this.end]])this.socket.off(event,listener)}
 async line(){
  for(;;){
   if(this.signal.aborted)throw new MailError('timeout');
   const i=this.buffer.indexOf('\r\n');
   if(i>=0){if(i>16384)throw new MailError('response_limit');const value=this.buffer.subarray(0,i).toString('utf8');this.buffer=this.buffer.subarray(i+2);return value}
   if(this.buffer.length>16384)throw new MailError('response_limit');
   if(this.failure)throw this.failure;
   await new Promise(resolve=>{const done=()=>{this.signal.removeEventListener('abort',done);this.wake=null;resolve()};this.wake=done;this.signal.addEventListener('abort',done,{once:true});if(this.signal.aborted)done()});
  }
 }
 async readBytes(length){
  if(length>8192)throw new MailError('response_limit');
  while(this.buffer.length<length){
   if(this.signal.aborted)throw new MailError('timeout');if(this.failure)throw this.failure;
   await new Promise(resolve=>{const done=()=>{this.signal.removeEventListener('abort',done);this.wake=null;resolve()};this.wake=done;this.signal.addEventListener('abort',done,{once:true});if(this.signal.aborted)done()});
  }
  const value=this.buffer.subarray(0,length);this.buffer=this.buffer.subarray(length);return value;
 }
 write(text){if(this.signal.aborted)throw new MailError('timeout');if(this.failure)throw this.failure;this.socket.write(text+'\r\n')}
 destroy(){this.socket.destroy()}
}
function opened(socket,event,signal){
 return new Promise((resolve,reject)=>{
  const finish=(fn,value)=>{socket.off(event,ok);socket.off('error',bad);socket.off('close',closed);signal.removeEventListener('abort',abort);fn(value)};
  const ok=()=>finish(resolve),bad=error=>finish(reject,mailError(error,signal)),closed=()=>finish(reject,new MailError(event==='secureConnect'?'tls':'connection')),abort=()=>{finish(reject,new MailError('timeout'));socket.destroy()};
  socket.once(event,ok);socket.once('error',bad);socket.once('close',closed);signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
 });
}
export async function connectMail(settings,signal,privateAccess,budget,capture){
 const url=new URL(mailOrigin(settings));
 const pin=await resolveDiagnosticPin(capture,url,signal,undefined,privateAccess);
 if(signal.aborted)throw new MailError('timeout');
 const socket=net.connect({host:pin.address,port:settings.port,family:pin.family});
 const channel=new MailChannel(socket,signal,budget);
 try{await measurePhase(capture,'connectMs',()=>opened(socket,'connect',signal));return {channel,address:pin.address}}catch(error){channel.destroy();throw error}
}
export async function secureMail(channel,settings,capture){
 // Never consume unsolicited bytes as a TLS record, or pass pre-upgrade protocol bytes through to authentication.
 if(channel.buffer.length)throw new MailError('protocol');
 const previous=channel.socket,signal=channel.signal;channel.detach();
 const socket=tls.connect({socket:previous,servername:net.isIP(settings.host)?undefined:settings.host,rejectUnauthorized:true,checkServerIdentity:(_,cert)=>tls.checkServerIdentity(settings.host,cert)});
 const secure=new MailChannel(socket,signal,channel.budget);
 try{await measurePhase(capture,'tlsMs',()=>opened(socket,'secureConnect',signal));if(!socket.authorized)throw new MailError('tls');return secure}catch(error){secure.destroy();throw mailError(error,signal)}
}
