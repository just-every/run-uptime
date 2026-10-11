import { createPortability } from './index.mjs';
import { insist, PortabilityError } from './storage.mjs';
import { MAX_LINE_BYTES } from './format.mjs';
export async function boundedJson(request,limit) {
  const reader=request.body?.getReader();if(!reader)return {};
  const chunks=[];let size=0;
  try {for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;insist(size<=limit,'body_too_large',413);chunks.push(value);}}
  finally{await reader.cancel();reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new PortabilityError('invalid_json');}
}
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
export async function createPortabilityHandler({db,buckets,policy,appOrigin,basePath='/api/portability',authorize,maxBodyBytes=MAX_LINE_BYTES}) {
  insist(typeof authorize==='function' && new URL(appOrigin).origin===appOrigin,'invalid_handler_configuration');
  insist(/^\/[A-Za-z0-9/_-]+$/.test(basePath) && !basePath.endsWith('/') && Number.isSafeInteger(maxBodyBytes) && maxBodyBytes>0,'invalid_handler_configuration');
  const service=await createPortability({db,buckets,policy});
  return async request=>{
    const url=new URL(request.url);
    if(url.pathname!==basePath && !url.pathname.startsWith(basePath+'/'))return null;
    const route=url.pathname.slice(basePath.length+1).split('/'),[collection,id,action,index]=route;
    const operation=collection==='exports'?'export':collection==='imports'?'import':'unknown';
    try {
      const actor=await authorize(request,{operation,jobId:id??null});insist(typeof actor==='string' && actor.length>0,'unauthorized',401);
      if(!['GET','HEAD'].includes(request.method))insist(request.headers.get('Origin')===appOrigin,'origin_refused',403);
      if(id)insist(await service.actor(id)===actor,'job_not_found',404);
      insist(['exports','imports'].includes(collection) && route.length<=4,'route_not_found',404);
      const api=service[collection];
      if(request.method==='POST' && !id) {
        const body=await boundedJson(request,maxBodyBytes);
        if(collection==='imports'){insist(body.confirmed===true,'confirmation_required');return json({id:await api.create(body.manifest,actor)},201);}
        return json({id:await api.create(actor)},201);
      }
      if(request.method==='GET' && id && !action)return json(await api.status(id));
      if(request.method==='POST' && id && action==='abort' && !index)return json(await api.abort(id));
      if(collection==='exports' && request.method==='POST' && id && action==='advance' && !index)return json(await api.advance(id,await boundedJson(request,maxBodyBytes)));
      if(collection==='exports' && request.method==='GET' && id && action==='download' && !index)return new Response(await api.download(id),{headers:{'Content-Type':'application/x-ndjson','Cache-Control':'no-store'}});
      if(collection==='imports' && request.method==='PUT' && id && action==='parts' && /^(0|[1-9]\d*)$/.test(index??''))return json(await api.uploadPart(id,Number(index),await boundedJson(request,maxBodyBytes)));
      if(collection==='imports' && request.method==='POST' && id && action==='finalize' && !index)return json(await api.finalize(id,await boundedJson(request,maxBodyBytes)));
      throw new PortabilityError('route_not_found',404);
    }catch(e){return json({error:e instanceof PortabilityError?e.code:'operation_failed'},e instanceof PortabilityError?e.status:500);}
  };
}
