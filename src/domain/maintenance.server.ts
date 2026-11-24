import {expireCheckLeases} from './hosted-lease.server.ts'
import {cleanupPublicRateLimits} from './public-rate-limits.server.ts'
import {notificationRepository} from './notification-rpc.server.ts'
import {ensureNotificationCustody} from './notification-credentials.server.ts'
import {retireDrillTokens} from './alert-drills.server.ts'
import {type Bindings} from './control.server.ts'
// Cron expires abandoned execution leases and bounded transient auth records.
// Durable authority ledgers, observations, definitions and outbox are retained.
export async function maintenance(env:Bindings,now=Date.now()){
 await cleanupPublicRateLimits(env,now);
 const [,expired]=await env.DB.batch([
  env.DB.prepare('DELETE FROM failure_snapshots WHERE expires_at<=?').bind(now),
  expireCheckLeases(env.DB,now),
  env.DB.prepare('DELETE FROM oa_sessions WHERE expires_at<=?').bind(now),
  env.DB.prepare('DELETE FROM oa_limits WHERE window<?').bind(Math.floor(now/900000)-2),
  env.DB.prepare('DELETE FROM login_attempts WHERE at<?').bind(now-60000),
 ]);
 // recoverExpired also handles email claims and quiet contact schedules. A
 // settled schedule (no next reminder) is retained history with nothing to recover.
 const active=await env.DB.prepare(`SELECT 1 WHERE EXISTS(SELECT 1 FROM notification_jobs WHERE state='sending')
  OR EXISTS(SELECT 1 FROM integration_deliveries WHERE namespace='uptime-notifications' AND state='sending')
  OR EXISTS(SELECT 1 FROM alert_contact_schedules WHERE next_at IS NOT NULL)`).first();
 if(active)await notificationRepository(env).recoverExpired(now);
 // Seal any plaintext credential left by an upgrade, without decrypting stored ones.
 await ensureNotificationCustody(env,{validate:false});
 await retireDrillTokens(env,now);
 return {interrupted:expired.meta.changes};
}
