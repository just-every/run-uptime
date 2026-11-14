import {validateMailSettings} from '../../domain/mail-probe/schema.mjs';
const defaults={smtp:{none:25,starttls:587,tls:465},pop3:{none:110,starttls:110,tls:995},imap:{none:143,starttls:143,tls:993}};
const field=(root,name)=>root.querySelector(`[name="${name}"]`);
const text=(root,name)=>field(root,name).value.trim();
const set=(root,name,value)=>{const control=field(root,name);if(control)control.value=value??''};
export function fillMail(root,settings={protocol:'smtp',security:'starttls'}){
 for(const [prefix,s] of [['mail',settings],['receive',settings.transaction?.receive??{protocol:'imap',security:'tls'}]]){
  for(const [key,suffix] of [['protocol','Protocol'],['host','Host'],['security','Security'],['credentialRef','CredentialRef'],['mailbox','Mailbox']])set(root,prefix+suffix,s[key]??(key==='mailbox'?'INBOX':''));
  set(root,prefix+'Port',s.port??defaults[s.protocol][s.security??(s.protocol==='smtp'?'starttls':'tls')]);
 }
 const t=settings.transaction;field(root,'mailTransaction').checked=Boolean(t);field(root,'mailDedicated').checked=Boolean(t?.dedicatedMailbox);
 for(const [name,v] of Object.entries({mailFrom:t?.from,mailTo:t?.to,mailReceiptSeconds:(t?.receiptTimeoutMs??10000)/1000,mailPollSeconds:(t?.pollIntervalMs??500)/1000}))set(root,name,v);
 if(!root.dataset.mailBound){root.dataset.mailBound='true';root.addEventListener('change',event=>{
  const name=event.target.name;
  for(const prefix of ['mail','receive'])if([prefix+'Protocol',prefix+'Security'].includes(name)){
   if(name.endsWith('Protocol'))set(root,prefix+'Security',text(root,prefix+'Protocol')==='smtp'?'starttls':'tls');
   set(root,prefix+'Port',defaults[text(root,prefix+'Protocol')][text(root,prefix+'Security')]);
  }
  if(/^mail|^receive/.test(name))syncMail(root);
 });}
 syncMail(root);
}
export function syncMail(root){
 const active=field(root,'checkType').value==='mail',smtp=text(root,'mailProtocol')==='smtp';
 const transaction=field(root,'mailTransaction'),shown=smtp&&transaction.checked;
 root.querySelector('[data-mail-transaction-toggle]').hidden=!smtp;transaction.disabled=!active||!smtp;
 const body=root.querySelector('[data-mail-transaction]');body.hidden=!shown;
 for(const control of body.querySelectorAll('input,select'))control.disabled=!active||!shown;
 const mailbox=root.querySelector('[data-receive-mailbox]'),imap=text(root,'receiveProtocol')==='imap';mailbox.hidden=!imap;field(root,'receiveMailbox').disabled=!active||!shown||!imap;
 for(const prefix of ['mail','receive']){
  const ref=field(root,prefix+'CredentialRef');ref.setCustomValidity(!ref.disabled&&ref.value.trim()&&text(root,prefix+'Security')==='none'?'Choose TLS before using credentials.':'');
 }
}
export function readMail(root){
 const endpoint=prefix=>({protocol:text(root,prefix+'Protocol'),host:text(root,prefix+'Host'),port:Number(text(root,prefix+'Port')),security:text(root,prefix+'Security'),...(text(root,prefix+'CredentialRef')?{credentialRef:text(root,prefix+'CredentialRef')}:{})});
 const mail=endpoint('mail');
 if(mail.protocol==='smtp'&&field(root,'mailTransaction').checked){
  const receive=endpoint('receive');if(receive.protocol==='imap')receive.mailbox=text(root,'receiveMailbox');
  mail.transaction={dedicatedMailbox:field(root,'mailDedicated').checked,from:text(root,'mailFrom'),to:text(root,'mailTo'),receive,receiptTimeoutMs:Number(text(root,'mailReceiptSeconds'))*1000,pollIntervalMs:Number(text(root,'mailPollSeconds'))*1000};
 }
 return validateMailSettings(mail);
}
