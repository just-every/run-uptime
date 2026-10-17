import type {Bindings} from './control.server.ts'
import type {AuditActor} from './audit.server.ts'
import {applyCatalogPlan} from './catalog/apply.server.ts'
import {catalogView,planCatalogAdd,planCatalogBulk} from './catalog/plan.server.ts'

export async function catalogBulkPreview(env:Bindings,input:unknown){return catalogView(await planCatalogBulk(env,input))}
export async function catalogBulkApply(env:Bindings,input:unknown,digest:unknown,actor:AuditActor){
 const plan=await planCatalogBulk(env,input)
 return {...await applyCatalogPlan(env,plan,digest,actor),preview:catalogView(plan)}
}
export async function catalogAddPreview(env:Bindings,input:unknown){return catalogView(await planCatalogAdd(env,input))}
export async function catalogAddApply(env:Bindings,input:unknown,digest:unknown,actor:AuditActor){
 const plan=await planCatalogAdd(env,input)
 return {...await applyCatalogPlan(env,plan,digest,actor),preview:catalogView(plan)}
}
