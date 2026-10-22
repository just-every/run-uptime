import {escape} from './console-format.js';
// DEPENDENCY-002 correlation on the incident view (FOLLOWUP-001): provider notices whose window overlaps this incident, anywhere
// in the installation, are the provider's own claim shown as context. Linked ones form a group that one acknowledgment covers;
// an unlinked overlap is labelled coincident, stays outside the group and never groups acknowledgment.
const at=value=>new Date(value).toLocaleString();
const notice=n=>`<li data-key="dependency-${escape(n.noticeId)}"><p><strong>${escape(n.provider)}${n.component?` · ${escape(n.component)}`:''}</strong> stated “${escape(n.stated)}” from ${escape(at(n.observedAt))}${n.recoveredAt===null?' (still open)':` to ${escape(at(n.recoveredAt))}`}${n.acknowledgedAt!==null?` · acknowledged ${escape(at(n.acknowledgedAt))}`:''}</p><p class="ui-mono">${escape(n.source)}</p></li>`;
export function dependencySections(d){
 const context=d.dependencies;if(!context||(!context.linked.length&&!context.coincident.length))return '';
 return `<section data-dependency-context><h3>Provider notices during this incident</h3><p>Provider-stated context: the provider’s own claim, never proof of cause.</p>
 ${context.linked.length?`<h4>Linked dependencies (grouped for acknowledgment)</h4><ul>${context.linked.map(notice).join('')}</ul>${context.group.length?`<p>Acknowledging this incident also acknowledges: ${context.group.map(g=>escape(g.monitorName)).join(', ')}.</p>`:'<p>Acknowledging this incident also acknowledges these provider notices.</p>'}`:''}
 ${context.coincident.length?`<h4>Coincident in time, contextual</h4><ul>${context.coincident.map(n=>`<li data-key="coincident-${escape(n.noticeId)}"><p>Coincident in time, contextual · outside the group.</p>${notice(n).replace(/^<li[^>]*>|<\/li>$/g,'')}</li>`).join('')}</ul><p>These are not linked to this monitor, so acknowledging this incident does not acknowledge them. Link a provider on its followed-service page to group them.</p>`:''}</section>`;
}
