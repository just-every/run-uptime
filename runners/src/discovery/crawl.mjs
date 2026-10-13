import {bareHost} from './domain.mjs';
import {runPrimary} from './primary.mjs';
import {apiDocsStage} from './stages/api-docs.mjs';
import {apiHostStage} from './stages/api-host.mjs';
import {healthStage} from './stages/health.mjs';
import {openapiStage} from './stages/openapi.mjs';
import {pagesStage} from './stages/pages.mjs';
import {statusStage} from './stages/status-page.mjs';
import {subdomainStage} from './stages/subdomains.mjs';
// The recipe, most valuable first so a tight budget loses the least: the pasted URL, an upstream status page, the API
// (from its spec, else from its HTML docs, else the conventional api. host), a health path, linked same-site hosts, then a
// couple of representative pages.
export async function crawl({target,fetcher,notes,scope}){
  const {finalUrl,context}=await runPrimary({target,fetcher,notes,scope});
  if(!context)return {finalUrl,proposals:[]};
  const proposals=[context.proposal],shared={fetcher,scope,notes,context};
  proposals.push(...await statusStage(shared));
  proposals.push(...await openapiStage(shared));
  const hasApi=()=>context.isApi||proposals.some(p=>p.kind==='api');
  if(!hasApi())proposals.push(...await apiDocsStage(shared));
  if(!hasApi())proposals.push(...await apiHostStage(shared));
  proposals.push(...await healthStage(shared));
  const knownHosts=new Set(proposals.map(p=>bareHost(new URL(p.definition.url).hostname)));
  proposals.push(...await subdomainStage({...shared,known:knownHosts}));
  proposals.push(...await pagesStage({...shared,known:new Set(proposals.map(p=>p.definition.url))}));
  return {finalUrl,proposals};
}
