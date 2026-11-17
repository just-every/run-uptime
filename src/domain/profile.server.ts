import {operatorAuth,type AuthBindings} from './operator-auth.server.ts'
import {permission} from './access.server.ts'
import {authorizedDatabase} from './access-database.server.ts'
import {InputError} from './request-boundary.ts'

// A private edition door to Base's self-service account methods. The body
// cannot select another account; Base rechecks this session and fresh proof.
export async function changeProfile(env:AuthBindings,request:Request,input:unknown){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==1)throw new InputError('Change one account detail at a time.')
 const access=await permission(env,request,undefined,{action:'read',workspace:false})
 const auth=operatorAuth({...env,DB:authorizedDatabase(env,access)})
 const value=input as Record<string,unknown>
 if(Object.hasOwn(value,'displayName'))return auth.changeDisplayName!(request,{displayName:value.displayName as string})
 if(Object.hasOwn(value,'email'))return auth.changeEmail!(request,{email:value.email as string})
 if(value.confirm===true)return auth.requestStepUp(request,{action:'email:change',returnTo:'/app/settings/people'})
 throw new InputError('Choose your name or email to change.')
}
