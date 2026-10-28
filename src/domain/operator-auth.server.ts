import {checkSecondFactor,MfaError} from './mfa/policy.server.ts'
import {auditSql} from './audit.server.ts'
import {permission,accessResponse} from './access.server.ts'
import {authorizedDatabase} from './access-database.server.ts'
// Edition wiring only. Credential, session and operator authority belongs to Base.
import {mailSender} from './mail.server.ts'
import branding from '../branding.json' with {type:'json'}
import {createOperatorAuth,createAuthHandler,createSignInHandler,AuthError,isLoopbackHost} from '@runeditrun/rer/modules/operator-auth'
import {operatorMailSender} from './operator-mail.server.ts'
export interface AuthBindings {RER_DEMO?:string;RER_DEMO_EXPIRES?:string;DB:D1Database;UPTIME_ORIGIN?:string;UPTIME_LOCAL_REVIEW?:string;OWNER_EMAIL?:string;SESSION_SECRET?:string;SETUP_TOKEN?:string;MAIL_FROM?:string;SENDGRID_API_KEY?:string;MAIL_PROVIDER?:string;MAIL_API_KEY?:string;MAIL_RELAY_URL?:string;MAIL_PROVIDER_API_KEY?:string;MAIL_ACCOUNT_ID?:string;CLOUDFLARE_MAIL_API_KEY?:string;RER_OWNER_CLAIM_ISSUER?:string;RER_OWNER_CLAIM_INSTALLATION_ID?:string;RER_OWNER_CLAIM_APP_ORIGIN?:string;RER_OWNER_CLAIM_PUBLIC_KEYS?:string;RER_IMPORT_DOOR?:string;RER_MANAGEMENT_ORIGIN?:string;RER_INSTALLATION_ID?:string;RER_BUSINESS_TRUST?:string;RER_DEV_KEY?:string;RER_DEV_IDENTITY?:string}
export function developmentMail(env:AuthBindings){
 if(env.RER_DEMO==='1'&&env.MAIL_PROVIDER==='development')return true;
 try{const url=new URL(env.UPTIME_ORIGIN!);return env.UPTIME_LOCAL_REVIEW==='true'&&env.MAIL_PROVIDER==='development'&&url.origin===env.UPTIME_ORIGIN&&isLoopbackHost(url.hostname)&&['http:','https:'].includes(url.protocol)}catch{return false}
}
// The operator-auth configuration; the local-only dev entry builds the same one. Its sign-in and confirmation pages wear the
// same theme and mark as the Lobby (src/identity.ts).
export function authConfig(env:AuthBindings){const local=env.UPTIME_LOCAL_REVIEW==='true';return {origin:env.UPTIME_ORIGIN!,local,branding:{productName:branding.name,accentColor:branding.primaryColor,signInPath:'/login',theme:'/rer-theme.css',mark:'/brand/mark.svg'},OWNER_EMAIL:env.OWNER_EMAIL!,SESSION_SECRET:env.SESSION_SECRET!,...(env.SETUP_TOKEN?{SETUP_TOKEN:env.SETUP_TOKEN}:{}),...(env.MAIL_FROM?{MAIL_FROM:env.MAIL_FROM}:{}),...(local?{ipLimit:1000,emailLimit:1000}:{})}}
export function operatorAuth(env:AuthBindings){
 const local=env.UPTIME_LOCAL_REVIEW==='true',development=developmentMail(env);
 if(env.MAIL_PROVIDER==='development'&&!development)throw new AuthError('invalid_configuration',503);
 return createOperatorAuth({db:env.DB,config:authConfig(env),
 hooks:{audit:({action,actorId,now})=>action==='sessions.revoke'?[auditSql({kind:'operator',ref:actorId},'session_revoke','session',crypto.randomUUID(),'1',[],now)]:[]},
 ...(mailSender(env)?{mailSender:operatorMailSender(env,development)}:{}),clientIp:(request:Request)=>local?'loopback':request.headers.get('CF-Connecting-IP')??''})
}
// Base validates identity. The shared product policy narrows ordinary access;
// this owner-only helper remains for services with explicit owner contracts.
// Document gates need the authenticated identity to distinguish a refused member from a signed-out visitor.
export async function authenticatedSession(env:AuthBindings,request:Request){return operatorAuth(env).getSession(request)}
export async function operatorSession(env:AuthBindings,request:Request){const session=await authenticatedSession(env,request);return session?.operator.role==='owner'?session:null}
const authPaths=new Set(['/auth/owner-signin','/auth/one-click','/auth/bootstrap','/auth/magic-link','/auth/confirm','/auth/session','/auth/operators','/auth/sessions','/auth/signout','/auth/invite','/auth/invite/cancel','/auth/operator/status','/auth/operator/role','/auth/session/revoke','/auth/setup-complete']);
export async function authRoute(env:AuthBindings,request:Request){try{
 if(!authPaths.has(new URL(request.url).pathname))return new Response('Not found',{status:404});
 let configured=env;
 const path=new URL(request.url).pathname;
 if((path==='/auth/operators'&&request.method==='GET')||(['/auth/invite','/auth/invite/cancel','/auth/operator/status','/auth/operator/role'].includes(path)&&request.method==='POST')){
  try{const actor=await permission(env,request);configured={...env,DB:authorizedDatabase(env,actor)}}catch(error){const denied=accessResponse(error);if(denied)return Response.json({error:'forbidden'},{status:403,headers:{'cache-control':'no-store'}});throw error}
 }
 if(path==='/auth/sessions'||path==='/auth/session/revoke'){
  const principal=await authenticatedSession(env,request)
  let own=path==='/auth/sessions'&&(!new URL(request.url).searchParams.get('operatorId')||new URL(request.url).searchParams.get('operatorId')===principal?.operator.id)
  if(path==='/auth/session/revoke'&&principal){
   let input:any;try{const copy=request.clone();input=(copy.headers.get('content-type')??'').startsWith('application/json')?await copy.json():Object.fromEntries(await copy.formData())}catch{}
   const target=typeof input?.sessionId==='string'?await env.DB.prepare('SELECT operator_id FROM oa_sessions WHERE id=?').bind(input.sessionId).first<{operator_id:string}>():null
   own=target?.operator_id===principal.operator.id
  }
  if(!own){try{const actor=await permission(env,request,undefined,{action:'members',workspace:true});configured={...env,DB:authorizedDatabase(env,actor)}}catch(error){if(accessResponse(error))return Response.json({error:'forbidden'},{status:principal?403:401});throw error}}
 }
 return await createAuthHandler(operatorAuth(configured))(request)
 }catch(error){return authFailure(error)}}
export function authFailure(error:unknown){return Response.json({error:error instanceof AuthError?error.code:'auth_unavailable'},{status:error instanceof AuthError?error.status:503,headers:{'cache-control':'no-store'}})}
export async function signOut(env:AuthBindings,request:Request){return operatorAuth(env).signOut(request)}

// A Base session may still owe its installation's second factor. Reuse the
// console's proof gate before forwarding either sign-in document.
export async function signedInOwnerRedirect(env:AuthBindings,request:Request){
 if(!['GET','HEAD'].includes(request.method))return null;
 try{
  const session=await authenticatedSession(env,request);
  if(session?.operator.role!=='owner')return null;
  await checkSecondFactor(env,session);
  return new Response(null,{status:303,headers:{location:'/app','cache-control':'no-store, private'}});
 }catch(error){if(error instanceof MfaError&&error.code==='second_factor_required')return null;return authFailure(error)}
}

// Keep /signin as a browser alias; /login is the declared sign-in and native return path.
// Render the alias through Base so validation, escaping and login_hint stay shared.
export async function signInDocument(env:AuthBindings,request:Request){
 const forward=await signedInOwnerRedirect(env,request);if(forward)return forward;
 const url=new URL(request.url);url.pathname='/login';
 if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{allow:'GET, HEAD'}});
 return (await createSignInHandler(operatorAuth(env),{defaultReturnTo:'/setup'})(new Request(url,request)))!;
}
