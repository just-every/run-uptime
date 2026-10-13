// Test-only copy of Base modules/deploy-kit/tests/provider-fixture.mjs,
// Upstream Base 0d6a92fbdcb65c5f63033d15f28222fa47e5ed3e; original SHA-256:
// 9083fca49c45ccdef169f3695568d4dfd0db73f6e8adc68cade19b97bb25b026.
// Only the validation import
// is relocated; SQLite migration and Cloudflare transport behavior are retained.
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { hash } from '../../src/base/modules/deploy-kit/validation.mjs';
export function providerFixture() {
  const accountId = 'a'.repeat(32); const token = 'test-only-provider-token';
  const state = {calls:[],writes:[],databases:[],buckets:[],queues:[],namespaces:[],settings:null,version:null,deployments:[],secrets:[],subdomain:false,schedules:[],objects:new Map(),failSql:null,healthOverride:null};
  const ok = (result, result_info) => Response.json({success:true,errors:[],result,...(result_info ? {result_info}:{})});
  const missing = () => Response.json({success:false,errors:[{code:100,message:'missing'}]},{status:404});
  function write(method,path,body) { state.writes.push({method,path,body}); }
  const fetch = async (input,init={}) => {
    const url = new URL(input); const method = init.method ?? 'GET'; const path = url.pathname.slice(`/client/v4/accounts/${accountId}`.length);
    if (url.hostname.endsWith('.workers.dev')) {
      if (init.headers?.Authorization) throw Error('health received token');
      if (state.healthOverride) return state.healthOverride();
      const vars = Object.fromEntries(state.settings.bindings.filter(x => x.type === 'plain_text').map(x => [x.name,x.text]));
      return Response.json({ok:true,deployment:{sourceSha:vars.RER_DEPLOY_SOURCE,fingerprint:vars.RER_DEPLOY_FINGERPRINT,versionId:state.version.id}});
    }
    if (url.origin !== 'https://api.cloudflare.com' || !url.pathname.startsWith(`/client/v4/accounts/${accountId}/`)) throw Error('wrong provider destination');
    if (init.headers?.Authorization !== `Bearer ${path === '/workers/assets/upload' ? 'fixture-upload-jwt':token}`) throw Error('wrong token');
    state.calls.push({method,path,search:url.search});
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
    const list = rows => ok(rows,{page:Number(url.searchParams.get('page') ?? 1),total_count:rows.length,total_pages:1});
    if (path === '/d1/database') {
      if (method === 'GET') return list(state.databases.map(({db,...x}) => x));
      const row = {uuid:randomUUID(),name:body.name,db:new DatabaseSync(':memory:')};state.databases.push(row);write(method,path,body);return ok({uuid:row.uuid,name:row.name});
    }
    const d1 = /^\/d1\/database\/([^/]+)(\/query)?$/.exec(path);
    if (d1) {
      const row = state.databases.find(x => x.uuid === d1[1]); if (!row) return missing();
      if (!d1[2]) return ok({uuid:row.uuid,name:row.name});
      const sql = body.sql;
      if (/^SELECT /i.test(sql)) return ok([{success:true,results:row.db.prepare(sql).all()}]);
      write(method,path,body);
      if (state.failSql && sql.includes(state.failSql)) return Response.json({success:false,errors:[{code:1,message:'failure'}]});
      try { row.db.exec('BEGIN'); row.db.exec(sql); row.db.exec('COMMIT'); return ok([{success:true,results:[]}]); }
      catch { row.db.exec('ROLLBACK'); return Response.json({success:false,errors:[{code:1,message:'failure'}]}); }
    }
    if (path === '/r2/buckets') {
      if (method === 'GET') return ok({buckets:state.buckets},{per_page:100});
      const row = {name:body.name,jurisdiction:'default',storage_class:'Standard'};state.buckets.push(row);write(method,path,body);return ok(row);
    }
    if (path.startsWith('/r2/buckets/')) return state.buckets.find(x => x.name === path.split('/').at(-1)) ? ok(state.buckets.find(x => x.name === path.split('/').at(-1))) : missing();
    if (path === '/queues') {
      if (method === 'GET') return list(state.queues);
      const row = {queue_id:randomUUID().replaceAll('-',''),queue_name:body.queue_name,consumers:[]};state.queues.push(row);write(method,path,body);return ok(row);
    }
    const queue = /^\/queues\/([^/]+)(\/consumers)?(?:\/([^/]+))?$/.exec(path);
    if (queue) {
      const row = state.queues.find(x => x.queue_id === queue[1]); if (!row) return missing();
      if (!queue[2]) return ok(row);
      if (method === 'GET') return ok(row.consumers);
      const consumer = {...body,consumer_id:queue[3] ?? randomUUID().replaceAll('-','')};row.consumers=[consumer];write(method,path,body);return ok(consumer);
    }
    if (path === '/workers/durable_objects/namespaces') return list(state.namespaces);
    if (path === '/workers/subdomain') return ok({subdomain:'fixture-account'});
    if (path === '/workers/assets/upload') {write(method,path);return ok({jwt:'fixture-complete-jwt'});}
    const worker = /^\/workers\/scripts\/([^/]+)(.*)$/.exec(path); if (!worker) throw Error(`unexpected fixture path ${path}`);
    const name = worker[1], suffix = worker[2];
    // Like Cloudflare, a session lists each missing content hash once, even when several paths share identical bytes.
    if (suffix === '/assets-upload-session') {write(method,path,body);return ok({jwt:'fixture-upload-jwt',buckets:[[...new Set(Object.values(body.manifest).map(x => x.hash))]]});}
    if (suffix === '/settings') return state.settings ? ok(state.settings) : missing();
    if (suffix === '/deployments') return ok({deployments:state.deployments});
    if (suffix.startsWith('/versions/')) return ok(state.version);
    if (suffix === '/secrets') return ok(state.secrets.map(x => ({name:x.name,type:'secret_text'})));
    if (suffix === '/schedules') { if (method === 'GET') return ok({schedules:state.schedules});state.schedules=body;write(method,path,body);return ok({schedules:body}); }
    if (suffix === '/subdomain') { if (method === 'GET') return ok({enabled:state.subdomain}); state.subdomain=body.enabled;write(method,path,body);return ok(body); }
    if (suffix === '' && method === 'PUT') {
      const meta = JSON.parse(await body.get('metadata').text());
      for (const item of meta.bindings.filter(x => x.type === 'secret_text')) state.secrets.push({name:item.name,value:item.text});
      const bindings = meta.bindings.map(x => x.type === 'inherit' || x.type === 'secret_text' ? {name:x.name,type:'secret_text'} : x);
      state.settings = {...meta,bindings,migration_tag:meta.migrations?.new_tag ?? state.settings?.migration_tag};
      for (const klass of meta.migrations?.new_sqlite_classes ?? []) state.namespaces.push({id:randomUUID().replaceAll('-',''),class:klass,script:name,use_sqlite:true});
      const id = randomUUID();state.version={id,resources:{bindings,script:{etag:hash(await body.get(meta.main_module).text()),handlers:['fetch','scheduled']}}};state.deployments=[{id:randomUUID(),versions:[{version_id:id,percentage:100}]}];
      write(method,path,{bindings:bindings.map(x => ({name:x.name,type:x.type}))});return ok({id:name,deployment_id:id});
    }
    throw Error(`unexpected fixture ${method} ${path}`);
  };
  return {accountId,token,state,fetch,close(){for(const row of state.databases) row.db.close();}};
}
