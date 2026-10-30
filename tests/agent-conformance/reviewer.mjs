import {cookies, edgeHeaders, freshFactor, memberSessions, nativeHttp} from './http.mjs';

export default async function initializeMember({request, origin, email, owner, mail, returnTo}) {
 let stage = 'invitation';
 try {
 const ownerHttp = nativeHttp({request, origin, cookie: owner.cookie});
 const invitation = await ownerHttp.send('/api/access/invitations', {
  email, displayName: 'Native conformance member', role: 'responder', scopes: [], returnTo,
 });
 if (invitation.status !== 202) throw new Error('Native member invitation failed: HTTP ' + invitation.status);
 await invitation.body?.cancel();
 stage = 'accepted-mail';
 let link;
 const messages = await mail.read({limit: 20});
 for (const message of messages.toReversed()) {
  for (const candidate of (message.text + '\n' + message.html).match(/https?:\/\/[^\s<>"']+/g) ?? []) {
   const url = new URL(candidate.replaceAll('&amp;', '&'));
   if (url.origin === origin && url.pathname === '/auth/confirm' && url.searchParams.has('token')) { link = url; break; }
  }
  if (link) break;
 }
 if (!link) throw new Error('Accepted native invitation mail did not arrive.');
 stage = 'confirmation';
 const confirmed = await request(new URL('/auth/confirm', origin).href, {
  method: 'POST', redirect: 'manual', headers: {...edgeHeaders, origin, 'content-type': 'application/json'},
  body: JSON.stringify({token: link.searchParams.get('token')}),
 });
 if (![200, 303].includes(confirmed.status)) throw new Error('Native member invitation confirmation failed.');
 stage = 'session';
 const cookie = cookies(confirmed), context = {request, origin, cookie};
 stage = 'second-factor';
 await freshFactor(context);
 stage = 'native-self';
 const self = await nativeHttp(context).json('/api/access/self');
 memberSessions.set(origin, {cookie, id: self.id});
 return confirmed;
 } catch (error) {
  console.error('Native reviewer lifecycle failed at ' + stage + '.');
  throw error;
 }
}
