import {testEvent,mailContent,slackContent,escapeHtml,type NotificationEvent} from './notification-content.ts'
// A drill is the test event with drill wording. The stored event, its archived history and the stored webhook/Slack
// envelope never hold the confirmation link: these send-time details are added only to the bytes actually sent.
export interface DrillDetails {startedBy:string;startedAt:number;expiresAt:number;confirmUrl:string}
export function drillEvent(origin:string):NotificationEvent {
 return {...testEvent(origin),id:`drill:${crypto.randomUUID()}`,eventType:'uptime.notification.drill',title:'Alert drill: Uptime',monitorName:'Alert drill',explanation:'This is an alert drill, not an incident. No monitor state or incident was changed.'}
}
const time=(value:number)=>new Date(value).toISOString();
function withDrillLines(event:NotificationEvent,drill:DrillDetails):NotificationEvent {
 return {...event,explanation:[event.explanation,`Started by: ${drill.startedBy}`,`Started at: ${time(drill.startedAt)}`,`Confirm you received it: ${drill.confirmUrl}`,`Open the link and press Confirm. The link works once and expires at ${time(drill.expiresAt)}. Confirming tells the owner this alert reached a person; it does not change any monitor.`].join('\n')}
}
export function drillMailContent(event:NotificationEvent,drill:DrillDetails){
 const mail=mailContent(withDrillLines(event,drill));
 return {...mail,html:`${mail.html}<p><a href="${escapeHtml(drill.confirmUrl)}">Confirm you received this drill</a></p>`}
}
export function drillWebhookBody(event:NotificationEvent,drill:DrillDetails){return JSON.stringify({...event,drill})}
export function drillSlackBody(event:NotificationEvent,drill:DrillDetails){return slackContent(withDrillLines(event,drill))}
