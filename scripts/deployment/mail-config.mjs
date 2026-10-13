import {join} from 'node:path';
import {privateDirectory,writePrivateFile} from '@runeditrun/rer/private-files';
export function mailBindings(env){
 const provider=env.MAIL_PROVIDER??'sendgrid';
 if(!['sendgrid','resend','cloudflare'].includes(provider))throw Error('invalid-mail-provider');
 return provider==='sendgrid'?['SENDGRID_API_KEY']:provider==='resend'?['MAIL_PROVIDER','MAIL_PROVIDER_API_KEY']:['MAIL_PROVIDER','CLOUDFLARE_MAIL_API_KEY','MAIL_ACCOUNT_ID'];
}
export function selectMailDeclaration(declaration,env){
 return {...declaration,secrets:[...declaration.secrets.filter(s=>!['SENDGRID_API_KEY','MAIL_PROVIDER','MAIL_PROVIDER_API_KEY','CLOUDFLARE_MAIL_API_KEY','MAIL_ACCOUNT_ID','UPTIME_HEARTBEAT_URL','UPTIME_START_URL'].includes(s.binding)),...mailBindings(env).map(binding=>({binding,environment:binding})),...(env.UPTIME_HEARTBEAT_URL?[{binding:'UPTIME_HEARTBEAT_URL',environment:'UPTIME_HEARTBEAT_URL'}]:[]),...(env.UPTIME_START_URL?[{binding:'UPTIME_START_URL',environment:'UPTIME_START_URL'}]:[])]}
}
export async function saveOwnerDeclaration(root,declaration,env){
 const directory=await privateDirectory(root,['.rer','deploy']),path=join(directory,'declaration.json');
 await writePrivateFile(path,JSON.stringify(selectMailDeclaration(declaration,env),null,2)+'\n');return '.rer/deploy/declaration.json'
}
