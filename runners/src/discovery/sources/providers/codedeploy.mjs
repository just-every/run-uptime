import {SourceError} from '../errors.mjs';
import {signV4} from '../sigv4.mjs';
import {jsonBody,PROVIDER_USER_AGENT} from '../provider-http.mjs';
// AWS CodeDeploy (JSON 1.1, Signature Version 4), read only, with an IAM key allowed only codedeploy:ListDeployments and
// codedeploy:BatchGetDeployments. A deployment names no address, so a successful deployment since the last run proposes the
// site the owner declared for that application and deployment group.
export async function listCodeDeploy({identifiers,credential,call,since,now}){
 const {application,deploymentGroup,region,siteUrl}=identifiers,host=`codedeploy.${region}.amazonaws.com`;
 const request=async(operation,payload)=>{
  const body=JSON.stringify(payload),headers={'content-type':'application/x-amz-json-1.1','content-length':String(Buffer.byteLength(body)),'x-amz-target':`CodeDeploy_20141006.${operation}`,'user-agent':PROVIDER_USER_AGENT};
  return jsonBody('codedeploy',await call({provider:'codedeploy',method:'POST',url:`https://${host}/`,body,headers:signV4({method:'POST',host,path:'/',headers,body,region,service:'codedeploy',credentials:credential})}));
 };
 const listed=await request('ListDeployments',{applicationName:application,deploymentGroupName:deploymentGroup,includeOnlyStatuses:['Succeeded'],...(since===null?{}:{createTimeRange:{start:since/1000}})});
 if(!Array.isArray(listed?.deployments))throw new SourceError('shape','CodeDeploy answered with a deployment list Uptime cannot read.');
 const ids=listed.deployments.filter(id=>typeof id==='string').slice(0,25);
 if(!ids.length)return {hosts:[],sites:[],notes:[`CodeDeploy: no successful deployment of ${application} since the last run.`]};
 const details=await request('BatchGetDeployments',{deploymentIds:ids});
 if(!Array.isArray(details?.deploymentsInfo))throw new SourceError('shape','CodeDeploy answered with deployment details Uptime cannot read.');
 const done=details.deploymentsInfo.filter(item=>item?.status==='Succeeded'&&typeof item.deploymentId==='string');
 return {hosts:[],sites:done.length?[{url:siteUrl,identifier:`CodeDeploy deployment ${done[0].deploymentId} of ${application}/${deploymentGroup}`.slice(0,200),seenAt:now()}]:[],
  notes:[`CodeDeploy: ${done.length} successful deployment${done.length===1?'':'s'} of ${application} since the last run.`]};
}
