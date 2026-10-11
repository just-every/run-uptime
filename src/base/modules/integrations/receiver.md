# Receiving signed webhooks

Authenticate the original request bytes before parsing. Fetch's `Request.text()`
replaces malformed UTF-8 with U+FFFD and strips a leading UTF-8 BOM. Either can
erase a byte change before HMAC verification. `verifyWebhook` accepts a raw
`Uint8Array`, rejects malformed UTF-8, and preserves a BOM as signed content.
Valid Unicode, including a literal U+FFFD, is retained without normalization.
The string input is for caller-owned canonical text only; it cannot recover or
authenticate original HTTP bytes after a lossy decode.

In a Fetch or Worker route, use this receiving function. Supply the migrated
repository, random signing key and destination version from server configuration;
the repository namespace is the expected tenant. Apply the application's request
size limit before buffering. Do not use text/JSON middleware on this route.

```ts
import { verifyWebhook } from './modules/integrations/index.ts';
import type { IntegrationsRepository } from './modules/integrations/index.ts';

export async function receiveWebhook(
  request: Request, repository: IntegrationsRepository,
  key: Uint8Array, destinationId: string,
): Promise<Response> {
  if (request.method !== 'POST') return new Response(null, { status: 405 });
  const body = new Uint8Array(await request.arrayBuffer());
  const verified = await verifyWebhook({
    body, headers: request.headers, key,
    tenant: repository.namespace, destinationId,
  });
  await repository.acceptReplay(verified);
  return new Response(null, { status: 204 });
}
```

Let the application's error handler reject invalid signatures, stale timestamps,
audience mismatches, conflicting ID reuse, and database failures; do not turn
them into a success response. A 204 acknowledges the durable inbox, including
an identical duplicate. It does not claim the business effect has completed.
Process the inbox with an application processed marker and business mutation
in the same transaction. Only parse the verified/stored `envelope.body`, after
verification; never process a separately decoded request body. Keep replay rows
while an ID may recur. External effects still require their own idempotency and
uncertainty policy.

With Node's `IncomingMessage`, accumulate raw byte chunks without calling
`request.setEncoding()` or `Buffer.toString('utf8')`:

```ts
const chunks: Uint8Array[] = [];
for await (const chunk of request) {
  if (!(chunk instanceof Uint8Array)) throw new Error('Webhook request was decoded before verification');
  chunks.push(chunk);
}
const body = Buffer.concat(chunks);
// Pass body and the request headers to verifyWebhook, then commit acceptReplay.
```

The consumer still owns request size/time limits, configured key custody and
native effect processing. Neither the verifier nor this boundary changes the
v1 canonical HMAC format, default five-minute freshness window, audience binding
or permanent replay identity.
