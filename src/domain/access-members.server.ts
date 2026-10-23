import {operatorAuth,type AuthBindings} from './operator-auth.server.ts'
import {permission,type Access,type Scope,AccessError} from './access.server.ts'
import {mutationGuard} from './audit.server.ts'
import {authorizedDatabase} from './access-database.server.ts'
// @ts-ignore Product role vocabulary.
import {PRODUCT_ROLES,baseRole} from './role-permissions.mjs'
type Assignment={role:string;scopes:Scope[]}
function assignment(input:any):Assignment{
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['role','scopes','email','displayName','returnTo'].includes(k))||!PRODUCT_ROLES.includes(input.role))throw Object.assign(Error('Choose a product role'),{status:400})
 const scopes=input.scopes??[]
 if(!Array.isArray(scopes)||scopes.length>30||scopes.some(s=>!s||Object.keys(s).sort().join(',')!=='kind,value'||!['service','team'].includes(s.kind)||typeof s.value!=='string'||!s.value.trim()||s.value!==s.value.trim()||s.value.length>100||/[\x00-\x1f\x7f]/.test(s.value))||new Set(scopes.map(s=>JSON.stringify([s.kind,s.value]))).size!==scopes.length)throw Object.assign(Error('Use distinct service/team scopes, at most 30'),{status:400})
 if(input.role==='owner'&&scopes.length)throw Object.assign(Error('Owners retain workspace authority'),{status:400})
 return {role:input.role,scopes}
}
function mayAssign(actor:Access,value:Assignment,target?:{role:string}){
 if(actor.role==='owner')return
 if(actor.role!=='admin'||['owner','admin'].includes(value.role)||target&&target.role!=='member')throw new AccessError()
}
// Append these to Base's own invitation/role transaction, before it sends mail.
// A failure cannot send an invitation with a missing or broader product role.
function assignments(env:AuthBindings,where:string,params:any[],value:Assignment){
 const id=`SELECT id FROM oa_operators WHERE ${where}`
 return [
  env.DB.prepare(`INSERT INTO uptime_member_roles(operator_id,role,base_role,base_version,revision,updated_at)
   SELECT id,?,role,version+CASE WHEN status='invited' THEN 1 ELSE 0 END,1,? FROM oa_operators WHERE ${where} AND role=?
   ON CONFLICT(operator_id) DO UPDATE SET role=excluded.role,base_role=excluded.base_role,base_version=excluded.base_version,revision=uptime_member_roles.revision+1,updated_at=excluded.updated_at`).bind(value.role,Date.now(),...params,baseRole(value.role)),
  env.DB.prepare(`DELETE FROM uptime_member_scopes WHERE operator_id IN (${id})`).bind(...params),
  ...value.scopes.map(scope=>env.DB.prepare(`INSERT INTO uptime_member_scopes(operator_id,kind,value) SELECT id,?,? FROM oa_operators WHERE ${where}`).bind(scope.kind,scope.value,...params)),
 ]
}
export async function accessMembers(env:AuthBindings,request:Request,input?:any){
 const actor=await permission(env,request,input),url=new URL(request.url),path=url.pathname
 const headers={'cache-control':'no-store, private'}
 if(path==='/api/access/self')return Response.json({id:actor.session.operator.id,role:actor.role,scopes:actor.scopes,revision:actor.revision},{headers})
 if(path==='/api/access/members'&&request.method==='GET'){
  // Base performs its independent account policy check; only safe identity and
  // permission metadata are returned. Session IDs and credentials are absent.
  const people=await operatorAuth(env).listOperators(request)
  const [roles,scopes]=await Promise.all([env.DB.prepare('SELECT * FROM uptime_member_roles').all<any>(),env.DB.prepare('SELECT operator_id,kind,value FROM uptime_member_scopes').all<any>()])
  return Response.json(people.map(person=>{const role=roles.results.find(r=>r.operator_id===person.id);return {...person,productRole:role?.role??null,assignmentCurrent:!!role&&role.base_role===person.role&&role.base_version===person.version,scopes:scopes.results.filter(s=>s.operator_id===person.id).map(({kind,value})=>({kind,value}))}}),{headers})
 }
 if(path==='/api/access/invitations'&&request.method==='POST'){
  const value=assignment(input);mayAssign(actor,value)
  if(typeof input.email!=='string'||typeof input.displayName!=='string')throw Object.assign(Error('Email and display name required'),{status:400})
  const email=input.email.trim().toLowerCase()
  const db=authorizedDatabase(env,actor,statements=>{const token=statements.find(s=>s.sql.includes('INSERT INTO oa_tokens')&&s.sql.includes("'invite'"));return token?assignments(env,"email=? AND status='invited' AND EXISTS(SELECT 1 FROM oa_tokens t WHERE t.id=? AND t.operator_id=oa_operators.id AND t.consumed_at IS NULL AND t.revoked_at IS NULL)",[email,token.values[0]],value):[]})
  const result=await operatorAuth({...env,DB:db}).invite(request,{email,displayName:input.displayName,role:baseRole(value.role),returnTo:input.returnTo})
  return Response.json(result,{status:202,headers})
 }
 const match=/^\/api\/access\/members\/([^/]+)$/.exec(path)
 if(!match)throw Object.assign(Error('Not found'),{status:404})
 const id=decodeURIComponent(match[1]),target=await env.DB.prepare('SELECT id,role,status,version FROM oa_operators WHERE id=?').bind(id).first<any>()
 if(!target)throw Object.assign(Error('Operator not found'),{status:404})
 // The owner may remove itself through Base's guarded status door. Its final
 // owner fence is always Base's decision; edition writes never bypass it.
 if(request.method==='DELETE'){
  mayAssign(actor,{role:'read-only',scopes:[]},target)
  const configured={...env,DB:authorizedDatabase(env,actor)}
  const post=new Request(new URL('/auth/operator/status',request.url),{method:'POST',headers:request.headers})
  return Response.json(await operatorAuth(configured).setOperatorStatus(post,id,'inactive'),{headers})
 }
 if(request.method!=='POST')throw Object.assign(Error('Method not allowed'),{status:405})
 const value=assignment(input);mayAssign(actor,value,target)
 const existing=await env.DB.prepare('SELECT role,base_role,base_version FROM uptime_member_roles WHERE operator_id=?').bind(id).first<any>()
 const currentScopes=(await env.DB.prepare('SELECT kind,value FROM uptime_member_scopes WHERE operator_id=? ORDER BY kind,value').bind(id).all<Scope>()).results
 if(!Object.hasOwn(input,'scopes'))value.scopes=currentScopes
 const ordered=(scopes:Scope[])=>JSON.stringify(scopes.map(s=>[s.kind,s.value]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))))
 if(existing?.role===value.role&&existing.base_role===target.role&&existing.base_version===target.version&&ordered(currentScopes)===ordered(value.scopes))return Response.json({id,role:value.role,scopes:value.scopes,unchanged:true},{headers})
 if(id===actor.session.operator.id)throw Object.assign(Error('Another administrator must change your product assignment'),{status:409})
 const statements=(statements:{sql:string;values:any[]}[])=>statements.some(s=>s.sql.startsWith('UPDATE oa_operators SET role='))?assignments(env,'id=?',[id],value):[]
 const configured={...env,DB:authorizedDatabase(env,actor,statements)}
 if(target.role!==baseRole(value.role))await operatorAuth(configured).setRole(request,id,baseRole(value.role))
 else await authorizedDatabase(env,actor).batch([mutationGuard(env,'EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND version=? AND role=?)',[id,target.version,target.role]),...assignments(env,'id=?',[id],value)])
 return Response.json({id,role:value.role,scopes:value.scopes},{headers})
}
