// Reject forbidden numeric destinations before handing a request to an engine.
// Native engines can bypass a proxy for local address classes; the proxy still
// resolves/pins hostnames and rechecks every permitted private connection.
import {isIP} from 'node:net';
import {publicAddress} from '../../../src/domain/public-target.mjs';
import {privateAddress} from '../../../src/domain/private-target.mjs';
import {addressClass} from './proxy.mjs';
export function numericRequestRefusal(url,{network,startUrl}) {
 if(!['http:','https:'].includes(url.protocol))return null;
 const host=url.hostname.replace(/^\[|\]$/g,'');
 if(!isIP(host)||publicAddress(host))return null;
 const start=new URL(startUrl);
 if(network==='synthetic'&&host===start.hostname&&url.port===start.port)return url.protocol==='http:'?null:'custody';
 if(network==='private'&&privateAddress(host))return null;
 return addressClass(host);
}
