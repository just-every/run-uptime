import {escape} from './console-format.js';
import {dependencySections} from './incident-dependencies.js';
const at=value=>value===null?'—':new Date(value).toLocaleString();
const text=value=>escape(value??'');
export function linkedText(value){
 return String(value??'').split(/(https?:\/\/[^\s<>]+)/g).map(part=>/^https?:\/\//.test(part)?`<a href="${text(part)}" target="_blank" rel="noopener noreferrer">${text(part)}</a>`:text(part)).join('');
}
function activity(entry){
 const d=entry.data??{};
 if(entry.kind==='confirmation'||entry.kind==='recovery')return d.cause;
 if(entry.kind==='owner_assigned')return 'Owner: '+(d.owner?.displayName??'Unassigned');
 if(entry.kind.startsWith('comment_'))return 'Comment '+(d.version?'version '+d.version:'');
 if(entry.kind==='root_cause_changed')return 'Category: '+(d.categoryLabel??'Not categorized');
 if(['maintenance_applied','pause_applied'].includes(entry.kind))return 'Revision '+d.revision+' · '+d.outcome;
 if(entry.kind==='notification_queued'||entry.kind==='escalation_queued')return (d.channel??'')+' · '+(d.destinationName??'');
 if(entry.kind==='notification_attempt'||entry.kind==='escalation_attempt')return 'Delivery attempt '+d.number;
 if(entry.kind==='notification_outcome'||entry.kind==='escalation_outcome'||entry.kind==='delivery_resolution'){const outcome=d.outcome;return typeof outcome==='string'?outcome:outcome?.code??outcome?.status??outcome?.kind??'Outcome recorded'}
 return d.channel?'Recorded through '+d.channel:'';
}
function comment(c){
 if(c.deletedAt!==null)return `<article class="incident-comment"><p>Comment deleted · ${text(at(c.deletedAt))}</p></article>`;
 return `<article class="incident-comment"><p><strong>${text(c.author.displayName)}</strong> · ${text(at(c.createdAt))}</p><p class="incident-prose">${linkedText(c.text)}</p>
 <details><summary>Edit comment</summary><form data-comment-edit="${text(c.id)}" data-version="${c.version}"><label>Comment text<textarea name="text" maxlength="5000" rows="4" required>${text(c.text)}</textarea></label><button>Save edit</button></form></details>
 ${c.history.length?`<details><summary>Edit history (${c.history.length})</summary>${c.history.map(h=>`<p>Version ${h.version} · ${text(h.editor.displayName)} · ${text(at(h.editedAt))}</p><p class="incident-prose">${linkedText(h.text)}</p>`).join('')}</details>`:''}
 <details><summary>Delete comment</summary><p>Remove this comment’s text and edit history. A deletion entry remains in the timeline.</p><button type="button" data-delete-comment="${text(c.id)}" data-version="${c.version}">Delete text and history</button></details></article>`;
}
export function detailMarkup(d,settings){
 const retired=d.rootCause.categoryId&&!settings.categories.some(c=>c.id===d.rootCause.categoryId)?`<option value="${text(d.rootCause.categoryId)}" selected>${text(d.rootCause.categoryLabel)} (removed; choose a current category)</option>`:'';
 const categories=retired+settings.categories.map(c=>`<option value="${text(c.id)}"${d.rootCause.categoryId===c.id?' selected':''}>${text(c.label)}</option>`).join('');
 return `<p>Confirmed ${text(at(d.startedAt))} · ${d.machineState==='recovered'?`Recovered ${text(at(d.endedAt))}`:'Monitoring incident remains open'}</p><p>${text(d.trigger.explanation)}</p>
 <section><h3>Follow-up</h3><dl class="ui-dl"><div><dt>Response state</dt><dd>${text(d.status)}</dd></div><div><dt>Owner</dt><dd>${text(d.owner?.displayName??'Unassigned')}</dd></div><div><dt>Next scheduled follow-up</dt><dd>${text(d.nextDue===null?d.nextDueReason:(d.nextDueKind==='reminder'?'Reminder · ':d.nextDueKind==='escalation'?'Escalation · ':'Notification · ')+at(d.nextDue))}</dd></div>${d.stopReason?`<div><dt>Stopped by</dt><dd>${text(d.stopReason.replaceAll('_',' '))}</dd></div>`:''}</dl>
 ${d.capabilities.assignment?'<form data-assignment>':'<form data-assignment hidden>'}<label>Incident owner<select name="ownerId"><option value="">Unassigned</option>${d.assignmentMembers.map(m=>`<option value="${text(m.id)}"${d.owner?.id===m.id?' selected':''}>${text(m.displayName)}</option>`).join('')}</select></label><button>Assign owner</button></form>
 <div class="incident-actions"><button${d.capabilities.scheduledFollowup?'':' hidden'} type="button" data-incident-action="acknowledge"${d.status!=='open'?' disabled':''}>Acknowledge</button><button${d.capabilities.scheduledFollowup?'':' hidden'} type="button" data-incident-action="stop"${d.stopReason?' disabled':''}>Stop follow-up</button><button${d.capabilities.scheduledFollowup?'':' hidden'} type="button" data-incident-action="resolve"${d.status==='resolved'?' disabled':''}>Resolve response</button><button type="button" data-incident-export>Download incident JSON</button></div><p>Response actions record your team’s work. Scheduled evidence alone determines monitor health and recovery.</p></section>
 ${dependencySections(d)}
 <section><h3>Root cause</h3><form data-root-cause><label>Category<select name="categoryId"><option value="">Not categorized</option>${categories}</select></label><label>Root-cause account<textarea name="text" maxlength="2000" rows="3">${text(d.rootCause.text)}</textarea></label><button>Save root cause</button></form><p>Private team account, separate from the machine’s observed cause.</p></section>
 <section><h3>Comments</h3>${d.comments.map(comment).join('')}<form data-comment-add><label>Add a comment<textarea name="text" maxlength="5000" rows="4" required></textarea></label><button>Add comment</button></form><p>Comments stay private. Member mentions, mention email and status-page publication are not available.</p></section>
 <section><h3>Activity timeline</h3><ol class="incident-timeline">${d.timeline.map(e=>`<li><p><strong>${text(e.kind.replaceAll('_',' '))}</strong> · ${text(e.actor.displayName)} · ${text(at(e.at))}</p><p class="incident-prose">${text(activity(e))}</p></li>`).join('')}</ol></section>
 <details${d.capabilities.categoryAdministration?'':' hidden'}><summary>Manage root-cause categories</summary><form data-categories><div data-category-rows>${settings.categories.map(c=>categoryRow(c)).join('')}</div><button type="button" data-add-category>Add category</button><button>Save category list</button></form></details>`;
}
export function categoryRow(c){return `<div class="incident-category" data-category-id="${text(c.id)}"><label>Category label<input value="${text(c.label)}" maxlength="100" required></label><label class="incident-category-remove"><input type="checkbox" data-remove-category> Remove from future choices</label></div>`}
