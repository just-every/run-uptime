// Edition wiring only. Credential, session and operator authority belongs to Base.
import branding from '../branding.json' with {type:'json'}
import {createOperatorAuth,createAuthHandler,AuthError,isLoopbackHost} from '../base/modules/operator-auth/index.mjs'
// @ts-expect-error Base mail is portable JavaScript validated by its donor suite.
import {createMailSender} from '../base/modules/mail/index.mjs'
import {createD1DevelopmentOutbox} from '../base/modules/mail/src/development/index.mjs'
export interface AuthBindings {DB:D1Database;UPTIME_ORIGIN?:string;UPTIME_LOCAL_REVIEW?:string;OWNER_EMAIL?:string;SESSION_SECRET?:string;SETUP_TOKEN?:string;MAIL_FROM?:string;SENDGRID_API_KEY?:string;MAIL_PROVIDER?:string;RER_OWNER_CLAIM_ISSUER?:string;RER_OWNER_CLAIM_INSTALLATION_ID?:string;RER_OWNER_CLAIM_APP_ORIGIN?:string;RER_OWNER_CLAIM_PUBLIC_KEYS?:string;RER_MANAGEMENT_ORIGIN?:string;RER_INSTALLATION_ID?:string;RER_DEV_KEY?:string;RER_DEV_IDENTITY?:string}
export function developmentMail(env:AuthBindings){
 try{const url=new URL(env.UPTIME_ORIGIN!);return env.UPTIME_LOCAL_REVIEW==='true'&&env.MAIL_PROVIDER==='development'&&url.origin===env.UPTIME_ORIGIN&&isLoopbackHost(url.hostname)&&['http:','https:'].includes(url.protocol)}catch{return false}
}
// The operator-auth configuration; the local-only dev entry builds the same one.
export function authConfig(env:AuthBindings){const local=env.UPTIME_LOCAL_REVIEW==='true';return {origin:env.UPTIME_ORIGIN!,local,branding:{productName:branding.name,accentColor:branding.primaryColor,signInPath:'/login'},OWNER_EMAIL:env.OWNER_EMAIL!,SESSION_SECRET:env.SESSION_SECRET!,...(env.SETUP_TOKEN?{SETUP_TOKEN:env.SETUP_TOKEN}:{}),...(env.MAIL_FROM?{MAIL_FROM:env.MAIL_FROM}:{}),...(local?{ipLimit:1000,emailLimit:1000}:{})}}
export function operatorAuth(env:AuthBindings){
 const local=env.UPTIME_LOCAL_REVIEW==='true',development=developmentMail(env);
 if(env.MAIL_PROVIDER==='development'&&!development)throw new AuthError('invalid_configuration',503);
 return createOperatorAuth({db:env.DB,config:authConfig(env),
 ...(development&&env.MAIL_FROM?{mailSender:createMailSender({provider:'development',mode:'development'},{outbox:createD1DevelopmentOutbox({db:env.DB})})}:env.SENDGRID_API_KEY&&env.MAIL_FROM?{mailSender:createMailSender({provider:'sendgrid',mode:'production',apiKey:env.SENDGRID_API_KEY})}:{}),clientIp:(request:Request)=>local?'loopback':request.headers.get('CF-Connecting-IP')??''})
}
export async function operatorSession(env:AuthBindings,request:Request){const session=await operatorAuth(env).getSession(request);return session?.operator.role==='owner'?session:null}
const authPaths=new Set(['/auth/bootstrap','/auth/magic-link','/auth/confirm','/auth/session','/auth/operators','/auth/sessions','/auth/signout','/auth/invite','/auth/invite/cancel','/auth/operator/status','/auth/operator/role','/auth/session/revoke']);
export async function authRoute(env:AuthBindings,request:Request){try{
 if(!authPaths.has(new URL(request.url).pathname))return new Response('Not found',{status:404});
 return await createAuthHandler(operatorAuth(env))(request)
 }catch(error){return authFailure(error)}}
export function authFailure(error:unknown){return Response.json({error:error instanceof AuthError?error.code:'auth_unavailable'},{status:error instanceof AuthError?error.status:503,headers:{'cache-control':'no-store'}})}
export async function signOut(env:AuthBindings,request:Request){return operatorAuth(env).signOut(request)}
