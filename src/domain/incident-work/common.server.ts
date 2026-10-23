import {accessFence,type Access} from '../access.server.ts'
import type {Bindings} from '../control.server.ts'
import type {NotificationEvent} from '../notification-content.ts'
import {auditStatement,mutationGuard} from '../audit.server.ts'
export type Person={id:string;displayName:string}
export type Actor=Person&{access:Access}
export class IncidentWorkError extends Error {status:number;constructor(message:string,status=400){super(message);this.status=status}}
export function integer(value:unknown,label='version'){if(!Number.isSafeInteger(value)||Number(value)<0)throw new IncidentWorkError(`A non-negative integer ${label} is required`);return Number(value)}
export function text(value:unknown,max:number,label='text',empty=false){if(typeof value!=='string'||(!empty&&!value.trim())||[...value].length>max||/[\u0000]/u.test(value))throw new IncidentWorkError(`${label} must be ${empty?'at most':'1 to'} ${max} characters`);return value}
export function exact(input:any,keys:string[]){if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!keys.includes(key)))throw new IncidentWorkError('Unexpected request fields')}
export async function findIncident(env:Bindings,id:string){
 const row=await env.DB.prepare("SELECT id,monitor_id,event,status FROM outbox WHERE id=? AND kind='trigger' AND EXISTS(SELECT 1 FROM monitors WHERE id=outbox.monitor_id)").bind(id).first<{id:string;monitor_id:string;event:string;status:string}>()
 if(!row)throw new IncidentWorkError('Incident not found',404)
 const trigger=JSON.parse(row.event) as NotificationEvent
 const closed=await env.DB.prepare("SELECT event FROM outbox WHERE monitor_id=? AND kind='recovery' AND json_extract(event,'$.incidentKey')=? ORDER BY rowid LIMIT 1").bind(row.monitor_id,trigger.incidentKey).first<{event:string}>()
 return {...row,trigger,recovery:closed?JSON.parse(closed.event) as NotificationEvent:null}
}
export async function member(env:Bindings,id:string):Promise<Person>{const row=await env.DB.prepare("SELECT id,display_name FROM oa_operators WHERE id=? AND role='owner' AND status='active'").bind(id).first<{id:string;display_name:string}>();if(!row)throw new IncidentWorkError('Choose an active owner');return {id:row.id,displayName:row.display_name}}
export async function defaultOwner(env:Bindings){const row=await env.DB.prepare("SELECT id,display_name FROM oa_operators WHERE role='owner' AND status='active' ORDER BY created_at,id LIMIT 1").first<{id:string;display_name:string}>();return row?{id:row.id,displayName:row.display_name}:null}
export function actorGuard(env:Bindings,actor:Actor,id:string){const fence=accessFence(actor.access);return mutationGuard(env,`${fence.sql} AND EXISTS(SELECT 1 FROM outbox o JOIN monitors m ON m.id=o.monitor_id WHERE o.id=? AND o.kind='trigger')`,[...fence.params,id])}
export function workSeed(env:Bindings,id:string,monitorId:string,ownerId:string|null){return env.DB.prepare('INSERT OR IGNORE INTO incident_work(incident_id,monitor_id,owner_id) VALUES(?,?,?)').bind(id,monitorId,ownerId)}
export function timeline(env:Bindings,id:string,monitorId:string,actor:Actor,kind:string,data:unknown,now:number){return env.DB.prepare('INSERT INTO incident_timeline(id,incident_id,monitor_id,occurred_at,actor_id,kind,data) VALUES(?,?,?,?,?,?,?)').bind(crypto.randomUUID(),id,monitorId,now,actor.id,kind,JSON.stringify(data))}
export function audit(env:Bindings,actor:Actor,kind:string,now:number){return auditStatement(env,{kind:'operator',ref:actor.id},kind,'incident',crypto.randomUUID(),'1',[],now)}
export async function commit(env:Bindings,statements:D1PreparedStatement[]){try{await env.DB.batch(statements)}catch(error){if(String(error).includes('uptime_audit.id'))throw new IncidentWorkError('Incident changed; refresh before saving',409);throw error}}
