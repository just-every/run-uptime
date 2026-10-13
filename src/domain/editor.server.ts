import {parseConfig} from '../base/modules/editor/config.ts'
import {operatorSession, type AuthBindings} from './operator-auth.server.ts'

function editorConfig(env:AuthBindings) {
 if(!env.RER_MANAGEMENT_ORIGIN&&!env.RER_INSTALLATION_ID)return null
 return parseConfig({enabled:true,managementOrigin:env.RER_MANAGEMENT_ORIGIN,installationId:env.RER_INSTALLATION_ID})
}
export async function editorConfigResponse(env:AuthBindings, request:Request) {
 const headers={'cache-control':'no-store, private',vary:'Cookie'}
 try {
  const session=await operatorSession(env,request)
  if(!session)return Response.json({error:'Owner authorization required'},{status:403,headers})
  if(request.method!=='GET')return Response.json({error:'GET required'},{status:405,headers:{...headers,allow:'GET'}})
  const config=editorConfig(env)
  if(!config)return new Response(null,{status:204,headers})
  return Response.json({config,expiresAt:Math.min(session.expiresAt,Date.now()+30_000)},{headers})
 } catch {return Response.json({error:'Editor authorization unavailable'},{status:503,headers})}
}
/** Restrict both embedding directions to the exact trusted management origin. */
export function editorDocument(response:Response, env:AuthBindings) {
 let origin="'none'"
 try {origin=editorConfig(env)?.managementOrigin??origin} catch {}
 const headers=new Headers(response.headers)
 headers.set('content-security-policy',`frame-ancestors 'self'${origin==="'none'"?'':` ${origin}`}; frame-src ${origin}; object-src 'none'; base-uri 'self'`)
 headers.set('cache-control','no-store, private')
 headers.append('vary','Cookie')
 return new Response(response.body,{status:response.status,statusText:response.statusText,headers})
}
