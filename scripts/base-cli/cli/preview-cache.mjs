import {shared} from './shared.mjs';
import {invalid,refuse} from './errors.mjs';
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, unlink } from 'node:fs/promises';
import { join, relative, resolve, dirname, extname } from 'node:path';
const excluded = new Set(['node_modules','.git','.wrangler','.seed','.rer','.cache','.state','dist','coverage','test-results','playwright-report']);
// A project declares the paths its build regenerates (`generatedOutputs` on the
// adapter): project-relative files or directories. They are not build inputs.
export function generatedOutputs(project) {
 const declared=project.adapter.generatedOutputs??[];
 if(!Array.isArray(declared))throw invalid('Adapter generatedOutputs must be a list of project-relative paths.');
 return declared.map(path=>{
  const name=typeof path==='string'?path.replace(/\/+$/,''):'';
  if(!name||name.startsWith('/')||name.includes('\\')||name.split('/').some(part=>part===''||part==='.'||part==='..'))throw invalid(`Adapter generatedOutputs entry ${JSON.stringify(path)} must be a project-relative file or directory path.`);
  return name;
 });
}
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function tree(root,{privateFiles=[],generated=[],outputs=false,metadata}={}) {
 const files={};
 async function walk(directory) {
  for(const entry of (await readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
   const path=join(directory,entry.name),name=relative(root,path);
   if(!outputs && (((directory===root&&excluded.has(entry.name))||['node_modules','.git'].includes(entry.name))||/^\.env(?:\.|$)|^\.dev\.vars(?:\.|$)/.test(entry.name)||privateFiles.includes(name)))continue;
   if(generated.some(item=>name===item||name.startsWith(item+'/')))continue;
   if(entry.isSymbolicLink())throw Error('Build receipt cannot certify symbolic source/output links.');
   if(entry.isDirectory())await walk(path);
   else if(entry.isFile()){
    const before=await lstat(path,{bigint:true});files[name]=digest(await readFile(path));
    const after=await lstat(path,{bigint:true});
    if(stamp(before)!==stamp(after))throw Error('Build input/output changed while it was read.');
    if(metadata)metadata[name]=stamp(after);
   }
   else throw Error('Build receipt requires regular files.');
  }
 }
 await walk(root);return files;
}
const stamp=status=>[status.dev,status.ino,status.size,status.mtimeNs,status.ctimeNs].map(String).join(':');
export async function buildInputs(project,{revision=false}={}) {
 const metadata={},sources=await tree(project.root,{privateFiles:project.adapter.settings,generated:generatedOutputs(project),metadata});
 const pending=Object.keys(sources).filter(name=>/\.[cm]?[jt]sx?$/.test(name)).map(name=>resolve(project.root,name));
 const seen=new Set(),external={};
 while(pending.length){
  const file=pending.pop();if(seen.has(file))continue;seen.add(file);
  const bytes=await readFile(file);const name=relative(project.root,file);
  if(name.startsWith('..')){external[name]=digest(bytes);metadata[name]=stamp(await lstat(file,{bigint:true}));}
  for(const match of bytes.toString().matchAll(/(?:from\s*|import\s*\(?|require\s*\()(['"])(\.[^'"\n]+)\1/g)){
   const path=resolve(dirname(file),match[2]);
   for(const candidate of [path,...['.ts','.tsx','.js','.mjs','/index.ts','/index.js'].map(ext=>path+ext),...(extname(path)==='.js'?[path.slice(0,-3)+'.ts']:[])]){
    try{if((await lstat(candidate)).isFile()){if(!/\.dev\.vars|(?:^|\/)\.env(?:\.|$)/.test(candidate))pending.push(candidate);break;}}catch{}
   }
  }
 }
 const tools={};
 for(const name of ['vite','wrangler','@cloudflare/vite-plugin','typescript']){
  try{const pkg=JSON.parse(await readFile(join(project.root,'node_modules',name,'package.json'),'utf8'));tools[name]=pkg.version;}catch{tools[name]=null;}
 }
 const inputs=digest(JSON.stringify({sources,external:Object.fromEntries(Object.entries(external).sort()),node:process.versions.node,tools,build:project.adapter.hooks.build}));
 return revision?{inputs,revision:digest(JSON.stringify(metadata)),files:{...sources,...external},stamps:metadata}:inputs;
}

// Name the inputs the build touched: edited contents versus a rewrite that left
// the bytes alone (a generated file the project has not declared).
function changedInputs(before,after) {
 const names=new Set([...Object.keys(before.files),...Object.keys(after.files)]);
 const edited=[...names].filter(name=>before.files[name]!==after.files[name]).sort();
 const rewritten=[...names].filter(name=>before.files[name]===after.files[name]&&before.stamps[name]!==after.stamps[name]).sort();
 // Many files in one directory read as that directory, which is also the declaration to make.
 const grouped=items=>{
  const folders=new Map();for(const name of items){const folder=dirname(name);folders.set(folder,(folders.get(folder)??0)+1);}
  return [...new Set(items.map(name=>folders.get(dirname(name))>1?`${dirname(name)}/ (${folders.get(dirname(name))} files)`:name))];
 };
 const list=(items,group)=>{const names=group?grouped(items):items;return names.slice(0,5).join(', ')+(names.length>5?` and ${names.length-5} more`:'');};
 const parts=[];
 if(edited.length)parts.push(`Source changed while the production build ran: ${list(edited)}. Leave it alone during the build, then run preview again.`);
 if(rewritten.length){const them=rewritten.length>1?'them':'it';parts.push(`The production build rewrote ${list(rewritten,true)} with identical contents. If the build generates ${them}, declare ${them} as generatedOutputs in the project adapter; otherwise stop whatever rewrites ${them}.`);}
 return parts.join(' ')||'Build inputs changed during the production build (tools, Node or the build command). Run preview again.';
}

export async function productionBuild(project,build,report=()=>{}) {
 const {privateDirectory,writePrivateFile,readPrivateFile}=await shared('private-files.mjs');
 const directory=await privateDirectory(project.root,['.rer','local']),receipt=join(directory,'production.json'),output=join(project.root,'dist');
 try{const info=await lstat(receipt);if(!info.isFile()||info.isSymbolicLink()||info.uid!==process.getuid())throw Error('Production receipt must be an owned regular file.');}catch(error){if(error.code!=='ENOENT')throw error;}
 const before=await buildInputs(project,{revision:true}),inputs=before.inputs;
 try {
  const prior=JSON.parse(await readPrivateFile(receipt));
  const outputs=await tree(output,{outputs:true});
  if(prior.version===1 && prior.inputs===inputs && outputs['server/wrangler.json'] && prior.outputs===digest(JSON.stringify(outputs))){report('Reusing intact production output.');return {reused:true};}
 } catch { /* Missing/corrupt input receipt or output cannot authorize reuse. */ }
 await unlink(receipt).catch(error=>{if(error.code!=='ENOENT')throw error;});
 report('Building production output.');const started=performance.now();await build();const buildMilliseconds=performance.now()-started;
 const outputs=await tree(output,{outputs:true});
 if(!outputs['server/wrangler.json'])throw Error('Production configuration is missing.');
 const after=await buildInputs(project,{revision:true});
 if(after.inputs!==inputs||after.revision!==before.revision)throw refuse(changedInputs(before,after));
 await writePrivateFile(receipt,JSON.stringify({version:1,inputs,outputs:digest(JSON.stringify(outputs)),buildMilliseconds})+'\n');
 return {reused:false};
}
