import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {Resolver} from 'node:dns/promises';
import {publicTarget} from '../src/domain/public-target.mjs';
import {validateDefinition} from '../src/domain/policy.mjs';
import {probeHttp} from '../runners/src/probes.mjs';
test('ordinary query targets and redirects preserve public socket validation',async()=>{
 const paths=[],resolutions=[],original=http.request;let redirect='/ready?source=health&mode=full';
 const server=http.createServer((req,res)=>{paths.push(req.url);if(req.url.startsWith('/start')){res.writeHead(302,{location:redirect});res.end()}else res.end('ready')});
 await new Promise(r=>server.listen(15505,'127.0.0.1',r));
 mock.method(Resolver.prototype,'resolve4',async host=>{resolutions.push(host);return host==='private.test'?['127.0.0.1']:host==='mixed.test'?['93.184.216.34','10.0.0.1']:['93.184.216.34']});mock.method(Resolver.prototype,'resolve6',async()=>[]);
 mock.method(http,'request',function(options,callback){assert.equal(options.hostname,'93.184.216.34');assert.equal(options.lookup,undefined);assert.equal(options.headers.host,'public.test');return original.call(this,{...options,hostname:'127.0.0.1',port:15505},callback)});
 const run=url=>probeHttp(validateDefinition({name:'Query integration',url,network:'public',timeoutMs:1000,retries:0},[]),'local-a',[]);
 try{
  assert.equal(publicTarget('https://example.com/health?mode=full&source=monitor').search,'?mode=full&source=monitor');
  assert.equal((await run('http://public.test/start?mode=full')).outcome,'pass');assert.deepEqual(paths,['/start?mode=full','/ready?source=health&mode=full']);
  // Query values are opaque request data: URL-looking values never choose a host.
  for(const query of ['token=value','next=http%3A%2F%2F127.0.0.1%2F','url=http://10.0.0.1/private','host=127.0.0.1&target=http://169.254.169.254/','authority=public.test@127.0.0.1']){
   const path='/ready?'+query,before=resolutions.length;
   assert.equal((await run('http://public.test'+path)).outcome,'pass');
   assert.equal(paths.at(-1),path);assert.deepEqual(resolutions.slice(before),['public.test']);
  }
  // A query cannot disguise a forbidden authority at either initial execution or a redirect.
  for(const target of ['http://127.0.0.1/?mode=full','http://2130706433/?mode=full','http://public.test@127.0.0.1/?x=y','http://private.test/?mode=full','http://mixed.test/?next=http://public.test/','http://10.0.0.1/?host=public.test','http://169.254.169.254/?url=http://public.test/','http://[::1]/?host=public.test','http://127.0.0.1\\@public.test/?mode=full']){
   const initialCount=paths.length;
   if(['private.test','mixed.test'].includes(new URL(target).hostname))assert.equal((await run(target)).outcome,'runner_error');
   else assert.throws(()=>validateDefinition({name:'Query integration',url:target,network:'public',timeoutMs:1000,retries:0},[]));
   assert.equal(paths.length,initialCount);
   redirect=target;const before=paths.length;const result=await run('http://public.test/start?target='+encodeURIComponent(target));assert.equal(result.outcome,'runner_error');assert.equal(paths.length,before+1);
  }
 }finally{mock.restoreAll();server.closeAllConnections();await new Promise(r=>server.close(r))}
});
