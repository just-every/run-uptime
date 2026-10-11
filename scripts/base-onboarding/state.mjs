import { credentialFingerprint } from './secrets.mjs';
import { createCommands } from './commands.mjs';
import { createActivity } from './activity.mjs';
import { rename } from 'node:fs/promises';
import { join } from 'node:path';
import { privateDirectory, readPrivateFile, writePrivateFile } from './private-files.mjs';
export async function createState(root,seed) {
 const fields=seed.model.safeKeys;
 const directory=await privateDirectory(root,['.seed','installer']);
 const file=join(directory,'state.json'); let saved={};
 try { const value=JSON.parse(await readPrivateFile(file)); if(value&&typeof value==='object') saved=value; } catch(error) { if(error.code!=='ENOENT' && !(error instanceof SyntaxError)) throw error; }
 if(saved.product&&saved.product!==seed.product)throw Error('Saved installer details belong to another seed.');
 saved.draft=Object.fromEntries(Object.entries(saved.draft||{}).filter(([key,value])=>fields.includes(key)&&typeof value==='string'));
 // Older receipts did not distinguish suggestions from answers. Preserve their
 // saved owner details; newly written receipts carry the exact answer set.
 const answered=(Array.isArray(saved.answered)?saved.answered:Object.keys(saved.draft)).filter(key=>typeof key==='string'&&Object.hasOwn(saved.draft,key));
 const state={phase:'ready',step:'Ready to install',logs:[],answered:[...new Set(answered)],sources:Object.fromEntries(Object.entries(saved.sources||{}).filter(([key,value])=>fields.includes(key)&&['agent','browser','saved'].includes(value))),lastUpdate:{revision:Number.isSafeInteger(saved.lastUpdate?.revision)?saved.lastUpdate.revision:0,source:'saved',keys:[]},draft:saved.draft||{},known:{product:seed.product,root,nodeVersion:process.version},...(saved.phase==='running'?{error:'The previous run was interrupted. Review the details before starting again.'}:{})};
 // Remember invalidated credential identities privately, never their bytes.
 // A replacement written to settings has a different identity and can resume.
 const invalidatedSecrets=new Map((Array.isArray(saved.invalidatedSecrets)?saved.invalidatedSecrets:[]).filter(item=>item&&Object.hasOwn(seed.model.secretScopes||{},item.name)&&/^[a-f0-9]{64}$/.test(item.fingerprint)).map(item=>[item.name+':'+item.fingerprint,{name:item.name,fingerprint:item.fingerprint}]));
 const activity=createActivity(state,fields);
 const commands=await createCommands(directory,state);
 let pending=Promise.resolve();
 const persist=()=>{const content=JSON.stringify({product:seed.product,phase:state.phase,draft:state.draft,answered:state.answered,sources:state.sources,lastUpdate:state.lastUpdate,invalidatedSecrets:[...invalidatedSecrets.values()]});pending=pending.then(async()=>{await writePrivateFile(file+'.tmp',content);await rename(file+'.tmp',file)});return pending};
 return {state,activity,...commands,
  isInvalidatedSecret(name,value){return typeof value==='string'&&invalidatedSecrets.has(name+':'+credentialFingerprint(value));},
  async invalidateSecrets(keys){
   let changed=false;for(const item of keys){const key=item.name+':'+item.fingerprint;if(!invalidatedSecrets.has(key)){invalidatedSecrets.set(key,item);changed=true;}}
   if(changed)await persist();else await pending;
  },
  async acceptSecrets(input){
   let changed=false;for(const name of Object.keys(seed.model.secretScopes||{}))if(typeof input[name]==='string')changed=invalidatedSecrets.delete(name+':'+credentialFingerprint(input[name]))||changed;
   if(changed)await persist();else await pending;
  },
  async draft(input,source='browser',updatedKeys=Object.keys(input)){
   const keys=updatedKeys.filter(key=>fields.includes(key)&&typeof input[key]==='string');
   for(const key of keys)if(source==='agent'||input[key]!==state.draft[key])state.sources[key]=source;
   state.lastUpdate={source,keys,revision:state.lastUpdate.revision+1};
   state.answered=[...new Set([...state.answered,...keys])].filter(key=>fields.includes(key)&&typeof input[key]==='string');
   state.draft=Object.fromEntries(fields.filter(key=>typeof input[key]==='string').map(key=>[key,input[key]]));
   await persist();if(source==='agent')activity.filled(keys);
  },
  async step(label){label=commands.redact(label);state.step=label;commands.report(label);activity.step(label);await persist()},
  async phase(phase){state.phase=phase;activity.phase(phase);await persist()}
 };
}
