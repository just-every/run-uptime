import {operatorAuthPeople,type PeopleAdapter,type Trust} from '../../base/modules/agent-door/index.ts'
import {createBusinessSettings} from '../../base/modules/business-settings/index.ts'
import {authenticatedSession,operatorAuth} from '../operator-auth.server.ts'
import {permission} from '../access.server.ts'
import type {Bindings} from '../control.server.ts'

export function installationTrust(env:Bindings):Trust|null {
 const values=[env.RER_OWNER_CLAIM_ISSUER,env.RER_OWNER_CLAIM_INSTALLATION_ID,env.RER_OWNER_CLAIM_APP_ORIGIN,env.RER_OWNER_CLAIM_PUBLIC_KEYS]
 if(!values.some(Boolean))return null
 if(values.some(value=>!value)||env.RER_OWNER_CLAIM_APP_ORIGIN!==env.UPTIME_ORIGIN)throw Error('Incomplete agent installation trust')
 return {issuer:values[0]!,installationId:values[1]!,appOrigin:values[2]!,publicKeys:JSON.parse(values[3]!)}
}
export function people(env:Bindings):PeopleAdapter {
 const base=operatorAuthPeople({db:env.DB,session:request=>authenticatedSession(env,request)})
 const person:PeopleAdapter['person']=async id=>{
  const p=await base.person(id)
  if(!p?.active)return null
  const row=await env.DB.prepare("SELECT r.role FROM uptime_member_roles r JOIN oa_operators o ON o.id=r.operator_id WHERE o.id=? AND r.base_role=o.role AND r.base_version=o.version AND (r.role=o.role OR o.role='member' AND r.role IN ('editor','responder','read-only'))").bind(id).first<{role:string}>()
  return row?{...p,role:row.role}:null
 }
 const ownerBinding=async()=>{
  const row=await env.DB.prepare('SELECT s.owner_id,b.claim_id FROM bs_settings s LEFT JOIN oa_bootstrap b ON b.singleton=1 WHERE s.singleton=1 AND s.stopped=0').first<{owner_id:string|null;claim_id:string|null}>()
  return row?.owner_id&&row.claim_id?{businessId:row.owner_id,nativeId:row.claim_id}:null
 }
 return {person,async sponsor(claims){
  const binding=await ownerBinding()
  if(binding?.businessId===claims.sub)return person(binding.nativeId)
  const row=await env.DB.prepare("SELECT operator_id FROM bs_team WHERE business_id=? AND state<>'conflict'").bind(claims.sub).first<{operator_id:string|null}>()
  return row?.operator_id?person(row.operator_id):null
 },async businessMember(p){
  const binding=await ownerBinding();if(binding?.nativeId===p.id)return {id:binding.businessId,role:'owner'}
  const row=await env.DB.prepare("SELECT business_id,business_role FROM bs_team WHERE operator_id=? AND state<>'conflict' AND business_id IS NOT NULL").bind(p.id).first<{business_id:string;business_role:string}>()
  return row?{id:row.business_id,role:row.business_role==='admin'?'editor':null}:null
 },businessRole:p=>p.role==='owner'?'owner':p.role==='admin'?'editor':null,
 async session(request){try{const a=await permission(env,request,undefined,{action:'read',workspace:false});return person(a.session.operator.id)}catch{return null}}}
}
export function businessSettings(env:Bindings){
 return createBusinessSettings({db:env.DB,trust:env.RER_BUSINESS_TRUST,business:{settings:1,values:['display_name','owner_name','brand_color','logo','timezone'],team:{roles:{admin:'admin',member:'member'}}},team:operatorAuth(env).businessTeam})
}
