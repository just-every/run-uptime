import {join} from 'node:path';
import {ownedDirectory,readOwned} from '../../auth/files.mjs';
import {validReference} from '../../../../src/domain/credential-binding.mjs';
import {CREDENTIAL_BINDING} from '../../../../src/domain/discovery-sources.mjs';
import {SourceError} from './errors.mjs';
// DISCOVERY-001: a provider account's read-only credential lives only in an owner-only file on this runner, provider-<reference>.json
// in UPTIME_CREDENTIAL_DIR beside the runner's request credentials. The file names its provider and the zone, repository, project,
// site or application it is for, and is used only for a source with exactly those identifiers, so the control plane cannot point
// it at anything else. It is read when a run needs it, held in memory for that run, and never sent to the Worker, stored or logged.
const SECRETS={cloudflare:['token'],github:['token'],vercel:['token'],netlify:['token'],route53:['accessKeyId','secretAccessKey'],codedeploy:['accessKeyId','secretAccessKey']};
const OPTIONAL={route53:['sessionToken'],codedeploy:['sessionToken']};
export const credentialFileName=reference=>`provider-${reference}.json`;
export async function readProviderCredential(provider,identifiers,directory=process.env.UPTIME_CREDENTIAL_DIR){
 const reference=identifiers.credentialRef,binding=CREDENTIAL_BINDING[provider]??[],secrets=[...(SECRETS[provider]??[]),...(OPTIONAL[provider]??[])];
 const fileName=validReference(reference)?credentialFileName(reference):'provider-<reference>.json';
 const missing=new SourceError('credential',`No usable ${provider} credential on this runner: put an owner-only ${fileName} naming "${provider}" and this source's ${binding.join(' and ')} in its credential folder.`);
 if(!SECRETS[provider]||!validReference(reference)||!directory)throw missing;
 let file;
 try{
  const root=await ownedDirectory(directory),read=await readOwned(join(root,credentialFileName(reference)),8192);file=read.file;
  const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(read.bytes));
  if(!value||typeof value!=='object'||Array.isArray(value)||value.provider!==provider||Object.keys(value).some(key=>!['provider',...binding,...secrets].includes(key)))throw Error('shape');
  if(binding.some(field=>value[field]!==identifiers[field]))throw new SourceError('credential',`${fileName} on this runner is for a different ${binding.join(' or ')}, so it was not used.`);
  const present=secrets.filter(key=>key in value);
  if(SECRETS[provider].some(key=>!present.includes(key))||present.some(key=>typeof value[key]!=='string'||!value[key]||value[key].length>2048||/[\x00-\x20\x7f]/.test(value[key])))throw Error('shape');
  return Object.fromEntries(present.map(key=>[key,value[key]]));
 }catch(error){
  if(error instanceof SourceError)throw error;
  throw missing;
 }finally{await file?.close()}
}
