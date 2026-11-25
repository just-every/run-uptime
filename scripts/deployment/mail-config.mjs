import {join} from 'node:path';
import {privateDirectory,writePrivateFile} from '@runeditrun/rer/private-files';
export function mailBindings(env){
 const bindings=providerBindings(env);
 return env.MAIL_RECIPIENTS&&bindings.length>1?[...bindings,'MAIL_RECIPIENTS']:bindings
}
function providerBindings(env){
 const provider=env.MAIL_PROVIDER??'none';
 if(provider==='none'){
  const conflicts=['MAIL_API_KEY','SENDGRID_API_KEY','RESEND_API_KEY','MAIL_PROVIDER_API_KEY','CLOUDFLARE_MAIL_API_KEY','MAIL_ACCOUNT_ID','MAIL_RELAY_URL','MAIL_DKIM_PRIVATE_KEY'].filter(name=>env[name]!==undefined&&env[name]!=='');
  if(conflicts.length)throw Error('mail-off-conflicting-credentials: '+conflicts.join(', '));
  return ['MAIL_PROVIDER'];
 }
 if(!['sendgrid','resend','cloudflare','rer'].includes(provider))throw Error('invalid-mail-provider');
 return provider==='rer'?['MAIL_PROVIDER','MAIL_FROM','MAIL_API_KEY','MAIL_RELAY_URL']:provider==='sendgrid'?['MAIL_FROM','SENDGRID_API_KEY',...(env.MAIL_PROVIDER?['MAIL_PROVIDER']:[])]:provider==='resend'?['MAIL_PROVIDER','MAIL_FROM','MAIL_PROVIDER_API_KEY']:['MAIL_PROVIDER','MAIL_FROM','CLOUDFLARE_MAIL_API_KEY','MAIL_ACCOUNT_ID'];
}
// rer checks production sign-in from the shared names MAIL_PROVIDER and MAIL_API_KEY; Uptime keeps each provider's key under
// that provider's own setting, so MAIL_API_KEY fills it when the provider's own name was not given.
export function withProviderKey(env){
 if(!env.MAIL_API_KEY||env.MAIL_PROVIDER==='rer'||env.MAIL_PROVIDER==='none')return env;
 const key=mailBindings(env).find(name=>!['MAIL_PROVIDER','MAIL_FROM','MAIL_RECIPIENTS'].includes(name));
 return env[key]===undefined?{...env,[key]:env.MAIL_API_KEY}:env;
}
export function selectMailDeclaration(declaration,env){
 return {...declaration,secrets:[...declaration.secrets.filter(s=>!['MAIL_FROM','SENDGRID_API_KEY','MAIL_PROVIDER','MAIL_RECIPIENTS','MAIL_API_KEY','MAIL_PROVIDER_API_KEY','CLOUDFLARE_MAIL_API_KEY','MAIL_ACCOUNT_ID','MAIL_RELAY_URL','UPTIME_HEARTBEAT_URL','UPTIME_START_URL'].includes(s.binding)),...mailBindings(env).map(binding=>declaration.secrets.find(item=>item.binding===binding)??{binding,environment:binding}),...(env.UPTIME_HEARTBEAT_URL?[{binding:'UPTIME_HEARTBEAT_URL',environment:'UPTIME_HEARTBEAT_URL'}]:[]),...(env.UPTIME_START_URL?[{binding:'UPTIME_START_URL',environment:'UPTIME_START_URL'}]:[])]}
}
export async function saveOwnerDeclaration(root,declaration,env){
 const directory=await privateDirectory(root,['.rer','deploy']),path=join(directory,'declaration.json');
 await writePrivateFile(path,JSON.stringify(selectMailDeclaration(declaration,env),null,2)+'\n');return '.rer/deploy/declaration.json'
}
