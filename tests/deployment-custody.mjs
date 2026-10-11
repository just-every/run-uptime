import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,realpath,rm,chmod,stat,symlink,link,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {regularBytes,readArtifact} from '../src/base/modules/deploy-kit/artifact.mjs';
import {hash} from '../src/base/modules/deploy-kit/validation.mjs';

const cli=fileURLToPath(new URL('../scripts/deployment/deploy.mjs',import.meta.url));
async function workspace(t){
 const root=await realpath(await mkdtemp(join(tmpdir(),'uptime-deployment-custody-')));
 t.after(()=>rm(root,{recursive:true,force:true}));
 return root;
}
async function fixture(t){
 const root=await workspace(t),path=join(root,'artifact.json'),receipt=join(root,'receipt.json');
 // This is inert artifact data. No module from it may run in the controller.
 const artifact={version:1,source:{sha:'1'.repeat(40),tree:'2'.repeat(40)},run:{id:'123',attempt:'1'},main:'index.js',modules:[{path:'index.js',base64:'',sha256:hash('')}],assets:[],migrations:[]};
 const bytes=JSON.stringify(artifact);await writeFile(path,bytes,{mode:0o600});
 const env={RER_DEPLOY_ARTIFACT:path,RER_DEPLOY_ARTIFACT_SHA256:hash(bytes),RER_DEPLOY_SOURCE_SHA:artifact.source.sha,RER_DEPLOY_RUN_ID:artifact.run.id,RER_DEPLOY_RUN_ATTEMPT:artifact.run.attempt,RER_DEPLOY_RECEIPT:receipt,CLOUDFLARE_ACCOUNT_ID:'1'.repeat(32),CLOUDFLARE_API_TOKEN:'test-only-private-provider-token',UPTIME_WORKER_NAME:'uptime-fixture',UPTIME_ORIGIN:'https://uptime.example.com'};
 return {root,path,receipt,artifact,env};
}
// A failed guard must not reach a provider even if a regression moves a read.
// This harness is test-only and emits an unmistakable failure on every request.
const denyNetwork='data:text/javascript,'+encodeURIComponent('globalThis.fetch=async()=>{console.log("UNEXPECTED_PROVIDER_REQUEST");throw Error("test-network-forbidden")};');
function failure(env,action,code){
 const result=spawnSync(process.execPath,['--import',denyNetwork,cli,action],{env,encoding:'utf8',timeout:5000});
 assert.equal(result.status,1,result.stderr);assert.equal(result.stdout,'');
 assert.equal(result.stderr,JSON.stringify({ok:false,code})+'\n');
}

test('controller rejects permissive receipts without changing credentials, unknown outcome or file mode',async t=>{
 const {receipt,artifact,env}=await fixture(t);
 const saved={source:artifact.source,run:artifact.run,artifactSha256:env.RER_DEPLOY_ARTIFACT_SHA256,deployed:false,operatorNote:'preserve',token:'PRIVATE_SENTINEL'};
 const bytes=JSON.stringify(saved);await writeFile(receipt,bytes,{mode:0o644});await chmod(receipt,0o644);
 for(const action of ['deploy','health'])failure(env,action,'receipt-permissions');
 assert.equal(await readFile(receipt,'utf8'),bytes);assert.equal((await stat(receipt)).mode&0o777,0o644);
});

test('controller rejects foreign source, run and artifact receipts without replacing owner evidence',async t=>{
 const {receipt,artifact,env}=await fixture(t);
 const saved={source:artifact.source,run:artifact.run,artifactSha256:env.RER_DEPLOY_ARTIFACT_SHA256,operatorNote:'preserve'};
 for(const changed of [{source:{...saved.source,sha:'3'.repeat(40)}},{run:{...saved.run,id:'124'}},{run:{...saved.run,attempt:'2'}},{artifactSha256:'4'.repeat(64)}]){
  const bytes=JSON.stringify({...saved,...changed});await writeFile(receipt,bytes,{mode:0o600});
  for(const action of ['deploy','health'])failure(env,action,'receipt-custody-mismatch');
  assert.equal(await readFile(receipt,'utf8'),bytes);assert.equal((await stat(receipt)).mode&0o777,0o600);
 }
});

test('receipt reads reject symlinks, private hard links and linked parents without touching unrelated bytes',async t=>{
 const {root,receipt,artifact,env}=await fixture(t);
 const outside=join(root,'unrelated.json'),bytes=JSON.stringify({source:artifact.source,run:artifact.run,artifactSha256:env.RER_DEPLOY_ARTIFACT_SHA256,token:'PRIVATE_SENTINEL'});
 await writeFile(outside,bytes,{mode:0o600});
 await symlink(outside,receipt);
 for(const action of ['deploy','health'])failure(env,action,'receipt-permissions');
 await rm(receipt);await link(outside,receipt);
 for(const action of ['deploy','health'])failure(env,action,'nonregular-or-oversize-artifact');
 await rm(receipt);await mkdir(join(root,'real'));await symlink(join(root,'real'),join(root,'alias'));
 const nested=join(root,'real','receipt.json');await writeFile(nested,bytes,{mode:0o600});
 for(const action of ['deploy','health'])failure({...env,RER_DEPLOY_RECEIPT:join(root,'alias','receipt.json')},action,'nonregular-artifact-parent');
 assert.equal(await readFile(outside,'utf8'),bytes);assert.equal((await stat(outside)).mode&0o777,0o600);
 assert.equal(await readFile(nested,'utf8'),bytes);
});

test('incomplete or missing receipt cannot establish health and remains available for inspection',async t=>{
 const {receipt,artifact,env}=await fixture(t);
 failure(env,'health','missing-or-invalid-receipt');
 await assert.rejects(stat(receipt),{code:'ENOENT'});
 for(const bytes of ['{"source":',JSON.stringify({source:artifact.source,run:artifact.run,artifactSha256:env.RER_DEPLOY_ARTIFACT_SHA256,config:{},configSha256:'incorrect',deployed:false})]){
  await writeFile(receipt,bytes,{mode:0o600});
  failure(env,'health',bytes==='{"source":'?'deployment-failed':'missing-or-invalid-receipt');
  assert.equal(await readFile(receipt,'utf8'),bytes);
 }
});

test('vendored Base artifact custody rejects changed hashes, run identity and linked files',async t=>{
 const {root,path,artifact,env}=await fixture(t);
 const expected={sha256:env.RER_DEPLOY_ARTIFACT_SHA256,sourceSha:artifact.source.sha,runId:artifact.run.id,runAttempt:artifact.run.attempt};
 assert.deepEqual(await readArtifact(path,expected),artifact);
 await assert.rejects(readArtifact(path,{...expected,sha256:'0'.repeat(64)}),/artifact-digest-mismatch/);
 await assert.rejects(readArtifact(path,{...expected,runAttempt:'2'}),/artifact-custody-mismatch/);
 await symlink(path,join(root,'symbolic'));await assert.rejects(regularBytes(join(root,'symbolic')));
 await link(path,join(root,'hard'));await assert.rejects(regularBytes(path),/nonregular-or-oversize-artifact/);
 assert.equal(await readFile(path,'utf8'),JSON.stringify(artifact));
});
