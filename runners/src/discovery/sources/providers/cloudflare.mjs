import {SourceError} from '../errors.mjs';
import {jsonBody} from '../provider-http.mjs';
// Cloudflare API v4, read only: Zone details (GET /zones/{zone_id}) and List DNS Records (GET /zones/{zone_id}/dns_records), with
// an API token holding Zone Read and DNS Read for that zone. Each A, AAAA or CNAME record under the zone names a host.
const BASE='https://api.cloudflare.com/client/v4';
export async function listCloudflare({identifiers,credential,call,now}){
 const headers={authorization:`Bearer ${credential.token}`},{zoneId,domain}=identifiers;
 const zone=jsonBody('cloudflare',await call({provider:'cloudflare',url:`${BASE}/zones/${zoneId}`,headers}));
 if(zone?.success!==true||String(zone.result?.name).toLowerCase()!==domain)throw new SourceError('shape',`That Cloudflare zone is not ${domain}.`);
 const records=jsonBody('cloudflare',await call({provider:'cloudflare',url:`${BASE}/zones/${zoneId}/dns_records?per_page=100`,headers}));
 if(records?.success!==true||!Array.isArray(records.result))throw new SourceError('shape','Cloudflare answered with a record list Uptime cannot read.');
 const hosts=records.result.filter(record=>['A','AAAA','CNAME'].includes(record?.type)&&typeof record.name==='string'&&typeof record.content==='string'&&!record.name.startsWith('*')&&(record.name===domain||record.name.endsWith(`.${domain}`)))
  .map(record=>({host:record.name.toLowerCase(),identifier:`Cloudflare ${record.type} record ${record.name}`.slice(0,200),seenAt:now(),record:{type:record.type,values:[record.content]}}));
 return {hosts,sites:[],notes:[]};
}
