import type {Bindings} from './control.server.ts'
import {normalizeSafeValues} from './failure-snapshot.mjs'

export const settingsQuery='SELECT version,retention_days,masks,safe_values,screenshot FROM failure_snapshot_settings WHERE monitor_id=?';
export function settingsOf(row:any){
 return {version:row?.version??0,retentionDays:row?.retention_days??90,masks:row?JSON.parse(row.masks):[],safeValues:row?normalizeSafeValues(JSON.parse(row.safe_values)):normalizeSafeValues(undefined),screenshot:Boolean(row?.screenshot)}
}
export async function snapshotSettings(env:Bindings,id:string){return settingsOf(await env.DB.prepare(settingsQuery).bind(id).first<any>())}
