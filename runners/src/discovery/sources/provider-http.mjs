import {publicTarget} from '../../../../src/domain/public-target.mjs';
import {resolvePublic} from '../../public-http.mjs';
import {requestOnce} from '../../public-http-request.mjs';
import {SourceError} from './errors.mjs';
// DISCOVERY-001: every call to a provider account passes through here. Each provider is limited to an explicit allowlist of the
// read-only method and path shapes its documented API uses; anything else is refused before a socket opens. The target is a
// public HTTPS address, resolved and pinned like every other runner request, and redirects are never followed.
const ID=/[A-Za-z0-9._-]{1,100}/.source;
const SHAPES={
 // Cloudflare API v4: Zone details and List DNS Records.
 cloudflare:{host:/^api\.cloudflare\.com$/,rules:[['GET',/^\/client\/v4\/zones\/[a-f0-9]{32}$/],['GET',/^\/client\/v4\/zones\/[a-f0-9]{32}\/dns_records$/]]},
 // Amazon Route 53: GetHostedZone and ListResourceRecordSets.
 route53:{host:/^route53\.amazonaws\.com$/,rules:[['GET',/^\/2013-04-01\/hostedzone\/Z[A-Z0-9]{1,40}$/],['GET',/^\/2013-04-01\/hostedzone\/Z[A-Z0-9]{1,40}\/rrset$/]]},
 // GitHub REST: list deployments, list deployment statuses, list workflow runs for a repository.
 github:{host:/^api\.github\.com$/,rules:[['GET',new RegExp(`^/repos/${ID}/${ID}/deployments$`)],['GET',new RegExp(`^/repos/${ID}/${ID}/deployments/[0-9]{1,20}/statuses$`)],['GET',new RegExp(`^/repos/${ID}/${ID}/actions/runs$`)]]},
 // Vercel REST: list deployments and retrieve project domains.
 vercel:{host:/^api\.vercel\.com$/,rules:[['GET',/^\/v6\/deployments$/],['GET',/^\/v9\/projects\/[A-Za-z0-9_-]{1,100}\/domains$/]]},
 // Netlify API: get site and list site deploys.
 netlify:{host:/^api\.netlify\.com$/,rules:[['GET',/^\/api\/v1\/sites\/[A-Za-z0-9-]{1,100}$/],['GET',/^\/api\/v1\/sites\/[A-Za-z0-9-]{1,100}\/deploys$/]]},
 // AWS CodeDeploy (JSON 1.1 over POST /): ListDeployments and BatchGetDeployments only.
 codedeploy:{host:/^codedeploy\.[a-z]{2}(-[a-z]+)+-[0-9]\.amazonaws\.com$/,rules:[['POST',/^\/$/]],targets:['CodeDeploy_20141006.ListDeployments','CodeDeploy_20141006.BatchGetDeployments']},
};
// Throws SourceError('refused') for anything outside the provider's read-only shapes. Pure: nothing has been sent.
export function assertReadOnly(provider,method,url,headers={}){
 const shape=SHAPES[provider];let target;
 try{target=new URL(url)}catch{throw new SourceError('refused','Refused before sending: not an address.')}
 const allowed=shape&&target.protocol==='https:'&&!target.username&&!target.password&&!target.port&&shape.host.test(target.hostname)&&shape.rules.some(([verb,path])=>verb===method&&path.test(target.pathname));
 if(!allowed)throw new SourceError('refused',`Refused before sending: ${method} ${target.hostname}${target.pathname} is not one of ${provider}'s documented read-only calls.`);
 if(shape.targets&&!shape.targets.includes(headers['x-amz-target']))throw new SourceError('refused',`Refused before sending: that ${provider} operation is not one of its documented read-only calls.`);
}
export const PROVIDER_USER_AGENT='UptimeDiscovery/0.1 (+https://github.com/just-every/run-uptime; read-only provider listing)';
const MAX_BODY=1024*1024;
export async function providerCall({provider,method='GET',url,headers={},body,signal,accept='application/json'}){
 assertReadOnly(provider,method,url,headers);
 const target=publicTarget(url),pin=await resolvePublic(target,signal);
 let response;
 try{response=await requestOnce(target,pin,method,{headers,body},AbortSignal.any([signal,AbortSignal.timeout(15000)]),()=>{},{accept,userAgent:PROVIDER_USER_AGENT,maxBody:MAX_BODY})}
 catch(error){if(signal.aborted)throw error;throw new SourceError('unreachable',`${provider} did not answer the read-only request.`)}
 if(response.redirect||response.truncated)throw new SourceError('unreachable',`${provider} answered in a way that cannot be read (a redirect or a document over 1 MiB).`);
 if(response.status===401||response.status===403)throw new SourceError('denied',`${provider} refused the credential (${response.status}). Check that the runner-local credential can read this source.`);
 if(response.status<200||response.status>=300)throw new SourceError('unreachable',`${provider} answered ${response.status}.`);
 return {status:response.status,body:response.body};
}
export function jsonBody(provider,response){try{return JSON.parse(response.body)}catch{throw new SourceError('shape',`${provider} answered with a document that is not JSON.`)}}
