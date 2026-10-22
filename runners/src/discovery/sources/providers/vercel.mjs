import {SourceError} from '../errors.mjs';
import {jsonBody} from '../provider-http.mjs';
// Vercel REST, read only: List Deployments (GET /v6/deployments, production and ready, since the last run) and Retrieve project
// domains (GET /v9/projects/{idOrName}/domains). A new production deployment proposes the project's verified domains.
const BASE='https://api.vercel.com';
export async function listVercel({identifiers,credential,call,since,now}){
 const {projectId}=identifiers,headers={authorization:`Bearer ${credential.token}`};
 const listed=jsonBody('vercel',await call({provider:'vercel',url:`${BASE}/v6/deployments?projectId=${projectId}&target=production&state=READY&limit=10${since===null?'':`&since=${since}`}`,headers}));
 if(!Array.isArray(listed?.deployments))throw new SourceError('shape','Vercel answered with a deployment list Uptime cannot read.');
 const fresh=listed.deployments.filter(item=>typeof item?.uid==='string'&&(since===null||Number(item.created)>=since));
 if(!fresh.length)return {hosts:[],sites:[],notes:['Vercel: no production deployment since the last run.']};
 const domains=jsonBody('vercel',await call({provider:'vercel',url:`${BASE}/v9/projects/${projectId}/domains`,headers}));
 if(!Array.isArray(domains?.domains))throw new SourceError('shape','Vercel answered with a domain list Uptime cannot read.');
 const sites=domains.domains.filter(domain=>typeof domain?.name==='string'&&domain.verified!==false).slice(0,10).map(domain=>({url:`https://${domain.name}/`,identifier:`Vercel deployment ${fresh[0].uid}, project domain ${domain.name}`.slice(0,200),seenAt:now()}));
 return {hosts:[],sites,notes:[`Vercel: ${fresh.length} production deployment${fresh.length===1?'':'s'} since the last run.`]};
}
