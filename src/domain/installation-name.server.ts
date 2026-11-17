import branding from '../branding.json' with {type:'json'}
import {businessSettings} from '../agent-door/people.server.ts'
import {permission,AccessError} from './access.server.ts'
import {authorizedDatabase} from './access-database.server.ts'
import {InputError} from './request-boundary.ts'
import type {Bindings} from './control.server.ts'

// The local override wins over a provisioned name; identifiers and deployment
// settings stay independent of the name the owner gives this installation.
export async function installationName(env:Bindings):Promise<string>{
 return await businessSettings(env).resolve('display_name',branding.name) as string
}

export function validateInstallationName(value:unknown):string{
 if(typeof value!=='string'||!value.trim()||value.trim().length>120||/[\x00-\x1f\x7f-\x9f]/.test(value))throw new InputError('Enter an installation name of 1–120 characters.')
 return value.trim()
}

// Setup and Settings share the same owner-only, transaction-fenced write.
export async function saveInstallationName(env:Bindings,request:Request,value:unknown):Promise<string>{
 if(!['POST','PATCH'].includes(request.method))throw new InputError('Use POST or PATCH to change the installation name.')
 if(request.headers.get('origin')!==env.UPTIME_ORIGIN||request.headers.get('sec-fetch-site')==='cross-site')throw new AccessError(403,'Same origin required')
 const access=await permission(env,request,undefined,{action:'owner',workspace:true}),name=validateInstallationName(value)
 const settings=businessSettings({...env,DB:authorizedDatabase(env,access)})
 await settings.setOverride('display_name',name,access.session.operator.id)
 return name
}

export async function installationNameResponse(env:Bindings,request:Request,input?:unknown):Promise<Response>{
 const headers={'cache-control':'no-store, private'}
 if(request.method==='GET'){
  await permission(env,request,undefined,{action:'owner',workspace:true})
  return Response.json({installationName:await installationName(env)},{headers})
 }
 if(request.method!=='PATCH')return new Response(null,{status:405,headers:{...headers,allow:'GET, PATCH'}})
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==1||!Object.hasOwn(input,'installationName'))throw new InputError('Provide only the installation name.')
 return Response.json({installationName:await saveInstallationName(env,request,(input as {installationName:unknown}).installationName)},{headers})
}
