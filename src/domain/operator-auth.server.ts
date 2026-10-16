import {auditStatement} from './audit.server.ts'
// Edition wiring only. Credential, session and operator authority belongs to Base.
import {mailSender} from './mail.server.ts'
import branding from '../branding.json' with {type:'json'}
import {createOperatorAuth,createAuthHandler,createSignInHandler,AuthError,isLoopbackHost} from '@runeditrun/rer/modules/operator-auth'
import {operatorMailSender} from './operator-mail.server.ts'
export interface AuthBindings {RER_DEMO?:string;RER_DEMO_EXPIRES?:string;DB:D1Database;UPTIME_ORIGIN?:string;UPTIME_LOCAL_REVIEW?:string;OWNER_EMAIL?:string;SESSION_SECRET?:string;SETUP_TOKEN?:string;MAIL_FROM?:string;SENDGRID_API_KEY?:string;MAIL_PROVIDER?:string;MAIL_API_KEY?:string;MAIL_RELAY_URL?:string;MAIL_PROVIDER_API_KEY?:string;MAIL_ACCOUNT_ID?:string;CLOUDFLARE_MAIL_API_KEY?:string;RER_OWNER_CLAIM_ISSUER?:string;RER_OWNER_CLAIM_INSTALLATION_ID?:string;RER_OWNER_CLAIM_APP_ORIGIN?:string;RER_OWNER_CLAIM_PUBLIC_KEYS?:string;RER_MANAGEMENT_ORIGIN?:string;RER_INSTALLATION_ID?:string;RER_DEV_KEY?:string;RER_DEV_IDENTITY?:string}
export function developmentMail(env:AuthBindings){
 if(env.RER_DEMO==='1'&&env.MAIL_PROVIDER==='development')return true;
 try{const url=new URL(env.UPTIME_ORIGIN!);return env.UPTIME_LOCAL_REVIEW==='true'&&env.MAIL_PROVIDER==='development'&&url.origin===env.UPTIME_ORIGIN&&isLoopbackHost(url.hostname)&&['http:','https:'].includes(url.protocol)}catch{return false}
}
// The operator-auth configuration; the local-only dev entry builds the same one.
export function authConfig(env:AuthBindings){const local=env.UPTIME_LOCAL_REVIEW==='true';return {origin:env.UPTIME_ORIGIN!,local,branding:{productName:branding.name,accentColor:branding.primaryColor,signInPath:'/login'},OWNER_EMAIL:env.OWNER_EMAIL!,SESSION_SECRET:env.SESSION_SECRET!,...(env.SETUP_TOKEN?{SETUP_TOKEN:env.SETUP_TOKEN}:{}),...(env.MAIL_FROM?{MAIL_FROM:env.MAIL_FROM}:{}),...(local?{ipLimit:1000,emailLimit:1000}:{})}}
export function operatorAuth(env:AuthBindings){
 const local=env.UPTIME_LOCAL_REVIEW==='true',development=developmentMail(env);
 if(env.MAIL_PROVIDER==='development'&&!development)throw new AuthError('invalid_configuration',503);
 return createOperatorAuth({db:env.DB,config:authConfig(env),
 ...(mailSender(env)?{mailSender:operatorMailSender(env,development)}:{}),clientIp:(request:Request)=>local?'loopback':request.headers.get('CF-Connecting-IP')??''})
}
// Base validates the identity; the edition separately limits product access to owners.
// Document gates need the authenticated identity to distinguish a refused member from a signed-out visitor.
export async function authenticatedSession(env:AuthBindings,request:Request){return operatorAuth(env).getSession(request)}
export async function operatorSession(env:AuthBindings,request:Request){const session=await authenticatedSession(env,request);return session?.operator.role==='owner'?session:null}
const authPaths=new Set(['/auth/owner-signin','/auth/bootstrap','/auth/magic-link','/auth/confirm','/auth/session','/auth/operators','/auth/sessions','/auth/signout','/auth/invite','/auth/invite/cancel','/auth/operator/status','/auth/operator/role','/auth/session/revoke','/auth/setup-complete']);
export async function authRoute(env:AuthBindings,request:Request){try{
 if(!authPaths.has(new URL(request.url).pathname))return new Response('Not found',{status:404});
 let configured=env;
 if(new URL(request.url).pathname==='/auth/session/revoke'){
  const actor=await operatorSession(env,request);
  if(actor){const db=env.DB;configured={...env,DB:{prepare(sql:string){const statement=db.prepare(sql);if(!sql.startsWith('UPDATE oa_sessions SET revoked_at='))return statement;const wrap=(prepared:D1PreparedStatement):D1PreparedStatement=>new Proxy(prepared,{get(target,key){if(key==='bind')return (...values:any[])=>wrap(target.bind(...values));if(key==='run')return async()=>{const results=await db.batch([target,auditStatement(env,{kind:'operator',ref:actor.operator.id},'session_revoke','session',crypto.randomUUID(),'changes()>0')]);return results[0]};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value}});return wrap(statement)},batch:db.batch.bind(db),exec:db.exec.bind(db),dump:db.dump.bind(db),withSession:db.withSession?.bind(db)} as D1Database}}
 }
 return await createAuthHandler(operatorAuth(configured))(request)
 }catch(error){return authFailure(error)}}
export function authFailure(error:unknown){return Response.json({error:error instanceof AuthError?error.code:'auth_unavailable'},{status:error instanceof AuthError?error.status:503,headers:{'cache-control':'no-store'}})}
export async function signOut(env:AuthBindings,request:Request){return operatorAuth(env).signOut(request)}

// Keep /signin as a browser alias; /login is the declared sign-in and native return path.
// Render the alias through Base so validation, escaping and login_hint stay shared.
export async function signInDocument(env:AuthBindings,request:Request){
 const url=new URL(request.url);url.pathname='/login';
 if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{allow:'GET, HEAD'}});
 return (await createSignInHandler(operatorAuth(env),{defaultReturnTo:'/setup'})(new Request(url,request)))!;
}
