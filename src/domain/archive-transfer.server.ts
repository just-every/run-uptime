import {MONITOR_LIMIT} from './monitor-cap.ts'
import {TABLES} from './archive-schema.ts'
import {TRANSFER_BYTES,TRANSFER_ROWS,CHUNK_BYTES} from './archive-transfer-limits.ts'
import {archiveSelection} from './archive-selection.server.ts'
import type {ArchiveSelection} from './archive-schema.ts'
import {createPortability,PortabilityError} from '@runeditrun/rer/modules/portability'
import {archiveTransferPolicy} from './archive-transfer-policy.ts'
import {archiveRestoreAvailable} from './archive.server.ts'
import {permission} from './access.server.ts'
import {authorizedDatabase,auditAccess} from './access-database.server.ts'
import {validateJournal} from './archive-fence.server.ts'
import type {Bindings} from './control.server.ts'

const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'cache-control':'no-store'}});
const insist=(value:unknown,code:string,status=400)=>{if(!value)throw new PortabilityError(code,status)};
const base='/api/archive-transfer';
/** Every progress request rechecks the live person and recent factor. The job id
 * is correlation only; actor checks and transaction fences provide authority. */
export async function archiveTransfer(env:Bindings,request:Request){
 const url=new URL(request.url),segments=url.pathname.slice(base.length+1).split('/'),[collection,id,action,index]=segments;
 const operation=collection==='exports'?'export':'import';
 const origin=env.UPTIME_ORIGIN??url.origin;
 const authorityRequest=new Request(new URL(operation==='export'?'/api/archive':'/api/restore',origin),{method:operation==='export'?'GET':'POST',headers:request.headers});
 const authorize=()=>permission(env,authorityRequest);
 const access=await authorize(),actor=access.session.operator.id;
 insist(!url.search&&['exports','imports'].includes(collection)&&segments.length<=4,'route_not_found',404);
 insist(!id||/^[a-f0-9-]{36}$/.test(id),'job_not_found',404);
 if(request.headers.get('sec-fetch-site')==='cross-site'||request.headers.get('origin')&&request.headers.get('origin')!==origin)throw new PortabilityError('origin_refused',403);
 if(!['GET','HEAD'].includes(request.method))insist(request.headers.get('origin')===origin,'origin_refused',403);
 let manifest:any,laterJournal:any,jobId=id,selection:ArchiveSelection|undefined;
 // Refuse foreign job handles before catalogue or any transfer state write.
 if(id){const row=await env.DB.prepare('SELECT actor,kind,metadata FROM rer_portability_jobs WHERE id=?').bind(id).first<{actor:string;kind:string;metadata:string}>();insist(row&&row.actor===actor&&row.kind===operation,'job_not_found',404);manifest=JSON.parse(row!.metadata).manifest}
 const body=async()=>{
  // The existing erasure journal permits 100,000 digests. Creation and finalize
  // must admit that journal independently of the bounded transport-part size.
  const limit=request.method==='PUT'||action==='advance'?192*1024:8*1024*1024;
  const reader=request.body?.getReader();let text='',size=0;const decoder=new TextDecoder('utf-8',{fatal:true});
  if(!reader)return {};
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;insist(size<=limit,'body_too_large',413);text+=decoder.decode(value,{stream:true})}text+=decoder.decode();const value=JSON.parse(text);insist(value&&typeof value==='object'&&!Array.isArray(value),'invalid_json');return value}finally{await reader.cancel();reader.releaseLock()}
 };
 if(collection==='exports'&&request.method==='GET'&&!id){
  const counts=await env.DB.batch(TABLES.map(name=>env.DB.prepare(`SELECT COUNT(*) n FROM ${name}`)));
  return json({bounds:{monitors:MONITOR_LIMIT,workingSetBytes:TRANSFER_BYTES,rowsPerTable:TRANSFER_ROWS,chunkBytes:CHUNK_BYTES,manifestBytes:CHUNK_BYTES},counts:Object.fromEntries(TABLES.map((name,i)=>[name,(counts[i].results[0] as any).n]))});
 }
 const db=authorizedDatabase(env,access),policy=archiveTransferPolicy({...env,DB:db},()=>jobId,()=>({manifest,laterJournal,actor:{kind:'operator',ref:actor}}),authorize,()=>selection);
 if(collection==='exports')policy.partBytes=128*1024;
 const service=await createPortability({db,policy}),api=service[collection as 'exports'|'imports'];
 if(request.method==='GET'&&id&&!action)return json(await api.status(id));
 if(request.method==='POST'&&id&&action==='abort'&&!index)return json(await api.abort(id));
 if(request.method==='POST'&&!id){
  const input=await body();
  if(collection==='exports'){
   insist(Object.keys(input).every(key=>key==='monitors'),'invalid_export_options');
   if(input.monitors!==undefined){insist(Array.isArray(input.monitors)&&input.monitors.length>0&&input.monitors.every((id:unknown)=>typeof id==='string'),'invalid_export_selection');selection=archiveSelection(new URLSearchParams(input.monitors.map((id:string)=>['monitor',id])))}
   jobId=await service.exports.create(actor);await auditAccess(env,access)
  }
  else{
   insist(input.confirmed===true&&Object.keys(input).every(k=>['confirmed','manifest'].includes(k)),'confirmation_required');
   insist(await archiveRestoreAvailable(env),'Restore requires empty installation');
   manifest=input.manifest;
   insist(Array.isArray(manifest?.payloads)&&manifest.payloads.length===1&&manifest.payloads[0].name==='uptime','invalid_product_payload');
   jobId=await service.imports.create(manifest,actor);
  }
  return json({id:jobId},201);
 }
 if(collection==='exports'&&id&&request.method==='POST'&&action==='advance'&&!index)return json(await service.exports.advance(id,await body()));
 if(collection==='exports'&&id&&request.method==='GET'&&action==='download'&&!index){
  const reader=(await service.exports.download(id)).getReader();
  const stream=new ReadableStream<Uint8Array>({async pull(controller){try{await authorize();const value=await reader.read();if(value.done){reader.releaseLock();controller.close()}else controller.enqueue(value.value)}catch(error){controller.error(error);await reader.cancel();reader.releaseLock()}},async cancel(){await reader.cancel();reader.releaseLock()}});
  return new Response(stream,{headers:{'content-type':'application/x-ndjson','cache-control':'no-store'}});
 }
 if(collection==='imports'&&id&&request.method==='PUT'&&action==='parts'&&/^(0|[1-9]\d*)$/.test(index??''))return json(await service.imports.uploadPart(id,Number(index),await body()));
 if(collection==='imports'&&id&&request.method==='POST'&&action==='finalize'&&!index){
  const input=await body();insist(Object.keys(input).every(k=>['contentHash','archiveHash','laterJournal'].includes(k)),'invalid_finalize_options');
  if(input.laterJournal!==undefined)laterJournal=validateJournal(input.laterJournal);
  return json(await service.imports.finalize(id,input));
 }
 throw new PortabilityError('route_not_found',404);
}
