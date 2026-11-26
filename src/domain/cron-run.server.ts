import type {Bindings} from './control.server.ts'
// Cloudflare can take up to about two hours to start a new deployment's Cron schedule. The first Cron invocation is recorded, so
// the console says so only until the first run is seen, and never in a demo, where console activity runs the work.
export function recordCronRun(db:D1Database,now:number){
 return db.prepare('INSERT OR IGNORE INTO cron_runs(id,at) VALUES(1,?)').bind(now);
}
export async function cronStarted(env:Bindings){
 return Boolean(await env.DB.prepare('SELECT 1 FROM cron_runs WHERE id=1').first());
}
