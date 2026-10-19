import {MailError} from './transport.mjs';
export const quote=value=>'"'+value.replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"';
export async function smtpReply(channel,expected){
 const lines=[];let code;
 for(let i=0;i<100;i++){
  const line=await channel.line(),match=/^(\d{3})([ -])(.*)$/.exec(line);
  if(!match||code&&code!==Number(match[1]))throw new MailError('protocol');
  code=Number(match[1]);lines.push(match[3]);
  if(match[2]===' '){if(!expected.includes(code))throw new MailError(code===535||code===534?'authentication':'protocol');return {code,lines}}
 }
 throw new MailError('response_limit');
}
export async function smtpCommand(channel,command,codes=[250]){channel.write(command);return smtpReply(channel,codes)}
export async function popCommand(channel,command,multiline=false){
 if(command!==null)channel.write(command);
 const line=await channel.line();
 if(!/^\+OK(?:\s|$)/i.test(line))throw new MailError('protocol');
 if(!multiline)return line;
 const lines=[];let bytes=0;
 for(;;){const part=await channel.line();if(part==='.')return lines;bytes+=part.length;if(bytes>1048576||lines.length>=16000)throw new MailError('response_limit');lines.push(part.startsWith('..')?part.slice(1):part)}
}
/** IMAP commands used here never request literals or mailbox bodies. */
export async function imapCommand(session,command){
 const tag=`U${++session.tag}`;session.channel.write(`${tag} ${command}`);
 const lines=[];
 for(let i=0;i<1000;i++){
  const line=await session.channel.line();
  if(line.startsWith(`${tag} `)){if(!new RegExp(`^${tag} OK(?: |$)`,'i').test(line))throw new MailError('protocol');return lines}
  if(!line.startsWith('* ')||/\{\d+\+?\}$/.test(line))throw new MailError('protocol');
  lines.push(line);
 }
 throw new MailError('response_limit');
}
