// Reads a server's certificate chain where the runtime's TLS stack does not expose it (the Cloudflare Worker's sockets):
// a TLS 1.2 ClientHello over a plain TCP socket, then the server's Certificate message, which TLS 1.2 sends unencrypted.
// The handshake is never completed and no application data is sent. A server that only speaks TLS 1.3 encrypts its
// certificates, so it answers with an alert; the caller reports that this vantage cannot read the certificate.
const SUITES=[0xc02b,0xc02f,0xc02c,0xc030,0xcca9,0xcca8,0xc009,0xc013,0xc00a,0xc014,0x009c,0x009d,0x002f,0x0035];
const GROUPS=[0x001d,0x0017,0x0018];
const SIGNATURES=[0x0403,0x0804,0x0401,0x0503,0x0805,0x0501,0x0806,0x0601,0x0201];
const u16=n=>[n>>8&255,n&255],u24=n=>[n>>16&255,n>>8&255,n&255];
const vector16=bytes=>[...u16(bytes.length),...bytes];
const extension=(type,body)=>[...u16(type),...vector16(body)];
export function clientHello(serverName){
 const random=crypto.getRandomValues(new Uint8Array(32)),name=new TextEncoder().encode(serverName);
 const extensions=[
  ...(serverName?extension(0,vector16([0,...u16(name.length),...name])):[]),
  ...extension(10,vector16(GROUPS.flatMap(u16))),
  ...extension(11,[1,0]),
  ...extension(13,vector16(SIGNATURES.flatMap(u16))),
  ...extension(0xff01,[0]),
 ];
 const body=[3,3,...random,0,...vector16(SUITES.flatMap(u16)),1,0,...vector16(extensions)];
 const handshake=[1,...u24(body.length),...body];
 return new Uint8Array([22,3,1,...u16(handshake.length),...handshake]);
}
export const ALERTS={40:'handshake failure',42:'bad certificate',47:'illegal parameter',70:'protocol version',71:'insufficient security',80:'internal error',112:'unrecognized name'};
export class HandshakeError extends Error{constructor(kind,reason){super(reason);this.kind=kind}}
/** Reads records from `reader` until the Certificate message; returns each certificate's DER bytes, leaf first. */
export async function readCertificates(reader,{maxBytes=65536}={}){
 let buffer=new Uint8Array(0),handshake=new Uint8Array(0);
 const append=(a,b)=>{const out=new Uint8Array(a.length+b.length);out.set(a);out.set(b,a.length);return out};
 for(;;){
  while(buffer.length>=5){
   const type=buffer[0],length=buffer[3]<<8|buffer[4];
   if(buffer[1]!==3)throw new HandshakeError('protocol','The server did not answer with TLS');
   if(buffer.length<5+length)break;
   const fragment=buffer.subarray(5,5+length);buffer=buffer.subarray(5+length);
   if(type===21)throw new HandshakeError('alert',`The server refused a TLS 1.2 handshake (alert: ${ALERTS[fragment[1]]??`code ${fragment[1]}`})`);
   if(type!==22)throw new HandshakeError('protocol','Unexpected TLS record before the certificate');
   handshake=append(handshake,fragment);
   while(handshake.length>=4){
    const kind=handshake[0],size=handshake[1]<<16|handshake[2]<<8|handshake[3];
    if(handshake.length<4+size)break;
    const message=handshake.subarray(4,4+size);handshake=handshake.subarray(4+size);
    if(kind===2&&!(message[0]===3&&message[1]===3))throw new HandshakeError('protocol','The server did not negotiate TLS 1.2');
    if(kind===11){
     const list=[];let at=3;const total=message[0]<<16|message[1]<<8|message[2];
     while(at<3+total&&list.length<10){const n=message[at]<<16|message[at+1]<<8|message[at+2];list.push(message.slice(at+3,at+3+n));at+=3+n}
     if(!list.length)throw new HandshakeError('protocol','The server sent no certificate');
     return list;
    }
    if(kind===14)throw new HandshakeError('protocol','The server finished its hello without a certificate');
   }
  }
  const {value,done}=await reader.read();
  if(done)throw new HandshakeError('closed','The server closed the connection during the TLS handshake');
  buffer=append(buffer,value);
  if(buffer.length+handshake.length>maxBytes)throw new HandshakeError('protocol','The TLS handshake exceeded its size limit');
 }
}
