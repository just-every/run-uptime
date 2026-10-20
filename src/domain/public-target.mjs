import {isPublicAddress} from '../base/modules/integrations/core/destination.ts';
// Preserve WHATWG numeric-address normalization for probe URLs; Base owns the
// single conservative public-range policy shared with notification transports.
export function publicAddress(address) {
  if(typeof address!=='string'||address.includes('%'))return false;
  let host;try{host=new URL(address.includes(':')?`http://[${address.replace(/^\[|\]$/g,'')}]/`:`http://${address}/`).hostname.replace(/^\[|\]$/g,'');}catch{return false}
  return isPublicAddress(host);
}
export function publicTarget(value) {
  if(typeof value!=='string'||value.length>2048||/[\s\\]/.test(value))throw Error('Invalid public target');
  let u;try{u=new URL(value)}catch{throw Error('Invalid public target')}
  if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.hash)throw Error('Public target requires HTTP(S) without URL credentials or fragment');
  const host=u.hostname.replace(/^\[|\]$/g,'');
  // localhost and its subdomains are loopback names even when a DNS-only
  // resolver returns NXDOMAIN instead of consulting the local hosts file.
  if(/(^|\.)localhost\.?$/i.test(host))throw Error('Public target address forbidden');
  if(!host||((host.includes(':')||/^[0-9.]+$/.test(host))&&!publicAddress(host)))throw Error('Public target address forbidden');
  if(!host.includes(':')&&!/^[a-z0-9.-]+$/i.test(host))throw Error('Invalid public hostname');
  return u;
}
