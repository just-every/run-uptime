import {completeSecondFactor} from '../mfa-auth-support.mjs';
import {edgeHeaders} from './http.mjs';

export default async function proveNative({request, origin, agentId, tool, args, kind}) {
 if (kind !== 'step_up') throw new Error('Unsupported native proof kind.');
 // The proof hook's supplied request already carries the current native owner
 // session. The MFA helper still enrolls/verifies through public native doors.
 await completeSecondFactor(origin, '', (url, init) => {
  const headers = {...edgeHeaders, ...init.headers}; delete headers.cookie;
  return request(url, {...init, headers});
 });
 const {idempotency_key: _key, expected_revision: _revision, ...nativeArgs} = args;
 const response = await request('/agents/native-proof', {
  method: 'POST', headers: edgeHeaders, body: JSON.stringify({agent_id: agentId, tool, arguments: nativeArgs}),
 });
 if (!response.ok) throw new Error('Native step-up proof was refused.');
 const result = await response.json();
 if (typeof result.reference !== 'string' || !result.reference) throw new Error('Native proof reference is absent.');
 return result.reference;
}
