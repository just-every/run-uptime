import {enrollRunner,validRunnerIdentity} from './domain/runner-registration.server.ts'
import {notificationReadiness,ensureNotificationCustody} from './domain/notification-credentials.server.ts'
import {destinations,createDestination,updateDestination,deleteDestination,rotateDestination} from './domain/notification-destinations.server.ts'
import {notificationOverview,testDestination} from './domain/notifications.server.ts'
import {notificationRpc} from './domain/notification-rpc.server.ts'
import {isPublicAsset} from './domain/assets.server.ts'
import {maintenance} from './domain/maintenance.server.ts'
import {authRoute,authFailure,developmentMail,signOut} from './domain/operator-auth.server.ts'
import {devGate,devNotFound} from './base/modules/operator-auth/index.mjs'
import {createD1DevelopmentOutbox,createDevelopmentOutboxHandler} from './base/modules/mail/src/development/index.mjs'
import {authDocument} from './domain/auth-document.server.ts'
import {firstRun,firstRunComplete,setupRedirect} from './domain/first-run.server.ts'
import {ownerClaim} from './domain/owner-claim.server.ts'
import {editorConfigResponse,editorDocument} from './domain/editor.server.ts'
import {notFoundDocument} from './domain/document-shell.server.ts'
import {issueHeartbeatKey,receiveHeartbeat} from './domain/heartbeat.server'
import start from '@tanstack/react-start/server-entry'
import {Hono} from 'hono'
import {dispatch} from './base/dispatch'
import {recordContact} from './domain/runner-contact.server.ts'
import {session,same,sign,overview,save,get,claim,complete,history,revisions,archive,restore,type Bindings} from './domain/control.server'
const api=new Hono<{Bindings:Bindings;Variables:{requestText:string}}> ()
api.get('/health',async c=>{try{await notificationReadiness(c.env)}catch{return c.json({error:'Notification schema upgrade required'},503)}await c.env.DB.prepare('SELECT 1 FROM monitors LIMIT 1').first();try{await ensureNotificationCustody(c.env,{validate:false})}catch{}return c.json({ok:true,status:'ok',deployment:{sourceSha:c.env.RER_DEPLOY_SOURCE,fingerprint:c.env.RER_DEPLOY_FINGERPRINT,versionId:c.env.RER_VERSION?.id}})})
api.use('/api/*',async(c,next)=>{c.header('cache-control','no-store');const origin=c.req.header('origin');if(c.env.UPTIME_LOCAL_REVIEW!=='true'&&['POST','PATCH','DELETE'].includes(c.req.method)&&!c.req.path.startsWith('/api/runner/')&&!c.req.path.startsWith('/api/heartbeats/')&&origin!==c.env.UPTIME_ORIGIN)return c.json({error:'Same origin required'},403);if(c.req.header('sec-fetch-site')==='cross-site'||(origin&&origin!==new URL(c.req.url).origin))return c.json({error:'Same origin required'},403);if(Number(c.req.header('content-length')??0)>2*1024*1024)return c.json({error:'Payload too large'},413);if(['POST','PATCH'].includes(c.req.method)&&c.req.header('content-type')!=='application/json')return c.json({error:'JSON required'},415);if(['POST','PATCH'].includes(c.req.method)){const reader=c.req.raw.body?.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let size=0,text='';if(reader){try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2*1024*1024){return c.json({error:'Payload too large'},413)}text+=decoder.decode(value,{stream:true})}text+=decoder.decode()}catch(error){if(error instanceof TypeError)return c.json({error:'Invalid UTF-8 request body'},400);throw error}finally{reader.releaseLock()}}c.set('requestText',text)}await next()})
api.post('/api/heartbeats/:id',async c=>{if(c.get('requestText')!=='{}')return c.json({error:'Empty JSON object required'},400);return c.json(await receiveHeartbeat(c.env,c.req.param('id'),c.req.header('authorization')??'',c.req.header('x-heartbeat-sequence')??''))})
api.use('/api/*',async(c,next)=>{if(c.req.path.startsWith('/api/runner/')){if(!c.env.UPTIME_RUNNER_KEY||c.env.UPTIME_RUNNER_KEY.length<24||!await same(c.req.header('x-runner-key')??'',c.env.UPTIME_RUNNER_KEY))return c.json({error:'Runner authorization required'},401);const id=c.req.header('x-runner-id');if(id!==undefined&&!await validRunnerIdentity(c.env,id))return c.json({error:'Runner identity required'},403)}else if(!await session(c.env,c.req.raw))return c.json({error:'Owner session required'},401);await next()})
api.post('/api/auth/sign-out',async c=>{try{const result=await signOut(c.env,c.req.raw);c.header('set-cookie',result.cookie);return c.json({signedOut:true})}catch(error){return authFailure(error)}})
api.get('/api/overview',async c=>c.json(await overview(c.env)))
api.post('/api/monitors',async c=>c.json(await save(c.env,JSON.parse(c.get('requestText'))),201))
api.patch('/api/monitors/:id',async c=>c.json(await save(c.env,JSON.parse(c.get('requestText')),c.req.param('id'))))
api.post('/api/monitors/:id/heartbeat-key',async c=>c.json(await issueHeartbeatKey(c.env,c.req.param('id'))))
api.get('/api/monitors/:id/history',async c=>c.json(await history(c.env,c.req.param('id'))))
api.get('/api/monitors/:id/revisions',async c=>c.json(await revisions(c.env,c.req.param('id'))))
api.post('/api/monitors/:id/run',async c=>{const m=await get(c.env,c.req.param('id'));if(!m||!m.definition.enabled)return c.json({error:'Monitor unavailable or paused'},409);const id=`${m.id}:${m.revision}:manual:${crypto.randomUUID()}`;await c.env.DB.prepare("INSERT INTO slots(id,monitor_id,revision,due_at,status,definition,lease_owner,lease_until,missed_count,manual) VALUES(?,?,?,?,'queued',?,'unclaimed',0,0,1)").bind(id,m.id,m.revision,Date.now(),JSON.stringify(m.definition)).run();return c.json({queued:true,slotId:id,policyAdvanced:false})})
api.post('/api/runner/enroll',async c=>{const registration=await enrollRunner(c.env,c.get('requestText'),c.req.header('x-sent-at')??'',c.req.header('x-runner-signature')??'');return registration?c.json(registration):c.json({error:'Invalid signed enrolment'},403)})
api.post('/api/runner/claim',async c=>{const task=await claim(c.env,c.req.header('x-runner-id'));await recordContact(c.env.DB);return c.json({task})})
api.post('/api/runner/results',async c=>{const text=c.get('requestText'),timestamp=c.req.header('x-sent-at')??'';if(new TextEncoder().encode(text).byteLength>40000||!Number.isFinite(Number(timestamp))||Math.abs(Date.now()-Number(timestamp))>60000||!await same(c.req.header('x-runner-signature')??'',await sign(c.env.UPTIME_RUNNER_KEY,`${timestamp}.${text}`)))return c.json({error:'Invalid signed result'},403);return c.json(await complete(c.env,JSON.parse(text),c.req.header('x-runner-id')))})
api.get('/api/archive',async c=>c.json(await archive(c.env)))
api.post('/api/restore',async c=>c.json(await restore(c.env,JSON.parse(c.get('requestText')))))
api.get('/api/notifications',async c=>c.json(await notificationOverview(c.env)))
api.get('/api/notifications/destinations',async c=>c.json(await destinations(c.env)))
api.post('/api/notifications/destinations',async c=>c.json(await createDestination(c.env,JSON.parse(c.get('requestText'))),201))
api.patch('/api/notifications/destinations/:id',async c=>c.json(await updateDestination(c.env,c.req.param('id'),JSON.parse(c.get('requestText')))))
api.delete('/api/notifications/destinations/:id',async c=>c.json(await deleteDestination(c.env,c.req.param('id'))))
api.post('/api/notifications/destinations/:id/rotate',async c=>c.json(await rotateDestination(c.env,c.req.param('id'))))
api.post('/api/notifications/destinations/:id/test',async c=>c.json(await testDestination(c.env,c.req.param('id')),202))
api.post('/api/runner/notifications',async c=>c.json(await notificationRpc(c.env,JSON.parse(c.get('requestText')))))
api.onError((error,c)=>{const limited=(error as Error&{status?:number}).status===429;if(limited)c.header('retry-after','60');return c.json({error:error.message.startsWith('D1')?'Storage operation failed':error.message},limited?429:400)})
// The marketing landing and public docs carry no installation data and need no session.
const isPublicDocument=(path:string)=>path==='/'||path==='/docs'||path.startsWith('/docs/')
// One monitor's page in the console (/app/monitors/<id>); it is gated like /app.
const isMonitorPage=(path:string)=>/^\/app\/monitors\/[^/]+\/?$/.test(path)
// A monitor page whose id is not valid percent-encoding names no monitor; after the session check it gets the 404 page.
const undecodableMonitorId=(path:string)=>{try{decodeURIComponent(path.slice('/app/monitors/'.length).replace(/\/$/,''));return false}catch{return true}}
// The private console documents: the monitor list, the monitor editor and each monitor's page.
const isConsoleDocument=(path:string)=>['/app','/app/','/app/monitor','/app/monitor/'].includes(path)||isMonitorPage(path)
export default {async fetch(request,env,execution){
 const bindings=env as Bindings,url=new URL(request.url),path=url.pathname;
 // This deliberately public local viewer must disappear before the normal Host guard.
 // The outbox and the key exchange answer only a local runtime that holds RER_DEV_KEY. A tunnel or local proxy makes remote
 // requests look local, so the outbox also needs the key gate's cookie (or the rer harness's key header).
 if(path==='/__dev/outbox'||path==='/__dev/key'){
  const gate=developmentMail(bindings)?devGate({key:bindings.RER_DEV_KEY,origin:bindings.UPTIME_ORIGIN!,local:true}):null;
  if(!gate)return devNotFound();
  if(path==='/__dev/key')return (await gate.exchange(request))??devNotFound();
  if(!await gate.admits(request))return devNotFound();
  return (await createDevelopmentOutboxHandler({local:true,origin:bindings.UPTIME_ORIGIN!,outbox:createD1DevelopmentOutbox({db:bindings.DB})})(request))??devNotFound();
 }
 if(url.origin!==bindings.UPTIME_ORIGIN||(request.headers.has('host')&&request.headers.get('host')?.toLowerCase()!==url.host.toLowerCase()))return new Response('Invalid host',{status:403});
 if(path==='/auth/owner-claim')return (await ownerClaim(bindings,request))!;
 if(path==='/api/editor/config')return editorConfigResponse(bindings,request);
 if(path.startsWith('/auth/'))return (await authRoute(bindings,request))!;
 if(path==='/setup')return firstRun(bindings,request);
 if(path==='/login'||path==='/claim')return authDocument(path==='/claim',path==='/login'&&url.searchParams.get('notice')==='sent',developmentMail(bindings));
 if(isPublicAsset(path))return bindings.ASSETS?bindings.ASSETS.fetch(request):new Response('Not found',{status:404});
 if(path==='/monitor'||path==='/monitor/')return new Response(null,{status:308,headers:{location:`/app/monitor${url.search}`,'cache-control':'no-store'}});
 if(path!=='/health'&&path!=='/api'&&!path.startsWith('/api/')&&!isPublicDocument(path)){
  // Only native document routes and Start transports reach the private renderer.
  if(!isConsoleDocument(path)&&!path.startsWith('/_serverFn/'))return notFoundDocument();
  try{if(!await session(bindings,request))return new Response(null,{status:303,headers:{location:'/login','cache-control':'no-store'}});if(!await firstRunComplete(bindings))return setupRedirect()}catch(error){return authFailure(error)}
  if(isMonitorPage(path)&&undecodableMonitorId(path))return notFoundDocument();
 }
 const response=await dispatch(request,()=>api.fetch(request,bindings,execution),()=>start.fetch(request));
 return isConsoleDocument(path)?editorDocument(response,bindings):response
},async scheduled(_controller,env){await maintenance(env as Bindings)}} satisfies ExportedHandler
