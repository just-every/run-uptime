import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {deploymentFailureCode,isDeploymentFailureCode} from '../scripts/deployment/diagnostics.mjs';
import {verifyBindings} from '@runeditrun/rer/internal/modules/deploy-kit/render.mjs';
import {activeWorker,secretBindings} from '@runeditrun/rer/internal/modules/deploy-kit/worker.mjs';
import {checkCronOwnership} from '@runeditrun/rer/internal/modules/deploy-kit/resources.mjs';
import {cloudflare} from '@runeditrun/rer/modules/deploy-kit/provider';

test('reviewed deployment failures map to fixed public codes',()=>{
 for(const code of ['binding-readback-mismatch','invalid-deployments','mixed-or-invalid-deployment',
  'invalid-active-version','provider-http-403','provider-http-429','provider-http-503',
  'health-http-failed','health-transport-failed','health-identity-mismatch',
  'invalid-cron-list','cron-drift','changed-or-uncertain-migration-history',
  'missing-secret-SESSION_SECRET','receipt-custody-mismatch']){
  assert.equal(deploymentFailureCode(new Error(code)),code);
  assert.equal(isDeploymentFailureCode(code),true);
 }
 assert.equal(deploymentFailureCode(new Error('UPTIME_WORKER_NAME must be a valid Cloudflare Worker name')),'invalid-worker-name');
 assert.equal(deploymentFailureCode(new Error('UPTIME_ORIGIN must be an exact HTTPS origin')),'invalid-worker-origin');
 assert.equal(deploymentFailureCode(new Error('Unexpected migration binding')),'unexpected-migration-binding');
});

test('unknown errors cannot disclose messages, private paths, payloads, stacks or guessed code families',()=>{
 for(const message of ['missing-private-token-value','missing-secret-UNREVIEWED_NAME',
  'provider-http-418','provider-http-999','health-identity-failed','binding-readback-mismatch\nprivate-value',
  '/private/credentials.json','Bearer private-value','{"success":false,"errors":["private-value"]}',
  'ENOENT: /private/credentials.json','deployment-failed\0private-value','constructor','toString']){
  const error=Object.assign(new Error(message),{cause:new Error('private-value'),response:{token:'private-value'}});
  assert.equal(deploymentFailureCode(error),'deployment-failed');
  assert.equal(isDeploymentFailureCode(message),false);
 }
 for(const value of [null,undefined,'invalid-deployments',{}, {message:'invalid-deployments'},42])assert.equal(deploymentFailureCode(value),'deployment-failed');
 let accessed=false;
 const error=new Error();Object.defineProperty(error,'message',{get(){accessed=true;throw Error('private-value');}});
 assert.equal(deploymentFailureCode(error),'deployment-failed');assert.equal(accessed,false);
 const recognized=Object.assign(new Error('invalid-deployments'),{stack:'private-stack',cause:'private-cause',response:'private-response'});
 assert.equal(JSON.stringify({ok:false,code:deploymentFailureCode(recognized)}),'{"ok":false,"code":"invalid-deployments"}');
});

test('actual Base validation failures survive classification without provider data',async()=>{
 assert.throws(()=>verifyBindings([],[{type:'d1',name:'DB',id:'private-id'}]),error=>deploymentFailureCode(error)==='binding-readback-mismatch');
 await assert.rejects(checkCronOwnership({request:async()=>({schedules:'private-response'})},{crons:['* * * * *']}),error=>deploymentFailureCode(error)==='invalid-cron-list');
 await assert.rejects(secretBindings({},'test',{secrets:[{binding:'SESSION_SECRET',environment:'SESSION_SECRET'}]},{},false),error=>deploymentFailureCode(error)==='missing-secret-SESSION_SECRET');
 const id='12345678-1234-1234-1234-123456789abc';
 for(const [deployments,version,code] of [
  [[],{},'invalid-deployments'],
  [[{id,versions:[{version_id:id,percentage:50}]}],{},'mixed-or-invalid-deployment'],
  [[{id,versions:[{version_id:id,percentage:100}]}],{id,resources:{script:{etag:''}}},'invalid-active-version'],
 ]){
  const api={request:async path=>path.endsWith('/settings')?{bindings:[]}:path.endsWith('/deployments')?{deployments}:version};
  await assert.rejects(activeWorker(api,'test'),error=>deploymentFailureCode(error)===code);
 }
 for(const status of [401,403,429,503,418]){
  const api=cloudflare({accountId:'1'.repeat(32),token:'test-only',fetch:async()=>new Response('private-provider-body',{status})});
  await assert.rejects(api.request('/workers/scripts'),error=>deploymentFailureCode(error)===(status===418?'deployment-failed':`provider-http-${status}`));
 }
});

const cli=fileURLToPath(new URL('../scripts/deployment/deploy.mjs',import.meta.url));
const run=(action,env)=>spawnSync(process.execPath,[cli,action],{env,encoding:'utf8',timeout:5000});
function failed(result,code){
 assert.equal(result.status,1);assert.equal(result.stdout,'');
 assert.equal(result.stderr,JSON.stringify({ok:false,code})+'\n');
}
test('actual CLI reports each missing required input before filesystem or provider access',()=>{
 const keys=['RER_DEPLOY_ARTIFACT','RER_DEPLOY_ARTIFACT_SHA256','RER_DEPLOY_SOURCE_SHA','RER_DEPLOY_RUN_ID',
  'RER_DEPLOY_RUN_ATTEMPT','RER_DEPLOY_RECEIPT','CLOUDFLARE_ACCOUNT_ID','CLOUDFLARE_API_TOKEN'];
 for(const action of ['deploy','health']){
  const env={};
  for(const key of keys){failed(run(action,env),`missing-${key}`);env[key]='synthetic-private-input';}
  failed(run(action,env),'absolute-path-required');
  env.RER_DEPLOY_ARTIFACT='/nonexistent/private-artifact.json';env.RER_DEPLOY_RECEIPT='/nonexistent/private-receipt.json';
  failed(run(action,env),'missing-artifact-sha256');
  failed(run(action,{NODE_PATH:'/nonexistent/private-module-path'}),'deployment-failed');
 }
 failed(run('unknown-private-action',{}),'usage-deploy-or-health');
});
