import {publicHost} from '../protocol/settings.mjs';
import {privateTarget} from '../private-target.mjs';
import {validReference} from '../credential-binding.mjs';

const fields=(v,allowed,label)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!allowed.includes(k)))throw Error(`Invalid ${label} settings`);return v};
const integer=(v,min,max,label)=>{if(!Number.isInteger(v)||v<min||v>max)throw Error(`${label} must be from ${min} to ${max}`);return v};
const mailboxAddress=v=>{if(typeof v!=='string'||v.length>254||! /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(v))throw Error('Synthetic sender and recipient must be email addresses');return v};
export const mailOrigin=s=>`${s.security==='none'?'http':'https'}://${s.host.includes(':')?`[${s.host}]`:s.host}:${s.port}`;
export const mailUrl=s=>`${s.protocol}${s.security==='tls'?'s':''}://${s.host.includes(':')?`[${s.host}]`:s.host}:${s.port}`;
function endpoint(input,network,receiver=false){
 const s=fields(input,['protocol','host','port','security','credentialRef',...(receiver?['mailbox']:['transaction'])],receiver?'receiving mailbox':'mail');
 if(!['smtp','pop3','imap'].includes(s.protocol)||(receiver&&s.protocol==='smtp'))throw Error('Mail protocol must be smtp, pop3 or imap; receivers use pop3 or imap');
 const security=s.security??(s.protocol==='smtp'?'starttls':'tls');
 if(!['none','starttls','tls'].includes(security))throw Error('Mail security must be none, starttls or tls');
 const defaults={smtp:{none:25,starttls:587,tls:465},pop3:{none:110,starttls:110,tls:995},imap:{none:143,starttls:143,tls:993}};
 const port=integer(s.port??defaults[s.protocol][security],1,65535,'Mail port');
 let host;
 if(network==='private'){
  if(typeof s.host!=='string'||!s.host.trim()||s.host.length>253)throw Error('Mail host required');
  host=privateTarget(`http://${s.host.includes(':')&&!s.host.startsWith('[')?`[${s.host}]`:s.host}:${port}/`).hostname.replace(/^\[|\]$/g,'');
 }else host=publicHost(s.host,'Mail host');
 if(s.credentialRef!==undefined&&(!validReference(s.credentialRef)||security==='none'))throw Error('Mail authentication requires TLS and a valid credential reference');
 if(receiver&&!s.credentialRef)throw Error('A receiving mailbox requires a credential reference');
 if(s.mailbox!==undefined&&(s.protocol!=='imap'||typeof s.mailbox!=='string'||!s.mailbox.length||s.mailbox.length>128||/[^\x20-\x7e]/.test(s.mailbox)))throw Error('IMAP mailbox must be ASCII text of at most 128 characters');
 return {protocol:s.protocol,host,port,security,...(s.credentialRef?{credentialRef:s.credentialRef}:{}),...(receiver&&s.protocol==='imap'?{mailbox:s.mailbox??'INBOX'}:{})};
}
/** Normalize editor settings; the second argument carries the definition's network policy. */
export function validateMailSettings(input,{network='public'}={}){
 const result=endpoint(input,network);
 if(input.transaction!==undefined){
  if(result.protocol!=='smtp')throw Error('Synthetic send/receive transactions require SMTP');
  const t=fields(input.transaction,['dedicatedMailbox','from','to','receive','receiptTimeoutMs','pollIntervalMs'],'synthetic transaction');
  if(t.dedicatedMailbox!==true)throw Error('Confirm that this transaction uses a dedicated synthetic test mailbox');
  const receiptTimeoutMs=integer(t.receiptTimeoutMs??10000,250,60000,'Receipt timeout');
  const pollIntervalMs=integer(t.pollIntervalMs??500,100,5000,'Receipt polling interval');
  if(pollIntervalMs>receiptTimeoutMs)throw Error('Receipt polling interval must fit inside the receipt timeout');
  result.transaction={dedicatedMailbox:true,from:mailboxAddress(t.from),to:mailboxAddress(t.to),receive:endpoint(t.receive,network,true),receiptTimeoutMs,pollIntervalMs};
 }
 return result;
}
export function mailSteps(settings){
 const stages=(s,prefix='')=>[`${prefix}connection`,...(s.security==='tls'?[`${prefix}tls`]:[]),`${prefix}banner`,...(s.security==='starttls'?[`${prefix}tls`]:[]),...(s.credentialRef?[`${prefix}authentication`]:[])];
 return [...stages(settings),...(settings.transaction?['smtp_accept',...stages(settings.transaction.receive,'receive_'),'receipt','cleanup']:[])];
}
