import {deliveryLabel,simulatedDelivery} from './delivery-chain.js';
import {escape} from './console-format.js';
import {dependencySections} from './incident-dependencies.js';
const at=value=>value===null?'—':new Date(value).toLocaleString();
const text=value=>escape(value??'');
export function linkedText(value){
 return String(value??'').split(/(https?:\/\/[^\s<>]+)/g).map(part=>/^https?:\/\//.test(part)?`<a href="${text(part)}" target="_blank" rel="noopener noreferrer">${text(part)}</a>`:text(part)).join('');
}
// What a delivery's stored reason code means to a person; an unknown code says nothing rather than show the code.
const REASONS={response_unknown:'no clear answer from the destination',slack_webhook_response_unknown:'no clear answer from Slack',slack_bot_response_unknown:'no clear answer from Slack',webhook_response_uncertain:'no clear answer from the webhook',slack_no_team:'Slack did not recognise the workspace',webhook_rejected:'the webhook refused it',webhook_rate_limited:'the webhook asked for fewer messages',slack_rate_limited:'Slack asked for fewer messages',claim_expired:'sending timed out',destination_unavailable:'the destination was unavailable',retry_attempts_exhausted:'every attempt was used',retry_window_exhausted:'the retry window ended',destination_disabled:'the destination was off',destination_deleted:'the destination was deleted',credential_rotated:'its credentials changed',credential_unavailable:'its credentials are unavailable',mail_not_configured:'email is not set up'};
const deliveryReason=code=>REASONS[code]??'';
function activity(entry){
 const d=entry.data??{};
 if(entry.kind==='confirmation'||entry.kind==='recovery')return d.cause;
 if(entry.kind==='owner_assigned')return 'Owner: '+(d.owner?.displayName??'Unassigned');
 if(entry.kind.startsWith('comment_'))return 'Comment '+(d.version?'version '+d.version:'');
 if(entry.kind==='root_cause_changed')return 'Category: '+(d.categoryLabel??'Not categorized');
 if(['maintenance_applied','pause_applied'].includes(entry.kind))return 'Revision '+d.revision+' · '+d.outcome;
 if(entry.kind==='notification_queued'||entry.kind==='escalation_queued')return (d.channel??'')+' · '+(d.destinationName??'');
 if(entry.kind==='notification_attempt'||entry.kind==='escalation_attempt')return 'Delivery attempt '+d.number;
 if(entry.kind==='notification_outcome'||entry.kind==='escalation_outcome'||entry.kind==='delivery_resolution'){const outcome=d.outcome,state=typeof outcome==='string'?outcome:outcome?.kind,code=typeof outcome==='string'?d.code:outcome?.code;const label=simulatedDelivery({state,code})?'Simulated · no email sent':deliveryLabel(state),why=code?deliveryReason(code):'';return [d.destinationName,label+(why&&!simulatedDelivery({state,code})?' ('+why+')':'')].filter(Boolean).join(' · ')}
 return d.channel?'Recorded through '+d.channel:'';
}
function comment(c){
 if(c.deletedAt!==null)return `<article class="incident-comment"><p>Comment deleted · ${text(at(c.deletedAt))}</p></article>`;
 return `<article class="incident-comment"><p><strong>${text(c.author.displayName)}</strong> · ${text(at(c.createdAt))}</p><p class="incident-prose">${linkedText(c.text)}</p>
 <details><summary>Edit comment</summary><form data-comment-edit="${text(c.id)}" data-version="${c.version}"><label>Comment text<textarea name="text" maxlength="5000" rows="4" required>${text(c.text)}</textarea></label><button>Save edit</button></form></details>
 ${c.history.length?`<details><summary>Edit history (${c.history.length})</summary>${c.history.map(h=>{const made=h.version===1?{who:c.author,when:c.createdAt}:(prior=>({who:prior?.editor,when:prior?.editedAt}))(c.history.find(x=>x.version===h.version-1));return `<p>Version ${h.version} · ${text((made.who??h.editor).displayName)} · ${text(at(made.when??h.editedAt))}</p><p class="incident-prose">${linkedText(h.text)}</p>`}).join('')}</details>`:''}
 <details><summary>Delete comment</summary><p>Remove this comment’s text and edit history. A deletion entry remains in the timeline.</p><button type="button" data-delete-comment="${text(c.id)}" data-version="${c.version}">Delete text and history</button></details></article>`;
}
// The incident's own category select lists today's categories (Settings › Alerts manages them); a category removed since
// stays on this incident, named as removed.
export function detailMarkup(d){
 const retired=d.rootCause.categoryId&&!d.rootCauseCategories.some(c=>c.id===d.rootCause.categoryId)?`<option value="${text(d.rootCause.categoryId)}" selected>${text(d.rootCause.categoryLabel)} (removed; choose a current category)</option>`:'';
const categories=retired+d.rootCauseCategories.map(c=>`<option value="${text(c.id)}"${d.rootCause.categoryId===c.id?' selected':''}>${text(c.label)}</option>`).join('');
 return `<p>Confirmed ${text(at(d.startedAt))} · ${d.machineState==='recovered'?`Recovered ${text(at(d.endedAt))}`:'Monitoring incident remains open'}</p><p>${text(d.trigger.explanation)}</p>
 <section><h3>Follow-up</h3><dl class="ui-dl"><div><dt>Response state</dt><dd>${text(d.status)}</dd></div><div><dt>Owner</dt><dd>${text(d.owner?.displayName??'Unassigned')}</dd></div><div><dt>Next scheduled follow-up</dt><dd>${text(d.nextDue===null?d.nextDueReason:(d.nextDueKind==='reminder'?'Reminder · ':d.nextDueKind==='escalation'?'Escalation · ':'Notification · ')+at(d.nextDue))}</dd></div>${d.stopReason?`<div><dt>Stopped by</dt><dd>${text(d.stopReason.replaceAll('_',' '))}</dd></div>`:''}</dl>
 ${d.capabilities.assignment?'<form data-assignment>':'<form data-assignment hidden>'}<label>Incident owner<select name="ownerId"><option value="">Unassigned</option>${d.assignmentMembers.map(m=>`<option value="${text(m.id)}"${d.owner?.id===m.id?' selected':''}>${text(m.displayName)}</option>`).join('')}</select></label><button>Assign owner</button></form>
 <div class="incident-actions"><button${d.capabilities.scheduledFollowup?'':' hidden'} type="button" data-incident-action="acknowledge"${d.status!=='open'?' disabled':''}>Acknowledge</button><button${d.capabilities.scheduledFollowup?'':' hidden'} type="button" data-incident-action="stop"${d.stopReason?' disabled':''}>Stop follow-up</button><button${d.capabilities.scheduledFollowup?'':' hidden'} type="button" data-incident-action="resolve"${d.status==='resolved'?' disabled':''}>Resolve response</button><button type="button" data-incident-export>Download incident JSON</button></div><p>Response actions record your team’s work. Scheduled evidence alone determines monitor health and recovery.</p></section>
 ${dependencySections(d)}
 <section><h3>Root cause</h3><form data-root-cause><label>Category<select name="categoryId"><option value="">Not categorized</option>${categories}</select></label><label>Root-cause account<textarea name="text" maxlength="2000" rows="3">${text(d.rootCause.text)}</textarea></label><button>Save root cause</button></form><p>Private team account, separate from the machine’s observed cause.</p></section>
 <section><h3>Comments</h3>${d.comments.map(comment).join('')}<form data-comment-add><label>Add a comment<textarea name="text" maxlength="5000" rows="4" required></textarea></label><button>Add comment</button></form><p>Comments stay private. Member mentions, mention email and status-page publication are not available.</p></section>
 <section><h3>Activity timeline</h3><ol class="incident-timeline">${d.timeline.map(e=>`<li><p><strong>${text(e.kind.replaceAll('_',' '))}</strong> · ${text(e.actor.displayName)} · ${text(at(e.at))}</p><p class="incident-prose">${text(activity(e))}</p></li>`).join('')}</ol></section>`;
}
