import type {Bindings} from '../control.server.ts'
import {enableDoorAtFirstClaim} from '../../base/modules/import-kit/src/door/index.ts'
import {DOOR_KEY} from './context.server.ts'

/** Run Edit Run sets RER_IMPORT_DOOR=on only on an install it provisions for a Business plan the owner approved with the
 * door opted in. Self-host `rer deploy` never sets it, so a self-hosted door stays off until its owner turns it on. */
const businessProvisioned=(env:Bindings)=>env.RER_IMPORT_DOOR==='on'
/** Holds once the installation's configured owner exists: no claim admits anyone else. */
const ownerExists=(env:Bindings)=>({sql:"EXISTS(SELECT 1 FROM oa_operators WHERE email=? AND role='owner' AND status='active')",params:[env.OWNER_EMAIL??'']})
const claimPaths=new Set(['/auth/bootstrap','/auth/owner-claim'])

/**
 * On a Business-provisioned install, the owner's first claim opens the Business import door. Base writes the settings
 * row only while none exists, so a later claim, a repeat, or a door the owner turned off or on in Business imports
 * changes nothing. The claim and this write commit separately and a claim cannot complete twice, so every later owner
 * path calls this again: the claim's already-initialized answer and the owner opening the console heal a failure between
 * them. The claim has already answered; a failure here is logged, and the next owner path retries it.
 */
export async function openDoorForOwner(env:Bindings){
 if(!businessProvisioned(env))return
 try{
  if(await env.DB.prepare('SELECT 1 FROM ik_door_settings WHERE installation_id=?').bind(DOOR_KEY).first())return
  await enableDoorAtFirstClaim(env.DB,DOOR_KEY,ownerExists(env))
 }catch(error){
  const code=error&&typeof error==='object'&&'code' in error?String(error.code):'storage_unavailable'
  if(code!=='owner_required')console.error(`import door at first claim not yet open: ${code}`)
 }
}
/** After a claim door answers: its first success (303) or its already-initialized answer (409) to a valid claim. */
export async function afterClaim(env:Bindings,request:Request,response:Response){
 if(request.method==='POST'&&claimPaths.has(new URL(request.url).pathname)&&[303,409].includes(response.status))await openDoorForOwner(env)
 return response
}
