import {cleanupPublicRateLimits} from './public-rate-limits.server.ts'
import {notificationRepository} from './notification-rpc.server.ts'
import {ensureNotificationCustody} from './notification-credentials.server.ts'
import {type Bindings} from './control.server.ts'
// Cron expires abandoned execution leases and bounded transient auth records.
// Durable authority ledgers, observations, definitions and outbox are retained.
export async function maintenance(env:Bindings,now=Date.now()){
 await cleanupPublicRateLimits(env,now);
 const results=await env.DB.batch([
  env.DB.prepare("UPDATE slots SET status='interrupted' WHERE status='running' AND lease_until<=?").bind(now),
  env.DB.prepare('DELETE FROM oa_sessions WHERE expires_at<=?').bind(now),
  env.DB.prepare('DELETE FROM oa_limits WHERE window<?').bind(Math.floor(now/900000)-2),
  env.DB.prepare('DELETE FROM login_attempts WHERE at<?').bind(now-60000),
 ]);
 await notificationRepository(env).recoverExpired(now);
 await env.DB.prepare("UPDATE notification_jobs SET state='uncertain',code='claim_expired',claim=NULL,claim_until=NULL,finished_at=? WHERE kind='email' AND state='sending' AND claim_until<=?").bind(now,now).run();
 // Seal any plaintext credential left by an upgrade, without decrypting stored ones.
 await ensureNotificationCustody(env,{validate:false});
 return {interrupted:results[0].meta.changes};
}
