import type {Bindings} from './control.server.ts'
// Cloudflare can take up to about two hours to start a new deployment's Cron schedule. Each Cron run records itself, so
// the console says so only until the first run is seen, and never in a demo, where console activity runs the work.
export async function recordCronRun(env:Bindings){
 await env.DB.prepare("INSERT INTO monitoring_watch(id,at,outcome) VALUES('cron-run',?,'complete') ON CONFLICT(id) DO UPDATE SET at=excluded.at").bind(Date.now()).run();
}
export async function cronStarted(env:Bindings){
 return Boolean(await env.DB.prepare("SELECT 1 FROM monitoring_watch WHERE id='cron-run'").first());
}
