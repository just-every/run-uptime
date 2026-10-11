import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { providerFixture } from './provider-fixture.mjs';

// Keeps the canonical SQLite-backed provider alive across real CLI processes.
// Only loopback RPC is used: neither the bridge nor preload contacts a provider.
export async function providerBridge(t) {
  const fixture = providerFixture();
  const key = randomBytes(32).toString('hex');
  const uploads = [], failures = [];
  let healthRequests = 0, interruptMigration = false, interruptedMigration = false;
  const server = createServer(async (request, response) => {
    try {
      assert.ok(request.headers['x-test-key'] === key, 'authenticated test bridge request');
      assert.equal(request.method, 'POST');
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const input = JSON.parse(Buffer.concat(chunks).toString());
      const target = new URL(input.url);
      assert.ok(['https://api.cloudflare.com', 'https://uptime-monitor-production.fixture-account.workers.dev'].includes(target.origin));
      if (target.origin === 'https://uptime-monitor-production.fixture-account.workers.dev') healthRequests++;
      const headers = input.headers;
      const bytes = Buffer.from(input.body, 'base64');
      let body = bytes.length ? bytes.toString() : undefined;
      if (headers['content-type']?.startsWith('multipart/form-data')) {
        body = await new Response(bytes, { headers }).formData();
      }
      // The original fixture uses plain header objects with this casing.
      if (headers.authorization) { headers.Authorization = headers.authorization; delete headers.authorization; }
      if (target.pathname === '/client/v4/accounts/' + fixture.accountId + '/workers/scripts/uptime-monitor-production' && input.method === 'PUT') {
        uploads.push({ method: input.method });
      }
      let result;
      // Fail before a second migration is claimed, after the first migration's
      // applied ledger row and D1 ownership receipt have both been persisted.
      const sql = typeof body === 'string' && target.pathname.endsWith('/query') ? JSON.parse(body).sql : '';
      if (interruptMigration && /^INSERT INTO _rer_deploy_migrations/.test(sql)
          && fixture.state.databases[0].db.prepare("SELECT COUNT(*) AS n FROM _rer_deploy_migrations WHERE state='applied'").get().n === 1) {
        interruptMigration = false; interruptedMigration = true;
        result = Response.json({ success: false, errors: [{ code: 10000, message: 'test interruption before migration claim' }] }, { status: 500 });
      } else result = await fixture.fetch(input.url, { method: input.method, headers, body });
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ status: result.status, headers: Object.fromEntries(result.headers), body: Buffer.from(await result.arrayBuffer()).toString('base64') }));
    } catch (error) {
      failures.push(error);
      response.statusCode = 500; response.end('test-provider-error');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    fixture.close();
    assert.deepEqual(failures, [], 'test provider must handle every real controller request');
  });
  return { ...fixture, uploads, get healthRequests() { return healthRequests; },
    interruptBeforeSecondMigration() { interruptMigration = true; },
    get interruptedMigration() { return interruptedMigration; },
    env: { UPTIME_OWNER_TEST_BRIDGE: `http://127.0.0.1:${server.address().port}`, UPTIME_OWNER_TEST_KEY: key },
  };
}
