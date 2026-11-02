// Read native declarations in the Worker runtime, without installation bindings
// or invoking a classifier, action, resource reader or provider.
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';

const root=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(import.meta.url);
const {build}=createRequire(require.resolve('vite/package.json'))('esbuild');
export async function agentCatalogue(){
 const directory=await mkdtemp(join(tmpdir(),'uptime-agent-docs-'));
 let worker;
 try{
  const entry=`
   import {tools} from './src/agent-door/registry.server.ts';
   import {agentCapabilities,resourceDefinitions} from './src/agent-door/index.server.ts';
   import {nativeProof} from './src/agent-door/proof.server.ts';
   import {registry} from './src/base/modules/agent-door/registry.ts';
   import {capabilitySet,offers} from './src/base/modules/agent-door/capabilities.mjs';
   const bindings=new Proxy({}, {get(){throw Error('Catalogue cannot read installation bindings')}});
   export default {fetch(){
    const registered=registry({seed:'uptime',origin:'https://catalogue.invalid',capabilities:agentCapabilities,tools:tools(bindings),nativeProof:nativeProof(bindings)});
    return Response.json({capabilities:capabilitySet(agentCapabilities),
     tools:registered.filter(tool=>tool.exposure!=='invoke').map(({name,title,classes,scope})=>({name,title,classes,scope})),
     resources:offers(agentCapabilities,'resources')?resourceDefinitions(bindings).map(({uriTemplate})=>uriTemplate).sort():[]});
   }};
  `;
  const scriptPath=join(directory,'catalogue.mjs');
  await build({stdin:{contents:entry,resolveDir:root,loader:'ts'},outfile:scriptPath,bundle:true,format:'esm',platform:'neutral',conditions:['workerd','worker','browser'],external:['cloudflare:*','node:*'],logLevel:'silent'});
  worker=new Miniflare(convertV4MiniflareOptions({scriptPath,modules:true,modulesRoot:directory,compatibilityDate:'2026-09-08',compatibilityFlags:['nodejs_compat'],host:'127.0.0.1',port:0,cf:{},outboundService:()=>{throw Error('Catalogue cannot contact a provider')},unsafeLocalExplorer:false,unsafeObservability:false}));
  const response=await worker.dispatchFetch('https://catalogue.invalid');
  if(!response.ok)throw Error('Native catalogue extraction failed');
  return await response.json();
 }finally{await worker?.dispose();await rm(directory,{recursive:true,force:true})}
}
const cell=value=>String(value).replaceAll('|','\\|').replaceAll('\n',' ');
export function renderAgentDocs(catalogue){
 const lines=[
  '## Current agent surface','',
  'This public catalogue describes the callable native monitoring tools. It contains no installation records or credentials. Reading it does not run a tool or contact a provider. Tool execution requires authenticated current authority and the company policy in force.','',
  `Declared capabilities: ${catalogue.capabilities.declared.map(name=>'`'+name+'`').join(', ')}.`,
  `Undeclared capabilities: ${catalogue.capabilities.refused.map(name=>'`'+name+'`').join(', ')}.`,'',
  '## Callable tools','',
  'These names come from the native action registry, excluding internal worker admissions. Classes below are declarations; the actual call computes its facts and classes from current native state. A listed tool is not permission to run it.','',
 ];
 const jobs=Map.groupBy(catalogue.tools,tool=>tool.name.split('.')[1]);
 for(const [job,tools] of jobs){
  lines.push('### '+job[0].toUpperCase()+job.slice(1),'','| Tool | Job | Declared classes | Required scope |','| --- | --- | --- | --- |');
  for(const tool of tools)lines.push(`| \`${cell(tool.name)}\` | ${cell(tool.title.replaceAll('/',' and '))} | ${tool.classes.map(name=>'`'+cell(name)+'`').join(', ')} | \`${cell(tool.scope)}\` |`);
  lines.push('');
 }
 lines.push('## Resource templates','');
 if(catalogue.capabilities.declared.includes('resources')){
  lines.push('| URI template |','| --- |',...catalogue.resources.map(uri=>`| \`${cell(uri)}\` |`),'');
 }else{
  lines.push('Declared resource templates: none. Resources are undeclared and unavailable. The resource-template discovery inventory is empty. Internal templates retained in the implementation are not callable resources and are not advertised here. This does not establish complete resource acceptance.','');
 }
 lines.push('## Qualification boundary','',
  'This catalogue covers the current callable inventory. It does not establish complete computed-class test attribution, generated discovery instructions, event types, capacity limits, error codes or specialist jobs. Prompts, events and subscriptions remain undeclared. Broader lifecycle, two-policy conformance, stranger-agent and console qualification remain separate work.','',
  'See [Monitoring API and CSV](/docs/read-api) and [Security](/docs/security) for the existing native API and authority boundaries.','');
 return lines.join('\n');
}
export async function agentDocument(){return renderAgentDocs(await agentCatalogue())}
export async function checkAgentDocs(path=join(root,'docs/agents.md')){
 if(await readFile(path,'utf8')!==await agentDocument())throw Error('Stale agent catalogue: run node scripts/agent-docs.mjs write');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [command,...extra]=process.argv.slice(2);
 if(extra.length||!['write','check'].includes(command))throw Error('Usage: node scripts/agent-docs.mjs write|check');
 if(command==='write')await writeFile(join(root,'docs/agents.md'),await agentDocument());
 else await checkAgentDocs();
 console.log('Agent catalogue '+command+' passed');
}
