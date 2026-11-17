import type {Bindings} from './control.server.ts'
import type {NotificationEvent} from './notification-content.ts'
import {ensureNotificationCustody} from './notification-credentials.server.ts'

// One event per lost contact, to every enabled destination. This is a monitoring
// warning, never a target incident, and needs neither a slot nor the lost checker.
export async function queueCheckerStopped(env:Bindings,runner:any,staleMs:number,now:number){
 const contact=runner.lastContactAt??runner.registeredAt
 const id=`checker-stopped:${runner.runnerId}:${contact}`
 const name=`${runner.networkLabel}${runner.builtIn?' (this computer)':''}`
 const explanation=`${name} has stopped checking. Current health is unknown for monitors relying on this location. ${runner.builtIn?'In Uptime’s folder, run rer dev --stop, then rer dev.':'Restart the Uptime checker on that machine.'} Open Locations to review it.`
 const event:NotificationEvent={schemaVersion:2,id,kind:'checker_stopped',eventType:'uptime.location.stopped',incidentKey:null,state:'warning',title:`Checks stopped: ${name}`,monitorId:null,monitorRevision:null,monitorName:runner.networkLabel,url:'',slotId:null,observedAt:Math.min(now,contact+staleMs+1),visibility:'private',evidenceRef:'/api/runners',explanation,probes:[],consoleUrl:env.UPTIME_ORIGIN??''}
 await ensureNotificationCustody(env)
 await env.DB.prepare(`INSERT OR IGNORE INTO notification_jobs(id,event_id,destination_id,destination_name,kind,credential_id,event,created_at)
 SELECT ?||':'||id,?,id,name,kind,credential_id,?,? FROM notification_destinations WHERE enabled=1 AND deleted_at IS NULL`).bind(id,id,JSON.stringify(event),event.observedAt).run()
}
