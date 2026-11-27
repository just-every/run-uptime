import type {Bindings} from './control.server.ts'

// What a monitor row read gives monitorRow. The pending checks and the claim on the row stay in D1.
export const monitorColumns='id,revision,definition,next_due,state'
export const monitorRow=(row:any)=>({id:row.id,revision:row.revision,definition:JSON.parse(row.definition),nextDue:row.next_due,storedState:JSON.parse(row.state)})
export async function get(env:Bindings,id:string){const row=await env.DB.prepare(`SELECT ${monitorColumns} FROM monitors WHERE id=?`).bind(id).first<any>();return row?monitorRow(row):null}
