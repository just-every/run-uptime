import {AccessError,type Access} from '../access.server.ts'
import type {Bindings} from '../control.server.ts'
// @ts-ignore Shared runner egress policy.
import {AUTH0_REVIEW_MS,auth0Disclosure,auth0Selection,validateAuth0Spec} from './authorization.mjs'
// @ts-ignore Edition catalog version.
import {CATALOG_VERSION} from './entries.mjs'
const encoder=new TextEncoder()
const refuse=(message:string,status=409)=>Object.assign(Error(message),{status})
async function signature(env:Bindings,payload:string){
 const key=await crypto.subtle.importKey('raw',encoder.encode(env.SESSION_SECRET!),{name:'HMAC',hash:'SHA-256'},false,['sign'])
 const signed=await crypto.subtle.sign('HMAC',key,encoder.encode('uptime.auth0-egress-review.v1.'+payload))
 return [...new Uint8Array(signed)].map(byte=>byte.toString(16).padStart(2,'0')).join('')
}
// A preview makes no job and no outbound request. Confirmation must echo its
// installation-signed review, bound to this still-authorized owner and input.
export async function admitAuth0Check(env:Bindings,input:any,access?:Access){
 if(!access||access.role!=='owner'||access.session.operator.role!=='owner')throw new AccessError(403)
 const selection=auth0Selection(input),disclosure=auth0Disclosure(selection.tenantDomain),now=Date.now()
 const owner=access.session.operator
 const binding={tenantDomain:selection.tenantDomain,endpoint:disclosure.endpoint,catalogVersion:CATALOG_VERSION,reviewerId:await signature(env,'owner.'+JSON.stringify([owner.id,owner.version,access.revision])),reviewerVersion:owner.version,reviewerRevision:access.revision}
 if(input.review===undefined&&input.consent===undefined){
  const payload=btoa(JSON.stringify({...binding,reviewedAt:now,expiresAt:now+AUTH0_REVIEW_MS})).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')
  return {preview:{status:'review_required',disclosure,review:payload+'.'+await signature(env,payload)}}
 }
 if(input.consent!==true||typeof input.review!=='string'||input.review.length>2048||!/^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/.test(input.review))throw refuse('Review and explicitly confirm the Auth0 tenant-domain disclosure first.')
 const [payload,mac]=input.review.split('.')
 const expected=await signature(env,payload)
 let difference=0;for(let index=0;index<expected.length;index++)difference|=expected.charCodeAt(index)^mac.charCodeAt(index)
 if(difference)throw refuse('That Auth0 review is invalid. Review the disclosure again.')
 let reviewed:any;try{reviewed=JSON.parse(atob(payload.replace(/-/g,'+').replace(/_/g,'/')))}catch{throw refuse('Invalid Auth0 review.')}
 if(Object.entries(binding).some(([key,value])=>reviewed[key]!==value)||!Number.isSafeInteger(reviewed.reviewedAt)||reviewed.reviewedAt>now||reviewed.expiresAt!==reviewed.reviewedAt+AUTH0_REVIEW_MS||now>reviewed.expiresAt)throw refuse('The owner, tenant or review changed or expired. Review the disclosure again.')
 const spec={...selection,authorization:{...reviewed,confirmedAt:now,consent:true,review:input.review}}
 validateAuth0Spec(spec,CATALOG_VERSION)
 return {spec,url:disclosure.url}
}
