import assert from 'node:assert/strict';
import {authRequest,sessionCookie,deliveredLink} from './auth-test-support.mjs';
// Public invitation and confirmation, shared by the existing read/import flows.
export async function inviteDoorMember(origin,cookie,role,label,scopes=[]){
 const call=authRequest(origin),email=`synthetic-${label}@example.test`;
 const response=await call('/api/access/invitations',{email,displayName:`Synthetic ${label}`,role,scopes},{cookie});assert.equal(response.status,202);
 const link=await deliveredLink(call,{email,kind:'invite'});
 const memberCookie=sessionCookie(await call('/auth/confirm',{token:link.searchParams.get('token')}));
 const own=await call('/api/access/self',undefined,{cookie:memberCookie});assert.equal(own.status,200);
 const member=await own.json();assert.equal(member.role,role);return {...member,cookie:memberCookie};
}
