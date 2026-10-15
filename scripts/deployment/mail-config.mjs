import {join} from 'node:path';
import {privateDirectory,writePrivateFile} from '@runeditrun/rer/private-files';
export function mailBindings(env){
 const provider=env.MAIL_PROVIDER??'sendgrid';
 if(!['sendgrid','resend','cloudflare','rer'].includes(provider))throw Error('invalid-mail-provider');
 return provider==='rer'?['MAIL_PROVIDER','MAIL_API_KEY','MAIL_RELAY_URL']:provider==='sendgrid'?['SENDGRID_API_KEY']:provider==='resend'?['MAIL_PROVIDER','MAIL_PROVIDER_API_KEY']:['MAIL_PROVIDER','CLOUDFLARE_MAIL_API_KEY','MAIL_ACCOUNT_ID'];
}
// rer checks production sign-in from the shared names MAIL_PROVIDER and MAIL_API_KEY; Uptime keeps each provider's key under
// that provider's own setting, so MAIL_API_KEY fills it when the provider's own name was not given.
export function withProviderKey(env){
 if(!env.MAIL_API_KEY||env.MAIL_PROVIDER==='rer')return env;
 const key=mailBindings(env).find(name=>name!=='MAIL_PROVIDER');
 return env[key]===undefined?{...env,[key]:env.MAIL_API_KEY}:env;
}
export function selectMailDeclaration(declaration,env){
 return {...declaration,secrets:[...declaration.secrets.filter(s=>!['SENDGRID_API_KEY','MAIL_PROVIDER','MAIL_API_KEY','MAIL_PROVIDER_API_KEY','CLOUDFLARE_MAIL_API_KEY','MAIL_ACCOUNT_ID','MAIL_RELAY_URL','UPTIME_HEARTBEAT_URL','UPTIME_START_URL'].includes(s.binding)),...mailBindings(env).map(binding=>({binding,environment:binding})),...(env.UPTIME_HEARTBEAT_URL?[{binding:'UPTIME_HEARTBEAT_URL',environment:'UPTIME_HEARTBEAT_URL'}]:[]),...(env.UPTIME_START_URL?[{binding:'UPTIME_START_URL',environment:'UPTIME_START_URL'}]:[])]}
}
export async function saveOwnerDeclaration(root,declaration,env){
 const directory=await privateDirectory(root,['.rer','deploy']),path=join(directory,'declaration.json');
 await writePrivateFile(path,JSON.stringify(selectMailDeclaration(declaration,env),null,2)+'\n');return '.rer/deploy/declaration.json'
}
