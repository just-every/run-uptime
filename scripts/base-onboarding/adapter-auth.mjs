import { createHmac } from 'node:crypto';
import {commandFailure,installationFailure} from './failures.mjs';
import { labels } from './adapter-labels.mjs';
const outboxPath = '/__dev/outbox'; // modules/mail/src/development default path

// The CLI's own requests to its loopback server prove they come from the
// installation's owner-side tooling (modules/operator-auth/local-cli.mjs), so
// setup and dev restarts do not spend the owner's sign-in rate limit. A server
// that is not in local mode ignores the header. The proof comes from the
// setting the seed's adapter declares as its session secret (sessionSecretKey,
// default SESSION_SECRET).
const localCliProof = secret => createHmac('sha256', secret).update('local-cli\0sign-in').digest('hex');
const post = (context, path, body) => {
 const secret = context.vars[context.sessionSecretKey ?? 'SESSION_SECRET'];
 return fetch(new URL(path, context.origin), {
  method: 'POST', redirect: 'manual', signal: context.signal,
  headers: { Origin: context.origin, 'Content-Type': 'application/json', ...(typeof secret === 'string' && secret ? { 'x-rer-local-cli': localCliProof(secret) } : {}) }, body: JSON.stringify(body),
 });
};
const errorCode = async response => { try { const code = (await response.json())?.error; return typeof code === 'string' && /^[a-z_]{1,64}$/.test(code) ? code : 'no code'; } catch { return 'no code'; } };

// Claim the first owner through Base operator-auth POST /auth/bootstrap with
// the private setup token, or run the seed's own documented bootstrap. An
// already claimed installation keeps its owner.
export async function owner(context, hook) {
 const { store } = context;
 await store.step(labels.owner);
 const { path = '/auth/bootstrap', tokenKey = context.ownerClaim?.tokenField ?? 'SETUP_TOKEN', displayName = input => input.displayName || input.name || 'Owner', returnTo = '/' } = hook;
 const token = context.vars[tokenKey];
 if (!token && hook.existingOwnerViaSignIn) { await store.step('Checking the existing owner through ordinary sign-in'); return; }
 if (!token) {
  throw authFailure(context,labels.owner,`${tokenKey} is missing from the private settings.`);
 }
 let response;
 try { response = await post(context, path, { token, displayName: displayName(context.input), returnTo }); } catch (error) {
  if (context.signal?.aborted) throw error;
  throw authFailure(context,labels.owner,'the application did not answer.');
 }
 if (response.status === 303) { await response.body?.cancel(); context.ownerClaimed = 'claimed'; await store.step('First owner claimed'); return; }
 const code = await errorCode(response);
 if (response.status === 409 && code === 'already_initialized') { context.ownerClaimed = 'kept'; await store.step('An owner is already claimed; the existing owner was kept'); return; }
 throw authFailure(context,labels.owner,`HTTP ${response.status} (${code}).`);
}

// Request a sign-in link for the owner, then find it in the Base development
// outbox. The installer finishes on that captured message, so a local trial
// needs no mail provider and no email is sent.
export async function signIn(context, hook) {
 const { store } = context;
 await store.step(labels.signIn);
 if (typeof hook === 'function') { context.appUrl = await hook(context); return; }
 const { magicLink = '/auth/magic-link', outbox = outboxPath, email = input => context.ownerClaim ? (context.vars[context.ownerClaim.emailField] ?? input[context.ownerClaim.emailField]) : input.email ?? input.ownerEmail, emailKey, returnTo = '/', attempts = 50 } = hook;
 const address = context.signInEmail ?? (emailKey ? context.vars[emailKey] : email(context.input));
 if (typeof address !== 'string' || !address.includes('@')) { throw authFailure(context,labels.signIn,'no owner email.'); }
 const before = new Set(await outboxMessages(context, outbox, address, true));
 let response;
 try { response = await post(context, magicLink, { email: address, returnTo }); } catch (error) {
  if (context.signal?.aborted) throw error;
  throw authFailure(context,labels.signIn,'the application did not answer.');
 }
 if (response.status !== 202) { throw authFailure(context,labels.signIn,`HTTP ${response.status} (${await errorCode(response)}).`); }
 await response.body?.cancel();
 for (let attempt = 0; attempt < attempts; attempt++) {
  const id = (await outboxMessages(context, outbox, address)).find(message => !before.has(message));
  if (id) { context.appUrl = new URL(`${outbox}?message=${encodeURIComponent(id)}`, context.origin).href; await store.step('Your sign-in link is waiting in the development outbox'); return; }
  await new Promise(resolve => setTimeout(resolve, 200));
 }
 throw authFailure(context,labels.signIn,'no message reached the development outbox. Check that the retained database owner matches the private owner settings; preserve data or run rer reset --yes.');
}

async function outboxMessages(context, path, address, required = false) {
 let response;
 // A dev-identity seed gates its outbox with the checkout's key; present it.
 try { response = await fetch(new URL(path, context.origin), { signal: context.signal, headers: context.devKey ? { 'x-rer-dev-key': context.devKey } : {} }); } catch (error) {
  if (context.signal?.aborted) throw error;
  if(required){context.store.report?.('Local development outbox is unavailable. Run rer setup before requesting sign-in.');throw context.fail('setup');}
  return [];
 }
 if (!response.ok) { await response.body?.cancel();if(required){context.store.report?.('Local development outbox is unavailable. Run rer setup before requesting sign-in.');throw context.fail('setup');}return []; }
 const html = await response.text(), wanted = `To: ${address.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))}</p>`;
 return html.split('<article>').slice(1).filter(article => article.toLowerCase().includes(wanted.toLowerCase())).map(article => /\?message=([^"&]+)"/.exec(article)?.[1]).filter(Boolean).map(decodeURIComponent);
}

function authFailure(context,label,reason){const message=context.store.redact?.(`${label}: ${reason}`)??`${label}: ${reason}`;context.store.report?.(message);return installationFailure('command_failed',{step:'setup',diagnostic:commandFailure(message)});}
