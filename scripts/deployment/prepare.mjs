// Credential-free build packaging; the emitted code is inert JSON at deployment.
import {execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,cp,rm,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {packageBuild,assertCredentialFree} from '../../src/base/modules/deploy-kit/prepare.mjs';
import {hash,assert} from '../../src/base/modules/deploy-kit/validation.mjs';
import {MAX_ARTIFACT} from '../../src/base/modules/deploy-kit/artifact.mjs';
assertCredentialFree(process.env);
assert(process.platform==='linux'&&process.env.RER_PREPARE_ISOLATION==='ephemeral-credential-free-job','prepare-requires-isolated-linux-job');
const root=process.cwd(),output=resolve(process.env.RER_DEPLOY_ARTIFACT??'');
assert(process.env.RER_DEPLOY_ARTIFACT&&output!==root&&!output.startsWith(root+'/'),'artifact-must-be-outside-checkout');
const prepareHome=resolve(process.env.RER_PREPARE_HOME??'');
assert(process.env.RER_PREPARE_HOME&&prepareHome!==root&&!prepareHome.startsWith(root+'/'),'isolated-home-required');
await mkdir(prepareHome,{recursive:false,mode:0o700});
const cleanEnv={PATH:process.env.PATH,HOME:prepareHome,CI:'true',GIT_CONFIG_NOSYSTEM:'1',WRANGLER_SEND_METRICS:'false',CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV:'false'};
const git=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8',env:cleanEnv}).trim();
let source,stage;
try{
source={sha:git('rev-parse','HEAD'),tree:git('rev-parse','HEAD^{tree}')};
assert(source.sha===process.env.RER_DEPLOY_SOURCE_SHA&&!git('status','--porcelain','--untracked-files=normal'),'prepare-source-mismatch');
assert(/^\d+$/.test(process.env.RER_DEPLOY_RUN_ID??'')&&/^\d+$/.test(process.env.RER_DEPLOY_RUN_ATTEMPT??''),'missing-run-identity');
execFileSync('pnpm',['build'],{cwd:root,env:cleanEnv,stdio:'inherit'});
assert(!git('status','--porcelain','--untracked-files=normal'),'source-changed-during-build');
stage=await mkdtemp(join(tmpdir(),'uptime-package-'));
 await mkdir(join(stage,'migrations/core'),{recursive:true});
 await cp(join(root,'dist'),join(stage,'dist'),{recursive:true});
 await cp(join(root,'migrations'),join(stage,'migrations/core'),{recursive:true});
 const artifact=await packageBuild({root:stage,source,runIdentity:{id:process.env.RER_DEPLOY_RUN_ID,attempt:process.env.RER_DEPLOY_RUN_ATTEMPT},productDirectory:''});
 const bytes=JSON.stringify(artifact);assert(Buffer.byteLength(bytes)<=MAX_ARTIFACT,'artifact-too-large');
 await writeFile(output,bytes,{flag:'wx',mode:0o600});console.log(JSON.stringify({source,sha256:hash(bytes),run:artifact.run}));
}finally{if(stage)await rm(stage,{recursive:true,force:true});await rm(prepareHome,{recursive:true,force:true})}
