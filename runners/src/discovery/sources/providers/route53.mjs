import {SourceError} from '../errors.mjs';
import {signV4} from '../sigv4.mjs';
import {PROVIDER_USER_AGENT} from '../provider-http.mjs';
// Amazon Route 53, read only and signed with Signature Version 4: GetHostedZone (GET /2013-04-01/hostedzone/{Id}) and
// ListResourceRecordSets (GET /2013-04-01/hostedzone/{Id}/rrset), with an IAM key allowed only those two actions.
const HOST='route53.amazonaws.com';
const decode=value=>value.replace(/\\052/g,'*').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\.$/,'').toLowerCase();
export async function listRoute53({identifiers,credential,call,now}){
 const {zoneId,domain}=identifiers;
 const get=(path,query='')=>call({provider:'route53',url:`https://${HOST}${path}${query?`?${query}`:''}`,accept:'application/xml',headers:signV4({method:'GET',host:HOST,path,query,headers:{'user-agent':PROVIDER_USER_AGENT},region:'us-east-1',service:'route53',credentials:credential})});
 const zone=(await get(`/2013-04-01/hostedzone/${zoneId}`)).body,name=/<HostedZone>[\s\S]*?<Name>([^<]+)<\/Name>/.exec(zone)?.[1];
 if(!name||decode(name)!==domain)throw new SourceError('shape',`That Route 53 zone is not ${domain}.`);
 const sets=(await get(`/2013-04-01/hostedzone/${zoneId}/rrset`,'maxitems=100')).body;
 if(!sets.includes('<ListResourceRecordSetsResponse'))throw new SourceError('shape','Route 53 answered with a record list Uptime cannot read.');
 const hosts=[];
 for(const [,block] of sets.matchAll(/<ResourceRecordSet>([\s\S]*?)<\/ResourceRecordSet>/g)){
  const host=/<Name>([^<]+)<\/Name>/.exec(block)?.[1],type=/<Type>([^<]+)<\/Type>/.exec(block)?.[1];
  if(!host||!['A','AAAA','CNAME'].includes(type))continue;
  const name=decode(host);if(name.startsWith('*')||!(name===domain||name.endsWith(`.${domain}`)))continue;
  hosts.push({host:name,identifier:`Route 53 ${type} record ${name}`.slice(0,200),seenAt:now(),record:{type,values:[...block.matchAll(/<Value>([^<]*)<\/Value>/g)].map(match=>decode(match[1]))}});
 }
 return {hosts,sites:[],notes:[]};
}
