import type {AgentAccess} from './agent-door/authority.server.ts'
import type {CredentialAuthority} from './credentials/model.server.ts'
import type {AuthBindings} from './operator-auth.server.ts'
import {auditStatement,mutationGuard} from './audit.server.ts'
import {auditsMutation} from './access-audit.server.ts'
import {accessFence,type Access} from './access.server.ts'
// Guard and audit each actual write in its own transaction. This also covers
// delayed import batches: a request-time JS check never authorizes later writes.
// Original statement results and changes() ordering remain unchanged.
export function authorizedDatabase(env:AuthBindings,access:Access|CredentialAuthority|AgentAccess,extra:(statements:{sql:string;values:any[]}[])=>D1PreparedStatement[]=()=>[]):D1Database{
 const db=env.DB,originals=new WeakMap<object,{statement:D1PreparedStatement;sql:string;write:boolean;values:any[]}>()
 const fence=()=>{const guard=accessFence(access);return mutationGuard(env,guard.sql,guard.params)}
 const audit=()=>auditStatement(env,{kind:'operator',ref:('kind' in access?(access.kind==='agent'?access.operator.id:access.issuerId):access.session.operator.id)},`access_${access.action}`,'operator')
 async function commit(statements:D1PreparedStatement[]){
  const details=statements.map(s=>originals.get(s)),additional=extra(details.map(d=>({sql:d?.sql??'',values:d?.values??[]})))
  const result=await db.batch([fence(),...statements.map((s,i)=>details[i]?.statement??s),...additional,...(auditsMutation(access.action,details,additional.length>0)?[audit()]:[])]);return result.slice(1,statements.length+1)
 }
 function wrap(statement:D1PreparedStatement,write:boolean,sql:string,values:any[]=[]) :D1PreparedStatement{
  const wrapped=new Proxy(statement,{get(target,key){
   if(key==='bind')return (...values:any[])=>wrap(target.bind(...values),write,sql,values)
   if(write&&key==='run')return async()=>(await commit([wrapped]))[0]
   if(write&&key==='all')return async()=>(await commit([wrapped]))[0]
   if(write&&key==='first')return async(column?:string)=>{const row=(await commit([wrapped]))[0].results[0] as Record<string,unknown>|undefined;return row?(column?row[column]:row):null}
   const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value
  }});originals.set(wrapped,{statement,write,sql,values});return wrapped
 }
 return new Proxy(db,{get(target,key){
  if(key==='prepare')return (sql:string)=>wrap(target.prepare(sql),!(/^\s*(?:SELECT|PRAGMA|EXPLAIN)\b/i.test(sql)||/^\s*WITH\b/i.test(sql)&&!/\b(?:INSERT|UPDATE|DELETE|REPLACE)\b/i.test(sql)),sql)
  if(key==='batch')return (statements:D1PreparedStatement[])=>statements.length&&statements.every(s=>originals.get(s)?.write===false)?db.batch(statements.map(s=>originals.get(s)!.statement)):commit(statements)
  if(key==='exec')return ()=>{throw Error('Unstructured SQL is not an operator operation')}
  const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value
 }})
}
// Exports can be entirely read-only, so explicitly commit an authority receipt
// before building the response. It contains no names, addresses, body or URL.
export async function auditAccess(env:AuthBindings,access:Access|CredentialAuthority|AgentAccess){const fence=accessFence(access);await env.DB.batch([mutationGuard(env,fence.sql,fence.params),auditStatement(env,{kind:'operator',ref:('kind' in access?(access.kind==='agent'?access.operator.id:access.issuerId):access.session.operator.id)},`access_${access.action}`,'operator')])}
