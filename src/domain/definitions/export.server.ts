// @ts-ignore checked by family policy tests
import {ASSERTION_FIELDS} from '../policy.mjs'
import type {Bindings} from '../control.server.ts'
import {DEFINITION_FORMAT,DEFINITION_VERSION,FILE_FIELDS} from './format.ts'

// Read-only: the installation's current definitions as the same reviewed file, so a file round-trips (export, then
// preview shows every entry unchanged). Runner assignments, canaries, heartbeat tokens and destinations stay local.
// `enabled` and `maintenanceUntil` are written for the reader; importing a file never changes them. A header or JSON
// assertion stored before unknown assertion fields were refused is written with its known fields only.
const known=(value:any,fields:string[])=>Object.fromEntries(fields.filter(k=>value[k]!==undefined).map(k=>[k,value[k]]))
// A flow's origins are derived from its steps on every save, so the file carries only what the owner wrote.
const fileFlow=(f:any)=>known(f,['intent','steps','outcomes'])
const fileAssertions=(a:any)=>({...a,...(a.header?{header:known(a.header,ASSERTION_FIELDS.header)}:{}),...(a.json?{json:known(a.json,ASSERTION_FIELDS.json)}:{})})
export async function exportDefinitions(env:Bindings){
 const rows=(await env.DB.prepare('SELECT definition FROM monitors ORDER BY rowid').all<any>()).results
 const monitors=rows.map(row=>{const d=JSON.parse(row.definition);return Object.fromEntries(FILE_FIELDS.filter(k=>d[k]!==undefined&&!(k==='url'&&['heartbeat','tcp','dns','tls','domain'].includes(d.type))).map(k=>[k,k==='assertions'?fileAssertions(d[k]):k==='flow'?fileFlow(d[k]):d[k]]))})
 return {format:DEFINITION_FORMAT,version:DEFINITION_VERSION,monitors}
}
