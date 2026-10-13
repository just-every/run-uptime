// Storage faults, named and classified. A D1 error is one of: a guard conflict (the installation changed between reading and
// writing: 409 conflict), a constraint violation from a racing writer (409 conflict), a transient D1 fault (overload, reset,
// timeout, lost connection, lock: 503 storage_unavailable with Retry-After), a schema fault (a migration is missing: 503) or any
// other D1 error (503). Every storage call on a route that a runner or operator depends on runs inside storageOperation(), so
// the log line and the answer name the operation that failed, never a secret, URL, credential or payload.
export type StorageClass='guard_conflict'|'constraint'|'transient'|'schema'|'other'
export interface StorageFault{class:StorageClass;status:409|503;code:'conflict'|'storage_unavailable';operation:string|null;cause:string}
const operations=new WeakMap<object,string>()
const NAME=/^[a-z][A-Za-z0-9_.]{0,80}$/
/** Runs one named storage step. The innermost name stays on an error that passes through outer steps. */
export async function storageOperation<T>(operation:string,run:()=>Promise<T>):Promise<T>{
 try{return await run()}catch(error){if(error&&typeof error==='object'&&!operations.has(error)&&NAME.test(operation))operations.set(error,operation);throw error}
}
const GUARD=/NOT NULL constraint failed: uptime_audit\.id/
const CONSTRAINT=/(UNIQUE|PRIMARY KEY|FOREIGN KEY|CHECK|NOT NULL) constraint failed/i
const TRANSIENT=/overloaded|queued for too long|reset because|Durable Object reset|storage operation exceeded|exceeded timeout|network connection lost|connection lost|timed out|temporarily unavailable|database is locked|SQLITE_BUSY|internal error|Failed to parse body as JSON/i
const SCHEMA=/no such (table|column)|has no column named/i
/** The cause with quoted values and long digit runs removed, first line only. */
export const storageCause=(message:string)=>message.split('\n')[0].replace(/'[^']*'|"[^"]*"/g,'?').replace(/\d{4,}/g,'#').slice(0,200)
/** Null for an error that is not a D1 error. */
export function classifyStorage(error:unknown):StorageFault|null{
 const message=error instanceof Error?error.message:''
 if(!message.startsWith('D1'))return null
 const operation=error&&typeof error==='object'?operations.get(error)??null:null,cause=storageCause(message)
 const klass:StorageClass=GUARD.test(message)?'guard_conflict':CONSTRAINT.test(message)?'constraint':SCHEMA.test(message)?'schema':TRANSIENT.test(message)?'transient':'other'
 const conflict=klass==='guard_conflict'||klass==='constraint'
 return {class:klass,status:conflict?409:503,code:conflict?'conflict':'storage_unavailable',operation,cause}
}
/** The one log line for a storage fault. */
export const storageLogLine=(method:string,route:string,fault:StorageFault)=>JSON.stringify({event:'storage_error',method,route,operation:fault.operation,class:fault.class,status:fault.status,cause:fault.cause})
