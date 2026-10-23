import {credentialPermission} from './domain/access.server.ts'
import {credentialKeys} from './domain/credentials/store.server.ts'
import {monitoringCapability} from './domain/credentials/model.server.ts'
import {readTeams,saveTeam,readRecipient,consentRecipient} from './domain/alert-teams.server.ts'
import {mfaDoor,earlyMfaGate} from './domain/mfa/door.server.ts'
import {isConsoleDocument,isMonitorPage,canonicalConsolePath,consoleRedirect} from './ui/console-paths.ts'
import {monitoringMonitors,monitoringMonitor} from './domain/read-api/monitors.server.ts'
import {bulkUptime} from './domain/read-api/bulk.server.ts'
import {bulkUptimeCsv,incidentListCsv} from './domain/read-api/csv.ts'
import {failureEvidenceDocument,failureEvidenceDenied} from './domain/failure-evidence-document.server.ts'
import {evidencePrincipal,evidenceAccess,saveEvidenceAccess,evidenceSelection} from './domain/failure-evidence-access.server.ts'
import {incidentDetail} from './domain/incident-work/read.server.ts'
import {readSnapshots,saveSnapshotSettings,eraseSnapshots,incidentSnapshots} from './domain/failure-snapshots.server.ts'
import {authorizeMetrics,metricsKeys,createMetricsKey,revokeMetricsKey} from './domain/metrics/auth.server.ts'
import {metricsSnapshot} from './domain/metrics/snapshot.server.ts'
import {prometheusMetrics} from './domain/metrics/prometheus.ts'
import {registerHeartbeatReceipts} from './domain/heartbeat-routes.server.ts'
import {importContactSchedule} from './domain/contact-schedule-import.ts'
import {saveNotificationPreferences,initializeNotificationTimeZone} from './domain/notification-preferences.server.ts'
import {proposedWebhookPreview,savedWebhookPreview} from './domain/notification-webhook.ts'
// @ts-ignore Source definition parser shared with the owner preview.
import {previewUptimeRobotWebhook} from './domain/webhook-contact-import.mjs'
import {configureHeartbeat,heartbeatRuns} from './domain/heartbeat-jobs.server.ts'
import {catalogBulkPreview,catalogBulkApply,catalogAddPreview,catalogAddApply} from './domain/catalog.server.ts'
import {importSlowPolicy} from './domain/slow-import.ts'
import {readSlowPolicy,saveSlowPolicy} from './domain/slow-config.server.ts'
import {acknowledgeSlow} from './domain/slow-ack.server.ts'
import {cleanupDebt,resolveCleanupDebt} from './domain/cleanup-debt.server.ts'
import {effectGrants,grantEffect,revokeEffect,spendGrant} from './domain/effect-grants.server.ts'
import {rumDoor} from './domain/rum/door.server.ts'
import {registerRumRoutes} from './domain/rum/routes.server.ts'
import {readAlertRoute,previewAlertRoute,applyAlertRoute,sampleAlertRoute} from './domain/alert-routes.server.ts'
import {previewMaintenance,applyMaintenance,cancelMaintenance} from './domain/planned-maintenance.server.ts'
// The package's demo module: operator-auth runs from the package and reads demo mode from this same instance.
import {withDemo} from '@runeditrun/rer/modules/demo'
import {kickHostedWork} from './domain/worker-kick.server.ts'
import {recordCronRun} from './domain/cron-run.server.ts'
import {scheduledPublicChecks} from './domain/worker-checks.server.ts'
import {seedDemo} from './demo.ts'
import {demoBindings} from './domain/demo.server.ts'
import {incidentWorkRequest} from './domain/incident-work/handler.server.ts'
import {incidentList} from './domain/incident-list.server.ts'
import {incidents} from './domain/incidents.server.ts'
import {readApiOpenApi} from './domain/read-api-openapi.ts'
import {monitorReport,monitorLatency,reportCsv,ReportInputError} from './domain/reports/index.server.ts'
import {monitoringWatch} from './domain/monitoring-watch.server.ts'
import {scheduledNotifications} from './domain/notification-worker.server.ts'
import {SubrequestBudget,RUN_SUBREQUESTS,CHECK_SUBREQUESTS,WATCH_SUBREQUESTS} from './domain/worker-budget.ts'
import {createDiscovery,createCatalogCheck,readDiscovery,claimDiscovery,completeDiscovery,discoveryAnswer,DISCOVERY_RESULT_BYTES} from './domain/discovery.server.ts'
import {catalogDocument,followServices,reviewFollowed,linkDependency,acknowledgeNotice} from './domain/service-catalog.server.ts'
import {sourcesDocument,authorizeSource,reauthorizeSource,revokeSource,startSourceRun,sourceDocument,decideProposal} from './domain/discovery-sources.server.ts'
import {readExternalCheck,saveExternalCheck} from './domain/external-check.server.ts'
import {checkAllFrom} from './domain/location-monitors.server.ts'
import {runnerScriptResponse} from './domain/runner-script.server.ts'
// @ts-ignore Shared bounded credential diagnostics.
import {runnerResultLimit} from './domain/credential-binding.mjs'
import {signedRunnerBody} from './domain/runner-signature.server.ts'
import {enrollRunner,authenticateRunner,createRunner,joinRunner,renameRunner,revokeRunner,listRunners,ensureFirstRunner,nameFromPlace,type Runner} from './domain/runner-registration.server.ts'
import {configurationResponse,validateWorkerConfiguration} from './domain/startup-config.mjs'
import {isPublicDocument,publicPath} from './domain/public-paths.ts'
import {limitPublicRequest} from './domain/public-rate-limits.server.ts'
import {erase} from './domain/erasure.server.ts'
import {recogniseFile,exportDefinitions} from './domain/definitions/index.server.ts'
import {doorPlanView} from './domain/business-import/plan-view.server.ts'
import {businessImportDoor,ownerImportDoor} from './domain/business-import/door.server.ts'
import {businessImportSettings} from './domain/business-import/settings.server.ts'
import {afterClaim,openDoorForOwner} from './domain/business-import/claim-door.server.ts'
import {rerRunnerStatus} from './domain/rer-runner-status.server.ts'
import {rerCutoverStatus} from './domain/rer-cutover-status.server.ts'
import {definitionImportHistory,undoDefinitionImport} from './domain/business-import/history.server.ts'
import {archiveRestoreAvailable} from './domain/archive.server.ts';
import {exportJournal} from './domain/archive-fence.server.ts'
import {operatorSession,authenticatedSession} from './domain/operator-auth.server.ts'
import {accessDeniedDocument} from './domain/access-document.server.ts'
import {boundedHealth,health} from './domain/health.server.ts'
import {permission,accessResponse,type Access} from './domain/access.server.ts'
import {authorizedDatabase,auditAccess} from './domain/access-database.server.ts'
import {accessMembers} from './domain/access-members.server.ts'
import {monitorEditor} from './domain/monitor-editor.server.ts'
import {destinations,createDestination,updateDestination,rotateDestination} from './domain/notification-destinations.server.ts'
import {notificationOverview,testDestination} from './domain/notifications.server.ts'
import {notificationRpc} from './domain/notification-rpc.server.ts'
import {startDrill} from './domain/alert-drills.server.ts'
import {alertDrillDocument} from './domain/alert-drill-document.server.ts'
import {isPublicAsset,publicAssetResponse} from './domain/assets.server.ts'
import {classifyStorage,storageLogLine,storageOperation} from './domain/storage-error.ts'
import {maintenance} from './domain/maintenance.server.ts'
import {authRoute,authFailure,developmentMail,signOut,signInDocument} from './domain/operator-auth.server.ts'
import {authDocument,nativeClaimFailure} from './domain/auth-document.server.ts'
import {firstRun,firstRunComplete,setupRedirect} from './domain/first-run.server.ts'
import {ownerClaim} from './domain/owner-claim.server.ts'
import {editorConfigResponse,editorDocument} from './domain/editor.server.ts'
import {notFoundDocument} from './domain/document-shell.server.ts'
import {issueHeartbeatKey,receiveHeartbeat} from './domain/heartbeat.server'
import start from '@tanstack/react-start/server-entry'
import {Hono} from 'hono'
import {dispatch} from './base/dispatch'
import {lobbyResponse} from './base/lobby'
import {claimedWhen,setupStateResponse} from './base/setup-state'
import {identity} from './identity'
import {recordContact} from './domain/runner-contact.server.ts'
import {session,overview,save,get,claim,complete,history,revisions,archive,restore,type Bindings} from './domain/control.server'
import {checkInput,InputError} from './domain/request-boundary.ts'
const api=new Hono<{Bindings:Bindings;Variables:{requestText:string;input:any;runner:Runner;access:Access;systemBindings:Bindings}}> ()
api.get('/health',c=>health(c.env))
api.use('/api/*',async(c,next)=>{c.set('systemBindings',c.env);c.header('cache-control','no-store');const origin=c.req.header('origin');if(c.env.UPTIME_LOCAL_REVIEW!=='true'&&['POST','PATCH','DELETE'].includes(c.req.method)&&!c.req.path.startsWith('/api/runner/')&&!c.req.path.startsWith('/api/heartbeats/')&&origin!==c.env.UPTIME_ORIGIN)return c.json({error:'Same origin required'},403);if(c.req.header('sec-fetch-site')==='cross-site'||(origin&&origin!==new URL(c.req.url).origin))return c.json({error:'Same origin required'},403);if(Number(c.req.header('content-length')??0)>2*1024*1024)return c.json({error:'Payload too large'},413);if(['POST','PATCH'].includes(c.req.method)&&!c.req.path.startsWith('/api/heartbeats/')&&c.req.header('content-type')!=='application/json'&&!(c.req.path==='/api/definitions/recognise'&&c.req.header('content-type')==='text/csv'))return c.json({error:'JSON required'},415);if(['POST','PATCH'].includes(c.req.method)){const reader=c.req.raw.body?.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let size=0,text='';if(reader){try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>(c.req.path.startsWith('/api/heartbeats/')?10240:2*1024*1024)){return c.json({error:'Payload too large'},413)}text+=decoder.decode(value,{stream:true})}text+=decoder.decode()}catch(error){if(error instanceof TypeError)return c.json({error:'Invalid UTF-8 request body'},400);throw error}finally{reader.releaseLock()}}c.set('requestText',text)}await next()})
// Every route's path, query and body schema, once the caller's authority is known and before any service (request-boundary.ts).
// Heartbeats carry their own token, so their input is checked before their handler.
const boundary=async(c:any,next:()=>Promise<void>)=>{const headers=c.req.raw.headers,hasBody=Number(headers.get('content-length')??0)>0||headers.has('transfer-encoding');let checked;try{checked=checkInput(c.req.method==='HEAD'?'GET':c.req.method,new URL(c.req.url),c.get('requestText')??'',hasBody)}catch(error){if(error instanceof InputError)return c.json({error:error.message},400);throw error}if(!checked)return c.json({error:'Not found'},404);c.set('input',checked.body);await next()}
api.use('/api/heartbeats/*',boundary)
registerHeartbeatReceipts(api)
api.use('/api/*',async(c,next)=>{
 if(c.req.path==='/api/v1/openapi.json'&&['GET','HEAD'].includes(c.req.method)){await next();return}
 if(c.req.header('authorization')?.toLowerCase().startsWith('bearer ')){
  if(!monitoringCapability(c.req.raw))return c.json({error:'Credential does not authorize this method or path'},403)
  const credential=await credentialPermission(c.env,c.req.raw)
  if(credential){c.env={...c.env,readCredential:credential};c.header('ratelimit','limit=60, reset='+String(60-Math.floor(Date.now()/1000)%60));c.header('ratelimit-policy','60;w=60')}
  else if(c.req.path!=='/api/v1/metrics'||!await authorizeMetrics(c.env,c.req.raw))return c.json({error:'Credential required'},401)
 }else if(/^\/api\/evidence\/monitors\/[^/]+$/.test(c.req.path)&&['GET','HEAD'].includes(c.req.method)){
  const id=decodeURIComponent(c.req.path.split('/').pop()!);if(!await evidencePrincipal(c.env,c.req.raw,id))return c.json({error:'Evidence access required'},await authenticatedSession(c.env,c.req.raw)?403:401)
 }else if(c.req.path==='/api/runner/join'){/* One-time join capability. */}
 else if(c.req.path.startsWith('/api/runner/')){
  const row=await storageOperation('runner.authenticate',()=>authenticateRunner(c.env,c.req.header('x-runner-id'),c.req.header('x-runner-key')??''));if(!row)return c.json({error:'Runner authorization required'},401);c.set('runner',row)
 }else{
  let input;try{input=JSON.parse(c.get('requestText')||'{}')}catch{/* The schema boundary returns the input error. */}
  try{
   const access=await permission(c.env,c.req.raw,input)
   c.set('access',access)
   if(!['read','export'].includes(access.action)&&!c.req.path.startsWith('/api/access/')&&!/^\/api\/(?:monitors|operators)\/[^/]+\/erase$/.test(c.req.path)&&!(c.req.method==='DELETE'&&c.req.path.startsWith('/api/notifications/destinations/')))c.env={...c.env,DB:authorizedDatabase(c.env,access)}
  }catch(error){const denied=accessResponse(error);if(denied)return denied;throw error}
 }
 await next()
})
api.use('/api/*',boundary)
api.use('/api/*',async(c,next)=>{
 const access=c.get('access')
 if(access&&(access.action==='export'||access.action==='read'&&(['csv','pdf'].includes(c.req.query('format')??'')||/text\/csv|application\/pdf/.test(c.req.header('accept')??''))))await auditAccess(c.env,access)
 await next()
})
// Only authenticated owner requests can kick hosted work; public traffic and private runners cannot.
api.use('/api/*',async(c,next)=>{await next();if(c.res.ok&&(c.req.path==='/api/overview'||/^\/api\/(monitors|notifications)(\/|$)/.test(c.req.path))){c.executionCtx.waitUntil(kickHostedWork(c.get('systemBindings')??c.env).catch(()=>console.error('Hosted console work failed; queued work remains available to Cron.')))}})
api.get('/api/routing/teams',async c=>c.json(await readTeams(c.env)))
api.post('/api/routing/teams',async c=>c.json(await saveTeam(c.env,c.get('input'),c.get('access'))))
api.get('/api/routing/recipient',async c=>c.json(await readRecipient(c.env,c.get('access'))))
api.post('/api/routing/recipient',async c=>c.json(await consentRecipient(c.env,c.get('input'),c.get('access'))))
api.post('/api/monitors/:id/alert-route/sample',async c=>c.json(await sampleAlertRoute(c.env,c.req.param('id'),c.get('input'))))
api.get('/api/access/self',c=>accessMembers(c.env,c.req.raw))
api.get('/api/access/members',c=>accessMembers(c.env,c.req.raw))
api.post('/api/access/invitations',c=>accessMembers(c.env,c.req.raw,c.get('input')))
api.post('/api/access/members/:id',c=>accessMembers(c.env,c.req.raw,c.get('input')))
api.delete('/api/access/members/:id',c=>accessMembers(c.env,c.req.raw))
api.post('/api/auth/sign-out',async c=>{try{const result=await signOut(c.env,c.req.raw);c.header('set-cookie',result.cookie);return c.json({signedOut:true})}catch(error){return authFailure(error)}})
api.get('/api/credentials',c=>credentialKeys(c.get('systemBindings'),c.req.raw))
api.post('/api/credentials',c=>credentialKeys(c.get('systemBindings'),c.req.raw,c.get('input')))
api.delete('/api/credentials/:id',c=>credentialKeys(c.get('systemBindings'),c.req.raw))
api.get('/api/metrics/keys',async c=>c.json(await metricsKeys(c.env,c.req.raw)))
api.post('/api/metrics/keys',async c=>c.json(await createMetricsKey(c.env,c.req.raw,c.get('input')),201))
api.delete('/api/metrics/keys/:id',async c=>c.json(await revokeMetricsKey(c.env,c.req.raw,c.req.param('id'))))
api.get('/api/v1/metrics',async c=>{
 const params=new URL(c.req.url).searchParams
 try{
  const snapshot=await metricsSnapshot(c.env,params)
  if(params.get('format')==='json'){const bytes=JSON.stringify(snapshot);if(new TextEncoder().encode(bytes).length>2*1024*1024)throw new ReportInputError('Metrics exceeds 2 MiB');return c.body(bytes,200,{'content-type':'application/json'})}
  const text=prometheusMetrics(snapshot);if(new TextEncoder().encode(text).length>2*1024*1024)throw new ReportInputError('Metrics exceeds 2 MiB')
  return c.body(text,200,{'content-type':'text/plain; version=0.0.4; charset=utf-8'})
 }catch(error){if(error instanceof ReportInputError)return c.json({error:error.message,code:error.code},error.code==='monitor_not_found'?404:400);throw error}
})
api.get('/api/overview',async c=>{const zone=c.req.header('x-uptime-time-zone');if(zone)await initializeNotificationTimeZone(c.env,zone);const monitorId=c.req.query('monitor');return c.json(await overview(c.env,monitorId===undefined?{}:{monitorId}))})
for(const [path,preview,apply] of [
 ['/api/catalog',catalogBulkPreview,catalogBulkApply],['/api/catalog/add',catalogAddPreview,catalogAddApply],['/api/maintenance',previewMaintenance,applyMaintenance],
] as const){
 api.post(`${path}/preview`,async c=>c.json(await preview(c.env,c.get('input'))))
 api.post(`${path}/apply`,async c=>{const {digest,...input}=c.get('input') as any;return c.json(await apply(c.env,input,digest,{kind:'operator',ref:(await authenticatedSession(c.env,c.req.raw))!.operator.id}),201)})
}
api.post('/api/maintenance/cancel',async c=>c.json(await cancelMaintenance(c.env,c.get('input'),{kind:'operator',ref:(await authenticatedSession(c.env,c.req.raw))!.operator.id})))
api.get('/api/monitor-editor',async c=>{c.header('cache-control','no-store, private');return c.json(await monitorEditor(c.env,c.req.query('monitor')))})
api.get('/api/monitors/:id/slow-policy',async c=>c.json(await readSlowPolicy(c.env,c.req.param('id'))))
api.post('/api/monitors/:id/slow-policy/import-preview',async c=>{const current=await readSlowPolicy(c.env,c.req.param('id'));return c.json({slow:importSlowPolicy(c.get('input'),current.definition),revision:current.revision})})
api.post('/api/monitors/:id/slow-policy',async c=>c.json(await saveSlowPolicy(c.env,c.req.param('id'),c.get('input'),{kind:'operator',ref:(await authenticatedSession(c.env,c.req.raw))!.operator.id})))
api.post('/api/monitors/:id/slow-ack',async c=>c.json(await acknowledgeSlow(c.env,c.req.param('id'),c.get('input'),{kind:'operator',ref:(await authenticatedSession(c.env,c.req.raw))!.operator.id})))
api.get('/api/monitors/:id/alert-route',async c=>c.json(await storageOperation('alertRoutes.read',()=>readAlertRoute(c.env,c.req.param('id')))))
api.post('/api/monitors/:id/alert-route/preview',async c=>c.json(await storageOperation('alertRoutes.preview',()=>previewAlertRoute(c.env,c.req.param('id'),c.get('input')))))
api.post('/api/monitors/:id/alert-route/import-preview',async c=>c.json(await storageOperation('alertRoutes.import',()=>previewAlertRoute(c.env,c.req.param('id'),importContactSchedule(c.get('input'))))))
api.post('/api/monitors/:id/alert-route/apply',async c=>{const actor={kind:'operator' as const,ref:(await authenticatedSession(c.env,c.req.raw))!.operator.id};return c.json(await storageOperation('alertRoutes.apply',()=>applyAlertRoute(c.env,c.req.param('id'),c.get('input'),actor)))})
api.post('/api/monitors',async c=>c.json(await save(c.env,c.get('input'),undefined,{kind:'operator',ref:(await authenticatedSession(c.env,c.req.raw))!.operator.id}),201))
api.patch('/api/monitors/:id',async c=>c.json(await save(c.env,c.get('input'),c.req.param('id'),{kind:'operator',ref:(await authenticatedSession(c.env,c.req.raw))!.operator.id})))
api.post('/api/monitors/:id/heartbeat-key',async c=>c.json(await issueHeartbeatKey(c.env,c.req.param('id'),{kind:'operator',ref:(await authenticatedSession(c.env,c.req.raw))!.operator.id})))
api.post('/api/monitors/:id/heartbeat-settings',async c=>c.json(await configureHeartbeat(c.env,c.req.param('id'),c.get('input'),{kind:'operator',ref:(await authenticatedSession(c.env,c.req.raw))!.operator.id})));
api.get('/api/monitors/:id/heartbeat-runs',async c=>{const monitor=await get(c.env,c.req.param('id'));if(!monitor)return c.json({error:'Monitor not found'},404);return c.json(await heartbeatRuns(c.env,monitor.id,{before:c.req.query('before'),previewFrom:c.req.query('previewFrom')?Number(c.req.query('previewFrom')):undefined}))});
api.get('/api/evidence/monitors/:id',async c=>c.json(await evidenceSelection(c.env,c.req.param('id'),c.req.query('before'))))
api.get('/api/monitors/:id/cleanup-debt',async c=>c.json(await cleanupDebt(c.env,c.req.param('id'))))
api.post('/api/monitors/:id/cleanup-debt/:debtId/resolve',async c=>c.json(await resolveCleanupDebt(c.env,c.req.param('id'),c.req.param('debtId'),c.get('input'),{kind:'operator',ref:(await authenticatedSession(c.env,c.req.raw))!.operator.id})))
registerRumRoutes(api)
api.get('/api/monitors/:id/effect-grants',async c=>c.json(await effectGrants(c.env,c.req.param('id'))))
api.post('/api/monitors/:id/effect-grants',async c=>c.json(await grantEffect(c.env,c.req.param('id'),c.get('input'),{kind:'operator',ref:(await authenticatedSession(c.env,c.req.raw))!.operator.id}),201))
api.post('/api/monitors/:id/effect-grants/revoke',async c=>c.json(await revokeEffect(c.env,c.req.param('id'),c.get('input'),{kind:'operator',ref:(await authenticatedSession(c.env,c.req.raw))!.operator.id})))
api.get('/api/monitors/:id/evidence-access',async c=>c.json(await evidenceAccess(c.env,c.req.param('id'))))
api.post('/api/monitors/:id/evidence-access',async c=>c.json(await saveEvidenceAccess(c.env,c.req.param('id'),c.get('input'),{kind:'operator',ref:(await authenticatedSession(c.env,c.req.raw))!.operator.id})))
api.get('/api/incidents/:id/failure-report',async c=>{const report={...await incidentDetail(c.env,c.req.param('id')),failureSnapshots:await incidentSnapshots(c.env,c.req.param('id'),true)},text=JSON.stringify(report);if(new TextEncoder().encode(text).length>2*1024*1024)throw Error('Incident report exceeds 2 MiB; export a bounded snapshot selection');return new Response(text,{headers:{'content-type':'application/json','content-disposition':'attachment; filename=uptime-incident-report.json','cache-control':'no-store'}})})
api.get('/api/incidents/:id/failure-snapshots',async c=>c.json(await incidentSnapshots(c.env,c.req.param('id'))))
api.get('/api/monitors/:id/failure-snapshots',async c=>c.json(await readSnapshots(c.env,c.req.param('id'),c.req.query('before'))))
api.patch('/api/monitors/:id/failure-snapshots',async c=>c.json(await saveSnapshotSettings(c.env,c.req.param('id'),c.get('input'),{kind:'operator',ref:(await authenticatedSession(c.env,c.req.raw))!.operator.id})))
api.delete('/api/monitors/:id/failure-snapshots',async c=>c.json(await eraseSnapshots(c.env,c.req.param('id'),{kind:'operator',ref:(await authenticatedSession(c.env,c.req.raw))!.operator.id})))
api.get('/api/monitors/:id/history',async c=>c.json(await history(c.env,c.req.param('id'))))
api.get('/api/monitors/:id/incidents',async c=>c.json(await incidents(c.env,c.req.param('id'))))
api.get('/api/monitors/:id/revisions',async c=>c.json(await revisions(c.env,c.req.param('id'))))
api.get('/api/v1/monitors',async c=>c.json(await monitoringMonitors(c.env,new URL(c.req.url).searchParams)))
api.get('/api/v1/monitors/:id',async c=>{const monitor=await monitoringMonitor(c.env,c.req.param('id'));return monitor?c.json(monitor):c.json({error:'Monitor not found'},404)})
api.get('/api/v1/uptime',async c=>{
 try{
  const result=await bulkUptime(c.env,new URL(c.req.url).searchParams)
  if(c.req.query('format')==='csv'||c.req.header('accept')?.includes('text/csv'))return c.body(bulkUptimeCsv(result),200,{'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="uptime-bulk.csv"'})
  return c.json(result)
 }catch(error){if(error instanceof ReportInputError&&error.code==='monitor_not_found')return c.json({error:error.message,code:error.code},404);throw error}
})
api.get('/api/v1/incidents',async c=>{
 const result=await incidentList(c.env,new URL(c.req.url).searchParams)
 if(result.nextCursor){const next=new URL(c.req.url);next.searchParams.set('cursor',result.nextCursor);c.header('link',`<${next}>; rel="next"`);c.header('x-next-cursor',result.nextCursor)}
 if(c.req.query('format')==='csv'||c.req.header('accept')?.includes('text/csv'))return c.body(incidentListCsv(result),200,{'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="uptime-incidents.csv"'})
 return c.json(result)
})
for(const path of ['/api/incidents/:id','/api/v1/incidents/:id','/api/incident-settings','/api/incidents/:id/mention-members'])api.get(path,c=>incidentWorkRequest(c.env.readCredential?c.env:c.get('systemBindings'),c.req.raw,c.get('input')))
api.patch('/api/incident-settings',c=>incidentWorkRequest(c.get('systemBindings'),c.req.raw,c.get('input')))
api.post('/api/incidents/:id/comments',c=>incidentWorkRequest(c.get('systemBindings'),c.req.raw,c.get('input')))
api.patch('/api/incidents/:id/comments/:commentId',c=>incidentWorkRequest(c.get('systemBindings'),c.req.raw,c.get('input')))
api.delete('/api/incidents/:id/comments/:commentId',c=>incidentWorkRequest(c.get('systemBindings'),c.req.raw,c.get('input')))
api.patch('/api/incidents/:id/root-cause',c=>incidentWorkRequest(c.get('systemBindings'),c.req.raw,c.get('input')))
api.post('/api/incidents/:id/actions',c=>incidentWorkRequest(c.get('systemBindings'),c.req.raw,c.get('input')))
api.get('/api/v1/openapi.json',c=>c.json(readApiOpenApi))
// Versioned reads use the same immutable period engine as console downloads.
for(const suffix of ['uptime','report'] as const)api.get(`/api/v1/monitors/:id/${suffix}`,async c=>{
 const report=await monitorReport(c.env,c.req.param('id'),new URL(c.req.url).searchParams)
 if(!report)return c.json({error:'Monitor not found'},404)
 if(c.req.query('format')==='pdf'||c.req.header('accept')?.includes('application/pdf')){
  const {reportPdf}=await import('./domain/reports/pdf.ts')
  c.header('content-type','application/pdf');c.header('content-disposition','attachment; filename="uptime-report.pdf"');return c.body(new Uint8Array(await reportPdf(report,c.env.ASSETS)).buffer)
 }
 if(c.req.query('format')==='csv'||c.req.header('accept')?.includes('text/csv')){
  c.header('content-type','text/csv; charset=utf-8');c.header('content-disposition','attachment; filename="uptime-report.csv"');return c.body(reportCsv(report))
 }
 return c.json(report)
})
api.get('/api/v1/monitors/:id/response-times',async c=>{
 const result=await monitorLatency(c.env,c.req.param('id'),new URL(c.req.url).searchParams)
 return result?c.json(result):c.json({error:'Monitor not found'},404)
})

api.post('/api/monitors/:id/run',async c=>{const m=await get(c.env,c.req.param('id'));if(!m||!m.definition.enabled)return c.json({error:'Monitor unavailable or paused'},409);const id=`${m.id}:${m.revision}:manual:${crypto.randomUUID()}`;const inserted=await c.env.DB.prepare("INSERT INTO slots(id,monitor_id,revision,due_at,status,definition,lease_owner,lease_until,missed_count,manual) SELECT ?,?,?,?,'queued',?,'unclaimed',0,0,1 WHERE EXISTS(SELECT 1 FROM monitors WHERE id=?)").bind(id,m.id,m.revision,Date.now(),JSON.stringify(m.definition),m.id).run();if(!inserted.meta.changes)return c.json({error:'Monitor unavailable or erased'},409);return c.json({queued:true,slotId:id,policyAdvanced:false})})
api.get('/api/runners',async c=>c.json(await listRunners(c.env)))
api.post('/api/runners',async c=>c.json(await createRunner(c.env,c.get('input')),201))
api.patch('/api/runners/:id',async c=>c.json(await renameRunner(c.env,c.req.param('id'),c.get('input'))))
api.delete('/api/runners/:id',async c=>c.json(await revokeRunner(c.env,c.req.param('id'))))
// "Check all monitors from here too": the location joins every monitor that has room for it, in one step.
api.post('/api/runners/:id/check-all',async c=>c.json(await checkAllFrom(c.env,c.req.param('id'),{kind:'operator',ref:(await authenticatedSession(c.env,c.req.raw))!.operator.id})))
// The installation-wide External check URL: owner session only, same origin, validated before it is stored.
api.patch('/api/notifications/preferences',async c=>c.json(await saveNotificationPreferences(c.env,c.get('input'),{kind:'operator',ref:(await authenticatedSession(c.env,c.req.raw))!.operator.id})))
api.get('/api/external-check',async c=>c.json(await readExternalCheck(c.env)))
api.post('/api/external-check',async c=>c.json(await saveExternalCheck(c.env,c.get('requestText'))))
api.post('/api/runner/join',async c=>{const joined=await joinRunner(c.env,c.get('input'));return joined?c.json(joined):c.json({error:'This join key was used already, or its location was removed. Add the location again.'},403)})
api.post('/api/runner/enroll',async c=>{const registration=await enrollRunner(c.env,c.get('requestText'),c.req.header('x-sent-at')??'',c.req.header('x-runner-signature')??'',c.get('runner'),c.req.raw.cf);return registration?c.json(registration):c.json({error:'Invalid signed enrolment'},403)})
api.post('/api/runner/claim',async c=>{const row=c.get('runner').runner_id?c.get('runner'):await ensureFirstRunner(c.env);const task=await storageOperation('runner.claim',()=>claim(c.env,row.runner_id));await storageOperation('runner.claim.contact',async()=>{await recordContact(c.env.DB);await c.env.DB.prepare('UPDATE runners SET last_contact_at=? WHERE runner_id=? AND revoked_at IS NULL').bind(Date.now(),row.runner_id).run();if(row.named_by==='default')await nameFromPlace(c.env,row,c.req.raw.cf)});
 // `now` is the Worker's clock at the claim: the runner aligns the times it reports to it (see docs/runner.md).
 return c.json({task,now:Date.now()})})
api.post('/api/runner/results',async c=>{const text=c.get('requestText');if(!await signedRunnerBody(c.env,c.get('runner'),text,c.req.header('x-sent-at')??'',c.req.header('x-runner-signature')??'',runnerResultLimit(text)))return c.json({error:'Invalid signed result'},403);return c.json(await storageOperation('runner.results',()=>complete(c.env,c.get('input'),c.get('runner').runner_id)))})
// API-004: before each live request the runner spends its amount from the exact grant its claim named, signed like a result.
api.post('/api/runner/effect-spend',async c=>{const text=c.get('requestText');if(!await signedRunnerBody(c.env,c.get('runner'),text,c.req.header('x-sent-at')??'',c.req.header('x-runner-signature')??'',4096))return c.json({error:'Invalid signed spend'},403);return c.json(await storageOperation('runner.effectSpend',()=>spendGrant(c.env,c.get('input'),c.get('runner').runner_id)))})
// Discovery: the owner's console asks, the owner's runner claims and answers; the Worker never fetches the target.
api.post('/api/discoveries',async c=>c.json(await createDiscovery(c.env,c.get('requestText')),201))
api.get('/api/service-catalog',async c=>c.json(await catalogDocument(c.env,c.req.query('q')??'')))
api.post('/api/service-catalog/checks',async c=>c.json(await createCatalogCheck(c.env,c.get('requestText')),201))
api.post('/api/service-follows',async c=>c.json(await followServices(c.env,c.get('requestText'),{kind:'operator',ref:(await authenticatedSession(c.env,c.req.raw))!.operator.id}),201))
api.post('/api/followed-services/:id/review',async c=>c.json(await reviewFollowed(c.env,c.req.param('id'),c.get('requestText'),{kind:'operator',ref:(await authenticatedSession(c.env,c.req.raw))!.operator.id})))
api.post('/api/followed-services/:id/links',async c=>c.json(await linkDependency(c.env,c.req.param('id'),c.get('requestText'),{kind:'operator',ref:(await authenticatedSession(c.env,c.req.raw))!.operator.id})))
api.post('/api/dependency-notices/:id/acknowledge',async c=>c.json(await acknowledgeNotice(c.env,c.req.param('id'),{id:(await authenticatedSession(c.env,c.req.raw))!.operator.id})))
api.get('/api/discoveries/:id',async c=>c.json(await readDiscovery(c.env,c.req.param('id'))))
// Discovery sources (DISCOVERY-001): the owner authorizes, runs and reviews; the owner's runner reads each source read-only.
api.get('/api/discovery-sources',async c=>c.json(await sourcesDocument(c.env)))
api.post('/api/discovery-sources',async c=>c.json(await authorizeSource(c.env,c.get('requestText'),await operator(c)),201))
api.get('/api/discovery-sources/:id',async c=>c.json(await sourceDocument(c.env,c.req.param('id'))))
api.delete('/api/discovery-sources/:id',async c=>c.json(await revokeSource(c.env,c.req.param('id'),await operator(c))))
api.post('/api/discovery-sources/:id/authorize',async c=>c.json(await reauthorizeSource(c.env,c.req.param('id'),await operator(c))))
api.post('/api/discovery-sources/:id/runs',async c=>c.json(await startSourceRun(c.env,c.req.param('id')),201))
api.post('/api/discovery-sources/:id/decisions',async c=>c.json(await decideProposal(c.env,c.req.param('id'),c.get('requestText'),await operator(c))))
api.post('/api/runner/discoveries/claim',async c=>c.json(await claimDiscovery(c.env,c.get('requestText'),c.get('runner'))))
api.post('/api/runner/discoveries/:id/result',async c=>{const text=c.get('requestText');if(!await signedRunnerBody(c.env,c.get('runner'),text,c.req.header('x-sent-at')??'',c.req.header('x-runner-signature')??'',DISCOVERY_RESULT_BYTES))return c.json({error:'Invalid signed result'},403);return c.json(await completeDiscovery(c.env,c.req.param('id'),discoveryAnswer(text),c.get('runner')))})
api.get('/api/archive/restore-status',async c=>c.json({available:await archiveRestoreAvailable(c.env)}))
api.get('/api/archive',async c=>c.json(await archive(c.env)))
api.post('/api/restore',async c=>{const input=c.get('input');return c.json(await restore(c.env,input.archive??input,undefined,{laterJournal:input.laterJournal,actor:{kind:'operator',ref:(await authenticatedSession(c.env,c.req.raw))!.operator.id}}))})
// Definition files import through the owner's import door (/api/operator/import/*): recognising a file names its source,
// returns its text with request secrets withheld (the text the screen uploads) and writes nothing; a plan's preview reads the door's retained plan; export is read-only; undo pauses or restores.
const operator=async(c:any)=>({kind:'operator' as const,ref:(await authenticatedSession(c.env,c.req.raw))!.operator.id})
api.post('/api/definitions/recognise',async c=>c.json(recogniseFile(c.get('requestText'),c.req.query('source'))))
api.get('/api/definitions/plans/:id',async c=>c.json(await doorPlanView(c.env,c.req.param('id'))))
api.get('/api/definitions/export',async c=>{c.header('content-disposition','attachment; filename="uptime.monitors.json"');return c.json(await exportDefinitions(c.env))})
api.get('/api/definitions/batches',async c=>c.json(await definitionImportHistory(c.env,c.req.raw)))
api.post('/api/definitions/batches/:id/undo',async c=>c.json(await undoDefinitionImport(c.env,c.req.raw,c.req.param('id'),await operator(c))))
api.get('/api/business-import-settings',async c=>c.json(await businessImportSettings(c.env,c.req.raw)))
api.post('/api/business-import-settings',async c=>c.json(await businessImportSettings(c.env,c.req.raw,c.get('input'))))
api.get('/api/erasure-journal',async c=>c.json(await exportJournal(c.env)))
api.post('/api/monitors/:id/erase',async c=>c.json(await erase(c.env,'monitor',c.req.param('id'),{kind:'operator',ref:(await authenticatedSession(c.env,c.req.raw))!.operator.id},c.get('input').name)))
api.post('/api/operators/:id/erase',async c=>c.json(await erase(c.env,'operator',c.req.param('id'),{kind:'operator',ref:(await authenticatedSession(c.env,c.req.raw))!.operator.id})))
api.post('/api/notifications/webhook-preview',async c=>c.json(await proposedWebhookPreview(c.get('input'))))
api.post('/api/notifications/webhook-import-preview',async c=>c.json(previewUptimeRobotWebhook(c.get('input'))))
api.post('/api/notifications/destinations/:id/preview',async c=>c.json(await savedWebhookPreview(c.env,c.req.param('id'),c.get('input'))))
api.get('/api/notifications',async c=>c.json(await notificationOverview(c.env)))
api.get('/api/notifications/destinations',async c=>c.json(await destinations(c.env)))
api.post('/api/notifications/destinations',async c=>c.json(await createDestination(c.env,c.get('input')),201))
api.patch('/api/notifications/destinations/:id',async c=>c.json(await updateDestination(c.env,c.req.param('id'),c.get('input'),{kind:'operator',ref:(await authenticatedSession(c.env,c.req.raw))!.operator.id})))
api.delete('/api/notifications/destinations/:id',async c=>c.json(await erase(c.env,'destination',c.req.param('id'),{kind:'operator',ref:(await authenticatedSession(c.env,c.req.raw))!.operator.id})))
api.post('/api/notifications/destinations/:id/rotate',async c=>c.json(await rotateDestination(c.env,c.req.param('id'),{kind:'operator',ref:(await authenticatedSession(c.env,c.req.raw))!.operator.id})))
api.post('/api/notifications/destinations/:id/test',async c=>c.json(await testDestination(c.env,c.req.param('id')),202))
api.post('/api/notifications/destinations/:id/drill',async c=>c.json(await startDrill(c.env,c.req.param('id'),(await operator(c)).ref),202))
api.post('/api/runner/notifications',async c=>c.json(await notificationRpc(c.env,c.get('input'))))
// A failed mutation guard or a racing writer's constraint means the installation changed between reading and writing: a conflict.
// Any other D1 failure is a retryable storage fault. The log line names the operation, class, status and a sanitized cause, never values.
api.onError((error,c)=>{
 const denied=accessResponse(error);if(denied)return denied;
 if(error instanceof ReportInputError)return c.json({error:error.message,code:error.code},400)
 const status=(error as Error&{status?:number}).status,limited=status===429,fault=classifyStorage(error)
 if(limited)c.header('retry-after','60')
 if(fault){
  console.error(storageLogLine(c.req.method,storageRoute(c.req.path),fault))
  const operation={class:fault.class,cause:fault.cause,...(fault.operation?{operation:fault.operation}:{})}
  if(fault.code==='conflict')return c.json({error:'The installation changed during this request. Nothing was saved; try again.',code:'conflict',...operation},409)
  c.header('retry-after','5');return c.json({error:'Storage operation failed',code:'storage_unavailable',retryable:true,...operation},503)
 }
 return c.json({error:error.message},status===409?409:limited?429:status===404?404:400)
})
const storageRoute=(path:string)=>path.split('/').map(part=>part.length>24||/[0-9a-f]{8}-[0-9a-f]{4}/i.test(part)?':id':part).join('/')
// Lobby readiness follows /setup completion, separately from permanent Base owner admission.
const claimed=claimedWhen('SELECT 1 FROM uptime_first_run WHERE id = 1')
// Base records owner admission (by setup token or rer's owner claim) in oa_bootstrap before the owner row.
const ownerAdmitted=claimedWhen('SELECT 1 FROM oa_bootstrap WHERE singleton = 1')
// The public docs carry no installation data and need no session.

// One monitor's page in the console (/app/monitors/<id>); it is gated like /app.
// A monitor page whose id is not valid percent-encoding names no monitor; after the session check it gets the 404 page.
const undecodableMonitorId=(path:string)=>{try{decodeURIComponent(path.slice('/app/monitors/'.length).replace(/\/$/,''));return false}catch{return true}}
// The private console documents: the monitor list, the monitor editor and each monitor's page.
// Documents React hydrates carry no-transform, so no proxy (Cloudflare's email address obfuscation) rewrites them first.
const noTransform=(response:Response)=>{
 const headers=new Headers(response.headers),policy=headers.get('cache-control');
 if(!headers.get('content-type')?.startsWith('text/html')||policy?.includes('no-transform'))return response;
 headers.set('cache-control',policy?policy+', no-transform':'no-transform');
 return new Response(response.body,{status:response.status,statusText:response.statusText,headers})
}
const handler={async fetch(request,env,execution){
 env=await demoBindings(env as Bindings);
 const invalid=await configurationResponse(env as Bindings);if(invalid)return invalid;
 const limited=await limitPublicRequest(env as Bindings,request);if(limited)return limited;
 const bindings=env as Bindings,url=new URL(request.url),path=url.pathname,isEvidencePage=/^\/app\/evidence\/[^/]+$/.test(path);
 if(url.origin!==bindings.UPTIME_ORIGIN||(request.headers.has('host')&&request.headers.get('host')?.toLowerCase()!==url.host.toLowerCase()))return new Response('Invalid host',{status:403});
 const mfa=await mfaDoor(bindings,request);if(mfa)return mfa;
 const factorDenial=await earlyMfaGate(bindings,request);if(factorDenial)return factorDenial;
 if(path.startsWith('/api/rer/import/'))return businessImportDoor(bindings,request);
 if(path.startsWith('/api/operator/import/'))return ownerImportDoor(bindings,request);
 // Run Edit Run's signed reads (the private runner's contact, and the cutover checks' deliveries and created records):
 // each verified by its own grant, before the console's API policy.
 if(path==='/api/rer/runner-status')return rerRunnerStatus(bindings,request);
 if(path==='/api/rer/cutover-status')return rerCutoverStatus(bindings,request);
 if(path.startsWith('/rum/v1/'))return rumDoor(bindings,request);
 // The Lobby at / and GET /setup/state: Base's shared responses, before the public-path guard and the document renderer.
 const lobbyBindings={DB:bindings.DB,AUTH_ORIGIN:bindings.UPTIME_ORIGIN!};
 const state=await setupStateResponse(request,lobbyBindings,claimed);if(state)return state;
 const lobby=await lobbyResponse(request,lobbyBindings,identity,claimed);if(lobby)return lobby;
 if(path==='/monitor'||path==='/monitor/')return consoleRedirect(canonicalConsolePath(url)!);
 if(!publicPath(path,bindings.UPTIME_LOCAL_REVIEW==='true')&&!isConsoleDocument(path)&&!isEvidencePage&&!path.startsWith('/_serverFn/')&&path!=='/api'&&!path.startsWith('/api/'))return notFoundDocument();
 if(isEvidencePage){if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405});try{const id=decodeURIComponent(path.split('/').pop()!);if(!await evidencePrincipal(bindings,request,id)){if(!await authenticatedSession(bindings,request))return new Response(null,{status:303,headers:{location:'/login','cache-control':'no-store'}});return failureEvidenceDenied()}const response=failureEvidenceDocument(id);return request.method==='HEAD'?new Response(null,response):response}catch(error){return authFailure(error)}}
 // On a Business-provisioned install the owner's first claim opens the import door (claim-door.server.ts).
 if(path==='/auth/owner-claim')return afterClaim(bindings,request,(await ownerClaim(bindings,request))!);
 if(path==='/api/editor/config')return editorConfigResponse(bindings,request);
 if(path.startsWith('/auth/'))return nativeClaimFailure(request,await afterClaim(bindings,request,(await authRoute(bindings,request))!),bindings.UPTIME_DEPLOY_ENVIRONMENT);
 if(path==='/signin')return signInDocument(bindings,request);
 if(path==='/setup')return firstRun(bindings,request);
 if(path==='/alert-drill')return alertDrillDocument(bindings,request);
 // Once an owner is admitted the first-owner claim is spent, so sign-in stops offering it.
 if(path==='/login'||path==='/claim')return authDocument(path==='/claim',path==='/login'&&url.searchParams.get('notice')==='sent',developmentMail(bindings),false,bindings.UPTIME_DEPLOY_ENVIRONMENT,!await ownerAdmitted(bindings.DB),path==='/login'&&url.searchParams.get('notice')==='mail_unavailable',url.searchParams.get('login_hint')??'');
 if(path==='/uptime-runner.mjs')return runnerScriptResponse(request);
 if(isPublicAsset(path))return publicAssetResponse(request,bindings.ASSETS);
 if(path!=='/health'&&path!=='/api'&&!path.startsWith('/api/')&&!isPublicDocument(path)){
  // Only native document routes and Start transports reach the private renderer.
  if(!isConsoleDocument(path)&&!path.startsWith('/_serverFn/'))return notFoundDocument();
  try{const principal=await authenticatedSession(bindings,request);if(!principal)return new Response(null,{status:303,headers:{location:'/login','cache-control':'no-store'}});try{await permission(bindings,request)}catch(error){if(accessResponse(error))return accessDeniedDocument(principal.operator.displayName,request.method==='HEAD');throw error}if(principal.operator.role==='owner')await openDoorForOwner(bindings);if(!await firstRunComplete(bindings))return setupRedirect()}catch(error){return authFailure(error)}
  const canonical=canonicalConsolePath(url);if(canonical)return consoleRedirect(canonical);
  if(isMonitorPage(path)&&undecodableMonitorId(path))return notFoundDocument();
 }
 const response=await dispatch(request,()=>api.fetch(request,bindings,execution),()=>start.fetch(request));
 return noTransform(isConsoleDocument(path)?editorDocument(response,bindings):response)
},async scheduled(_controller,env){env=await demoBindings(env as Bindings);await validateWorkerConfiguration(env as Bindings);const bindings=env as Bindings;await recordCronRun(bindings);await maintenance(bindings);const checks=new SubrequestBudget(CHECK_SUBREQUESTS);await scheduledPublicChecks(bindings,checks);await scheduledNotifications(bindings,new SubrequestBudget(RUN_SUBREQUESTS-WATCH_SUBREQUESTS-(CHECK_SUBREQUESTS-checks.remaining)));await monitoringWatch(bindings,()=>boundedHealth(()=>health(bindings)),async()=>{const data=await overview(bindings);return data.monitors.filter(m=>m.definition.enabled).every(m=>m.state.targetState==='Healthy')})}} satisfies ExportedHandler
export default withDemo({...handler,fetch(request,env,execution){
 return new URL(request.url).pathname==='/health'?boundedHealth(()=>handler.fetch(request,env,execution)):handler.fetch(request,env,execution)
}} satisfies ExportedHandler,{seed:seedDemo})
