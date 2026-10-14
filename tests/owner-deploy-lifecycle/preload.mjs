// Test-only network edge for the real rer deploy command. The edition build
// drops NODE_OPTIONS; only the command's Cloudflare and served-health requests
// cross this authenticated loopback bridge.
const bridge = process.env.UPTIME_OWNER_TEST_BRIDGE;
const key = process.env.UPTIME_OWNER_TEST_KEY;
if (!bridge || !key || new URL(bridge).hostname !== '127.0.0.1') throw Error('missing-test-transport');

const actualFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const request = new Request(input, init);
  const url = new URL(request.url);
  if (url.origin !== 'https://api.cloudflare.com' && url.origin !== 'https://uptime-monitor-production.fixture-account.workers.dev' && url.origin !== 'https://' + 'a'.repeat(32) + '.r2.cloudflarestorage.com') {
    throw Error('external-network-forbidden');
  }
  const response = await actualFetch(bridge, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-test-key': key },
    body: JSON.stringify({ url: request.url, method: request.method, headers: Object.fromEntries(request.headers), body: Buffer.from(await request.arrayBuffer()).toString('base64') }),
    signal: request.signal,
  });
  if (!response.ok) throw Error('test-provider-bridge-failed');
  const result = await response.json();
  return new Response(Buffer.from(result.body, 'base64'), { status: result.status, headers: result.headers });
};
