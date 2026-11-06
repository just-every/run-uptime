// A destination's latest alert drill as three plain lines in its Edit dialog (public/notifications.js). The lines stay
// separate because they prove different things: Uptime started the send; the provider or endpoint answered; a recipient
// reported receiving it. Proof is never a health claim and never shown by colour alone; its row says the receipt in a word.
const at=(value,escape)=>`<time datetime="${escape(new Date(value).toISOString())}">${escape(new Date(value).toLocaleString())}</time>`;
export function drillLines(d,escape,notSentReason){
 const drill=d.latestDrill;if(!drill)return '';
 const done=drill.finishedAt?`${at(drill.finishedAt,escape)} · `:'';
 const submitted=drill.submittedAt?`${at(drill.submittedAt,escape)} · Uptime started sending it.`:drill.state==='queued'?'Not yet · queued for sending.':drill.state==='sending'?'Starting.':`Not sent · ${escape(notSentReason(drill))}`;
 const acknowledged=!drill.submittedAt&&drill.state==='rejected'?'Nothing was sent.':drill.state==='accepted'?`${done}Send completed.`:drill.state==='uncertain'?`Uncertain · ${done}No clear answer. It will not be sent again.`:drill.state==='rejected'?`Failed · ${done}Not accepted. It will not be sent again.`:'Waiting for an answer.';
 const confirmed=drill.confirmation==='confirmed'?`${at(drill.confirmedAt,escape)} · Reported by the recipient.`:drill.confirmation==='expired'?'Not confirmed within 24 hours.':`Not confirmed yet · the link expires ${at(drill.expiresAt,escape)}.`;
 return `<section class="drill-result" aria-label="Latest test for ${escape(d.name)}"><p class="drill-heading">Started ${at(drill.startedAt,escape)}${drill.startedBy?` by ${escape(drill.startedBy)}`:''}</p><dl class="drill-lines"><div><dt>Submitted</dt><dd>${submitted}</dd></div><div><dt>Acknowledged</dt><dd>${acknowledged}</dd></div><div><dt>Recipient confirmed</dt><dd>${confirmed}</dd></div></dl></section>`;
}
