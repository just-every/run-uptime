// Product roles never replace Base authentication or its owner/admin/member ceiling.
export const PRODUCT_ROLES=Object.freeze(['owner','admin','editor','responder','read-only']);
export const ACCESS_ACTIONS=Object.freeze(['read','check_write','respond','maintenance_write','route_write','secret_write','discovery_write','settings_write','export','archive_restore','import','members','owner','evidence','receive']);
export const baseRole=role=>role==='owner'||role==='admin'?role:PRODUCT_ROLES.includes(role)?'member':null;
export function permitted(role,action){
 if(!PRODUCT_ROLES.includes(role)||!ACCESS_ACTIONS.includes(action))return false;
 if(role==='owner')return true;
 if(action==='owner'||action==='import')return false;
 if(role==='admin')return true;
 if(action==='read'||action==='receive')return true;
 if(role==='read-only')return false;
 if(['respond','maintenance_write'].includes(action))return true;
 return role==='editor'&&['check_write','route_write'].includes(action);
}
// Deny unclassified doors to narrowed members. Owners/admins retain the existing
// product surface; sensitive doors whose services require owner stay owner-only.
export function requestPermission(request,input){
 const url=new URL(request.url),path=url.pathname,method=request.method==='HEAD'?'GET':request.method,read=method==='GET';
 const monitor=/^\/api\/(?:v1\/)?monitors\/([^/]+)(?:\/(.*))?$/.exec(path);
 const decode=value=>{try{return decodeURIComponent(value)}catch{return ''}};
 if(path==='/api/routing/named-routes'||path.startsWith('/api/catalog/routes/'))return {action:'owner',workspace:true};
 if(path.startsWith('/api/definitions/history/'))return {action:'import',workspace:true};
 if(path.startsWith('/api/credentials'))return {action:'owner',workspace:true};
 if(path==='/api/routing/recipient')return {action:'receive',workspace:false};
 if(path==='/api/routing/teams')return {action:'members',workspace:true};
 if(path==='/api/access/self')return {action:'read',workspace:false};
 if(path.startsWith('/api/access/'))return {action:'members',workspace:true};
 if(path==='/api/auth/sign-out'||path==='/auth/signout')return {action:'read',workspace:false};
 if(/^\/auth\/(?:operators|invite|invite\/cancel|operator\/(?:role|status))$/.test(path))return {action:'members',workspace:true};
 if(path==='/auth/session')return {action:'read',workspace:false};
 if(path.startsWith('/auth/'))return {action:'owner',workspace:true};
 if(path.startsWith('/api/operator/import/'))return {action:'import',workspace:true};
 if(method==='DELETE'&&/^\/api\/notifications\/destinations\/[^/]+$/.test(path))return {action:'owner',workspace:true};
 if(path.startsWith('/api/rum/'))return {action:'owner',workspace:true};
 if(path==='/setup'||path==='/api/editor/config'||path==='/api/business-import-settings'||path.startsWith('/api/definitions/batches')||path.startsWith('/api/operators/')||path.startsWith('/api/metrics/keys'))return {action:'owner',workspace:true};
 if(path==='/api/archive'||path==='/api/definitions/export'||path==='/api/erasure-journal')return {action:'export',workspace:true};
 if(path==='/api/restore')return {action:'archive_restore',workspace:true};
 if(path.startsWith('/_serverFn/'))return {action:'owner',workspace:true};
 if(path.startsWith('/app'))return {action:'read',workspace:true};
 if(path.startsWith('/api/maintenance/'))return {action:'maintenance_write',workspace:false,monitorIds:Array.isArray(input?.monitorIds)?input.monitorIds:[]};
 if(monitor){
  const id=decode(monitor[1]),suffix=monitor[2]??'';
  if(suffix.startsWith('report-schedules'))return {action:'owner',workspace:true};
  if(read&&((path.startsWith('/api/v1/')&&['','uptime','report','response-times'].includes(suffix))||['history','incidents','heartbeat-runs'].includes(suffix)))return {action:'read',workspace:false,monitorIds:[id]};
  if(!read&&suffix==='run')return {action:'respond',workspace:false,monitorIds:[id]};
  if(!read&&suffix==='slow-ack')return {action:'respond',workspace:false,monitorIds:[id]};
  if(method==='PATCH'&&!suffix)return {action:'check_write',workspace:false,monitorIds:[id],definition:input};
  if(!read&&suffix==='failure-snapshots')return {action:'secret_write',workspace:true};
  if(suffix==='erase')return {action:'owner',workspace:true};
  if(suffix.startsWith('alert-route'))return {action:read?'settings_write':'route_write',workspace:true};
  if(['heartbeat-key','effect-grants','effect-grants/revoke','evidence-access'].includes(suffix))return {action:'secret_write',workspace:true};
  return {action:read?'settings_write':'check_write',workspace:true};
 }
 if(path==='/api/v1/services/report'||path==='/api/v1/monitors'||path==='/api/v1/uptime'||path==='/api/v1/incidents')return {action:'read',workspace:true};
 // Collaboration resolves its incident to one monitor before scoped permission.
 const incident=/^\/api\/(?:v1\/)?incidents\/([^/]+)(?:\/(.*))?$/.exec(path);
 if(incident){const suffix=incident[2]??'';
  if(read&&['','mention-members'].includes(suffix))return {action:'read',workspace:false,incidentId:decode(incident[1])};
  if(!path.startsWith('/api/v1/')&&method==='POST'&&suffix==='actions'&&input?.kind==='assign')return {action:'respond',workspace:false,incidentId:decode(incident[1])};
  if(!path.startsWith('/api/v1/')&&!read&&(/^(?:comments(?:\/[^/]+)?|root-cause)$/.test(suffix)))return {action:'respond',workspace:false,incidentId:decode(incident[1])};
  return {action:'owner',workspace:true};
 }
 // The installation's default route shares the monitor route doors' authority.
 if(path==='/api/alert-route'||path.startsWith('/api/alert-route/'))return {action:read?'settings_write':'route_write',workspace:true};
 if(path==='/api/incident-settings')return {action:'owner',workspace:true};
 if(path.startsWith('/api/notifications')||path.startsWith('/api/runners'))return {action:'secret_write',workspace:true};
 if(path.startsWith('/api/discover')||path.startsWith('/api/service-')||path.startsWith('/api/followed-services')||path.startsWith('/api/dependency-notices'))return {action:'discovery_write',workspace:true};
 if(path==='/api/monitor-editor')return {action:'check_write',workspace:true};
 if(path==='/api/monitors')return {action:'check_write',workspace:true,definition:input};
 if(path.startsWith('/api/catalog/'))return {action:'settings_write',workspace:true};
 return {action:'settings_write',workspace:true};
}
