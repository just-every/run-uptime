// Native loopback browser bridge for the emitted Worker and its production
// assets. The Worker receives the browser's original Host, Origin and Referer.
import {createServer} from 'node:http';
import {hostedRuntime} from './hosted-auth-runtime.mjs';

export async function ownerOutboxBrowserRuntime(directory, bindings, outboundService) {
  const requests = [], errors = [];
  let worker;
  const server = createServer(async (request, response) => {
    try {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = Buffer.concat(chunks).toString('utf8');
      const origin = `http://127.0.0.1:${server.address().port}`;
      const pathname = new URL(request.url, origin).pathname;
      requests.push({method: request.method, path: pathname,
        host: request.headers.host, origin: request.headers.origin,
        referer: request.headers.referer});
      const result = await worker.dispatchFetch('http://127.0.0.1:15504/', {
        method: 'POST', redirect: 'manual', headers: {'content-type': 'application/json'},
        body: JSON.stringify({url: origin + request.url, method: request.method,
          headers: {...request.headers, 'cf-connecting-ip': request.socket.remoteAddress},
          ...(['GET', 'HEAD'].includes(request.method) ? {} : {body})}),
      });
      response.statusCode = result.status;
      for (const [name, value] of result.headers) {
        if (!['set-cookie', 'transfer-encoding', 'connection', 'content-length'].includes(name)) response.setHeader(name, value);
      }
      const cookies = result.headers.getSetCookie();
      if (cookies.length) response.setHeader('set-cookie', cookies);
      response.end(Buffer.from(await result.arrayBuffer()));
    } catch (error) {
      errors.push({method: request.method, error: error?.name ?? 'Error'});
      response.writeHead(500).end('Test bridge failed');
    }
  });

  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const origin = `http://127.0.0.1:${server.address().port}`;
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
