import type {Bindings} from '../domain/control.server.ts'
import type {DestinationUpdateFence} from '../domain/notification-destinations.server.ts'

// Deliberately narrow: saved email metadata outside every current alert route.
// Missing policies mean all recipients, so they cannot establish this scope.
// Consent and named routes are checked conservatively even when not selected.
export const outsideDestinationRoutes=`
 NOT EXISTS(SELECT 1 FROM alert_routes WHERE mode='all'
  OR ? IN(SELECT value FROM json_each(destination_ids))
  OR ? IN(SELECT value FROM json_each(fallback,'$.destinationIds')))
 AND NOT EXISTS(SELECT 1 FROM alert_named_routes WHERE json_extract(policy,'$.mode')='all'
  OR ? IN(SELECT value FROM json_each(policy,'$.destinationIds'))
  OR ? IN(SELECT value FROM json_each(policy,'$.fallback.destinationIds')))
 AND NOT EXISTS(SELECT 1 FROM alert_recipient_consents WHERE destination_id=?)
 AND NOT EXISTS(SELECT 1 FROM monitors m WHERE
  ? IN(SELECT value FROM json_each(m.definition,'$.slow.destinationIds'))
  OR NOT EXISTS(SELECT 1 FROM alert_routes r WHERE r.mode<>'inherit' AND
   ((r.scope_kind='monitor' AND r.scope_value=m.id)
    OR (r.scope_kind='service' AND r.scope_value=json_extract(m.definition,'$.service'))
    OR (r.scope_kind='group' AND r.scope_value=json_extract(m.definition,'$.group'))
    OR (r.scope_kind='installation' AND r.scope_value=''))))`
export const destinationRouteValues=(id:string)=>Array(6).fill(id) as string[]
export async function destinationNameFence(env:Bindings,id:string,input:Record<string,unknown>):Promise<DestinationUpdateFence|null>{
 if(Object.keys(input).some(key=>!['name','enabled'].includes(key))||input.enabled!==true||typeof input.name!=='string')return null
 const row=await env.DB.prepare(`SELECT d.name,d.enabled,d.credential_id FROM notification_destinations d
 JOIN notification_credentials c ON c.id=d.credential_id AND c.destination_id=d.id
 WHERE d.id=? AND d.deleted_at IS NULL AND d.kind='email' AND d.enabled=1
 AND c.retired_at IS NULL AND c.unavailable_at IS NULL AND c.ciphertext IS NOT NULL
 AND ${outsideDestinationRoutes}`).bind(id,...destinationRouteValues(id)).first<{name:string;enabled:number;credential_id:string}>()
 return row&&input.name.trim()!==row.name?{name:row.name,enabled:true,credentialId:row.credential_id}:null
}
