import {readCredentials} from '../credentials.mjs';
import {mailOrigin} from '../../../src/domain/mail-probe/schema.mjs';
import {MailError,connectMail,secureMail} from './transport.mjs';
import {smtpReply,smtpCommand,popCommand,imapCommand,quote} from './wire.mjs';

async function credential(settings,options){
 try{
  const origin=new URL(mailOrigin(settings)).origin;
  const result=options.resolveCredential?await options.resolveCredential(settings.credentialRef,origin):await readCredentials(settings.credentialRef,origin,'POST',options.credentialDir,options.monitorId);
  if(result?.auth?.type!=='basic'||!['username','password'].every(k=>typeof result.auth[k]==='string'&&result.auth[k].length<=4096&&!/[\x00-\x1f\x7f]/.test(result.auth[k]))||!result.auth.username)throw Error();
  return result.auth;
 }catch{throw new MailError('credential')}
}
async function greeting(session){
 const c=session.channel,p=session.settings.protocol;
 if(p==='smtp'){await smtpReply(c,[220]);session.capabilities=(await smtpCommand(c,'EHLO synthetic.uptime.invalid')).lines}
 if(p==='pop3')await popCommand(c,null);
 if(p==='imap'){
  if(!/^\* OK(?: |$)/i.test(await c.line()))throw new MailError('protocol');
  session.capabilities=await imapCommand(session,'CAPABILITY');
 }
}
export async function openMailSession(settings,options,step,prefix=''){
 const session={settings,channel:null,tag:0,capabilities:[]};
 try{
  await step(prefix+'connection',async()=>{const connected=await connectMail(settings,options.signal,options.privateAccess,options.budget,options.capture);session.channel=connected.channel;session.address=connected.address});
  const secure=async()=>{session.channel=await secureMail(session.channel,settings,options.capture)};
  if(settings.security==='tls')await step(prefix+'tls',secure);
  await step(prefix+'banner',()=>greeting(session));
  if(settings.security==='starttls')await step(prefix+'tls',async()=>{
   if(settings.protocol==='smtp'){
    if(!session.capabilities.some(v=>/^STARTTLS(?:\s|$)/i.test(v)))throw new MailError('tls');
    await smtpCommand(session.channel,'STARTTLS',[220]);
   }else if(settings.protocol==='pop3')await popCommand(session.channel,'STLS');
   else await imapCommand(session,'STARTTLS');
   await secure();
   if(settings.protocol==='smtp')session.capabilities=(await smtpCommand(session.channel,'EHLO synthetic.uptime.invalid')).lines;
   if(settings.protocol==='imap')session.capabilities=await imapCommand(session,'CAPABILITY');
  });
  if(settings.credentialRef)await step(prefix+'authentication',async()=>{
   const auth=await credential(settings,options),c=session.channel;
   try{
    if(settings.protocol==='smtp'){
     const mechanisms=session.capabilities.flatMap(v=>/^AUTH[ =]/i.test(v)?v.slice(5).trim().toUpperCase().split(/\s+/):[]);
     if(mechanisms.includes('PLAIN')){
      const token=Buffer.from(`\0${auth.username}\0${auth.password}`).toString('base64');
      const response=await smtpCommand(c,`AUTH PLAIN ${token}`,[235,334]);
      if(response.code===334)await smtpCommand(c,token,[235]);
     }else if(mechanisms.includes('LOGIN')){
      await smtpCommand(c,'AUTH LOGIN',[334]);await smtpCommand(c,Buffer.from(auth.username).toString('base64'),[334]);await smtpCommand(c,Buffer.from(auth.password).toString('base64'),[235]);
     }else throw new MailError('authentication');
    }else if(settings.protocol==='pop3'){await popCommand(c,`USER ${auth.username}`);await popCommand(c,`PASS ${auth.password}`)}
    else await imapCommand(session,`LOGIN ${quote(auth.username)} ${quote(auth.password)}`);
   }catch(error){if(error instanceof MailError&&error.category==='protocol')throw new MailError('authentication');throw error}
  });
  return session;
 }catch(error){session.channel?.destroy();throw error}
}
