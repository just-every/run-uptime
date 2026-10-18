// A small local web app for flow tests: a sign-in form, a session cookie, a dashboard and an order confirmation page, with one
// scenario per path prefix (/s/<scenario>/...). Served on loopback behind the same owner-only grant file the HTTP runner reads.
// The profile-path scenario signs in to /u/<email>/dashboard, the way many sites put the account in the path, and links to three more
// such pages: settings, whose path escapes the address's '@' but keeps its '+', a mailbox whose path holds the address lowercased
// (its accented capital becomes a lowercase letter's encoded bytes), and a full profile whose path is long enough that the
// 300-character cut of a stored URL falls inside the encoded address.
import http from 'node:http';
import {randomUUID} from 'node:crypto';
import {open, rename, rm, mkdir} from 'node:fs/promises';
import {constants} from 'node:fs';
import {dirname} from 'node:path';

export const FIXTURE_EMAIL = 'Émile.secret+person@example.test', FIXTURE_PASSWORD = 'correct-horse-battery-staple';
export const phrase = i => `phrase-${i}-${'x'.repeat(180)}`;
const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head><body>${body}</body></html>`;

export async function startFlowFixture({port = 0, grantPath, secondPort = 0}) {
  const identity = randomUUID(), sessions = new Set(), seen = {secondOrigin: 0, requests: []};
  let accountLinks;
  // A second origin the flow does not declare and the grant does not cover: a hostile page tries to open it.
  const second = http.createServer((req, res) => { seen.secondOrigin++; res.writeHead(200, {'content-type': 'text/html'}); res.end(page('Second origin', '<h1>Second origin reached</h1>')); });
  await new Promise(r => second.listen(secondPort, '127.0.0.1', r));
  const otherPort = second.address().port;
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x'), m = /^\/s\/([a-z0-9-]+)(\/.*)$/.exec(url.pathname);
    seen.requests.push(url.pathname);
    const send = (status, body, headers = {}) => { res.writeHead(status, {'content-type': 'text/html; charset=utf-8', 'x-uptime-fixture': identity, ...headers}); res.end(body); };
    if (!m) return send(404, page('Not found', '<h1>Not found</h1>'));
    const [, scenario, full] = m, path = full.replace(/^(?:\/p+)?\/u\/[^/]+\//, '/'), base = `/s/${scenario}`, signedIn = (req.headers.cookie ?? '').split(/;\s*/).some(c => c.startsWith('sid=') && sessions.has(c.slice(4)));
    if(path==='/browser-checkout')return send(200,page('Checkout',`<meta name="viewport" content="width=device-width, initial-scale=1"><h1>Checkout</h1><style>@media(max-width:600px){#confirmation{display:none}}</style><p id="confirmation">Order confirmed</p><p id="transport-policy">${scenario==='transport-policy'?'<script>document.getElementById("transport-policy").textContent=typeof RTCPeerConnection===\'undefined\'&&typeof WebTransport===\'undefined\'?\'Direct transports disabled\':\'Direct transport available\'</script>':''}</p>`));
    if(path==='/browser-metadata')return send(200,page('Blocked subresource','<h1>Checkout</h1><img alt="" src="http://169.254.169.254/latest/meta-data/"><p>Order confirmed</p>'));
    if (path === '/login' && req.method === 'GET') {
      const missing = scenario === 'missing-element';
      return send(200, page('Sign in', `<h1>Sign in</h1><form method="post" action="${base}/login" novalidate><label>Email <input name="email" type="email"></label><label>Password <input name="password" type="password"></label>${missing ? '' : '<button type="submit">Sign in</button>'}</form>`));
    }
    if (path === '/login' && req.method === 'POST') {
      let body = ''; for await (const c of req) body += c;
      const form = new URLSearchParams(body);
      if (form.get('email') === FIXTURE_EMAIL && form.get('password') === FIXTURE_PASSWORD) { const sid = randomUUID(); sessions.add(sid); return send(302, '', {location: scenario === 'profile-path' ? `${base}/u/${encodeURIComponent(FIXTURE_EMAIL)}/dashboard` : `${base}/dashboard`, 'set-cookie': `sid=${sid}; HttpOnly; Path=/`}); }
      return send(200, page('Sign in', '<h1>Sign in</h1><p role="alert">Wrong email or password</p>'));
    }
    if (!signedIn && !['/redirect-private', '/hostile', '/big', '/phrases', '/tunnel'].includes(path) && !path.startsWith('/bounce/') && !path.startsWith('/long-')) return send(302, '', {location: `${base}/login`});
    if (path === '/dashboard') {
      const extra = scenario === 'metadata-subresource' ? '<img alt="" src="http://169.254.169.254/latest/meta-data/">' : '';
      return send(200, page('Dashboard', `<h1>Welcome back</h1>${extra}<a id="order" href="${base}/confirm">Confirm order</a>${scenario === 'profile-path' ? accountLinks(base) : ''}`));
    }
    const accountPages = {'/settings': 'Account settings', '/mailbox': 'Your mailbox', '/profile': 'Full profile'};
    if (accountPages[path]) return send(200, page('Account', `<h1>${accountPages[path]}</h1>${accountLinks(base)}`));
    if (path === '/confirm') {
      if (scenario === 'confirm-500') return send(500, page('Error', '<h1>Internal error</h1>'));
      if (scenario === 'slow') await new Promise(r => setTimeout(r, 20000));
      return send(200, page('Confirmed', '<h1>Order confirmed</h1><p>Thank you.</p>'));
    }
    // Pages that never stop leading to another page, a very large response, and a page holding many long phrases (the run bounds).
    const bounce = /^\/bounce\/(\d+)$/.exec(path);
    if (bounce) return send(200, page('Bounce', `<h1>Page ${bounce[1]}</h1><script>setTimeout(()=>{location='${base}/bounce/${Number(bounce[1]) + 1}'},150)</script>`));
    if (path === '/big') return send(200, page('Big', '<h1>Big page</h1><p>' + 'x'.repeat(6 * 1024 * 1024) + '</p>'));
    if (path === '/phrases' || path.startsWith('/long-')) return send(200, page('Phrases', Array.from({length: 20}, (_, i) => `<p>${phrase(i)}</p>`).join('')));
    // A page that asks the browser for a TLS tunnel to this fixture's own port: a tunnel can carry no fixture identity.
    if (path === '/tunnel') return send(200, page('Tunnel', `<h1>Tunnel page</h1><img alt="" src="https://127.0.0.1:${req.socket.localPort}/s/${scenario}/pixel">`));
    if (path === '/redirect-private') return send(302, '', {location: 'http://169.254.169.254/latest/meta-data/'});
    if (path === '/redirect-private-network') return send(302, '', {location: 'http://10.255.255.1/'});
    if (path === '/hostile') return send(200, page('Hostile', `<h1>Hostile page</h1><script>window.open('http://127.0.0.1:${otherPort}/');setTimeout(()=>{location='http://127.0.0.1:${otherPort}/'},200)</script>`));
    return send(404, page('Not found', '<h1>Not found</h1>'));
  });
  await new Promise(r => server.listen(port, '127.0.0.1', r));
  const actual = server.address().port;
  // The full profile's padding puts the middle of the encoded address at character 300 of the page's URL.
  const encoded = encodeURIComponent(FIXTURE_EMAIL), start = 300 - Math.floor(encoded.length / 2);
  accountLinks = base => `<a href="${base}/u/${FIXTURE_EMAIL.replace('@', '%40')}/settings">Account settings</a><a href="${base}/u/${encodeURIComponent(FIXTURE_EMAIL.toLowerCase())}/mailbox">Mailbox</a><a href="${base}/${'p'.repeat(start - `http://127.0.0.1:${actual}${base}/`.length - '/u/'.length)}/u/${encoded}/profile">Full profile</a>`;
  // The same grant file the synthetic target writes: owner-only, naming this process and port, with no health paths.
  await mkdir(dirname(grantPath), {recursive: true, mode: 0o700});
  const temporary = `${grantPath}.${process.pid}.tmp`; await rm(temporary, {force: true});
  const file = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
  try { await file.writeFile(JSON.stringify({schemaVersion: 1, custody: 'local-uptime-synthetic', host: '127.0.0.1', port: actual, pid: process.pid, identity, expiresAt: Date.now() + 11 * 3600 * 1000, paths: []})); } finally { await file.close(); }
  await rename(temporary, grantPath);
  return {port: actual, otherPort, identity, seen, origin: `http://127.0.0.1:${actual}`, async close() { for (const s of [server, second]) { s.closeAllConnections?.(); await new Promise(r => s.close(r)); } }};
}
