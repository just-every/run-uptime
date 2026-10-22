import {SourceError} from '../errors.mjs';
import {jsonBody} from '../provider-http.mjs';
// Netlify API, read only: List site deploys (GET /api/v1/sites/{site_id}/deploys) and Get site (GET /api/v1/sites/{site_id}). A
// production deploy published since the last run proposes the site's address.
const BASE='https://api.netlify.com/api/v1';
export async function listNetlify({identifiers,credential,call,since,now}){
 const {siteId}=identifiers,headers={authorization:`Bearer ${credential.token}`};
 const deploys=jsonBody('netlify',await call({provider:'netlify',url:`${BASE}/sites/${siteId}/deploys?per_page=10`,headers}));
 if(!Array.isArray(deploys))throw new SourceError('shape','Netlify answered with a deploy list Uptime cannot read.');
 const fresh=deploys.filter(item=>item?.state==='ready'&&item.context==='production'&&typeof item.id==='string'&&(since===null||Date.parse(item.published_at??item.created_at)>=since));
 if(!fresh.length)return {hosts:[],sites:[],notes:['Netlify: no production deploy published since the last run.']};
 const site=jsonBody('netlify',await call({provider:'netlify',url:`${BASE}/sites/${siteId}`,headers}));
 const address=typeof site?.custom_domain==='string'&&site.custom_domain?`https://${site.custom_domain}/`:site?.ssl_url;
 if(typeof address!=='string')throw new SourceError('shape','Netlify answered with a site Uptime cannot read.');
 return {hosts:[],sites:[{url:address,identifier:`Netlify deploy ${fresh[0].id}`.slice(0,200),seenAt:now()}],notes:[`Netlify: ${fresh.length} production deploy${fresh.length===1?'':'s'} since the last run.`]};
}
