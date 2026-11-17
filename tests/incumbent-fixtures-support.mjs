// Synthetic incumbent captures through the production recognition, upload, plan, apply and reconcile doors.
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {definitionDoor} from './auth-test-support.mjs';
const exec=promisify(execFile),base='tests/fixtures/incumbent-import';
const json=async path=>JSON.parse(await readFile(join(base,path),'utf8'));
function leaves(value,path=''){
 if(value&&typeof value==='object'&&Object.keys(value).length)return Object.entries(value).flatMap(([key,child])=>leaves(child,path+'/'+key.replace(/~/g,'~0').replace(/\//g,'~1')));
 return [path||'/'];
}
function exhaustive(document,view){
 const report=view.fieldReport,paths=leaves(document).sort();
 assert.deepEqual(report.fields.map(row=>row.path).sort(),paths,'every supplied leaf and empty container has exactly one disposition');
 const containers=[];const visit=(value,path='')=>{if(value&&typeof value==='object'){containers.push(path||'/');for(const [key,child] of Object.entries(value))visit(child,path+'/'+key.replace(/~/g,'~0').replace(/\//g,'~1'))}};visit(document);assert.deepEqual(report.containers.map(row=>row.path).sort(),containers.sort(),'every supplied nested record and container is accounted for');
 assert.equal(report.counts.leaves,paths.length);assert.equal(new Set(report.fields.map(row=>row.path)).size,paths.length);
 assert.ok(report.fields.every(row=>row.disposition&&row.reason));
 assert.equal(report.captures.length,(document.records?.length??0),'each capture request is accounted for');
 assert.equal(report.records.length,report.counts.sourceRecords);
 assert.ok(report.records.every(row=>row.disposition&&row.reason));
}
export async function proveIncumbentCaptures({origin,cookie,DB,directory}){
 const out=join(directory,'generated');await mkdir(out,{recursive:true});
 await Promise.all(['a','b'].map(name=>exec(process.execPath,['scripts/generate-incumbent-import-fixtures.mjs','--output',join(out,name)])));
 assert.equal(await readFile(join(out,'a/manifest.json'),'utf8'),await readFile(join(out,'b/manifest.json'),'utf8'),'two offline generations have identical manifests');
 await exec(process.execPath,['scripts/generate-incumbent-import-fixtures.mjs','--check']);
 const door=definitionDoor({origin,cookie}),get=async path=>{const response=await fetch(origin+path,{headers:{origin,cookie}});assert.equal(response.status,200);return response.json()};
 const tables=async(productOnly=false)=>{
  const names=(await DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name!='_cf_METADATA' ORDER BY name").all()).results.map(row=>row.name).filter(name=>!productOnly||!name.startsWith('ik_')&&name!=='public_rate_limits');
  const rows={};for(let offset=0;offset<names.length;offset+=32){const group=names.slice(offset,offset+32),results=await DB.batch(group.map(name=>DB.prepare(`SELECT * FROM "${name}" ORDER BY rowid`)));group.forEach((name,i)=>rows[name]=results[i].results)}return rows;
 };
 const product=()=>tables(true);
 const noEffects=async(label,run)=>{const before=await product(),result=await run();assert.deepEqual(await product(),before,label+' changes no product rows');return result};
 const noSecrets=async()=>{const stored=await tables(),texts=[JSON.stringify(stored)];for(const rows of Object.values(stored))for(const row of rows)for(const [key,value] of Object.entries(row))if(key==='base64'&&typeof value==='string')texts.push(Buffer.from(value,'base64').toString('utf8'));assert.ok(!texts.some(text=>/SYNTHETIC_(?:SOURCE|LOCAL)_/.test(text)),'source secret sentinels never persist in any application table or decoded upload, custody included')};
 const checked=async path=>{const document=await json(path),result=await noEffects(path,()=>door.preview(document));assert.equal(result.status,200,path+': '+JSON.stringify(result.body));exhaustive(document,result.body);assert.ok(!/SYNTHETIC_(?:SOURCE|LOCAL)_/.test(JSON.stringify(result.body)));return result.body};
 // Representative native responses, schema alternatives and inert package proposals all use the same real door.
 const aws=await checked('aws/capture.json');assert.equal(aws.counts.create+aws.counts.change,0);assert.ok(aws.counts.unsupported>0);
 const pageSpeed=await checked('pagespeed/capture.json');assert.equal(pageSpeed.counts.unsupported,1);
 for(const path of ['empty/no-records.json','empty/pingdom-capture.json','empty/aws-capture.json','edge/unknown-fields.json','edge/ping-adapter-convention.json','negative/source-secrets.json','negative/tms-secrets-and-unsafe-command.json','negative/tms-performance-embedded-secrets.json','negative/smtp-source-secrets.json','aws/proposals/run-config-input-alternative.json','negative/zip-unsafe-code-capture.json'])await checked(path);
 await noSecrets();
 for(const path of ['negative/truncated.json','negative/invalid-utf8.json','negative/wrong-envelope.json','negative/malformed-number.json','negative/malformed-date.json','negative/offset-gap.json','negative/offset-wrong-number.json','negative/repeated-token.json','negative/unmatched-tms-id.json','negative/deep-nesting.json','negative/prototype-keys.json','negative/501-monitors.json','negative/expanded-companion-bound.json','negative/oversized-text.json','negative/duplicate-id-conflict.json']){
  const bytes=await readFile(join(base,path)),result=await noEffects(path,()=>door.preview(bytes));assert.ok(result.status>=400,path+' is refused before product effects');
 }
 const document=await json('pingdom/capture.json'),plan=await checked('pingdom/capture.json');
 assert.equal(plan.fieldReport.counts.sourceChecks,69,'65 uptime checks plus four TMS checks, deduplicating list/detail appearances');
 assert.equal(plan.fieldReport.counts.tlsCompanions,8,'TLS companions are counted separately from source checks');
 assert.ok(plan.fieldReport.records.some(row=>row.kind==='teams'));assert.ok(plan.fieldReport.records.some(row=>row.kind==='results'));
 assert.ok(plan.fieldReport.fields.some(row=>row.path.includes('requestheaders/0')&&row.disposition==='withheld'),'documented header arrays retain field positions with values withheld');
 assert.ok(plan.fieldReport.schemaNotes.length);assert.ok(plan.counts.create>0);assert.ok(plan.counts.unsupported>0,'adapter limitations remain visible');
 const stale=await noEffects('stale reviewed fingerprint',()=>door.apply(plan,'0'.repeat(64)));assert.equal(stale.status,403);assert.equal(stale.body.error,'review_fingerprint_mismatch');
 const applied=await door.apply(plan);assert.equal(applied.status,200,JSON.stringify(applied.body));assert.equal(applied.body.report.ok,true,'read-back reconciles exactly the reviewed native effects');
 const monitors=(await get('/api/overview')).monitors;assert.equal(monitors.length,plan.counts.create);assert.ok(monitors.every(row=>!row.definition.enabled));
 const before=await product(),again=await checked('reimport/reordered-pages.json');assert.equal(again.counts.create,0);assert.equal(again.counts.change,0);assert.ok(again.counts.unchanged>0);assert.deepEqual(await product(),before,'reordering preserves identities and definitions');
 const ids=new Map(plan.entries.filter(row=>row.monitorId).map(row=>[row.sourceId,row.monitorId]));for(const row of again.entries.filter(row=>row.monitorId))assert.equal(row.monitorId,ids.get(row.sourceId));
 // The public CLI reads the identical report and refuses stale apply before changing product rows.
 const cliEnv={...process.env,UPTIME_SESSION_COOKIE:cookie,UPTIME_CI_TOKEN:''},input=resolve(base,'pingdom/capture.json');
 const cli=await noEffects('CLI preview',()=>exec(process.execPath,['scripts/definitions.mjs','preview','--origin',origin,'--input',input,'--json'],{env:cliEnv,maxBuffer:16*1024*1024}));
 const cliView=JSON.parse(cli.stdout);exhaustive(document,cliView);assert.equal(cliView.counts.create,0);assert.equal(cliView.counts.change,0);
 const readable=await exec(process.execPath,['scripts/definitions.mjs','preview','--origin',origin,'--input',input],{env:cliEnv,maxBuffer:16*1024*1024});assert.match(readable.stdout,/Field dispositions:/);assert.match(readable.stdout,/requestheaders/);assert.match(readable.stdout,/unsupported/);
 await noEffects('CLI stale apply',()=>assert.rejects(exec(process.execPath,['scripts/definitions.mjs','apply','--origin',origin,'--input',input,'--digest','0'.repeat(64),'--json'],{env:cliEnv,maxBuffer:16*1024*1024})));
 await noSecrets();assert.equal((await door.undo(applied.body)).status,200);
 console.log('Documented synthetic captures: deterministic manifests; exhaustive leaf/resource dispositions; production owner/CLI preview, paused apply, exact read-back, stable reordered re-import, stale/malformed refusal and secret-free custody passed.');
}

if(process.argv[1]===new URL(import.meta.url).pathname){
 const {migratedWorker,runtimeDirectory,cleanupDirectory,availablePorts}=await import('./notify-acceptance-runtime.mjs'),{testAuthBindings,authRequest,sessionCookie,finishSetup}=await import('./auth-test-support.mjs');
 const directory=await runtimeDirectory(),[port]=await availablePorts(1),origin=`http://127.0.0.1:${port}`;let worker;
 try{const started=await migratedWorker({port,persist:join(directory,'worker'),bindings:{UPTIME_ORIGIN:origin}});worker=started.worker;const cookie=sessionCookie(await authRequest(origin)('/auth/bootstrap',{token:testAuthBindings.SETUP_TOKEN,displayName:'Synthetic capture owner'}));await finishSetup(origin,cookie);await fetch(origin+'/api/overview',{headers:{origin,cookie}});await proveIncumbentCaptures({origin,cookie,DB:started.DB,directory});}
 finally{await worker?.dispose();await cleanupDirectory(directory)}
}
