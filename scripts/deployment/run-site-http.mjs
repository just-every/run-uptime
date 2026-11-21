import { setTimeout as delay } from 'node:timers/promises';

const deployments = /^\/client\/v4\/accounts\/[a-fA-F0-9]{32}\/workers\/scripts\/[a-z0-9-]+--site\/deployments$/;

export function retrySiteDeploymentRead(fetch) {
  return async (input, init) => {
    const response = await fetch(input, init);
    if (response.status !== 500) return response;

    const request = input instanceof Request ? input : undefined;
    if ((init?.method ?? request?.method ?? 'GET').toUpperCase() !== 'GET') return response;
    const url = new URL(request?.url ?? input);
    if (url.origin !== 'https://api.cloudflare.com' || !deployments.test(url.pathname)) return response;

    // Cloudflare can return an internal error while reading existing site
    // deployments. Reuse the caller's deadline and replay only this read.
    const signal = init?.signal ?? request?.signal;
    try {
      await delay(250, undefined, { signal });
    } catch (error) {
      if (!signal?.aborted) throw error;
      return response;
    }
    await response.body?.cancel().catch(() => {});
    return fetch(input, init);
  };
}

// The Run site workflow preloads this module. Leave pnpm and other Node
// processes inheriting NODE_OPTIONS alone.
if (process.argv[2] === 'deploy' && process.argv.includes('--site', 3)) {
  globalThis.fetch = retrySiteDeploymentRead(globalThis.fetch);
}
