import {escape} from './console-format.js';
export function mailSummary(definition){
 const mail=definition.mail;
 return `<dl class="assertion-summary"><div><dt>Mail protocol</dt><dd>${escape(mail.protocol.toUpperCase())} · ${escape(mail.security)}</dd></div><div><dt>Server</dt><dd>${escape(mail.host)}:${escape(mail.port)}</dd></div><div><dt>Authentication</dt><dd>${mail.credentialRef?'Runner-local credential required':'Greeting and connection only'}</dd></div>${mail.transaction?'<div><dt>Synthetic transaction</dt><dd>SMTP acceptance, dedicated mailbox receipt and exact-message removal must each pass.</dd></div>':''}</dl>`;
}
export function mailTrace(observation){
 const facts=observation.protocol;if(!facts?.steps)return '';
 const transaction=facts.transaction;
 return `<section aria-label="Mail protocol steps"><ol class="attempt-checks">${facts.steps.map(step=>`<li>${escape(step.step)} · ${step.pass?'Passed':'Failed'} · ${escape(step.durationMs)} ms</li>`).join('')}</ol>${transaction?`<dl class="assertion-summary"><div><dt>Synthetic Message-ID</dt><dd style="overflow-wrap:anywhere">${escape(transaction.messageId)}</dd></div><div><dt>SMTP accepted</dt><dd>${transaction.smtpAccepted?'Yes':'No'}</dd></div><div><dt>Mailbox received</dt><dd>${transaction.received?'Confirmed':'Not confirmed'}</dd></div><div><dt>Synthetic cleanup</dt><dd>${transaction.cleanup?'Removed':'Not confirmed — inspect the dedicated mailbox using this Message-ID'}</dd></div></dl>`:''}</section>`;
}
