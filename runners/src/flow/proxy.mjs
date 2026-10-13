// The one door a flow's browser has to the network. Chromium is started with this forward proxy and nothing else: every page,
// redirect, subresource and WebSocket becomes a CONNECT or an absolute-URI request here, so NETWORK-001 is checked once, in one
// place, whatever the page does. The proxy resolves each destination itself and connects to the address it checked (a DNS answer
// cannot change between check and use), refuses private, loopback, link-local and metadata addresses, and reaches the local
// fixture only through the same authorization grant the HTTP runner uses. It counts response bytes and records what it blocked.
import http from 'node:http';
import net from 'node:net';
import {randomBytes, timingSafeEqual} from 'node:crypto';
import {Resolver} from 'node:dns/promises';
import {isIP} from 'node:net';
import {publicAddress} from '../../../src/domain/public-target.mjs';

const hop = new Set(['connection', 'proxy-connection', 'proxy-authorization', 'keep-alive', 'te', 'trailer', 'transfer-encoding', 'upgrade']);
/** What kind of address this is, for the class a refusal is reported under. */
export function addressClass(address) {
  const a = address.toLowerCase();
  if (/^127\./.test(a) || a === '::1' || a === '0.0.0.0' || a === '::') return 'loopback_address';
  if (/^169\.254\./.test(a) || /^fe[89ab][0-9a-f]:/.test(a) || a === 'fd00:ec2::254' || /^::ffff:169\.254\./.test(a)) return 'link_local_or_metadata_address';
  return 'private_address';
}
const split = hostport => {
  const m = /^\[([^\]]+)\](?::(\d{1,5}))?$/.exec(hostport) ?? /^([^:]+)(?::(\d{1,5}))?$/.exec(hostport);
  if (!m) return null;
  return {host: m[1], port: m[2] === undefined ? undefined : Number(m[2])};
};

export async function startFlowProxy({grant = null, maxBytes, maxConnections = 64, resolver = new Resolver({timeout: 1500, tries: 1})}) {
  const username = 'flow', password = randomBytes(24).toString('hex'), expected = Buffer.from(`Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`);
  const sockets = new Set(), blocked = [];
  let bytes = 0, exceeded = false, closed = false;
  const authorised = request => {
    const given = Buffer.from(request.headers['proxy-authorization'] ?? '');
    return given.length === expected.length && timingSafeEqual(given, expected);
  };
  // Browsers make requests of their own (autofill, leak checks, connectivity). Where the grant or DNS simply cannot reach a host, the
  // request is refused and left out of the run's verdict; an attempt on a private, loopback, link-local or metadata address, or on a
  // port that is not the fixture, is the violation a flow must never get away with, so it fails the run.
  const block = (klass, host) => { blocked.push({class: klass, at: Date.now(), violation: klass !== 'not_granted' && klass !== 'unresolved_host'}); if (process.env.UPTIME_FLOW_DEBUG) console.error('flow-proxy blocked', klass, host); return null; };
  // The address to connect to, or null after recording why not. Never resolves for a destination the grant or policy refuses.
  async function destination(host, port) {
    if (grant) {
      if (host === '127.0.0.1' && port === grant.port) return {address: '127.0.0.1', family: 4};
      return block(isIP(host) ? addressClass(host) : 'not_granted', host);
    }
    if (isIP(host)) return publicAddress(host) ? {address: host, family: isIP(host)} : block(addressClass(host));
    let results;
    try { results = await Promise.allSettled([resolver.resolve4(host), resolver.resolve6(host)]); } catch { return block('unresolved_host'); }
    const addresses = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
    if (!addresses.length) return block('unresolved_host');
    const bad = addresses.find(a => !isIP(a) || !publicAddress(a));
    if (bad) return block(isIP(bad) ? addressClass(bad) : 'private_address');
    return {address: addresses[0], family: isIP(addresses[0])};
  }
  const track = socket => { socket.on('error', () => {}); sockets.add(socket); socket.once('close', () => sockets.delete(socket)); socket.setTimeout(30000, () => socket.destroy()); return socket; };
  const count = chunk => { bytes += chunk.length; if (bytes > maxBytes && !exceeded) { exceeded = true; for (const s of sockets) s.destroy(); } };
  const server = http.createServer(async (request, response) => {
    if (closed || !authorised(request)) { response.writeHead(407, {'proxy-authenticate': 'Basic realm="flow"'}); response.end(); return; }
    let url;
    try { url = new URL(request.url); } catch { response.writeHead(400); response.end(); return; }
    if (url.protocol !== 'http:' || sockets.size > maxConnections || exceeded) { response.writeHead(403); response.end(); return; }
    const host = url.hostname.replace(/^\[|\]$/g, ''), port = Number(url.port || 80), target = await destination(host, port);
    if (!target) { response.writeHead(403); response.end(); return; }
    const headers = Object.fromEntries(Object.entries(request.headers).filter(([k]) => !hop.has(k)));
    headers.host = url.host;
    const upstream = http.request({host: target.address, family: target.family, port, method: request.method, path: url.pathname + url.search, headers, agent: false}, reply => {
      // The synthetic fixture proves its identity on every response; anything else on a granted port is not the fixture.
      if (grant && reply.headers['x-uptime-fixture'] !== grant.identity) { block('custody'); response.writeHead(502); response.end(); reply.destroy(); return; }
      response.writeHead(reply.statusCode, Object.fromEntries(Object.entries(reply.headers).filter(([k]) => !hop.has(k))));
      reply.on('data', count); reply.pipe(response);
    });
    track(request.socket);
    upstream.on('socket', track);
    upstream.on('error', () => { if (!response.headersSent) response.writeHead(502); response.end(); });
    request.pipe(upstream);
  });
  server.on('connect', async (request, client, head) => {
    track(client);
    const refuse = status => { client.end(`HTTP/1.1 ${status}\r\nconnection: close\r\n\r\n`); };
    if (closed || !authorised(request)) return refuse('407 Proxy Authentication Required');
    const parsed = split(request.url);
    if (!parsed || !parsed.port || sockets.size > maxConnections || exceeded) return refuse('403 Forbidden');
    const target = await destination(parsed.host, parsed.port);
    if (!target) return refuse('403 Forbidden');
    const upstream = track(net.connect({host: target.address, family: target.family, port: parsed.port}));
    upstream.once('connect', () => { client.write('HTTP/1.1 200 Connection Established\r\n\r\n'); if (head?.length) upstream.write(head); upstream.on('data', count); upstream.pipe(client); client.pipe(upstream); });
    upstream.once('error', () => client.destroy()); client.once('error', () => upstream.destroy());
  });
  server.on('clientError', (_error, socket) => socket.destroy());
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return {
    port: server.address().port, username, password,
    stats: () => ({bytes, exceeded, blocked: [...blocked]}),
    async close() { closed = true; for (const s of sockets) s.destroy(); await new Promise(r => server.close(r)); },
  };
}
