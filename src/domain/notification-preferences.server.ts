import type {Bindings} from './control.server.ts'
import {auditStatement,type AuditActor} from './audit.server.ts'

export function notificationTimeZone(value:unknown):string {
 if(typeof value!=='string'||value.length>80||! /^(?:UTC|[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)+)$/.test(value))throw Error('Choose an IANA time zone, such as America/Chicago');
 try{return new Intl.DateTimeFormat('en-US',{timeZone:value}).resolvedOptions().timeZone}catch{throw Error('Choose an IANA time zone, such as America/Chicago')}
}
export async function notificationPreferences(env:Bindings){
 const row=await env.DB.prepare('SELECT time_zone FROM notification_preferences WHERE singleton=1').first<{time_zone:string}>();
 return {timeZone:row?.time_zone??'America/Chicago'};
}
export async function saveNotificationPreferences(env:Bindings,input:any,actor:AuditActor){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).join(',')!=='timeZone')throw Error('Supply only the notification time zone');
 const timeZone=notificationTimeZone(input.timeZone),now=Date.now();
 await env.DB.batch([
  env.DB.prepare('INSERT INTO notification_preferences(singleton,time_zone) VALUES(1,?) ON CONFLICT(singleton) DO UPDATE SET time_zone=excluded.time_zone').bind(timeZone),
  auditStatement(env,actor,'notification_time_zone_change','notification',crypto.randomUUID(),'1=1',[],now),
 ]);
 return {timeZone};
}
