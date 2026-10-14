// Test-only Base network fixture from 67e0a7d7c4a87b3a145545515a8c83afcac457ec.
// Original SHA-256: 7da730af1ad879fae98d590922daf317bc7523fa47cb2bcb977fecab0436bdd4. Validation import relocated; requested asset hashes deduplicated for shared product assets.
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { hash } from '../../src/base/modules/deploy-kit/validation.mjs';
export function providerFixture({handlers = ['fetch','scheduled']} = {}) {
  const accountId = 'a'.repeat(32); const token = 'test-only-provider-token';
  const state = {calls:[],writes:[],databases:[],buckets:[],queues:[],namespaces:[],settings:null,version:null,deployments:[],secrets:[],subdomain:false,schedules:[],objects:new Map(),failSql:null,healthOverride:null};
  // Model the provider's detected-handler response at the network edge. Tests
  // can change this before any upload; Worker modules are inert upload bytes.
  state.uploadHandlers = structuredClone(handlers);
  const ok = (result, result_info) => Response.json({success:true,errors:[],result,...(result_info ? {result_info}:{})});
  const missing = () => Response.json({success:false,errors:[{code:100,message:'missing'}]},{status:404});
  function write(method,path,body) { state.writes.push({method,path,body}); }
  // A secret change deploys a new version of the same script, as the provider does.
  function secretVersion() {
    if (!state.version) return;
    const id = randomUUID(); state.version = {...structuredClone(state.version),id}; state.versions = [state.version,...(state.versions ?? [])];
    state.deployments = [{id:randomUUID(),versions:[{version_id:id,percentage:100}]},...state.deployments];
  }
  const imports = new Map();
  const fetch = async (input,init={}) => {
    const url = new URL(input); const method = init.method ?? 'GET'; const path = url.pathname.slice(`/client/v4/accounts/${accountId}`.length);
    if (url.hostname === `${accountId}.r2.cloudflarestorage.com`) {
      if (init.headers?.Authorization || init.redirect !== 'error') throw Error('unsafe import upload');
      const entry = imports.get(url.pathname.slice(1));
      if (!entry || method !== 'PUT') throw Error('unknown import upload');
      entry.sql = Buffer.from(init.body).toString('utf8');
      const etag = createHash('md5').update(init.body).digest('hex');
      if (etag !== entry.etag || Number(init.headers['Content-Length']) !== Buffer.byteLength(entry.sql)) throw Error('import bytes changed');
      return new Response(null, {headers:{etag:`"${etag}"`}});
    }
    if (url.hostname.endsWith('.workers.dev')) {
      if (init.headers?.Authorization) throw Error('health received token');
      if (state.healthOverride) return state.healthOverride();
      const vars = Object.fromEntries(state.settings.bindings.filter(x => x.type === 'plain_text').map(x => [x.name,x.text]));
      return Response.json({ok:true,deployment:{sourceSha:vars.RER_DEPLOY_SOURCE,fingerprint:vars.RER_DEPLOY_FINGERPRINT,versionId:state.version.id}});
    }
    if (url.origin !== 'https://api.cloudflare.com' || !url.pathname.startsWith(`/client/v4/accounts/${accountId}/`)) throw Error('wrong provider destination');
    if (init.headers?.Authorization !== `Bearer ${path === '/workers/assets/upload' ? 'fixture-upload-jwt':token}`) throw Error('wrong token');
    state.calls.push({method,path,search:url.search});
    // A body-less request (DELETE) can arrive as an empty string through a network edge.
    const body = typeof init.body === 'string' ? (init.body ? JSON.parse(init.body) : undefined) : init.body;
    const list = rows => ok(rows,{page:Number(url.searchParams.get('page') ?? 1),total_count:rows.length,total_pages:1});
    if (path === '/d1/database') {
      if (method === 'GET') return list(state.databases.map(({db,...x}) => x));
      const row = {uuid:randomUUID(),name:body.name,db:new DatabaseSync(':memory:')};row.db.exec('PRAGMA foreign_keys=ON');state.databases.push(row);write(method,path,body);return ok({uuid:row.uuid,name:row.name});
    }
    const d1 = /^\/d1\/database\/([^/]+)(\/query|\/import)?$/.exec(path);
    if (d1) {
      const row = state.databases.find(x => x.uuid === d1[1]); if (!row) return missing();
      if (method === 'DELETE') { row.db.close(); state.databases.splice(state.databases.indexOf(row),1); write(method,path); return ok(null); }
      if (!d1[2]) return ok({uuid:row.uuid,name:row.name});
      if (d1[2] === '/import') {
        if (body.action === 'init') {
          const filename = randomUUID();
          imports.set(filename,{etag:body.etag});
          return ok({filename,upload_url:`https://${accountId}.r2.cloudflarestorage.com/${filename}?signature=fixture-only`});
        }
        if (body.action !== 'ingest') throw Error('unexpected import action');
        const entry = imports.get(body.filename);
        if (!entry?.sql || entry.etag !== body.etag) throw Error('missing import bytes');
        write(method,path,{sql:entry.sql});
        try {
          if (state.failSql && entry.sql.includes(state.failSql)) throw Error('failure');
          row.db.exec('BEGIN'); row.db.exec(entry.sql); row.db.exec('COMMIT');
          return ok({success:true,type:'import',status:'complete',messages:[],result:{num_queries:1,final_bookmark:'fixture-bookmark'}});
        } catch {
          if (row.db.isTransaction) row.db.exec('ROLLBACK');
          return ok({success:true,type:'import',status:'error',errors:['failure'],messages:[]});
        }
      }
      const sql = body.sql;
      if (/^SELECT /i.test(sql)) return ok([{success:true,results:row.db.prepare(sql).all()}]);
      if (/CREATE\s+(?:(?:TEMP|TEMPORARY)\s+)?TRIGGER/i.test(sql)) throw Error('trigger must use file import');
      write(method,path,body);
      if (state.failSql && sql.includes(state.failSql)) return Response.json({success:false,errors:[{code:1,message:'failure'}]});
      try { row.db.exec('BEGIN'); row.db.exec(sql); row.db.exec('COMMIT'); return ok([{success:true,results:[]}]); }
      catch { row.db.exec('ROLLBACK'); return Response.json({success:false,errors:[{code:1,message:'failure'}]}); }
    }
    if (path === '/r2/buckets') {
      if (method === 'GET') return ok({buckets:state.buckets},{per_page:100});
      const row = {name:body.name,jurisdiction:'default',storage_class:'Standard'};state.buckets.push(row);write(method,path,body);return ok(row);
    }
    if (path.startsWith('/r2/buckets/') && method === 'DELETE') {
      const row = state.buckets.find(x => x.name === path.split('/').at(-1)); if (!row) return missing();
      if (state.objects.get(row.name)?.size) return Response.json({success:false,errors:[{code:10008,message:'The bucket you tried to delete is not empty'}]},{status:409});
      state.buckets.splice(state.buckets.indexOf(row),1); write(method,path); return ok({});
    }
    if (path.startsWith('/r2/buckets/')) return state.buckets.find(x => x.name === path.split('/').at(-1)) ? ok(state.buckets.find(x => x.name === path.split('/').at(-1))) : missing();
    if (path === '/queues') {
      if (method === 'GET') return list(state.queues);
      const row = {queue_id:randomUUID().replaceAll('-',''),queue_name:body.queue_name,consumers:[]};state.queues.push(row);write(method,path,body);return ok(row);
    }
    const queue = /^\/queues\/([^/]+)(\/consumers)?(?:\/([^/]+))?$/.exec(path);
    if (queue) {
      const row = state.queues.find(x => x.queue_id === queue[1]); if (!row) return missing();
      if (method === 'DELETE') { write(method,path); if (queue[2]) row.consumers = row.consumers.filter(x => x.consumer_id !== queue[3]); else state.queues.splice(state.queues.indexOf(row),1); return ok(null); }
      if (!queue[2]) return ok(row);
      if (method === 'GET') return ok(row.consumers);
      const consumer = {...body,consumer_id:queue[3] ?? randomUUID().replaceAll('-','')};row.consumers=[consumer];write(method,path,body);return ok(consumer);
    }
    if (path === '/workers/durable_objects/namespaces') return list(state.namespaces);
    if (path === '/workers/subdomain') return ok({subdomain:'fixture-account'});
    if (path === '/workers/assets/upload') {write(method,path);return ok({jwt:'fixture-complete-jwt'});}
    const worker = /^\/workers\/scripts\/([^/]+)(.*)$/.exec(path); if (!worker) throw Error(`unexpected fixture path ${path}`);
    const name = worker[1], suffix = worker[2];
    if (suffix === '/assets-upload-session') {write(method,path,body);return ok({jwt:'fixture-upload-jwt',buckets:[[...new Set(Object.values(body.manifest).map(x => x.hash))]]});}
    if (suffix === '/settings') return state.settings ? ok(state.settings) : missing();
    if (suffix === '/deployments') return ok({deployments:state.deployments});
    if (suffix === '/versions') return ok({items:(state.versions ?? []).map(({id}) => ({id}))});
    if (suffix.startsWith('/versions/')) return ok(state.versions?.find(x => x.id === suffix.slice('/versions/'.length)) ?? state.version);
    if (suffix === '/secrets' && method === 'PUT') { state.secrets = [...state.secrets.filter(x => x.name !== body.name),{name:body.name,value:body.text}]; write(method,path,{name:body.name}); secretVersion(); return ok({name:body.name,type:'secret_text'}); }
    if (suffix.startsWith('/secrets/') && method === 'DELETE') { const before = state.secrets.length; state.secrets = state.secrets.filter(x => x.name !== suffix.slice('/secrets/'.length)); if (before === state.secrets.length) return missing(); write(method,path); secretVersion(); return ok(null); }
    if (suffix === '/secrets') return ok(state.secrets.map(x => ({name:x.name,type:'secret_text'})));
    if (suffix === '/schedules') { if (method === 'GET') return ok({schedules:state.schedules});state.schedules=body;write(method,path,body);return ok({schedules:body}); }
    if (suffix === '/subdomain') { if (method === 'GET') return ok({enabled:state.subdomain}); state.subdomain=body.enabled;write(method,path,body);return ok(body); }
    if (suffix === '' && method === 'DELETE') {
      if (!state.settings) return missing();
      state.settings = null; state.version = null; state.versions = []; state.deployments = []; state.secrets = []; state.schedules = [];
      state.namespaces = state.namespaces.filter(x => x.script !== name); write(method,path); return ok(null);
    }
    if (suffix === '' && method === 'PUT') {
      const meta = JSON.parse(await body.get('metadata').text());
      for (const item of meta.bindings.filter(x => x.type === 'secret_text')) state.secrets.push({name:item.name,value:item.text});
      const bindings = meta.bindings.map(x => x.type === 'inherit' || x.type === 'secret_text' ? {name:x.name,type:'secret_text'} : x);
      state.settings = {...meta,bindings,migration_tag:meta.migrations?.new_tag ?? state.settings?.migration_tag};
      for (const klass of meta.migrations?.new_sqlite_classes ?? []) state.namespaces.push({id:randomUUID().replaceAll('-',''),class:klass,script:name,use_sqlite:true});
      const modules = await Promise.all([...body].filter(([path]) => path !== 'metadata').map(async ([path,file]) => ({path,sha256:hash(Buffer.from(await file.arrayBuffer()))})));
      const id = randomUUID();state.version={id,...(meta.annotations ? {annotations:meta.annotations} : {}),resources:{bindings,script:{etag:hash(modules),handlers:structuredClone(state.uploadHandlers)}}};state.versions=[state.version,...(state.versions ?? [])];state.deployments=[{id:randomUUID(),versions:[{version_id:id,percentage:100}]},...state.deployments];
      write(method,path,{bindings:bindings.map(x => ({name:x.name,type:x.type}))});return ok({id:name,deployment_id:id});
    }
    throw Error(`unexpected fixture ${method} ${path}`);
  };
  return {accountId,token,state,fetch,close(){for(const row of state.databases) row.db.close();}};
}
