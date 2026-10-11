import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,rm,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {producePackage} from '../scripts/delivery/base/package.mjs';
const config=JSON.parse(await readFile('scripts/delivery/base/packaging.json','utf8'));
for(const path of ['delivery-artifact','rer-package'])await assert.rejects(lstat(path),{code:'ENOENT'},'artifact test requires a fresh output directory');
try {
 await promisify(execFile)(process.execPath,['scripts/build-delivery-artifact.mjs']);
 const file=join('delivery-artifact',config.project.deployment.artifactFile), artifact=JSON.parse(await readFile(file,'utf8'));
 assert.equal(artifact.schema,2,'delivery consumes raw schema-2 payloads');
 for(const entry of [...artifact.modules,...artifact.assets]){
  const bytes=await readFile(join('delivery-artifact',entry.payload));
  assert.equal(bytes.length,entry.size,'payload size must describe emitted bytes');
  assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256,'payload digest must describe emitted bytes');
 }
 assert.ok(artifact.modules.some(module=>module.name===artifact.mainModule),'declared entry point must be packaged');
 for(const migration of artifact.deploymentSpec.migrations)assert.equal(createHash('sha256').update(migration.sql).digest('hex'),migration.sha256);
 await producePackage({config,output:'rer-package'});
 const descriptor=JSON.parse(await readFile('rer-package/rer-project.json','utf8'));
 const setup=await readFile('rer-setup.json');
 assert.ok((await readFile('rer-package/rer-setup.json')).equals(setup),'installer and delivery use identical manifest bytes');
 assert.equal(descriptor.setup.sha256,createHash('sha256').update(setup).digest('hex'));
 assert.deepEqual(descriptor,JSON.parse(await readFile('rer-project.json','utf8')),'committed descriptor follows the producer policy');
 console.log(`DELIVERY-ARTIFACT passed: ${artifact.modules.length} modules, ${artifact.assets.length} assets, ${artifact.deploymentSpec.migrations.length} migrations; exact payload integrity and setup digest.`);
} finally {await rm('delivery-artifact',{recursive:true,force:true});await rm('rer-package',{recursive:true,force:true})}
