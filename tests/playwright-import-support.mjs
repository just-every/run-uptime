import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {join} from 'node:path';
import {definitionDoor} from './auth-test-support.mjs';
import {FIXTURE_EMAIL,FIXTURE_PASSWORD} from './flow-fixture.mjs';
import {flowDigest} from '../src/domain/flow.mjs';
const exec=promisify(execFile);

export async function importedCheckout({directory,fixture,owner,ok,credentials,observations,waitFor}) {
 const folder=join(directory,'playwright-source');await mkdir(folder);
 const fixtureData={network:'synthetic',credentialRefs:{}};
 for(const [kind,path]of [['login','login'],['signup','signup'],['checkout','login']]){fixtureData[kind]={url:`${fixture.origin}/s/healthy/${path}`};fixtureData.credentialRefs[kind.toUpperCase()+'_EMAIL']=`synthetic-uptime-${kind}-email`;fixtureData.credentialRefs[kind.toUpperCase()+'_PASSWORD']=`synthetic-uptime-${kind}-pass`;}
 let source=`import { test, expect } from '@playwright/test';\nimport fixtures from './fixtures.json' with { type: 'json' };\n`;
 for(const kind of ['login','signup','checkout'])source+=`test('${kind==='checkout'?'Checkout flow':`synthetic-uptime-${kind}`}', async ({ page }) => {\n await page.goto(fixtures.${kind}.url);\n await page.getByLabel('Email').fill(process.env.${kind.toUpperCase()}_EMAIL!);\n await page.getByLabel('Password').fill(process.env.${kind.toUpperCase()}_PASSWORD!);\n await page.getByRole('button', { name: '${kind==='signup'?'Create account':'Sign in'}' }).click();\n await expect(page.getByText('Welcome back')).toBeVisible();\n${kind==='checkout'?" await page.getByText('Confirm order').click();\n await expect(page.getByText('Order confirmed')).toBeVisible();\n":''}});\n`;
 const input=join(folder,'suite.spec.ts'),fixtures=join(folder,'fixtures.json'),lock=join(folder,'package-lock.json');
 await Promise.all([writeFile(input,source),writeFile(fixtures,JSON.stringify(fixtureData)),writeFile(lock,JSON.stringify({name:'synthetic-uptime-1',lockfileVersion:3,packages:{'':{devDependencies:{'@playwright/test':'1.64.1'}}}}))]);
 let index=0;
 const compile=async()=>{const output=join(folder,`definitions-${index++}.json`);await exec(process.execPath,['scripts/definitions.mjs','import-playwright','--input',input,'--fixtures',fixtures,'--lock',lock,'--output',output]);return JSON.parse(await readFile(output,'utf8'));};
 const compiled=await compile();
 compiled.monitors.push({name:'synthetic-uptime-api',network:'synthetic',url:fixture.origin+'/health',probes:['local-a','local-b']});
 // The caller supplies the real Worker origin; no direct service or test-only execution path.
 const imports=definitionDoor({origin:owner.controlOrigin,cookie:owner.cookie});
 const preview=await imports.preview(JSON.stringify(compiled));assert.equal(preview.status,200);assert.equal(preview.body.counts.create,4);
 const deployed=await imports.apply(preview.body);assert.equal(deployed.status,200);assert.equal(deployed.body.report.ok,true);
 const monitors=(await ok('/api/overview')).monitors;
 for(const kind of ['login','signup','checkout']) {
  const m=monitors.find(m=>m.definition.name===(kind==='checkout'?'Checkout flow':`synthetic-uptime-${kind}`));assert.ok(m);
  for(const [suffix,value]of [['email',FIXTURE_EMAIL],['pass',FIXTURE_PASSWORD]])await writeFile(join(credentials,`synthetic-uptime-${kind}-${suffix}.json`),JSON.stringify({monitorId:m.id,origin:fixture.origin,value}),{mode:0o600});
  await ok(`/api/monitors/${m.id}`,'PATCH',{...m.definition,enabled:true});
  await waitFor(async()=>(await observations(m.id)).length>=2,`imported ${kind} ran at both vantages`,120000);
  const results=await observations(m.id);assert.ok(results.every(o=>o.outcome==='pass'&&o.flow.outcomes.every(r=>r.observed)),JSON.stringify(results.map(o=>({outcome:o.outcome,failure:o.flow?.failure,checks:o.checks}))));
  const revisions=await ok(`/api/monitors/${m.id}/revisions`);assert.equal(revisions[0].definition.flow.source.files.find(f=>f.kind==='suite').text,source);
  if(kind!=='checkout')await ok(`/api/monitors/${m.id}/erase`,'POST',{name:m.definition.name});
 }
 const checkout=monitors.find(m=>m.definition.name==='Checkout flow');
 // Unsupported code is refused by file and line; it cannot execute or emit a translated file.
 const sentinel=join(folder,'must-not-exist'),refusedOutput=join(folder,'refused.json');
 await writeFile(input,`import fs from 'node:fs';\nfs.writeFileSync(${JSON.stringify(sentinel)},'bad');\n`+source);
 await assert.rejects(exec(process.execPath,['scripts/definitions.mjs','import-playwright','--input',input,'--fixtures',fixtures,'--lock',lock,'--output',refusedOutput]),error=>/suite\.spec\.ts:1: unsupported import/.test(error.stderr));
 await assert.rejects(access(sentinel));await assert.rejects(access(refusedOutput));await writeFile(input,source);
 // Digest changes cover fixture and dependency-lock bytes without asserting any pinned hash.
 const originalDigest=await flowDigest(compiled.monitors.find(m=>m.name==='Checkout flow').flow);
 fixtureData.note='synthetic-uptime-fixture-revision';await writeFile(fixtures,JSON.stringify(fixtureData));let revision=(await compile()).monitors.find(m=>m.name==='Checkout flow');assert.notEqual(await flowDigest(revision.flow),originalDigest);
 const fixtureDigest=await flowDigest(revision.flow);await writeFile(lock,JSON.stringify({name:'synthetic-uptime-2',lockfileVersion:3,packages:{}}));revision=(await compile()).monitors.find(m=>m.name==='Checkout flow');assert.notEqual(await flowDigest(revision.flow),fixtureDigest);
 const finish=async()=>{
 await ok(`/api/monitors/${checkout.id}`,'PATCH',{...checkout.definition,flow:revision.flow,enabled:true});
 const exported=await ok('/api/definitions/export');assert.equal(exported.monitors.find(m=>m.name==='Checkout flow').flow.source.files.find(f=>f.kind==='lock').text,await readFile(lock,'utf8'));
 const history=await ok(`/api/monitors/${checkout.id}/revisions`);assert.ok(history.length>=3);assert.equal(history.at(-1).definition.flow.source.files.find(f=>f.kind==='suite').text,source);
 const failures=[];
 async function retainFailure(expected){
  const candidate=(await compile()).monitors.find(m=>m.name==='Checkout flow');
  await ok(`/api/monitors/${checkout.id}`,'PATCH',{...checkout.definition,url:candidate.url,flow:candidate.flow,enabled:true});
  const queued=await ok(`/api/monitors/${checkout.id}/run`,'POST',{});
  const result=await waitFor(async()=>{const slot=(await ok(`/api/monitors/${checkout.id}/history`)).find(s=>s.id===queued.slotId);return slot?.observations.length>=2&&slot;},`imported ${expected} was retained`,120000);
  assert.ok(result.observations.every(o=>o.outcome==='target_failure'&&o.flow?.failure?.reason===expected),JSON.stringify(result.observations.map(o=>({outcome:o.outcome,failure:o.flow?.failure}))));
  failures.push(result);
 }
 fixtureData.flowFixtures={setup:[{name:'synthetic-uptime-setup',url:fixture.origin+'/health',assertions:{status:201}}],teardown:[{name:'synthetic-uptime-teardown',url:fixture.origin+'/health',assertions:{status:200}}]};
 await writeFile(fixtures,JSON.stringify(fixtureData));await retainFailure('setup_failed');
 delete fixtureData.flowFixtures;await writeFile(fixtures,JSON.stringify(fixtureData));
 await writeFile(input,source.replace('Order confirmed','synthetic-uptime-outcome-missing'));await retainFailure('expectation_not_met');
 await writeFile(input,source);fixtureData.checkout.url=fixture.origin+'/s/metadata-subresource/login';await writeFile(fixtures,JSON.stringify(fixtureData));await retainFailure('blocked_request');
 assert.equal(new Set(failures.map(s=>s.observations[0].flow.failure.reason)).size,3,'fixture, assertion and forbidden network failures remain distinct');
 fixtureData.checkout.url=fixture.origin+'/s/healthy/login';await writeFile(fixtures,JSON.stringify(fixtureData));fixture.setScenario('healthy','duplicate-controls');try{await retainFailure('element_missing')}finally{fixture.setScenario('healthy','healthy')}

 const retained=JSON.stringify([failures,await ok(`/api/monitors/${checkout.id}/revisions`)]);
 assert.ok(!retained.includes(FIXTURE_PASSWORD)&&!retained.includes(FIXTURE_EMAIL),'selected secret values never enter imported revision or result custody');
 console.log('FLOW-002 broken fixture, assertion and metadata network call retained three distinct outcomes through the existing runner request policy; selected secrets stayed out of revision and result evidence.');

 };
 console.log('FLOW-002 translated login/signup/checkout through CLI, preview and ordinary deploy alongside an API check; scheduled isolated runs passed; unsupported source refused at suite.spec.ts:1; immutable source/fixture/lock digests and definition export retained.');
 return {id:checkout.id,finish};
}
