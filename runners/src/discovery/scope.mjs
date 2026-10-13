import {bareHost,inDomain,registrableDomain} from './domain.mjs';
// What discovery may contact beyond the owner's own URL: the registrable domain of the input host (and of the page it
// lands on) plus status.* hosts that page links to.
export function createScope(inputHost){
  const domains=new Set([registrableDomain(inputHost)]),statusHosts=new Set();
  return {
    addDomain:host=>{domains.add(registrableDomain(host))},
    addStatusHost:host=>{statusHosts.add(bareHost(host))},
    allows:host=>{host=bareHost(host);return statusHosts.has(host)||[...domains].some(domain=>inDomain(host,domain))},
    get domains(){return [...domains]},
  };
}
