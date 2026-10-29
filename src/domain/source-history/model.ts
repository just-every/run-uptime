import {DefinitionFileError} from '../definitions/format.ts'
export const HISTORY_ROW_LIMIT=5000
export const SOURCE='UptimeRobot'
export type HistoryRow={sourceMonitorId:string;sourceRowId:string;name:string;kind:'down'|'up'|'incident'|'response';startedAt:number;endedAt:number|null;responseMs:number|null;sourceDurationSeconds:number|null;author:string;comments:string;rootCause:string;included:boolean;line:string}
export type HistoryFile={rows:HistoryRow[];extractedAt:number|null;coverageFrom:number;coverageTo:number;coverageExplicit:boolean;columns:string[];warnings?:string[]}
export const refuse=(message:string):never=>{throw new DefinitionFileError(message)}
export function sourceText(value:unknown,label:string){
 if(value===undefined||value===null)return ''
 if(typeof value!=='string'||value.length>20000)refuse(`${label} must be source text of at most 20,000 characters`)
 return value as string
}
export function sourceIdentity(value:unknown,label:string){
 if(typeof value==='number'&&Number.isSafeInteger(value)&&value>=0)return String(value)
 if(typeof value==='string'&&value.trim()&&value.length<=256&&!/[\x00-\x1f\x7f]/.test(value))return value.trim()
 return refuse(`${label} needs a source identity`)
}
// Source instants require a timezone. Host-local parsing and rollover dates are never accepted.
export function sourceInstant(value:unknown,label:string):number{
 if(typeof value==='number'&&Number.isSafeInteger(value)&&value>=0&&value<=8640000000000000)return value
 if(typeof value!=='string'||!/^\d{4}-\d\d-\d\d[T ]\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(value))return refuse(`${label}: unrecognised timestamp; use ISO 8601 with Z or an explicit offset (JSON numbers are epoch milliseconds)`)
 const at=Date.parse(value),calendar=value.slice(0,10),day=new Date(calendar+'T00:00:00Z')
 if(!Number.isSafeInteger(at)||at<0||Number.isNaN(day.getTime())||day.toISOString().slice(0,10)!==calendar||Number(value.slice(11,13))>23||Number(value.slice(14,16))>59||Number(value.slice(17,19))>59)return refuse(`${label}: invalid timestamp “${value}”`)
 return at
}
export function boundRows(rows:unknown[]){if(rows.length>HISTORY_ROW_LIMIT)refuse(`History file has ${rows.length} rows; the per-import limit is ${HISTORY_ROW_LIMIT}. Nothing was truncated.`)}
