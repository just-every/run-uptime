import {renderSlackEvent,serializeSlackMessage,escapeSlackText} from '../base/modules/integrations/slack/message.ts'
export interface NotificationEvent {
 schemaVersion:2; id:string; kind:'trigger'|'recovery'|'test'; eventType:string;
 incidentKey:string|null; state:'firing'|'recovered'|'test'; title:string;
 monitorId:string|null; monitorRevision:number|null; monitorName:string; url:string;
 slotId:string|null; observedAt:number; visibility:'private'; evidenceRef:string;
 explanation:string; probes:{name:string;outcome:string;reason:string}[]; consoleUrl:string;
}
export function incidentEvent({id,kind,monitor,slotId,now,state,observations,origin,incidentKey}:any):NotificationEvent {
 return {schemaVersion:2,id,kind,eventType:kind==='trigger'?'uptime.incident.firing':'uptime.incident.recovered',incidentKey,
 state:kind==='trigger'?'firing':'recovered',title:`${kind==='trigger'?'Down':'Recovered'}: ${monitor.definition.name}`,
 monitorId:monitor.id,monitorRevision:monitor.revision,monitorName:monitor.definition.name,url:monitor.definition.url,
 slotId,observedAt:now,visibility:'private',evidenceRef:`/api/monitors/${monitor.id}/history`,explanation:state.reason,
 probes:observations.map((o:any)=>({name:o.probe,outcome:o.outcome,reason:o.checks.filter((c:any)=>!c.pass).map((c:any)=>c.reason).join('; ')||'All checks passed'})),consoleUrl:origin||''}
}
export function testEvent(origin:string):NotificationEvent {
 return {schemaVersion:2,id:`test:${crypto.randomUUID()}`,kind:'test',eventType:'uptime.notification.test',incidentKey:null,state:'test',title:'Test notification: Uptime',monitorId:null,monitorRevision:null,monitorName:'Test notification',url:'',slotId:null,observedAt:Date.now(),visibility:'private',evidenceRef:'',explanation:'This is a test notification. No monitor state or incident was changed.',probes:[],consoleUrl:origin}
}
// Archive validation rebuilds every recorded Slack body from this text, so its
// output must stay byte-stable or prior deliveries can no longer export or restore.
export function notificationText(event:NotificationEvent){return [event.title,event.url?`URL: ${event.url}`:'',`State: ${event.state}`,event.monitorId?`Monitor: ${event.monitorId}`:'',event.incidentKey?`Incident: ${event.incidentKey}`:'',`Why: ${event.explanation}`,`Time: ${new Date(event.observedAt).toISOString()}`,...event.probes.map(p=>`Probe ${p.name}: ${p.outcome} — ${p.reason}`),event.consoleUrl?`Console: ${event.consoleUrl}`:''].filter(Boolean).join('\n')}
export function escapeHtml(value:string){return value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))}
export function mailContent(event:NotificationEvent){
 // Mail uses friendly check labels; persisted Slack envelopes retain their byte-stable rendering.
 const display={...event,probes:event.probes.map(p=>({...p,name:p.name==='local-a'&&event.explanation.includes('Cloudflare Worker')?'Cloudflare Worker':/^local-[a-z]$/.test(p.name)?`Check ${p.name.charCodeAt(6)-96}`:p.name}))};
 const text=notificationText(display);let link='';
 if(event.consoleUrl){const url=new URL(event.consoleUrl);if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.origin!==event.consoleUrl)throw Error('Invalid console origin');link=`<p><a href="${escapeHtml(event.consoleUrl)}/app">Open Uptime console</a></p>`}
 return {subject:event.title.replace(/[\r\n\x00-\x1f\x7f]/g,' '),text,html:`<pre>${escapeHtml(text)}</pre>${link}`}
}
// Slack bounds the escaped text, so split complete Unicode code points after
// measuring their escaped size. Preserve all evidence without creating mentions.
function slackSections(value:string){
 const sections:string[]=[];let section='',size=0;
 for(const character of value){const width=escapeSlackText(character).length;if(size+width>3000){sections.push(section);section='';size=0}section+=character;size+=width}
 if(section)sections.push(section);return sections;
}
export function slackContent(event:NotificationEvent){return serializeSlackMessage(renderSlackEvent(event.eventType,event,{[event.eventType]:e=>({summary:e.title,sections:slackSections(notificationText(e))})}))}
