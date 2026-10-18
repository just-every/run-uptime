import {mailSteps} from './schema.mjs';
import {MAIL_ERROR_CATEGORIES} from './evaluate.mjs';
const exact=(v,required,optional=[])=>v&&typeof v==='object'&&!Array.isArray(v)&&required.every(k=>Object.hasOwn(v,k))&&Object.keys(v).every(k=>required.includes(k)||optional.includes(k));
const time=v=>Number.isSafeInteger(v)&&v>=0;
const stepNames=['connection','tls','banner','authentication','smtp_accept','receive_connection','receive_tls','receive_banner','receive_authentication','receipt','cleanup'];
/** Boolean validator, never throws. With settings, accepts only the exact successful prefix and optional terminal failure. */
export function validateMailFacts(facts,settings){
 try{
  if(!exact(facts,['protocol','steps'],['address','transaction'])||!['smtp','pop3','imap'].includes(facts.protocol)||!Array.isArray(facts.steps)||!facts.steps.length||facts.steps.length>14)return false;
  if(facts.address!==undefined&&(typeof facts.address!=='string'||facts.address.length>45||!/^[a-fA-F0-9:.]+$/.test(facts.address)))return false;
  const steps=settings?mailSteps(settings):null;
  if(settings&&facts.protocol!==settings.protocol)return false;
  if(new Set(facts.steps.map(s=>s.step)).size!==facts.steps.length)return false;
  for(let i=0;i<facts.steps.length;i++){
   const s=facts.steps[i];
   if(!exact(s,['step','pass','durationMs'],['category'])||typeof s.pass!=='boolean'||!time(s.durationMs)||s.durationMs>120000||!stepNames.includes(s.step))return false;
   if(steps&&s.step!==steps[i])return false;
   if(s.pass?s.category!==undefined:!MAIL_ERROR_CATEGORIES.includes(s.category)||i!==facts.steps.length-1)return false;
  }
  if(steps&&facts.steps.every(s=>s.pass)&&facts.steps.length!==steps.length)return false;
  const t=facts.transaction,has=step=>facts.steps.some(s=>s.step===step&&s.pass);
  if((t!==undefined)!==facts.steps.some(s=>s.step==='smtp_accept'))return false;
  if(t!==undefined){
   if(!exact(t,['messageId','smtpAccepted','received','cleanup'],['acceptedAt','receivedAt','cleanedAt'])||typeof t.messageId!=='string'||!/^<uptime-[0-9a-f-]{36}@synthetic\.uptime\.invalid>$/.test(t.messageId)||!['smtpAccepted','received','cleanup'].every(k=>typeof t[k]==='boolean'))return false;
   if(settings&&!settings.transaction)return false;
   for(const [flag,step,stamp]of [['smtpAccepted','smtp_accept','acceptedAt'],['received','receipt','receivedAt'],['cleanup','cleanup','cleanedAt']])if(t[flag]!==has(step)||(t[flag]?!time(t[stamp]):t[stamp]!==undefined))return false;
   if(t.received&&!t.smtpAccepted||t.cleanup&&!t.received||t.received&&t.receivedAt<t.acceptedAt||t.cleanup&&t.cleanedAt<t.receivedAt)return false;
  }else if(has('smtp_accept')||has('receipt')||has('cleanup'))return false;
  return true;
 }catch{return false}
}
