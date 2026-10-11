// Test-only HTTPS bridge forwards browser-created auth headers unchanged to
// the emitted Worker. Like the trusted Cloudflare edge, it supplies the client
// IP from the connection, never a caller header. Only outbound SendGrid delivery
// is captured by the caller.
import {createServer} from 'node:https';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {hostedRuntime} from './hosted-auth-runtime.mjs';

export async function hostedBrowserRuntime(directory, bindings, outboundService) {
  const key = join(directory, 'key.pem'), cert = join(directory, 'cert.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', key, '-out', cert, '-days', '1', '-subj', '/CN=127.0.0.1'], {stdio: 'ignore'});
  const requests = [], errors = [];
  let worker;
  const server = createServer({key: await readFile(key), cert: await readFile(cert)}, async (request, response) => {
    try {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = Buffer.concat(chunks).toString('utf8');
      const origin = `https://127.0.0.1:${server.address().port}`;
      requests.push({path: new URL(request.url, origin).pathname, method: request.method,
        origin: request.headers.origin, referer: request.headers.referer});
      const result = await worker.dispatchFetch('http://127.0.0.1:15504/', {
        method: 'POST', redirect: 'manual', headers: {'content-type': 'application/json'},
        body: JSON.stringify({url: origin + request.url, method: request.method,
          headers: {...request.headers, 'cf-connecting-ip': request.socket.remoteAddress}, ...(['GET', 'HEAD'].includes(request.method) ? {} : {body})}),
      });
      response.statusCode = result.status;
      for (const [name, value] of result.headers) {
        if (!['set-cookie', 'transfer-encoding', 'connection', 'content-length'].includes(name)) response.setHeader(name, value);
      }
      const cookies = result.headers.getSetCookie();
      if (cookies.length) response.setHeader('set-cookie', cookies);
      response.end(Buffer.from(await result.arrayBuffer()));
    } catch (error) {
      errors.push(error);
      response.writeHead(500).end('Test bridge failed');
    }
  });
  try {
    await new Promise((resolve, reject) => {server.once('error', reject); server.listen(15503, '127.0.0.1', resolve)});
    const origin = `https://127.0.0.1:${server.address().port}`;
    worker = await hostedRuntime(directory, {...bindings, UPTIME_ORIGIN: origin}, outboundService);
    return {origin, worker, requests, errors, async close() {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
      await worker.dispose();
    }};
  } catch (error) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await worker?.dispose();
    throw error;
  }
}
