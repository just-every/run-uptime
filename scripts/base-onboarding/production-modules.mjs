import { readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';

// Vite has already emitted the complete Worker module graph. Miniflare 5
// requires explicit modules; use its own rule compiler for Wrangler's rules.
export async function productionModules(main, rules, {compileModuleRules,testRegExps}) {
 const root=dirname(main),compiled=compileModuleRules(rules);
 const modules=[{type:'ESModule',path:main}];
 async function visit(directory){
  for(const entry of (await readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
   const path=join(directory,entry.name);
   if(entry.isSymbolicLink())throw Error('Production modules must be regular output files.');
   if(entry.isDirectory())await visit(path);
   else if(entry.isFile()&&resolve(path)!==resolve(main)){
    const name=relative(root,path).split('\\').join('/');
    const rule=compiled.find(rule=>testRegExps(rule.include,name));
    if(rule)modules.push({type:rule.type,path});
   }
  }
 }
 await visit(root);return {modulesRoot:root,modules};
}
