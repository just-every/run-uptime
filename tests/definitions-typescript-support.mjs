// Called by the existing native definitions journey; no additional registration.
import assert from 'node:assert/strict';
import {constants} from 'node:fs';
import {mkdir,open,writeFile} from 'node:fs/promises';
import {join,relative,resolve} from 'node:path';
import {loadTypeScriptDefinitions} from '../scripts/definitions-typescript.mjs';

export async function writeTypeScriptDefinitionsFixture(directory){
 directory=resolve(directory);
 await mkdir(directory,{recursive:true});
 const input=join(directory,'synthetic-typed-definitions.mts');
 const tsInput=join(directory,'synthetic-typed-definitions.ts');
 const jsonInput=join(directory,'synthetic-typed-definitions.json');
 const helperInput=join(directory,'synthetic-typed-helper.mts');
 const invalidInput=join(directory,'synthetic-typed-invalid.mts');
 const relativeTypes=relative(directory,resolve('src/domain/definitions/types.ts')).replaceAll('\\','/');
 const typeImport=relativeTypes.startsWith('.')?relativeTypes:'./'+relativeTypes;
 const names=['health','ready'];
 const document={format:'uptime.monitors',version:8,monitors:names.map(name=>({
  name:`Synthetic typed CI ${name}`,type:'http',url:`https://typed.example.test/${name}`,
  environment:'staging',tags:['ci-team'],intervalMs:60*1000,assertions:{status:[200,204]},
 }))};
 const helper=`import type {HttpMonitorDefinition} from ${JSON.stringify(typeImport)};
export function monitor(name:string):HttpMonitorDefinition {
 return {name:'Synthetic typed CI '+name,type:'http',url:'https://typed.example.test/'+name,
  environment:'staging',tags:['ci-team'],intervalMs:60*1000,assertions:{status:[200,204]}};
}
`;
 const source=`import type {NativeDefinitions} from ${JSON.stringify(typeImport)};
import {monitor} from './synthetic-typed-helper.mts';
const names:readonly string[]=['health','ready'];
export default {format:'uptime.monitors',version:8,monitors:names.map(name=>monitor(name))} satisfies NativeDefinitions;
`;
 const invalid=`import type {NativeDefinitions} from ${JSON.stringify(typeImport)};
export default {format:'uptime.monitors',version:8,monitors:[{
 name:'Synthetic invalid typed input',type:'http',url:'https://typed.example.test/',
 request:{headers:{authorization:'synthetic-private-diagnostic'}}
}]} satisfies NativeDefinitions;
`;
 await Promise.all([
  writeFile(helperInput,helper,{flag:'wx'}),writeFile(input,source,{flag:'wx'}),
  writeFile(tsInput,source,{flag:'wx'}),writeFile(invalidInput,invalid,{flag:'wx'}),
  writeFile(jsonInput,JSON.stringify(document),{flag:'wx'}),
 ]);
 return {input,tsInput,jsonInput,helperInput,invalidInput,text:JSON.stringify(document),document};
}

async function openedBytes(path){
 const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{return await file.readFile()}finally{await file.close()}
}

async function assertInputTypes(fixture){
 const {default:ts}=await import('typescript');
 const options={target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,
  allowImportingTsExtensions:true,noEmit:true,strict:true,skipLibCheck:true,types:[]};
 const good=ts.createProgram([fixture.input,fixture.tsInput],options);
 assert.equal(ts.getPreEmitDiagnostics(good).length,0,'typed definitions and their relative helper satisfy the public native input schema');
 const bad=ts.createProgram([fixture.invalidInput],options);
 assert.ok(ts.getPreEmitDiagnostics(bad).some(d=>d.file?.fileName===fixture.invalidInput),
  'the public input schema refuses literal request authentication fields');
}

/** Preview is the real native import door callback, returning {status,body}. */
export async function typeScriptDefinitionsProof({directory,preview}){
 const fixture=await writeTypeScriptDefinitionsFixture(directory);
 await assertInputTypes(fixture);
 const typedText=await loadTypeScriptDefinitions(fixture.input,await openedBytes(fixture.input));
 const tsText=await loadTypeScriptDefinitions(fixture.tsInput,await openedBytes(fixture.tsInput));
 assert.deepEqual(JSON.parse(typedText),fixture.document,'TypeScript functions and relative imports evaluate to the equivalent native JSON');
 assert.deepEqual(JSON.parse(tsText),fixture.document,'.ts and .mts share the same native input contract');
 const typed=await preview(typedText,'uptime.monitors');
 const json=await preview(fixture.text,'uptime.monitors');
 assert.equal(typed.status,200);assert.equal(json.status,200);
 assert.equal(typed.body.counts.refused,0);assert.equal(typed.body.counts.unsupported,0);
 assert.equal(typed.body.reviewDigest,json.body.reviewDigest,'TypeScript and JSON review exactly the same evaluated definitions');
 assert.deepEqual(typed.body.counts,json.body.counts);
 // Evaluation diagnostics and buyer logging cannot enter CLI result/error text.
 const diagnostic='synthetic-private-module-diagnostic';
 await assert.rejects(loadTypeScriptDefinitions(join(directory,'synthetic-throws.mts'),
  Buffer.from(`console.log(${JSON.stringify(diagnostic)}); throw Error(${JSON.stringify(diagnostic)});`)),
  error=>error.exitCode===2&&!error.message.includes(diagnostic));
 // The supplied opened bytes remain authoritative even if the selected path's
 // current contents differ. The native door still validates the evaluated JSON.
 const captured=Buffer.from(`export default ${fixture.text};`);
 assert.deepEqual(JSON.parse(await loadTypeScriptDefinitions(fixture.invalidInput,captured)),fixture.document,
  'evaluation consumes the already-opened entry bytes, never a second path read');
 return fixture;
}
