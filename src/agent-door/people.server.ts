import type {Bindings} from '../domain/control.server.ts'
import {authenticatedSession,operatorAuth} from '../domain/operator-auth.server.ts'
import {checkSecondFactor} from '../domain/mfa/policy.server.ts'
import {operatorAuthPeople,type PeopleAdapter} from '../base/modules/agent-door/index.ts'
import {createBusinessSettings,type TeamAdapter} from '../base/modules/business-settings/index.ts'
import {nativePerson} from './authority.server.ts'
export function peopleAdapter(env:Bindings):PeopleAdapter{
 const mapped=operatorAuthPeople({db:env.DB,session:async request=>{
  const session=await authenticatedSession(env,request);if(!session)return null
  try{await checkSecondFactor(env,session)}catch{return null}return session
 }})
 const current=async(id:string)=>nativePerson(env,id)
 return {...mapped,person:current,async sponsor(claims){const bound=await mapped.sponsor(claims);return bound?.active?current(bound.id):null},async session(request){const person=await mapped.session(request);return person?current(person.id):null},businessRole:person=>person.role==='owner'?'owner':person.role==='admin'?'editor':null}
}
export function businessSettings(env:Bindings){
 const native=operatorAuth(env).businessTeam!
 const team:TeamAdapter={ownerEmail:()=>native.ownerEmail!(),async prepare(input){
  const plan=await native.prepare(input)
  // OA owns invitation/status/version. Product assignments join those exact
  // native IDs in the same signed-settings transaction. Existing narrower
  // member roles and service/team scopes survive a roster refresh.
  const assignments=plan.rows.flatMap(row=>!row.operatorId||row.state==='conflict'?[]:[env.DB.prepare(`INSERT INTO uptime_member_roles(operator_id,role,base_role,base_version,revision,updated_at)
 SELECT id,CASE role WHEN 'admin' THEN 'admin' ELSE 'read-only' END,role,version,1,? FROM oa_operators WHERE id=?
 ON CONFLICT(operator_id) DO UPDATE SET role=CASE WHEN uptime_member_roles.base_role=excluded.base_role THEN uptime_member_roles.role ELSE excluded.role END,
 base_role=excluded.base_role,base_version=excluded.base_version,revision=uptime_member_roles.revision+1,updated_at=excluded.updated_at`).bind(Date.now(),row.operatorId)])
  return {...plan,statements:[...plan.statements,...assignments]}
 }}
 return createBusinessSettings({db:env.DB,trust:env.RER_BUSINESS_TRUST??null,business:{settings:1,values:['display_name'],team:{roles:{admin:'admin',member:'member'}}},team})
}
