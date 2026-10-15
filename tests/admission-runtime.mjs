import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startLocalWorker} from './mail-provider-fixture.mjs';
import {splitSql} from './migration-support.mjs';
import {testAuthBindings,authRequest} from './auth-test-support.mjs';

export async function admissionRuntime(extra={}) {
 const directory=await mkdtemp(join(tmpdir(),'uptime-admission-'));
 const port=extra.UPTIME_ORIGIN?Number(new URL(extra.UPTIME_ORIGIN).port):0;
 let worker;
 try {
  worker=await startLocalWorker({port,persist:directory,bindings:{...testAuthBindings,UPTIME_RUNNER_KEY:'test-only-admission-runner-key-0001',...extra},outboundService:()=>{throw Error('Admission tests prohibit external requests')}});
  const origin=(await worker.ready).origin, DB=await worker.getD1Database('DB');
  for(const name of (await readdir('migrations')).filter(name=>name.endsWith('.sql')).sort())for(const sql of splitSql(await readFile(join('migrations',name),'utf8')))await DB.prepare(sql).run();
  const runtime={origin,DB,worker,call:authRequest(origin),
   restart:async()=>{await worker.dispose();worker=await startLocalWorker({port:Number(new URL(origin).port),persist:directory,bindings:{...testAuthBindings,UPTIME_RUNNER_KEY:'test-only-admission-runner-key-0001',...extra,UPTIME_ORIGIN:extra.UPTIME_ORIGIN??origin},outboundService:()=>{throw Error('Admission tests prohibit external requests')}});runtime.worker=worker;runtime.DB=await worker.getD1Database('DB')},
   close:async()=>{await worker.dispose();await rm(directory,{recursive:true,force:true})}};
  return runtime;
 } catch(error){await worker?.dispose();await rm(directory,{recursive:true,force:true});throw error}
}
