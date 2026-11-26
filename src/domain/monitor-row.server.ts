import type {Bindings} from './control.server.ts'

export const monitorRow=(row:any)=>({id:row.id,revision:row.revision,definition:JSON.parse(row.definition),nextDue:row.next_due,storedState:JSON.parse(row.state)})
export async function get(env:Bindings,id:string){const row=await env.DB.prepare('SELECT * FROM monitors WHERE id=?').bind(id).first<any>();return row?monitorRow(row):null}
