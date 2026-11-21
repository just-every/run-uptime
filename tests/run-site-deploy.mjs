import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cloudflare } from '@runeditrun/rer/internal/modules/deploy-kit/provider.mjs';

const siteWorker = '/workers/scripts/synthetic-uptime--site';
const deployments = siteWorker + '/deployments';
const snapshot = { deployments: [{ id: 'synthetic-deployment' }] };

function provider(...statuses) {
  const requests = [];
  const api = cloudflare({
    accountId: 'a'.repeat(32),
    token: 'synthetic-uptime-test',
    fetch: async (url, { method }) => {
      requests.push({ path: new URL(url).pathname, method });
      assert.ok(statuses.length, 'unexpected provider request');
      const status = statuses.shift();
      return status === 200
        ? Response.json({ success: true, result: snapshot })
        : Response.json({
            success: false,
            errors: [{ code: 10500, message: 'Internal authentication error: internal server error' }],
          }, { status });
    },
  });
  return { api, requests };
}

test('site deploy can read ownership after a transient Cloudflare 500', async () => {
  const { api, requests } = provider(500, 200);
  assert.deepEqual(await api.request(deployments), snapshot);
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[0], requests[1]);
});

test('site deploy refuses a deployments read when the provider keeps returning 500', async () => {
  const { api, requests } = provider(500, 500);
  await assert.rejects(api.request(deployments), { message: 'provider-http-500', status: 500 });
  assert.equal(requests.length, 2);
});

test('site deploy never replays an ambiguous Worker upload', async () => {
  const { api, requests } = provider(500);
  await assert.rejects(api.request(siteWorker, { method: 'PUT' }), { message: 'provider-http-500', status: 500 });
  assert.equal(requests.length, 1);
});
