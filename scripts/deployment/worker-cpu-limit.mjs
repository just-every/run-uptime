import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseJsonc } from '@runeditrun/rer/internal/modules/deploy-kit/jsonc.mjs';
import { cloudflare } from '@runeditrun/rer/modules/deploy-kit/provider';
import { RerError } from '@runeditrun/rer/errors';

export async function configuredWorkerLimits(root) {
  const config = parseJsonc(await readFile(join(root, 'wrangler.jsonc'), 'utf8'));
  const cpu_ms = config.limits?.cpu_ms;
  if (!Number.isInteger(cpu_ms) || cpu_ms < 1 || cpu_ms > 300_000) {
    throw new RerError('invalid_worker_cpu_limit', 'wrangler.jsonc limits.cpu_ms must be an integer from 1 to 300000.', 1);
  }
  return { cpu_ms };
}

export async function workersPaid(env, signal) {
  const api = cloudflare({ accountId: env.CLOUDFLARE_ACCOUNT_ID, token: env.CLOUDFLARE_API_TOKEN });
  let settings;
  try { settings = await api.request('/workers/settings', { signal }); }
  catch {
    signal?.throwIfAborted();
    throw new RerError('workers_plan_lookup_failed', 'Cloudflare Workers settings could not be read. Check the account and API token, then retry deployment.', 1);
  }
  if (typeof settings?.free_tier !== 'boolean') {
    throw new RerError('workers_plan_unknown', 'Cloudflare Workers settings did not identify the account plan.', 1);
  }
  return !settings.free_tier;
}

// The pinned deploy kit builds its own multipart upload from the build artifact.
// Add Wrangler's limit to that upload while retaining the kit's ownership and retry handling.
export function workerUploadWithLimits(accountId, worker, limits, fetch = globalThis.fetch) {
  const upload = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${worker}?bindings_inherit=strict`;
  return async (input, init) => {
    if (input === upload && init?.method === 'PUT') {
      const body = init.body;
      const metadata = JSON.parse(await body.get('metadata').text());
      metadata.limits = { ...metadata.limits, ...limits };
      body.set('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    }
    return fetch(input, init);
  };
}
