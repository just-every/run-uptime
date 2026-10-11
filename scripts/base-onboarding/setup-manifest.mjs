import {parseSetupManifestBytes, validateSetupManifest, setupConditionMatches, validateSetupValue} from './schema/setup-validation.mjs';
import {createModel} from './ui/model-core.mjs';
import {installerInputs} from './installer-inputs.mjs';

const legacy=['fields','safeKeys','setupGroups','requiredKeys','secretScopes','summaryDefaults','initialValues','installInput'];
export function refuseLegacySetup(value) {
 for(const source of [value,value?.model,value?.presentation])
  for(const name of legacy)if(source&&Object.hasOwn(source,name))throw Error(`Declare ${name} in rer-setup.json, not the seed or browser module.`);
 if(value?.settings?.generate!==undefined)throw Error('Declare generated secrets in rer-setup.json.');
 if(value?.features?.email!==undefined)throw Error('Declare email delivery inputs in rer-setup.json; features.email is retired.');
}

export function readSetupManifestBytes(bytes,schemaBytes,file='rer-setup.json') {
 try {
  const manifest=parseSetupManifestBytes(bytes),schema=JSON.parse(new TextDecoder().decode(schemaBytes));
  const errors=validateSetupManifest(schema,manifest);
  if(errors.length)throw Error(errors.join('; '));
  return manifest;
 }catch(error){throw Error(`Invalid setup manifest ${file}: ${error.message}`);}
}

// Browser and server call this with the same validated committed bytes.
export function createInstallerModel(manifest,presentation={},options={}) {
 refuseLegacySetup(presentation);
 const {ownerBootstrap=false,supplied=[]}=options;
 for(const field of manifest.fields)if(field.kind==='secret'&&field.input!=='entered'&&!field.generate&&
  (field.required||field.presentations?.some(item=>item.required))&&!supplied.includes(field.name))throw Error(`rer-setup.json: required managed secret ${field.name} needs adapter supplied declaration.`);
 const own=installerInputs({...presentation.features,ownerBootstrap});
 // Compile browser roles once from the manifest, preserving its input names.
 // The first required text field names the workspace; URL/colour fields provide
 // artwork context. Installer-owned hosting inputs are outside that context.
 const nameKey=manifest.fields.find(field=>field.kind==='text'&&field.required)?.name;
 const fields={},secretScopes={...own.secretScopes};
 function active(field,draft){
  if(field.when&&!setupConditionMatches(field.when,draft))return null;
  if(!field.presentations)return field;
  const matched=field.presentations.find(item=>setupConditionMatches(item.when,draft));
  if(!matched)return null;
  const {when,...metadata}=matched;return {...field,...metadata};
 }
 for(const field of manifest.fields){
  fields[field.name]={
   ...field,type:field.kind==='secret'?'password':field.kind==='colour'?'color':field.kind==='email'?'email':field.kind==='url'?'url':'text',
   artwork:field.name===nameKey||['url','colour'].includes(field.kind),
   autocomplete:field.kind==='secret'&&field.input==='entered'?'new-password':'off',
   optional:!field.required,options:field.options?.map(option=>[option.value,option.label]),
   valid(value){if(typeof value!=='string'||!value)return false;try{validateSetupValue(field,value);return true;}catch{return false;}},
   visible:draft=>Boolean(active(field,draft))&& (field.kind!=='secret'||field.input==='entered'),
   definition(draft){const current=active(field,draft)??field;return {...fields[field.name],...current,type:fields[field.name].type,options:fields[field.name].options,optional:!current.required};},
  };
  if(field.kind==='secret'&&field.input==='entered')secretScopes[field.name]=[...new Set([field.when?.field,...(field.presentations??[]).map(item=>item.when.field)].filter(Boolean))];
 }
 for(const key of Object.keys(own.fields))if(Object.hasOwn(fields,key))throw Error(`rer-setup.json: ${key} conflicts with an installer input.`);
 Object.assign(fields,own.fields);
 const groupIds=new Set(manifest.groups.map(group=>group.id));
 const generatedId=preferred=>{let id=preferred,index=1;while(groupIds.has(id))id=preferred+'-'+index++;groupIds.add(id);return id;};
 const groups=[...(manifest.fields.some(field=>!field.group)?[{id:generatedId('ungrouped'),title:manifest.title,keys:manifest.fields.filter(field=>!field.group).map(field=>field.name)}]:[]),
  ...manifest.groups.map(group=>({...group,title:group.label,keys:manifest.fields.filter(field=>field.group===group.id).map(field=>field.name)})),...own.groups.map(group=>({...group,id:generatedId(group.id)}))];
 const safeKeys=Object.keys(fields).filter(key=>fields[key].type!=='password');
 const defaults=Object.fromEntries(manifest.fields.filter(field=>field.kind!=='secret'&&field.default!==undefined).map(field=>[field.name,field.default]));
 const internal={...presentation,product:presentation.product??{name:manifest.title},fields,safeKeys,secretScopes,setupGroups:groups,
  summaryDefaults:Object.keys(defaults),initialValues:()=>defaults,nameKey,
  requiredKeys(draft){return [...manifest.fields.filter(field=>{const current=active(field,draft);return current?.required&&(field.kind!=='secret'||field.input==='entered');}).map(field=>field.name),...Object.keys(own.fields).filter(key=>!own.fields[key].optional)];},
 };
 const model=createModel(internal);
 model.secretScopes=secretScopes;
 model.nameKey=internal.nameKey;
 model.fieldVisible=(key,draft)=>fields[key]?.visible?.(draft)??true;
 model.fieldDefinition=(key,draft)=>fields[key]?.definition?.(draft)??fields[key];
 const originalSummaryKeys=model.summaryKeys;
 model.summaryKeys=(draft,state)=>originalSummaryKeys(draft,state).filter(key=>model.fieldVisible(key,draft));
 model.groupDefinition=(group,draft)=>{const variant=group.presentations?.find(item=>setupConditionMatches(item.when,draft));return {...group,...variant,title:variant?.label??group.title};};
 model.groupKeys=(group,draft)=>group.keys.filter(key=>model.fieldVisible(key,draft)).map((key,index)=>({key,index,order:model.fieldDefinition(key,draft).order??index})).sort((a,b)=>a.order-b.order||a.index-b.index).map(item=>item.key);
 model.validateInput=(input,known={})=>{
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Provide setup inputs from rer-setup.json.');
  const draft={...defaults,...input};
  for(const [key,value] of Object.entries(input)){
   if(!Object.hasOwn(fields,key))throw Error(`Undeclared setup input ${key} in rer-setup.json.`);
   if(value!==''&&value!==undefined&&!fields[key].valid(value))throw Error(`Invalid setup input ${key}.`);
  }
  const readiness=model.setupModel(draft,known);
  if(!readiness.ready)throw Error(`Provide required setup inputs: ${[...readiness.missing,...readiness.connections].join(', ')}.`);
  return model.installInput(draft);
 };
 return model;
}

// The Node branch is loaded only by the server/CLI, never by the browser.
export async function loadInstallerSeed(root,seed) {
 refuseLegacySetup(seed);
 const file=seed?.setup?.manifestFile;
 const {readFile,lstat}=await import('node:fs/promises');
 const {resolve,join}=await import('node:path');
 const {pathToFileURL}=await import('node:url');
 const privateName=/^(?:\.env(?:\..*)?|\.dev\.vars(?:\..*)?|\.npmrc|\.yarnrc(?:\.yml)?|\.?netrc|_netrc|\.pypirc|\.git-credentials|\.gitconfig|\.dockercfg|(?:owner|providers)\.json|credentials(?:\.(?:json|ini|toml|yaml|yml))?|id_(?:rsa|ed25519|ecdsa|dsa)(?:\..*)?|.*\.(?:pem|key|p12|pfx))$/i;
 const privateDirectories=new Set(['.git','.seed','.ssh','.aws','.wrangler','node_modules']);
 const reserved=new Set(['release-provenance.json','rer-broker-entry.js']);
 if(typeof file!=='string'||!/\.json$/i.test(file)||file.length>512||/^[a-z]:/i.test(file)||/[\x00-\x1f\x7f"\\]/.test(file)||file.split('/').some(part=>!part||part==='.'||part==='..'||privateName.test(part)||privateDirectories.has(part.toLowerCase())||reserved.has(part.toLowerCase())))throw Error(`Select a root-relative JSON setup manifest ${file??'rer-setup.json'} without .. or symlinks.`);
 let bytes;
 try{
  let path=resolve(root);const parts=file.split('/');
  for(const [index,part]of parts.entries()){
   path=join(path,part);const stat=await lstat(path);
   if(stat.isSymbolicLink())throw Error('symlink refused');
   if(index<parts.length-1?!stat.isDirectory():!stat.isFile())throw Error('expected a regular manifest file');
  }
  bytes=await readFile(path);
 }catch(error){throw Error(`Cannot read setup manifest ${file}: ${error.message}`);}
 const schemaBytes=await readFile(new URL('./schema/SETUP.schema.json',import.meta.url));
 const manifest=readSetupManifestBytes(bytes,schemaBytes,file);
 let presentation=seed.presentation??{product:{name:seed.product},features:seed.features};
 if(seed.browserModule){presentation=await import(pathToFileURL(join(resolve(root),seed.browserModule)).href+'?installer='+Date.now());refuseLegacySetup(presentation);}
 const options={ownerBootstrap:seed.ownerBootstrap===true,supplied:seed.supplied??[]};
 const model=createInstallerModel(manifest,presentation,options);
 return {...seed,manifest,manifestBytes:bytes,schemaBytes,model,modelOptions:options,features:presentation.features??seed.features??{}};
}
