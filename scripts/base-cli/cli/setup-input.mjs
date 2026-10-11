import {readFile} from 'node:fs/promises';
import {createInterface} from 'node:readline/promises';
import {Writable} from 'node:stream';
import {contained} from './project.mjs';
import {shared} from './shared.mjs';
import {localSettingKeys} from './settings.mjs';
import {mailbox} from './parse.mjs';
import {invalid,missing,refuse} from './errors.mjs';
import {savedSetupAnswers} from './setup-answers.mjs';

export async function setupInput(project, options, vars, signal) {
 let answers = {};
 const { loadInstallerSeed } = await shared('setup-manifest.mjs');
 let seed;
 try { seed = project.setupSeed ?? await loadInstallerSeed(project.root, project.adapter); }
 catch { throw invalid('Setup manifest is missing, invalid or incompatible with its installer. Restore the declared manifest and presentation sources.'); }
 project.setupManifest = seed.manifest;
 if (options.answers) {
  const path = await contained(project.root, options.answers, { privateFile: true });
  try { answers = JSON.parse(await readFile(path, 'utf8')); } catch { throw invalid('Answers must be a private JSON object using the installer model names.'); }
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) throw invalid('Answers must be a JSON object.');
  project.privateInputs=[options.answers];
 }
 const names = { name: 'displayName', ...project.adapter.input?.names, email: localSettingKeys(project).email };
 const hasOwnerName = Object.hasOwn(seed.model.fields, names.name);
 if (!hasOwnerName && options.ownerName !== undefined) throw invalid('This installer does not declare an owner-name field; --owner-name is unsupported.');
 for (const [flag, name] of [['ownerEmail', names.email], ['ownerName', names.name]]) {
  if (options[flag] !== undefined && answers[name] !== undefined && options[flag] !== answers[name]) throw invalid('A setup flag conflicts with the answers file. Choose one consistent answer before setup.');
  if (options[flag] !== undefined) answers[name] = options[flag];
 }
 const defaults=Object.fromEntries(seed.manifest.fields.filter(field=>field.kind!=='secret'&&field.default!==undefined).map(field=>[field.name,field.default]));
 const adapterDefaults=await project.adapter.input?.defaults?.(project.root) ?? {};
 // Older installations saved runtime bindings only. A runtime select value
 // outside the installer domain is not an answer to that field; retain its
 // private bytes and use the adapter's declared local installer choice.
 const savedAnswers = Object.fromEntries(seed.manifest.fields.filter(field => field.kind !== 'secret' && typeof vars[field.name] === 'string' &&
  !(field.kind === 'select' && Object.hasOwn(adapterDefaults, field.name) && !seed.model.fields[field.name].valid(vars[field.name]))).map(field => [field.name, vars[field.name]]));
 const installerAnswers = await savedSetupAnswers(project, seed.model);
 answers = { ...defaults, ...adapterDefaults, ...(installerAnswers ?? savedAnswers), ...answers };
 const savedEmail = vars[names.email];
 if (!answers[names.email] && savedEmail) answers[names.email] = savedEmail;
 if (hasOwnerName) answers[names.name] ??= seed.model.fields[names.name].default ?? 'Owner';
 const entered=seed.manifest.fields.filter(field=>field.kind==='secret'&&field.input==='entered');
 for(const field of entered)if(!answers[field.name]&&!vars[field.name]&&process.env[field.name])answers[field.name]=process.env[field.name];
 const known={secretReadiness:Object.fromEntries(seed.manifest.fields.filter(field=>field.kind==='secret').map(field=>[field.name,Boolean(vars[field.name])]))};
 if(!options.nonInteractive&&!options.json&&process.stdin.isTTY){
  const asked=new Set();
  for(;;){
   const required=seed.model.setupModel(answers,known).missing;
   const key=required.find(key=>!asked.has(key)&&seed.model.fieldVisible(key,answers));
   if(!key)break;
   asked.add(key);
   const field=seed.model.fieldDefinition(key,answers);
   if(field.kind==='secret'&&field.input!=='entered')continue;
   const choices=field.options?.map(([value])=>value).join(' | ');
   const label=`${field.label??key} (${key})${choices?` [${choices}]`:''}: `;
   answers[key]=await question(label,field.type==='password',signal);
  }
 }
 const invalidKeys=Object.entries(answers).filter(([key,value])=>!seed.model.fields[key]||(value!==''&&value!==undefined&&!seed.model.fields[key].valid(value))).map(([key])=>key);
 const missingKeys=seed.model.setupModel(answers,known).missing;
 const keys=[...new Set([...missingKeys,...invalidKeys])];
 if(keys.length){
  // Only declared metadata and example choices are public, never supplied values.
  const shape={},details=keys.map(key=>{
   const field=Object.hasOwn(seed.model.fields,key)?seed.model.fields[key]:undefined;
   if(!field)return '(undeclared field)';
   const privateValue=field.type==='password',choices=privateValue?undefined:field.options?.map(([value])=>value);
   const type=privateValue?'secret':field.kind??(choices?'select':field.type??'text');
   shape[key]=privateValue?'<private value>':choices?.[0]??'<value>';
   return `${key} (${type}${choices?`; choices: ${choices.map(value=>JSON.stringify(value)).join(' | ')}`:''})`;
  });
  throw missing(`Missing or invalid active setup fields: ${details.join(', ')}. Create an owner-only JSON file (chmod 600 answers.json) shaped ${JSON.stringify(shape)}, then run rer setup --answers answers.json --non-interactive. --owner-email EMAIL and --owner-name NAME are also accepted when declared; use manifest field names inside the JSON, never an environment-file wrapper.`);
 }
 if(!mailbox(answers[names.email]))throw invalid('Provide a valid plain owner mailbox.');
 answers[names.email]=answers[names.email].toLowerCase();
 const {assertLocalOwner}=await shared('local/owner.mjs');
 const owners=await assertLocalOwner(project.root,answers[names.email],message=>refuse(message),project.adapter.hooks?.localOwner,`${names.email} in ${project.adapter.hooks?.secrets?.file??'.dev.vars'}`);
 if(savedEmail&&!mailbox(savedEmail))throw refuse('Saved owner is malformed. Restore private settings or run rer reset --yes.');
 if(savedEmail&&savedEmail.toLowerCase()!==answers[names.email]){
  if(owners.length)throw refuse(`Private setting ${names.email} differs from the retained database owner. Restore ${names.email} in ${project.adapter.hooks?.secrets?.file??'.dev.vars'} to ${answers[names.email]}, then run rer setup --owner-email ${answers[names.email]}; or back up data and run rer reset --yes. Private bytes were kept.`);
  throw refuse(`Owner conflicts with the saved installation (${savedEmail}). Run rer setup --owner-email ${savedEmail}, or back up data and run rer reset --yes.`);
 }

 try{return seed.model.validateInput(answers,known);}catch{throw missing('Installer answers are incomplete. Supply the active manifest fields using rer setup --answers answers.json --non-interactive.');}
}

async function question(label,privateValue,signal){
 let muted=false;
 const output=new Writable({write(chunk,_encoding,done){if(!muted)process.stderr.write(chunk);done();}});
 const prompt=createInterface({input:process.stdin,output,terminal:true});
 prompt.on('SIGINT',()=>process.kill(process.pid,'SIGINT'));
 const closed=new Promise((_,reject)=>prompt.once('close',()=>reject(missing('Terminal input closed before setup answers were complete. Use rer setup --answers answers.json --non-interactive.'))));
 try{const pending=prompt.question(label+'\n',{signal});muted=privateValue;return await Promise.race([pending,closed]);}finally{prompt.close();muted=false;output.end();if(privateValue)process.stderr.write('\n');}
}
