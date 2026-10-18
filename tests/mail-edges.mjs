// Authorized network edges only. Production uses the native mail engine and real TCP/TLS sockets.
import net from 'node:net';
import tls from 'node:tls';
import {once} from 'node:events';
export async function mailEdges(tlsOptions){
 const state={username:'synthetic-user',password:'planted-private-password',rejectAuth:false,receiptDelayMs:0,dropReceipt:false,rejectCleanup:false,commands:[],accepted:[],removed:[],messages:[],nextUid:1};
 const sockets=new Set(),servers=[];
 function track(socket){sockets.add(socket);socket.on('error',()=>{});socket.on('close',()=>sockets.delete(socket))}
 function lines(socket,handler){let buffer='';const data=chunk=>{buffer+=chunk.toString();for(;;){const i=buffer.indexOf('\r\n');if(i<0)break;const line=buffer.slice(0,i);buffer=buffer.slice(i+2);handler(line)}};socket.on('data',data);return()=>socket.off('data',data)}
 const alive=()=>state.messages.filter(m=>!m.deleted&&m.availableAt<=Date.now());
 function smtp(socket,secure=false){
  track(socket);let body=null;socket.write('220 fixture ESMTP\r\n');
  const detach=lines(socket,line=>{
   if(body){if(line!=='.'){body.push(line);return}const text=body.join('\r\n'),messageId=/^Message-ID: (.+)$/mi.exec(text)?.[1];state.accepted.push(messageId);if(!state.dropReceipt)state.messages.push({uid:state.nextUid++,messageId,availableAt:Date.now()+state.receiptDelayMs,deleted:false});body=null;socket.write('250 queued\r\n');return}
   const command=line.split(' ')[0].toUpperCase();state.commands.push(command);
   if(command==='EHLO')socket.write(`250-fixture\r\n250-${secure?'AUTH PLAIN LOGIN':'STARTTLS'}\r\n250 OK\r\n`);
   else if(command==='STARTTLS'){socket.write('220 TLS ready\r\n');detach();const encrypted=new tls.TLSSocket(socket,{isServer:true,secureContext:tls.createSecureContext(tlsOptions)});smtpAfterUpgrade(encrypted)}
   else if(command==='AUTH'){const parts=Buffer.from(line.split(' ')[2]??'','base64').toString().split('\0');socket.write(state.rejectAuth||parts[1]!==state.username||parts[2]!==state.password?'535 rejected\r\n':'235 authenticated\r\n')}
   else if(command==='MAIL'||command==='RCPT')socket.write('250 accepted\r\n');
   else if(command==='DATA'){body=[];socket.write('354 continue\r\n')}
   else if(command==='QUIT')socket.end('221 bye\r\n');else socket.write('500 unsupported\r\n');
  });
 }
 function smtpAfterUpgrade(socket){
  // STARTTLS resumes in command mode, without sending a second greeting.
  track(socket);let body=null;
  lines(socket,line=>{
   if(body){if(line!=='.'){body.push(line);return}const messageId=/^Message-ID: (.+)$/mi.exec(body.join('\r\n'))?.[1];state.accepted.push(messageId);if(!state.dropReceipt)state.messages.push({uid:state.nextUid++,messageId,availableAt:Date.now()+state.receiptDelayMs,deleted:false});body=null;socket.write('250 queued\r\n');return}
   const command=line.split(' ')[0].toUpperCase();state.commands.push(command);
   if(command==='EHLO')socket.write('250-fixture\r\n250 AUTH PLAIN LOGIN\r\n');
   else if(command==='AUTH'){const parts=Buffer.from(line.split(' ')[2]??'','base64').toString().split('\0');socket.write(state.rejectAuth||parts[1]!==state.username||parts[2]!==state.password?'535 rejected\r\n':'235 authenticated\r\n')}
   else if(command==='MAIL'||command==='RCPT')socket.write('250 accepted\r\n');
   else if(command==='DATA'){body=[];socket.write('354 continue\r\n')}else if(command==='QUIT')socket.end('221 bye\r\n');else socket.write('500 unsupported\r\n');
  });
 }
 function pop(socket,greet=true){
  track(socket);const snapshot=alive(),deleting=new Set();let username; if(greet)socket.write('+OK fixture POP3\r\n');
  const detach=lines(socket,line=>{
   const [command,arg]=line.split(' ');state.commands.push(command);
   if(command==='STLS'){socket.write('+OK TLS ready\r\n');detach();pop(new tls.TLSSocket(socket,{isServer:true,secureContext:tls.createSecureContext(tlsOptions)}),false)}
   else if(command==='USER'){username=arg;socket.write(state.rejectAuth||username!==state.username?'-ERR rejected\r\n':'+OK user\r\n')}
   else if(command==='PASS')socket.write(state.rejectAuth||username!==state.username||arg!==state.password?'-ERR rejected\r\n':'+OK authenticated\r\n');
   else if(command==='STAT')socket.write(`+OK ${snapshot.length} ${snapshot.length*100}\r\n`);
   else if(command==='RETR'){const message=snapshot[Number(arg)-1];socket.write(message?`+OK message\r\nMessage-ID: ${message.messageId}\r\nSubject: fixture-private-content\r\n\r\nprivate-body-not-evidence\r\n.\r\n`:'-ERR missing\r\n')}
   else if(command==='DELE'){if(state.rejectCleanup)socket.write('-ERR refused\r\n');else{deleting.add(Number(arg)-1);socket.write('+OK marked\r\n')}}
   else if(command==='QUIT'){for(const index of deleting){snapshot[index].deleted=true;state.removed.push(snapshot[index].messageId)}socket.end('+OK committed\r\n')}
   else socket.write('-ERR unsupported\r\n');
  });
 }
 function imap(socket,greet=true){
  track(socket);if(greet)socket.write('* OK fixture IMAP\r\n');
  const detach=lines(socket,line=>{
   const [tag,...parts]=line.split(' '),command=parts.join(' ');state.commands.push(command.split(' ')[0]);
   const ok=()=>socket.write(`${tag} OK done\r\n`),no=()=>socket.write(`${tag} NO rejected\r\n`);
   if(command==='CAPABILITY'){socket.write('* CAPABILITY IMAP4rev1 UIDPLUS\r\n');ok()}
   else if(command==='STARTTLS'){ok();detach();imap(new tls.TLSSocket(socket,{isServer:true,secureContext:tls.createSecureContext(tlsOptions)}),false)}
   else if(command.startsWith('LOGIN '))state.rejectAuth||command!==`LOGIN ${JSON.stringify(state.username)} ${JSON.stringify(state.password)}`?no():ok();
   else if(command.startsWith('SELECT ')){socket.write(`* ${alive().length} EXISTS\r\n`);ok()}
   else if(command.startsWith('UID SEARCH ')){const id=/"([^" ]+)"$/.exec(command)?.[1];socket.write(`* SEARCH${alive().filter(m=>m.messageId===id).map(m=>' '+m.uid).join('')}\r\n`);ok()}
   else if(command.startsWith('UID FETCH ')){const uid=Number(parts[2]),message=alive().find(m=>m.uid===uid);if(!message)return no();const header=`Message-ID: ${message.messageId}\r\n\r\n`;socket.write(`* 1 FETCH (UID ${uid} BODY[HEADER.FIELDS (MESSAGE-ID)] {${Buffer.byteLength(header)}}\r\n${header})\r\n`);ok()}
   else if(command.startsWith('UID STORE ')){const m=alive().find(m=>m.uid===Number(parts[2]));if(state.rejectCleanup||!m)return no();m.marked=true;ok()}
   else if(command.startsWith('UID EXPUNGE ')){const m=alive().find(m=>m.uid===Number(parts[2]));if(state.rejectCleanup||!m?.marked)return no();m.deleted=true;state.removed.push(m.messageId);socket.write('* 1 EXPUNGE\r\n');ok()}
   else no();
  });
 }
 async function listen(server){servers.push(server);server.listen(0,'127.0.0.1');await once(server,'listening');server.on('tlsClientError',()=>{});return server.address().port}
 const ports={smtp:await listen(net.createServer(socket=>smtp(socket))),smtps:await listen(tls.createServer(tlsOptions,socket=>smtp(socket,true))),pop3Plain:await listen(net.createServer(socket=>pop(socket))),imapPlain:await listen(net.createServer(socket=>imap(socket))),pop3:await listen(tls.createServer(tlsOptions,pop)),imap:await listen(tls.createServer(tlsOptions,imap))};
 return {state,ports,async close(){for(const socket of sockets)socket.destroy();await Promise.all(servers.map(server=>new Promise(resolve=>server.close(resolve))))}};
}
