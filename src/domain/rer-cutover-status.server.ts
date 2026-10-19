import type {Bindings} from './control.server.ts'
import {readCredential} from './notification-credentials.server.ts'
import {NOTIFICATION_NAMESPACE} from './notifications.server.ts'
import {rerSignedRead,signedReadAnswer} from './rer-signed-read.server.ts'

const MAX_BODY=4096
const ISO=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/

/** `{since}` from a small JSON body: an ISO 8601 time with its offset, as epoch milliseconds, or null. */
async function sinceOf(request:Request):Promise<number|null>{
 if(!request.body)return null
 const reader=request.body.getReader(),parts:Uint8Array[]=[];let size=0
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BODY){await reader.cancel();return null}parts.push(value)}}
 finally{reader.releaseLock()}
 let body:unknown
 const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.byteLength}
 try{body=JSON.parse(new TextDecoder().decode(bytes))}catch{return null}
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length!==1||typeof (body as {since?:unknown}).since!=='string')return null
 const since=(body as {since:string}).since,at=Date.parse(since)
 return ISO.test(since)&&Number.isSafeInteger(at)&&at>=0?at:null
}

/** The host a webhook or Slack destination sends to, read without repairing anything; null for email and unreadable credentials. */
async function host(env:Bindings,row:any){
 if(row.kind==='email'||!row.credential_id)return null
 try{return new URL((await readCredential(env,{...row,id:row.credential_id,created_at:row.credential_created_at},{repairUnavailable:false})).endpoint).host}
 catch{return null}
}

/**
 * POST /api/rer/cutover-status: Run Edit Run's signed read of what this installation sent and created since `since`, for
 * Business's webhook-class checks and difference reports. Body `{since}` (an ISO time); grant action `cutover-status`.
 * Read-only: it writes nothing, not even a credential repair. Counts and ids only (and each webhook or Slack
 * destination's host): never destination names, email addresses, endpoint paths, signing secrets, monitor or incident
 * content.
 *
 * - `deliveries`: one per current destination. `sent_since` counts its deliveries that made an attempt at or after
 *   `since` (a webhook or Slack attempt started, an email finished); `ok_since` those of them the receiver accepted.
 * - `created_since`: monitors whose first revision is at or after `since`, and incidents (scheduled triggers, not
 *   restored history) observed at or after it.
 */
export function rerCutoverStatus(env:Bindings,request:Request){
 return rerSignedRead(env,request,'cutover-status',async()=>{
  const since=await sinceOf(request)
  if(since===null)return signedReadAnswer({error:'invalid_since'},400)
  const [destinations,deliveries,monitors,incidents]=await env.DB.batch([
   env.DB.prepare(`SELECT d.id,d.kind,c.id credential_id,c.destination_id,c.created_at credential_created_at,c.endpoint,c.signing_secret,c.ciphertext,c.retired_at
    FROM notification_destinations d LEFT JOIN notification_credentials c ON c.id=d.credential_id WHERE d.deleted_at IS NULL ORDER BY d.created_at,d.id`),
   env.DB.prepare(`SELECT destination_id,count(*) sent,sum(state='accepted') ok FROM (
    SELECT j.destination_id,CASE WHEN j.state<>'queued' THEN j.state ELSE COALESCE(i.state,j.state) END state
    FROM notification_jobs j LEFT JOIN integration_deliveries i ON i.namespace=? AND i.id=j.id
    WHERE EXISTS(SELECT 1 FROM integration_attempts a WHERE a.namespace=? AND a.delivery_id=j.id AND a.started_at>=?)
     OR (j.kind='email' AND j.attempts>0 AND j.finished_at>=?)) GROUP BY destination_id`).bind(NOTIFICATION_NAMESPACE,NOTIFICATION_NAMESPACE,since,since),
   env.DB.prepare('SELECT count(*) n FROM monitors m WHERE (SELECT min(r.created_at) FROM revisions r WHERE r.monitor_id=m.id)>=?').bind(since),
   env.DB.prepare(`SELECT count(*) n FROM outbox WHERE kind='trigger' AND status<>'imported-inactive' AND json_extract(event,'$.observedAt')>=?`).bind(since),
  ])
  const counts=new Map((deliveries.results as {destination_id:string;sent:number;ok:number}[]).map(r=>[r.destination_id,r]))
  return signedReadAnswer({
   deliveries:await Promise.all((destinations.results as any[]).map(async row=>({destination_id:row.id,host:await host(env,row),
    sent_since:counts.get(row.id)?.sent??0,ok_since:counts.get(row.id)?.ok??0}))),
   created_since:{monitors:(monitors.results[0] as {n:number}).n,incidents:(incidents.results[0] as {n:number}).n},
  })
 })
}
