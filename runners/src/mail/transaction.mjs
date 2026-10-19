import {MailError} from './transport.mjs';
import {smtpCommand,popCommand,imapCommand,quote} from './wire.mjs';
import {openMailSession} from './session.mjs';

function headerId(text){
 const lines=text.replace(/\r\n[ \t]+/g,' ').split('\r\n').filter(v=>/^message-id:/i.test(v));
 return lines.length===1?lines[0].slice(lines[0].indexOf(':')+1).trim():null;
}
async function popMessageId(channel,index){
 await popCommand(channel,`RETR ${index}`);
 let header='',body=false,bytes=0;
 for(;;){
  const line=await channel.line();if(line==='.')return headerId(header);
  bytes+=line.length;if(bytes>1048576)throw new MailError('response_limit');
  if(!body){if(!line.length)body=true;else{header+=line+'\r\n';if(header.length>8192)throw new MailError('response_limit')}}
 }
}
async function popFind(session,messageId){
 const status=await popCommand(session.channel,'STAT'),match=/^\+OK (\d+) \d+(?: |$)/i.exec(status);
 if(!match)throw new MailError('protocol');
 const count=Number(match[1]);if(count>1000)throw new MailError('response_limit');
 // Dedicated test mailboxes are bounded. Only the uniquely identified message can be deleted.
 for(let index=count;index>0;index--)if(await popMessageId(session.channel,index)===messageId)return index;
 return null;
}
async function imapHeader(session,uid){
 const tag=`U${++session.tag}`,c=session.channel;c.write(`${tag} UID FETCH ${uid} (UID BODY.PEEK[HEADER.FIELDS (MESSAGE-ID)])`);
 let header=null;
 for(let i=0;i<20;i++){
  const line=await c.line();
  if(line.startsWith(`${tag} `)){if(!new RegExp(`^${tag} OK(?: |$)`,'i').test(line)||header===null)throw new MailError('protocol');return headerId(header)}
  const match=/^\* \d+ FETCH \(.*\{(\d+)\}$/i.exec(line);
  if(match){
   // Some servers place UID after the literal. SEARCH already selected a UID; require it in this response too.
   header=(await c.readBytes(Number(match[1]))).toString('utf8');
   const tail=await c.line();if(!tail.endsWith(')')||!new RegExp(`(?:\\bUID ${uid}\\b)`).test(line+' '+tail))throw new MailError('protocol');
  }else if(!line.startsWith('* '))throw new MailError('protocol');
 }
 throw new MailError('response_limit');
}
async function imapFind(session,messageId){
 const lines=await imapCommand(session,`UID SEARCH HEADER Message-ID ${quote(messageId)}`),search=lines.filter(v=>/^\* SEARCH(?: |$)/i.test(v));
 if(search.length!==1)throw new MailError('protocol');
 const ids=search[0].slice(8).trim().split(/\s+/).filter(Boolean);
 if(ids.length>100||ids.some(v=>! /^[1-9]\d{0,9}$/.test(v)))throw new MailError('response_limit');
 for(const uid of ids)if(await imapHeader(session,uid)===messageId)return uid;
 return null;
}
async function pause(ms,signal){
 if(signal.aborted)throw new MailError('timeout');
 await new Promise(resolve=>{const finish=()=>{clearTimeout(timer);signal.removeEventListener('abort',finish);resolve()},timer=setTimeout(finish,ms);signal.addEventListener('abort',finish,{once:true})});
 if(signal.aborted)throw new MailError('timeout');
}
export async function sendAndReceive(sender,settings,options,step,transaction){
 await step('smtp_accept',async()=>{
  await smtpCommand(sender.channel,`MAIL FROM:<${settings.from}>`);
  await smtpCommand(sender.channel,`RCPT TO:<${settings.to}>`,[250,251]);
  await smtpCommand(sender.channel,'DATA',[354]);
  await smtpCommand(sender.channel,`Message-ID: ${transaction.messageId}\r\nFrom: ${settings.from}\r\nTo: ${settings.to}\r\nDate: ${new Date().toUTCString()}\r\nSubject: Uptime synthetic delivery check\r\nAuto-Submitted: auto-generated\r\n\r\nSynthetic mail delivery check.\r\n.`,[250]);
  transaction.smtpAccepted=true;transaction.acceptedAt=Date.now();
 });
 sender.channel.destroy();
 const deadline=Math.min(options.deadline,transaction.acceptedAt+settings.receiptTimeoutMs);
 const receiptSignal=AbortSignal.any([options.signal,AbortSignal.timeout(Math.max(1,deadline-Date.now()))]);
 const receivingOptions={...options,signal:receiptSignal};
 const receiver=await openMailSession(settings.receive,receivingOptions,step,'receive_');
 let identity;
 try{
  await step('receipt',async()=>{try{
   if(settings.receive.protocol==='imap'){
    if(!receiver.capabilities.some(v=>/\bUIDPLUS\b/i.test(v)))throw new MailError('protocol');
    await imapCommand(receiver,`SELECT ${quote(settings.receive.mailbox)}`);
   }
   do{
    if(Date.now()>=deadline)throw new MailError('receipt');
    identity=await(settings.receive.protocol==='imap'?imapFind(receiver,transaction.messageId):popFind(receiver,transaction.messageId));
    if(identity){if(Date.now()>deadline)throw new MailError('receipt');transaction.received=true;transaction.receivedAt=Date.now();return}
    if(Date.now()>=deadline)throw new MailError('receipt');
    // POP3's transaction view is fixed at login. Reconnect to observe later delivery; it cannot delete anything here.
    await pause(Math.min(settings.pollIntervalMs,deadline-Date.now()),receiptSignal);
    if(settings.receive.protocol==='pop3'){
     await popCommand(receiver.channel,'QUIT');receiver.channel.destroy();
     const silent=async(_name,fn)=>fn();
     const next=await openMailSession(settings.receive,receivingOptions,silent,'receive_');
     receiver.channel=next.channel;
    }
   }while(Date.now()<=deadline);
   throw new MailError('receipt');
   }catch(error){if(receiptSignal.aborted&&!options.signal.aborted)throw new MailError('receipt');throw error}
  });
  receiver.channel.signal=options.signal;
  await step('cleanup',async()=>{
   try{
    if(settings.receive.protocol==='pop3'){await popCommand(receiver.channel,`DELE ${identity}`);await popCommand(receiver.channel,'QUIT')}
    else{
     await imapCommand(receiver,`UID STORE ${identity} +FLAGS.SILENT (\\Deleted)`);
     await imapCommand(receiver,`UID EXPUNGE ${identity}`);
     if(await imapFind(receiver,transaction.messageId))throw new MailError('cleanup');
    }
    transaction.cleanup=true;transaction.cleanedAt=Date.now();
   }catch(error){if(error instanceof MailError&&error.category==='protocol')throw new MailError('cleanup');throw error}
  });
 }finally{receiver.channel.destroy()}
}
