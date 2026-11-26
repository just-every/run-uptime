import type {Bindings} from './control.server.ts'
import {HOSTED_RUNNER_ID,hostedInstallation} from './hosted-runner.ts'

export type DueWatch={stale:boolean;heartbeat:boolean;digest:boolean};
export function watchDuration(value:string|undefined,fallback:number){
 return value===undefined?fallback:Number(value);
}

export function watchDue(env:Bindings,now:number){
 // Startup validation has already validated positive interval settings.
 const staleMs=watchDuration(env.UPTIME_RUNNER_STALE_MS,120000);
 const repeatMs=watchDuration(env.UPTIME_WATCH_REPEAT_MS,3600000);
 const pingMs=watchDuration(env.UPTIME_HEARTBEAT_INTERVAL_MS,300000);
 const digestMs=watchDuration(env.UPTIME_DIGEST_INTERVAL_MS,604800000);
 const mail=env.MAIL_PROVIDER!=='none';
 return env.DB.prepare(`SELECT
  EXISTS(SELECT 1 FROM runners r WHERE revoked_at IS NULL
    AND (?1 OR runner_id<>?2)
    AND (COALESCE(last_contact_at,registered_at)<?3 OR COALESCE(last_contact_at,registered_at)>?4)
    AND ((?1 AND NOT ?5) OR EXISTS(SELECT 1 FROM monitors m CROSS JOIN json_each(m.definition,'$.assignments') a
      WHERE json_extract(m.definition,'$.enabled')=1 AND json_extract(a.value,'$.runnerId')=r.runner_id))
    AND ((runner_id<>?2 AND EXISTS(SELECT 1 FROM notification_destinations d WHERE d.enabled=1 AND d.deleted_at IS NULL
      AND NOT EXISTS(SELECT 1 FROM notification_jobs
        WHERE id='checker-stopped:'||r.runner_id||':'||COALESCE(r.last_contact_at,r.registered_at)||':'||d.id)))
     OR (?1 AND NOT EXISTS(SELECT 1 FROM auxiliary_attempts
       WHERE scope='watch' AND job_id='runner-stale:'||r.runner_id||':'||?6
       AND (finished_at IS NULL OR NOT ((outcome IN ('rejected','rate_limited') AND started_at<=?4-10000)
         OR outcome='expired')))))) AS stale,
  (?7 AND NOT EXISTS(SELECT 1 FROM monitoring_watch WHERE id='external-heartbeat' AND at>?8)) AS heartbeat,
  (?1 AND EXISTS(SELECT 1 FROM monitors WHERE json_extract(definition,'$.enabled')=1)
    AND NOT EXISTS(SELECT 1 FROM auxiliary_attempts WHERE scope='watch' AND job_id=?9
      AND outcome IN ('accepted','uncertain'))) AS digest`)
  .bind(Number(mail),HOSTED_RUNNER_ID,now-staleMs,now,Number(hostedInstallation(env)),
   Math.floor(now/repeatMs),Number(Boolean(env.UPTIME_HEARTBEAT_URL)),now-pingMs,
   `healthy-digest:${Math.floor(now/digestMs)}`);
}

export type DueWatchRow={stale:number;heartbeat:number;digest:number};
export function readDueWatch(row:DueWatchRow|undefined):DueWatch|undefined{
 if(row?.stale||row?.heartbeat||row?.digest){
  return {stale:Boolean(row.stale),heartbeat:Boolean(row.heartbeat),digest:Boolean(row.digest)};
 }
}
