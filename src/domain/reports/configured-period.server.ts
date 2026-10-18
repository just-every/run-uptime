import {normalizePeriod,type ReportPeriod} from './period.ts'
/** One owner-selected default for API and console report calculations. */
export async function configuredPeriod(env:{DB:D1Database},input:URLSearchParams|ReportPeriod,now:number){
 if(!(input instanceof URLSearchParams)||input.has('timeZone')||input.has('zone'))return normalizePeriod(input,now)
 const params=new URLSearchParams(input),row=await env.DB.prepare('SELECT time_zone FROM notification_preferences WHERE singleton=1').first<{time_zone:string}>()
 params.set('timeZone',row?.time_zone??'America/Chicago')
 return normalizePeriod(params,now)
}
