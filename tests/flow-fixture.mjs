// A small local web app for flow tests: a sign-in form, a session cookie, a dashboard and an order confirmation page, with one
// scenario per path prefix (/s/<scenario>/...). Served on loopback behind the same owner-only grant file the HTTP runner reads.
// The profile-path scenario signs in to /u/<email>/dashboard, the way many sites put the account in the path, and links to three more
// such pages: settings, whose path escapes the address's '@' but keeps its '+', a mailbox whose path holds the address lowercased
// (its accented capital becomes a lowercase letter's encoded bytes), and a full profile whose path is long enough that the
// 300-character cut of a stored URL falls inside the encoded address. The shop scenario is PERF-001's controlled site (below), and
// /health, outside the scenarios, is the site's health endpoint.
import http from 'node:http';
import {randomUUID} from 'node:crypto';
import {open, rename, rm, mkdir} from 'node:fs/promises';
import {constants} from 'node:fs';
import {dirname} from 'node:path';

export const FIXTURE_EMAIL = 'Émile.secret+person@example.test', FIXTURE_PASSWORD = randomUUID();
export const FIXTURE_MASK='masked-order-'+randomUUID();
export const phrase = i => `phrase-${i}-${'x'.repeat(180)}`;
const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head><body>${body}</body></html>`;

// A synthetic account and a Stripe test-mode order, created and removed through JSON calls. A denied teardown call is cut at
// the socket, as a network edge refusing it would.
async function sandboxApi(req, res, path, json) {
  const sandbox = sandboxState.get(req.socket.localPort), m = /^\/api\/(accounts|orders)(?:\/([A-Za-z0-9_]+))?$/.exec(path);
  sandbox.calls.push(`${req.method} ${m ? `/api/${m[1]}${m[2] ? '/:id' : ''}` : path}`);
  let body = ''; for await (const c of req) body += c;
  if (!m) return json(404, {});
  const [, kind, id] = m, store = sandbox[kind];
  if (req.method === 'POST' && !id) { const created = `${kind === 'accounts' ? 'acct' : 'ord'}_${randomUUID().replaceAll('-', '')}`; store.add(created); sandbox.created.push(created); return json(201, kind === 'orders' ? {id: created, livemode: false, amount: JSON.parse(body).amount} : {id: created}); }
  if (req.method === 'DELETE' && id) {
    if (sandbox.deny === 'all' || sandbox.deny === kind) return req.socket.destroy();
    return json(store.delete(id) ? 200 : 404, {deleted: true});
  }
  return json(405, {});
}
const sandboxState = new Map();
export async function startFlowFixture({port = 0, grantPath, secondPort = 0}) {
  const identity = randomUUID(), sessions = new Set(), seen = {secondOrigin: 0, requests: []};
  let accountLinks;
  const modes = new Map();
  let beaconSrc = null;
  seen.orders = 0; seen.signups = 0;
  // API-004 sandbox resources a flow's setup creates and its teardown removes; `deny` refuses teardown at the network edge.
  seen.sandbox = {accounts: new Set(), orders: new Set(), created: [], calls: [], deny: null};
  // A second origin the flow does not declare and the grant does not cover: a hostile page tries to open it.
  const second = http.createServer((req, res) => { seen.secondOrigin++; res.writeHead(200, {'content-type': 'text/html'}); res.end(page('Second origin', '<h1>Second origin reached</h1>')); });
  await new Promise(r => second.listen(secondPort, '127.0.0.1', r));
  const otherPort = second.address().port;
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x'), m = /^\/s\/([a-z0-9-]+)(\/.*)$/.exec(url.pathname);
    seen.requests.push(url.pathname);
    const send = (status, body, headers = {}) => { res.writeHead(status, {'content-type': 'text/html; charset=utf-8', 'x-uptime-fixture': identity, ...headers}); res.end(body); };
    if (url.pathname === '/health') return send(200, 'ok', {'content-type': 'text/plain'});
    if (!m) return send(404, page('Not found', '<h1>Not found</h1>'));
    const [, originalScenario, full] = m, scenario = modes.get(originalScenario) ?? originalScenario, path = full.replace(/^(?:\/p+)?\/u\/[^/]+\//, '/'), base = `/s/${originalScenario}`, signedIn = (req.headers.cookie ?? '').split(/;\s*/).some(c => c.startsWith('sid=') && sessions.has(c.slice(4)));
    // PERF-001: a small shop whose checkout loads a script sized for the visitor's screen. On a phone-width screen it is the throttled
    // mobile asset: it arrives after 2.6 s, holds the main thread for 400 ms, renders the order summary (the page's largest text) and
    // throws. The mobile asset also moves the existing checkout content down 360 px, a known layout shift; desktop gets none.
    // On a wider screen the desktop script answers at once. "Place order" holds the main thread for 300 ms on a phone. Once
    // the test gives it a beacon, the page carries it, with data-consent="granted" only for a visitor whose consent cookie is set.
    if (originalScenario === 'shop' && path === '/unavailable') {
      const consent = (req.headers.cookie ?? '').split(/;\s*/).includes('consent=granted');
      return send(500, page('Checkout unavailable', `<meta name="viewport" content="width=device-width, initial-scale=1"><h1>Checkout unavailable</h1>${beaconSrc ? `<script src="${beaconSrc}"${consent ? ' data-consent="granted"' : ''} async></script>` : ''}`));
    }
    if (originalScenario === 'shop' && (path === '/checkout' || path.startsWith('/account/'))) {
      const consent = (req.headers.cookie ?? '').split(/;\s*/).includes('consent=granted');
      const beacon = beaconSrc ? `<script src="${beaconSrc}"${consent ? ' data-consent="granted"' : ''} async></script>` : '';
      return send(200, page('Checkout', `<meta name="viewport" content="width=device-width, initial-scale=1"><h1>Checkout</h1><p id="total">Order total: $42.00</p><div id="summary"></div><button id="place" type="button">Place order</button>${beacon}<script>var mobile=matchMedia('(max-width: 600px)').matches,s=document.createElement('script');s.src='${base}/assets/'+(mobile?'mobile':'desktop')+'.js?v=7&session=synthetic-uptime-1';document.body.append(s);document.getElementById('place').addEventListener('click',function(){var end=Date.now()+(mobile?300:0);while(Date.now()<end){}document.getElementById('total').textContent='Order placed'})</script>`));
    }
    if (originalScenario === 'shop' && ['/assets/mobile.js', '/assets/desktop.js'].includes(path)) {
      const mobile = path === '/assets/mobile.js';
      if (mobile) await new Promise(r => setTimeout(r, 2600));
      return send(200, `(function(){var end=Date.now()+${mobile ? 400 : 0};while(Date.now()<end){}${mobile ? "document.body.style.paddingTop='360px';" : ''}var p=document.createElement('p');p.style.fontSize='22px';p.textContent=${JSON.stringify('Your order: ' + 'one synthetic item, '.repeat(12))};document.getElementById('summary').append(p);${mobile ? "throw new Error('Mobile checkout script failed')" : ''}})();`, {'content-type': 'text/javascript'});
    }
    if (path.startsWith('/api/')) return sandboxApi(req, res, path, (status, value) => send(status, JSON.stringify(value), {'content-type': 'application/json'}));
    if (path === '/signup' && req.method === 'GET') return send(200, page('Create sandbox account', `<h1>Create sandbox account</h1><form method="post" action="${base}/signup" novalidate><label>Email <input name="email" type="email"></label><label>Password <input name="password" type="password"></label><button>Create account</button></form>`));
    if (path === '/signup' && req.method === 'POST') {
      let body = ''; for await (const c of req) body += c;
      const form = new URLSearchParams(body);
      if (form.get('email') !== FIXTURE_EMAIL || form.get('password') !== FIXTURE_PASSWORD) return send(400, page('Invalid signup', '<h1>Account refused</h1>'));
      seen.signups++; const sid = randomUUID(); sessions.add(sid);
      return send(302, '', {location: `${base}/dashboard`, 'set-cookie': `sid=${sid}; HttpOnly; Path=/`});
    }
    if(path==='/browser-checkout')return send(200,page('Checkout',`<meta name="viewport" content="width=device-width, initial-scale=1"><h1>Checkout</h1><style>@media(max-width:600px){#confirmation{display:none}}</style><p id="confirmation">Order confirmed</p><p id="transport-policy">${scenario==='transport-policy'?'<script>document.getElementById("transport-policy").textContent=typeof RTCPeerConnection===\'undefined\'&&typeof WebTransport===\'undefined\'?\'Direct transports disabled\':\'Direct transport available\'</script>':''}</p>`));
    if(path==='/browser-metadata')return send(200,page('Blocked subresource','<h1>Checkout</h1><img alt="" src="http://169.254.169.254/latest/meta-data/"><p>Order confirmed</p>'));
    if (path === '/login' && req.method === 'GET') {
      const missing = scenario === 'missing-element';
      return send(200, page('Sign in', `<h1>Sign in</h1><form method="post" action="${base}/login" novalidate><label>Email <input name="email" type="email"></label><label>Password <input name="password" type="password"></label>${missing ? '' : '<button type="submit">Sign in</button>'}${scenario==='duplicate-controls'?'<button type="submit">Sign in</button>':''}</form>`));
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
      return send(200, page('Dashboard', `<h1>Welcome back</h1>${extra}${['sandbox-checkout','checkout-failure'].includes(scenario) ? `<form method="post" action="${base}/order"><button>Confirm sandbox order</button></form>` : `<a id="order" href="${base}/confirm">Confirm order</a>`}${scenario === 'profile-path' ? accountLinks(base) : ''}`));
    }
    const accountPages = {'/settings': 'Account settings', '/mailbox': 'Your mailbox', '/profile': 'Full profile'};
    if (accountPages[path]) return send(200, page('Account', `<h1>${accountPages[path]}</h1>${accountLinks(base)}`));
    if (path === '/order' && req.method === 'POST') { seen.orders++; return send(302, '', {location: `${base}/confirm`}); }
    if (path === '/confirm') {
      if (scenario === 'missing-outcome') return send(200, page('Pending', '<h1>Order pending</h1>'));
      if (['confirm-500','checkout-failure'].includes(scenario)) return send(500, page('Error', `<h1>Internal error</h1><p>${FIXTURE_MASK}</p><p>${FIXTURE_EMAIL}</p><p>${FIXTURE_PASSWORD}</p><script>console.error(${JSON.stringify('Checkout '+FIXTURE_MASK+' '+FIXTURE_EMAIL+' Authorization: Bearer '+FIXTURE_PASSWORD)})</script>`));
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
  sandboxState.set(actual, seen.sandbox);
  // The full profile's padding puts the middle of the encoded address at character 300 of the page's URL.
  const encoded = encodeURIComponent(FIXTURE_EMAIL), start = 300 - Math.floor(encoded.length / 2);
  accountLinks = base => `<a href="${base}/u/${FIXTURE_EMAIL.replace('@', '%40')}/settings">Account settings</a><a href="${base}/u/${encodeURIComponent(FIXTURE_EMAIL.toLowerCase())}/mailbox">Mailbox</a><a href="${base}/${'p'.repeat(start - `http://127.0.0.1:${actual}${base}/`.length - '/u/'.length)}/u/${encoded}/profile">Full profile</a>`;
  // The same grant file the synthetic target writes: owner-only, naming this process and port; its one HTTP path is the site's /health.
  await mkdir(dirname(grantPath), {recursive: true, mode: 0o700});
  const temporary = `${grantPath}.${process.pid}.tmp`; await rm(temporary, {force: true});
  const file = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
  try { await file.writeFile(JSON.stringify({schemaVersion: 1, custody: 'local-uptime-synthetic', host: '127.0.0.1', port: actual, pid: process.pid, identity, expiresAt: Date.now() + 11 * 3600 * 1000, paths: ['/health']})); } finally { await file.close(); }
  await rename(temporary, grantPath);
  return {port: actual, otherPort, identity, seen, setScenario(name, mode) { modes.set(name, mode); }, setBeacon(src) { beaconSrc = src; }, origin: `http://127.0.0.1:${actual}`, async close() { for (const s of [server, second]) { s.closeAllConnections?.(); await new Promise(r => s.close(r)); } }};
}
