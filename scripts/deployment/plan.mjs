import {validatePlan,resourceName} from '@runeditrun/rer/internal/modules/deploy-kit/validation.mjs';
export function deploymentPlan(artifact,env){
 const worker=env.UPTIME_WORKER_NAME;
 if(!resourceName(worker))throw Error('UPTIME_WORKER_NAME must be a valid Cloudflare Worker name');
 const origin=new URL(env.UPTIME_ORIGIN);
 if(origin.origin!==env.UPTIME_ORIGIN||origin.protocol!=='https:')throw Error('UPTIME_ORIGIN must be an exact HTTPS origin');
 if(artifact.migrations.some(m=>m.binding!=='DB'))throw Error('Unexpected migration binding');
 return validatePlan({version:1,worker,compatibilityDate:'2026-09-08',compatibilityFlags:['nodejs_compat'],d1:[{binding:'DB',name:`${worker}-db`,migrations:artifact.migrations.map(({binding,...m})=>m)}],r2:[],queues:[],durableObjects:[],crons:['* * * * *'],vars:{UPTIME_ORIGIN:origin.origin},secrets:['SESSION_SECRET','SETUP_TOKEN','OWNER_EMAIL','MAIL_FROM','UPTIME_RUNNER_KEY',...(env.MAIL_PROVIDER==='resend'?['MAIL_PROVIDER','MAIL_PROVIDER_API_KEY']:env.MAIL_PROVIDER==='cloudflare'?['MAIL_PROVIDER','CLOUDFLARE_MAIL_API_KEY','MAIL_ACCOUNT_ID']:['SENDGRID_API_KEY']),...(env.UPTIME_HEARTBEAT_URL?['UPTIME_HEARTBEAT_URL']:[]),...(env.UPTIME_START_URL?['UPTIME_START_URL']:[])].map(binding=>({binding,environment:binding}))});
}
