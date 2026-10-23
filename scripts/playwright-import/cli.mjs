import {open,writeFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {basename,resolve} from 'node:path';
import {translateSuite} from './parse.mjs';

async function input(path) {
 const file=await open(resolve(path),constants.O_RDONLY|constants.O_NOFOLLOW);
 try {const stat=await file.stat();if(!stat.isFile()||stat.size>65536)throw Error('Import files must be regular files of at most 64 KiB');return new TextDecoder('utf-8',{fatal:true}).decode(await file.readFile());} finally {await file.close();}
}
export async function importPlaywright(options) {
 for(const key of ['input','fixtures','lock','output'])if(!options[key])throw Error(`import-playwright needs --${key}`);
 const [text,fixtureText,lockText]=await Promise.all([input(options.input),input(options.fixtures),input(options.lock)]);
 if(basename(options.fixtures)!=='fixtures.json')throw Error('The fixture file must be named fixtures.json');
 const fixtures=JSON.parse(fixtureText),lock=JSON.parse(lockText);
 if(!fixtures||typeof fixtures!=='object'||Array.isArray(fixtures))throw Error('fixtures.json must be an object');
 if(!lock||lock.lockfileVersion!==3||!lock.packages||typeof lock.packages!=='object')throw Error('A package-lock.json v3 dependency lock is required');
 // Dependency metadata is retained, never installed. Credential-bearing locks are not importable.
 const safe=value=>{if(typeof value==='string'&&/^[a-z]+:\/\//i.test(value)){const u=new URL(value);if(u.username||u.password||u.search||u.hash)throw Error('Lock and fixture URLs cannot contain credentials, queries or fragments');}else if(value&&typeof value==='object')for(const [key,child]of Object.entries(value)){if(/^(?:password|token|secret|authorization|cookie|api[_-]?key)$/i.test(key))throw Error('Import data contains a credential field; select runner-local credentialRef instead');safe(child);}};
 safe(fixtures);safe(lock);
 const files=[{path:basename(options.input),kind:'suite',text},{path:'fixtures.json',kind:'fixture',text:fixtureText},{path:basename(options.lock),kind:'lock',text:lockText}];
 const monitors=translateSuite(basename(options.input),text,fixtures).map(m=>({...m,flow:{...m.flow,source:{files}}}));
 const base=options.base?JSON.parse(await input(options.base)):{format:'uptime.monitors',version:8,monitors:[]};
 if(base.format!=='uptime.monitors'||!Array.isArray(base.monitors))throw Error('--base must be an Uptime monitor file');
 const result={format:'uptime.monitors',version:8,monitors:[...base.monitors,...monitors]};
 await writeFile(resolve(options.output),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
 return {output:options.output,translated:monitors.map(m=>({name:m.name,steps:m.flow.steps,outcomes:m.flow.outcomes})),execution:'closed-flow-only'};
}
