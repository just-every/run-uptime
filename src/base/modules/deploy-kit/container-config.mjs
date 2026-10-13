import { isIP } from 'node:net';

export function ingressBindings(value = {}) {
 if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['address', 'httpPort', 'httpsPort'].includes(key))) throw Error('Invalid container ingress bindings');
 const result = { address: '0.0.0.0', httpPort: 80, httpsPort: 443, ...value };
 if (isIP(result.address) !== 4 || ![result.httpPort, result.httpsPort].every(port => Number.isInteger(port) && port >= 1 && port <= 65535) || result.httpPort === result.httpsPort) throw Error('Invalid container ingress bindings');
 return result;
}
