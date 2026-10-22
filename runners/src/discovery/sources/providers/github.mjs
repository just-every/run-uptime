import {SourceError} from '../errors.mjs';
import {jsonBody} from '../provider-http.mjs';
// GitHub REST, read only, with a fine-grained token for the repository holding Deployments and Actions read: list deployments,
// each deployment's statuses (a successful one names the deployed site in environment_url) and the workflow runs since the last run.
const BASE='https://api.github.com';
const sinceText=since=>since===null?'the first run':new Date(since).toISOString();
export async function listGitHub({identifiers,credential,call,since,now}){
 const {owner,repo}=identifiers,headers={authorization:`Bearer ${credential.token}`,accept:'application/vnd.github+json','x-github-api-version':'2022-11-28'},repoPath=`${BASE}/repos/${owner}/${repo}`;
 const deployments=jsonBody('github',await call({provider:'github',url:`${repoPath}/deployments?per_page=10`,headers}));
 if(!Array.isArray(deployments))throw new SourceError('shape','GitHub answered with a deployment list Uptime cannot read.');
 const sites=[];
 for(const deployment of deployments.slice(0,10)){
  if(!Number.isSafeInteger(deployment?.id)||(since!==null&&!(Date.parse(deployment.created_at)>=since)))continue;
  const statuses=jsonBody('github',await call({provider:'github',url:`${repoPath}/deployments/${deployment.id}/statuses?per_page=10`,headers}));
  const success=Array.isArray(statuses)?statuses.find(status=>status?.state==='success'&&typeof status.environment_url==='string'&&status.environment_url):null;
  if(success)sites.push({url:success.environment_url,identifier:`GitHub deployment ${deployment.id} of ${owner}/${repo} (${String(deployment.environment??'').slice(0,40)})`.slice(0,200),seenAt:now()});
 }
 const runs=jsonBody('github',await call({provider:'github',url:`${repoPath}/actions/runs?per_page=10${since===null?'':`&created=${encodeURIComponent('>='+new Date(since).toISOString())}`}`,headers}));
 const count=Array.isArray(runs?.workflow_runs)?runs.workflow_runs.length:0;
 return {hosts:[],sites,notes:[`GitHub: ${count} workflow run${count===1?'':'s'} and ${sites.length} successful deployment${sites.length===1?'':'s'} since ${sinceText(since)}.`]};
}
