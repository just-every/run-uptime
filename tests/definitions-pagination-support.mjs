import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {previewDefinitions} from '../src/domain/business-import/plan-view.server.ts';
const exec=promisify(execFile);

export const paginationLink='https://api.uptimerobot.com/v3/monitors?cursor=synthetic-uptime-97';
const monitor=id=>({id,friendlyName:`synthetic-uptime-${id}`,type:'HTTP',url:`https://synthetic-uptime-${id}.example/`,interval:300,timeout:5});
const first={data:[monitor(97001)],nextLink:paginationLink},last={data:[monitor(97002)],nextLink:null},empty={data:[],nextLink:null};
export const paginationCases=[
 {name:'incomplete',text:JSON.stringify(first),entries:1,incomplete:true},
 {name:'concatenated',text:[first,last].map(page=>JSON.stringify(page)).join('\n'),entries:2,incomplete:false},
 {name:'array',text:JSON.stringify([first,last]),entries:2,incomplete:false},
 {name:'empty-terminal',text:[first,empty].map(page=>JSON.stringify(page)).join('\n'),entries:1,incomplete:false},
];

// The existing Definitions preview transport and both command output formats read the same file-level warning.
export async function provePaginationPreview({imports,env,origin,cookie,directory}){
 const views=[];
 for(const step of paginationCases){
  const result=await imports.preview(step.text);assert.equal(result.status,200,step.name);
  const view=result.body;assert.equal(view.entries.length,step.entries,step.name);
  assert.equal(view.warnings.length,step.incomplete?1:0,step.name+' warns only for an unfinished last page');
  if(step.incomplete)assert.match(view.warnings[0],/incomplete/i);
  assert.ok(!JSON.stringify(view).includes(paginationLink),'preview never displays the continuation URL');
  // Release the unapplied preview before reading another file of this source.
  if(!view.applied&&view.counts.create+view.counts.change)assert.equal((await imports.door(view.namespace,'undo',{planId:view.planId})).status,200);
  const local=await previewDefinitions(env,step.text);
  assert.deepEqual(local.warnings,view.warnings,'local read-only preview keeps the same file warning');
  assert.deepEqual(local.entries,view.entries);assert.equal(local.reviewDigest,view.reviewDigest);
  const input=join(directory,`pagination-${step.name}.json`);await writeFile(input,step.text,{mode:0o600});
  const args=['scripts/definitions.mjs','preview','--origin',origin,'--input',input];
  const options={env:{...process.env,UPTIME_SESSION_COOKIE:cookie,UPTIME_CI_TOKEN:''}};
  const json=JSON.parse((await exec(process.execPath,[...args,'--json'],options)).stdout);
  assert.deepEqual(json.warnings,view.warnings);assert.equal(json.entries.length,step.entries);
  const text=(await exec(process.execPath,args,options)).stdout;
  assert.equal(text.includes('Warning:'),step.incomplete,step.name+' text output');
  for(const warning of view.warnings)assert.ok(text.includes(warning));
  assert.ok(!text.includes(paginationLink)&&!JSON.stringify(json).includes(paginationLink),'CLI never displays the continuation URL');
  views.push(view);
 }
 assert.deepEqual(views[0].entries,views[3].entries,'a terminal empty page does not alter the monitor mapping');
 assert.equal(views[0].reviewDigest,views[3].reviewDigest,'pagination warnings do not change the reviewed digest');
 assert.deepEqual(views[1].entries,views[2].entries,'concatenated and array pages preserve the same entries');
 console.log('UptimeRobot pagination preview PASS: incomplete, concatenated, array and empty terminal pages; console/API, local preview and CLI text/JSON.');
}
