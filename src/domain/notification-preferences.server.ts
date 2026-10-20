import {notificationRetryPolicy} from './notification-retry.ts'
import type {Bindings} from './control.server.ts'
import {auditStatement,type AuditActor} from './audit.server.ts'

export function notificationTimeZone(value:unknown):string {
 if(typeof value!=='string'||value.length>80||! /^(?:UTC|[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)+)$/.test(value))throw Error('Choose an IANA time zone, such as America/Chicago');
 try{return new Intl.DateTimeFormat('en-US',{timeZone:value}).resolvedOptions().timeZone}catch{throw Error('Choose an IANA time zone, such as America/Chicago')}
}
export async function notificationPreferences(env:Bindings){
 const row=await env.DB.prepare('SELECT time_zone FROM notification_preferences WHERE singleton=1').first<{time_zone:string}>();
 const policy=await env.DB.prepare('SELECT max_attempts,window_ms FROM notification_retry_settings WHERE singleton=1').first<{max_attempts:number;window_ms:number}>();
 return {timeZone:row?.time_zone??'America/Chicago',retryPolicy:{maxAttempts:policy?.max_attempts??6,windowMs:policy?.window_ms??600000}};
}
export async function saveNotificationPreferences(env:Bindings,input:any,actor:AuditActor){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['timeZone','retryPolicy'].includes(k))||(!Object.hasOwn(input,'timeZone')&&!Object.hasOwn(input,'retryPolicy')))throw Error('Supply the notification time zone or retry policy');
 const previous=await notificationPreferences(env),timeZone=input.timeZone===undefined?previous.timeZone:notificationTimeZone(input.timeZone),policy=input.retryPolicy===undefined?previous.retryPolicy:notificationRetryPolicy(input.retryPolicy),now=Date.now();
 await env.DB.batch([
  env.DB.prepare('INSERT INTO notification_preferences(singleton,time_zone) VALUES(1,?) ON CONFLICT(singleton) DO UPDATE SET time_zone=excluded.time_zone').bind(timeZone),
  env.DB.prepare('UPDATE notification_retry_settings SET max_attempts=?,window_ms=? WHERE singleton=1').bind(policy.maxAttempts,policy.windowMs),
  auditStatement(env,actor,input.retryPolicy===undefined?'notification_time_zone_change':'notification_retry_policy_change','notification',crypto.randomUUID(),'1=1',[],now),
 ]);
 return {timeZone,...(input.retryPolicy===undefined?{}:{retryPolicy:policy})};
}
