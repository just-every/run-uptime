import type {Bindings} from './control.server.ts'
import {auditStatement,type AuditActor} from './audit.server.ts'

function ianaTimeZone(value:unknown){
 if(typeof value!=='string'||value.length>80||! /^(?:UTC|[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)+)$/.test(value))return null;
 try{return new Intl.DateTimeFormat('en-US',{timeZone:value}).resolvedOptions().timeZone}catch{return null}
}
export function notificationTimeZone(value:unknown):string {
 const timeZone=ianaTimeZone(value);if(timeZone===null)throw Error('Choose an IANA time zone, such as America/Chicago');
 return timeZone;
}
export async function notificationPreferences(env:Bindings){
 const row=await env.DB.prepare('SELECT time_zone FROM notification_preferences WHERE singleton=1').first<{time_zone:string}>();
 return {timeZone:row?.time_zone??'UTC'};
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

// The browser's zone only seeds a fresh installation's default and never fails the read it rides on:
// a saved choice stands, and an absent or unusable zone (Chromium reports +00:00 for GMT, or EST5EDT) seeds nothing.
export async function initializeNotificationTimeZone(env:Bindings,value:string){
 if(await env.DB.prepare('SELECT singleton FROM notification_preferences WHERE singleton=1').first())return;
 const timeZone=ianaTimeZone(value);if(timeZone===null)return;
 await env.DB.prepare('INSERT INTO notification_preferences(singleton,time_zone) VALUES(1,?) ON CONFLICT(singleton) DO NOTHING').bind(timeZone).run();
}
