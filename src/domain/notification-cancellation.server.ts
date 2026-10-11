import type {Bindings} from './control.server.ts'
import {NOTIFICATION_NAMESPACE} from './notifications.server.ts'
// Run with the destination mutation in one transaction. A committed claim wins
// before cancellation; queued automatic work cannot start after cancellation.
export function cancelDestinationStatements(env:Bindings,id:string,deleted=false){
 const code=deleted?'destination_deleted':'destination_disabled',now=Date.now();
 return [
  env.DB.prepare(`UPDATE notification_jobs SET state='rejected',code=?,finished_at=?
   WHERE destination_id=? AND state='queued' AND (?=1 OR json_extract(event,'$.kind')<>'test')
   AND NOT EXISTS(SELECT 1 FROM integration_deliveries d WHERE d.namespace=? AND d.id=notification_jobs.id AND d.state<>'queued')`).bind(code,now,id,deleted?1:0,NOTIFICATION_NAMESPACE),
  env.DB.prepare(`UPDATE integration_deliveries SET state='rejected',next_at=?
   WHERE namespace=? AND state='queued' AND id IN
   (SELECT id FROM notification_jobs WHERE destination_id=? AND state='rejected' AND code=?)`).bind(now,NOTIFICATION_NAMESPACE,id,code),
 ];
}
