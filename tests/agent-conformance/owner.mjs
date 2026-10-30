import {cookies, edgeHeaders, freshFactor, nativeHttp} from './http.mjs';

export default async function initializeOwner({request, origin, claim, displayName, returnTo, reviewers}) {
 let stage = 'signed-claim';
 try {
 if (claim?.mode !== 'signed') throw new Error('Native agent owner requires the signed installation claim.');
 const response = await request(new URL(claim.path, origin).href, {
  method: 'POST', redirect: 'manual', headers: {...edgeHeaders, origin, 'content-type': 'application/json'},
  body: JSON.stringify({token: claim.token, displayName, returnTo}),
 });
 if (response.status !== 303) console.error('Native signed owner claim: HTTP ' + response.status + '.');
 if (response.status !== 303) throw new Error('Native signed owner admission failed.');
 const cookie = cookies(response), context = {request, origin, cookie};
 stage = 'second-factor';
 await freshFactor(context);
 stage = 'setup';
 const setup = await nativeHttp(context).send('/setup', {});
 if (setup.status !== 303) throw new Error('Native first-run completion failed.');
 await setup.body?.cancel();
 if (!reviewers) throw new Error('Declare the native member reviewer lifecycle.');
 stage = 'member';
 await reviewers.initialize('member', {cookie});
 // Return the production owner's original final response and its native cookie.
 // Business binding follows this initializer in the verifier.
 return response;
 } catch (error) {
  console.error('Native owner lifecycle failed at ' + stage + '.');
  throw error;
 }
}
